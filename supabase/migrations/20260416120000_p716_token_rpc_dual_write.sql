-- P716: Add point_positions dual-write to submit_point_response_by_token.
--
-- Root cause: P705 introduced a dual-write to point_positions in submitPointResponse
-- (the authed RLS path) so that sender inbox shows "in progress" with live step counts.
-- The token-based SECURITY DEFINER path (submit_point_response_by_token) only wrote
-- to letter_point_responses, skipping point_positions entirely.
--
-- When P714 forced all authenticated users onto the authed path (by stripping the token),
-- authenticated email-delivery recipients got the dual-write. But P714's premise was wrong:
-- invitation_token (stable UUID in letter_deliveries) is NOT the one-time OTP hash
-- consumed by create-and-open-letter. Reverting P714 means authenticated recipients
-- go back to the token path — so the token RPC must also dual-write.
--
-- Fix: after inserting into letter_point_responses, upsert into point_positions when
-- auth.uid() is not null. SECURITY DEFINER bypasses RLS so both verified and unverified
-- authenticated users get immediate live display. Anon callers (auth.uid() = NULL) are
-- skipped — their positions replay into point_positions via persist_anonymous_completion
-- at registration. ON CONFLICT for letter_point_responses kept as DO NOTHING (idempotent);
-- point_positions uses DO UPDATE to keep the latest position on re-submit.

CREATE OR REPLACE FUNCTION submit_point_response_by_token(
  p_token UUID,
  p_point_id UUID,
  p_position TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_id UUID;
BEGIN
  -- Validate token (expiry check removed in P683 — invitation_expires_at gates session
  -- minting only; engagement writes are idempotent and scoped to sealed letters).
  SELECT ld.id INTO v_delivery_id
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RETURN false;
  END IF;

  -- Primary write: letter engagement record (idempotent).
  INSERT INTO letter_point_responses (delivery_id, point_id, position)
  VALUES (v_delivery_id, p_point_id, p_position)
  ON CONFLICT DO NOTHING;

  -- P705 dual-write: live display store. Only for authenticated callers (auth.uid() != NULL).
  -- Anon callers get their positions replayed via persist_anonymous_completion at signup.
  -- SECURITY DEFINER bypasses RLS so both verified and unverified users write immediately.
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO point_positions (point_id, user_id, position)
    VALUES (p_point_id, auth.uid(), p_position)
    ON CONFLICT (point_id, user_id) DO UPDATE SET position = EXCLUDED.position;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_point_response_by_token(UUID, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION submit_point_response_by_token(UUID, UUID, TEXT) TO authenticated;
