-- P1529 founder UAT round 1: the host screen names each person's canvas by the title its owner gave it. `canvas_name` is the canvas's
-- URL key (most people's first canvas is simply "canvas"), so every row read "Clarity Canvas shared: canvas" on the seeded room.
--
-- client-safe: get_mastermind_host_state keeps its signature and every field; it only gains `canvas_title` (null when no canvas is
-- chosen). The client shows the title and falls back to the name.
-- diffed against: 20261106020000_p1529_waiting_list_in_host_state.sql (get_mastermind_host_state; every other line identical; the
--   one-time DROP of get_event_waitlist there is not repeated).

BEGIN;

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
             'canvas_title', (SELECT c.title FROM public.event_canvases ec JOIN public.canvases c ON c.id = ec.canvas_id
                               WHERE ec.event_id = p_event AND ec.profile_id = p.profile_id),
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
REVOKE ALL ON FUNCTION public.get_mastermind_host_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_mastermind_host_state(uuid) TO authenticated;

COMMIT;
