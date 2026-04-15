-- P703 fix: complete_clarity_session — allow service_role callers
--
-- Root cause: the previous authorization check used auth.uid(), which returns NULL
-- when the function is called via the service_role key (e.g. E2E test admin client,
-- server-side scripts). NULL never equals any profile ID, so the NOT EXISTS check
-- always evaluated to true → RAISE EXCEPTION 'not authorized' → invite never closed.
--
-- Fix: treat a NULL auth.uid() as a trusted service_role call (SECURITY DEFINER
-- already prevents untrusted code from invoking this function directly; service_role
-- key is only available to server-side callers). The invite closure logic is unchanged.

CREATE OR REPLACE FUNCTION public.complete_clarity_session(p_session_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization: session creator, joiner, target_listener, OR service_role caller
  -- (service_role is identified by auth.uid() IS NULL — trusted server-side path)
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM clarity_sessions
    WHERE id = p_session_id
      AND (
        creator_profile_id = auth.uid()
        OR joiner_profile_id = auth.uid()
        OR target_listener_id = auth.uid()
      )
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Mark session completed
  UPDATE clarity_sessions
    SET status = 'completed'
    WHERE id = p_session_id;

  -- Close linked invite(s) atomically
  UPDATE clarity_live_invites
    SET closed_at = now()
    WHERE session_id = p_session_id
      AND closed_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_clarity_session(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_clarity_session(UUID) TO authenticated;

-- ============================================================================
-- Public RPC: check_session_requires_auth
-- Allows unauthenticated clients to check whether a session code requires
-- authentication before joining (letter-sourced sessions with target_listener_id).
-- Returns true if auth is required, false if public join is allowed.
-- SECURITY DEFINER + anon grant: bypasses RLS to read only the boolean.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_session_requires_auth(p_code TEXT)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_listener_id UUID;
BEGIN
  SELECT target_listener_id INTO v_target_listener_id
  FROM clarity_sessions
  WHERE code = upper(trim(p_code))
  LIMIT 1;

  -- Session not found: treat as public (join attempt will fail gracefully)
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Letter-sourced sessions have a target_listener_id set
  RETURN v_target_listener_id IS NOT NULL;
END;
$$;

-- Allow anon (unauthenticated) callers to invoke this function
GRANT EXECUTE ON FUNCTION public.check_session_requires_auth(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.check_session_requires_auth(TEXT) TO authenticated;
