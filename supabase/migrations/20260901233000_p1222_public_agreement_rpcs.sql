-- P1222: column-scoped public readers for clarity_agreements.
-- new function (both readers: no prior migration in the repo defines them — live on test out-of-band only)
--
-- client-safe: purely additive — two new SECURITY DEFINER read functions plus
-- their EXECUTE grants. No policy, grant, or column on the table changes here;
-- a deployed client that still reads the table directly is unaffected. The
-- policy narrowing is the SEPARATE migration 20260901234000 (requires-frontend).
--
-- Why: the table's SELECT policy admits every visibility='public' row to any
-- caller, and the table grant covers every column — so the invitation token
-- and the invitee's email travel with every public read. A public agreement is
-- meant to publish the two parties and the terms, nothing else. These readers
-- return exactly the public-page column set and never the two party-only
-- columns. Mechanics and the prod measurement: .private/docs/security-log.md
-- § 2026-09-01 (P1222).
--
-- Drift note: both functions already exist on the TEST project with this exact
-- body, applied out-of-band (no migration in the repo defines them — verified
-- by grep 2026-09-01), and do NOT exist on prod (PGRST202 on the anon RPC
-- endpoint). This file makes them canonical; CREATE OR REPLACE is a no-op on
-- test and creates them on prod.

CREATE OR REPLACE FUNCTION public.get_public_agreement(p_id uuid)
RETURNS TABLE(
  id uuid,
  display_id text,
  creator_profile_id uuid,
  partner_profile_id uuid,
  partner_display_name text,
  terms_text text,
  status text,
  visibility text,
  invitation_expires_at timestamptz,
  created_at timestamptz,
  partner_signed_at timestamptz,
  terminated_at timestamptz,
  terminated_by uuid,
  agreement_version text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.display_id, a.creator_profile_id, a.partner_profile_id,
         a.partner_display_name, a.terms_text, a.status, a.visibility,
         a.invitation_expires_at, a.created_at, a.partner_signed_at,
         a.terminated_at, a.terminated_by, a.agreement_version
  FROM clarity_agreements a
  WHERE a.id = p_id
    AND a.visibility = 'public';
$$;

CREATE OR REPLACE FUNCTION public.get_public_agreements_for_profile(p_profile_id uuid)
RETURNS TABLE(
  id uuid,
  display_id text,
  creator_profile_id uuid,
  partner_profile_id uuid,
  partner_display_name text,
  terms_text text,
  status text,
  visibility text,
  invitation_expires_at timestamptz,
  created_at timestamptz,
  partner_signed_at timestamptz,
  terminated_at timestamptz,
  terminated_by uuid,
  agreement_version text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.display_id, a.creator_profile_id, a.partner_profile_id,
         a.partner_display_name, a.terms_text, a.status, a.visibility,
         a.invitation_expires_at, a.created_at, a.partner_signed_at,
         a.terminated_at, a.terminated_by, a.agreement_version
  FROM clarity_agreements a
  WHERE (a.creator_profile_id = p_profile_id OR a.partner_profile_id = p_profile_id)
    AND a.visibility = 'public'
    AND a.status = 'active';
$$;

-- Public readers by design: the whole point is that an anonymous visitor can
-- render a public agreement page without the party-only columns.
REVOKE ALL ON FUNCTION public.get_public_agreement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_agreement(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_public_agreements_for_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_agreements_for_profile(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_agreement(uuid) IS
  'P1222: public-page read of one agreement. Returns the row only when visibility=public; never returns partner_email or invitation_token.';
COMMENT ON FUNCTION public.get_public_agreements_for_profile(uuid) IS
  'P1222: public-page listing of a profile''s active public agreements; never returns partner_email or invitation_token.';
