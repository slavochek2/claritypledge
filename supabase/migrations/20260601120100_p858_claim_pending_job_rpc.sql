-- P858: Event-driven transcription — atomic claim (Decision 6)
-- new function (no prior definition; introduced in P858)
--
-- Replaces the non-atomic get_pending_job() read with a single conditional UPDATE.
-- Fire-and-forget + a sweeper means two independent dispatchers can see the same
-- 'pending' row; without an atomic claim both would call transcribe_session →
-- duplicate GPU work + a second session_transcripts INSERT. The
-- UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1) collapses
-- claim+flip into one statement, so the pending→processing transition IS the
-- synchronization point: only one caller wins a given row.
--
-- FOR UPDATE SKIP LOCKED cannot be expressed through PostgREST's .update() layer,
-- so the service calls this via client.rpc("claim_pending_job", {...}).
--
-- Two modes, ONE function:
--   p_job_id IS NULL  → claim the oldest pending row        (sweeper path)
--   p_job_id provided → claim only that row if eligible      (trigger path; Cloud Tasks
--                        carries the job_id — mitigation #3: only the id is trusted,
--                        session fields come from RETURNING, never the task payload)
--
-- The attempts increment lives HERE — the single chokepoint every dispatcher passes
-- through — so the counter advances exactly once per real attempt regardless of which
-- path initiated it (Decision 5). The gate `attempts < max_attempts` means an
-- exhausted row never matches → zero rows → not claimed (the caller then fails it).

CREATE OR REPLACE FUNCTION claim_pending_job(p_job_id UUID DEFAULT NULL)
RETURNS TABLE (
  id           UUID,
  session_code TEXT,
  session_id   UUID,
  attempts     INTEGER
)
LANGUAGE sql
AS $$
  UPDATE transcription_jobs j
     SET status     = 'processing',
         attempts   = j.attempts + 1,
         updated_at = now()
   WHERE j.id = (
     SELECT c.id
       FROM transcription_jobs c
      WHERE c.status = 'pending'
        AND c.attempts < c.max_attempts
        AND (p_job_id IS NULL OR c.id = p_job_id)
      ORDER BY c.created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
   )
  RETURNING j.id, j.session_code, j.session_id, j.attempts;
$$;

-- Service-only: the claim wakes a billable GPU, so anon/authenticated must NOT be able
-- to call it (denial-of-wallet). The default PUBLIC EXECUTE grant is revoked; only the
-- service-role key (used by the transcribe service) may invoke it.
REVOKE EXECUTE ON FUNCTION claim_pending_job(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_pending_job(UUID) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION claim_pending_job(UUID) TO service_role;

COMMENT ON FUNCTION claim_pending_job(UUID) IS
  'P858: atomic claim of a pending transcription job (FOR UPDATE SKIP LOCKED). p_job_id NULL = oldest pending (sweeper); set = by-id (trigger). Increments attempts; gated on attempts < max_attempts. Service-role only.';
