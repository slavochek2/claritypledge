-- P422: Fix UPDATE RLS WITH CHECK to allow status transitions (pending → declined/active).
-- PostgreSQL UPDATE policies apply USING to the OLD row and WITH CHECK to the NEW row.
-- When WITH CHECK is omitted, it defaults to the USING expression — causing decline to fail
-- because the new row has status='declined' (not 'pending') and partner_profile_id=NULL.
-- Fix: explicit WITH CHECK that allows the new row when the token remains non-null.

DROP POLICY IF EXISTS "Parties can update their agreements" ON public.clarity_agreements;

CREATE POLICY "Parties can update their agreements"
  ON public.clarity_agreements FOR UPDATE
  USING (
    creator_profile_id = auth.uid()
    OR partner_profile_id = auth.uid()
    OR (status = 'pending' AND invitation_token IS NOT NULL)
  )
  WITH CHECK (
    creator_profile_id = auth.uid()
    OR partner_profile_id = auth.uid()
    OR invitation_token IS NOT NULL
  );
