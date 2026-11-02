-- P1596 final fixes: the host marking someone left / sitting out counts as a seat move; the room job excludes
-- everyone the seat log names; stale round jobs reset in one UPDATE; the dispatch carries a per-dispatch marker.
-- Created: 2026-11-01
-- Spec: features/p1596_event_transcripts_one_speaker_per_sentence.md (Redesign, Build Plan)
--
-- client-safe: no client-callable function is created or changed. host_set_round_presence is untouched (a trigger
--   on its table does the logging). Every function below is trigger-internal or service-role only: EXECUTE is
--   revoked from PUBLIC, anon and authenticated; reset_stale_round_jobs is granted to service_role alone.
--
-- diffed against:
--   _transcribe_room_end_segments    20261101140000_p1596_review_fixes.sql (same body; adds the seat-log exclusion)
--   _transcribe_round_clean_dispatch 20261101120000_p1596_clean_round_transcripts.sql (same body; body gains attempt)
--   host_set_round_presence / event_round_presence  20261002183700_p1337_event_rounds.sql (read only, unchanged)
--   _transcribe_log_seat_change      20261101170000_p1596_seat_adjust_newcomer.sql (same rules, applied to presence)
--
-- DECISIONS
--   * Presence is per event, not per round. Marking someone left (or sitting out the open round's number) while a
--     round is open is a seat move to "nowhere": the same 60 s / 5 s thresholds as _transcribe_log_seat_change.
--     Their table (the last known one, from the seat state, so a deleted seat row still counts) gets a seat_moved
--     job at the cut, and the room job excludes them for that round.
--   * reset_stale_round_jobs is ONE UPDATE: the worker passes the stale minutes and the attempt cap.

-- ============================================================================
-- 1. Presence changes are seat moves
-- ============================================================================
CREATE OR REPLACE FUNCTION public._transcribe_log_presence_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_round   public.event_rounds;
  v_was     boolean := false;
  v_now     boolean;
  v_prev    integer;
BEGIN
  BEGIN
    SELECT er.* INTO v_round FROM public.event_rounds er
     WHERE er.event_id = NEW.event_id AND er.ended_at IS NULL ORDER BY er.round_no DESC LIMIT 1;
    IF NOT FOUND THEN
      RETURN NULL;                                   -- no open round: nothing to record
    END IF;
    v_now := NEW.left_at IS NOT NULL OR NEW.sits_out_round IS NOT DISTINCT FROM v_round.round_no;
    IF TG_OP = 'UPDATE' THEN
      v_was := OLD.left_at IS NOT NULL OR OLD.sits_out_round IS NOT DISTINCT FROM v_round.round_no;
    END IF;
    IF NOT v_now OR v_was THEN
      RETURN NULL;                                   -- only the change INTO "not here" counts
    END IF;
    SELECT st.table_no INTO v_prev FROM public.transcribe_round_seat_state st
     WHERE st.round_id = v_round.id AND st.room_member_id = NEW.room_member_id;
    IF NOT FOUND THEN
      SELECT s.table_no INTO v_prev FROM public.event_round_seats s
       WHERE s.round_id = v_round.id AND s.room_member_id = NEW.room_member_id;
    END IF;
    IF v_prev IS NULL THEN
      RETURN NULL;                                   -- they had no table in this round
    END IF;
    IF clock_timestamp() >= v_round.started_at + interval '60 seconds' THEN
      INSERT INTO public.transcribe_round_seat_moves (round_id, room_member_id, from_table, to_table)
      VALUES (v_round.id, NEW.room_member_id, v_prev, NULL);
    ELSIF clock_timestamp() >= v_round.started_at + interval '5 seconds' THEN
      INSERT INTO public.transcribe_round_seat_adjust (round_id, table_no, adjusted_at)
      VALUES (v_round.id, v_prev, clock_timestamp())
      ON CONFLICT (round_id, table_no) DO UPDATE SET adjusted_at = EXCLUDED.adjusted_at;
    END IF;
    INSERT INTO public.transcribe_round_seat_state (round_id, room_member_id, table_no)
    VALUES (v_round.id, NEW.room_member_id, NULL)
    ON CONFLICT (round_id, room_member_id) DO UPDATE SET table_no = NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_transcribe_log_presence_change: not logged (sqlstate %)', SQLSTATE;   -- never break the host's tidy-up
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_log_presence_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS transcribe_presence_change_log ON public.event_round_presence;
CREATE TRIGGER transcribe_presence_change_log
  AFTER INSERT OR UPDATE ON public.event_round_presence
  FOR EACH ROW EXECUTE FUNCTION public._transcribe_log_presence_change();

-- ============================================================================
-- 2. The room job excludes everyone the seat log names for a round
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
-- 3. The dispatch carries a per-dispatch attempt marker
-- ============================================================================
CREATE OR REPLACE FUNCTION public._transcribe_round_clean_dispatch(p_job uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url    text;
  v_secret text;
  v_jwt    text;
BEGIN
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'enqueue_room_transcription_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'enqueue_room_transcription_secret';
  SELECT decrypted_secret INTO v_jwt    FROM vault.decrypted_secrets WHERE name = 'enqueue_room_transcription_anon_key';
  IF v_url IS NULL OR v_secret IS NULL OR v_jwt IS NULL THEN
    RAISE WARNING '_transcribe_round_clean_dispatch: vault config missing, job % left pending for the worker sweep', p_job;
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_jwt,
                                  'x-cron-secret', v_secret),
    -- attempt: unique per dispatch, so a retry's redispatch is a new Cloud Tasks task and not a swallowed duplicate
    body    := jsonb_build_object('job_id', p_job, 'attempt', replace(gen_random_uuid()::text, '-', '')),
    timeout_milliseconds := 10000);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '_transcribe_round_clean_dispatch: dispatch failed for job %', p_job;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_round_clean_dispatch(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 4. Stale round jobs: one UPDATE
-- ============================================================================
-- processing for longer than p_stale_minutes: back to pending (dispatched_at cleared, so the tick sends it again),
-- or failed 'stale_processing' once the claim has used p_max_attempts. Returns how many rows it changed.
CREATE OR REPLACE FUNCTION public.reset_stale_round_jobs(p_stale_minutes integer, p_max_attempts integer)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH u AS (
    UPDATE public.transcribe_round_clean_jobs j
       SET status        = CASE WHEN j.attempts >= p_max_attempts THEN 'failed' ELSE 'pending' END,
           error         = CASE WHEN j.attempts >= p_max_attempts THEN 'stale_processing' END,
           dispatched_at = CASE WHEN j.attempts >= p_max_attempts THEN j.dispatched_at END,
           updated_at    = now()
     WHERE j.status = 'processing' AND j.claimed_at < now() - make_interval(mins => p_stale_minutes)
    RETURNING 1)
  SELECT count(*)::integer FROM u;
$$;
REVOKE ALL ON FUNCTION public.reset_stale_round_jobs(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_stale_round_jobs(integer, integer) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('authenticated', 'public.reset_stale_round_jobs(integer, integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.reset_stale_round_jobs(integer, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._transcribe_log_presence_change()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._transcribe_room_end_segments(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._transcribe_round_clean_dispatch(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1596: a final-fix function is client-callable';
  END IF;
END
$check$;
