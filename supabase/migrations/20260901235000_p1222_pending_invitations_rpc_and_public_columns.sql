-- P1222 (codex review follow-up): pending invitations by confirmed email, and
-- the public readers stop returning the terminating actor.
--
-- client-safe: additive. One new SECURITY DEFINER reader
-- (get_my_pending_invitations) plus a return-shape change on the two P1222
-- public readers that only REMOVES terminated_by — the P1222 client maps that
-- column with `?? null`, and the pre-P1222 client never called these readers.
-- No policy or grant on the table changes here; the policy change is the
-- separate requires-frontend migration 20260901236000.
-- diffed against: 20260901233000_p1222_public_agreement_rpcs.sql
--
-- Why a confirmed-email reader: the table SELECT policy has admitted a pending
-- row to any session whose JWT email claim matches partner_email. A JWT email
-- claim is a claim, not possession of the inbox — the policy branch is dropped
-- in 20260901236000, and the "Invited to sign" list moves here, where the
-- caller must be signed in AND have a confirmed email that matches. The
-- invitation token is returned to that caller: the token was mailed to exactly
-- that confirmed address, and the in-app "Review & Sign" link
-- (/agreements/:id/accept?token=…) is built from it. Acceptance itself stays on
-- get_agreement_by_token / accept_agreement.

-- 1. Public readers: drop terminated_by (actor identity is not public contract).
--    RETURNS TABLE changes require DROP + CREATE.

DROP FUNCTION IF EXISTS public.get_public_agreement(uuid);
DROP FUNCTION IF EXISTS public.get_public_agreements_for_profile(uuid);

CREATE FUNCTION public.get_public_agreement(p_id uuid)
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
         a.terminated_at, a.agreement_version
  FROM clarity_agreements a
  WHERE a.id = p_id
    AND a.visibility = 'public';
$$;

CREATE FUNCTION public.get_public_agreements_for_profile(p_profile_id uuid)
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
         a.terminated_at, a.agreement_version
  FROM clarity_agreements a
  WHERE (a.creator_profile_id = p_profile_id OR a.partner_profile_id = p_profile_id)
    AND a.visibility = 'public'
    AND a.status = 'active';
$$;

REVOKE ALL ON FUNCTION public.get_public_agreement(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_agreement(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_agreements_for_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_agreements_for_profile(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_agreement(uuid) IS
  'P1222: public-page read of one agreement. Returns the row only when visibility=public; never returns partner_email, invitation_token or terminated_by.';
COMMENT ON FUNCTION public.get_public_agreements_for_profile(uuid) IS
  'P1222: public-page listing of a profile''s active public agreements; never returns partner_email, invitation_token or terminated_by.';

-- 2. Pending invitations for the signed-in, email-confirmed caller.
-- new function (get_my_pending_invitations has no prior definition)

CREATE OR REPLACE FUNCTION public.get_my_pending_invitations()
RETURNS TABLE(
  id uuid,
  display_id text,
  creator_profile_id uuid,
  partner_profile_id uuid,
  partner_email text,
  partner_display_name text,
  terms_text text,
  status text,
  visibility text,
  invitation_token text,
  invitation_expires_at timestamptz,
  created_at timestamptz,
  partner_signed_at timestamptz,
  terminated_at timestamptz,
  agreement_version text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- Possession, not a claim: the address must be confirmed on the auth user.
  SELECT lower(u.email) INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid
    AND u.email_confirmed_at IS NOT NULL;

  IF v_email IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT a.id, a.display_id, a.creator_profile_id, a.partner_profile_id,
         a.partner_email, a.partner_display_name, a.terms_text, a.status, a.visibility,
         a.invitation_token, a.invitation_expires_at, a.created_at, a.partner_signed_at,
         a.terminated_at, a.agreement_version
  FROM clarity_agreements a
  WHERE a.status = 'pending'
    AND lower(a.partner_email) = v_email
    AND (a.partner_profile_id IS NULL OR a.partner_profile_id = v_uid)
    AND a.invitation_expires_at >= now()
  ORDER BY a.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_pending_invitations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pending_invitations() TO authenticated;

COMMENT ON FUNCTION public.get_my_pending_invitations() IS
  'P1222: pending agreements addressed to the caller''s CONFIRMED auth email (auth.users.email_confirmed_at IS NOT NULL). Replaces the table policy''s email-claim branch. Returns the invitation token to that caller only.';
