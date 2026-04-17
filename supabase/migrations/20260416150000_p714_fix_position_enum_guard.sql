-- P714 bug fix: correct position enum guard in submit_point_response_by_token.
--
-- Root cause: P705 and P716 migrations used wrong enum labels in the validation
-- guard: 'slightly_disagree', 'neutral', 'slightly_agree'. The actual position_type
-- enum values are 'somewhat_disagree', 'unsure', 'somewhat_agree'.
--
-- Impact: any user submitting position 'somewhat_disagree', 'unsure', or
-- 'somewhat_agree' received RETURN false → tokenExpired=true on the client →
-- redirected to /signup "Save your responses" page mid-reading-flow.
--
-- Fix: replace the three wrong labels with the correct ones.
-- All other logic carried forward verbatim from 20260416140000.

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
  v_letter_id   UUID;
BEGIN
  -- NULL guard on p_point_id before any writes
  IF p_point_id IS NULL THEN
    RETURN false;
  END IF;

  -- Enum validation — reject unknown position values cleanly before cast.
  -- IMPORTANT: these must match the actual position_type enum values.
  IF p_position NOT IN (
    'strongly_disagree', 'disagree', 'somewhat_disagree', 'unsure',
    'somewhat_agree', 'agree', 'strongly_agree'
  ) THEN
    RETURN false;
  END IF;

  -- Validate token (expiry check removed in P683; invitation_expires_at gates
  -- session minting only, not engagement writes).
  SELECT ld.id, ld.letter_id INTO v_delivery_id, v_letter_id
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RETURN false;
  END IF;

  -- P684: reject anonymous callers on one-to-many letters (public letters require auth)
  IF (SELECT mode FROM clarity_letters WHERE id = v_letter_id) = 'one-to-many'
     AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required for one-to-many responses';
  END IF;

  -- Authorization guard: p_point_id must be in the letter's sealed point_config.
  -- Uses jsonb_array_elements(point_config->'points') — the immutable snapshot —
  -- NOT a story_points JOIN, which can diverge after seal (point deleted from
  -- story, test fixture missing story_points row, etc.).
  IF NOT EXISTS (
    SELECT 1
    FROM letter_story_snapshots lss,
         jsonb_array_elements(lss.point_config->'points') pt
    WHERE lss.letter_id = v_letter_id
      AND (pt->>'id')::uuid = p_point_id
  ) THEN
    RETURN false;
  END IF;

  -- Primary write: letter engagement record (idempotent).
  INSERT INTO letter_point_responses (delivery_id, point_id, position)
  VALUES (v_delivery_id, p_point_id, p_position)
  ON CONFLICT DO NOTHING;

  -- P705/P716 dual-write: live display store.
  -- Condition: auth.uid() IS NOT NULL (current caller), not v_receiver_id + is_verified.
  -- This covers the unclaimed-delivery case where receiver_profile_id is still NULL.
  -- SECURITY DEFINER bypasses RLS so both verified and unverified authenticated
  -- users write immediately. Anon callers skip; positions replay via
  -- persist_anonymous_completion at signup.
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO point_positions (point_id, user_id, position)
    VALUES (p_point_id, auth.uid(), p_position::position_type)
    ON CONFLICT (point_id, user_id) DO UPDATE
      SET position = EXCLUDED.position, updated_at = now();
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_point_response_by_token(UUID, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION submit_point_response_by_token(UUID, UUID, TEXT) TO authenticated;
