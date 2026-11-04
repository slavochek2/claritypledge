-- P1529 review fixes (Gemini, Codex and an automated security check, each verified against the code).
--
-- client-safe: replaces functions added by 20261105090000_p1529_mastermind_flow_registration.sql and adds two
-- triggers on events that only act on a change of flow, series or linked session. No other event is affected.
-- diffed against: 20261105090000_p1529_mastermind_flow_registration.sql (each function below, same signature).
--
-- 1. A host could link any event as the "previous session" and read its pairs. Now both ends must be the host's.
-- 2. `flow` was guarded but `series_slug` was not, and authenticated hosts hold UPDATE on it (read from
--    information_schema on TEST): the effective flow is what is frozen now, on every path.
-- 3. A direct UPDATE did not take the round lock and could race round 1 starting. The trigger takes it.
-- 4. Switching to the mastermind kept seats that never answered or accepted recording. Refused, with the count.
-- 5. The host was listed as a participant in get_mastermind_host_state, and counted in register_for_event's cap.
-- 6. Canvas opens had no way in: record_event_canvas_open.

BEGIN;

CREATE OR REPLACE FUNCTION public._event_flow_of(p_flow text, p_series text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(p_flow, CASE WHEN p_series IN ('social-hike', 'sales-mastermind') THEN p_series END, 'clarity-night');
$$;
REVOKE ALL ON FUNCTION public._event_flow_of(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._events_flow_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new text := public._event_flow_of(NEW.flow, NEW.series_slug);
  v_unanswered integer;
BEGIN
  IF v_new = public._event_flow_of(OLD.flow, OLD.series_slug) THEN
    RETURN NEW;
  END IF;
  -- The lock host_start_round holds: a change and round 1 cannot pass each other.
  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || NEW.id::text, 0));
  IF public._event_counted_round_started(NEW.id) THEN
    RAISE EXCEPTION 'the event flow is fixed once round 1 has started' USING ERRCODE = '22023';
  END IF;
  IF v_new = 'sales-mastermind' THEN
    SELECT count(*) INTO v_unanswered
      FROM public.event_rsvps r
     WHERE r.event_id = NEW.id
       AND NOT EXISTS (SELECT 1 FROM public.event_registration_answers a
                        WHERE a.event_id = r.event_id AND a.profile_id = r.profile_id);
    IF v_unanswered > 0 THEN
      RAISE EXCEPTION '% registered people have not answered this flow''s questions or accepted recording', v_unanswered
        USING ERRCODE = '22023', HINT = 'unanswered_registrations';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._events_flow_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS events_flow_guard ON public.events;
CREATE TRIGGER events_flow_guard BEFORE UPDATE OF flow, series_slug ON public.events
  FOR EACH ROW EXECUTE FUNCTION public._events_flow_guard();

-- A linked session must be this event's host's own, however the column is written.
CREATE OR REPLACE FUNCTION public._events_previous_session_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.previous_session_event_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.events p
                      WHERE p.id = NEW.previous_session_event_id AND p.host_id = NEW.host_id AND p.id <> NEW.id) THEN
    RAISE EXCEPTION 'a linked session must be another event of the same host' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._events_previous_session_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS events_previous_session_guard ON public.events;
CREATE TRIGGER events_previous_session_guard BEFORE INSERT OR UPDATE OF previous_session_event_id, host_id ON public.events
  FOR EACH ROW EXECUTE FUNCTION public._events_previous_session_guard();

-- Checked again at read time: a host_id change on either event must not reopen another host's pairs.
CREATE OR REPLACE FUNCTION public.get_previous_session_partners(p_event uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_prev uuid;
BEGIN
  SELECT e.previous_session_event_id INTO v_prev FROM public.events e WHERE e.id = p_event AND e.host_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'host only' USING ERRCODE = '42501';
  END IF;
  IF v_prev IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events p WHERE p.id = v_prev AND p.host_id = v_uid) THEN
    RAISE EXCEPTION 'host only' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_array(ma.profile_id, mb.profile_id))
      FROM public.event_rounds r
      JOIN public.event_round_seats a ON a.round_id = r.id AND a.role = 'first'
      JOIN public.event_round_seats b ON b.round_id = r.id AND b.role = 'second' AND b.table_no = a.table_no
      JOIN public.event_room_members ma ON ma.id = a.room_member_id
      JOIN public.event_room_members mb ON mb.id = b.room_member_id
     WHERE r.event_id = v_prev AND NOT COALESCE(r.showcase, false)
       AND ma.profile_id IS NOT NULL AND mb.profile_id IS NOT NULL
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.get_previous_session_partners(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_previous_session_partners(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.register_for_event(
  p_slug text, p_participation text, p_phone text, p_hope text, p_recording_accepted boolean)
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
    RAISE EXCEPTION 'sign in to register' USING ERRCODE = '42501';
  END IF;
  IF p_recording_accepted IS NOT TRUE THEN
    RAISE EXCEPTION 'accepting transcription is a condition of this event' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_event FROM public.events e WHERE e.slug = p_slug FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_event.status = 'cancelled' THEN
    RETURN 'cancelled';
  END IF;
  v_already := EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = v_event.id AND r.profile_id = v_uid);
  -- The host is not an attendee in any count (the column's own comment, decisions.md 2026-09-22).
  IF NOT v_already AND v_event.max_attendees IS NOT NULL
     AND (SELECT count(*) FROM public.event_rsvps r
           WHERE r.event_id = v_event.id AND r.profile_id <> v_event.host_id) >= v_event.max_attendees THEN
    RETURN 'full';
  END IF;

  INSERT INTO public.event_registration_answers AS a
    (event_id, profile_id, participation, phone, hope, recording_accepted_at)
  VALUES (v_event.id, v_uid, p_participation, p_phone, NULLIF(btrim(COALESCE(p_hope, '')), ''), now())
  ON CONFLICT (event_id, profile_id) DO UPDATE
    SET participation = EXCLUDED.participation, phone = EXCLUDED.phone, hope = EXCLUDED.hope,
        recording_accepted_at = EXCLUDED.recording_accepted_at, updated_at = now();

  IF v_already THEN
    RETURN 'already';
  END IF;
  INSERT INTO public.event_rsvps (event_id, profile_id) VALUES (v_event.id, v_uid);
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.register_for_event(text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_for_event(text, text, text, text, boolean) TO authenticated;

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
             'canvas_shared', public._event_canvas_shared(p_event, p.profile_id),
             'observer_override', (SELECT o.is_observer FROM public.event_observer_overrides o
                                    WHERE o.event_id = p_event AND o.profile_id = p.profile_id),
             'participation', a.participation,
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
      ) p
      LEFT JOIN public.event_registration_answers a ON a.event_id = p_event AND a.profile_id = p.profile_id
     WHERE p.profile_id <> v_host
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.get_mastermind_host_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_mastermind_host_state(uuid) TO authenticated;

-- Evidence: only someone actually seated at the owner's table in that round can record an open.
CREATE OR REPLACE FUNCTION public.record_event_canvas_open(p_round uuid, p_owner uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event uuid;
  v_canvas uuid;
  v_version uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  SELECT r.event_id INTO v_event
    FROM public.event_rounds r
    JOIN public.event_round_seats me ON me.round_id = r.id
    JOIN public.event_room_members mm ON mm.id = me.room_member_id AND mm.profile_id = v_uid
    JOIN public.event_round_seats os ON os.round_id = r.id AND os.table_no = me.table_no AND os.role = 'first'
    JOIN public.event_room_members om ON om.id = os.room_member_id AND om.profile_id = p_owner
   WHERE r.id = p_round;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not at this table' USING ERRCODE = '42501';
  END IF;
  SELECT ec.canvas_id INTO v_canvas FROM public.event_canvases ec WHERE ec.event_id = v_event AND ec.profile_id = p_owner;
  SELECT v.id INTO v_version FROM public.canvas_versions v WHERE v.canvas_id = v_canvas ORDER BY v.created_at DESC, v.id LIMIT 1;
  INSERT INTO public.event_canvas_opens (event_id, round_id, owner_id, reader_id, version_id)
  VALUES (v_event, p_round, p_owner, v_uid, v_version);
END;
$$;
REVOKE ALL ON FUNCTION public.record_event_canvas_open(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_event_canvas_open(uuid, uuid) TO authenticated;

COMMIT;
