-- P1256 (correction): remove the LEGACY 'dispatch-event-emails' cron job.
--
-- diffed against: no migration — this job exists in no migration file. It was created
--   out-of-band directly against prod, the same way tx_jobs_enqueue was before P1064.
--
-- client-safe: removes a cron job that has never once succeeded. No table, column,
--   policy, function signature or client-reachable object is touched.
--
-- THIS CORRECTS THIS SPEC'S OWN ROOT CAUSE. P1256 was written on the finding that
-- nothing had ever invoked dispatch-event-emails — based on config.toml carrying no
-- schedule block and no migration carrying a cron.schedule for it. Both facts are true.
-- The conclusion drawn from them was not: a job DID exist on prod, active, on
-- '0 */6 * * *'. It was invisible to the repo because it lives only in prod's cron.job.
--
-- It has failed on EVERY run since it was created. Measured from cron.job_run_details:
--
--   328 runs, 0 succeeded, first 2026-06-17, last 2026-09-07 06:00Z
--   ERROR: column "Authorization" does not exist
--
-- The cause is one character class. Its command builds the auth header as
-- `json_build_object("Authorization", "Bearer <secret>")` — DOUBLE quotes, which in
-- Postgres mean IDENTIFIER, not string literal. So the planner looked for a column named
-- Authorization, found none, and aborted before any HTTP request was made. Single quotes
-- would have worked. The effect was total: no reminder and no feedback email has ever
-- been dispatched, for any event, in the ~3 months since.
--
-- Two lessons this encodes, both of which the replacement job embodies:
--
--   1. The failure was LOUD and nobody was listening. cron.job_run_details held 328
--      identical error rows. Nothing read it, so a hard error was operationally
--      indistinguishable from silence. /day now checks it directly.
--
--   2. The job embedded its bearer token as a literal in cron.job.command, where it is
--      readable by anything that can read cron.job and lands in every pg_dump. The
--      replacement reads it from Vault at run time instead. THIS TOKEN MUST BE ROTATED:
--      it was exposed in plaintext for the life of the job.
--
-- The replacement (20260907140000, 'dispatch_event_emails' — underscore) is a DIFFERENT
-- job name, so without this migration a deploy leaves BOTH scheduled: the new one
-- working, and this one going on erroring every 6 hours forever.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('dispatch-event-emails')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-event-emails');
  END IF;
END $$;
