-- P1230 part B1 (codex review): acceptance cannot REPLACE a partner, and token
-- rotation moves off the table into a creator-only definer RPC.
--
-- client-safe: purely additive from a deployed client's point of view.
--   * accept_agreement keeps its signature and every legitimate outcome: an
--     unassigned invitation (partner_profile_id IS NULL) and a pre-assigned one
--     (partner_profile_id already = the caller) both still accept. Only the
--     "someone else is already the partner" case newly returns false — a case no
--     legitimate client ever issues.
--   * rotate_invitation_token is a NEW function. Nothing calls it until the
--     client that does is deployed; the pre-P1230-B client keeps rotating on the
--     table, which part B2 (20260902001600) is what closes.
-- new function (rotate_invitation_token has no prior definition)
-- diffed against: 20260813170000_p1066_null_identity_authz_guards.sql (§ 5, accept_agreement)
--   the only change is the added WHERE conjunct marked "P1230 part B" below
--
-- What codex found. Part A (20260902001000) locks creator_profile_id /
-- partner_profile_id against anon+authenticated with a BEFORE UPDATE trigger,
-- and exempts accept_agreement because a SECURITY DEFINER body runs as the
-- function owner. status and invitation_token were NOT locked, so a party could
-- compose its way around the trigger:
--
--   1. a party sets an active/terminated row back to status='pending'
--   2. the same party sets invitation_token to a value they choose
--   3. they hand that token to any other authenticated account
--   4. that account calls accept_agreement(id, token, self)
--   5. accept_agreement — exempt from the trigger — overwrites
--      partner_profile_id with the newcomer
--
-- Step 5 is what this file closes; steps 1 and 2 are closed by 20260902001600.
-- Both halves are needed: the guard here alone still lets a party rotate the
-- token under a live agreement, and the trigger there alone still lets whoever
-- legitimately holds a pending token displace a partner assigned since.
--
-- Mechanics: .private/docs/security-log.md § 2026-09-03 (P1230 part B).

-- 1. accept_agreement: accept an invitation, never REPLACE a partner ---------
--
-- Body is 20260813170000_p1066_null_identity_authz_guards.sql § 5 verbatim,
-- plus one WHERE conjunct. Nothing else about the function changes: same
-- signature, same SECURITY DEFINER, same search_path, same service_role
-- exemption for the inline sign-up path (supabase/functions/create-and-sign,
-- which calls this before the partner account has a session).

CREATE OR REPLACE FUNCTION public.accept_agreement(p_agreement_id uuid, p_token text, p_partner_id uuid, p_partner_display_name text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated INTEGER;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authorized: authentication required' USING ERRCODE = '42501';
    END IF;
    IF p_partner_id IS NULL OR p_partner_id <> auth.uid() THEN
      RAISE EXCEPTION 'Not authorized to accept on behalf of another profile' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE clarity_agreements
  SET
    partner_profile_id     = p_partner_id,
    partner_signed_at      = now(),
    status                 = 'active',
    partner_display_name   = COALESCE(p_partner_display_name, partner_display_name)
  WHERE id               = p_agreement_id
    AND invitation_token = p_token
    AND status           = 'pending'
    AND creator_profile_id != p_partner_id
    -- P1230 part B: accept an OPEN invitation, or re-accept one already
    -- addressed to this profile. Never displace a partner already on the row.
    AND (partner_profile_id IS NULL OR partner_profile_id = p_partner_id);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$;

COMMENT ON FUNCTION public.accept_agreement(uuid, text, uuid, text) IS
  'P1230 part B: acceptance is for an unassigned invitation, or one already assigned to the caller. A row whose partner_profile_id names someone else is never overwritten, so a replayed/rotated token cannot displace a partner.';

REVOKE ALL ON FUNCTION public.accept_agreement(uuid, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_agreement(uuid, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_agreement(uuid, text, uuid, text) TO authenticated, service_role;

-- 2. rotate_invitation_token: the only party-reachable token rotation ---------
--
-- src/app/data/agreements-service-real.ts resendInvitation() used to PATCH the
-- table with a fresh crypto.randomUUID() plus status='pending'. Part B2 refuses
-- both of those columns to anon/authenticated, so the write moves here, where
-- the creator check and the status precondition are enforced by the database
-- rather than by the client that issues the PATCH.
--
-- Runs as the function owner, so part B2's trigger does not apply to it — which
-- is the point: this is the one audited path that may rotate a token.
--
-- The edge function's own rotation (supabase/functions/send-agreement-emails
-- handleResend) runs under service_role and is likewise unaffected by the
-- trigger; it is left where it is.

CREATE OR REPLACE FUNCTION public.rotate_invitation_token(p_agreement_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_creator uuid;
  v_status  text;
  v_updated INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized: authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT a.creator_profile_id, a.status
    INTO v_creator, v_status
  FROM clarity_agreements a
  WHERE a.id = p_agreement_id;

  -- Same error for "no such row" and "not yours": a caller who is not the
  -- creator learns nothing about whether the id exists.
  IF v_creator IS NULL OR v_creator <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized: only the creator may resend this invitation' USING ERRCODE = '42501';
  END IF;

  -- M6 (agreements-service-real.ts): resend is for a live or lapsed invitation
  -- only. An active/terminated agreement has no invitation to resend, and
  -- allowing it here would reopen exactly the active -> pending step this
  -- migration pair closes.
  IF v_status NOT IN ('pending', 'expired') THEN
    RAISE EXCEPTION 'Cannot resend an invitation for an agreement with status %', v_status USING ERRCODE = '42501';
  END IF;

  UPDATE clarity_agreements
  SET invitation_token      = gen_random_uuid()::text,
      invitation_expires_at = now() + interval '7 days',
      status                = 'pending'
  WHERE id = p_agreement_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$;

COMMENT ON FUNCTION public.rotate_invitation_token(uuid) IS
  'P1230 part B: creator-only invitation resend. Mints a new token, extends the expiry by 7 days and returns the row to pending, for a pending or expired agreement only. The one party-reachable path allowed to write invitation_token (see the trigger in 20260902001600).';

REVOKE ALL ON FUNCTION public.rotate_invitation_token(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rotate_invitation_token(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rotate_invitation_token(uuid) TO authenticated, service_role;

-- 3. Assert the end state ----------------------------------------------------

DO $$
DECLARE
  v_src TEXT;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'accept_agreement'
    AND pg_get_function_identity_arguments(p.oid) = 'p_agreement_id uuid, p_token text, p_partner_id uuid, p_partner_display_name text';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'P1230-B1: accept_agreement(uuid,text,uuid,text) missing after apply';
  END IF;
  IF position('partner_profile_id IS NULL OR partner_profile_id = p_partner_id' IN v_src) = 0 THEN
    RAISE EXCEPTION 'P1230-B1: accept_agreement lacks the partner-replacement guard';
  END IF;

  -- Exactly one arity: an older 3-arg overload would be separately callable and
  -- would not carry the guard (20260813170000 dropped it; assert it stayed gone).
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'accept_agreement') <> 1 THEN
    RAISE EXCEPTION 'P1230-B1: accept_agreement has more than one overload';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rotate_invitation_token' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'P1230-B1: rotate_invitation_token missing or not SECURITY DEFINER';
  END IF;

  IF has_function_privilege('anon', 'public.rotate_invitation_token(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1230-B1: anon holds EXECUTE on rotate_invitation_token';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rotate_invitation_token(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1230-B1: authenticated lost EXECUTE on rotate_invitation_token';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.accept_agreement(uuid,text,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1230-B1: authenticated lost EXECUTE on accept_agreement';
  END IF;
  IF has_function_privilege('anon', 'public.accept_agreement(uuid,text,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1230-B1: anon holds EXECUTE on accept_agreement';
  END IF;
END $$;
