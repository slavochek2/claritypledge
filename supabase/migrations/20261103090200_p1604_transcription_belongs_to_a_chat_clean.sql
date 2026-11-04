-- Migration: P1604 (3/3) — the clean pass for chat sessions and plain rooms; clean text kept per job; one thread per session
-- Created: 2026-11-03
-- Spec: features/p1604_transcription_belongs_to_a_chat.md (rules 3, 4, 6; Resolved Decisions 4, 6, 7)
-- Guaranteed by: e2e/integration/20261103090000_p1604_transcription_belongs_to_a_chat.spec.ts
--
-- diffed against:
--   _transcribe_room_end_segments 20261102170000_p1596_open_round_at_room_end.sql (same body; a room with NO event is one segment
--                                 of every consenting mic)
--   _transcribe_room_end_job      20261102133000_p1596_threads_in_time_order.sql (same body; the job waits 2 minutes after the room
--                                 ended, not 40 seconds; place 'session' when there is no event; carries conversation_id; the
--                                 trigger no longer requires an event)
--   _post_clean_round_item        20261102143000_p1596_thread_roots_in_time_order.sql (same body; the channel is the job's
--                                 conversation when there is no event; no chat => nothing posted; an event with no round, or a chat's
--                                 room, posts into the room's own session thread instead of the shared "The conversation" row)
--   post_clean_round              20261102110000_p1596_partial_flag_lock.sql (same body; every item is also written to
--                                 transcribe_clean_texts, posted or not)
--
-- THE KILL SWITCH STILL GATES EVERYTHING HERE. _transcribe_room_end_job returns at once when _transcribe_clean_enabled() is
--   false, post_clean_round refuses, and the job floor trigger (20261102193000) still drops a job whose window began before
--   posting was switched on. Plain /transcribe rooms and chat rooms therefore get a clean pass only while the switch is on;
--   with it off, history shows the older text.
--
-- DECISIONS
--   * Consent, erasure and access are unchanged: a job snapshots only members with consent_given_at; the post RPC re-checks the
--     member, the account and the reader's access to the root; the speaker lock is taken before the thread lock.
--   * The session root is made at the FIRST POST (after the session), stamped with the post time. A reader sees the thread only
--     if the chat gave them access before that moment, exactly as for any other post.
--   * get_my_clean_transcript returns ONLY jobs whose seat snapshot contains the caller's member row for that room, so history
--     never shows another table's words.
--
-- client-safe: no client-callable function is changed. get_my_clean_transcript is new (authenticated, anon revoked).


-- ============================================================================
-- 1. Room segments for a room with no event
-- ============================================================================
CREATE OR REPLACE FUNCTION public._transcribe_room_end_segments(p_room uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_room  public.transcribe_rooms;
  v_all   uuid[];
  v_bound timestamptz[];
  v_out   jsonb := '[]'::jsonb;
  v_a     timestamptz;
  v_b     timestamptz;
  v_seat  uuid[];
  v_ids   uuid[];
  v_r     record;
  v_floor timestamptz;
  i       integer;
BEGIN
  SELECT r.* INTO v_room FROM public.transcribe_rooms r WHERE r.id = p_room;
  IF NOT FOUND OR v_room.ended_at IS NULL THEN
    RETURN v_out;
  END IF;
  SELECT COALESCE(array_agg(m.id ORDER BY m.id), '{}') INTO v_all
    FROM public.transcribe_room_members m
   WHERE m.room_id = p_room AND m.consent_given_at IS NOT NULL AND m.profile_id IS NOT NULL;
  IF cardinality(v_all) = 0 THEN
    RETURN v_out;
  END IF;
  -- P1604: a room with no event (a chat's room, a plain room) has no rounds: its whole stretch is one segment, every
  -- consenting mic compared and posted.
  IF v_room.event_id IS NULL THEN
    RETURN jsonb_build_array(jsonb_build_object('start', v_room.created_at, 'end', v_room.ended_at,
             'member_ids', to_jsonb(v_all), 'compare_ids', to_jsonb(v_all)));
  END IF;

  SELECT array_agg(DISTINCT t ORDER BY t) INTO v_bound FROM (
    SELECT v_room.created_at AS t
    UNION SELECT v_room.ended_at
    UNION SELECT greatest(er.started_at, v_room.created_at) FROM public.event_rounds er
           WHERE er.event_id = v_room.event_id
             AND er.started_at < v_room.ended_at AND coalesce(er.ended_at, v_room.ended_at) > v_room.created_at
    UNION SELECT least(coalesce(er.ended_at, v_room.ended_at), v_room.ended_at) FROM public.event_rounds er
           WHERE er.event_id = v_room.event_id
             AND er.started_at < v_room.ended_at AND coalesce(er.ended_at, v_room.ended_at) > v_room.created_at
  ) b;

  -- a "before" job for this room already owns everything up to its window end (round 1's start)
  SELECT j.window_end INTO v_floor FROM public.transcribe_round_clean_jobs j
   WHERE j.kind = 'room' AND j.place = 'before' AND j.room_id = p_room;

  FOR i IN 1 .. COALESCE(cardinality(v_bound), 0) - 1 LOOP
    v_a := v_bound[i];
    v_b := v_bound[i + 1];
    IF v_floor IS NOT NULL THEN
      IF v_b <= v_floor THEN
        CONTINUE;
      END IF;
      v_a := greatest(v_a, v_floor);
    END IF;
    v_seat := '{}';
    FOR v_r IN
      SELECT er.id FROM public.event_rounds er
       WHERE er.event_id = v_room.event_id
         AND er.started_at <= v_a AND coalesce(er.ended_at, v_room.ended_at) >= v_b
    LOOP
      -- a round still open when the room ended runs, for this room, to the room's end (the cut that closes it later keeps
      -- this room: _transcribe_round_cut_seats), so its seated people's words stay with that round, not "after"
      IF EXISTS (SELECT 1 FROM public.transcribe_round_clean_jobs j WHERE j.kind = 'round' AND j.round_id = v_r.id) THEN
        -- immutable: who the round job for this round snapshotted at the cut (whatever happened to it since)
        v_seat := v_seat || COALESCE((
          SELECT array_agg((s ->> 'member_id')::uuid)
            FROM public.transcribe_round_clean_jobs j
            CROSS JOIN LATERAL jsonb_array_elements(j.seats) s
           WHERE j.kind = 'round' AND j.round_id = v_r.id AND (s ->> 'room_id')::uuid = p_room), '{}');
      ELSE
        v_seat := v_seat || COALESCE((SELECT array_agg(c.member_id) FROM public._transcribe_round_cut_seats(v_r.id) c
                                       WHERE c.room_id = p_room), '{}');
      END IF;
      -- P1596: anyone the seat log names for this round (moved, arrived, left, sat out, or whose seat row was
      -- deleted mid-round) is excluded here too: their speech at a table is never "outside rounds".
      v_seat := v_seat || COALESCE((
        SELECT array_agg(tm.id)
          FROM public.transcribe_round_seat_moves mv
          JOIN public.event_room_members rm ON rm.id = mv.room_member_id
          JOIN public.transcribe_room_members tm ON tm.profile_id = rm.profile_id AND tm.room_id = p_room
         WHERE mv.round_id = v_r.id), '{}');
    END LOOP;
    SELECT COALESCE(array_agg(x ORDER BY x), '{}') INTO v_ids
      FROM unnest(v_all) x WHERE NOT (x = ANY (v_seat));
    IF cardinality(v_ids) > 0 THEN
      -- member_ids: whose words are posted. compare_ids: every mic in the room, so a seated person's loud mic
      -- still takes its seconds from a quiet unseated one and nobody is handed a tablemate's words.
      v_out := v_out || jsonb_build_array(jsonb_build_object('start', v_a, 'end', v_b,
                 'member_ids', to_jsonb(v_ids), 'compare_ids', to_jsonb(v_all)));
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_room_end_segments(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. The room-end job: any room, 2 minutes after it ended
-- ============================================================================
CREATE OR REPLACE FUNCTION public._transcribe_room_end_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seg jsonb;
BEGIN
  IF NOT public._transcribe_clean_enabled() THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_seg := public._transcribe_room_end_segments(NEW.id);
    IF jsonb_array_length(v_seg) > 0 THEN
      INSERT INTO public.transcribe_round_clean_jobs
        (kind, place, event_id, conversation_id, room_id, seats, window_start, window_end, segments, not_before)
      SELECT 'room', CASE WHEN NEW.event_id IS NULL THEN 'session' ELSE 'end' END, NEW.event_id, NEW.conversation_id, NEW.id,
             COALESCE(jsonb_agg(jsonb_build_object('member_id', m.id, 'room_id', m.room_id) ORDER BY m.id), '[]'::jsonb),
             NEW.created_at, NEW.ended_at, v_seg,
             -- audio recorded before a Stop may still upload for 2 minutes after it (Resolved Decision 4)
             NEW.ended_at + interval '2 minutes'
        FROM public.transcribe_room_members m
       WHERE m.room_id = NEW.id AND m.consent_given_at IS NOT NULL AND m.profile_id IS NOT NULL
      ON CONFLICT (room_id, place) WHERE kind = 'room' DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_transcribe_room_end_job: no room job created (sqlstate %)', SQLSTATE;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_room_end_job() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS transcribe_room_end_job ON public.transcribe_rooms;
CREATE TRIGGER transcribe_room_end_job AFTER UPDATE OF ended_at ON public.transcribe_rooms
  FOR EACH ROW WHEN (OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL)
  EXECUTE FUNCTION public._transcribe_room_end_job();

-- ============================================================================
-- 3. Posting
-- ============================================================================
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
              'session|' || to_char(v_room.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || '|' || v_room.part_no,
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

CREATE OR REPLACE FUNCTION public.post_clean_round(p_job_id uuid, p_attempt integer, p_items jsonb, p_partial boolean DEFAULT false)
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
REVOKE ALL ON FUNCTION public.post_clean_round(uuid, integer, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_clean_round(uuid, integer, jsonb, boolean) TO service_role;

-- ============================================================================
-- 4. History: the caller's own clean text for one room
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_my_clean_transcript(p_room_id uuid)
RETURNS TABLE (job_id uuid, member_id uuid, display_name text, chunk_ms bigint, text text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.job_id, t.member_id, tm.display_name, t.chunk_ms, t.text
    FROM public.transcribe_room_members me
    JOIN public.transcribe_round_clean_jobs j
      ON EXISTS (SELECT 1 FROM jsonb_array_elements(j.seats) s WHERE s ->> 'member_id' = me.id::text)
    JOIN public.transcribe_clean_texts t ON t.job_id = j.id
    JOIN public.transcribe_room_members tm ON tm.id = t.member_id
   WHERE me.room_id = p_room_id AND me.profile_id = auth.uid() AND auth.uid() IS NOT NULL
   ORDER BY t.chunk_ms, t.member_id;
$$;
COMMENT ON FUNCTION public.get_my_clean_transcript(uuid) IS
  'P1604 Decision 7: the cleaned text of every clean job the CALLER was a seat of in this room (their table''s round, the '
  'room-end job, or the whole session). Never another table''s words. Empty when the clean pass has not run or is switched off.';
REVOKE ALL ON FUNCTION public.get_my_clean_transcript(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_clean_transcript(uuid) TO authenticated;

DO $check$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public._transcribe_room_end_segments(uuid)', 'public._transcribe_room_end_job()',
                               'public._post_clean_round_item(uuid, uuid, bigint, text)',
                               'public.post_clean_round(uuid, integer, jsonb, boolean)']
  LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1604: % is client-callable', v_fn;
    END IF;
  END LOOP;
  IF has_function_privilege('anon', 'public.get_my_clean_transcript(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_my_clean_transcript(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1604: get_my_clean_transcript grants are wrong';
  END IF;
END
$check$;
