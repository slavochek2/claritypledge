-- new function
-- client-safe: both functions are new; no deployed client calls them, so the REVOKEs remove nothing a client relies on.
-- P1381: founder-only user lookup (/admin/users).
--
-- THE GATE IS HERE, NOT IN THE CLIENT. The repo is public (AGPL), so every
-- client check is readable and skippable by anyone holding the anon key. What
-- cannot be forged from outside is `profiles.is_admin`:
--   - default-deny SELECT (never in a column GRANT, P878/P886), so a client
--     cannot even read it;
--   - pinned on every anon/authenticated write by guard_profile_trust_columns
--     (P880, re-asserted in p1212), so a client cannot set it.
-- Admin is therefore granted only by a direct DB write from the service role.
--
-- 1. public.assert_admin() — the ONE reusable admin gate. Every present and
--    future admin-only RPC calls it as its first statement. It reads auth.uid()
--    (NULL for anon -> not admin, P975 pattern) and RAISEs otherwise.
-- 2. public.admin_list_users() — the user list. RETURNS TABLE with an explicit
--    column list; from auth.users it reads id + last_sign_in_at only.
--
-- EXECUTE is revoked from PUBLIC *and anon by name*: Supabase default
-- privileges grant new functions to anon as a role, which a PUBLIC revoke does
-- not remove (see 20260818090000_p1093 comment).

CREATE OR REPLACE FUNCTION public.assert_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT COALESCE(
    (SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()),
    false
  ) THEN
    -- Generic message: never confirm to a caller that an admin surface exists.
    RAISE EXCEPTION 'not found' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assert_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.assert_admin() FROM authenticated;
-- Not callable by clients at all: it is only invoked from inside other
-- SECURITY DEFINER functions, which run as the owner.

COMMENT ON FUNCTION public.assert_admin() IS
  'P1381: the shared admin gate. Call as the FIRST statement of every admin-only SECURITY DEFINER RPC. RAISEs 42501 unless profiles.is_admin is true for auth.uid(). Not executable by clients.';

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id              uuid,
  slug            text,
  name            text,
  email           text,
  linkedin_url    text,
  avatar_url      text,
  avatar_color    text,
  is_verified     boolean,
  has_pledged     boolean,
  created_at      timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN QUERY
  SELECT
    p.id,
    p.slug,
    p.name,
    p.email,
    p.linkedin_url,
    p.avatar_url,
    p.avatar_color,
    COALESCE(p.is_verified, false),
    COALESCE(p.has_pledged, false),
    p.created_at,
    u.last_sign_in_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE COALESCE(p.is_test_account, false) = false
  ORDER BY u.last_sign_in_at DESC NULLS LAST, p.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

COMMENT ON FUNCTION public.admin_list_users() IS
  'P1381: founder-only user list for /admin/users. Gated by public.assert_admin(). Returns email + linkedin_url for every non-test profile, so the gate must never be removed.';
