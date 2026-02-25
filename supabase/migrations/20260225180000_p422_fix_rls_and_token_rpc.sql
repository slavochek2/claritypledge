-- P422: Fix SELECT policy to not expose all pending agreements.
-- The old policy used `status = 'pending' AND invitation_token IS NOT NULL`
-- which is always true since invitation_token is NOT NULL by schema constraint.
-- Fix: remove broad pending clause; add SECURITY DEFINER RPC for token-based reads.

-- Fix SELECT policy
DROP POLICY IF EXISTS "Public can read agreements" ON public.clarity_agreements;

CREATE POLICY "Public can read agreements"
  ON public.clarity_agreements FOR SELECT
  USING (
    visibility = 'public'
    OR creator_profile_id = auth.uid()
    OR partner_profile_id = auth.uid()
  );

-- Fix UPDATE WITH CHECK — was effectively WITH CHECK (TRUE) since
-- invitation_token IS NOT NULL is always true.
-- New rule: after the update, the row must be owned by the current user.
-- Accept sets partner_profile_id = auth.uid(), so it passes.
-- Decline uses SECURITY DEFINER RPC (no RLS applied).
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
  );

-- SECURITY DEFINER function for token-based agreement reads.
-- Validates token, returns agreement row if found and not expired.
CREATE OR REPLACE FUNCTION get_agreement_by_token(p_token TEXT)
RETURNS SETOF clarity_agreements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT *
    FROM clarity_agreements
    WHERE invitation_token = p_token
      AND status = 'pending'
      AND invitation_expires_at > now();
END;
$$;

GRANT EXECUTE ON FUNCTION get_agreement_by_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_agreement_by_token(TEXT) TO anon;
