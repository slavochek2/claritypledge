-- P1529 founder UAT round 1, /finish re-review fixes (Opus, Gemini):
--   1. A person the host removes leaves the waiting list too (a trigger on event_removals), so they are no longer told they are
--      on it, and a removal can never be undone by an Add.
--   2. get_mastermind_host_state leaves anyone removed out of the waiting list and its numbering (as get_event_waitlist_public).
--
-- new function: _event_removal_clears_waitlist (trigger function, not callable by clients)
-- client-safe: get_mastermind_host_state keeps its signature and fields.
-- diffed against: 20261106150000_p1529_review_fixes_waitlist.sql (get_mastermind_host_state; only the two waiting-list filters added).

BEGIN;

CREATE OR REPLACE FUNCTION public._event_removal_clears_waitlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.event_waitlist w WHERE w.event_id = NEW.event_id AND w.profile_id = NEW.user_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._event_removal_clears_waitlist() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS event_removal_clears_waitlist ON public.event_removals;
CREATE TRIGGER event_removal_clears_waitlist AFTER INSERT ON public.event_removals
  FOR EACH ROW EXECUTE FUNCTION public._event_removal_clears_waitlist();

-- Removed before this migration: clear their entries now.
DELETE FROM public.event_waitlist w
 WHERE EXISTS (SELECT 1 FROM public.event_removals x WHERE x.event_id = w.event_id AND x.user_id = w.profile_id);

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
        SELECT w.profile_id FROM public.event_waitlist w WHERE w.event_id = p_event AND NOT EXISTS (SELECT 1 FROM public.event_removals x WHERE x.event_id = p_event AND x.user_id = w.profile_id)
      ) p
      LEFT JOIN public.event_registration_answers a ON a.event_id = p_event AND a.profile_id = p.profile_id
      LEFT JOIN (
        SELECT w.profile_id, row_number() OVER (ORDER BY w.joined_at, w.id) AS pos
          FROM public.event_waitlist w WHERE w.event_id = p_event AND NOT EXISTS (SELECT 1 FROM public.event_removals x WHERE x.event_id = p_event AND x.user_id = w.profile_id)
      ) wl ON wl.profile_id = p.profile_id
     WHERE p.profile_id <> v_host
  ), '[]'::jsonb);
END;
$$;

COMMIT;
