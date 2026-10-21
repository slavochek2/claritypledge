-- P1532 — e2e_claim_test_user wrote a profile without its email.
--
-- diffed against: 20261021130000_p1532_e2e_user_pool.sql
--
-- redefines public.e2e_claim_test_user(uuid, jsonb, jsonb, text, uuid) from
--   20261021130000_p1532_e2e_user_pool.sql (same branch, not yet on prod). The only change: the
--   INSERT column list was built from the caller's keys plus `id`, so `email`, which the function
--   adds itself, was passed in the row but left out of the column list, and every claim failed on
--   profiles.email NOT NULL. Found by e2e/integration/p1532-user-pool.spec.ts on its first run. Now
--   one row (caller's keys + id + email) feeds both the column list and the values.
--
-- client-safe: redefines a function created on this branch that has no client caller; the REVOKE is
--   on that same function.

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
