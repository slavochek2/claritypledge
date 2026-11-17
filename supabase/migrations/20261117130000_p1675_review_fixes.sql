-- P1675 review fixes (2026-11-17 /finish, Codex and the criteria reviewer).
--
-- client-safe: replaces two functions added by 20261117120000_p1675_hike_registration.sql; same signatures, same grants.
-- 1. register_for_hike: a person already registered gets 'already' before the 24-hour rule is checked, so a repeated "later"
--    inside 24 hours is a no-op, not a refusal that redraws the form. And "later" closes at start minus 24 h 30 min, not
--    24 h: the reminder dispatcher runs every 30 minutes and only picks up reminders still ahead (Opus review), so a
--    "later" in the last half hour before the 24 h mark could get no reminder at all.
-- 2. get_event_room_counts: event visibility is app_private.viewer_sees_event (the host or a registered person sees a hidden
--    event; P1603), not "or has a room member row". A person who opened a hidden hike's room and then cancelled no longer
--    reads its counts.
-- diffed against: 20261117120000_p1675_hike_registration.sql (both functions; only the lines named above change),
--   20261103040000_p1603_hidden_event_ids_private.sql (app_private.viewer_sees_event).

BEGIN;

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
  IF p_transport IS NULL OR p_transport NOT IN ('car', 'motorbike', 'bike_or_foot', 'need_ride') THEN
    RAISE EXCEPTION 'choose how you are coming' USING ERRCODE = '22023';
  END IF;
  IF p_help IS NOT NULL AND p_help NOT IN ('lead', 'sweep', 'welcomer', 'transport_lead', 'other') THEN
    RAISE EXCEPTION 'unknown way to help' USING ERRCODE = '22023';
  END IF;
  IF p_help = 'transport_lead' AND p_transport <> 'need_ride' THEN
    RAISE EXCEPTION 'transport lead is for people who need a ride' USING ERRCODE = '22023';
  END IF;
  v_seats := CASE WHEN p_transport IN ('car', 'motorbike') THEN p_free_seats END;
  IF p_transport IN ('car', 'motorbike') AND (v_seats IS NULL OR v_seats < 0 OR v_seats > 20) THEN
    RAISE EXCEPTION 'free seats must be a whole number from 0 to 20' USING ERRCODE = '22023';
  END IF;
  v_other := CASE WHEN p_help = 'other' THEN NULLIF(btrim(COALESCE(p_help_other, '')), '') END;
  IF p_help = 'other' AND (v_other IS NULL OR length(v_other) > 280) THEN
    RAISE EXCEPTION 'say in a few words how you would like to help (up to 280 characters)' USING ERRCODE = '22023';
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
    (event_id, profile_id, when_choice, transport, free_seats, help, help_other)
  VALUES (v_event.id, v_uid, p_when, p_transport, v_seats, p_help, v_other)
  ON CONFLICT (event_id, profile_id) DO UPDATE
    SET when_choice = EXCLUDED.when_choice, transport = EXCLUDED.transport, free_seats = EXCLUDED.free_seats,
        help = EXCLUDED.help, help_other = EXCLUDED.help_other, created_at = now();
  INSERT INTO public.event_rsvps (event_id, profile_id) VALUES (v_event.id, v_uid);
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.register_for_hike(text, text, text, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_for_hike(text, text, text, integer, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_event_room_counts(p_event uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_host uuid;
  v_not_here integer;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in to see the room' USING ERRCODE = '42501';
  END IF;
  SELECT e.host_id INTO v_host FROM public.events e WHERE e.id = p_event;
  IF NOT FOUND OR NOT app_private.viewer_sees_event(p_event) THEN
    RAISE EXCEPTION 'event not visible' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::int INTO v_not_here
    FROM public.event_rsvps r
   WHERE r.event_id = p_event AND r.profile_id IS DISTINCT FROM v_host
     AND NOT EXISTS (SELECT 1 FROM public.event_room_members m
                      WHERE m.event_id = p_event AND m.profile_id = r.profile_id);
  v_result := jsonb_build_object('not_here', v_not_here);

  IF v_host IS NOT DISTINCT FROM v_uid THEN
    v_result := v_result || (
      SELECT jsonb_build_object(
               'in', count(*) FILTER (WHERE s.state IS TRUE)::int,
               'out', count(*) FILTER (WHERE s.state IS FALSE)::int,
               'undecided', count(*) FILTER (WHERE s.state IS NULL)::int)
        FROM (
          -- registered people and room members with an account, each once
          SELECT COALESCE(
                   (SELECT m.opted_in FROM public.event_room_members m
                     WHERE m.event_id = p_event AND m.profile_id = p.profile_id AND m.opted_in IS NOT NULL
                     ORDER BY m.joined_at DESC LIMIT 1),
                   (SELECT pr.opted_in FROM public.event_preparations pr
                     WHERE pr.event_id = p_event AND pr.profile_id = p.profile_id)) AS state
            FROM (
              SELECT r.profile_id FROM public.event_rsvps r WHERE r.event_id = p_event
              UNION
              SELECT m.profile_id FROM public.event_room_members m
               WHERE m.event_id = p_event AND m.profile_id IS NOT NULL
            ) p
           WHERE p.profile_id IS DISTINCT FROM v_host
          UNION ALL
          -- walk-ins (no account) are people in the room too, counted per room row as the room counts them
          SELECT m.opted_in AS state FROM public.event_room_members m
           WHERE m.event_id = p_event AND m.profile_id IS NULL
        ) s);
  END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_event_room_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_room_counts(uuid) TO authenticated;

COMMIT;
