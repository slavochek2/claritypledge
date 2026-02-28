-- P443: Fix SELECT policy — allow invited party to read pending agreements.
-- The invited party (authenticated, email matches partner_email) was blocked from
-- reading a pending agreement via /agreements/:id because partner_profile_id is
-- NULL until acceptance. They could only read via the SECURITY DEFINER token RPC
-- (used by the accept page), not via direct ID lookup.
-- Fix: add email-match branch for pending agreements so the invited party can
-- navigate to /agreements/:id and see the agreement before signing.

DROP POLICY IF EXISTS "Public can read agreements" ON public.clarity_agreements;
DROP POLICY IF EXISTS "Agreements readable by visibility and parties" ON public.clarity_agreements;

CREATE POLICY "Agreements readable by visibility and parties"
  ON public.clarity_agreements FOR SELECT
  USING (
    visibility = 'public'
    OR creator_profile_id = auth.uid()
    OR partner_profile_id = auth.uid()
    OR (status = 'pending' AND lower(partner_email) = lower(auth.email()))
  );
