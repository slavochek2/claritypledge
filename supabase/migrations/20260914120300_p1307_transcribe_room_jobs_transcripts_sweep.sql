-- Migration: P1307 (4/4) — rooms end on the server, and every member's recording is transcribed
-- Created: 2026-09-14
-- Spec: features/p1307_event_transcription_from_ready_across_pages_into_sessions.md
--   Architecture Decisions 2 (sweep), 4 (final transcript table), 5 (job table + dispatch),
--   Security Review Parent verification 4 (service-role-only writes, member-scoped reads).
-- Guaranteed by: e2e/integration/p1307-sweep-tick.spec.ts,
--   e2e/integration/p1307-jobs-transcripts-rls.spec.ts,
--   e2e/integration/p1307-schema-and-grants.spec.ts
--
-- WHY. Before P1307 a room ended in exactly two ways: one member ended it for everyone, or a
-- slice arrived after the room's 180 minutes. An abandoned room never ended, and the only job
-- ever created was for the member who pressed End (create_transcription_job refuses other
-- members' sessions). This migration makes the server the only thing that ends a room, and
-- makes room end create the whole-recording work for every member, in one transaction.
--
-- PARTS
--   1. transcribe_room_transcription_jobs — one row per (room, member). Status values reuse
--      transcription_jobs' own set so the session history renders it with its existing branches.
--   2. transcribe_room_transcripts — ONE row per room, read by every member whose session
--      references that room. Sessions reference it; nobody gets a copy (Decision 4).
--   3. transcribe_room_sweep_tick() — every 2 minutes via pg_cron. Ends members past their own
--      3 hours or silent for 10 minutes; ends rooms whose every member has ended; creates the
--      jobs for the rooms it just ended. Every write is conditional, so a racing or retried
--      tick writes nothing extra. No HTTP from the tick itself.
--   4. An AFTER INSERT trigger on the job table posts the job id (and only the id) to the
--      enqueue-room-transcription edge function, which hands it to Cloud Tasks. Same shape as
--      the batch worker's dispatch. Misconfiguration warns; it never blocks the insert.
--   5. claim_room_transcription_job() for the Cloud Run worker (service role only).
--
-- PREREQUISITES on a hosted project (the tick and trigger degrade to a WARNING without them):
--   select vault.create_secret('<https://…/functions/v1/enqueue-room-transcription>', 'enqueue_room_transcription_url', 'P1307');
--   select vault.create_secret('<CRON_SECRET>',       'enqueue_room_transcription_secret',   'P1307');
--   select vault.create_secret('<project anon key>',  'enqueue_room_transcription_anon_key', 'P1307');
-- The anon key goes in Authorization only because the gateway requires a well-formed JWT
-- (20260907170000); x-cron-secret is the credential the function checks.
--
-- new function: transcribe_room_sweep_tick(), transcribe_room_job_dispatch() and
--   claim_room_transcription_job(uuid) do not exist in any prior migration; nothing is redefined.
--
-- client-safe: additive — two new tables, new functions, one trigger, one cron job. No existing
--   column, policy or signature is altered.

-- ── 1. Jobs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transcribe_room_transcription_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       uuid NOT NULL REFERENCES public.transcribe_rooms(id) ON DELETE CASCADE,
  member_id     uuid NOT NULL REFERENCES public.transcribe_room_members(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts      integer NOT NULL DEFAULT 0,
  -- Short machine-readable reason only. Never transcript text, never audio metadata beyond counts.
  error         text,
  claimed_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transcribe_room_transcription_jobs_room_member_key UNIQUE (room_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_transcribe_room_jobs_member
  ON public.transcribe_room_transcription_jobs (member_id);
CREATE INDEX IF NOT EXISTS idx_transcribe_room_jobs_status
  ON public.transcribe_room_transcription_jobs (status) WHERE status IN ('pending', 'processing');

ALTER TABLE public.transcribe_room_transcription_jobs ENABLE ROW LEVEL SECURITY;

-- ── 2. Final transcript ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transcribe_room_transcripts (
  room_id               uuid PRIMARY KEY REFERENCES public.transcribe_rooms(id) ON DELETE CASCADE,
  -- [{ member_id, start_ms, end_ms, text, also_heard_by?: member_id[] }] in spoken order.
  segments              jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- { member_id: display_name } joined server-side AFTER transcription — never sent to Gemini.
  speaker_map           jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Members whose archive has a gap or ends early. Their contribution is shown, marked incomplete.
  incomplete_member_ids uuid[] NOT NULL DEFAULT '{}',
  -- Cross-member near-duplicates kept and labelled, never deleted (Decision 5).
  de_duplication_note   jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transcribe_room_transcripts ENABLE ROW LEVEL SECURITY;

-- ── Access: service-role writes, member-scoped reads ───────────────────────
-- Privileges, not only policies. With RLS on and no UPDATE/DELETE policy, PostgREST reports a
-- client UPDATE as a silent zero-row success; revoking the privilege makes the refusal an
-- error, which is what a caller (and the canary) can actually observe. The WITH CHECK (false)
-- policies state the rule a second way, per the P1275 idiom, in case a future grant reopens it.
REVOKE ALL ON public.transcribe_room_transcription_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.transcribe_room_transcripts        FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.transcribe_room_transcription_jobs TO authenticated;
GRANT SELECT ON public.transcribe_room_transcripts        TO authenticated;
GRANT ALL ON public.transcribe_room_transcription_jobs TO service_role;
GRANT ALL ON public.transcribe_room_transcripts        TO service_role;

-- P1207 member-scoped shape, verbatim. A session's OTHER /live participant gains nothing: the
-- rule keys on room membership, never on clarity_sessions.
DROP POLICY IF EXISTS "room members can read room transcription jobs" ON public.transcribe_room_transcription_jobs;
CREATE POLICY "room members can read room transcription jobs"
  ON public.transcribe_room_transcription_jobs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transcribe_room_members m
      WHERE m.room_id = transcribe_room_transcription_jobs.room_id AND m.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "no client writes to room transcription jobs" ON public.transcribe_room_transcription_jobs;
CREATE POLICY "no client writes to room transcription jobs"
  ON public.transcribe_room_transcription_jobs FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "room members can read room transcripts" ON public.transcribe_room_transcripts;
CREATE POLICY "room members can read room transcripts"
  ON public.transcribe_room_transcripts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transcribe_room_members m
      WHERE m.room_id = transcribe_room_transcripts.room_id AND m.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "no client writes to room transcripts" ON public.transcribe_room_transcripts;
CREATE POLICY "no client writes to room transcripts"
  ON public.transcribe_room_transcripts FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- ── 3. The sweep ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transcribe_room_sweep_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- MUST equal ROOM_MAX_DURATION_MINUTES in supabase/functions/transcribe-slice/handler.ts
  -- (the per-slice cap) and the cap in gcs-signed-url. All three measure from joined_at.
  c_member_cap CONSTANT interval := interval '180 minutes';
  -- N (Decision 2): ~46 missed 13 s cadences. A founder-adjustable constant, not a measurement.
  -- The client's paused heartbeat (every 2 minutes) must stay well inside it.
  c_stale      CONSTANT interval := interval '10 minutes';
BEGIN
  -- Step 1: end members past their own cap or silent for N. COALESCE(last_seen_at, joined_at)
  -- so a seat created before last_seen_at existed ages out instead of living forever.
  UPDATE public.transcribe_room_members AS m
     SET capture_ended_at = now()
    FROM public.transcribe_rooms AS r
   WHERE r.id = m.room_id
     AND r.ended_at IS NULL
     AND m.capture_ended_at IS NULL
     AND (
       m.joined_at + c_member_cap < now()
       OR COALESCE(m.last_seen_at, m.joined_at) < now() - c_stale
     );

  -- Steps 2 + 3 in one statement: end every open room that has members and no member still
  -- capturing, then create one job per member of exactly those rooms. A room with no members
  -- is left alone (nothing to transcribe, and nobody could have been the last to leave).
  --
  -- Jobs only for members with last_seen_at IS NOT NULL: every seat created by the P1307 join
  -- paths carries it. A pre-P1307 seat in a long-abandoned room has no P1307 archive layout to
  -- reassemble, and without this bound the first tick on a database with a backlog of abandoned
  -- rooms would queue a Gemini pass for every historical member at once.
  WITH ended AS (
    UPDATE public.transcribe_rooms AS r
       SET ended_at = now()
     WHERE r.ended_at IS NULL
       AND EXISTS (SELECT 1 FROM public.transcribe_room_members m WHERE m.room_id = r.id)
       AND NOT EXISTS (
         SELECT 1 FROM public.transcribe_room_members m
         WHERE m.room_id = r.id AND m.capture_ended_at IS NULL
       )
    RETURNING r.id
  )
  INSERT INTO public.transcribe_room_transcription_jobs (room_id, member_id)
  SELECT m.room_id, m.id
  FROM public.transcribe_room_members m
  JOIN ended e ON e.id = m.room_id
  WHERE m.last_seen_at IS NOT NULL
  ON CONFLICT (room_id, member_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.transcribe_room_sweep_tick() IS
  'P1307 Decision 2: the only thing that ends a transcribe room. Idempotent. Scheduled every 2 minutes '
  'by pg_cron (job transcribe_room_sweep). enter_transcribe_room''s room selection depends on it running.';

REVOKE ALL ON FUNCTION public.transcribe_room_sweep_tick() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transcribe_room_sweep_tick() FROM anon;
REVOKE ALL ON FUNCTION public.transcribe_room_sweep_tick() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transcribe_room_sweep_tick() TO service_role;

-- ── 4. Dispatch ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transcribe_room_job_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    text;
  v_secret text;
  v_jwt    text;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'enqueue_room_transcription_url';
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'enqueue_room_transcription_secret';
  SELECT decrypted_secret INTO v_jwt
    FROM vault.decrypted_secrets WHERE name = 'enqueue_room_transcription_anon_key';

  IF v_url IS NULL OR v_secret IS NULL OR v_jwt IS NULL THEN
    RAISE WARNING 'transcribe_room_job_dispatch: vault config missing (url: %, secret: %, jwt: %) — job % left pending',
      (v_url IS NOT NULL), (v_secret IS NOT NULL), (v_jwt IS NOT NULL), NEW.id;
    RETURN NEW;
  END IF;

  -- The body carries the job id and nothing else: no room code, no names, no text.
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_jwt,
                 'x-cron-secret', v_secret
               ),
    body    := jsonb_build_object('job_id', NEW.id),
    timeout_milliseconds := 10000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A failed dispatch must never roll back the room end that created the job. The job stays
  -- pending, where the worker's janitor picks it up.
  RAISE WARNING 'transcribe_room_job_dispatch: dispatch failed for job %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.transcribe_room_job_dispatch() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transcribe_room_job_dispatch() FROM anon;
REVOKE ALL ON FUNCTION public.transcribe_room_job_dispatch() FROM authenticated;

DROP TRIGGER IF EXISTS transcribe_room_job_dispatch ON public.transcribe_room_transcription_jobs;
CREATE TRIGGER transcribe_room_job_dispatch
  AFTER INSERT ON public.transcribe_room_transcription_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.transcribe_room_job_dispatch();

-- ── 5. Worker claim ────────────────────────────────────────────────────────
-- One conditional UPDATE is the whole lock: two deliveries of the same Cloud Task race on
-- status = 'pending' and exactly one gets a row back.
CREATE OR REPLACE FUNCTION public.claim_room_transcription_job(p_job_id uuid)
RETURNS SETOF public.transcribe_room_transcription_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.transcribe_room_transcription_jobs
     SET status = 'processing', claimed_at = now(), attempts = attempts + 1, updated_at = now()
   WHERE id = p_job_id AND status = 'pending'
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.claim_room_transcription_job(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_room_transcription_job(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.claim_room_transcription_job(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_room_transcription_job(uuid) TO service_role;

-- ── Schedule ───────────────────────────────────────────────────────────────
-- No CREATE EXTENSION pg_cron: where it is not preloaded that statement raises (see
-- 20260907140000). The guard makes local and CI databases without pg_cron apply cleanly.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('transcribe_room_sweep')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'transcribe_room_sweep');
    PERFORM cron.schedule(
      'transcribe_room_sweep',
      '*/2 * * * *',
      $job$ SELECT public.transcribe_room_sweep_tick(); $job$
    );
  ELSE
    RAISE WARNING 'P1307: pg_cron not installed — transcribe_room_sweep is NOT scheduled, and abandoned rooms will not end';
  END IF;
END
$cron$;

-- ── Post-conditions ────────────────────────────────────────────────────────
DO $check$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.transcribe_room_sweep_tick()',
    'public.transcribe_room_job_dispatch()',
    'public.claim_room_transcription_job(uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1307: % is client-callable', v_fn;
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated', 'public.transcribe_room_transcription_jobs', 'INSERT, UPDATE, DELETE')
     OR has_table_privilege('authenticated', 'public.transcribe_room_transcripts', 'INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION 'P1307: authenticated can write a service-role-only table';
  END IF;
END
$check$;
