-- P642: RPC to claim a letter delivery — sets receiver_profile_id and opens it.
-- Called when an authenticated user opens a letter via token.
-- Without this, receiver_profile_id stays NULL and all write RLS policies fail
-- (they check receiver_profile_id = auth.uid()).

CREATE OR REPLACE FUNCTION claim_letter_delivery(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_id UUID;
  v_letter_id UUID;
  v_current_receiver UUID;
BEGIN
  -- Validate token + expiry + letter status
  SELECT ld.id, ld.letter_id, ld.receiver_profile_id
  INTO v_delivery_id, v_letter_id, v_current_receiver
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND (ld.invitation_expires_at IS NULL OR ld.invitation_expires_at > now())
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- If already claimed by a different user, reject
  IF v_current_receiver IS NOT NULL AND v_current_receiver != auth.uid() THEN
    RETURN jsonb_build_object('error', 'delivery_claimed_by_other');
  END IF;

  -- Claim: set receiver_profile_id + mark as opened
  UPDATE letter_deliveries
  SET
    receiver_profile_id = auth.uid(),
    status = CASE WHEN status = 'sent' THEN 'opened' ELSE status END,
    opened_at = COALESCE(opened_at, now())
  WHERE id = v_delivery_id;

  RETURN jsonb_build_object(
    'delivery_id', v_delivery_id,
    'letter_id', v_letter_id,
    'claimed', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION claim_letter_delivery(UUID) TO authenticated;
