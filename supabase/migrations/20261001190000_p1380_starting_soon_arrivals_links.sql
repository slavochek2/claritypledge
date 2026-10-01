-- new tables: event_arrivals, event_email_links. new column: event_rsvps.starting_soon_attempted_at.
-- new functions: mark_event_arrival (every function below is new: no prior definition to diff against)
-- P1380: "Starting in 15 minutes" email with arrival check-in, and one-click sign-in links in
-- event emails.
--
-- client-safe: additive, plus email_send_log's email_type CHECK widened by one value (section 4).
--
-- WHY ARRIVALS ARE NOT A COLUMN ON event_rsvps: event_rsvps is `SELECT USING (true)` — any
-- column there is world-readable. Who was physically present is the registrant's and the
-- host's business, nobody else's (same reasoning as event_preparations, P1336).
--
-- WHY event_email_links STORES A HASH: the plaintext ticket exists only inside the email. A
-- database read (backup, log, a future over-broad policy) must not hand anyone a working
-- sign-in link. The ticket is looked up by sha256(ticket) from the service-role edge function
-- `event-email-link`; no role but service_role can read the table at all.

-- ============================================================================
-- 1. Starting-soon dispatch bookkeeping
-- ============================================================================
-- The claim itself lives in mailgun_message_ids->>'starting_soon' (PENDING / id / SENT_NO_ID),
-- exactly like 'reminder' and 'feedback'. This column is the claim time for stuck-claim reset.

ALTER TABLE public.event_rsvps
  ADD COLUMN IF NOT EXISTS starting_soon_attempted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.event_rsvps.starting_soon_attempted_at IS
  'P1380: when dispatch-event-emails claimed the starting-soon email for this RSVP (stuck-claim reset).';

-- ============================================================================
-- 2. event_arrivals — self-reported "I''m here", one row per (event, person)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_arrivals (
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  arrived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, profile_id)
);

COMMENT ON TABLE public.event_arrivals IS
  'P1380: self-reported arrival ("I''m here"). Private: owner + event host. Written only by mark_event_arrival.';

ALTER TABLE public.event_arrivals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_arrivals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.event_arrivals TO authenticated;

CREATE POLICY "Owner reads own arrival"
  ON public.event_arrivals FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()));

CREATE POLICY "Host reads arrivals of their event"
  ON public.event_arrivals FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events e
     WHERE e.id = event_arrivals.event_id AND e.host_id = (SELECT auth.uid())
  ));

-- Only a registrant of a non-cancelled event can say they arrived. Idempotent: the first
-- arrival time is kept (a second tap does not move it). Returns the stored time.
CREATE OR REPLACE FUNCTION public.mark_event_arrival(p_event_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.event_rsvps r
      JOIN public.events e ON e.id = r.event_id
     WHERE r.event_id = p_event_id AND r.profile_id = v_uid AND e.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'only people registered for the event can check in' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.event_arrivals (event_id, profile_id)
  VALUES (p_event_id, v_uid)
  ON CONFLICT (event_id, profile_id) DO NOTHING;

  SELECT a.arrived_at INTO v_at FROM public.event_arrivals a
   WHERE a.event_id = p_event_id AND a.profile_id = v_uid;
  RETURN v_at;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_event_arrival(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_event_arrival(uuid) TO authenticated;

-- ============================================================================
-- 3. event_email_links — one ticket per (rsvp, purpose), redeemed by event-email-link
-- ============================================================================
-- purpose fixes the destination (the edge function maps it to a path; no URL is stored), so a
-- leaked ticket can only ever open that one page of that one event, and only until expires_at
-- (the event's end). The RSVP must still exist and the event must not be cancelled at click
-- time — both are checked by the edge function, and ON DELETE CASCADE removes the ticket when
-- the person un-registers.

CREATE TABLE IF NOT EXISTS public.event_email_links (
  token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  rsvp_id UUID NOT NULL REFERENCES public.event_rsvps(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('prepare', 'room', 'arrived', 'not_yet')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_event_email_links_rsvp ON public.event_email_links(rsvp_id);

COMMENT ON TABLE public.event_email_links IS
  'P1380: hashed one-click sign-in tickets behind event email buttons. service_role only.';

ALTER TABLE public.event_email_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_email_links FROM PUBLIC, anon, authenticated;
-- No policies: with RLS on and no grant, only service_role (which bypasses RLS) can touch it.

-- ============================================================================
-- 4. email_send_log accepts the new type
-- ============================================================================
-- diffed against: 20260314123817_add_email_send_log.sql (the only definition of this check).
-- Without this, logEmailSend's insert for 'starting_soon' fails the CHECK and logEmailSend
-- swallows the error by design — every send would go unlogged, silently.

ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_email_type_check;
ALTER TABLE public.email_send_log
  ADD CONSTRAINT email_send_log_email_type_check
  CHECK (email_type IN ('confirmation','reminder','feedback','cancellation','update','uncancel','starting_soon'));
