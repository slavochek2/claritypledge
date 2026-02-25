-- P422: Fix decline_agreement RPC — ROW_COUNT is INTEGER not BOOLEAN.
-- Previous version declared v_updated as BOOLEAN but GET DIAGNOSTICS ROW_COUNT
-- returns INTEGER, causing "operator does not exist: boolean > integer".

CREATE OR REPLACE FUNCTION decline_agreement(p_agreement_id UUID, p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
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
