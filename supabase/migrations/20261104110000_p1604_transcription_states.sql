-- Migration: P1604 (7/7) — what state is my transcript in? (processing / ready / failed / none), member-scoped
-- Created: 2026-11-04
-- Spec: features/p1604_transcription_belongs_to_a_chat.md (founder live test, 2026-11-04: after Stop, people must see that the
--   text is coming, in the chat and in session history)
-- Guaranteed by: e2e/integration/p1604-transcription-states.spec.ts
--
-- diffed against: nothing is redefined. New functions only: _transcribe_room_state, _transcribe_chat_name,
--   get_my_room_transcription_states, get_chat_transcription_processing. No table, column or policy changes.
--
-- DERIVED, NOT STORED. The state comes from rows that already exist:
--   ready       the caller has cleaned text for the room (a clean job they were a seat of wrote transcribe_clean_texts) or the
--               older pass wrote a non-empty transcript for it. "Text has arrived": the processing line clears itself.
--   processing  otherwise, a clean job they were a seat of, or their older-pass job, is pending/processing and younger than
--               3 hours (the longest run is about 50 minutes; see services/transcribe-room-batch/config.py).
--   failed      otherwise, such a job failed, OR is still pending/processing after 3 hours (a bounded wait: it never reads as
--               processing forever).
--   none        otherwise: no job (the clean pass is switched off, or nobody spoke), or the room is still live.
--   Processing beats failed when both exist (the clean job may still arrive after the older pass failed).
-- MEMBER-SCOPED: every function reads auth.uid()'s own seats only. A stranger, or a chat's member who was not in the room, gets
--   'none' / no rows, so the existence of a session is not revealed to people who were not in it.
--
-- client-safe: additive. Both client functions revoke anon and PUBLIC; the internal ones are revoked from clients.

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

  IF EXISTS (SELECT 1 FROM public.transcribe_clean_texts t
               JOIN public.transcribe_round_clean_jobs j ON j.id = t.job_id
              WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(j.seats) s WHERE s ->> 'member_id' = v_member::text))
     OR EXISTS (SELECT 1 FROM public.transcribe_room_transcripts x WHERE x.room_id = p_room AND jsonb_array_length(x.segments) > 0) THEN
    RETURN 'ready';
  END IF;

  IF EXISTS (SELECT 1 FROM public.transcribe_round_clean_jobs j
              WHERE j.status IN ('pending', 'processing') AND j.created_at > now() - c_bound
                AND EXISTS (SELECT 1 FROM jsonb_array_elements(j.seats) s WHERE s ->> 'member_id' = v_member::text)
                AND (j.room_id = p_room OR EXISTS (SELECT 1 FROM jsonb_array_elements(j.seats) s
                                                    WHERE s ->> 'member_id' = v_member::text AND (s ->> 'room_id')::uuid = p_room)))
     OR EXISTS (SELECT 1 FROM public.transcribe_room_transcription_jobs o
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

-- A chat's name for the caller, the way the chat list titles it: the other person of a DM, the group's name, the event's title.
CREATE OR REPLACE FUNCTION public._transcribe_chat_name(p_conversation uuid, p_event uuid, p_uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT CASE c.kind
              WHEN 'dm' THEN (SELECT p.name FROM public.profiles p
                               WHERE p.id = CASE WHEN c.dm_user_a = p_uid THEN c.dm_user_b ELSE c.dm_user_a END)
              WHEN 'group' THEN (SELECT o.name FROM public.organization o WHERE o.id = c.org_id)
              WHEN 'event' THEN (SELECT e.title FROM public.events e WHERE e.id = c.event_id)
            END
       FROM public.chat_conversations c WHERE c.id = p_conversation AND c.kind <> 'mirror'),
    (SELECT e.title FROM public.events e WHERE e.id = p_event));
$$;
REVOKE ALL ON FUNCTION public._transcribe_chat_name(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Session history: the state and the chat's name for each of MY rooms.
CREATE OR REPLACE FUNCTION public.get_my_room_transcription_states(p_room_ids uuid[])
RETURNS TABLE (room_id uuid, state text, chat_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT r.id,
         public._transcribe_room_state(r.id, auth.uid()),
         public._transcribe_chat_name(r.conversation_id, r.event_id, auth.uid())
    FROM public.transcribe_rooms r
   WHERE auth.uid() IS NOT NULL
     AND r.id = ANY (p_room_ids)
     AND EXISTS (SELECT 1 FROM public.transcribe_room_members m WHERE m.room_id = r.id AND m.profile_id = auth.uid());
$$;
COMMENT ON FUNCTION public.get_my_room_transcription_states(uuid[]) IS
  'P1604: for each of the caller''s OWN rooms in the list: processing | ready | failed | none, derived from the clean and older-pass '
  'jobs and the text that exists, and the chat''s name. Rooms the caller was not in are not returned.';
REVOKE ALL ON FUNCTION public.get_my_room_transcription_states(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_room_transcription_states(uuid[]) TO authenticated;

-- A chat: the caller's recent sessions here whose text is still coming (or could not be prepared). The line "where the thread will
-- appear". Only rooms the caller was in, ended within the last 24 hours.
CREATE OR REPLACE FUNCTION public.get_chat_transcription_processing(p_conversation_id uuid)
RETURNS TABLE (room_id uuid, state text, ended_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.room_id, s.state, s.ended_at
    FROM (SELECT r.id AS room_id, r.ended_at, public._transcribe_room_state(r.id, auth.uid()) AS state
            FROM public.transcribe_rooms r
            JOIN public.chat_conversations c ON c.id = p_conversation_id AND c.kind <> 'mirror'
           WHERE auth.uid() IS NOT NULL
             AND public._chat_access_since(c.id, auth.uid()) IS NOT NULL
             AND (r.conversation_id = c.id OR (c.event_id IS NOT NULL AND r.event_id = c.event_id))
             AND r.ended_at IS NOT NULL AND r.ended_at > now() - interval '24 hours'
             AND EXISTS (SELECT 1 FROM public.transcribe_room_members m WHERE m.room_id = r.id AND m.profile_id = auth.uid())) s
   WHERE s.state IN ('processing', 'failed')
   ORDER BY s.ended_at DESC;
$$;
COMMENT ON FUNCTION public.get_chat_transcription_processing(uuid) IS
  'P1604: the caller''s own sessions in this chat, ended in the last 24 hours, whose transcript is still processing or failed. '
  'Nothing for a chat the caller cannot read or a room they were not in.';
REVOKE ALL ON FUNCTION public.get_chat_transcription_processing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_transcription_processing(uuid) TO authenticated;

DO $check$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public._transcribe_room_state(uuid, uuid)', 'public._transcribe_chat_name(uuid, uuid, uuid)']
  LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1604: % is client-callable', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY['public.get_my_room_transcription_states(uuid[])', 'public.get_chat_transcription_processing(uuid)']
  LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1604: client grants on % are wrong', v_fn;
    END IF;
  END LOOP;
END
$check$;
