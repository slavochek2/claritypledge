-- Migration: P1604 (4/4) — decision 4: a session whose audio did not all arrive says so
-- Created: 2026-11-03
-- Spec: features/p1604_transcription_belongs_to_a_chat.md (Resolved Decision 4: "Audio that arrives later than that is lost
--   and the text is marked incomplete")
-- Guaranteed by: e2e/integration/20261103090000_p1604_transcription_belongs_to_a_chat.spec.ts,
--   services/transcribe-room-batch/tests/test_p1604_incomplete.py
--
-- diffed against:
--   post_clean_round         20261103090200_p1604_transcription_belongs_to_a_chat_clean.sql (same body; gains p_incomplete uuid[]
--                            DEFAULT '{}', stored on the job before any line is posted, and a retry adds the mark to an
--                            existing session root). The 4-argument form is DROPPED: with both, a call naming four parameters
--                            matches two functions (PGRST203). Its only caller is the Cloud Run worker (service role), whose
--                            deployed version still calls with four and works unchanged against the new default.
--   _post_clean_round_item   20261103090200_p1604_transcription_belongs_to_a_chat_clean.sql (same body; a session root made
--                            while the job names an incomplete speaker ends its body in "|i")
--   get_my_clean_transcript  20261103090200_p1604_transcription_belongs_to_a_chat_clean.sql (same body and grants; RETURNS TABLE
--                            gains incomplete, so it is DROPPED first)
--
-- WHO IS INCOMPLETE is decided by the worker (services/transcribe-room-batch/incomplete.py): a speaker whose last archived audio
--   ends more than a minute before their own capture ended, capped at the cleaned window. Only for room jobs that post
--   everyone they compare (no one sat at a table for part of the window).
--
-- client-safe: service role only for post_clean_round (EXECUTE revoked from PUBLIC, anon and authenticated); the one client RPC,
--   get_my_clean_transcript, gains a trailing column and keeps its grants.

ALTER TABLE public.transcribe_round_clean_jobs
  ADD COLUMN IF NOT EXISTS incomplete_member_ids uuid[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.transcribe_round_clean_jobs.incomplete_member_ids IS
  'P1604 decision 4: transcribe_room_members ids whose audio stopped short of their own stop. Ids only. Set by post_clean_round.';

DROP FUNCTION IF EXISTS public.post_clean_round(uuid, integer, jsonb, boolean);

CREATE OR REPLACE FUNCTION public.post_clean_round(p_job_id uuid, p_attempt integer, p_items jsonb, p_partial boolean DEFAULT false,
  p_incomplete uuid[] DEFAULT '{}')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job    public.transcribe_round_clean_jobs;
  v_p      uuid;
  v_i      record;
  v_n      integer := 0;
  v_thread uuid;
BEGIN
  SELECT j.* INTO v_job FROM public.transcribe_round_clean_jobs j WHERE j.id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'processing' OR v_job.attempts IS DISTINCT FROM p_attempt THEN
    RAISE EXCEPTION 'clean post: stale or unclaimed job' USING ERRCODE = '22023';
  END IF;
  IF NOT public._transcribe_clean_enabled() THEN
    RAISE EXCEPTION 'clean post: posting is switched off' USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'clean post: items must be an array' USING ERRCODE = '22023';
  END IF;

  -- all speaker locks first, in profile-id order (see LOCK ORDER in 20261101140000)
  FOR v_p IN
    SELECT DISTINCT m.profile_id
      FROM jsonb_array_elements(p_items) it
      JOIN public.transcribe_room_members m ON m.id = (it ->> 'member_id')::uuid
     WHERE m.profile_id IS NOT NULL
     ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('p1592:speaker:' || v_p::text, 0));
  END LOOP;

  -- P1604 decision 4: named before any line is posted, so a session root made below carries the mark.
  UPDATE public.transcribe_round_clean_jobs j
     SET incomplete_member_ids = COALESCE(p_incomplete, '{}')
   WHERE j.id = p_job_id;
  v_job.incomplete_member_ids := COALESCE(p_incomplete, '{}');

  -- P1604 Decision 7: the cleaned text is kept per job for session history, whether or not a line reaches a chat. Only
  -- speakers in the job's seat snapshot; idempotent per (job, speaker, chunk) like the posts.
  INSERT INTO public.transcribe_clean_texts (job_id, member_id, chunk_ms, text)
  SELECT p_job_id, (it ->> 'member_id')::uuid, (it ->> 'chunk_ms')::bigint, btrim(it ->> 'text')
    FROM jsonb_array_elements(p_items) it
   WHERE btrim(COALESCE(it ->> 'text', '')) <> ''
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_job.seats) s WHERE s ->> 'member_id' = it ->> 'member_id')
  ON CONFLICT (job_id, member_id, chunk_ms) DO NOTHING;

  FOR v_i IN
    SELECT (it ->> 'member_id')::uuid AS member_id, (it ->> 'chunk_ms')::bigint AS chunk_ms, it ->> 'text' AS txt
      FROM jsonb_array_elements(p_items) it
     ORDER BY (it ->> 'chunk_ms')::bigint, (it ->> 'member_id')
  LOOP
    IF public._post_clean_round_item(p_job_id, v_i.member_id, v_i.chunk_ms, v_i.txt) IS NOT NULL THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;

  -- A retry names someone the first attempt did not: the session root made then gets the mark too.
  IF cardinality(COALESCE(p_incomplete, '{}')) > 0 AND v_job.room_id IS NOT NULL THEN
    UPDATE public.chat_messages m SET body = m.body || '|i'
     WHERE m.id = (SELECT t.root_message_id FROM public.transcribe_session_threads t WHERE t.room_id = v_job.room_id)
       AND m.body LIKE 'session|%' AND m.body NOT LIKE '%|i';
  END IF;

  -- The note commits with the text. A retry that posts nothing new still lands here.
  IF p_partial AND v_job.kind = 'round' THEN
    SELECT t.id INTO v_thread FROM public.chat_round_threads t
     WHERE t.round_id = v_job.round_id AND t.table_no = v_job.table_no;
    IF v_thread IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('p1592:thread:' || v_job.round_id::text || ':' || v_job.table_no::text, 0));
      UPDATE public.chat_round_threads SET audio_missing = true WHERE id = v_thread;
      PERFORM public._transcribe_retitle_thread(v_thread);
    END IF;
  END IF;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.post_clean_round(uuid, integer, jsonb, boolean, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_clean_round(uuid, integer, jsonb, boolean, uuid[]) TO service_role;


CREATE OR REPLACE FUNCTION public._post_clean_round_item(
  p_job_id uuid, p_member_id uuid, p_chunk_ms bigint, p_text text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max CONSTANT integer := 4000;
  v_job     public.transcribe_round_clean_jobs;
  v_prior   uuid;
  v_speaker uuid;
  v_consent timestamptz;
  v_line    text;
  v_conv    uuid;
  v_since   timestamptz;
  v_round   public.event_rounds;
  v_thread  public.chat_round_threads;
  v_root    uuid;
  v_root_at timestamptz;
  v_root_del timestamptz;
  v_root_id uuid;
  v_msg     uuid;
  v_first   timestamptz;
  v_n_rounds integer;
  v_place   text;
  v_room    public.transcribe_rooms;
BEGIN
  -- The caller (post_clean_round) holds the job row FOR UPDATE and has checked the claim and the switch.
  SELECT j.* INTO v_job FROM public.transcribe_round_clean_jobs j WHERE j.id = p_job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clean post: job is gone' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_job.seats) s WHERE s ->> 'member_id' = p_member_id::text) THEN
    RAISE EXCEPTION 'clean post: member is not in the job snapshot' USING ERRCODE = '22023';
  END IF;

  SELECT p.chat_message_id INTO v_prior FROM public.transcribe_round_clean_posts p
   WHERE p.job_id = p_job_id AND p.member_id = p_member_id AND p.chunk_ms = p_chunk_ms;
  IF FOUND THEN
    RETURN v_prior;                              -- idempotent: never posted twice
  END IF;

  v_line := btrim(COALESCE(p_text, ''));
  IF v_line = '' THEN
    RETURN NULL;
  END IF;
  IF char_length(v_line) > c_max THEN
    v_line := regexp_replace(left(v_line, c_max), '\s+\S*$', '');
    IF v_line = '' THEN
      v_line := left(btrim(p_text), c_max);
    END IF;
  END IF;

  SELECT m.profile_id, m.consent_given_at INTO v_speaker, v_consent
    FROM public.transcribe_room_members m WHERE m.id = p_member_id;
  IF v_speaker IS NULL OR v_consent IS NULL THEN
    RETURN NULL;                                 -- no consent, or the account is gone
  END IF;
  -- Erasure of this speaker takes the same lock first (P1592): either we finish before it, or we find the account gone.
  PERFORM pg_advisory_xact_lock(hashtextextended('p1592:speaker:' || v_speaker::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_speaker) THEN
    RETURN NULL;
  END IF;

  IF v_job.event_id IS NOT NULL THEN
    SELECT c.id INTO v_conv FROM public.chat_conversations c WHERE c.kind = 'event' AND c.event_id = v_job.event_id;
    IF v_conv IS NULL THEN
      INSERT INTO public.chat_conversations (kind, event_id) VALUES ('event', v_job.event_id)
      ON CONFLICT (event_id) WHERE kind = 'event' DO NOTHING;
      SELECT c.id INTO v_conv FROM public.chat_conversations c WHERE c.kind = 'event' AND c.event_id = v_job.event_id;
    END IF;
    IF v_conv IS NULL THEN
      RAISE EXCEPTION 'clean post: event channel unavailable' USING ERRCODE = '42501';
    END IF;
  ELSE
    -- P1604: a chat's room has its chat; a plain room has none, and its words go to the history table only
    -- (post_clean_round has already written them there).
    v_conv := v_job.conversation_id;
    IF v_conv IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;
  v_since := public._chat_access_since(v_conv, v_speaker);
  IF v_since IS NULL THEN
    RETURN NULL;                                 -- words reach only readers of this channel
  END IF;

  v_root := NULL;
  v_n_rounds := 0;
  IF v_job.event_id IS NOT NULL THEN
    SELECT s.first_start, s.n INTO v_first, v_n_rounds FROM public._transcribe_event_round_span(v_job.event_id) s;
  END IF;
  IF v_job.kind = 'round' THEN
    SELECT er.* INTO v_round FROM public.event_rounds er WHERE er.id = v_job.round_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'clean post: round is gone' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(
      hashtextextended('p1592:thread:' || v_job.round_id::text || ':' || v_job.table_no::text, 0));
    SELECT t.* INTO v_thread FROM public.chat_round_threads t
     WHERE t.round_id = v_job.round_id AND t.table_no = v_job.table_no;
    IF NOT FOUND THEN
      INSERT INTO public.chat_messages (conversation_id, author_id, body, kind, system_kind, created_at)
      VALUES (v_conv, NULL, 'Round ' || v_round.round_no, 'message', 'round_thread',
              public._transcribe_root_time(v_job.event_id, v_round.started_at, v_round.round_no))
      RETURNING id INTO v_root_id;
      INSERT INTO public.chat_round_threads (event_id, round_id, table_no, conversation_id, root_message_id)
      VALUES (v_job.event_id, v_job.round_id, v_job.table_no, v_conv, v_root_id)
      ON CONFLICT (round_id, table_no) DO NOTHING
      RETURNING * INTO v_thread;
      IF NOT FOUND THEN
        DELETE FROM public.chat_messages WHERE id = v_root_id;
        SELECT t.* INTO v_thread FROM public.chat_round_threads t
         WHERE t.round_id = v_job.round_id AND t.table_no = v_job.table_no;
      ELSE
        UPDATE public.chat_conversations c SET last_message_at = clock_timestamp() WHERE c.id = v_conv;
      END IF;
    END IF;
    IF v_thread.conversation_id <> v_conv THEN
      RAISE EXCEPTION 'clean post: thread belongs to another conversation' USING ERRCODE = '22023';
    END IF;
    SELECT m.created_at, m.deleted_at INTO v_root_at, v_root_del
      FROM public.chat_messages m WHERE m.id = v_thread.root_message_id;
    IF NOT FOUND OR v_root_del IS NOT NULL THEN
      RAISE EXCEPTION 'clean post: round thread root is not available' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.chat_round_thread_members (thread_id, profile_id, display_name)
    SELECT v_thread.id, r.profile_id, r.display_name
      FROM public._transcribe_job_roster_locked(v_job.roster, v_job.event_id, v_thread.id, v_speaker) r
    ON CONFLICT (thread_id, profile_id) DO UPDATE SET display_name = EXCLUDED.display_name;
    PERFORM public._transcribe_retitle_thread(v_thread.id);
    IF v_since <= v_root_at THEN
      v_root := v_thread.root_message_id;
    END IF;
  ELSIF v_n_rounds = 0 THEN
    -- P1604 rule 6: a session outside rounds (a chat's room, or an event with no round at all) is ONE thread of its own,
    -- titled by the session's start. The root is made at the first post, i.e. after the session, so every reader who
    -- could read the chat then can read it and the chat shows it as new. Its body is "session|<start ISO>|<part_no>"; the
    -- client shows it as a date and time in the reader's time zone.
    PERFORM pg_advisory_xact_lock(hashtextextended('p1604:session:' || v_job.room_id::text, 0));
    SELECT t.root_message_id INTO v_root_id FROM public.transcribe_session_threads t WHERE t.room_id = v_job.room_id;
    IF v_root_id IS NULL THEN
      SELECT r.* INTO v_room FROM public.transcribe_rooms r WHERE r.id = v_job.room_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'clean post: room is gone' USING ERRCODE = '22023';
      END IF;
      INSERT INTO public.chat_messages (conversation_id, author_id, body, kind, system_kind, created_at)
      VALUES (v_conv, NULL,
              'session|' || to_char(v_room.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || '|' || v_room.part_no
                || CASE WHEN cardinality(v_job.incomplete_member_ids) > 0 THEN '|i' ELSE '' END,
              'message', 'outside_rounds', clock_timestamp())
      RETURNING id INTO v_root_id;
      INSERT INTO public.transcribe_session_threads (room_id, conversation_id, root_message_id)
      VALUES (v_job.room_id, v_conv, v_root_id);
      UPDATE public.chat_conversations c SET last_message_at = clock_timestamp() WHERE c.id = v_conv;
    END IF;
    SELECT m.created_at, m.deleted_at INTO v_root_at, v_root_del FROM public.chat_messages m WHERE m.id = v_root_id;
    IF NOT FOUND OR v_root_del IS NOT NULL THEN
      RAISE EXCEPTION 'clean post: session thread root is not available' USING ERRCODE = '42501';
    END IF;
    IF v_since <= v_root_at THEN
      v_root := v_root_id;
    END IF;
  ELSE
    -- room job (P1596 founder, solo test 2026-11-02): the words land in the thread of the TIME they were said, one thread
    -- per event and place, shared by every room of the event. before: said before round 1 (the "before" job, or a
    -- stretch of a room that ended before round 1); after: said once rounds had begun and not at a table (between rounds,
    -- after the last, or while sitting a round out); conversation: the event has no round at all.
    SELECT s.first_start, s.n INTO v_first, v_n_rounds FROM public._transcribe_event_round_span(v_job.event_id) s;
    v_place := CASE WHEN v_job.place = 'before' THEN 'before'
                    WHEN v_n_rounds = 0 THEN 'conversation'
                    WHEN to_timestamp(p_chunk_ms / 1000.0) < v_first THEN 'before'
                    ELSE 'after' END;
    PERFORM pg_advisory_xact_lock(hashtextextended('p1596:place:' || v_conv::text || ':' || v_place, 0));
    SELECT o.root_message_id INTO v_root_id FROM public.chat_outside_round_threads o
     WHERE o.conversation_id = v_conv AND o.place = v_place;
    IF v_root_id IS NULL THEN
      INSERT INTO public.chat_messages (conversation_id, author_id, body, kind, system_kind, created_at)
      VALUES (v_conv, NULL, public._transcribe_place_title(v_place), 'message', 'outside_rounds',
              public._transcribe_root_time(v_job.event_id,
                CASE v_place
                  WHEN 'before' THEN v_first - interval '1 second'
                  WHEN 'after' THEN COALESCE((SELECT greatest(max(er.started_at), max(er.ended_at))
                                                FROM public.event_rounds er WHERE er.event_id = v_job.event_id),
                                             clock_timestamp()) + interval '1 second'
                  ELSE clock_timestamp() END,
                CASE v_place WHEN 'before' THEN 0 WHEN 'after' THEN 100000 ELSE 0 END))
      RETURNING id INTO v_root_id;
      INSERT INTO public.chat_outside_round_threads (conversation_id, root_message_id, place)
      VALUES (v_conv, v_root_id, v_place);
      UPDATE public.chat_conversations c SET last_message_at = clock_timestamp() WHERE c.id = v_conv;
    END IF;
    SELECT m.created_at, m.deleted_at INTO v_root_at, v_root_del FROM public.chat_messages m WHERE m.id = v_root_id;
    IF NOT FOUND OR v_root_del IS NOT NULL THEN
      RAISE EXCEPTION 'clean post: outside-rounds root is not available' USING ERRCODE = '42501';
    END IF;
    IF v_since <= v_root_at THEN
      v_root := v_root_id;
    END IF;
  END IF;

  -- Never the channel's top level: a speaker who cannot read this thread's root gets no post (founder, P1592 D1).
  IF v_root IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM public._transcribe_lock_place(v_conv, v_root);
  INSERT INTO public.chat_messages (conversation_id, author_id, body, kind, thread_root_id, is_transcription, created_at)
  VALUES (v_conv, v_speaker, v_line, 'message', v_root, true, clock_timestamp())
  RETURNING id INTO v_msg;
  INSERT INTO public.transcribe_round_clean_posts (job_id, member_id, chunk_ms, chat_message_id)
  VALUES (p_job_id, p_member_id, p_chunk_ms, v_msg);
  RETURN v_msg;
END;
$$;
REVOKE ALL ON FUNCTION public._post_clean_round_item(uuid, uuid, bigint, text) FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_my_clean_transcript(uuid);

CREATE OR REPLACE FUNCTION public.get_my_clean_transcript(p_room_id uuid)
RETURNS TABLE (job_id uuid, member_id uuid, display_name text, chunk_ms bigint, text text, incomplete boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.job_id, t.member_id, tm.display_name, t.chunk_ms, t.text, t.member_id = ANY (j.incomplete_member_ids)
    FROM public.transcribe_room_members me
    JOIN public.transcribe_round_clean_jobs j
      ON EXISTS (SELECT 1 FROM jsonb_array_elements(j.seats) s WHERE s ->> 'member_id' = me.id::text)
    JOIN public.transcribe_clean_texts t ON t.job_id = j.id
    JOIN public.transcribe_room_members tm ON tm.id = t.member_id
   WHERE me.room_id = p_room_id AND me.profile_id = auth.uid() AND auth.uid() IS NOT NULL
   ORDER BY t.chunk_ms, t.member_id;
$$;
COMMENT ON FUNCTION public.get_my_clean_transcript(uuid) IS
  'P1604 Decision 7: the cleaned text of every clean job the CALLER was a seat of in this room. Never another table''s words. '
  'incomplete: that speaker''s audio did not all arrive (decision 4).';
REVOKE ALL ON FUNCTION public.get_my_clean_transcript(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_clean_transcript(uuid) TO authenticated;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.post_clean_round(uuid, integer, jsonb, boolean, uuid[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.post_clean_round(uuid, integer, jsonb, boolean, uuid[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public._post_clean_round_item(uuid, uuid, bigint, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._post_clean_round_item(uuid, uuid, bigint, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1604: a posting function is client-callable';
  END IF;
  IF has_function_privilege('anon', 'public.get_my_clean_transcript(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_my_clean_transcript(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1604: get_my_clean_transcript grants are wrong';
  END IF;
END
$check$;
