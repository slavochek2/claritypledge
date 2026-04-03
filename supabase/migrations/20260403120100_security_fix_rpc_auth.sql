-- Security: close two authorization gaps in RPC functions.
--
-- Fix 1: accept_agreement() 4-param overload was missing the self-sign guard
--   added to the 3-param overload in P453 (20260227120000). The creator could
--   call the 4-param variant with their own UUID and self-sign the agreement.
--   Fix: add AND creator_profile_id != p_partner_id to the WHERE clause.
--
-- Fix 2: patch_live_state() had no authorization check — any authenticated user
--   could patch the live_state of any session they knew the ID of.
--   Fix: add AND (creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid())
--   to the WHERE clause so only session participants can write.

-- Fix 1: 4-param accept_agreement — add self-sign guard
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
    AND status           = 'pending'
    AND creator_profile_id != p_partner_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION accept_agreement(UUID, TEXT, UUID, TEXT) TO authenticated;

-- Fix 2: patch_live_state — restrict to session participants only
CREATE OR REPLACE FUNCTION patch_live_state(
  p_session_id uuid,
  p_patch      jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE clarity_sessions
  SET live_state = COALESCE(live_state, '{}'::jsonb) || p_patch
  WHERE id = p_session_id
    AND (creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid());
END;
$$;
