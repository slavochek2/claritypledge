-- P1222: clarity_agreements SELECT policy becomes parties-only.
--
-- requires-frontend: ce02c269
-- (the P1222 client — public agreement pages read through get_public_agreement /
--  get_public_agreements_for_profile instead of the table. Applying this policy
--  while a pre-P1222 bundle is live blanks every anonymous /agreements/:id and
--  every visitor's partners list: the table stops returning public rows and
--  that bundle has no other read path. Apply 20260901233000 (the readers) and
--  deploy the client first; migrate.sh refuses the prod apply until ce02c269
--  is an ancestor of origin/main.)
--
-- What changes: the read policy no longer admits a row on visibility='public'.
-- A row is readable by its creator, its partner, or — while pending — the
-- invitee identified by auth.email(). Public pages get the row through the
-- SECURITY DEFINER readers above, which never return partner_email or
-- invitation_token. No column REVOKE: parties legitimately read both columns
-- and the client still select('*')s for them — a column revoke would 403
-- every party read (the P886 incident shape).
--
-- Drift note (recorded, not fixed here): the policy below already exists on
-- the TEST project under this exact name and predicate, applied out-of-band —
-- no migration in the repo defines it (grep 2026-09-01). Prod still carries
-- the P422 "…by visibility and parties" policy. This file makes the test
-- policy canonical: on test the DROP/CREATE pair is a no-op rewrite, on prod
-- it is the fix. Mechanics + prod measurement: .private/docs/security-log.md
-- § 2026-09-01 (P1222).
--
-- Not touched: "Parties can update their agreements" (UPDATE), which also
-- differs between prod and test (prod carries an extra pending+token branch).
-- Out of scope for P1222; flagged separately in the private log.

DROP POLICY IF EXISTS "Agreements readable by visibility and parties" ON public.clarity_agreements;
DROP POLICY IF EXISTS "Public can read agreements" ON public.clarity_agreements;
DROP POLICY IF EXISTS "Agreements readable by parties only" ON public.clarity_agreements;

CREATE POLICY "Agreements readable by parties only"
  ON public.clarity_agreements FOR SELECT
  TO anon, authenticated
  USING (
    creator_profile_id = auth.uid()
    OR partner_profile_id = auth.uid()
    OR (status = 'pending' AND lower(partner_email) = lower(auth.email()))
  );

COMMENT ON POLICY "Agreements readable by parties only" ON public.clarity_agreements IS
  'P1222: table reads are for parties only (creator, partner, or the pending invitee by email). Public reads go through get_public_agreement / get_public_agreements_for_profile, which omit partner_email and invitation_token.';
