-- P1729: signing in no longer wipes the profile banner (or bio).
--
-- diffed against: 20261008232000_p1321_profile_email_follows_auth.sql (upsert_my_profile, its
--   latest definition). diff: three ON CONFLICT assignments (bio, banner_url,
--   banner_generation_attempted) keep the stored value when p_data does not carry the key.
--   Everything else, including the INSERT branch for a new row, is verbatim. Signature, owner
--   and grants unchanged (CREATE OR REPLACE keeps them).
--
-- client-safe: the only deployed caller (AuthCallbackPage) never sends these three keys, so for
--   it the change is "stop overwriting them with NULL / false". A caller that does send a key
--   still writes it exactly as before.
--
-- Root cause: every /auth/callback run (each sign-in) calls upsert_my_profile with a p_data
-- that has no bio / banner_url / banner_generation_attempted. ON CONFLICT DO UPDATE set them to
-- EXCLUDED, i.e. NULL, NULL, false. The owner's next visit to their own profile then saw
-- !bannerUrl && !bannerGenerationAttempted and the P504 lazy effect generated an AI banner over
-- the hand-set one. banner_mobile_url is not in the function's column list, which is why the
-- phone banner survived both incidents.

CREATE OR REPLACE FUNCTION public.upsert_my_profile(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := auth.uid();
  v_email text;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'upsert_my_profile requires an authenticated caller';
  END IF;

  IF public.is_reserved_agent_name(p_data->>'name') THEN
    RAISE EXCEPTION 'display name may not use the reserved "Agent ·" marker prefix';
  END IF;

  IF public.is_reserved_agent_slug(p_data->>'slug')
     OR public.is_reserved_machine_slug(p_data->>'slug') THEN
    RAISE EXCEPTION 'profile slug may not use the reserved "agent-" or "machine-" prefix';
  END IF;

  -- P1321 L3: the email is the caller's auth record, whatever p_data carries.
  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_id;

  INSERT INTO public.profiles (
    id, email, name, slug, role, linkedin_url, reason,
    avatar_color, avatar_url, avatar_provider, is_verified,
    pledge_version, has_pledged, accepted_terms_version,
    bio, banner_url, banner_generation_attempted
  ) VALUES (
    v_id,
    v_email, p_data->>'name', p_data->>'slug', p_data->>'role',
    p_data->>'linkedin_url', p_data->>'reason', p_data->>'avatar_color',
    p_data->>'avatar_url', p_data->>'avatar_provider',
    false,
    COALESCE((p_data->>'pledge_version')::integer, 2),
    false,
    p_data->>'accepted_terms_version', p_data->>'bio', p_data->>'banner_url',
    COALESCE((p_data->>'banner_generation_attempted')::boolean, false)
  )
  ON CONFLICT (id) DO UPDATE SET
    email                       = EXCLUDED.email,
    name                        = EXCLUDED.name,
    slug                        = EXCLUDED.slug,
    role                        = EXCLUDED.role,
    linkedin_url                = EXCLUDED.linkedin_url,
    reason                      = EXCLUDED.reason,
    avatar_color                = EXCLUDED.avatar_color,
    avatar_url                  = EXCLUDED.avatar_url,
    avatar_provider             = EXCLUDED.avatar_provider,
    pledge_version              = EXCLUDED.pledge_version,
    accepted_terms_version      = EXCLUDED.accepted_terms_version,
    -- P1729: a key the caller did not send keeps the stored value (sign-in sends none of these)
    bio                         = CASE WHEN p_data ? 'bio' THEN EXCLUDED.bio ELSE public.profiles.bio END,
    banner_url                  = CASE WHEN p_data ? 'banner_url' THEN EXCLUDED.banner_url ELSE public.profiles.banner_url END,
    banner_generation_attempted = CASE WHEN p_data ? 'banner_generation_attempted' THEN EXCLUDED.banner_generation_attempted ELSE public.profiles.banner_generation_attempted END,
    updated_at                  = timezone('utc', now());

  RETURN jsonb_build_object('id', v_id);
END;
$$;
