-- P683: SECURITY DEFINER helper to look up auth.users by email (case-insensitive).
--
-- PostgREST blocks direct access to the auth schema from edge functions
-- (PGRST106: schema must be public or graphql_public), so this RPC bridges
-- the gap for the orphan-account recovery path in create-and-open-letter.
--
-- Called by the edge function (service_role) after a profiles lookup returns
-- null, to detect whether an orphan auth.users row exists (auth user created
-- but profiles insert failed mid-flow).

CREATE OR REPLACE FUNCTION public.get_auth_user_by_email(p_email text)
RETURNS TABLE (id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.email::text
  FROM auth.users u
  WHERE LOWER(u.email) = LOWER(TRIM(p_email))
  LIMIT 1;
END;
$$;

-- Only service_role should call this RPC (edge functions run as service_role).
-- Revoke from PUBLIC first (covers anon + authenticated), then grant selectively.
REVOKE EXECUTE ON FUNCTION public.get_auth_user_by_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_auth_user_by_email(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_auth_user_by_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_by_email(text) TO service_role;
