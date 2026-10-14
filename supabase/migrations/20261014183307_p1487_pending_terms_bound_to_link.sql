-- P1487: a pending terms acceptance is recorded only by the sign-in link it was issued with.
--
-- new function: consume_pending_terms_acceptance(text). The zero-argument version from
-- 20261014171731 is dropped (it never reached prod).
-- client-safe: the only caller is the sign-in callback shipped in the same change; a client that
--   still calls the zero-argument version gets a "function not found" error, which it logs and
--   ignores (the call is non-fatal by design).
--
-- Changes from 20261014171731:
--   - the intent carries a nonce that travels only in the emailed sign-in link (`terms_nonce`);
--     the acceptance is recorded only when the signed-in caller presents that nonce. A sign-in by
--     any other route (another email link, OAuth) records nothing and leaves the intent to expire;
--   - lifetime is one hour, the same as the link;
--   - only the current terms version is recorded (mirrors SERVER_CURRENT_TERMS_VERSION in
--     supabase/functions/_shared/terms-version.ts and CURRENT_TERMS_VERSION in
--     src/lib/constants.ts; src/tests/p1487-terms-version-single-source.test.ts keeps all three
--     equal).
-- Unchanged: the intent lives in app_metadata (service-role-only), the caller's email must be
-- confirmed, it is recorded for the caller only, and it is consumed exactly once.

DROP FUNCTION IF EXISTS public.consume_pending_terms_acceptance();

CREATE OR REPLACE FUNCTION public.consume_pending_terms_acceptance(p_nonce text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_current_version CONSTANT text := 'v1.4';
  v_uid     uuid := auth.uid();
  v_pending jsonb;
  v_version text;
  v_issued  timestamptz;
  v_headers json;
BEGIN
  IF v_uid IS NULL OR p_nonce IS NULL OR length(p_nonce) < 32 THEN
    RETURN NULL;
  END IF;

  SELECT u.raw_app_meta_data -> 'pending_terms'
    INTO v_pending
    FROM auth.users u
   WHERE u.id = v_uid
     AND u.email_confirmed_at IS NOT NULL
   FOR UPDATE;

  IF v_pending IS NULL OR jsonb_typeof(v_pending) <> 'object' THEN
    RETURN NULL;
  END IF;

  -- Not this link's intent: leave it alone (it expires on its own).
  IF (v_pending ->> 'nonce') IS DISTINCT FROM p_nonce THEN
    RETURN NULL;
  END IF;

  -- Consume: whatever happens below, this intent is never read again.
  UPDATE auth.users
     SET raw_app_meta_data = raw_app_meta_data - 'pending_terms'
   WHERE id = v_uid;

  v_version := v_pending ->> 'version';
  IF v_version IS DISTINCT FROM c_current_version THEN
    RETURN NULL;
  END IF;
  BEGIN
    v_issued := (v_pending ->> 'issued_at')::timestamptz;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  IF v_issued IS NULL OR v_issued < now() - interval '1 hour' OR v_issued > now() + interval '5 minutes' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_headers := current_setting('request.headers', true)::json;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;

  INSERT INTO public.terms_acceptances (user_id, terms_version, user_agent, acceptance_mode)
  VALUES (v_uid, v_version, left(v_headers ->> 'user-agent', 500), 'explicit')
  ON CONFLICT (user_id, terms_version) DO NOTHING;

  RETURN v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_pending_terms_acceptance(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_pending_terms_acceptance(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.consume_pending_terms_acceptance(text) TO authenticated, service_role;
