-- P1490 (part 2): get_my_profile_by_email returns only a row the caller may see.
--
-- diffed against: 20260602160000_p877_profiles_pii_column_grants.sql (its only definition).
--   Signature, return shape and every output key unchanged. Changed: the row filter (see below)
--   and a deterministic preference for the caller's own row. The REVOKE/GRANT pair re-applies
--   P877's ACL verbatim.
-- client-safe: the one deployed caller (AuthCallbackPage's /live migration branch) asks for the
--   session's own address and uses the result only when it is a legacy /live profile — exactly
--   the rows still returned. Every other row it could previously receive belonged to a different
--   regular account, which migrate_live_profile (P1137) already refuses to migrate.
--
-- The address match alone is not an ownership check: a stored profile address can equal the
-- caller's (or differ only in letter case) while the row belongs to another account. The
-- function now returns a matching row only when it is
--   * the caller's own profile, or
--   * a legacy /live profile — owned by an ANONYMOUS auth user — and the caller's address is
--     confirmed. Same provenance rule migrate_live_profile applies before migrating such a row.
-- The caller's own row is preferred when both exist.

CREATE OR REPLACE FUNCTION public.get_my_profile_by_email(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_caller_email text;
  v_confirmed    boolean;
BEGIN
  SELECT u.email, (u.email_confirmed_at IS NOT NULL)
    INTO v_caller_email, v_confirmed
  FROM auth.users u WHERE u.id = v_uid;

  IF v_caller_email IS NULL OR lower(v_caller_email) <> lower(p_email) THEN
    RETURN NULL;
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'id',                           p.id,
      'slug',                         p.slug,
      'name',                         p.name,
      'email',                        p.email,
      'role',                         p.role,
      'linkedin_url',                 p.linkedin_url,
      'reason',                       p.reason,
      'created_at',                   p.created_at,
      'is_verified',                  p.is_verified,
      'avatar_color',                 p.avatar_color,
      'avatar_url',                   p.avatar_url,
      'avatar_provider',              p.avatar_provider,
      'pledge_version',               p.pledge_version,
      'has_pledged',                  p.has_pledged,
      'accepted_terms_version',       p.accepted_terms_version,
      'bio',                          p.bio,
      'banner_url',                   p.banner_url,
      'banner_generation_attempted',  p.banner_generation_attempted,
      'is_test_account',              p.is_test_account
    )
    FROM public.profiles p
    WHERE lower(p.email) = lower(p_email)
      AND (
        p.id = v_uid
        OR (
          COALESCE(v_confirmed, false)
          AND EXISTS (
            SELECT 1 FROM auth.users o
            WHERE o.id = p.id AND COALESCE(o.is_anonymous, false)
          )
        )
      )
    ORDER BY (p.id = v_uid) DESC, p.id
    LIMIT 1
  );
END;
$$;

-- Re-apply P877's lock explicitly (both forms: Supabase default privileges grant EXECUTE to anon
-- and authenticated directly, not only through PUBLIC).
REVOKE EXECUTE ON FUNCTION public.get_my_profile_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_my_profile_by_email(text) TO authenticated;

COMMENT ON FUNCTION public.get_my_profile_by_email(text) IS
  'P877/P1490: the caller''s own profile, or a legacy /live profile (anonymous owner) matching the '
  'caller''s confirmed address, case-insensitively. Never another regular account''s row.';
