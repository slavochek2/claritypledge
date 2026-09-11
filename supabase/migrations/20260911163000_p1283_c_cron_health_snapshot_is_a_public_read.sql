-- P1283 C: cron job health becomes a public read — four fields, callable with the anon key — so the
-- CI check holds no credential at all.
--
-- new function: public.cron_health_snapshot() has no prior definition in any migration. Its query is
--   the one monitoring.cron_health_snapshot() ran (20260911100000_p1283_b_*); 20260911163100_p1283_d_*
--   removes that function together with the database role that called it.
--
-- client-safe: purely additive. One new function in schema public; no existing object, grant, policy
--   or column changes, so no deployed client can observe it.
--
-- ---------------------------------------------------------------------------------------
-- WHY A PUBLIC READ, AND NOT A CREDENTIAL
-- ---------------------------------------------------------------------------------------
-- P1283 B gave CI a dedicated database login, granted one function. Measured on the test project
-- on 2026-09-11, a database login is never that narrow:
--   - it inherits everything granted to PUBLIC, including platform grants that this project's
--     postgres role cannot revoke (the REVOKE runs without error and changes nothing — measured
--     inside a block that always rolled back);
--   - it can set the request.jwt.claims setting that auth.uid() reads, so inside a SECURITY DEFINER
--     function PUBLIC may execute, it can act as any user it names. PostgREST sets that setting from
--     a verified token, so an anon REST caller cannot do the same.
-- A leaked credential becomes whatever it can reach, and that one reached far more than its grant.
-- Specifics: .private/docs/security-log.md, 2026-09-11. The login was only ever enabled on test,
-- and is disabled there.
--
-- The alternative is no secret at all. What the check reads — each job's name, whether it is
-- active, its last successful run and its 24h failure count — is operational telemetry, not user
-- data, and every job the migrations schedule is already named in this public repository (a job
-- scheduled by hand would be exposed too — see Visibility below). So the snapshot is callable with
-- the anon key every page of the site already ships. A credential CI does not hold is
-- one it cannot leak. Listed in scripts/anon-execute-allowlist.txt (P1064).
--
-- ---------------------------------------------------------------------------------------
-- WHAT IT MUST NEVER RETURN
-- ---------------------------------------------------------------------------------------
-- cron.job.command and cron.job_run_details.command hold each job's SQL, and at least one job carries
-- a secret header in its command (20260907170000_p1256_cron_tick_sends_jwt_and_secret_header).
-- cron.job_run_details.return_message can echo an HTTP error body. The checker reads neither, neither
-- is returned here, and the verification block refuses a body that so much as mentions them. That
-- matters more here than in P1283 B: the caller is now anyone.
--
-- ---------------------------------------------------------------------------------------
-- THREE PROPERTIES OF THE FUNCTION
-- ---------------------------------------------------------------------------------------
-- Cost. One pass over the run history per call (a hash aggregate), then a join to cron.job; no
--   argument an anonymous caller could use to widen it. Measured on prod 2026-09-11 over 7,440 rows:
--   3.6 ms (median of 5), against 6.1 ms for the two-subqueries-per-job form it replaced and 3.1 ms for
--   an existing public page RPC (get_pledgers_page). Both forms return identical rows on prod and test.
--   Every anon call is also capped by the anon role's statement_timeout (3s). The table has no purge
--   job and grows about 86 rows a day, so the cost grows linearly; a retention job is a separate
--   decision, not made here.
-- Visibility. pg_cron's row security shows a role only the jobs whose username is that role. This
--   function runs as its owner (postgres), so a job scheduled under another username would read as
--   "not scheduled": a loud false alarm, never a false green. Every job on prod is owned by postgres
--   (measured 2026-09-11). And every job's NAME is public through this function — including a job
--   someone schedules by hand outside the migrations. Today every job on prod is one the migrations
--   declare (measured 2026-09-11), so the rule going forward is: never name a pg_cron job anything you
--   would not publish.
-- plpgsql, not sql. A LANGUAGE sql body is resolved against cron.job when it is CREATED, so on a
--   database without pg_cron the migration itself would fail. A plpgsql body is resolved at first
--   call, so this migration applies anywhere and the function only ever runs where pg_cron exists.

CREATE OR REPLACE FUNCTION public.cron_health_snapshot()
RETURNS TABLE (jobname text, active boolean, last_ok timestamptz, failed_24h bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT j.jobname::text,
         j.active,
         r.last_ok,
         coalesce(r.failed_24h, 0)
    FROM cron.job j
    LEFT JOIN (
      SELECT d.jobid,
             max(d.start_time) FILTER (WHERE d.status = 'succeeded') AS last_ok,
             count(*) FILTER (WHERE d.status = 'failed'
                                AND d.start_time > pg_catalog.now() - interval '24 hours') AS failed_24h
        FROM cron.job_run_details d
       GROUP BY d.jobid
    ) r ON r.jobid = j.jobid
   ORDER BY j.jobname;
END;
$$;

-- PUBLIC is revoked so that only the three client roles can call it: a database login role created
-- later must not inherit a SECURITY DEFINER read of cron tables by default.
REVOKE ALL ON FUNCTION public.cron_health_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cron_health_snapshot() TO anon, authenticated, service_role;

-- ============================================================================
-- Verification — fail loud, in the migration itself
-- ============================================================================
DO $$
DECLARE
  v_src    text;
  v_result text;
  v_cfg    text[];
  v_secdef boolean;
  v_n      int;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'cron_health_snapshot';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'P1283 C: expected exactly one public.cron_health_snapshot, found % — an overload would be a second, unreviewed anon surface', v_n;
  END IF;

  SELECT p.prosrc, pg_get_function_result(p.oid), p.proconfig, p.prosecdef
    INTO v_src, v_result, v_cfg, v_secdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'cron_health_snapshot';

  IF v_result <> 'TABLE(jobname text, active boolean, last_ok timestamp with time zone, failed_24h bigint)' THEN
    RAISE EXCEPTION 'P1283 C: the snapshot contract changed: % — the checker reads exactly these four fields', v_result;
  END IF;

  IF v_src ILIKE '%command%' OR v_src ILIKE '%return_message%' THEN
    RAISE EXCEPTION 'P1283 C: the snapshot body references command/return_message — those carry job SQL and HTTP error bodies, and this function answers anyone';
  END IF;

  IF v_cfg IS NULL OR NOT ('search_path=""' = ANY(v_cfg) OR 'search_path=' = ANY(v_cfg)) THEN
    RAISE EXCEPTION 'P1283 C: snapshot search_path is % — expected empty', v_cfg;
  END IF;

  IF NOT v_secdef THEN
    RAISE EXCEPTION 'P1283 C: the snapshot must be SECURITY DEFINER — anon has no USAGE on schema cron';
  END IF;

  IF NOT has_function_privilege('anon', 'public.cron_health_snapshot()', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1283 C: anon cannot execute the snapshot — the CI check calls it with the anon key and would exit 2 on every run';
  END IF;

  IF has_function_privilege('public', 'public.cron_health_snapshot()', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1283 C: PUBLIC can execute the snapshot';
  END IF;

  RAISE NOTICE 'P1283 C: public.cron_health_snapshot() returns four fields of cron job health to the client roles, and no job command or HTTP response.';
END;
$$;
