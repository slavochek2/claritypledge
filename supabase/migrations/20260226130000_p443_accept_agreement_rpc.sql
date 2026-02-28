-- P443: Add SECURITY DEFINER RPC for accepting an agreement via invitation token.
-- The existing UPDATE RLS policy uses:
--   USING (status = 'pending' AND invitation_token IS NOT NULL)
-- Since invitation_token has a NOT NULL constraint, this collapses to:
--   USING (status = 'pending')
-- Any authenticated user who knows the UUID can hijack a pending agreement.
-- Fix: SECURITY DEFINER function validates the token at DB layer before updating.
-- Same pattern as decline_agreement (20260225170000_p422_fix_decline_rpc.sql).

CREATE OR REPLACE FUNCTION accept_agreement(
  p_agreement_id UUID,
  p_token        TEXT,
  p_partner_id   UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE clarity_agreements
  SET
    partner_profile_id = p_partner_id,
    partner_signed_at  = now(),
    status             = 'active'
  WHERE id               = p_agreement_id
    AND invitation_token = p_token
    AND status           = 'pending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- Only authenticated users can accept (partner must be signed in)
GRANT EXECUTE ON FUNCTION accept_agreement(UUID, TEXT, UUID) TO authenticated;
