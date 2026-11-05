-- P1529 D24: registration asks how a person wants to join, then where they will prepare. The second answer of an observer is
-- stored, so the host can count who comes at the doors time.
--
-- client-safe: one new nullable column; register_for_event gains one trailing parameter with a default and refuses an observer
-- who did not answer where they will prepare (an observer's second answer is the only one `participation` cannot carry: an
-- improving business already says it through canvas_before / canvas_at_doors). The old five-argument function is dropped, so a
-- call without the second answer can no longer slip past the required one.
-- diffed against: 20261105200000_p1529_review_fixes_2.sql (register_for_event; limit counting, flow check and answers upsert are
--   unchanged), 20261105190000_p1529_review_fixes.sql (get_mastermind_host_state; the host stays out of the list).

BEGIN;

ALTER TABLE public.event_registration_answers
  ADD COLUMN IF NOT EXISTS observer_prep text CHECK (observer_prep IS NULL OR observer_prep IN ('home', 'doors'));
ALTER TABLE public.event_registration_answers
  DROP CONSTRAINT IF EXISTS event_registration_answers_observer_prep_observers_only;
ALTER TABLE public.event_registration_answers
  ADD CONSTRAINT event_registration_answers_observer_prep_observers_only
  CHECK (observer_prep IS NULL OR participation = 'observer');
COMMENT ON COLUMN public.event_registration_answers.observer_prep IS
  'P1529 D24: where an observer will prepare (home = before the event, doors = at the event, at the doors time). NULL for everyone else and for answers given before this column existed.';

DROP FUNCTION IF EXISTS public.register_for_event(text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.register_for_event(
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
    RAISE EXCEPTION 'sign in to register' USING ERRCODE = '42501';
  END IF;
  IF p_recording_accepted IS NOT TRUE THEN
    RAISE EXCEPTION 'accepting transcription is a condition of this event' USING ERRCODE = '22023';
  END IF;
  IF p_participation = 'observer' AND p_observer_prep IS NULL THEN
    RAISE EXCEPTION 'choose where you will prepare' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_event FROM public.events e WHERE e.slug = p_slug FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF public._event_flow(v_event.id) <> 'sales-mastermind' THEN
    RAISE EXCEPTION 'this event does not ask questions' USING ERRCODE = '22023';
  END IF;
  IF v_event.status = 'cancelled' THEN
    RETURN 'cancelled';
  END IF;
  v_already := EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = v_event.id AND r.profile_id = v_uid);
  IF NOT v_already AND v_event.max_attendees IS NOT NULL
     AND (SELECT count(*) FROM public.event_rsvps r
           WHERE r.event_id = v_event.id AND r.profile_id IS DISTINCT FROM v_event.host_id) >= v_event.max_attendees THEN
    RETURN 'full';
  END IF;

  -- The CHECKs reject an unknown participation, phone or prep value (nothing is saved).
  INSERT INTO public.event_registration_answers AS a
    (event_id, profile_id, participation, observer_prep, phone, hope, recording_accepted_at)
  VALUES (v_event.id, v_uid, p_participation,
          CASE WHEN p_participation = 'observer' THEN p_observer_prep END,
          p_phone, NULLIF(btrim(COALESCE(p_hope, '')), ''), now())
  ON CONFLICT (event_id, profile_id) DO UPDATE
    SET participation = EXCLUDED.participation, observer_prep = EXCLUDED.observer_prep, phone = EXCLUDED.phone,
        hope = EXCLUDED.hope, recording_accepted_at = EXCLUDED.recording_accepted_at, updated_at = now();

  IF v_already THEN
    RETURN 'already';
  END IF;
  INSERT INTO public.event_rsvps (event_id, profile_id) VALUES (v_event.id, v_uid);
  -- A place replaces a waiting-list entry; the person is not on both.
  DELETE FROM public.event_waitlist w WHERE w.event_id = v_event.id AND w.profile_id = v_uid;
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.register_for_event(text, text, text, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_for_event(text, text, text, text, boolean, text) TO authenticated;

-- The host's per-person state gains `registered` (an RSVP exists: the seat guard's test) and `observer_prep`.
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
             'observer_prep', a.observer_prep,
             'registered', EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = p_event AND r.profile_id = p.profile_id),
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

COMMIT;
