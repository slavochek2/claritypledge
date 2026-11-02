-- P1596 review fixes: completeness gate data, moved-mid-round jobs, immutable exclusion for the room job,
-- one atomic post with a claim fence, kill switch at the claim, roster from the job snapshot, and a client read
-- for "Open".
-- Created: 2026-11-01
-- Spec: features/p1596_event_transcripts_one_speaker_per_sentence.md (Redesign, Build Plan)
--
-- client-safe: the only function a client can call is the NEW get_my_open_round_seat (authenticated, additive).
--   Everything else is service-role-only or trigger-internal. post_clean_round_text (service role only, never
--   deployed to a live worker: the kill switch ships FALSE) is dropped and replaced by post_clean_round; no
--   deployed client calls it. claim_round_clean_job keeps its signature and return. New columns have defaults.
--
-- diffed against:
--   _transcribe_round_cut             20261101120000_p1596_clean_round_transcripts.sql (adds seated_count, roster,
--                                     and completed 'seat_moved' jobs; the cut itself, trigger and 40 s unchanged)
--   _transcribe_room_end_segments     same file (exclusion by the round jobs' snapshots; adds compare_ids)
--   claim_round_clean_job             same file (adds the kill switch)
--   _post_clean_round_item            post_clean_round_text, 20261101130000_p1596_outside_thread_registered.sql
--                                     (status/switch checks move to the caller; roster comes from the job)
--   _transcribe_job_roster(_locked)   _transcribe_thread_roster(_locked), 20261029180000_p1592_event_transcripts_round_threads.sql
--                                     (seat source = the job's roster snapshot instead of the current seats)
--
-- DECISIONS
--   * The completeness gate lives in the worker; the database only stores what it needs: seated_count (every
--     person seated at the table at the cut, before the consent filter) and roster (their event_room_members ids,
--     ids only, resolved to names at post time so an erased person is simply not named).
--   * Seat moves: an UPDATE of event_round_seats.table_no while the round is open is logged. At the cut, every table
--     named by a move (from or to) gets a job that is born completed with error 'seat_moved' and posts nothing.
--   * The room job excludes people by the round jobs' own seats (immutable), not by current presence. A closed
--     round with no job at all (switch was off at the cut) falls back to the live seats, as before.
--   * LOCK ORDER of post_clean_round: job row, then every speaker lock in profile-id order, then per item the
--     thread / outside lock and the place lock, as one poster always did. The erasing marker is only tried, never
--     waited for, so no cycle with erase_chat_data_for (marker, speaker, thread) or host seating (thread).

-- ============================================================================
-- 1. Job columns
-- ============================================================================
ALTER TABLE public.transcribe_round_clean_jobs
  ADD COLUMN IF NOT EXISTS seated_count integer,
  ADD COLUMN IF NOT EXISTS roster jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ============================================================================
-- 2. Seat moves during an open round
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.transcribe_round_seat_moves (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  round_id       uuid NOT NULL REFERENCES public.event_rounds(id) ON DELETE CASCADE,
  room_member_id uuid NOT NULL,
  from_table     integer NOT NULL,
  to_table       integer NOT NULL,
  moved_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transcribe_round_seat_moves_round ON public.transcribe_round_seat_moves (round_id);
ALTER TABLE public.transcribe_round_seat_moves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.transcribe_round_seat_moves FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.transcribe_round_seat_moves TO service_role;

CREATE OR REPLACE FUNCTION public._transcribe_log_seat_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    IF EXISTS (SELECT 1 FROM public.event_rounds er WHERE er.id = NEW.round_id AND er.ended_at IS NULL) THEN
      INSERT INTO public.transcribe_round_seat_moves (round_id, room_member_id, from_table, to_table)
      VALUES (NEW.round_id, NEW.room_member_id, OLD.table_no, NEW.table_no);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_transcribe_log_seat_move: not logged (sqlstate %)', SQLSTATE;   -- never break the host's seating
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_log_seat_move() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS transcribe_seat_move_log ON public.event_round_seats;
CREATE TRIGGER transcribe_seat_move_log AFTER UPDATE OF table_no ON public.event_round_seats
  FOR EACH ROW WHEN (OLD.table_no IS DISTINCT FROM NEW.table_no)
  EXECUTE FUNCTION public._transcribe_log_seat_move();

-- ============================================================================
-- 3. The cut: seated count, roster, moved tables
-- ============================================================================
-- Everyone seated per table at the cut, BEFORE the consent filter: same exclusions as _transcribe_round_cut_seats
-- (marked left, sitting this round out). Ids only.
CREATE OR REPLACE FUNCTION public._transcribe_round_cut_table_info(p_round uuid)
RETURNS TABLE (table_no integer, seated integer, roster jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.table_no, count(*)::integer, jsonb_agg(to_jsonb(rm.id::text) ORDER BY rm.id)
    FROM public.event_rounds er
    JOIN public.event_round_seats s   ON s.round_id = er.id
    JOIN public.event_room_members rm ON rm.id = s.room_member_id
   WHERE er.id = p_round
     AND NOT EXISTS (SELECT 1 FROM public.event_round_presence p
                      WHERE p.event_id = er.event_id AND p.room_member_id = rm.id
                        AND (p.left_at IS NOT NULL OR p.sits_out_round IS NOT DISTINCT FROM er.round_no))
   GROUP BY s.table_no;
$$;
REVOKE ALL ON FUNCTION public._transcribe_round_cut_table_info(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._transcribe_round_cut()
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
    WITH cs AS (SELECT * FROM public._transcribe_round_cut_seats(NEW.id)),
         info AS (SELECT * FROM public._transcribe_round_cut_table_info(NEW.id)),
         mv AS (SELECT m.from_table AS t FROM public.transcribe_round_seat_moves m WHERE m.round_id = NEW.id
                UNION SELECT m.to_table FROM public.transcribe_round_seat_moves m WHERE m.round_id = NEW.id),
         tb AS (SELECT cs.table_no FROM cs UNION SELECT mv.t FROM mv)
    INSERT INTO public.transcribe_round_clean_jobs
      (kind, event_id, round_id, table_no, seats, seated_count, roster, window_start, window_end, not_before,
       status, error, completed_at)
    SELECT 'round', NEW.event_id, NEW.id, tb.table_no,
           COALESCE((SELECT jsonb_agg(jsonb_build_object('member_id', c.member_id, 'room_id', c.room_id) ORDER BY c.member_id)
                       FROM cs c WHERE c.table_no = tb.table_no), '[]'::jsonb),
           COALESCE(i.seated, 0), COALESCE(i.roster, '[]'::jsonb),
           NEW.started_at, NEW.ended_at, NEW.ended_at + interval '40 seconds',
           CASE WHEN EXISTS (SELECT 1 FROM mv WHERE mv.t = tb.table_no) THEN 'completed' ELSE 'pending' END,
           CASE WHEN EXISTS (SELECT 1 FROM mv WHERE mv.t = tb.table_no) THEN 'seat_moved' END,
           CASE WHEN EXISTS (SELECT 1 FROM mv WHERE mv.t = tb.table_no) THEN now() END
      FROM tb LEFT JOIN info i ON i.table_no = tb.table_no
    ON CONFLICT (round_id, table_no) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- starting the next round must never fail because cleaning could not be scheduled
    RAISE WARNING '_transcribe_round_cut: no clean jobs created (sqlstate %)', SQLSTATE;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_round_cut() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 4. Room end: exclusion by the round jobs' snapshots, compare every mic
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

  FOR i IN 1 .. COALESCE(cardinality(v_bound), 0) - 1 LOOP
    v_a := v_bound[i];
    v_b := v_bound[i + 1];
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
-- 5. Claim honours the kill switch
-- ============================================================================
CREATE OR REPLACE FUNCTION public.claim_round_clean_job(p_job_id uuid)
RETURNS SETOF public.transcribe_round_clean_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.transcribe_round_clean_jobs
     SET status = 'processing', claimed_at = now(), attempts = attempts + 1, updated_at = now()
   WHERE id = p_job_id AND status = 'pending' AND not_before <= now()
     AND public._transcribe_clean_enabled()
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_round_clean_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_round_clean_job(uuid) TO service_role;

-- ============================================================================
-- 6. Thread roster from the job snapshot (not from where people sit now)
-- ============================================================================
CREATE OR REPLACE FUNCTION public._transcribe_job_roster(
  p_roster jsonb, p_event uuid, p_thread_id uuid, p_speaker uuid)
RETURNS TABLE (profile_id uuid, display_name text, rnk integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT d.profile_id, d.display_name, d.rnk FROM (
    SELECT DISTINCT ON (x.profile_id) x.profile_id, x.display_name, x.rnk FROM (
      SELECT rm.profile_id, rm.display_name, 3 AS rnk
        FROM public.event_room_members rm
       WHERE rm.id IN (SELECT e::uuid FROM jsonb_array_elements_text(COALESCE(p_roster, '[]'::jsonb)) e)
         AND rm.profile_id IS NOT NULL
      UNION ALL
      SELECT tm.profile_id, COALESCE(tm.display_name, ''), 4
        FROM public.chat_round_thread_members tm
       WHERE tm.thread_id = p_thread_id
      UNION ALL
      SELECT rm.profile_id, rm.display_name, 5
        FROM public.event_room_members rm
       WHERE rm.event_id = p_event AND rm.profile_id = p_speaker
    ) x
    WHERE btrim(x.display_name) <> ''
    ORDER BY x.profile_id, x.rnk
  ) d
  ORDER BY d.rnk, lower(d.display_name), d.profile_id;
$$;
REVOKE ALL ON FUNCTION public._transcribe_job_roster(jsonb, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Two statements on purpose (locks first, names second), exactly as _transcribe_thread_roster_locked.
CREATE OR REPLACE FUNCTION public._transcribe_job_roster_locked(
  p_roster jsonb, p_event uuid, p_thread_id uuid, p_speaker uuid)
RETURNS TABLE (profile_id uuid, display_name text, rnk integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_ok uuid[] := '{}';
  v_p  uuid;
BEGIN
  FOR v_p IN
    SELECT r.profile_id FROM public._transcribe_job_roster(p_roster, p_event, p_thread_id, p_speaker) r
     ORDER BY r.profile_id
  LOOP
    IF pg_try_advisory_xact_lock_shared(hashtextextended('p1592:erasing:' || v_p::text, 0)) THEN
      v_ok := v_ok || v_p;
    END IF;
  END LOOP;
  RETURN QUERY
    SELECT r.profile_id, r.display_name, r.rnk
      FROM public._transcribe_job_roster(p_roster, p_event, p_thread_id, p_speaker) r
     WHERE r.profile_id = ANY (v_ok)
     ORDER BY r.rnk, lower(r.display_name), r.profile_id;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_job_roster_locked(jsonb, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 7. Posting: one transaction, fenced on the claim
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
    -- room job: an "Outside rounds" root created now, once per job
    PERFORM pg_advisory_xact_lock(hashtextextended('p1596:outside:' || p_job_id::text, 0));
    SELECT j.outside_root_id INTO v_root_id FROM public.transcribe_round_clean_jobs j WHERE j.id = p_job_id;
    IF v_root_id IS NULL THEN
      INSERT INTO public.chat_messages (conversation_id, author_id, body, kind, system_kind, created_at)
      VALUES (v_conv, NULL, public._transcribe_outside_title(), 'message', 'outside_rounds', clock_timestamp())
      RETURNING id INTO v_root_id;
      UPDATE public.transcribe_round_clean_jobs SET outside_root_id = v_root_id, updated_at = now() WHERE id = p_job_id;
      -- The "My rounds" read (P1592) finds the event's Outside rounds thread through this row.
      INSERT INTO public.chat_outside_round_threads (conversation_id, root_message_id)
      VALUES (v_conv, v_root_id)
      ON CONFLICT (conversation_id) DO UPDATE SET root_message_id = EXCLUDED.root_message_id;
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

-- Every item of a job or none. p_attempt must equal the claim the job is on now: a worker whose claim was reset
-- (stale) or re-taken is refused here and by every status write it makes afterwards. Any error in any item rolls
-- the whole call back, so a failure leaves nothing posted. Idempotent per (job, member, chunk) as before.
-- p_items: [{ "member_id": uuid, "chunk_ms": bigint, "text": text }]. Returns the number of messages written.
CREATE OR REPLACE FUNCTION public.post_clean_round(p_job_id uuid, p_attempt integer, p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.transcribe_round_clean_jobs;
  v_p   uuid;
  v_i   record;
  v_n   integer := 0;
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

  -- all speaker locks first, in profile-id order (see LOCK ORDER above)
  FOR v_p IN
    SELECT DISTINCT m.profile_id
      FROM jsonb_array_elements(p_items) it
      JOIN public.transcribe_room_members m ON m.id = (it ->> 'member_id')::uuid
     WHERE m.profile_id IS NOT NULL
     ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('p1592:speaker:' || v_p::text, 0));
  END LOOP;

  FOR v_i IN
    SELECT (it ->> 'member_id')::uuid AS member_id, (it ->> 'chunk_ms')::bigint AS chunk_ms, it ->> 'text' AS txt
      FROM jsonb_array_elements(p_items) it
     ORDER BY (it ->> 'chunk_ms')::bigint, (it ->> 'member_id')
  LOOP
    IF public._post_clean_round_item(p_job_id, v_i.member_id, v_i.chunk_ms, v_i.txt) IS NOT NULL THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.post_clean_round(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_clean_round(uuid, integer, jsonb) TO service_role;

-- Out of use: replaced by post_clean_round.
DROP FUNCTION IF EXISTS public.post_clean_round_text(uuid, uuid, bigint, text);

-- ============================================================================
-- 8. "Open": where am I right now?
-- ============================================================================
-- One row when the caller is currently seated in the event's LATEST round while it is open (not marked left, not
-- sitting it out): root_message_id is that table's thread root when it exists, the caller is a member of it and can
-- read it, else NULL. No row otherwise. The client never reads seats or presence itself (presence is host-only).
CREATE OR REPLACE FUNCTION public.get_my_open_round_seat(p_conversation uuid)
RETURNS TABLE (seated boolean, root_message_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid   uuid := auth.uid();
  v_since timestamptz;
  v_event uuid;
  v_round public.event_rounds;
  v_table integer;
  v_root  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  v_since := public._chat_access_since(p_conversation, v_uid);
  IF v_since IS NULL THEN
    RETURN;
  END IF;
  SELECT c.event_id INTO v_event FROM public.chat_conversations c WHERE c.id = p_conversation AND c.kind = 'event';
  IF v_event IS NULL THEN
    RETURN;
  END IF;
  SELECT er.* INTO v_round FROM public.event_rounds er WHERE er.event_id = v_event ORDER BY er.round_no DESC LIMIT 1;
  IF NOT FOUND OR v_round.ended_at IS NOT NULL THEN
    RETURN;
  END IF;
  SELECT s.table_no INTO v_table
    FROM public.event_round_seats s
    JOIN public.event_room_members rm ON rm.id = s.room_member_id
   WHERE s.round_id = v_round.id AND rm.profile_id = v_uid
     AND NOT EXISTS (SELECT 1 FROM public.event_round_presence p
                      WHERE p.event_id = v_event AND p.room_member_id = rm.id
                        AND (p.left_at IS NOT NULL OR p.sits_out_round IS NOT DISTINCT FROM v_round.round_no))
   LIMIT 1;
  IF v_table IS NULL THEN
    RETURN;
  END IF;
  SELECT t.root_message_id INTO v_root
    FROM public.chat_round_threads t
    JOIN public.chat_messages m ON m.id = t.root_message_id
   WHERE t.round_id = v_round.id AND t.table_no = v_table AND t.conversation_id = p_conversation
     AND m.deleted_at IS NULL AND m.created_at >= v_since
     AND EXISTS (SELECT 1 FROM public.chat_round_thread_members tm WHERE tm.thread_id = t.id AND tm.profile_id = v_uid);
  RETURN QUERY SELECT true, v_root;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_open_round_seat(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_open_round_seat(uuid) TO authenticated;

-- ============================================================================
-- 9. Post-conditions
-- ============================================================================
DO $check$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.post_clean_round(uuid, integer, jsonb)',
    'public.claim_round_clean_job(uuid)',
    'public._post_clean_round_item(uuid, uuid, bigint, text)',
    'public._transcribe_job_roster_locked(jsonb, uuid, uuid, uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1596: % is client-callable', v_fn;
    END IF;
  END LOOP;
  IF has_function_privilege('anon', 'public.get_my_open_round_seat(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1596: get_my_open_round_seat is anon-callable';
  END IF;
  IF has_table_privilege('authenticated', 'public.transcribe_round_seat_moves', 'SELECT, INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION 'P1596: a client can reach the seat-move log';
  END IF;
END
$check$;
