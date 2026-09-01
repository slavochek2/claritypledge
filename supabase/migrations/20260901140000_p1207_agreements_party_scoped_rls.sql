-- Migration: P1207 F0a/F0b/F9 — scope clarity_agreements to parties; serve public reads via RPC
-- Created: 2026-09-01
-- Spec: features/p1207_adversarial_permission_audit_before_agent_api.md
-- Audit: docs/audits/p1207-phase1-findings.md (F0a, F0b, F9)
-- Reproduced by: e2e/integration/p1207-agreements-exposure.spec.ts (4 tests, all RED before this)
--
-- THREE DEFECTS, ONE TABLE, ONE ROOT SHAPE: a policy branch that admits a caller who is not a
-- party, on a table whose row carries both a real email address and a capability token.
--
-- F9 (most severe, and NOT in the original Phase 1 report — found while fixing F0a). The UPDATE
-- policy read:
--   USING      (creator=auth.uid() OR partner=auth.uid() OR (status='pending' AND invitation_token IS NOT NULL))
--   WITH CHECK (creator=auth.uid() OR partner=auth.uid())
-- The third USING branch admits ANY caller to any pending row. The WITH CHECK looks like it
-- saves this — it does not, because an attacker satisfies it by writing THEMSELVES in. Measured
-- on test: an authenticated user who was neither party and held no token set
-- partner_profile_id to their own id and status to 'active' on another user's agreement. The
-- invitee is then permanently locked out. This needs no token and no expiry-timing luck, which
-- makes it strictly worse than F0b.
--   The branch is also VESTIGIAL. The accept flow does not use it: accept_agreement() is
--   SECURITY DEFINER, verifies auth.uid() = p_partner_id, and matches on invitation_token
--   itself, so it bypasses RLS entirely. Removing the branch does not touch the accept path.
--
-- F0a / F0b. The SELECT policy's first branch was a bare (visibility = 'public'), sitting ahead
-- of three correctly-built "caller is a party" branches. RLS is ROW-level: it cannot withhold a
-- column, so a public agreement handed its whole row to anyone — including partner_email (a real
-- third party's address; 3 such rows are live on prod) and invitation_token (a capability that
-- create-and-sign exchanges for a session bound to the invitee's email).
--
-- WHY NOT A COLUMN REVOKE, which was the approved plan. PostgREST requires the SELECT privilege
-- to FILTER on a column, so revoking partner_email breaks getIncomingInvitations
-- (agreements-service-real.ts:619, .ilike('partner_email', email)) and hasActiveAgreementWith
-- (:429) outright; and getIncomingInvitations issues select('*'), which fails wholesale when any
-- column is ungranted. Scoping the POLICY fixes all three findings with no column surgery and no
-- broken flow: every remaining branch is a party, and a party may see the whole row.
--
-- The public-viewing use case is real and is preserved by projection instead — the same shape
-- this file already uses for get_agreement_by_token (added as the "H2 fix" for this exact class:
-- "the old SELECT policy exposed all pending agreements to anon users").
--
-- client-safe: paired with the frontend change in the same commit — agreements-service-real.ts
-- routes its two public read paths (getAgreement, getAgreementsForProfile) through the RPCs
-- below. No deployed client reads partner_email or invitation_token except as a party, which
-- still works. Deploying this migration ahead of that frontend would degrade public profile
-- pages to an empty agreement list (a graceful [] — the service already returns [] on error),
-- never an error page or data loss.

-- ============================================================================
-- 1. SELECT — parties only. The unconditional public branch is removed.
-- ============================================================================
DROP POLICY IF EXISTS "Agreements readable by visibility and parties" ON public.clarity_agreements;

CREATE POLICY "Agreements readable by parties only"
  ON public.clarity_agreements FOR SELECT
  TO anon, authenticated
  USING (
    creator_profile_id = auth.uid()
    OR partner_profile_id = auth.uid()
    OR (status = 'pending' AND lower(partner_email) = lower(auth.email()))
  );

COMMENT ON POLICY "Agreements readable by parties only" ON public.clarity_agreements IS
  'P1207 F0a/F0b: every branch must identify the caller as a party. Public viewing is served by '
  'get_public_agreement / get_public_agreements_for_profile, which project away partner_email '
  'and invitation_token. Do not add a bare visibility=public branch here — RLS is row-level and '
  'cannot withhold those two columns.';

-- ============================================================================
-- 2. UPDATE — parties only. The "any pending row with a token" branch is removed.
-- ============================================================================
DROP POLICY IF EXISTS "Parties can update their agreements" ON public.clarity_agreements;

CREATE POLICY "Parties can update their agreements"
  ON public.clarity_agreements FOR UPDATE
  TO anon, authenticated
  USING      (creator_profile_id = auth.uid() OR partner_profile_id = auth.uid())
  WITH CHECK (creator_profile_id = auth.uid() OR partner_profile_id = auth.uid());

COMMENT ON POLICY "Parties can update their agreements" ON public.clarity_agreements IS
  'P1207 F9: a WITH CHECK naming the caller does NOT compensate for a USING branch that admits '
  'strangers — the attacker satisfies the check by writing themselves in. Acceptance goes '
  'through accept_agreement() (SECURITY DEFINER), which does not rely on this policy.';

-- new function: get_public_agreement and get_public_agreements_for_profile do not exist in any
-- prior migration (grep) and are absent from prod's pg_proc (checked 2026-09-01). Nothing is
-- being redefined here, so there is no prior version to diff against.
-- ============================================================================
-- 3. Public projection — everything except the address and the capability.
-- ============================================================================
-- STABLE, not VOLATILE: read-only, so PostgREST will not wrap it in a write transaction.
-- Explicit column list rather than SETOF clarity_agreements: a SETOF return would put every
-- future column into the public projection by default, which is how this defect arose in the
-- first place. Adding a column here must be a deliberate edit.
CREATE OR REPLACE FUNCTION public.get_public_agreement(p_id uuid)
RETURNS TABLE (
  id uuid, display_id text, creator_profile_id uuid, partner_profile_id uuid,
  partner_display_name text, terms_text text, status text, visibility text,
  invitation_expires_at timestamptz, created_at timestamptz, partner_signed_at timestamptz,
  terminated_at timestamptz, terminated_by uuid, agreement_version text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
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
RETURNS TABLE (
  id uuid, display_id text, creator_profile_id uuid, partner_profile_id uuid,
  partner_display_name text, terms_text text, status text, visibility text,
  invitation_expires_at timestamptz, created_at timestamptz, partner_signed_at timestamptz,
  terminated_at timestamptz, terminated_by uuid, agreement_version text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
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

-- EXECUTE is granted explicitly rather than left to the schema default, so these two functions
-- do not depend on the default-privilege state P1207's F6 migration just narrowed.
GRANT EXECUTE ON FUNCTION public.get_public_agreement(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_agreements_for_profile(uuid) TO anon, authenticated;
