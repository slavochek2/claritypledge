-- P1532 — fixes from the /finish review (Codex, a criteria reviewer, an Opus adversary).
--
-- diffed against: 20261021120000_p1532_e2e_purge_test_users.sql (_e2e_purge_allowed,
--   _e2e_purge_dependents), 20261021163700_p1532_e2e_purge_locks_candidates.sql
--   (e2e_purge_test_users), 20261021130000_p1532_e2e_user_pool.sql (e2e_release_test_user),
--   20261021140000_p1532_e2e_claim_profile_email.sql (e2e_claim_test_user). Same branch, none on
--   prod yet. Each change is commented where it is made:
--   1. _e2e_purge_allowed also requires role = service_role (the anon key carries the test ref).
--   2. _e2e_purge_dependents refuses to delete a blocking row that also references a user outside
--      the e2e namespace (a session an e2e user joined, an agreement it partnered in).
--   3. e2e_purge_test_users: the per-user retry stops at 5 s and returns the rest as `deferred`,
--      instead of running into the 8 s timeout and deleting nobody; dependent_rows no longer counts
--      a rolled-back batch; the sweep ages users by last activity, not creation.
--   4. e2e_release_test_user and e2e_claim_test_user stamp updated_at (the sweep's activity clock).
--   5. e2e_claim_test_user refuses a user with rows in id-keyed tables that have no FK, or that was
--      sent an email in the last 60 s.
--
-- client-safe: redefines functions created on this branch, none with a client caller; every REVOKE
--   is on one of those functions.

CREATE OR REPLACE FUNCTION public._e2e_purge_allowed(p_claims jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- The TEST project ref (also in e2e/helpers/e2e-namespace.ts TEST_PROJECT_REF), and the service
  -- role: the public anon key carries the test ref too, so the ref alone would admit it if EXECUTE
  -- were ever re-granted. Prod is besjtuodziykmjidubzw. Anything missing is a refusal.
  SELECT coalesce(p_claims ->> 'ref', '') = 'gfjctyxqlwexxwsmkakq'
     AND coalesce(p_claims ->> 'role', '') = 'service_role';
$$;

REVOKE ALL ON FUNCTION public._e2e_purge_allowed(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._e2e_purge_allowed(jsonb) TO service_role;

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
    'deferred', to_jsonb(v_deferred),
    'dependent_rows', v_dependents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.e2e_purge_test_users(uuid[], interval, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.e2e_purge_test_users(uuid[], interval, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.e2e_release_test_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_e2e_email constant text := '^e2e-test-[0-9]+-[0-9]+@gmail\.com$';
  v_email text;
BEGIN
  IF NOT public._e2e_purge_allowed(nullif(current_setting('request.jwt.claims', true), '')::jsonb) THEN
    RAISE EXCEPTION 'e2e_release_test_user refused: the caller is not the test project'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('released', false, 'reason', 'missing');
  END IF;
  IF v_email IS NULL OR v_email !~ c_e2e_email THEN
    RETURN jsonb_build_object('released', false, 'reason', 'not-e2e');
  END IF;
  -- Activity stamp: the sweep ages users by last activity, so a user the pool is cycling through
  -- is never taken for a leftover (P1532 review).
  UPDATE auth.users SET updated_at = now() WHERE id = p_user_id;
  RETURN jsonb_build_object('released', true, 'dependent_rows', public._e2e_purge_user_data(p_user_id));
END;
$$;

REVOKE ALL ON FUNCTION public.e2e_release_test_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.e2e_release_test_user(uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.e2e_claim_test_user(
  p_user_id uuid,
  p_profile jsonb,
  p_user_metadata jsonb,
  p_password text,
  p_session_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_e2e_email constant text := '^e2e-test-[0-9]+-[0-9]+@gmail\.com$';
  u auth.users%ROWTYPE;
  v_reason text;
  v_cols text;
  v_row jsonb;
  uc record;
  v_found boolean;
BEGIN
  IF NOT public._e2e_purge_allowed(nullif(current_setting('request.jwt.claims', true), '')::jsonb) THEN
    RAISE EXCEPTION 'e2e_claim_test_user refused: the caller is not the test project'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO u FROM auth.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('reusable', false, 'reason', 'missing');
  END IF;

  v_reason := CASE
    WHEN u.email IS NULL OR u.email !~ c_e2e_email THEN 'not-e2e'
    WHEN u.deleted_at IS NOT NULL THEN 'deleted'
    WHEN u.is_anonymous THEN 'anonymous'
    WHEN u.banned_until IS NOT NULL AND u.banned_until > now() THEN 'banned'
    WHEN u.email_confirmed_at IS NULL THEN 'unconfirmed'
    WHEN coalesce(u.email_change, '') <> '' THEN 'email-change-pending'
    WHEN coalesce(u.phone, '') <> '' THEN 'phone'
    WHEN u.encrypted_password IS NULL
      OR u.encrypted_password <> extensions.crypt(p_password, u.encrypted_password) THEN 'password-changed'
    WHEN EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = p_user_id) THEN 'mfa'
    WHEN EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = p_user_id AND i.provider <> 'email') THEN 'identity'
    WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id) THEN 'not-released'
    -- GoTrue limits how often one user can be sent an email; a fresh user has never been sent one.
    WHEN greatest(u.confirmation_sent_at, u.recovery_sent_at, u.email_change_sent_at, u.reauthentication_sent_at)
         > now() - interval '60 seconds' THEN 'email-sent-recently'
  END;
  -- Rows keyed by the user id with no foreign key (terms_acceptances, session_consents,
  -- erased_subjects on 2026-10-21) survive release, because release follows foreign keys. Found
  -- from the catalog, never listed by hand: any public uuid column named user_id or profile_id
  -- that no FK covers. Such a user is not reused.
  IF v_reason IS NULL THEN
    FOR uc IN
      SELECT c.oid::regclass AS rel, quote_ident(a.attname) AS col
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT a.attisdropped
         AND a.attname IN ('user_id', 'profile_id') AND a.atttypid = 'uuid'::regtype
         AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint k
                          WHERE k.conrelid = c.oid AND k.contype = 'f' AND a.attnum = ANY (k.conkey))
    LOOP
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %s = $1)', uc.rel, uc.col) INTO v_found USING p_user_id;
      IF v_found THEN
        v_reason := format('unlinked-rows:%s', uc.rel);
        EXIT;
      END IF;
    END LOOP;
  END IF;
  IF v_reason IS NOT NULL THEN
    RETURN jsonb_build_object('reusable', false, 'reason', v_reason);
  END IF;

  -- Anything written against the user since release (a late write from the previous test) goes.
  PERFORM public._e2e_purge_user_data(p_user_id);

  UPDATE auth.users
     SET updated_at = now(),
         raw_user_meta_data = coalesce(p_user_metadata, '{}'::jsonb),
         raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'))
   WHERE id = p_user_id;

  -- id and email come from the auth user, never from the caller.
  v_row := coalesce(p_profile, '{}'::jsonb) || jsonb_build_object('id', p_user_id, 'email', u.email);
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_cols
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = 'public.profiles'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname IN (SELECT jsonb_object_keys(v_row));
  EXECUTE format('INSERT INTO public.profiles (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::public.profiles, $1)', v_cols)
    USING v_row;

  RETURN jsonb_build_object(
    'reusable', true,
    'session_alive', p_session_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM auth.sessions s
       WHERE s.id = p_session_id AND s.user_id = p_user_id AND (s.not_after IS NULL OR s.not_after > now())),
    'user', jsonb_build_object(
      'id', u.id, 'aud', u.aud, 'role', u.role, 'email', u.email,
      'email_confirmed_at', u.email_confirmed_at, 'created_at', u.created_at, 'updated_at', now(),
      'app_metadata', jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      'user_metadata', coalesce(p_user_metadata, '{}'::jsonb))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.e2e_claim_test_user(uuid, jsonb, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.e2e_claim_test_user(uuid, jsonb, jsonb, text, uuid) TO service_role;
