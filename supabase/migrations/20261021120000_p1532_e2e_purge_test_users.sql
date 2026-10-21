-- P1532 — delete a batch of e2e test users in ONE request, on the TEST project only.
--
-- new functions
--   public.e2e_purge_test_users(uuid[], interval, integer), public._e2e_purge_allowed(jsonb) and
--   public._e2e_purge_dependents(regclass, text, regclass[]) do not exist before this migration.
--
-- client-safe: three brand-new functions with no client caller. The only pre-commit-flagged
--   shape is REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated on those same new functions
--   (Supabase's default privileges grant EXECUTE on every new public function to all roles).
--
-- WHY. e2e/helpers/test-user.ts deleted one user with 6 + 2k API calls (k = FK blockers), and
-- found each blocker by SENDING A DELETE IT EXPECTED TO FAIL: every 23503 writes a Postgres ERROR
-- and a gateway error line. Reproduced 2026-10-21 (e2e/integration/p1532-cleanup-request-volume
-- .spec.ts): one user with one blocker = 7 requests, one of them a 409. Test and prod share one
-- organisation on the free plan, so that traffic and those logs spend production's quota.
--
-- FK ORDER IS READ FROM pg_constraint ON EVERY CALL — never a hand-kept table list (P1523
-- decision; .claude/rules/epistemic.md gate 7e). Starting at auth.users, for every foreign key
-- that references the table being deleted:
--   NO ACTION / RESTRICT ('a','r')  the referencing rows are deleted first, recursively;
--   CASCADE ('c')                   walked, so the cascading rows' own blockers are cleared, then
--                                   left to Postgres to cascade (keeps cascade-only guards such as
--                                   membership_last_organizer_cannot_leave on their depth > 1 path);
--   SET NULL / SET DEFAULT          left to Postgres.
-- A cycle among the walked edges RAISES instead of looping. There is none today (catalog read
-- 2026-10-21: 179 FKs, 33 blocking deletes, depth 6), and a new one must be looked at by a human.
--
-- PROD EXCLUSION — decided here (P1532 Invariant: "absent from prod, or refusing there"). The
-- function is deployed everywhere by the normal migration path and REFUSES unless the caller's JWT
-- names the test project (request.jwt.claims ->> 'ref'). A call with no claims (SQL editor, psql,
-- Management API) refuses too. Rejected: keeping it off prod. This repo has no test-only migration
-- lane, and an object that exists on test but in no migration is treated as drift and dropped
-- (20260902003000_p1095_drop_points_context.sql). Defence in depth: EXECUTE goes to service_role
-- only, and only e2e-namespace emails (E2E_EMAIL in scripts/sweep-e2e-test-users.ts, which
-- mirrors generateTestEmail()) are ever deleted — any other id is returned as `refused`, untouched.
-- Forging the claim needs the project's JWT secret, which already grants everything.
--
-- BOUND. PostgREST runs as authenticator with statement_timeout=8s (pg_roles, 2026-10-21), so
-- one call must finish inside 8 s. A call takes at most 200 users; callers send 50.
--
-- ONE FAILING USER DOES NOT SINK THE BATCH. The batch runs inside one subtransaction; if it raises,
-- each user is retried in its own subtransaction and the ones that still fail come back in
-- `failed` with their SQLSTATE, so a caller can report them. Errors caught here are not logged as
-- ERROR by Postgres. query_canceled (the 8 s timeout) is not caught by WHEN OTHERS and aborts the
-- call, which is the intended stop.

-- ---------------------------------------------------------------------------
-- 1. The project guard, separate so the integration test can exercise both answers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._e2e_purge_allowed(p_claims jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- The TEST project ref (also in scripts/sweep-e2e-test-users.ts TEST_PROJECT_REF). Prod is
  -- besjtuodziykmjidubzw. A missing or non-matching ref is a refusal, never a default.
  SELECT coalesce(p_claims ->> 'ref', '') = 'gfjctyxqlwexxwsmkakq';
$$;

REVOKE ALL ON FUNCTION public._e2e_purge_allowed(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._e2e_purge_allowed(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Clear everything that blocks deleting the rows of p_rel matched by p_pred
-- ---------------------------------------------------------------------------
-- p_pred is a boolean SQL expression over p_rel's own columns, built only by this file from
-- catalog identifiers (quote_ident) and a uuid[] literal — never from caller text.
CREATE OR REPLACE FUNCTION public._e2e_purge_dependents(p_rel regclass, p_pred text, p_path regclass[])
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  fk record;
  v_child_pred text;
  v_rows integer;
  v_total integer := 0;
BEGIN
  FOR fk IN
    SELECT c.conname,
           c.conrelid::regclass AS child,
           c.confdeltype AS action,
           (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord)
              FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
              JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols,
           (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord)
              FROM unnest(c.confkey) WITH ORDINALITY AS k(attnum, ord)
              JOIN pg_catalog.pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum) AS refcols
      FROM pg_catalog.pg_constraint c
     WHERE c.contype = 'f'
       AND c.confrelid = p_rel
       AND c.confdeltype IN ('a', 'r', 'c')
     ORDER BY c.conname
  LOOP
    IF fk.child = p_rel OR fk.child = ANY (p_path) THEN
      RAISE EXCEPTION 'e2e purge: foreign-key cycle at % (%), path %', fk.child, fk.conname, p_path || p_rel
        USING ERRCODE = 'feature_not_supported';
    END IF;
    v_child_pred := format('(%s) IN (SELECT %s FROM %s WHERE %s)', fk.cols, fk.refcols, p_rel, p_pred);
    v_total := v_total + public._e2e_purge_dependents(fk.child, v_child_pred, p_path || p_rel);
    IF fk.action IN ('a', 'r') THEN
      EXECUTE format('DELETE FROM %s WHERE %s', fk.child, v_child_pred);
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_total := v_total + v_rows;
    END IF;
  END LOOP;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public._e2e_purge_dependents(regclass, text, regclass[]) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The entry point
-- ---------------------------------------------------------------------------
-- Either p_user_ids (at most 200; non-e2e and unknown ids are reported, not deleted), or
-- p_older_than (sweep: e2e users created before now() - p_older_than, at most p_limit, in random
-- order so users that always fail cannot occupy every batch — P1523).
CREATE OR REPLACE FUNCTION public.e2e_purge_test_users(
  p_user_ids uuid[] DEFAULT NULL,
  p_older_than interval DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Mirrors E2E_EMAIL in scripts/sweep-e2e-test-users.ts.
  c_e2e_email constant text := '^e2e-test-[0-9]+-[0-9]+@gmail\.com$';
  c_max constant integer := 200;
  v_ids uuid[] := '{}';
  v_refused uuid[] := '{}';
  v_missing uuid[] := '{}';
  v_failed jsonb := '[]'::jsonb;
  v_done uuid[] := '{}';
  v_dependents integer := 0;
  v_id uuid;
BEGIN
  IF NOT public._e2e_purge_allowed(nullif(current_setting('request.jwt.claims', true), '')::jsonb) THEN
    RAISE EXCEPTION 'e2e_purge_test_users refused: the caller is not the test project'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_user_ids IS NOT NULL THEN
    IF cardinality(p_user_ids) > c_max THEN
      RAISE EXCEPTION 'e2e_purge_test_users: at most % ids per call (got %)', c_max, cardinality(p_user_ids)
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    SELECT coalesce(array_agg(u.id) FILTER (WHERE u.email ~ c_e2e_email), '{}'),
           coalesce(array_agg(u.id) FILTER (WHERE u.email IS NULL OR u.email !~ c_e2e_email), '{}')
      INTO v_ids, v_refused
      FROM auth.users u
     WHERE u.id = ANY (p_user_ids);
    SELECT coalesce(array_agg(x), '{}') INTO v_missing
      FROM unnest(p_user_ids) AS x
     WHERE x <> ALL (v_ids) AND x <> ALL (v_refused);
  ELSIF p_older_than IS NOT NULL THEN
    IF p_limit IS NULL OR p_limit < 1 OR p_limit > c_max THEN
      RAISE EXCEPTION 'e2e_purge_test_users: p_limit must be 1..% (got %)', c_max, p_limit
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    SELECT coalesce(array_agg(s.id), '{}') INTO v_ids
      FROM (SELECT u.id FROM auth.users u
             WHERE u.email ~ c_e2e_email AND u.created_at < now() - p_older_than
             ORDER BY random()
             LIMIT p_limit) s;
  ELSE
    RAISE EXCEPTION 'e2e_purge_test_users: pass p_user_ids or p_older_than'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF cardinality(v_ids) > 0 THEN
    BEGIN
      v_dependents := public._e2e_purge_dependents(
        'auth.users'::regclass, format('id = ANY (%L::uuid[])', v_ids), '{}');
      DELETE FROM auth.users WHERE id = ANY (v_ids);
      v_done := v_ids;
    EXCEPTION WHEN OTHERS THEN
      -- Isolate the user(s) that fail; everyone else is still deleted in this call.
      FOREACH v_id IN ARRAY v_ids LOOP
        BEGIN
          v_dependents := v_dependents + public._e2e_purge_dependents(
            'auth.users'::regclass, format('id = %L::uuid', v_id), '{}');
          DELETE FROM auth.users WHERE id = v_id;
          v_done := v_done || v_id;
        EXCEPTION WHEN OTHERS THEN
          v_failed := v_failed || jsonb_build_object('id', v_id, 'sqlstate', SQLSTATE, 'message', SQLERRM);
        END;
      END LOOP;
    END;
  END IF;

  RETURN jsonb_build_object(
    'deleted', to_jsonb(v_done),
    'refused', to_jsonb(v_refused),
    'missing', to_jsonb(v_missing),
    'failed', v_failed,
    'dependent_rows', v_dependents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.e2e_purge_test_users(uuid[], interval, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.e2e_purge_test_users(uuid[], interval, integer) TO service_role;
