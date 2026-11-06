-- P1529 founder UAT round 1, /finish review fixes (Opus adversary, verified against the SQL):
--   1. join_event_waitlist: a person the host removed is refused (42501, as their registration already is), because the waiting
--      list is now shown to attendees; get_event_waitlist_public also leaves out anyone removed.
--   2. host_add_from_waitlist: the list row is locked, so a leave racing the add cannot end in a registration the person left.
--   3. get_mastermind_host_state: canvas_title only while the canvas is shared with the event (the owner's own title is free text).
--
-- client-safe: signatures, grants and every other line unchanged; a removed person joining now gets 42501 instead of 'ok'.
-- diffed against: 20261106010000_p1529_waiting_list.sql (join_event_waitlist), 20261106120000_p1529_waitlist_promote.sql
--   (host_add_from_waitlist, get_event_waitlist_public), 20261106130000_p1529_host_state_canvas_title.sql (get_mastermind_host_state).

BEGIN;

CREATE OR REPLACE FUNCTION public.join_event_waitlist(
  p_slug text, p_participation text, p_phone text, p_hope text, p_recording_accepted boolean, p_observer_prep text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_already boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in to join the waiting list' USING ERRCODE = '42501';
  END IF;
  IF p_recording_accepted IS NOT TRUE THEN
    RAISE EXCEPTION 'accepting transcription is a condition of this event' USING ERRCODE = '22023';
  END IF;
  IF p_participation = 'observer' AND p_observer_prep IS NULL THEN
    RAISE EXCEPTION 'choose where you will prepare' USING ERRCODE = '22023';
  END IF;
  -- The same row lock register_for_event takes: a registration and a join cannot both read "full" and "free".
  SELECT * INTO v_event FROM public.events e WHERE e.slug = p_slug FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF public._event_flow(v_event.id) <> 'sales-mastermind' THEN
    RAISE EXCEPTION 'this event has no waiting list' USING ERRCODE = '22023';
  END IF;
  IF v_event.status = 'cancelled' THEN
    RETURN 'cancelled';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = v_event.id AND r.profile_id = v_uid) THEN
    RETURN 'registered';
  END IF;
  -- A person the host removed cannot come back through the waiting list (the removal trigger refuses their registration the
  -- same way, p1515_refuse_removed_registration): the list is shown to attendees, so it must not carry them either.
  IF EXISTS (SELECT 1 FROM public.event_removals x WHERE x.event_id = v_event.id AND x.user_id = v_uid) THEN
    RAISE EXCEPTION 'not authorized for this event' USING ERRCODE = '42501';
  END IF;
  -- The host's own place never counts toward the limit (register_for_event), so the host is never "full".
  IF v_uid = v_event.host_id OR v_event.max_attendees IS NULL
     OR (SELECT count(*) FROM public.event_rsvps r
          WHERE r.event_id = v_event.id AND r.profile_id IS DISTINCT FROM v_event.host_id) < v_event.max_attendees THEN
    RETURN 'not_full';
  END IF;

  v_already := EXISTS (SELECT 1 FROM public.event_waitlist w WHERE w.event_id = v_event.id AND w.profile_id = v_uid);
  INSERT INTO public.event_waitlist AS w
    (event_id, profile_id, participation, observer_prep, phone, hope, recording_accepted_at)
  VALUES (v_event.id, v_uid, p_participation,
          CASE WHEN p_participation = 'observer' THEN p_observer_prep END,
          p_phone, NULLIF(btrim(COALESCE(p_hope, '')), ''), now())
  ON CONFLICT (event_id, profile_id) DO UPDATE
    SET participation = EXCLUDED.participation, observer_prep = EXCLUDED.observer_prep, phone = EXCLUDED.phone,
        hope = EXCLUDED.hope, recording_accepted_at = EXCLUDED.recording_accepted_at;
  RETURN CASE WHEN v_already THEN 'already' ELSE 'ok' END;
END;
$$;

CREATE OR REPLACE FUNCTION public.host_add_from_waitlist(p_event uuid, p_user uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_entry public.event_waitlist%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF p_event IS NULL OR p_user IS NULL THEN
    RAISE EXCEPTION 'not authorized for this event' USING ERRCODE = '42501';
  END IF;
  -- The same row lock register_for_event and join_event_waitlist take: an add and a join cannot interleave.
  SELECT * INTO v_event FROM public.events e WHERE e.id = p_event AND e.host_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this event' USING ERRCODE = '42501';
  END IF;
  IF v_event.status = 'cancelled' THEN
    RAISE EXCEPTION 'this event is cancelled' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = p_event AND r.profile_id = p_user) THEN
    DELETE FROM public.event_waitlist w WHERE w.event_id = p_event AND w.profile_id = p_user;
    RETURN 'already';
  END IF;

  -- Locked: a leave racing this add either deletes first (then the add says not on the list) or waits for it.
  SELECT * INTO v_entry FROM public.event_waitlist w WHERE w.event_id = p_event AND w.profile_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'this person is not on the waiting list' USING ERRCODE = '22023';
  END IF;

  -- The answers first: the insert trigger on event_rsvps refuses a registration in this flow without them.
  INSERT INTO public.event_registration_answers AS a
    (event_id, profile_id, participation, observer_prep, phone, hope, recording_accepted_at)
  VALUES (p_event, p_user, v_entry.participation, v_entry.observer_prep, v_entry.phone, v_entry.hope, v_entry.recording_accepted_at)
  ON CONFLICT (event_id, profile_id) DO UPDATE
    SET participation = EXCLUDED.participation, observer_prep = EXCLUDED.observer_prep, phone = EXCLUDED.phone,
        hope = EXCLUDED.hope, recording_accepted_at = EXCLUDED.recording_accepted_at, updated_at = now();

  INSERT INTO public.event_rsvps (event_id, profile_id) VALUES (p_event, p_user);
  DELETE FROM public.event_waitlist w WHERE w.event_id = p_event AND w.profile_id = p_user;
  RETURN 'ok';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_event_waitlist_public(p_event uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_event IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  IF NOT (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event AND e.host_id = v_uid)
    OR EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = p_event AND r.profile_id = v_uid)
  ) THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'profile_id', q.profile_id,
             'name', COALESCE(q.name, 'Someone'),
             'slug', q.slug,
             'avatar_color', q.avatar_color,
             'avatar_url', q.avatar_url,
             'has_pledged', COALESCE(q.has_pledged, false),
             'position', q.position)
           ORDER BY q.position)
      FROM (
        SELECT w.profile_id, p.name, p.slug, p.avatar_color, p.avatar_url, p.has_pledged,
               row_number() OVER (ORDER BY w.joined_at, w.id) AS position
          FROM public.event_waitlist w
          LEFT JOIN public.profiles p ON p.id = w.profile_id
         WHERE w.event_id = p_event
           AND NOT EXISTS (SELECT 1 FROM public.event_removals x WHERE x.event_id = p_event AND x.user_id = w.profile_id)
      ) q
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_mastermind_host_state(p_event uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host uuid;
BEGIN
  SELECT e.host_id INTO v_host FROM public.events e WHERE e.id = p_event AND e.host_id = (SELECT auth.uid());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'host only' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'profile_id', p.profile_id,
             'canvas_name', (SELECT c.name FROM public.event_canvases ec JOIN public.canvases c ON c.id = ec.canvas_id
                              WHERE ec.event_id = p_event AND ec.profile_id = p.profile_id),
             'canvas_title', CASE WHEN public._event_canvas_shared(p_event, p.profile_id) THEN
                               (SELECT c.title FROM public.event_canvases ec JOIN public.canvases c ON c.id = ec.canvas_id
                                 WHERE ec.event_id = p_event AND ec.profile_id = p.profile_id) END,
             'canvas_shared', public._event_canvas_shared(p_event, p.profile_id),
             'observer_override', (SELECT o.is_observer FROM public.event_observer_overrides o
                                    WHERE o.event_id = p_event AND o.profile_id = p.profile_id),
             'participation', a.participation,
             'observer_prep', a.observer_prep,
             'registered', EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = p_event AND r.profile_id = p.profile_id),
             'waiting_position', wl.pos,
             'name', CASE WHEN wl.pos IS NOT NULL THEN (SELECT pr.name FROM public.profiles pr WHERE pr.id = p.profile_id) END,
             'phone', a.phone,
             'recording_on', EXISTS (
               SELECT 1 FROM public.transcribe_room_members m JOIN public.transcribe_rooms r ON r.id = m.room_id
                WHERE r.event_id = p_event AND r.ended_at IS NULL AND m.profile_id = p.profile_id
                  AND m.consent_given_at IS NOT NULL AND m.capture_ended_at IS NULL
                  AND m.last_seen_at > now() - interval '10 minutes'),
             'last_words_at', (
               SELECT max(tm.created_at) FROM public.transcribe_messages tm
                 JOIN public.transcribe_room_members m ON m.id = tm.member_id
                 JOIN public.transcribe_rooms r ON r.id = tm.room_id
                WHERE r.event_id = p_event AND m.profile_id = p.profile_id)))
      FROM (
        SELECT r.profile_id FROM public.event_rsvps r WHERE r.event_id = p_event
        UNION
        SELECT m.profile_id FROM public.event_room_members m WHERE m.event_id = p_event AND m.profile_id IS NOT NULL
        UNION
        SELECT w.profile_id FROM public.event_waitlist w WHERE w.event_id = p_event
      ) p
      LEFT JOIN public.event_registration_answers a ON a.event_id = p_event AND a.profile_id = p.profile_id
      LEFT JOIN (
        SELECT w.profile_id, row_number() OVER (ORDER BY w.joined_at, w.id) AS pos
          FROM public.event_waitlist w WHERE w.event_id = p_event
      ) wl ON wl.profile_id = p.profile_id
     WHERE p.profile_id <> v_host
  ), '[]'::jsonb);
END;
$$;

COMMIT;
