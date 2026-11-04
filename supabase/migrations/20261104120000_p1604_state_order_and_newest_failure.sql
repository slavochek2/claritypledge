-- Migration: P1604 (8/8) — Gemini review of the transcript states: an open clean job beats older text; a chat shows only the newest failure
-- Created: 2026-11-04
-- Spec: features/p1604_transcription_belongs_to_a_chat.md (founder live test, 2026-11-04)
-- Guaranteed by: e2e/integration/p1604-transcription-states.spec.ts
--
-- diffed against: 20261104110000_p1604_transcription_states.sql (same signatures, return types and grants):
--   _transcribe_room_state          the ORDER of the checks changes. Before: any text (clean OR older pass) -> ready, so once the older
--                                   pass had written its text a still-open clean job read "ready" and the chat dropped its waiting line
--                                   before the thread arrived. Now: clean text -> ready; else an open clean job I am a seat of (inside
--                                   its 3-hour bound) -> processing; else older text -> ready; else an open older-pass job -> processing;
--                                   else failed / none as before. A clean job past its bound no longer holds older text hostage.
--   get_chat_transcription_processing  a session still processing is always listed (its thread has not arrived); a FAILED session is
--                                   listed only when it is the caller's newest ended session here. An older failure behind a newer
--                                   success used to keep "couldn't be prepared" on the chat for 24 hours.
--
-- client-safe: function bodies only; signatures and grants unchanged and restated.

CREATE OR REPLACE FUNCTION public._transcribe_room_state(p_room uuid, p_profile uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_bound CONSTANT interval := interval '3 hours';
  v_member uuid;
  v_ended  timestamptz;
BEGIN
  SELECT m.id INTO v_member FROM public.transcribe_room_members m WHERE m.room_id = p_room AND m.profile_id = p_profile;
  IF v_member IS NULL THEN
    RETURN 'none';
  END IF;
  SELECT r.ended_at INTO v_ended FROM public.transcribe_rooms r WHERE r.id = p_room;
  IF v_ended IS NULL THEN
    RETURN 'none';                                   -- still live
  END IF;

  -- 1. clean text has arrived: the thread is there
  IF EXISTS (SELECT 1 FROM public.transcribe_clean_texts t
               JOIN public.transcribe_round_clean_jobs j ON j.id = t.job_id
              WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(j.seats) s WHERE s ->> 'member_id' = v_member::text)) THEN
    RETURN 'ready';
  END IF;

  -- 2. a clean job I am a seat of is still open (and inside its bound): the thread has NOT arrived, whatever the older pass has
  --    already written. Without this the chat dropped its waiting line as soon as the older text landed.
  IF EXISTS (SELECT 1 FROM public.transcribe_round_clean_jobs j
              WHERE j.status IN ('pending', 'processing') AND j.created_at > now() - c_bound
                AND EXISTS (SELECT 1 FROM jsonb_array_elements(j.seats) s WHERE s ->> 'member_id' = v_member::text)
                AND (j.room_id = p_room OR EXISTS (SELECT 1 FROM jsonb_array_elements(j.seats) s
                                                    WHERE s ->> 'member_id' = v_member::text AND (s ->> 'room_id')::uuid = p_room))) THEN
    RETURN 'processing';
  END IF;

  -- 3. the older pass wrote text and no clean job is waiting
  IF EXISTS (SELECT 1 FROM public.transcribe_room_transcripts x WHERE x.room_id = p_room AND jsonb_array_length(x.segments) > 0) THEN
    RETURN 'ready';
  END IF;

  -- 4. the older pass is still working
  IF EXISTS (SELECT 1 FROM public.transcribe_room_transcription_jobs o
              WHERE o.room_id = p_room AND o.member_id = v_member
                AND o.status IN ('pending', 'processing') AND o.created_at > now() - c_bound) THEN
    RETURN 'processing';
  END IF;

  IF EXISTS (SELECT 1 FROM public.transcribe_round_clean_jobs j
              WHERE (j.status = 'failed' OR (j.status IN ('pending', 'processing') AND j.created_at <= now() - c_bound))
                AND EXISTS (SELECT 1 FROM jsonb_array_elements(j.seats) s WHERE s ->> 'member_id' = v_member::text)
                AND (j.room_id = p_room OR EXISTS (SELECT 1 FROM jsonb_array_elements(j.seats) s
                                                    WHERE s ->> 'member_id' = v_member::text AND (s ->> 'room_id')::uuid = p_room)))
     OR EXISTS (SELECT 1 FROM public.transcribe_room_transcription_jobs o
                 WHERE o.room_id = p_room AND o.member_id = v_member
                   AND (o.status = 'failed' OR (o.status IN ('pending', 'processing') AND o.created_at <= now() - c_bound))) THEN
    RETURN 'failed';
  END IF;
  RETURN 'none';
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_room_state(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_chat_transcription_processing(p_conversation_id uuid)
RETURNS TABLE (room_id uuid, state text, ended_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH mine AS (
    SELECT r.id AS room_id, r.ended_at, public._transcribe_room_state(r.id, auth.uid()) AS state
      FROM public.transcribe_rooms r
      JOIN public.chat_conversations c ON c.id = p_conversation_id AND c.kind <> 'mirror'
     WHERE auth.uid() IS NOT NULL
       AND public._chat_access_since(c.id, auth.uid()) IS NOT NULL
       AND (r.conversation_id = c.id OR (c.event_id IS NOT NULL AND r.event_id = c.event_id))
       AND r.ended_at IS NOT NULL AND r.ended_at > now() - interval '24 hours'
       AND EXISTS (SELECT 1 FROM public.transcribe_room_members m WHERE m.room_id = r.id AND m.profile_id = auth.uid())
  )
  SELECT s.room_id, s.state, s.ended_at
    FROM mine s
   -- processing: always (the thread has not arrived). failed: only the NEWEST session's; an older failure behind a newer
   -- success is history, not news.
   WHERE s.state = 'processing'
      OR (s.state = 'failed' AND s.ended_at = (SELECT max(t.ended_at) FROM mine t))
   ORDER BY s.ended_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_chat_transcription_processing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_transcription_processing(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public._transcribe_room_state(uuid, uuid) FROM PUBLIC, anon, authenticated;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public._transcribe_room_state(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._transcribe_room_state(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1604: _transcribe_room_state is client-callable';
  END IF;
  IF has_function_privilege('anon', 'public.get_chat_transcription_processing(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_chat_transcription_processing(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1604: get_chat_transcription_processing grants are wrong';
  END IF;
END
$check$;
