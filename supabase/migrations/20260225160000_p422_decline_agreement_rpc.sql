-- P422: Add SECURITY DEFINER RPC for declining an agreement via invitation token.
-- Direct UPDATE from browser fails because RLS WITH CHECK can't express
-- "new row allowed if the invitation_token matched when the USING clause ran".
-- A SECURITY DEFINER function runs as the function owner (bypasses RLS) but
-- enforces the same security: token must match AND status must be pending.

CREATE OR REPLACE FUNCTION decline_agreement(p_agreement_id UUID, p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated BOOLEAN;
BEGIN
  UPDATE clarity_agreements
  SET status = 'declined'
  WHERE id = p_agreement_id
    AND invitation_token = p_token
    AND status = 'pending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- Grant execute to authenticated and anon (partner may be signed in or not)
GRANT EXECUTE ON FUNCTION decline_agreement(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION decline_agreement(UUID, TEXT) TO anon;
