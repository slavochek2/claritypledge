-- P1487: record a terms acceptance made before the user had a session, once, from server-held intent.
--
-- new function
-- client-safe: adds one function; no existing grant, policy or response shape changes. Until a
--   client calls it, nothing changes.
--
-- A new letter reader or agreement partner accepts the terms when they press "Open" / "Sign",
-- before they have an account. The edge function that then emails their one-time sign-in link
-- stores the accepted version in the account's app_metadata (`pending_terms`: version + issued_at)
-- — app_metadata is writable only by the service role, so no client can create or alter it.
-- After the person signs in through that link, the app calls this function: it records the audit
-- row for the stored version, for the caller only, and only if the caller's email is confirmed,
-- then clears the intent so it is consumed exactly once. Nothing in the request (no URL
-- parameter, no argument) chooses what is recorded. An intent older than one day is discarded
-- without recording.
--
-- Returns the recorded version, or NULL when there was nothing (valid) to record.

CREATE OR REPLACE FUNCTION public.consume_pending_terms_acceptance()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_pending jsonb;
  v_version text;
  v_issued  timestamptz;
  v_headers json;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT u.raw_app_meta_data -> 'pending_terms'
    INTO v_pending
    FROM auth.users u
   WHERE u.id = v_uid
     AND u.email_confirmed_at IS NOT NULL
   FOR UPDATE;

  IF v_pending IS NULL THEN
    RETURN NULL;
  END IF;

  -- Consume first: whatever happens below, this intent is never read again.
  UPDATE auth.users
     SET raw_app_meta_data = raw_app_meta_data - 'pending_terms'
   WHERE id = v_uid;

  IF jsonb_typeof(v_pending) <> 'object' THEN
    RETURN NULL;
  END IF;
  v_version := v_pending ->> 'version';
  IF v_version IS NULL OR v_version !~ '^v[0-9]+\.[0-9]+$' THEN
    RETURN NULL;
  END IF;
  BEGIN
    v_issued := (v_pending ->> 'issued_at')::timestamptz;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  IF v_issued IS NULL OR v_issued < now() - interval '1 day' OR v_issued > now() + interval '5 minutes' THEN
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

REVOKE ALL ON FUNCTION public.consume_pending_terms_acceptance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_pending_terms_acceptance() FROM anon;
GRANT EXECUTE ON FUNCTION public.consume_pending_terms_acceptance() TO authenticated, service_role;
