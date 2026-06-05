-- P880: Verification-state self-promotion guard.
--
-- client-safe: the only pre-commit-flagged shape is REVOKE EXECUTE on two BRAND-NEW
--   functions (mark_self_verified, set_my_pledge), each immediately re-GRANTed to
--   authenticated — no deployed bundle references them, so no live client breaks.
-- DEPLOY COUPLING (NOT a REVOKE/DROP shape, so not auto-gated): upsert_my_profile is
--   re-defined to stop setting is_verified/has_pledged. Applying this to prod while a
--   PRE-P880 bundle is live means new signups land unverified (the old bundle doesn't
--   call mark_self_verified). Deploy the P880 frontend bundle BEFORE applying to prod.
--   See the spec's Pre-deploy Checklist. (cf. the 2026-06-04 P877/P886 ordering incident.)
--
-- Bug: an authenticated user could set their own profiles.is_verified /
-- profiles.has_pledged to true via THREE client surfaces, with no server check —
-- earning the verified badge + the public pledger wall without verifying email or
-- completing the pledge flow (reproduced: e2e/p880-reproduce.spec.ts):
--
--   Surface 1 — direct RLS UPDATE. The live UPDATE policy (P571,
--     20260322120000_p571_is_test_account.sql) WITH CHECK pinned ONLY is_test_account;
--     is_verified / has_pledged were unconstrained.
--   Surface 2 — upsert_my_profile RPC (P877, 20260602160000). Its ON CONFLICT DO UPDATE
--     wrote both columns straight from caller-supplied JSON.
--   Surface 3 — delete-own-profile (20250117 DELETE policy, USING email = auth.email())
--     followed by a direct INSERT. The INSERT policy (20260219) WITH CHECK is auth.uid()=id
--     with no column scope, so the re-inserted row could carry is_verified/has_pledged=true.
--
-- Fix: the two trust columns become writable ONLY through two server-controlled
-- SECURITY DEFINER accessors, and a BEFORE INSERT/UPDATE guard trigger neutralizes any
-- attempt to set them from a client role (anon / authenticated).
--
--   * guard_profile_trust_columns()  — SECURITY INVOKER trigger. When current_user is a
--       client role (anon/authenticated) it pins is_verified/has_pledged to their prior
--       value (UPDATE) or to the unverified/un-pledged baseline (INSERT). SECURITY DEFINER
--       functions run as the table owner (current_user = the owner role, not a client
--       role) and so pass through; service_role (admin/tests) passes through too.
--       Deliberately NO GUC bypass flag: the client-settable public.set_config() escape
--       was removed in 20260403130000_security_drop_set_config.sql precisely because a
--       client-settable GUC is a trigger/RLS-bypass privilege-escalation vector.
--   * mark_self_verified()           — sets is_verified=true for auth.uid() ONLY when
--       auth.users.email_confirmed_at IS NOT NULL (the un-fakeable server signal).
--   * set_my_pledge(p_pledged bool)  — sets has_pledged for auth.uid(); a true transition
--       additionally requires is_verified=true (must be verified to join the pledger wall).
--
-- upsert_my_profile is re-defined here to STOP writing the two trust columns from caller
-- JSON: it runs as the owner and would otherwise bypass the guard (Surface 2). New rows
-- start is_verified=false / has_pledged=false; AuthCallbackPage then calls the two
-- accessors to set the legitimate values.
--
-- NOTE re "No Database Trigger for Profile Creation" (database.md): that rule forbids a
-- trigger that CREATES profiles. This guard does not create rows — it only constrains two
-- columns on writes that happen anyway. Profile creation still happens exclusively in
-- AuthCallbackPage via upsert_my_profile.

-- ============================================================================
-- 1. Guard trigger — neutralize client-role writes to the trust columns
-- ============================================================================
-- new function
-- SECURITY INVOKER (the default — do NOT add SECURITY DEFINER here, or current_user would
-- always be the owner and the client-vs-server distinction would collapse).
CREATE OR REPLACE FUNCTION public.guard_profile_trust_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Only client roles are constrained. The SECURITY DEFINER accessors (mark_self_verified,
  -- set_my_pledge, upsert_my_profile) run as the owner; service_role is the admin/test
  -- path. Both are trusted to set these columns and fall through untouched.
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_verified := false;
      NEW.has_pledged := false;
    ELSE  -- UPDATE
      NEW.is_verified := OLD.is_verified;
      NEW.has_pledged := OLD.has_pledged;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_trust_columns ON public.profiles;
CREATE TRIGGER guard_profile_trust_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_trust_columns();

-- ============================================================================
-- 2. mark_self_verified — the ONLY path that sets is_verified = true
-- ============================================================================
-- new function
-- Server-controlled: only flips is_verified to true when Supabase Auth reports the
-- caller's email as confirmed. An unverified (email_confirmed_at IS NULL) caller cannot
-- self-verify. Backs AuthCallbackPage (after the upsert) and the e2e fixture.
CREATE OR REPLACE FUNCTION public.mark_self_verified()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := auth.uid();
  v_confirmed boolean;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'mark_self_verified requires an authenticated caller';
  END IF;

  SELECT (u.email_confirmed_at IS NOT NULL) INTO v_confirmed
  FROM auth.users u WHERE u.id = v_id;

  IF COALESCE(v_confirmed, false) THEN
    UPDATE public.profiles SET is_verified = true WHERE id = v_id;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- ============================================================================
-- 3. set_my_pledge — the ONLY path that sets has_pledged
-- ============================================================================
-- new function
-- A true transition requires the caller to be verified first (you must be a verified
-- user to appear on the public pledger wall). false (withdrawal) is always allowed.
-- Backs AuthCallbackPage, the pledge-upgrade form, the settings withdrawal, the fixture.
CREATE OR REPLACE FUNCTION public.set_my_pledge(p_pledged boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := auth.uid();
  v_rows integer;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'set_my_pledge requires an authenticated caller';
  END IF;

  IF p_pledged THEN
    -- Atomic check-and-set: the is_verified gate is part of the UPDATE's WHERE, so there
    -- is no read-then-write window where is_verified could change between the two.
    UPDATE public.profiles SET has_pledged = true
      WHERE id = v_id AND is_verified = true;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows > 0;  -- false when not verified (no row matched)
  END IF;

  UPDATE public.profiles SET has_pledged = false WHERE id = v_id;
  RETURN true;
END;
$$;

-- ============================================================================
-- 4. Grants — authenticated only (both require a session; both force id = auth.uid())
-- ============================================================================
-- Supabase's default privileges GRANT EXECUTE on new public functions to anon AND
-- authenticated, so REVOKE FROM PUBLIC alone is not enough (P683/P877 precedent).
REVOKE EXECUTE ON FUNCTION public.mark_self_verified()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_my_pledge(boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_self_verified()   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_my_pledge(boolean) TO authenticated;

-- ============================================================================
-- 5. Re-define upsert_my_profile — stop writing trust columns from caller JSON
-- ============================================================================
-- diffed against: 20260602160000_p877_profiles_pii_column_grants.sql
-- Identical to 20260602160000_p877 EXCEPT: is_verified / has_pledged are no longer read
-- from p_data. On INSERT they are forced to the safe baseline (false/false); on conflict
-- they are left untouched (preserved). The legitimate values are applied afterwards by
-- mark_self_verified() and set_my_pledge(). This closes Surface 2: even though this
-- function runs as the owner (and so bypasses the guard trigger), it no longer carries
-- caller-supplied trust state.
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
  -- is_verified / has_pledged are intentionally NOT taken from p_data (P880). New rows
  -- start unverified / un-pledged; mark_self_verified() and set_my_pledge() set them.
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
    false,  -- P880: never from caller; set via mark_self_verified()
    COALESCE((p_data->>'pledge_version')::integer, 2),
    false,  -- P880: never from caller; set via set_my_pledge()
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
    -- is_verified / has_pledged intentionally omitted (P880): preserved across upsert.
    pledge_version              = EXCLUDED.pledge_version,
    accepted_terms_version      = EXCLUDED.accepted_terms_version,
    bio                         = EXCLUDED.bio,
    banner_url                  = EXCLUDED.banner_url,
    banner_generation_attempted = EXCLUDED.banner_generation_attempted,
    updated_at                  = timezone('utc', now());

  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- upsert_my_profile keeps its P877 grant (authenticated-only); CREATE OR REPLACE does not
-- reset grants, so no re-grant is needed here.

COMMENT ON FUNCTION public.guard_profile_trust_columns() IS
  'P880: pins profiles.is_verified/has_pledged on client-role (anon/authenticated) writes; '
  'SECURITY DEFINER accessors + service_role pass through.';
COMMENT ON FUNCTION public.mark_self_verified() IS
  'P880: sets is_verified=true for auth.uid() iff auth.users.email_confirmed_at IS NOT NULL.';
COMMENT ON FUNCTION public.set_my_pledge(boolean) IS
  'P880: sets has_pledged for auth.uid(); true requires is_verified=true.';
