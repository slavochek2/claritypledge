-- P1544: terms version v1.4 -> v1.5 (the mirror agent reads chat text and sends it to the Gemini API).
--
-- new function body: consume_pending_terms_acceptance(text) records only v1.5 from now on.
-- client-safe: same signature, same grants, same return type; only the pinned literal changes.
-- A pending intent minted by an old server for v1.4 is refused (returns NULL, consumed): the
-- sign-in link then records nothing and the blocking popup asks for v1.5 on the next screen.
--
-- Mirrors SERVER_CURRENT_TERMS_VERSION (supabase/functions/_shared/terms-version.ts) and
-- CURRENT_TERMS_VERSION (src/lib/constants.ts); src/tests/p1487-terms-version-single-source.test.ts
-- keeps all three equal. The body is the one from 20261014183307_p1487_pending_terms_bound_to_link.sql
-- with that single literal changed.

CREATE OR REPLACE FUNCTION public.consume_pending_terms_acceptance(p_nonce text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_current_version CONSTANT text := 'v1.5';
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
