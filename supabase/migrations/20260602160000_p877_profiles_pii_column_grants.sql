-- P877: profiles directory PII (email, linkedin_url, reason) readable via the anon key.
--
-- new function: get_profile_by_id, get_profile_by_slug, get_featured_profiles,
--   get_my_profile_by_email, lookup_party_by_email, email_exists, upsert_my_profile
--   (all introduced here — no prior version to diff against).
--
-- Root cause: the `profiles` RLS SELECT policy is `using (true)` with no column
-- scoping, and the default Supabase grants give `anon` + `authenticated` SELECT on
-- ALL columns. RLS is row-level only — it does NOT gate columns. So the public anon
-- key (shipped in the browser bundle) can bulk-read every user's email, linkedin_url,
-- and self-disclosed `reason`. Column-level GRANT/REVOKE is the only mechanism that
-- scopes columns; it was never applied.
--
-- Fix (two parts, in this order so direct reads never break the wall):
--   1. SECURITY DEFINER accessors that re-expose the sensitive columns through
--      opted-in, PII-safe paths (own row only for email; verified+pledged only for
--      linkedin_url/reason, which are public BY DESIGN on the signature wall).
--   2. REVOKE SELECT (email, linkedin_url, reason) FROM anon, authenticated.
--      RLS `using(true)` may remain — it is orthogonal to column grants.
--
-- After the REVOKE, a direct `SELECT email FROM profiles` via the anon OR authenticated
-- key returns 42501 (permission denied). The reproduce canary
-- (e2e/integration/p877-reproduce.spec.ts) asserts that denial; the migration test
-- (20260602160000_p877_profiles_pii_column_grants.spec.ts) asserts the RPC contracts.
--
-- Precedent: get_letter_for_public_reading (P852) for the JSONB SECURITY DEFINER shape;
-- get_auth_user_by_email (P683) for the REVOKE/GRANT shape. Per decisions.md (2026-05-31),
-- all new SECURITY DEFINER functions use `SET search_path = ''` + schema-qualified refs.
--
-- Column whitelist note: every accessor below builds its JSONB output from an explicit
-- key list, and the table-level grant in section 3 lists the non-sensitive columns
-- explicitly. The three sensitive columns (email, linkedin_url, reason) — and any column
-- added to the table in future but not added to that grant — are not directly readable by
-- anon/authenticated; they are reachable only via these accessors (which run as the
-- function owner) or by service_role.

-- ============================================================================
-- 1a. get_profile_by_id — single profile by UUID (public + authenticated path)
-- ============================================================================
-- Returns display fields always; email only to the row owner; linkedin_url/reason
-- only when the profile is verified+pledged (public-by-design) OR the caller owns
-- the row. Backs getProfileResult() — used by AuthContext (own profile) and by
-- profile/badge/pledge/connections pages (other users). NULL when no row.

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
      'banner_url',                   p.banner_url,
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

-- ============================================================================
-- 1b. get_profile_by_slug — single profile by slug (same shape as get_profile_by_id)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_profile_by_slug(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.profiles WHERE slug = p_slug;
  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN public.get_profile_by_id(v_id);
END;
$$;

-- ============================================================================
-- 1c. get_featured_profiles — verified+pledged list (landing wall + /pledgers)
-- ============================================================================
-- Every returned row is verified+pledged, so linkedin_url/reason are public by
-- design and always included. No email is ever returned. p_limit NULL = all rows
-- (backs getVerifiedProfiles); a value caps the set (backs getFeaturedProfiles).

CREATE OR REPLACE FUNCTION public.get_featured_profiles(p_limit integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(row_obj ORDER BY created_at DESC), '[]'::jsonb)
  FROM (
    SELECT
      p.created_at,
      jsonb_build_object(
        'id',               p.id,
        'slug',             p.slug,
        'name',             p.name,
        'role',             p.role,
        'linkedin_url',     p.linkedin_url,
        'reason',           p.reason,
        'created_at',       p.created_at,
        'is_verified',      p.is_verified,
        'avatar_color',     p.avatar_color,
        'avatar_url',       p.avatar_url,
        'avatar_provider',  p.avatar_provider
      ) AS row_obj
    FROM public.profiles p
    WHERE p.is_verified = true
      AND p.has_pledged = true
      AND COALESCE(p.is_test_account, false) = false
    ORDER BY p.created_at DESC
    LIMIT p_limit
  ) sub;
$$;

-- ============================================================================
-- 1d. get_my_profile_by_email — caller's own profile by email (/live migration)
-- ============================================================================
-- The /live → magic-link migration in AuthCallbackPage looks up the user's OLD
-- anonymous profile by email (different auth id, same email). Only returns a row
-- when the requested email belongs to the authenticated caller — so it cannot be
-- used to read anyone else's PII. Returns the full row incl. email/linkedin/reason
-- (it is the caller's own data).

CREATE OR REPLACE FUNCTION public.get_my_profile_by_email(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_email text;
BEGIN
  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
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
    LIMIT 1
  );
END;
$$;

-- ============================================================================
-- 1e. lookup_party_by_email — resolve an invitee to an agreement party (no email out)
-- ============================================================================
-- Backs agreementsService.lookupUserByEmail (addressing an agreement invite to an
-- existing user). Returns ONLY display fields needed to render the party; the email
-- is never serialized back. authenticated-only (invites require a session).

CREATE OR REPLACE FUNCTION public.lookup_party_by_email(p_email text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id',            p.id,
    'name',          p.name,
    'slug',          p.slug,
    'avatar_color',  p.avatar_color,
    'avatar_url',    p.avatar_url,
    'has_pledged',   p.has_pledged
  )
  FROM public.profiles p
  WHERE lower(p.email) = lower(p_email)
  LIMIT 1;
$$;

-- ============================================================================
-- 1f. email_exists — does a profile with this email exist? (login form)
-- ============================================================================
-- Backs checkEmailExists, called pre-auth by the login form to decide whether to
-- send a magic link. Returns only a boolean — never the email or any other field.
-- This is the same email-enumeration signal the prior direct query already exposed
-- to anon; it is not widened here.

CREATE OR REPLACE FUNCTION public.email_exists(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE lower(p.email) = lower(trim(p_email))
  );
$$;

-- ============================================================================
-- 1g. upsert_my_profile — write the caller's OWN profile row
-- ============================================================================
-- Why this exists: after the SELECT revoke below, a client-side `.upsert()` fails
-- even for the row owner — supabase-js emits `ON CONFLICT (id) DO UPDATE SET
-- email = EXCLUDED.email`, and reading EXCLUDED.email requires SELECT on email,
-- which is revoked. This SECURITY DEFINER accessor runs as the function owner (full
-- privileges) and forces id = auth.uid(), so a caller can only ever write their own
-- row. Backs the AuthCallbackPage signup/upsert path and the e2e profile fixture.
-- (Plain UPDATEs that set literals — e.g. updateProfile — do NOT need this; only the
-- EXCLUDED-reading upsert does.)

CREATE OR REPLACE FUNCTION public.upsert_my_profile(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := auth.uid();
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'upsert_my_profile requires an authenticated caller';
  END IF;

  -- id is always the caller's own — any id in p_data is ignored.
  INSERT INTO public.profiles (
    id, email, name, slug, role, linkedin_url, reason,
    avatar_color, avatar_url, avatar_provider, is_verified,
    pledge_version, has_pledged, accepted_terms_version,
    bio, banner_url, banner_generation_attempted
  ) VALUES (
    v_id,
    p_data->>'email',
    p_data->>'name',
    p_data->>'slug',
    p_data->>'role',
    p_data->>'linkedin_url',
    p_data->>'reason',
    p_data->>'avatar_color',
    p_data->>'avatar_url',
    p_data->>'avatar_provider',
    COALESCE((p_data->>'is_verified')::boolean, false),
    COALESCE((p_data->>'pledge_version')::integer, 2),
    COALESCE((p_data->>'has_pledged')::boolean, true),
    p_data->>'accepted_terms_version',
    p_data->>'bio',
    p_data->>'banner_url',
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
    is_verified                 = EXCLUDED.is_verified,
    pledge_version              = EXCLUDED.pledge_version,
    has_pledged                 = EXCLUDED.has_pledged,
    accepted_terms_version      = EXCLUDED.accepted_terms_version,
    bio                         = EXCLUDED.bio,
    banner_url                  = EXCLUDED.banner_url,
    banner_generation_attempted = EXCLUDED.banner_generation_attempted,
    updated_at                  = timezone('utc', now());

  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- ============================================================================
-- 2. Grants — lock each accessor to the roles that need it
-- ============================================================================
-- Supabase's default privileges GRANT EXECUTE on new public functions to anon AND
-- authenticated explicitly — so REVOKE FROM PUBLIC alone is NOT enough to lock a
-- function down (P683 precedent). Revoke from PUBLIC, anon, AND authenticated by name,
-- then grant back only to the roles each function needs.

REVOKE EXECUTE ON FUNCTION public.get_profile_by_id(uuid)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_profile_by_slug(text)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_featured_profiles(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_profile_by_email(text)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lookup_party_by_email(text)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_exists(text)             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_my_profile(jsonb)       FROM PUBLIC, anon, authenticated;

-- Public profile reads + featured wall + login email check: anon + authenticated.
GRANT EXECUTE ON FUNCTION public.get_profile_by_id(uuid)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_by_slug(text)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_featured_profiles(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_exists(text)             TO anon, authenticated;

-- Own-profile-by-email (migration) + invite-party lookup + own-profile write:
-- authenticated only (all require a session; the writer forces id = auth.uid()).
GRANT EXECUTE ON FUNCTION public.get_my_profile_by_email(text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_party_by_email(text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_my_profile(jsonb)       TO authenticated;

-- ============================================================================
-- 3. The column gate — the actual leak fix
-- ============================================================================
-- RLS `using(true)` remains (row-level, orthogonal to columns).
--
-- IMPORTANT Postgres semantics: a column-level `REVOKE SELECT (email)` does NOTHING
-- when the role holds a TABLE-level SELECT grant (the Supabase default grants SELECT
-- on the whole table to anon+authenticated). Column-level revokes do not subtract from
-- a table-level grant. The only correct gate is to drop the table-level SELECT and then
-- re-grant SELECT at the column level on the non-sensitive columns only.
--
-- email, linkedin_url, reason are deliberately OMITTED from the grant below — they are
-- reachable only via the SECURITY DEFINER accessors above (which run as the function
-- owner and bypass these grants). After this, a direct select/filter on any of the three
-- via the anon OR authenticated key returns 42501.
--
-- Maintenance note: a NEW profiles column is NOT readable by anon/authenticated until it
-- is added to this GRANT. That default-deny is intentional — add new non-sensitive columns
-- here; route new sensitive columns through an accessor instead.

REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT (
  id, name, role, avatar_color, is_verified, created_at, updated_at, slug,
  pledge_version, accepted_terms_version, has_pledged, avatar_url, avatar_provider,
  ears_count, verification_session_count, bio, banner_url, banner_generation_attempted,
  is_test_account, is_certifier
) ON public.profiles TO anon, authenticated;

COMMENT ON FUNCTION public.get_profile_by_id(uuid) IS
  'P877: profile by id. email→owner only; linkedin_url/reason→verified+pledged or owner. Replaces direct profiles.select(*).';
COMMENT ON FUNCTION public.get_featured_profiles(integer) IS
  'P877: verified+pledged public profiles. p_limit NULL = all (/pledgers), value = top-N (landing). No email.';
