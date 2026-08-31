-- new function
-- P1194: Private, registration-gated event details.
--
-- Filename says p1193: this spec was renumbered to P1194 after a concurrent
-- session claimed 1193, and by then the migration had already been recorded in
-- the test ledger under this name. Renaming it now would read as a different
-- migration to migrate.sh's ledger check. The number in the filename is dead
-- weight; the P1194 references in the body are the live ones.
--
-- WHY A SIDE TABLE AND NOT A COLUMN ON events:
-- public.events is `SELECT USING (true)` and every read in events-service-real
-- runs `select('*', ...)`. Protecting a column on that table would need a
-- column-level REVOKE, and a REVOKE makes `SELECT *` fail outright for anon --
-- taking the whole events page down. A separate table with its own RLS keeps
-- every existing query untouched.
--
-- The gate is the database, not the UI. EventDetail's existing `locationGated`
-- is a render branch over a value that still ships to the browser; this table
-- returns zero rows to anyone who is not the host or an RSVP'd attendee.

CREATE TABLE IF NOT EXISTS public.event_private_info (
  event_id UUID PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  group_chat_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.event_private_info IS
  'P1194: event details visible only to the host and registered attendees. Never expose via a join onto a publicly-readable events query.';

ALTER TABLE public.event_private_info ENABLE ROW LEVEL SECURITY;

-- Read: host or someone holding an RSVP for this event.
CREATE POLICY "Private info visible to host and registered attendees"
  ON public.event_private_info FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_private_info.event_id
        AND e.host_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.event_rsvps r
      WHERE r.event_id = event_private_info.event_id
        AND r.profile_id = (SELECT auth.uid())
    )
  );

-- Write: host only. Split per-command so the host check is stated on both the
-- USING (which rows are visible to the command) and the WITH CHECK (what the
-- row may become) -- an UPDATE policy without WITH CHECK would let a host
-- repoint a row at an event they do not own.
CREATE POLICY "Hosts can create private info for their events"
  ON public.event_private_info FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_private_info.event_id
        AND e.host_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Hosts can update private info for their events"
  ON public.event_private_info FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_private_info.event_id
        AND e.host_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_private_info.event_id
        AND e.host_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Hosts can delete private info for their events"
  ON public.event_private_info FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_private_info.event_id
        AND e.host_id = (SELECT auth.uid())
    )
  );

-- The RSVP lookup in the SELECT policy runs per row read. event_rsvps already has
-- single-column indexes on profile_id and event_id (20260118_create_events.sql); this
-- composite is a deliberate third index serving the policy's exact (profile_id, event_id)
-- predicate as an index-only scan. The cost is a little extra write work per RSVP, paid
-- to keep a per-row-read policy cheap.
CREATE INDEX IF NOT EXISTS idx_event_rsvps_profile_event
  ON public.event_rsvps(profile_id, event_id);

-- ============================================
-- PUBLIC EXISTENCE FLAG
-- ============================================
-- The locked state on the event page says "register to join the group chat".
-- Shown unconditionally, it would promise a group chat to visitors of events
-- that have none. Whether a group chat EXISTS is not the secret -- the invite
-- URL is -- so a public boolean on events carries the fact without the value.
--
-- Maintained by trigger rather than by the client: the client write path is
-- two statements (private row, then flag) and any failure between them leaves
-- the flag lying. A trigger makes the two atomic.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS has_group_chat BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.events.has_group_chat IS
  'P1194: TRUE when event_private_info holds a group chat URL for this event. Publicly readable on purpose — the existence is public, the URL is not. Maintained by trigger; never written by a client.';

CREATE OR REPLACE FUNCTION public.sync_event_has_group_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Both sides of the change, not COALESCE(NEW, OLD). An UPDATE that moves the row
  -- from one event to another (a host owning two events can do this — the UPDATE
  -- policy checks ownership of both, not that event_id is unchanged) would otherwise
  -- leave the VACATED event's flag stuck TRUE, promising a group chat no longer there.
  --
  -- Built by TG_OP rather than by reading NEW and OLD unconditionally: in PL/pgSQL,
  -- NEW is unassigned during DELETE and OLD during INSERT, and touching the wrong one
  -- raises "record is not assigned yet" at runtime.
  target_events UUID[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    target_events := ARRAY[NEW.event_id];
  ELSIF TG_OP = 'DELETE' THEN
    target_events := ARRAY[OLD.event_id];
  ELSE
    target_events := ARRAY[NEW.event_id, OLD.event_id];
  END IF;

  UPDATE public.events e
  SET has_group_chat = EXISTS (
    SELECT 1 FROM public.event_private_info p
    WHERE p.event_id = e.id
      AND p.group_chat_url IS NOT NULL
      AND length(btrim(p.group_chat_url)) > 0
  )
  WHERE e.id = ANY(target_events);

  RETURN NULL; -- AFTER trigger
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_event_has_group_chat ON public.event_private_info;
CREATE TRIGGER trg_sync_event_has_group_chat
  AFTER INSERT OR UPDATE OR DELETE ON public.event_private_info
  FOR EACH ROW EXECUTE FUNCTION public.sync_event_has_group_chat();

-- Backfill for any rows created before the trigger existed (none expected on a
-- fresh install; harmless and makes re-running against a partially-migrated DB safe).
-- WHERE clause is load-bearing: without it this rewrites every row of a live table
-- for zero change, since ADD COLUMN ... DEFAULT FALSE already set them all.
UPDATE public.events e
SET has_group_chat = EXISTS (
  SELECT 1 FROM public.event_private_info p
  WHERE p.event_id = e.id
    AND p.group_chat_url IS NOT NULL
    AND length(btrim(p.group_chat_url)) > 0
)
WHERE e.has_group_chat IS DISTINCT FROM EXISTS (
  SELECT 1 FROM public.event_private_info p
  WHERE p.event_id = e.id
    AND p.group_chat_url IS NOT NULL
    AND length(btrim(p.group_chat_url)) > 0
);
