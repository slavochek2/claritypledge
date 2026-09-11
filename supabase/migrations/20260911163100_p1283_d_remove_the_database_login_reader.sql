-- P1283 D: remove the database-login reader that P1283 B created. Nothing replaces the login: the
-- check reads public.cron_health_snapshot() (20260911163000_p1283_c_*) with the public anon key.
-- Why the login had to go is in _c's header.
--
-- client-safe: removes a role no client authenticates as, a schema PostgREST never served, and the one
--   function in it. No deployed client can observe the change.
--
-- Order is load-bearing. A role cannot be dropped while it holds a privilege on an object, and this one
-- holds USAGE on schema monitoring and EXECUTE on the function in it. Dropping those objects first takes
-- the grants with them. The role owns nothing: P1283 B's verification block asserted it on test.
--
-- The schema is dropped RESTRICT, deliberately: if anything else was ever put in `monitoring`, this
-- refuses instead of taking it along.
--
-- Only the test project ever ran P1283 B's original text (20260911100000 is now an empty no-op), so this
-- removes the three objects there, and every statement is a no-op on prod and on every local database.

DROP FUNCTION IF EXISTS monitoring.cron_health_snapshot();
DROP SCHEMA IF EXISTS monitoring RESTRICT;
DROP ROLE IF EXISTS cron_health_reader;

-- ============================================================================
-- Verification — fail loud, in the migration itself
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cron_health_reader') THEN
    RAISE EXCEPTION 'P1283 D: role cron_health_reader still exists';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'monitoring') THEN
    RAISE EXCEPTION 'P1283 D: schema monitoring still exists';
  END IF;
  IF to_regprocedure('public.cron_health_snapshot()') IS NULL THEN
    RAISE EXCEPTION 'P1283 D: public.cron_health_snapshot() is missing — _c must be applied before the reader it replaces is removed';
  END IF;
  RAISE NOTICE 'P1283 D: the database-login reader is gone; cron health is read through public.cron_health_snapshot().';
END;
$$;
