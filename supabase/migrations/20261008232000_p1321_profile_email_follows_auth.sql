-- diffed against: 20260904170000_p1212_enforce_agent_slug_namespace.sql
--   guard_profile_trust_columns — one block added (email pin); body otherwise verbatim
--   upsert_my_profile           — email taken from auth.users instead of p_data; body otherwise verbatim
--
-- client-safe: every deployed client that writes profiles.email sends the session's own auth
--   email (AuthCallbackPage builds upsert_my_profile's p_data from authUser.email), and
--   updateProfile (src/app/data/api.ts) never sends email. A value equal to the auth email is
--   exactly what the server now writes, so no shipped bundle sees a change.
--
-- P1321 (definer-function review, leads L3/L4): profiles.email was owner-writable — through
-- upsert_my_profile, which copied p_data->>'email' verbatim, and through a direct UPDATE under the
-- own-row policy (P877 revoked SELECT on the column, never UPDATE). Several definer functions treat
-- the column as the person's identity:
--   * lookup_party_by_email resolves an invitation address to a profile (lower() match);
--   * add_recipient_to_sealed_letter / seal_and_send_letter bind receiver_profile_id by it;
--   * erase_my_account anonymises every delivery and agreement addressed to it.
-- The UNIQUE(email) constraint blocks taking a registered user's exact address, but not an address
-- nobody has registered yet (someone invited by email) nor a case variant of a registered one. A
-- user who set either became that person's invitee, and erasing their account wiped that person's
-- pending invitations.
--
-- Fix at the write side, so all four consumers become correct without editing them: the column
-- now follows the auth record.
--   * Client-role writes (anon/authenticated): INSERT takes auth.email() — RLS already forces
--     id = auth.uid() — and UPDATE keeps OLD.email. Same mechanism as the P880 trust columns.
--   * upsert_my_profile runs as the owner and bypasses that trigger, so it reads the caller's
--     auth.users email itself and ignores p_data->>'email'. Its ON CONFLICT still writes
--     EXCLUDED.email, so an auth-side email change now propagates on the next sign-in.
-- Definer functions (erasure tombstones) and service_role (admin, test seeding) are unaffected.
--
-- Production data checked read-only before writing this (scripts/supabase-readonly-sql.py,
-- counts only): every profile email equals its auth.users email (168 of 168, 0 differing,
-- 0 without an auth user), so no row needs correcting.

CREATE OR REPLACE FUNCTION public.guard_profile_trust_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_verified   := false;
      NEW.has_pledged   := false;
      NEW.is_admin      := false;
      NEW.is_certifier  := false;
      -- P1321 L3: the identity column is the session's own address, never a chosen one.
      NEW.email         := auth.email();
    ELSE
      NEW.is_verified   := OLD.is_verified;
      NEW.has_pledged   := OLD.has_pledged;
      NEW.is_admin      := OLD.is_admin;
      NEW.is_certifier  := OLD.is_certifier;
      NEW.email         := OLD.email;  -- P1321 L3
    END IF;

    IF NEW.name IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.name END)
       AND public.is_reserved_agent_name(NEW.name) THEN
      RAISE EXCEPTION 'display name may not use the reserved "Agent ·" marker prefix';
    END IF;

    -- P1212: BOTH namespaces. Only re-checked when the slug actually changes, so an
    -- unrelated UPDATE on a legacy row cannot be blocked by it.
    IF NEW.slug IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.slug END)
       AND (public.is_reserved_agent_slug(NEW.slug)
            OR public.is_reserved_machine_slug(NEW.slug)) THEN
      RAISE EXCEPTION 'profile slug may not use the reserved "agent-" or "machine-" prefix';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

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
    bio                         = EXCLUDED.bio,
    banner_url                  = EXCLUDED.banner_url,
    banner_generation_attempted = EXCLUDED.banner_generation_attempted,
    updated_at                  = timezone('utc', now());

  RETURN jsonb_build_object('id', v_id);
END;
$$;
