-- P684: mode-gated auth guard for one-to-many letter engagement RPCs.
--
-- One-to-many letters are broadcast (sender → many readers). Anonymous responses
-- on broadcast letters create attribution problems — there's no way to dedup or
-- identify the respondent. This migration adds a server-side guard that rejects
-- unauthenticated callers on one-to-many letters before any write occurs.
--
-- Guard: IF letter.mode = 'one-to-many' AND auth.uid() IS NULL → RAISE EXCEPTION
-- Placement: AFTER token validation + delivery lookup, BEFORE any writes.
--
-- The one-to-one path is unaffected:
-- - COALESCE(auth.uid(), sentinel_uuid) is preserved on all RPCs
-- - GRANT ... TO anon is preserved on all RPCs (anon can still call one-to-one)
--
-- Source: bodies are verbatim clones of 20260411201933_p683_engagement_rpcs_drop_expiry_check.sql
-- with the mode-gated guard inserted after the token-validation null check.
-- Two RPCs (submit_point_response_by_token, update_delivery_status_by_token) also gain
-- a v_letter_id variable so the guard can read clarity_letters.mode without an extra query.

-- 1. Submit point position (anon-safe for one-to-one; auth-required for one-to-many)
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
  -- Validate token (expiry check removed — invitation_expires_at gates session minting,
  -- not engagement; see P683 migration header for full explanation)
  SELECT ld.id, ld.letter_id INTO v_delivery_id, v_letter_id
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

  INSERT INTO letter_point_responses (delivery_id, point_id, position)
  VALUES (v_delivery_id, p_point_id, p_position)
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_point_response_by_token(UUID, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION submit_point_response_by_token(UUID, UUID, TEXT) TO authenticated;

-- 2. Submit story rating (anon-safe for one-to-one; auth-required for one-to-many)
CREATE OR REPLACE FUNCTION submit_rating_by_token(
  p_token UUID,
  p_story_id UUID,
  p_rating INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_id UUID;
  v_letter_id   UUID;
  v_sender_id   UUID;
BEGIN
  -- Validate token + get sender + letter
  SELECT ld.id, cl.id, cl.sender_id INTO v_delivery_id, v_letter_id, v_sender_id
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

  -- Insert story verification (rating)
  -- Note: accuracy_achieved is GENERATED; session_id is FK to clarity_sessions (NULL for letters)
  INSERT INTO story_verifications (
    story_id, version_id, speaker_id, listener_id,
    listener_rating, speaker_rating,
    source, verified, session_id
  ) VALUES (
    p_story_id,
    (SELECT version_id FROM letter_story_snapshots WHERE letter_id = v_letter_id AND story_id = p_story_id LIMIT 1),
    v_sender_id,
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    p_rating, 0,
    'letter', false, NULL
  )
  ON CONFLICT DO NOTHING;

  -- Update delivery progress
  UPDATE letter_deliveries
  SET stories_rated = stories_rated + 1
  WHERE id = v_delivery_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_rating_by_token(UUID, UUID, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION submit_rating_by_token(UUID, UUID, INTEGER) TO authenticated;

-- 3. Reveal prediction (anon-safe for one-to-one; auth-required for one-to-many)
-- NOTE: body from P648 fix (20260404112655) — uses speaker_id, not session_id::text.
-- Letters insert story_verifications with session_id = NULL; the old session_id check
-- was always false. P648 fixed it; preserve that fix here while adding mode guard.
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
  v_letter_id   UUID;
  v_sender_id   UUID;
  v_prediction  INTEGER;
BEGIN
  -- Validate token (expiry predicate removed — see P683 migration header)
  SELECT ld.id, ld.letter_id, cl.sender_id INTO v_delivery_id, v_letter_id, v_sender_id
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- P684: reject anonymous callers on one-to-many letters only
  IF (SELECT mode FROM clarity_letters WHERE id = v_letter_id) = 'one-to-many'
     AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required for one-to-many responses';
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

GRANT EXECUTE ON FUNCTION reveal_prediction_by_token(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION reveal_prediction_by_token(UUID, UUID) TO authenticated;

-- 4. Update delivery status (anon-safe for one-to-one; auth-required for one-to-many)
CREATE OR REPLACE FUNCTION update_delivery_status_by_token(
  p_token UUID,
  p_status TEXT
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
  SELECT ld.id, ld.letter_id INTO v_delivery_id, v_letter_id
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

  UPDATE letter_deliveries
  SET
    status = p_status,
    opened_at = CASE WHEN p_status = 'opened' AND opened_at IS NULL THEN now() ELSE opened_at END,
    completed_at = CASE WHEN p_status = 'completed' AND completed_at IS NULL THEN now() ELSE completed_at END,
    receiver_profile_id = COALESCE(receiver_profile_id, auth.uid())
  WHERE id = v_delivery_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION update_delivery_status_by_token(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION update_delivery_status_by_token(UUID, TEXT) TO authenticated;
