-- P1603: hidden events, visible only with the link.
-- Created: 2026-11-03
-- Spec: features/p1603_hidden_events_link_only.md
--
-- client-safe: adds a NOT NULL column that defaults to false, so every existing row, and every deployed client that
--   inserts without the column, stays exactly as public as it is. The SELECT policy is replaced in this one file (one
--   transaction on every apply path), with the same reads allowed for every row that is not hidden. Nothing is
--   revoked from anon or authenticated: table and column grants on events are unchanged. The new function is additive.
-- new function: get_event_by_slug
--
-- WHAT CHANGES
--   1. events.is_hidden boolean NOT NULL DEFAULT false.
--   2. SELECT on events: a row is readable when it is not hidden, OR the viewer is its host, OR the viewer has an RSVP
--      for it. (service_role keeps its own bypass policy, "Test data: service_role bypass for events".)
--   3. get_event_by_slug(text): the one read that returns a hidden event to a stranger, by EXACT slug only.
--
-- WHY THE POLICY NEEDS NO SECURITY DEFINER HELPER
--   event_rsvps is SELECT USING (true) with column grants that include event_id and profile_id (P1321), and no policy on
--   event_rsvps reads events back, so the EXISTS below cannot recurse. Postgres evaluates the OR arms left to right and
--   stops at the first true, so a row that is not hidden never reaches the host test or the RSVP lookup.
--   (auth.uid()) is wrapped in a SELECT so it is evaluated once per statement, as the repo's other policies do.
--
-- WHO ELSE READS events AS THE CALLER, checked on TEST in pg_policies / pg_proc before writing this:
--   every policy that reads events tests e.host_id = auth.uid() (the host passes this policy); the only SECURITY INVOKER
--   functions that read events are assert_transcribe_event_access (caller is host or registered) and set_rsvp_message_ids
--   (service role). Every other function that reads events is SECURITY DEFINER and is unaffected.
--
-- LIMIT: event_rsvps stays readable by everyone. Anyone who learns a hidden event's id can still list who RSVP'd.
--   The spec accepts that an id is revealed (an id names no title or link); the attendee list is reported, not changed.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.is_hidden IS
  'P1603: true = not listed and not readable by strangers. Readable by the host, by anyone with an RSVP, by the service role, and by get_event_by_slug (exact slug).';

DROP POLICY IF EXISTS "Events are viewable by everyone" ON public.events;
DROP POLICY IF EXISTS "Events are viewable unless hidden" ON public.events;

CREATE POLICY "Events are viewable unless hidden"
  ON public.events FOR SELECT
  USING (
    NOT is_hidden
    OR host_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.event_rsvps r
       WHERE r.event_id = events.id
         AND r.profile_id = (SELECT auth.uid())
    )
  );

-- The one read that returns a hidden event to someone who is neither host nor registered: exact slug, one row, no listing.
-- SETOF public.events so the event page keeps its `select *` with the host embed unchanged (PostgREST embeds through a
-- function that returns a table type); it returns the same columns a public event already returns to anon.
-- `=` on the slug is an exact text comparison: '%', '_' and prefixes match nothing. No lookup by id exists.
CREATE OR REPLACE FUNCTION public.get_event_by_slug(p_slug text)
RETURNS SETOF public.events
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
ROWS 1
AS $$
  SELECT e.*
    FROM public.events e
   WHERE p_slug IS NOT NULL
     AND e.slug = p_slug
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_event_by_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_event_by_slug(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_by_slug(text) TO anon, authenticated, service_role;

-- Fail the apply if the function can be reached by a role it should not, or if the new grant did not land.
DO $$
BEGIN
  IF NOT has_function_privilege('anon', 'public.get_event_by_slug(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_event_by_slug(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1603: get_event_by_slug must be executable by anon and authenticated';
  END IF;
  IF has_function_privilege('public', 'public.get_event_by_slug(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1603: get_event_by_slug must not be executable through PUBLIC';
  END IF;
END
$$;
