-- P1453: artist-style profile banners carry a credit ("after <artist>") and a signature ink.
--
-- client-safe: additive nullable column; get_profile_by_id keeps its signature and every key,
--   and gains one ('banner_credit'). The new guard trigger only pins a column no client writes.
-- diffed against: 20261004200000_p1413_profile_banner_mobile_url.sql (get_profile_by_id, its
--   latest definition). diff: ONE key added after 'banner_mobile_url'. Everything else, including
--   the REVOKE/GRANT pair that re-applies P877's ACL, is byte-identical.
--
-- banner_credit = { url, artist, sig, movement, ink, fidelity }. `url` is the banner the credit
-- belongs to: the client shows it only while profiles.banner_url equals it, so a removed or
-- replaced banner (a plain client write of banner_url) never shows a stale credit, and the client
-- never needs to write this column. Written only by the generate-banner / generate-agent-banner
-- edge functions with the service role.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banner_credit jsonb;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_banner_credit_shape;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_banner_credit_shape CHECK (
  banner_credit IS NULL
  OR (jsonb_typeof(banner_credit) = 'object' AND banner_credit->>'ink' IN ('cream', 'sepia'))
);

-- P877: a new profiles column is not readable by anon/authenticated until granted.
GRANT SELECT (banner_credit) ON public.profiles TO anon, authenticated;

-- ============================================================================
-- Guard: client roles cannot write banner_credit (P880 technique, separate function)
-- ============================================================================
-- new function
-- profiles UPDATE is a table-level grant guarded by triggers (P886), so a new column is
-- client-writable unless a trigger pins it. SECURITY INVOKER (the default) on purpose: under
-- SECURITY DEFINER current_user would always be the owner and the client check would collapse.
-- A separate function rather than an edit of guard_profile_trust_columns (P880/P878), so that
-- shared function is not redefined.
CREATE OR REPLACE FUNCTION public.guard_profile_banner_credit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.banner_credit := NULL;
    ELSE  -- UPDATE
      NEW.banner_credit := OLD.banner_credit;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_banner_credit ON public.profiles;
CREATE TRIGGER guard_profile_banner_credit
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_banner_credit();

-- ============================================================================
-- Read path: get_profile_by_id gains 'banner_credit' (get_profile_by_slug delegates to it)
-- ============================================================================
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
      'banner_credit',                p.banner_credit,
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
