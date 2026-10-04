-- P1413: optional phone banner on profiles, same pattern as events.banner_mobile_url (P1354).
--
-- client-safe: additive nullable column; get_profile_by_id keeps its signature and every key,
--   and gains one ('banner_mobile_url').
-- diffed against: 20260908110000_p1259_profile_description_and_links.sql (get_profile_by_id,
--   its latest definition). diff: ONE key added after 'banner_url'. Everything else, including
--   the REVOKE/GRANT pair that re-applies P877's ACL, is byte-identical.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banner_mobile_url TEXT;

-- P877: a new profiles column is not readable by anon/authenticated until granted.
GRANT SELECT (banner_mobile_url) ON public.profiles TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_profile_by_id(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_is_self boolean;
  v_public_optin boolean;
BEGIN
  SELECT
    auth.uid() = p.id,
    (COALESCE(p.is_verified, false) AND COALESCE(p.has_pledged, false)) OR (auth.uid() = p.id),
    jsonb_build_object(
      'id',                           p.id,
      'slug',                         p.slug,
      'name',                         p.name,
      'role',                         p.role,
      'created_at',                   p.created_at,
      'is_verified',                  p.is_verified,
      'avatar_color',                 p.avatar_color,
      'avatar_url',                   p.avatar_url,
      'avatar_provider',              p.avatar_provider,
      'pledge_version',               p.pledge_version,
      'has_pledged',                  p.has_pledged,
      'bio',                          p.bio,
      'links',                        p.links,
      'banner_url',                   p.banner_url,
      'banner_mobile_url',            p.banner_mobile_url,
      'banner_generation_attempted',  p.banner_generation_attempted,
      'is_test_account',              p.is_test_account
    )
  INTO v_is_self, v_public_optin, v_result
  FROM public.profiles p
  WHERE p.id = p_id;

  IF v_result IS NULL THEN
    RETURN NULL;
  END IF;

  -- email: own row only
  v_result := v_result || jsonb_build_object(
    'email',
    CASE WHEN v_is_self THEN (SELECT email FROM public.profiles WHERE id = p_id) ELSE NULL END
  );

  -- linkedin_url / reason: public-by-design for verified+pledged, else own row only
  v_result := v_result || jsonb_build_object(
    'linkedin_url',
    CASE WHEN v_public_optin THEN (SELECT linkedin_url FROM public.profiles WHERE id = p_id) ELSE NULL END,
    'reason',
    CASE WHEN v_public_optin THEN (SELECT reason FROM public.profiles WHERE id = p_id) ELSE NULL END
  );

  RETURN v_result;
END;
$$;

-- CREATE OR REPLACE resets the function's ACL to the default, which on Supabase grants
-- EXECUTE to anon AND authenticated. Re-apply P877's lock explicitly rather than relying
-- on that default happening to match.
REVOKE EXECUTE ON FUNCTION public.get_profile_by_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_by_id(uuid) TO anon, authenticated;
