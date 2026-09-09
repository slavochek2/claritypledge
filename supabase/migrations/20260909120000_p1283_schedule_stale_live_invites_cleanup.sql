-- P1283: actually create the `cleanup_stale_live_invites` pg_cron job that
-- 20260414100002_p703_live_invites_cron.sql declares and prod has never had.
--
-- diffed against: 20260414100002_p703_live_invites_cron.sql — the only prior migration
--   that schedules this job. Same job name, same hourly expression, same UPDATE body.
--   What changes is the MECHANISM, not the intent, so this file supersedes that DO
--   block rather than restating a new policy. 20260414100002 is applied on prod and is
--   deliberately left untouched: editing an applied migration changes nothing on a
--   database that already recorded it.
--
-- client-safe: server-side only. It creates one pg_cron schedule and, where pg_cron is
--   preloaded but not yet installed, the extension. No table, column, policy, grant,
--   index or function signature is touched, and no deployed client can observe a cron
--   job. The UPDATE the job runs sets `closed_at` on invites the application already
--   treats as abandoned, which is the behaviour P703 specified and shipped the unique
--   partial index against.
--
-- ── WHY THE APRIL MIGRATION PRODUCED NOTHING ────────────────────────────────
-- Measured read-only against prod on 2026-09-09, not inferred:
--
--   1. It WAS applied. `supabase_migrations.schema_migrations` holds version
--      20260414100002. So it will never re-run, and re-pushing the migrations changes
--      nothing. This is why a fix has to be a NEW file.
--   2. pg_cron was installed on prod AFTER it ran. Postgres allocates OIDs from one
--      monotonic counter, so relative OID order is creation order:
--
--        clarity_live_invites (created by 20260414100001)   125931
--        pg_cron extension                                  127993
--        cron schema                                        127994
--        ready_submissions    (created by 20260816120000)   129320
--
--      pg_cron sits BETWEEN the April migration's own table and the August one. Its
--      guard, `IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')`, was
--      therefore false at apply time; the DO block did nothing and the migration
--      reported success. The lowest surviving jobid on prod is 2, and jobid 1 was the
--      out-of-band job P1256 dates to 2026-06-17 — two months after this migration.
--
--   The guard shape is NOT the difference. 20260816120000_p1083 uses a byte-identical
--   guard and its job exists, because by August the extension did. Same code, opposite
--   outcome, decided entirely by when the extension was enabled.
--
--   Cost of the gap, measured on prod the same day: one `clarity_live_invites` row has
--   been open for 90 days. The anon REST key reports zero open rows because RLS hides
--   it, so the backlog is only visible to a role that bypasses RLS.
--
-- ── WHY THIS ONE CANNOT REPEAT THAT ─────────────────────────────────────────
-- Two changes, both aimed at the exact failure above.
--
--   The condition tested is IRREDUCIBLE, not transient. `shared_preload_libraries` is a
--   postmaster-level setting: where pg_cron is absent from it, no migration, extension
--   or privilege can produce a cron job on that server, and the skip is a statement of
--   fact rather than a race with the operator. p703 tested `pg_extension` instead — a
--   condition that was merely not-yet-true, and became true eight weeks later with
--   nothing to notice.
--
--   Where pg_cron IS preloaded, this migration installs the extension itself rather
--   than waiting for someone to enable it, and then ASSERTS the post-condition: if
--   `cron.job` holds no active row afterwards it raises, so the transaction aborts and
--   the version is never recorded as applied. A silent no-op is no longer reachable on
--   a cron-capable server.
--
--   The skip branch is not silent either. It RAISEs a WARNING naming the job, and
--   `scripts/check-cron-health.mjs` (this spec's other half) reads prod's real
--   `cron.job` against the migrations and exits non-zero when a declared job is
--   missing — so an environment that took the skip branch when it should not have is
--   caught from outside the migration, which is the layer p703 lacked entirely.
--
--   NO bare `CREATE EXTENSION pg_cron` at file scope, deliberately, for the reason
--   20260907140000_p1256 gives: where pg_cron is not preloaded it RAISEs rather than
--   skipping and aborts the whole migration. Gating it behind the preload test is
--   precisely the condition under which it would raise, so that concern is addressed
--   rather than contradicted.
--
-- Local instances: the Supabase Postgres image preloads pg_cron and ships the extension
-- uninstalled, so a local stack takes the install-and-schedule path and ends up matching
-- prod. A bare `postgres:*` image has no pg_cron in `shared_preload_libraries` and takes
-- the WARNING branch. Both verified 2026-09-09 against real containers.

DO $$
BEGIN
  -- Word-boundary match so a hypothetical `pg_cron_something` cannot pass for pg_cron.
  IF coalesce(current_setting('shared_preload_libraries', true), '') !~ '\mpg_cron\M' THEN
    RAISE WARNING USING MESSAGE =
      'P1283: pg_cron is not in shared_preload_libraries on this server, so no cron job '
      'can exist here — skipping cleanup_stale_live_invites. Expected on a bare local '
      'Postgres. On a Supabase instance this is a server configuration fault, and '
      'scripts/check-cron-health.mjs will report the job as missing.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    EXECUTE 'CREATE EXTENSION pg_cron';
  END IF;

  -- Idempotent: remove any existing row before rescheduling, so re-applying this file
  -- cannot stack duplicates. Same shape as 20260907140000_p1256.
  PERFORM cron.unschedule('cleanup_stale_live_invites')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_stale_live_invites');

  PERFORM cron.schedule(
    'cleanup_stale_live_invites',
    '0 * * * *',
    $job$
      UPDATE public.clarity_live_invites
         SET closed_at = now()
       WHERE closed_at IS NULL
         AND created_at < now() - interval '24 hours';
    $job$
  );

  -- The post-condition assert. p703's whole defect was reporting success without ever
  -- checking that anything had been created; this refuses to be recorded as applied
  -- unless the row is really there and really active.
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
     WHERE jobname = 'cleanup_stale_live_invites'
       AND active
  ) THEN
    RAISE EXCEPTION USING MESSAGE =
      'P1283: pg_cron accepted the scheduling call but cron.job holds no active row for '
      'cleanup_stale_live_invites — refusing to record this migration as applied.';
  END IF;
END;
$$;
