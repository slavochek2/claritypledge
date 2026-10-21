-- P1532 — fixes from the /finish re-review (Gemini, Codex) of 20261021174500.
--
-- diffed against: 20261021174500_p1532_review_fixes.sql (_e2e_purge_dependents,
--   e2e_purge_test_users) and 20261021130000_p1532_e2e_user_pool.sql (e2e_test_user_counts). Same
--   branch, not on prod. Changes, each commented where made:
--   1. _e2e_purge_dependents locks the blocking rows before reading who owns them.
--   2. e2e_purge_test_users counts a retried user's dependent rows only after it succeeds.
--   3. e2e_test_user_counts ages users the way the sweep does (last activity).
--
-- client-safe: redefines functions created on this branch, none with a client caller; every REVOKE
--   is on one of those functions.

CREATE OR REPLACE FUNCTION public._e2e_purge_dependents(p_rel regclass, p_pred text, p_path regclass[])
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  -- Mirrors E2E_EMAIL in e2e/helpers/e2e-namespace.ts.
  c_e2e_email constant text := '^e2e-test-[0-9]+-[0-9]+@gmail\.com$';
  fk record;
  uc record;
  v_foreign boolean;
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
      -- Lock the rows first, so the ownership read below is the state they are deleted in: an
      -- owner column changed by a concurrent transaction waits until this one ends (round 2).
      EXECUTE format('SELECT count(*) FROM (SELECT 1 FROM %s WHERE %s FOR UPDATE) locked', fk.child, v_child_pred);
      -- A blocking row can belong to someone else too: a session an e2e user JOINED, an agreement
      -- it is the partner in, a delivery it received. When that someone is not an e2e user, stop
      -- (the user lands in `failed`) rather than delete their row. Checked on every single-column
      -- FK of the row onto auth.users or profiles, read from the catalog (P1532 review, H1).
      FOR uc IN
        SELECT quote_ident(a.attname) AS col
          FROM pg_catalog.pg_constraint k
          JOIN pg_catalog.pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
         WHERE k.contype = 'f' AND k.conrelid = fk.child AND cardinality(k.conkey) = 1
           AND k.confrelid IN ('auth.users'::regclass, 'public.profiles'::regclass)
      LOOP
        EXECUTE format(
          'SELECT EXISTS (SELECT 1 FROM %s WHERE %s AND %s IN (SELECT u.id FROM auth.users u WHERE u.email IS NULL OR u.email !~ %L))',
          fk.child, v_child_pred, uc.col, c_e2e_email) INTO v_foreign;
        IF v_foreign THEN
          RAISE EXCEPTION 'e2e purge: a % row to delete (via %) also belongs to a user outside the e2e namespace (%)',
            fk.child, fk.conname, uc.col
            USING ERRCODE = 'foreign_key_violation';
        END IF;
      END LOOP;
      EXECUTE format('DELETE FROM %s WHERE %s', fk.child, v_child_pred);
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      v_total := v_total + v_rows;
    END IF;
  END LOOP;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public._e2e_purge_dependents(regclass, text, regclass[]) FROM PUBLIC, anon, authenticated, service_role;


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
  v_deferred uuid[] := '{}';
  v_dependents integer := 0;
  v_id uuid;
  v_i integer;
  v_user_deps integer;
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
             -- Last activity, not creation: a pooled user is reused for hours (release and claim
             -- stamp updated_at; GoTrue stamps it and last_sign_in_at on every sign-in).
             WHERE u.email ~ c_e2e_email
               AND greatest(u.created_at, coalesce(u.updated_at, u.created_at), coalesce(u.last_sign_in_at, u.created_at))
                   < now() - p_older_than
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
      -- Isolate the user(s) that fail; everyone else is still deleted in this call. The batch's
      -- count was rolled back with it. Each retry re-walks the catalog, so the loop stops well
      -- inside PostgREST's 8 s statement timeout and returns the untried ids as `deferred` for the
      -- caller to send again: a timeout would cancel the whole call and delete nobody.
      v_dependents := 0;
      FOR v_i IN 1 .. cardinality(v_ids) LOOP
        v_id := v_ids[v_i];
        IF clock_timestamp() - statement_timestamp() > interval '5 seconds' THEN
          v_deferred := v_ids[v_i:];
          EXIT;
        END IF;
        BEGIN
          v_user_deps := public._e2e_purge_dependents(
            'auth.users'::regclass, format('id = %L::uuid', v_id), '{}');
          DELETE FROM auth.users WHERE id = v_id;
          -- Counted only once the user's subtransaction has succeeded.
          v_dependents := v_dependents + v_user_deps;
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
    'deferred', to_jsonb(v_deferred),
    'dependent_rows', v_dependents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.e2e_purge_test_users(uuid[], interval, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.e2e_purge_test_users(uuid[], interval, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.e2e_test_user_counts(p_older_than interval DEFAULT interval '24 hours')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_e2e_email constant text := '^e2e-test-[0-9]+-[0-9]+@gmail\.com$';
  v jsonb;
BEGIN
  IF NOT public._e2e_purge_allowed(nullif(current_setting('request.jwt.claims', true), '')::jsonb) THEN
    RAISE EXCEPTION 'e2e_test_user_counts refused: the caller is not the test project'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- `e2e_older` uses the sweep's own age (last activity), so it counts what a sweep can take.
  SELECT jsonb_build_object(
           'auth_users', count(*),
           'e2e', count(*) FILTER (WHERE u.email ~ c_e2e_email),
           'e2e_older', count(*) FILTER (WHERE u.email ~ c_e2e_email
             AND greatest(u.created_at, coalesce(u.updated_at, u.created_at), coalesce(u.last_sign_in_at, u.created_at))
                 < now() - p_older_than))
    INTO v
    FROM auth.users u;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.e2e_test_user_counts(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.e2e_test_user_counts(interval) TO service_role;
