-- P858: Event-driven transcription — retry accounting (Decision 5)
--
-- Adds a single source of truth for the retry counter on the job ROW, so every
-- dispatch path (Cloud Tasks trigger, sweeper) reads and increments the SAME
-- counter and stops at the cap. Counting rows-per-session is structurally broken
-- (create_transcription_job is idempotent — one row/session; retry_transcription
-- rows are MANUAL retries that would conflate with auto-retries), so a real
-- column is required.
--
-- Additive, constant-default ADD COLUMN → fast, non-rewriting on Postgres 11+.
-- Existing rows backfill to attempts=0 / max_attempts=3.
--
-- NOTE: the spec's Security Review *recommends* a CHECK (session_code ~ '^[A-Z2-9...]{6}$')
-- as belt-and-suspenders. It is DEFERRED here: a table-level CHECK validates ALL
-- existing rows at ADD-CONSTRAINT time, and historical session_code formats on prod
-- have not been verified to all conform. The REQUIRED path-safety gate is the
-- application-level validate_session_code() (audio.py, mitigation #4). If/when prod
-- session_codes are confirmed to all match the generator charset, add the CHECK in a
-- follow-up migration.

ALTER TABLE transcription_jobs
  ADD COLUMN IF NOT EXISTS attempts      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts  INTEGER NOT NULL DEFAULT 3;

COMMENT ON COLUMN transcription_jobs.attempts IS
  'P858: incremented once per real processing attempt, at the atomic claim (claim_pending_job). Shared counter across trigger + sweeper.';
COMMENT ON COLUMN transcription_jobs.max_attempts IS
  'P858: per-row retry ceiling. The claim refuses a row once attempts >= max_attempts and transitions it to failed.';
