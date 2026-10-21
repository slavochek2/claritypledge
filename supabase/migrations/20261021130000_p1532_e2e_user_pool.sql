-- P1532 — reuse e2e test users within a run, and count them in one request (TEST project only).
--
-- new functions
--   public.e2e_release_test_user(uuid), public.e2e_claim_test_user(uuid, jsonb, jsonb, text, uuid),
--   public.e2e_test_user_counts(interval) and public._e2e_purge_user_data(uuid) do not exist
--   before this migration.
--
-- client-safe: four brand-new functions with no client caller. The only pre-commit-flagged shape is
--   REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated on those same new functions.
--
-- WHY. A full e2e run minted about 1,500 users (Codex AST census: 1,286 createTestUser calls in 480
-- files) and deleted each again: a GoTrue create, a profile insert, usually a GoTrue sign-in, and
-- the delete, each with its own gateway and auth log lines on the shared free-plan quota. P1522
-- planned a fixed pool (its Solution item 4) and never built it. Here a user a test is done with is
-- RELEASED: every public row that references it is deleted, as deleting the user would, but the
-- auth user stays. The next createTestUser in the same worker CLAIMS it: one request, and the
-- worker's cached sign-in is reused when its session still exists.
--
-- A RELEASED USER IS INVISIBLE. Release removes the profile and everything hanging off it, so a
-- pooled user waiting for its next test shows up on no page and in no shared-table count.
--
-- A CLAIMED USER MUST BE INDISTINGUISHABLE FROM A FRESH ONE, or it is not reused. The public side is
-- rebuilt from nothing (release deleted it). The auth side is checked, never repaired: the claim
-- refuses (reusable = false, with the reason) when the email left the e2e namespace, the password is
-- no longer the test password, the email is unconfirmed or mid-change, the user is banned, deleted,
-- anonymous or has a phone, an MFA factor or any identity other than email. The caller then deletes
-- it and creates a fresh user. user_metadata and app_metadata are reset to what a fresh user gets.
--
-- Same guard, namespace rule and bounds as e2e_purge_test_users
-- (20261021120000_p1532_e2e_purge_test_users.sql): test project only via the JWT ref claim,
-- service_role only, e2e-namespace emails only.

-- ---------------------------------------------------------------------------
-- 1. Delete every public row that references one user, keeping the auth user
-- ---------------------------------------------------------------------------
-- The FKs onto auth.users are read from the catalog like everything else. Edges into the auth
-- schema (sessions, identities, ...) are left alone: they belong to the auth user, which stays.
-- NO ACTION / RESTRICT / CASCADE children are deleted (after their own blockers); SET NULL and SET
-- DEFAULT children get the same update a delete of the user would have made.
CREATE OR REPLACE FUNCTION public._e2e_purge_user_data(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  fk record;
  v_pred text;
  v_rows integer;
  v_total integer := 0;
BEGIN
  FOR fk IN
    SELECT c.conname,
           c.conrelid::regclass AS child,
           c.confdeltype AS action,
           array_agg(quote_ident(a.attname) ORDER BY k.ord) AS cols
      FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_class cl ON cl.oid = c.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
      CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.contype = 'f'
       AND c.confrelid = 'auth.users'::regclass
       AND n.nspname <> 'auth'
     GROUP BY c.conname, c.conrelid, c.confdeltype
     ORDER BY c.conname
  LOOP
    -- Every FK onto auth.users references its single-column key `id`.
    v_pred := format('(%s) IN (SELECT id FROM auth.users WHERE id = %L::uuid)', array_to_string(fk.cols, ', '), p_user_id);
    IF fk.action IN ('a', 'r', 'c') THEN
      v_total := v_total + public._e2e_purge_dependents(fk.child, v_pred, ARRAY['auth.users'::regclass]);
      EXECUTE format('DELETE FROM %s WHERE %s', fk.child, v_pred);
    ELSE
      EXECUTE format('UPDATE %s SET %s WHERE %s', fk.child,
        (SELECT string_agg(format('%s = %s', col, CASE WHEN fk.action = 'n' THEN 'NULL' ELSE 'DEFAULT' END), ', ')
           FROM unnest(fk.cols) AS col),
        v_pred);
    END IF;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
  END LOOP;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public._e2e_purge_user_data(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Release: the test is done with this user
-- ---------------------------------------------------------------------------
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
  RETURN jsonb_build_object('released', true, 'dependent_rows', public._e2e_purge_user_data(p_user_id));
END;
$$;

REVOKE ALL ON FUNCTION public.e2e_release_test_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.e2e_release_test_user(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Claim: hand a released user to the next test, or refuse
-- ---------------------------------------------------------------------------
-- p_profile: the profile row createTestUser inserts for a fresh user (keys that are not profiles
-- columns are ignored; columns not given take their defaults). p_user_metadata: what createUser
-- would have stored. p_password: the e2e test password, to prove it was not changed.
-- p_session_id: the session of the worker's cached sign-in, if any; the answer says whether it is
-- still alive (a test that signed out deleted it, and its tokens must not be reused).
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
  END;
  IF v_reason IS NOT NULL THEN
    RETURN jsonb_build_object('reusable', false, 'reason', v_reason);
  END IF;

  -- Anything written against the user since release (a late write from the previous test) goes.
  PERFORM public._e2e_purge_user_data(p_user_id);

  UPDATE auth.users
     SET raw_user_meta_data = coalesce(p_user_metadata, '{}'::jsonb),
         raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'))
   WHERE id = p_user_id;

  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_cols
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = 'public.profiles'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname IN (SELECT jsonb_object_keys(p_profile || jsonb_build_object('id', p_user_id)));
  EXECUTE format('INSERT INTO public.profiles (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::public.profiles, $1)', v_cols)
    USING p_profile || jsonb_build_object('id', p_user_id, 'email', u.email);

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

-- ---------------------------------------------------------------------------
-- 4. Counts in one request (the sweeper's dry run; users created per run)
-- ---------------------------------------------------------------------------
-- The sweeper's dry run used to page through every auth user (full objects, 1000 per page) to
-- count. This answers the same question with one indexed scan and returns three numbers.
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
  SELECT jsonb_build_object(
           'auth_users', count(*),
           'e2e', count(*) FILTER (WHERE u.email ~ c_e2e_email),
           'e2e_older', count(*) FILTER (WHERE u.email ~ c_e2e_email AND u.created_at < now() - p_older_than))
    INTO v
    FROM auth.users u;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.e2e_test_user_counts(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.e2e_test_user_counts(interval) TO service_role;
