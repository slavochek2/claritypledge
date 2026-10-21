-- P1532 — e2e_purge_test_users locks its candidates before checking their email.
--
-- diffed against: 20261021120000_p1532_e2e_purge_test_users.sql
--
-- redefines public.e2e_purge_test_users(uuid[], interval, integer) from that file (same branch,
--   not yet on prod). The candidate SELECTs took no row lock, so an email changed by a concurrent
--   transaction after the namespace check could still be deleted under the old check (Codex review,
--   P1532 /finish). Both selections now lock the rows they return: by id with FOR UPDATE, and the
--   sweep with FOR UPDATE SKIP LOCKED so a sweep never waits on a row a claim or another sweep
--   holds. Under READ COMMITTED a locked row is re-read before the email filter applies. Nothing
--   else changes.
--
-- client-safe: redefines a function created on this branch that has no client caller; the REVOKE is
--   on that same function.

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
    -- Locked, so the email checked here is the email at delete time (a concurrent update waits).
    SELECT coalesce(array_agg(u.id) FILTER (WHERE u.email ~ c_e2e_email), '{}'),
           coalesce(array_agg(u.id) FILTER (WHERE u.email IS NULL OR u.email !~ c_e2e_email), '{}')
      INTO v_ids, v_refused
      FROM (SELECT a.id, a.email FROM auth.users a WHERE a.id = ANY (p_user_ids) FOR UPDATE) u;
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
             LIMIT p_limit
             FOR UPDATE SKIP LOCKED) s;  -- locked as above; rows a claim or another sweep holds are skipped
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
