-- P466: Extend accept_agreement RPC with optional p_partner_display_name parameter.
-- The existing 3-param overload remains unchanged; this adds a 4-param overload.
-- When p_partner_display_name is provided (non-null), it is written to the column.
-- When null (default), the existing value is preserved.

CREATE OR REPLACE FUNCTION accept_agreement(
  p_agreement_id        UUID,
  p_token               TEXT,
  p_partner_id          UUID,
  p_partner_display_name TEXT DEFAULT NULL
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
    partner_profile_id     = p_partner_id,
    partner_signed_at      = now(),
    status                 = 'active',
    partner_display_name   = COALESCE(p_partner_display_name, partner_display_name)
  WHERE id               = p_agreement_id
    AND invitation_token = p_token
    AND status           = 'pending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- Grant EXECUTE on the new 4-param overload (each PostgreSQL signature is a separate function)
GRANT EXECUTE ON FUNCTION accept_agreement(UUID, TEXT, UUID, TEXT) TO authenticated;
