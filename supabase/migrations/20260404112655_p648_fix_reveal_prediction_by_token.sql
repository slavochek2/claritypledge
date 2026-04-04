-- P648: Fix reveal_prediction_by_token — wrong session_id check.
-- submit_rating_by_token inserts with session_id = NULL (letters don't have sessions),
-- but reveal_prediction_by_token checked session_id = v_delivery_id::text → always NULL.
-- Fix: check source = 'letter' with matching story_id + speaker_id instead.

CREATE OR REPLACE FUNCTION reveal_prediction_by_token(
  p_token UUID,
  p_story_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_id UUID;
  v_letter_id UUID;
  v_sender_id UUID;
  v_prediction INTEGER;
BEGIN
  -- Validate token
  SELECT ld.id, ld.letter_id, cl.sender_id INTO v_delivery_id, v_letter_id, v_sender_id
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND (ld.invitation_expires_at IS NULL OR ld.invitation_expires_at > now())
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check that rating exists (sealed-bid: prediction only after rating)
  -- Letters insert with session_id = NULL, so match on story_id + speaker_id + source
  IF NOT EXISTS (
    SELECT 1 FROM story_verifications
    WHERE story_id = p_story_id AND speaker_id = v_sender_id AND source = 'letter'
  ) THEN
    RETURN NULL;
  END IF;

  -- Return prediction
  SELECT lp.prediction INTO v_prediction
  FROM letter_predictions lp
  WHERE lp.letter_id = v_letter_id
    AND lp.story_id = p_story_id
    AND (lp.delivery_id = v_delivery_id OR lp.delivery_id IS NULL)
  LIMIT 1;

  IF v_prediction IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object('prediction', v_prediction);
END;
$$;

-- Re-grant (idempotent)
GRANT EXECUTE ON FUNCTION reveal_prediction_by_token(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION reveal_prediction_by_token(UUID, UUID) TO authenticated;
