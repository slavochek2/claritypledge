-- P422: Fix RLS SELECT policy to allow reading pending agreements via invitation token.
-- Without this, unauthenticated users and non-party authenticated users cannot load the
-- accept page for private agreements, since the original policy only allowed
-- visibility='public', creator, and partner_profile_id.

DROP POLICY IF EXISTS "Public can read agreements" ON public.clarity_agreements;

CREATE POLICY "Public can read agreements"
  ON public.clarity_agreements FOR SELECT
  USING (
    visibility = 'public'
    OR creator_profile_id = auth.uid()
    OR partner_profile_id = auth.uid()
    OR (status = 'pending' AND invitation_token IS NOT NULL)
  );
