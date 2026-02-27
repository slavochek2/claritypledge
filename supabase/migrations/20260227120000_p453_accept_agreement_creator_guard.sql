-- P453: Guard against creator self-signing their own agreement via accept_agreement RPC.
-- The previous version only validated the invitation token and pending status —
-- it did not exclude the creator. If partnerProfileId was NULL (partner has no account yet),
-- the creator could call this RPC with their own user ID and self-sign.
-- Fix: add AND creator_profile_id != p_partner_id to the WHERE clause.

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
  WHERE id                 = p_agreement_id
    AND invitation_token   = p_token
    AND status             = 'pending'
    AND creator_profile_id != p_partner_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- Grant unchanged — authenticated users only
GRANT EXECUTE ON FUNCTION accept_agreement(UUID, TEXT, UUID) TO authenticated;
