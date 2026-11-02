-- P1596: clean round transcripts. Live posting to chat is retired; one clean, attributed post per speaker
-- turn lands in the round thread after the round, and unseated speech lands in a fresh "Outside rounds"
-- thread after the room ends.
-- Created: 2026-11-01
-- Spec: features/p1596_event_transcripts_one_speaker_per_sentence.md (Redesign, Build Plan)
--
-- client-safe: no deployed client calls anything redefined here. record_transcribe_slice keeps its signature and
--   return (service role only). transcribe_post_retry_tick / _retry_one keep their signatures and become no-ops.
--   host_start_round (all four overloads), host_end_rounds and the room sweep are NOT redefined: the cut is an
--   AFTER UPDATE trigger on event_rounds.ended_at and the room end is one on transcribe_rooms.ended_at, so every
--   code path that ends a round or a room is covered and none of those bodies change (byte for byte).
--   Everything else is additive: new tables no client can reach, new service-only functions, two triggers, one cron job.
--
-- diffed against:
--   record_transcribe_slice        20261029180000_p1592_event_transcripts_round_threads.sql (body identical except
--                                  the posting block and its lock_timeout bookkeeping are gone; the destination is
--                                  still decided and stored)
--   _transcribe_retry_one          same file (now a no-op)
--   transcribe_post_retry_tick     same file (now a no-op)
--   transcribe_post_retry_run      same file (now a no-op); its cron job transcribe_post_retry is unscheduled
--
-- DECISIONS
--   * Live text stays in transcribe_messages (the transcription room page). Nothing posts it to chat: not the
--     slice path, not the retry. _transcribe_post_line stays defined and unused.
--   * Consent: the unit is the recorder's own consent_given_at (decisions.md 2026-10-02 [product] overruled the
--     2026-09-16 pair rule: the person recording owns consent, the room is never asked). A job snapshots only
--     members with consent_given_at set, and the post RPC re-checks it.
--   * Seats are snapshotted at the cut because seating keeps no history. The snapshot holds transcribe member ids
--     and room ids only: no names, no profile ids, so account erasure has nothing to scrub in it.
--   * Failure posts nothing and blocks nothing: jobs are rows a worker claims; a failed job stays failed after
--     max attempts and the next partner reads the canvas as it is.
--   * Kill switch: transcribe_channel_posting.enabled (P1592) now gates round-clean job creation, dispatch and
--     the post RPC. It ships FALSE.
--   * A round still open when its room ends is not a round for the room-end job: its seated speakers count as
--     unseated there and post to Outside rounds; the cut that closes it later skips members of an already
--     ended room, so nobody is posted twice.

-- ============================================================================
-- 1. Retire live posting
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_transcribe_slice(
  p_room_id uuid,
  p_member_id uuid,
  p_text text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id    uuid;
  v_kind  text;
  v_event uuid;
  v_round uuid;
  v_table integer;
BEGIN
  -- unchanged from P1236: the counter moves FIRST so a bad pairing aborts before anything is written
  UPDATE public.transcribe_room_members
     SET slice_count = slice_count + 1
   WHERE id = p_member_id
     AND room_id = p_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member does not belong to this room' USING ERRCODE = '42501';
  END IF;

  BEGIN
    SELECT d.o_kind, d.o_event_id, d.o_round_id, d.o_table_no
      INTO v_kind, v_event, v_round, v_table
      FROM public._transcribe_decide_destination(p_room_id, p_member_id) d;
  EXCEPTION WHEN OTHERS THEN
    v_kind := 'none'; v_event := NULL; v_round := NULL; v_table := NULL;
    RAISE WARNING 'record_transcribe_slice: destination decision failed (sqlstate %), line kept on the room page only', SQLSTATE;
  END;

  -- spoken_at is deliberately absent: it takes the column DEFAULT now() (P1236).
  INSERT INTO public.transcribe_messages
    (room_id, member_id, text, is_final, dest_kind, dest_event_id, dest_round_id, dest_table_no)
  VALUES (p_room_id, p_member_id, btrim(p_text), true, v_kind, v_event, v_round, v_table)
  RETURNING id INTO v_id;

  -- P1596: no posting to chat here. The clean, attributed version is posted after the round / the room.
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.record_transcribe_slice(uuid, uuid, text) IS
  'P1236 Decision 6 + P1596: writes one de-duplicated transcript row and advances the member''s slice counter. '
  'Live text is shown on the room page only; nothing is posted to chat (P1596 retired P1592 live posting). '
  'service_role only. spoken_at is never a parameter.';

REVOKE ALL ON FUNCTION public.record_transcribe_slice(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_transcribe_slice(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.record_transcribe_slice(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_transcribe_slice(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public._transcribe_retry_one(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN;   -- P1596: live posting is retired, so there is nothing to retry
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_retry_one(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.transcribe_post_retry_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN;   -- P1596: retired with live posting
END;
$$;
REVOKE ALL ON FUNCTION public.transcribe_post_retry_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transcribe_post_retry_tick() TO service_role;

CREATE OR REPLACE PROCEDURE public.transcribe_post_retry_run()
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN;   -- P1596: retired with live posting
END;
$$;
REVOKE ALL ON PROCEDURE public.transcribe_post_retry_run() FROM PUBLIC, anon, authenticated;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('transcribe_post_retry')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'transcribe_post_retry');
  END IF;
END
$cron$;

-- ============================================================================
-- 2. Jobs
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.transcribe_round_clean_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL CHECK (kind IN ('round', 'room')),
  event_id        uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- round job: the round and table it cleans. room job: NULL / NULL, room_id is set instead.
  round_id        uuid REFERENCES public.event_rounds(id) ON DELETE CASCADE,
  table_no        integer,
  room_id         uuid REFERENCES public.transcribe_rooms(id) ON DELETE CASCADE,
  -- [{ "member_id": uuid, "room_id": uuid }] taken at the cut. Ids only: no names, no profile ids.
  seats           jsonb NOT NULL DEFAULT '[]'::jsonb,
  window_start    timestamptz NOT NULL,
  window_end      timestamptz NOT NULL,
  -- room job only: [{ "start": ts, "end": ts, "member_ids": [uuid] }], the stretches outside any round (or the
  -- people not seated in one). A round job cleans its single window with all its seats.
  segments        jsonb,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts        integer NOT NULL DEFAULT 0,
  not_before      timestamptz NOT NULL,
  dispatched_at   timestamptz,
  claimed_at      timestamptz,
  completed_at    timestamptz,
  -- room job: the "Outside rounds" root, created at the first post (not at the room end, so nothing is made for an
  -- empty room), and so after every walk-in's access began.
  outside_root_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  -- short machine-readable reason only, never text
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transcribe_round_clean_jobs_round_table_key UNIQUE (round_id, table_no),
  CONSTRAINT transcribe_round_clean_jobs_shape CHECK (
    (kind = 'round' AND round_id IS NOT NULL AND table_no IS NOT NULL)
    OR (kind = 'room' AND room_id IS NOT NULL AND round_id IS NULL AND table_no IS NULL))
);
-- one room job per room (a UNIQUE over NULL round_id would allow many)
CREATE UNIQUE INDEX IF NOT EXISTS transcribe_round_clean_jobs_room_key
  ON public.transcribe_round_clean_jobs (room_id) WHERE kind = 'room';
CREATE INDEX IF NOT EXISTS transcribe_round_clean_jobs_due
  ON public.transcribe_round_clean_jobs (not_before) WHERE status IN ('pending', 'processing');

ALTER TABLE public.transcribe_round_clean_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.transcribe_round_clean_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.transcribe_round_clean_jobs TO service_role;

-- Idempotency ledger: one row per (job, member, chunk) once posted.
CREATE TABLE IF NOT EXISTS public.transcribe_round_clean_posts (
  job_id          uuid NOT NULL REFERENCES public.transcribe_round_clean_jobs(id) ON DELETE CASCADE,
  member_id       uuid NOT NULL,
  chunk_ms        bigint NOT NULL,
  chat_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  posted_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, member_id, chunk_ms)
);
ALTER TABLE public.transcribe_round_clean_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.transcribe_round_clean_posts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.transcribe_round_clean_posts TO service_role;

-- ============================================================================
-- 3. Who is snapshotted at a cut
-- ============================================================================
-- Seated, consenting, transcribing members of one round: (table, transcribe member, transcribe room). Same
-- seating exclusions as _transcribe_decide_destination (marked left / sitting this round out). A member whose
-- room ended BEFORE the round was closed belongs to the room job (see header).
CREATE OR REPLACE FUNCTION public._transcribe_round_cut_seats(p_round uuid)
RETURNS TABLE (table_no integer, member_id uuid, room_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.table_no, tm.id, tm.room_id
    FROM public.event_rounds er
    JOIN public.event_round_seats s     ON s.round_id = er.id
    JOIN public.event_room_members rm   ON rm.id = s.room_member_id AND rm.profile_id IS NOT NULL
    JOIN public.transcribe_rooms tr     ON tr.event_id = er.event_id
    JOIN public.transcribe_room_members tm
                                        ON tm.room_id = tr.id AND tm.profile_id = rm.profile_id
   WHERE er.id = p_round
     AND tm.consent_given_at IS NOT NULL
     AND (tr.ended_at IS NULL OR er.ended_at IS NULL OR tr.ended_at >= er.ended_at)
     AND NOT EXISTS (SELECT 1 FROM public.event_round_presence p
                      WHERE p.event_id = er.event_id AND p.room_member_id = rm.id
                        AND (p.left_at IS NOT NULL OR p.sits_out_round IS NOT DISTINCT FROM er.round_no));
$$;
REVOKE ALL ON FUNCTION public._transcribe_round_cut_seats(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._transcribe_clean_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$ SELECT COALESCE((SELECT p.enabled FROM public.transcribe_channel_posting p WHERE p.singleton), false); $$;
REVOKE ALL ON FUNCTION public._transcribe_clean_enabled() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 4. The cut: a round ends -> one job per table
-- ============================================================================
-- 40 s = the recorder's 30 s chunk flush plus 10 s of buffer.
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
    INSERT INTO public.transcribe_round_clean_jobs
      (kind, event_id, round_id, table_no, seats, window_start, window_end, not_before)
    SELECT 'round', NEW.event_id, NEW.id, c.table_no,
           jsonb_agg(jsonb_build_object('member_id', c.member_id, 'room_id', c.room_id) ORDER BY c.member_id),
           NEW.started_at, NEW.ended_at, NEW.ended_at + interval '40 seconds'
      FROM public._transcribe_round_cut_seats(NEW.id) c
     GROUP BY c.table_no
    ON CONFLICT (round_id, table_no) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- starting the next round must never fail because cleaning could not be scheduled
    RAISE WARNING '_transcribe_round_cut: no clean jobs created (sqlstate %)', SQLSTATE;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_round_cut() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS transcribe_round_cut ON public.event_rounds;
CREATE TRIGGER transcribe_round_cut AFTER UPDATE OF ended_at ON public.event_rounds
  FOR EACH ROW WHEN (OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL)
  EXECUTE FUNCTION public._transcribe_round_cut();

-- ============================================================================
-- 5. Room end: the stretches outside any round
-- ============================================================================
-- Elementary intervals between room start/end and every closed round's start/end. In an interval inside a round
-- only the room's consenting members who were NOT seated in it are cleaned; outside every round, all of them.
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
      v_seat := v_seat || COALESCE((SELECT array_agg(c.member_id) FROM public._transcribe_round_cut_seats(v_r.id) c
                                     WHERE c.room_id = p_room), '{}');
    END LOOP;
    SELECT COALESCE(array_agg(x ORDER BY x), '{}') INTO v_ids
      FROM unnest(v_all) x WHERE NOT (x = ANY (v_seat));
    IF cardinality(v_ids) > 0 THEN
      v_out := v_out || jsonb_build_array(jsonb_build_object('start', v_a, 'end', v_b, 'member_ids', to_jsonb(v_ids)));
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
        (kind, event_id, room_id, seats, window_start, window_end, segments, not_before)
      SELECT 'room', NEW.event_id, NEW.id,
             COALESCE(jsonb_agg(jsonb_build_object('member_id', m.id, 'room_id', m.room_id) ORDER BY m.id), '[]'::jsonb),
             NEW.created_at, NEW.ended_at, v_seg, NEW.ended_at + interval '40 seconds'
        FROM public.transcribe_room_members m
       WHERE m.room_id = NEW.id AND m.consent_given_at IS NOT NULL AND m.profile_id IS NOT NULL
      ON CONFLICT (room_id) WHERE kind = 'room' DO NOTHING;
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
  FOR EACH ROW WHEN (OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL AND NEW.event_id IS NOT NULL)
  EXECUTE FUNCTION public._transcribe_room_end_job();

-- ============================================================================
-- 6. Claim and dispatch (same enqueue path as the room jobs of P1307)
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
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_round_clean_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_round_clean_job(uuid) TO service_role;

-- Posts the job id to enqueue-room-transcription exactly as transcribe_room_job_dispatch does. The worker's
-- POST /process claims a room job first and a round-clean job second (ids are uuids, so they never collide).
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
    body    := jsonb_build_object('job_id', p_job),
    timeout_milliseconds := 10000);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '_transcribe_round_clean_dispatch: dispatch failed for job %', p_job;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_round_clean_dispatch(uuid) FROM PUBLIC, anon, authenticated;

-- Every minute: dispatch each due job once. A job that fails goes back to pending and is retried by the worker's
-- /sweep (which also drains anything whose dispatch was lost).
CREATE OR REPLACE FUNCTION public.transcribe_round_clean_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public._transcribe_clean_enabled() THEN
    RETURN;
  END IF;
  FOR v_id IN
    SELECT j.id FROM public.transcribe_round_clean_jobs j
     WHERE j.status = 'pending' AND j.dispatched_at IS NULL AND j.not_before <= now()
     ORDER BY j.not_before LIMIT 50
  LOOP
    UPDATE public.transcribe_round_clean_jobs SET dispatched_at = now() WHERE id = v_id AND dispatched_at IS NULL;
    IF FOUND THEN
      PERFORM public._transcribe_round_clean_dispatch(v_id);
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.transcribe_round_clean_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transcribe_round_clean_tick() TO service_role;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('transcribe_round_clean')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'transcribe_round_clean');
    PERFORM cron.schedule('transcribe_round_clean', '* * * * *', $job$ SELECT public.transcribe_round_clean_tick(); $job$);
  ELSE
    RAISE WARNING 'P1596: pg_cron not installed, transcribe_round_clean is NOT scheduled; the worker sweep still drains due jobs';
  END IF;
END
$cron$;

-- ============================================================================
-- 7. The post RPC: one speaker turn block, one thread message
-- ============================================================================
-- Idempotent per (job, member, chunk). One call per speaker so the lock order is the poster's (job row, speaker,
-- thread / outside root, place) and never holds two speakers' locks in one transaction. Returns the chat message
-- id, or NULL when nothing is posted (not in the snapshot's consenting set, empty text, erased, cannot read the
-- channel); a NULL leaves no ledger row, so a rerun skips it the same way.
CREATE OR REPLACE FUNCTION public.post_clean_round_text(
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
  SELECT j.* INTO v_job FROM public.transcribe_round_clean_jobs j WHERE j.id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'processing' THEN
    RAISE EXCEPTION 'clean post: job is not being processed' USING ERRCODE = '22023';
  END IF;
  IF NOT public._transcribe_clean_enabled() THEN
    RAISE EXCEPTION 'clean post: posting is switched off' USING ERRCODE = '42501';
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
      FROM public._transcribe_thread_roster_locked(v_job.round_id, v_job.table_no, v_thread.id, v_speaker) r
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
REVOKE ALL ON FUNCTION public.post_clean_round_text(uuid, uuid, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_clean_round_text(uuid, uuid, bigint, text) TO service_role;

-- ============================================================================
-- 8. Post-conditions
-- ============================================================================
DO $check$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.post_clean_round_text(uuid, uuid, bigint, text)',
    'public.claim_round_clean_job(uuid)',
    'public.transcribe_round_clean_tick()',
    'public.record_transcribe_slice(uuid, uuid, text)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1596: % is client-callable', v_fn;
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated', 'public.transcribe_round_clean_jobs', 'SELECT, INSERT, UPDATE, DELETE')
     OR has_table_privilege('authenticated', 'public.transcribe_round_clean_posts', 'SELECT, INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION 'P1596: a client can reach a service-role-only table';
  END IF;
END
$check$;
