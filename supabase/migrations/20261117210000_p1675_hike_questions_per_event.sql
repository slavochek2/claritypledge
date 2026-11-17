-- P1675 UAT round 1, R6: a hike asks its questions per event. Two event settings say whether the "how are you coming" and
-- "how would you like to help" questions are asked; the answer for a question that is not asked is stored NULL.
--
-- client-safe: adds two columns with defaults (every existing hike keeps asking both), relaxes event_hike_answers.transport
--   to nullable, and replaces register_for_hike (same signature, same grants). No client sends NULL transport before this runs.
-- diffed against: 20261117130000_p1675_review_fixes.sql (register_for_hike; the new lines are the two settings, the NULL
--   storage branches and the transport-lead test), 20261117120000_p1675_hike_registration.sql (the two constraints).
-- Checked, no change needed: public._event_rsvps_need_answers and the trigger event_rsvps_clear_hike_answers key on the
--   answers row existing (not on any column of it), so a row with NULL transport still opens the seat and is deleted with it.

-- 1. The two event settings: ordinary public event settings, not personal data.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS hike_asks_transport boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS hike_asks_help boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.events.hike_asks_transport IS
  'P1675 R6: a hike asks "how are you coming" (and free seats) before the seat. Ignored for events that are not hikes.';
COMMENT ON COLUMN public.events.hike_asks_help IS
  'P1675 R6: a hike asks "how would you like to help" before the seat. Ignored for events that are not hikes.';

-- Whether the event asked the help question when the person registered. A NULL help means both "Just attend" and "not asked",
-- so each answers row records which (spec review). Rows from before this column asked (both questions were always asked): true.
ALTER TABLE public.event_hike_answers ADD COLUMN IF NOT EXISTS asked_help boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.event_hike_answers.asked_help IS
  'P1675 R6: the event asked the help question when this person registered (events.hike_asks_help at that moment, written by register_for_hike). help NULL with asked_help true = Just attend; with asked_help false = not asked.';

-- 2. Transport is NULL exactly when the event did not ask. The inline IN (...) CHECK passes NULL, which is intended.
ALTER TABLE public.event_hike_answers ALTER COLUMN transport DROP NOT NULL;

ALTER TABLE public.event_hike_answers DROP CONSTRAINT IF EXISTS event_hike_answers_free_seats_motor_only;
ALTER TABLE public.event_hike_answers ADD CONSTRAINT event_hike_answers_free_seats_motor_only CHECK (
  (transport IS NULL AND free_seats IS NULL)
  OR (transport IS NOT NULL AND (
        (transport IN ('car', 'motorbike') AND free_seats IS NOT NULL AND free_seats BETWEEN 0 AND 20)
     OR (transport IN ('bike_or_foot', 'need_ride') AND free_seats IS NULL))));

ALTER TABLE public.event_hike_answers DROP CONSTRAINT IF EXISTS event_hike_answers_transport_lead_needs_ride;
ALTER TABLE public.event_hike_answers ADD CONSTRAINT event_hike_answers_transport_lead_needs_ride CHECK (
  help IS DISTINCT FROM 'transport_lead' OR transport IS NOT DISTINCT FROM 'need_ride');

-- 3. register_for_hike reads the event's two settings.
CREATE OR REPLACE FUNCTION public.register_for_hike(
  p_slug text, p_when text, p_transport text, p_free_seats integer, p_help text, p_help_other text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_transport text;
  v_help text;
  v_seats integer;
  v_other text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in to register' USING ERRCODE = '42501';
  END IF;
  IF p_slug IS NULL THEN
    RETURN 'not_found';
  END IF;
  SELECT * INTO v_event FROM public.events e WHERE e.slug = p_slug FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF public._event_flow(v_event.id) <> 'social-hike' THEN
    RAISE EXCEPTION 'this event is not a hike' USING ERRCODE = '22023';
  END IF;
  IF v_event.status = 'cancelled' THEN
    RETURN 'cancelled';
  END IF;

  -- Already registered: nothing changes (answers are not editable after the seat), whatever was sent.
  IF EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = v_event.id AND r.profile_id = v_uid) THEN
    RETURN 'already';
  END IF;

  -- Explicit value checks, so a bad answer raises 22023 and nothing is saved (the table CHECKs are the second wall).
  IF p_when IS NULL OR p_when NOT IN ('now', 'later') THEN
    RAISE EXCEPTION 'choose when you will do the introduction' USING ERRCODE = '22023';
  END IF;

  -- Transport: asked = required as before; not asked = stored NULL (with its seats) whatever the client sent.
  IF v_event.hike_asks_transport THEN
    IF p_transport IS NULL OR p_transport NOT IN ('car', 'motorbike', 'bike_or_foot', 'need_ride') THEN
      RAISE EXCEPTION 'choose how you are coming' USING ERRCODE = '22023';
    END IF;
    v_transport := p_transport;
    v_seats := CASE WHEN v_transport IN ('car', 'motorbike') THEN p_free_seats END;
    IF v_transport IN ('car', 'motorbike') AND (v_seats IS NULL OR v_seats < 0 OR v_seats > 20) THEN
      RAISE EXCEPTION 'free seats must be a whole number from 0 to 20' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_transport := NULL;
    v_seats := NULL;
  END IF;

  -- Help: asked = validated as before; not asked = help and Other stored NULL.
  IF v_event.hike_asks_help THEN
    IF p_help IS NOT NULL AND p_help NOT IN ('lead', 'sweep', 'welcomer', 'transport_lead', 'other') THEN
      RAISE EXCEPTION 'unknown way to help' USING ERRCODE = '22023';
    END IF;
    v_help := p_help;
    -- Transport lead is for people who need a ride; with transport not asked there is no ride answer, so it is refused.
    IF v_help = 'transport_lead' AND v_transport IS DISTINCT FROM 'need_ride' THEN
      RAISE EXCEPTION 'transport lead is for people who need a ride' USING ERRCODE = '22023';
    END IF;
    v_other := CASE WHEN v_help = 'other' THEN NULLIF(btrim(COALESCE(p_help_other, '')), '') END;
    IF v_help = 'other' AND (v_other IS NULL OR length(v_other) > 280) THEN
      RAISE EXCEPTION 'say in a few words how you would like to help (up to 280 characters)' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_help := NULL;
    v_other := NULL;
  END IF;

  -- "Later" needs a reminder that will really be sent. The reminder is due at start minus 24 hours, and the dispatcher
  -- (cron every 30 minutes) only picks up a reminder whose time is still ahead, so "later" closes 30 minutes before that.
  -- Returned before any write.
  IF p_when = 'later' AND NOT (now() < v_event.datetime - interval '24 hours 30 minutes') THEN
    RETURN 'now_only';
  END IF;

  -- Hikes have no waiting list: at the limit the answer is 'full'. The host does not count.
  IF v_event.max_attendees IS NOT NULL
     AND (SELECT count(*) FROM public.event_rsvps r
           WHERE r.event_id = v_event.id AND r.profile_id IS DISTINCT FROM v_event.host_id) >= v_event.max_attendees THEN
    RETURN 'full';
  END IF;

  INSERT INTO public.event_hike_answers AS a
    (event_id, profile_id, when_choice, transport, free_seats, help, help_other, asked_help)
  VALUES (v_event.id, v_uid, p_when, v_transport, v_seats, v_help, v_other, v_event.hike_asks_help)
  ON CONFLICT (event_id, profile_id) DO UPDATE
    SET when_choice = EXCLUDED.when_choice, transport = EXCLUDED.transport, free_seats = EXCLUDED.free_seats,
        help = EXCLUDED.help, help_other = EXCLUDED.help_other, asked_help = EXCLUDED.asked_help, created_at = now();
  INSERT INTO public.event_rsvps (event_id, profile_id) VALUES (v_event.id, v_uid);
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.register_for_hike(text, text, text, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_for_hike(text, text, text, integer, text, text) TO authenticated;
