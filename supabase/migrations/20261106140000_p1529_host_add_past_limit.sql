-- P1529 founder UAT round 1: the host's one-tap Add from the waiting list must work when the event is full, which is the only time
-- a waiting list exists. host_add_from_waitlist skipped the limit itself, but its INSERT into event_rsvps fires the BEFORE INSERT
-- trigger event_rsvps_need_answers, which refused 'this event is full' for every non-host profile at the limit (found by the
-- /finish review; the seeded room was full, 12 of 12).
--
-- client-safe: the trigger function keeps its signature and every refusal for everyone but the event's host acting.
-- diffed against: 20261105200000_p1529_review_fixes_2.sql (_event_rsvps_need_answers; one condition added, every other line identical).

BEGIN;

CREATE OR REPLACE FUNCTION public._event_rsvps_need_answers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_max integer;
  v_host uuid;
BEGIN
  IF public._event_flow(NEW.event_id) <> 'sales-mastermind' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.event_registration_answers a
                  WHERE a.event_id = NEW.event_id AND a.profile_id = NEW.profile_id) THEN
    RAISE EXCEPTION 'this event asks a few questions before registering' USING ERRCODE = 'P0001', HINT = 'answers_required';
  END IF;
  SELECT e.max_attendees, e.host_id INTO v_max, v_host FROM public.events e WHERE e.id = NEW.event_id FOR UPDATE;
  -- The host may take the event past its limit (founder, UAT round 1: adding someone from the waiting list "may take the event
  -- past its limit: the host decides"). Only host_add_from_waitlist inserts another person's row as the host: the insert policy
  -- on event_rsvps allows only a person's own row, so a host's own direct insert is exempt already as the host.
  IF v_max IS NOT NULL AND NEW.profile_id IS DISTINCT FROM v_host
     AND (SELECT auth.uid()) IS DISTINCT FROM v_host
     AND (SELECT count(*) FROM public.event_rsvps r
           WHERE r.event_id = NEW.event_id AND r.profile_id IS DISTINCT FROM v_host) >= v_max THEN
    RAISE EXCEPTION 'this event is full' USING ERRCODE = 'P0001', HINT = 'full';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._event_rsvps_need_answers() FROM PUBLIC, anon, authenticated;

COMMIT;
