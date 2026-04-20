-- P768: SECURITY DEFINER RPC to read prior point responses by invitation token.
-- Mirrors the anon-safe pattern from P642 (submit_point_response_by_token).
-- new function
--
-- Why: RLS SELECT policy on letter_point_responses requires auth.uid() match.
-- Anon-token readers (no session) can't read via RLS. This RPC allows
-- useLetterReadingState to rehydrate prior positions on mount for both
-- authenticated and anon-token paths, preventing the 409 on re-submit (P768).

CREATE OR REPLACE FUNCTION get_letter_point_responses_by_token(p_token UUID)
RETURNS TABLE(point_id UUID, response_position TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_id UUID;
BEGIN
  -- Resolve token → delivery. No expiry check (matches P683 pattern).
  -- Column aliased to `response_position` because `position` is reserved in
  -- a RETURNS TABLE signature.
  SELECT id INTO v_delivery_id
  FROM letter_deliveries
  WHERE invitation_token = p_token;

  IF v_delivery_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT lpr.point_id, lpr.position::TEXT AS response_position
    FROM letter_point_responses lpr
    WHERE lpr.delivery_id = v_delivery_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_letter_point_responses_by_token(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_letter_point_responses_by_token(UUID) TO authenticated;
