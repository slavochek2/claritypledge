-- diffed against: 20261001153000_p1381_admin_list_users.sql
-- client-safe: admin_list_users keeps its name, signature and column list; only the
-- row source, the email source and the ordering change. assert_admin is untouched.
--
-- P1381 adversarial-review fixes (Codex, Opus, Gemini; each verified on test/prod):
--   1. email comes from auth.users, not profiles. profiles.email is whatever the
--      client sent to upsert_my_profile, so a user could pose as anyone in the
--      founder's lookup. 15 TEST rows already disagree with their auth email.
--   2. Drive from auth.users, so a sign-up that never got a profile row (38 on prod)
--      is still findable. Name/slug are NULL for those; the page shows the email.
--   3. p.id/u.id as the final ORDER BY key. The page fetches in 1000-row .range()
--      pages, each a separate query; without a unique tiebreak, tied rows could be
--      skipped or duplicated across a page boundary.

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
    u.id,
    p.slug,
    p.name,
    u.email::text,
    p.linkedin_url,
    p.avatar_url,
    p.avatar_color,
    COALESCE(p.is_verified, false),
    COALESCE(p.has_pledged, false),
    COALESCE(p.created_at, u.created_at),
    u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE COALESCE(p.is_test_account, false) = false
  ORDER BY u.last_sign_in_at DESC NULLS LAST, COALESCE(p.created_at, u.created_at) DESC, u.id;
END;
$$;

-- CREATE OR REPLACE keeps the existing ACL; re-asserted so this file stands alone.
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
