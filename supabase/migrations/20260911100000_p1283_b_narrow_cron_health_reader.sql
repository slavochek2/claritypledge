-- P1283 B — SUPERSEDED, and deliberately a no-op.
--
-- This version was applied to the TEST project only, on 2026-09-11. There it created schema
-- `monitoring`, a role `cron_health_reader` and monitoring.cron_health_snapshot(), so that CI could
-- read cron job health through a dedicated database login. Measured the same day, that login reached
-- far more than the one function it was granted — 20260911163000_p1283_c_*'s header says how — so the
-- design was withdrawn before it reached any other database. What it created is described in
-- features/p1283_cron_health_check.md (third pass).
--
-- Why the file is kept, and why it is empty:
--   - kept, because the test project's migration history records this version, and the Supabase CLI
--     refuses to push while the remote history holds a version the directory lacks;
--   - empty, so prod and every local database never create the role at all. It also had to change:
--     its LANGUAGE sql body named cron.job, which fails at CREATE time on a database without pg_cron
--     — a fresh local database, measured 2026-09-11 — so it broke a local reset.
-- 20260911163100_p1283_d_* removes the three objects from test, and is a no-op everywhere else.
--
-- client-safe: a no-op.

DO $$
BEGIN
  RAISE NOTICE 'P1283 B: superseded by 20260911163000_p1283_c — intentionally a no-op';
END
$$;
