-- P705 fix: authorization guard in submit_point_response_by_token must use the
-- sealed letter_story_snapshots.point_config instead of live story_points.
--
-- Root cause: the P705 migration added a guard that JOINs story_points to
-- confirm p_point_id belongs to the letter. This is too strict — letters are
-- immutable snapshots. A point may be in point_config (sealed at send time) but
-- absent from story_points (deleted from story after seal, or test setup without
-- linking). The guard returned false → client threw "Invalid or expired token".
--
-- Fix: replace the story_points JOIN with a jsonb_array_elements scan over
-- point_config->'points'. The sealed snapshot is the authoritative source.

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
  v_delivery_id       UUID;
  v_letter_id         UUID;
  v_receiver_id       UUID;
  v_receiver_verified BOOLEAN;
BEGIN
  -- NULL guard on p_point_id before any writes
  IF p_point_id IS NULL THEN
    RETURN false;
  END IF;

  -- Enum validation — reject unknown position values cleanly before cast
  IF p_position NOT IN (
    'strongly_disagree', 'disagree', 'slightly_disagree', 'neutral',
    'slightly_agree', 'agree', 'strongly_agree'
  ) THEN
    RETURN false;
  END IF;

  -- Validate token (expiry check removed in P683; mode guard added in P684)
  SELECT ld.id, ld.letter_id, ld.receiver_profile_id
    INTO v_delivery_id, v_letter_id, v_receiver_id
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RETURN false;
  END IF;

  -- P684: reject anonymous callers on one-to-many letters only
  IF (SELECT mode FROM clarity_letters WHERE id = v_letter_id) = 'one-to-many'
     AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required for one-to-many responses';
  END IF;

  -- Authorization guard: p_point_id must be in the letter's sealed point_config.
  -- Uses point_config->'points' (the immutable snapshot) instead of live story_points,
  -- which can diverge after seal (point deleted from story, etc.).
  IF NOT EXISTS (
    SELECT 1
    FROM letter_story_snapshots lss,
         jsonb_array_elements(lss.point_config->'points') pt
    WHERE lss.letter_id = v_letter_id
      AND (pt->>'id')::uuid = p_point_id
  ) THEN
    RETURN false;
  END IF;

  -- Staging buffer: always write to letter_point_responses
  INSERT INTO letter_point_responses (delivery_id, point_id, position)
  VALUES (v_delivery_id, p_point_id, p_position)
  ON CONFLICT DO NOTHING;

  -- Live display store: write to point_positions only when receiver is authenticated + verified.
  -- Anon 1:1 readers (receiver_profile_id IS NULL) skip this; positions are replayed by
  -- persist_anonymous_completion at registration. Unverified accounts also skip.
  IF v_receiver_id IS NOT NULL THEN
    SELECT is_verified INTO v_receiver_verified
    FROM profiles
    WHERE id = v_receiver_id;

    IF v_receiver_verified = true THEN
      INSERT INTO point_positions (point_id, user_id, position)
      VALUES (p_point_id, v_receiver_id, p_position::position_type)
      ON CONFLICT (point_id, user_id) DO UPDATE
        SET position = EXCLUDED.position, updated_at = now();
    END IF;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_point_response_by_token(UUID, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION submit_point_response_by_token(UUID, UUID, TEXT) TO authenticated;
