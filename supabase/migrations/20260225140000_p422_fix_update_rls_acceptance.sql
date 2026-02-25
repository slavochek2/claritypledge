-- P422: Fix UPDATE RLS to allow accepting/declining pending agreements via token.
-- The original policy only allowed parties already set as creator/partner to update.
-- This blocked new partners (where partner_profile_id is still NULL) from accepting,
-- and unauthenticated declines. Token validation is enforced at the app layer.

DROP POLICY IF EXISTS "Parties can update their agreements" ON public.clarity_agreements;

CREATE POLICY "Parties can update their agreements"
  ON public.clarity_agreements FOR UPDATE
  USING (
    creator_profile_id = auth.uid()
    OR partner_profile_id = auth.uid()
    OR (status = 'pending' AND invitation_token IS NOT NULL)
  );
