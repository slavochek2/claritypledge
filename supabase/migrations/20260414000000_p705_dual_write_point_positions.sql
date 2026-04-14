-- P705: Letter positions live everywhere — supersede D50.
--
-- Changes:
-- 1. submit_point_response_by_token: conditionally upserts into point_positions
--    when receiver_profile_id IS NOT NULL AND the profile is_verified = true.
--    Adds enum validation, authorization guard (point must belong to the letter),
--    and NULL guard on p_point_id per security review.
--
-- 2. persist_anonymous_completion: extended to replay staged letter_point_responses
--    rows into point_positions using v_caller_id (the newly-registered user_id).
--    This covers anon 1:1 readers and previously-unverified accounts.

-- ============================================================================
-- 1. submit_point_response_by_token — dual-write to point_positions
-- ============================================================================

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

  -- Authorization guard: p_point_id must belong to this letter
  IF NOT EXISTS (
    SELECT 1
    FROM letter_story_snapshots lss
    JOIN story_points sp ON sp.story_id = lss.story_id
    WHERE lss.letter_id = v_letter_id
      AND sp.point_id = p_point_id
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

-- ============================================================================
-- 2. persist_anonymous_completion — replay positions into point_positions
-- ============================================================================

CREATE OR REPLACE FUNCTION persist_anonymous_completion(
  p_nonce UUID,
  p_letter_id UUID,
  p_ratings JSONB,    -- array of {story_id, version_id, speaker_id, rating, sort_order}
  p_positions JSONB   -- array of {delivery_id, point_id, position}
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_delivery_id UUID;
  v_rating JSONB;
  v_pos JSONB;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Find the delivery for this letter+receiver (receiver_profile_id was set at registration)
  SELECT id INTO v_delivery_id
  FROM letter_deliveries
  WHERE letter_id = p_letter_id
    AND receiver_profile_id = v_caller_id
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RAISE EXCEPTION 'No delivery found for this letter and user';
  END IF;

  -- Persist ratings as story_verifications with source='letter'
  FOR v_rating IN SELECT * FROM jsonb_array_elements(p_ratings)
  LOOP
    INSERT INTO story_verifications (
      story_id, version_id, session_id, speaker_id, listener_id,
      listener_rating, source, verified, sort_order
    )
    VALUES (
      (v_rating->>'story_id')::UUID,
      (v_rating->>'version_id')::UUID,
      NULL,  -- no session for letter verifications
      (v_rating->>'speaker_id')::UUID,
      v_caller_id,
      (v_rating->>'rating')::SMALLINT,
      'letter',
      false,  -- letter verifications are not authoritative
      (v_rating->>'sort_order')::INTEGER
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- Persist point positions as letter_point_responses (staging buffer)
  FOR v_pos IN SELECT * FROM jsonb_array_elements(p_positions)
  LOOP
    INSERT INTO letter_point_responses (delivery_id, point_id, position)
    VALUES (
      v_delivery_id,
      (v_pos->>'point_id')::UUID,
      v_pos->>'position'
    )
    ON CONFLICT ON CONSTRAINT letter_point_responses_unique DO NOTHING;
  END LOOP;

  -- P705: Replay staged positions into point_positions (live display store).
  -- Seeds initial values only — DO NOTHING on conflict so live edits made after
  -- registration (e.g. user changes position on results page) are never overwritten.
  -- Only replays valid position_type enum values to avoid cast errors.
  INSERT INTO point_positions (point_id, user_id, position)
  SELECT
    lpr.point_id,
    v_caller_id,
    lpr.position::position_type
  FROM letter_point_responses lpr
  WHERE lpr.delivery_id = v_delivery_id
    AND lpr.position IN (
      'strongly_disagree', 'disagree', 'slightly_disagree', 'neutral',
      'slightly_agree', 'agree', 'strongly_agree'
    )
  ON CONFLICT (point_id, user_id) DO NOTHING;

  -- Mark delivery as completed
  UPDATE letter_deliveries
  SET status = 'completed', completed_at = now()
  WHERE id = v_delivery_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION persist_anonymous_completion(UUID, UUID, JSONB, JSONB) TO authenticated;
