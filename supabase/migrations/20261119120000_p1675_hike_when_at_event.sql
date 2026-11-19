-- P1675 UAT round 4, R19: a hike's third "when" answer, 'event' (at the meeting point, the person comes 15 minutes early).
--
-- client-safe: widens a CHECK (every stored value stays valid) and replaces register_for_hike with the same signature, the same
--   grants and the same behaviour for 'now' and 'later'; the only change is that p_when may also be 'event'. An older client never
--   sends 'event', so it is unaffected. 'event' needs no 24-hour rule (only 'later' does).
-- diffed against: 20261118200000_p1675_hike_registration_preset.sql (register_for_hike; the one changed line is the p_when
--   validation, everything else is copied unchanged).

-- 1. The stored answer. The column's inline CHECK from 20261117120000 has the default name event_hike_answers_when_choice_check.
ALTER TABLE public.event_hike_answers DROP CONSTRAINT IF EXISTS event_hike_answers_when_choice_check;
ALTER TABLE public.event_hike_answers
  ADD CONSTRAINT event_hike_answers_when_choice_check CHECK (when_choice IN ('now', 'later', 'event'));

-- 2. register_for_hike accepts 'event'.
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
  v_asks_transport boolean;
  v_asks_help boolean;
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

  -- An optional hike registers in one tap and has no form: a form left open when the host switched to optional is refused with a
  -- distinct code, before any write (the client shows its generic retry toast).
  IF v_event.hike_registration = 'optional' THEN
    RETURN 'optional';
  END IF;
  v_asks_transport := v_event.hike_registration IN ('when_transport', 'all');
  v_asks_help := v_event.hike_registration = 'all';

  -- Already registered: nothing changes (answers are not editable after the seat), whatever was sent.
  IF EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = v_event.id AND r.profile_id = v_uid) THEN
    RETURN 'already';
  END IF;

  -- Explicit value checks, so a bad answer raises 22023 and nothing is saved (the table CHECKs are the second wall).
  IF p_when IS NULL OR p_when NOT IN ('now', 'later', 'event') THEN
    RAISE EXCEPTION 'choose when you will do the introduction' USING ERRCODE = '22023';
  END IF;

  -- Transport: asked = required as before; not asked = stored NULL (with its seats) whatever the client sent.
  IF v_asks_transport THEN
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
  IF v_asks_help THEN
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
  VALUES (v_event.id, v_uid, p_when, v_transport, v_seats, v_help, v_other, v_asks_help)
  ON CONFLICT (event_id, profile_id) DO UPDATE
    SET when_choice = EXCLUDED.when_choice, transport = EXCLUDED.transport, free_seats = EXCLUDED.free_seats,
        help = EXCLUDED.help, help_other = EXCLUDED.help_other, asked_help = EXCLUDED.asked_help, created_at = now();
  INSERT INTO public.event_rsvps (event_id, profile_id) VALUES (v_event.id, v_uid);
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.register_for_hike(text, text, text, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_for_hike(text, text, text, integer, text, text) TO authenticated;
