-- P1596 (founder, solo test 2026-11-02): threads in time order. Speech before round 1 is posted to "Before round 1"
-- (a job created when round 1 starts, so the thread sits above the rounds); speech once rounds had begun and not at a
-- table (between rounds, after the last round, a round sat out) to "After the last round"; an event with no round at
-- all to one thread, "The conversation". Replaces the single "Outside rounds" thread.
-- Created: 2026-11-02
-- Spec: features/p1596_event_transcripts_one_speaker_per_sentence.md (Approved after solo test 2)
--
-- client-safe: no client-callable function is created or changed. Every function below is trigger-internal or
--   service-role only (EXECUTE revoked from PUBLIC, anon and authenticated; checked at the end). The only table
--   changes are to two tables no client can reach (transcribe_round_clean_jobs, chat_outside_round_threads). The
--   thread roots keep system_kind 'outside_rounds', so every client rule keyed on it (a copy of a line carries that
--   line alone; the thread is not listed under "My rounds") applies to all three new threads unchanged.
--
-- diffed against:
--   _post_clean_round_item        20261101140000_p1596_review_fixes.sql (same body; only the room-job branch changes:
--                                 the place is chosen per item, one shared root per event and place)
--   _transcribe_room_end_segments 20261101183700_p1596_final_fixes.sql (same body; adds the floor a "before" job leaves)
--   _transcribe_room_end_job      20261101120000_p1596_clean_round_transcripts.sql (same body; place 'end', conflict key)
--   chat_outside_round_threads    20261029180000_p1592_event_transcripts_round_threads.sql (key gains `place`)
--   transcribe_round_clean_jobs   20261101120000_p1596_clean_round_transcripts.sql (gains `place`, room key per place)
--
-- DECISIONS
--   * Consent, erasure, access: unchanged. The post RPC still re-checks the member snapshot, consent, the account and
--     the reader's access to the root; the speaker lock is still taken before the place lock; the claim fence and the
--     kill switch gate the new job exactly as the others. The roots are author-less, so erasure has nothing to scrub.
--   * One root per (event channel, place), shared by every room of the event (it used to be one per room job).
--   * A room that ended before round 1 has no "before" job; its stretch is posted by its room-end job, placed by the
--     time of each chunk, but it is placed at post time: if no round has started yet then, it goes to "The
--     conversation". LIMIT: an event whose first round starts after such a room ended gets that room's words there.
--   * The words are posted as the chunk's start time says; a chunk that straddles the first round start goes to the
--     place its start is in.

-- ============================================================================
-- 1. Jobs gain a place; one room job per room AND place
-- ============================================================================
ALTER TABLE public.transcribe_round_clean_jobs ADD COLUMN IF NOT EXISTS place text;
UPDATE public.transcribe_round_clean_jobs SET place = 'end' WHERE kind = 'room' AND place IS NULL;
ALTER TABLE public.transcribe_round_clean_jobs DROP CONSTRAINT IF EXISTS transcribe_round_clean_jobs_place_check;
ALTER TABLE public.transcribe_round_clean_jobs ADD CONSTRAINT transcribe_round_clean_jobs_place_check CHECK (
  (kind = 'round' AND place IS NULL) OR (kind = 'room' AND place IN ('before', 'end')));
DROP INDEX IF EXISTS public.transcribe_round_clean_jobs_room_key;
CREATE UNIQUE INDEX IF NOT EXISTS transcribe_round_clean_jobs_room_place_key
  ON public.transcribe_round_clean_jobs (room_id, place) WHERE kind = 'room';

-- ============================================================================
-- 2. The event's threads: one per place
-- ============================================================================
ALTER TABLE public.chat_outside_round_threads ADD COLUMN IF NOT EXISTS place text NOT NULL DEFAULT 'after';
ALTER TABLE public.chat_outside_round_threads DROP CONSTRAINT IF EXISTS chat_outside_round_threads_place_check;
ALTER TABLE public.chat_outside_round_threads ADD CONSTRAINT chat_outside_round_threads_place_check
  CHECK (place IN ('before', 'after', 'conversation'));
ALTER TABLE public.chat_outside_round_threads DROP CONSTRAINT IF EXISTS chat_outside_round_threads_pkey;
ALTER TABLE public.chat_outside_round_threads ADD PRIMARY KEY (conversation_id, place);

CREATE OR REPLACE FUNCTION public._transcribe_place_title(p_place text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE p_place WHEN 'before' THEN 'Before round 1' WHEN 'conversation' THEN 'The conversation'
                      ELSE 'After the last round' END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_place_title(text) FROM PUBLIC, anon, authenticated;

-- When the event's rounds began, and how many there are: first_start NULL and n 0 for an event with no round.
CREATE OR REPLACE FUNCTION public._transcribe_event_round_span(p_event uuid)
RETURNS TABLE (first_start timestamptz, n integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT min(er.started_at), count(*)::integer FROM public.event_rounds er WHERE er.event_id = p_event;
$$;
REVOKE ALL ON FUNCTION public._transcribe_event_round_span(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. The room-end job leaves what a "before" job already covers
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
  IF NOT FOUND OR v_room.event_id IS NULL OR v_room.ended_at IS NULL THEN
    RETURN v_out;
  END IF;
  SELECT COALESCE(array_agg(m.id ORDER BY m.id), '{}') INTO v_all
    FROM public.transcribe_room_members m
   WHERE m.room_id = p_room AND m.consent_given_at IS NOT NULL AND m.profile_id IS NOT NULL;
  IF cardinality(v_all) = 0 THEN
    RETURN v_out;
  END IF;

  SELECT array_agg(DISTINCT t ORDER BY t) INTO v_bound FROM (
    SELECT v_room.created_at AS t
    UNION SELECT v_room.ended_at
    UNION SELECT greatest(er.started_at, v_room.created_at) FROM public.event_rounds er
           WHERE er.event_id = v_room.event_id AND er.ended_at IS NOT NULL
             AND er.started_at < v_room.ended_at AND er.ended_at > v_room.created_at
    UNION SELECT least(er.ended_at, v_room.ended_at) FROM public.event_rounds er
           WHERE er.event_id = v_room.event_id AND er.ended_at IS NOT NULL
             AND er.started_at < v_room.ended_at AND er.ended_at > v_room.created_at
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
       WHERE er.event_id = v_room.event_id AND er.ended_at IS NOT NULL
         AND er.started_at <= v_a AND er.ended_at >= v_b
    LOOP
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
        (kind, place, event_id, room_id, seats, window_start, window_end, segments, not_before)
      SELECT 'room', 'end', NEW.event_id, NEW.id,
             COALESCE(jsonb_agg(jsonb_build_object('member_id', m.id, 'room_id', m.room_id) ORDER BY m.id), '[]'::jsonb),
             NEW.created_at, NEW.ended_at, v_seg, NEW.ended_at + interval '40 seconds'
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

-- ============================================================================
-- 4. Round 1 starts: the "before" job for every room still recording
-- ============================================================================
CREATE OR REPLACE FUNCTION public._transcribe_round_one_start_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public._transcribe_clean_enabled() THEN
    RETURN NEW;
  END IF;
  BEGIN
    -- Each room of this event that is open and began before round 1: everything it heard up to this moment, from the
    -- consenting people in it. The worker waits for the uploads past the window end exactly as for a round job.
    INSERT INTO public.transcribe_round_clean_jobs
      (kind, place, event_id, room_id, seats, window_start, window_end, segments, not_before)
    SELECT 'room', 'before', NEW.event_id, r.id,
           jsonb_agg(jsonb_build_object('member_id', m.id, 'room_id', m.room_id) ORDER BY m.id),
           r.created_at, NEW.started_at,
           jsonb_build_array(jsonb_build_object('start', r.created_at, 'end', NEW.started_at,
             'member_ids', jsonb_agg(m.id ORDER BY m.id), 'compare_ids', jsonb_agg(m.id ORDER BY m.id))),
           NEW.started_at + interval '40 seconds'
      FROM public.transcribe_rooms r
      JOIN public.transcribe_room_members m ON m.room_id = r.id AND m.consent_given_at IS NOT NULL AND m.profile_id IS NOT NULL
     WHERE r.event_id = NEW.event_id AND r.ended_at IS NULL AND r.created_at < NEW.started_at
     GROUP BY r.id, r.created_at
    ON CONFLICT (room_id, place) WHERE kind = 'room' DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- starting round 1 must never fail because cleaning could not be scheduled
    RAISE WARNING '_transcribe_round_one_start_job: no job created (sqlstate %)', SQLSTATE;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_round_one_start_job() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS transcribe_round_one_start_job ON public.event_rounds;
CREATE TRIGGER transcribe_round_one_start_job AFTER INSERT ON public.event_rounds
  FOR EACH ROW WHEN (NEW.round_no = 1)
  EXECUTE FUNCTION public._transcribe_round_one_start_job();

-- ============================================================================
-- 5. Posting: the place is chosen per item
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

  SELECT c.id INTO v_conv FROM public.chat_conversations c WHERE c.kind = 'event' AND c.event_id = v_job.event_id;
  IF v_conv IS NULL THEN
    INSERT INTO public.chat_conversations (kind, event_id) VALUES ('event', v_job.event_id)
    ON CONFLICT (event_id) WHERE kind = 'event' DO NOTHING;
    SELECT c.id INTO v_conv FROM public.chat_conversations c WHERE c.kind = 'event' AND c.event_id = v_job.event_id;
  END IF;
  IF v_conv IS NULL THEN
    RAISE EXCEPTION 'clean post: event channel unavailable' USING ERRCODE = '42501';
  END IF;
  v_since := public._chat_access_since(v_conv, v_speaker);
  IF v_since IS NULL THEN
    RETURN NULL;                                 -- words reach only readers of this channel
  END IF;

  v_root := NULL;
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
      VALUES (v_conv, NULL, 'Round ' || v_round.round_no, 'message', 'round_thread', clock_timestamp())
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
      VALUES (v_conv, NULL, public._transcribe_place_title(v_place), 'message', 'outside_rounds', clock_timestamp())
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

DO $check$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public._transcribe_place_title(text)', 'public._transcribe_event_round_span(uuid)',
    'public._transcribe_room_end_segments(uuid)', 'public._transcribe_room_end_job()',
    'public._transcribe_round_one_start_job()', 'public._post_clean_round_item(uuid, uuid, bigint, text)']
  LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1596: % is client-callable', v_fn;
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated', 'public.chat_outside_round_threads', 'SELECT')
     OR has_table_privilege('authenticated', 'public.transcribe_round_clean_jobs', 'SELECT') THEN
    RAISE EXCEPTION 'P1596: a place table is client-reachable';
  END IF;
END
$check$;
