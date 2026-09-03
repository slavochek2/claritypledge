-- P1222 (codex review follow-up): the parties-only SELECT policy loses its
-- email-claim branch.
--
-- requires-frontend: 741d63a0f
-- (the client that reads pending invitations through get_my_pending_invitations
--  — 20260901235000 — instead of the table. Applying this policy while a
--  pre-f157a855 bundle is live empties every signed-in user's "Invited to sign"
--  list and the pending-invitation badge: that bundle reads them from the table
--  through exactly the branch removed here.)
--
-- Why: `status = 'pending' AND lower(partner_email) = lower(auth.email())`
-- treats the JWT email claim as possession of the inbox the invitation was
-- mailed to. The reader that replaces it checks auth.users.email_confirmed_at.
-- The invitation token itself remains the acceptance credential
-- (get_agreement_by_token / accept_agreement). Mechanics:
-- .private/docs/security-log.md § 2026-09-01 (P1222).
--
-- The DO block asserts the final predicate regardless of starting state
-- (prod: P422 policy; test: out-of-band or 20260901234000 policy).

DROP POLICY IF EXISTS "Agreements readable by visibility and parties" ON public.clarity_agreements;
DROP POLICY IF EXISTS "Public can read agreements" ON public.clarity_agreements;
DROP POLICY IF EXISTS "Agreements readable by parties only" ON public.clarity_agreements;

CREATE POLICY "Agreements readable by parties only"
  ON public.clarity_agreements FOR SELECT
  TO anon, authenticated
  USING (
    creator_profile_id = auth.uid()
    OR partner_profile_id = auth.uid()
  );

COMMENT ON POLICY "Agreements readable by parties only" ON public.clarity_agreements IS
  'P1222: table reads are for the creator and partner by auth.uid() only. Public reads: get_public_agreement / get_public_agreements_for_profile. Pending invitations for the confirmed-email invitee: get_my_pending_invitations. No email-claim branch.';

DO $$
DECLARE
  v_qual TEXT;
  v_n    INT;
BEGIN
  SELECT count(*) INTO v_n
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'clarity_agreements' AND cmd = 'SELECT';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'P1222: expected exactly one SELECT policy on clarity_agreements, found %', v_n;
  END IF;

  SELECT qual INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'clarity_agreements'
    AND policyname = 'Agreements readable by parties only';
  IF v_qual IS NULL THEN
    RAISE EXCEPTION 'P1222: SELECT policy missing after apply';
  END IF;
  IF v_qual ILIKE '%visibility%' OR v_qual ILIKE '%email%' OR v_qual ILIKE '%pending%' THEN
    RAISE EXCEPTION 'P1222: SELECT policy still carries a public/email/pending branch: %', v_qual;
  END IF;
END $$;
