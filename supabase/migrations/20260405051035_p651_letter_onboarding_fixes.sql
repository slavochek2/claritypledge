-- P651: Letter Recipient Onboarding Redesign — All RPC fixes + schema changes.
-- Fixes bugs #1-10 from spec, adds sender name join, receiver_name column,
-- delivery duplicate constraint, status regression guard, helper REVOKE.

-- ============================================================================
-- 1. Add receiver_name column to letter_deliveries (nullable — only new letters use it)
-- ============================================================================
ALTER TABLE letter_deliveries ADD COLUMN IF NOT EXISTS receiver_name TEXT;

-- ============================================================================
-- 2. Add UNIQUE constraint on (letter_id, receiver_email) — bug #7
-- Prevents duplicate deliveries to the same email for the same letter.
-- Partial index: only applies when receiver_email IS NOT NULL (1-to-many has NULL).
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_letter_deliveries_unique_email
  ON letter_deliveries (letter_id, receiver_email)
  WHERE receiver_email IS NOT NULL;

-- ============================================================================
-- 3. REVOKE helper functions from public/anon — bug #6
-- _is_letter_sender and _is_letter_receiver should only be callable by authenticated.
-- ============================================================================
REVOKE ALL ON FUNCTION _is_letter_sender(UUID, UUID) FROM public;
REVOKE ALL ON FUNCTION _is_letter_sender(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION _is_letter_sender(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION _is_letter_receiver(UUID, UUID) FROM public;
REVOKE ALL ON FUNCTION _is_letter_receiver(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION _is_letter_receiver(UUID, UUID) TO authenticated;

-- ============================================================================
-- 4. Replace get_letter_for_reading — add sender name JOIN, add receiver_name,
--    remove receiver_email from delivery response (bug #9 email redaction)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_letter_for_reading(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_letter_id UUID;
  v_delivery_id UUID;
  v_letter JSONB;
  v_snapshots JSONB;
  v_delivery JSONB;
BEGIN
  -- Validate token + expiry + letter status
  SELECT cl.id, ld.id
  INTO v_letter_id, v_delivery_id
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND (ld.invitation_expires_at IS NULL OR ld.invitation_expires_at > now())
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_letter_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Fetch letter WITH sender display name (JOIN to profiles)
  SELECT jsonb_build_object(
    'id', cl.id,
    'source_doc_id', cl.source_doc_id,
    'sender_id', cl.sender_id,
    'sender_display_name', COALESCE(p.name, 'Someone'),
    'mode', cl.mode,
    'status', cl.status,
    'sealed_at', cl.sealed_at,
    'created_at', cl.created_at
  ) INTO v_letter
  FROM clarity_letters cl
  LEFT JOIN profiles p ON p.id = cl.sender_id
  WHERE cl.id = v_letter_id;

  -- Fetch snapshots (ordered by position)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'letter_id', lss.letter_id,
      'story_id', lss.story_id,
      'version_id', lss.version_id,
      'position', lss.position,
      'point_config', lss.point_config,
      'visibility', lss.visibility
    ) ORDER BY lss.position
  ), '[]'::jsonb) INTO v_snapshots
  FROM letter_story_snapshots lss
  WHERE lss.letter_id = v_letter_id;

  -- Fetch delivery — NO receiver_email (redacted, bug #9)
  SELECT jsonb_build_object(
    'id', ld.id,
    'letter_id', ld.letter_id,
    'receiver_profile_id', ld.receiver_profile_id,
    'receiver_name', ld.receiver_name,
    'invitation_token', ld.invitation_token,
    'invitation_expires_at', ld.invitation_expires_at,
    'access_token_expires_at', ld.access_token_expires_at,
    'status', ld.status,
    'stories_rated', ld.stories_rated,
    'opened_at', ld.opened_at,
    'completed_at', ld.completed_at,
    'created_at', ld.created_at
  ) INTO v_delivery
  FROM letter_deliveries ld
  WHERE ld.id = v_delivery_id;

  RETURN jsonb_build_object(
    'letter', v_letter,
    'snapshots', v_snapshots,
    'delivery', v_delivery
  );
END;
$$;

-- Re-grant (idempotent)
GRANT EXECUTE ON FUNCTION get_letter_for_reading(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_letter_for_reading(UUID) TO authenticated;

-- ============================================================================
-- 5. Replace get_letter_by_token — remove receiver_email from response (bug #9)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_letter_by_token(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'letter_id', cl.id,
    'source_doc_id', cl.source_doc_id,
    'sender_id', cl.sender_id,
    'mode', cl.mode,
    'status', cl.status,
    'sealed_at', cl.sealed_at,
    'delivery_id', ld.id,
    'receiver_profile_id', ld.receiver_profile_id,
    'receiver_name', ld.receiver_name,
    'delivery_status', ld.status,
    'invitation_expires_at', ld.invitation_expires_at
  ) INTO v_result
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND (ld.invitation_expires_at IS NULL OR ld.invitation_expires_at > now())
    AND cl.status = 'sealed'
  LIMIT 1;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_letter_by_token(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_letter_by_token(UUID) TO authenticated;

-- ============================================================================
-- 6. Replace reveal_prediction_by_token — scope sealed-bid to delivery (bug #3)
--    Check rating by listener_id matching the delivery's receiver, not globally.
-- ============================================================================
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
  v_receiver_id UUID;
  v_prediction INTEGER;
BEGIN
  -- Validate token + get sender + letter + receiver
  SELECT ld.id, ld.letter_id, cl.sender_id, ld.receiver_profile_id
  INTO v_delivery_id, v_letter_id, v_sender_id, v_receiver_id
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND (ld.invitation_expires_at IS NULL OR ld.invitation_expires_at > now())
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check rating exists for THIS delivery's receiver (scoped sealed-bid)
  -- For authenticated receivers: match listener_id = receiver_profile_id
  -- For anon token-based: match by story_id + speaker_id + source + verify story is in this letter's snapshots
  IF v_receiver_id IS NOT NULL THEN
    -- Authenticated path: check specific listener
    IF NOT EXISTS (
      SELECT 1 FROM story_verifications sv
      JOIN letter_story_snapshots lss ON lss.story_id = sv.story_id AND lss.letter_id = v_letter_id
      WHERE sv.story_id = p_story_id
        AND sv.listener_id = v_receiver_id
        AND sv.speaker_id = v_sender_id
        AND sv.source = 'letter'
    ) THEN
      RETURN NULL;
    END IF;
  ELSE
    -- Anon path: check rating via token user (auth.uid() or sentinel)
    IF NOT EXISTS (
      SELECT 1 FROM story_verifications sv
      JOIN letter_story_snapshots lss ON lss.story_id = sv.story_id AND lss.letter_id = v_letter_id
      WHERE sv.story_id = p_story_id
        AND sv.speaker_id = v_sender_id
        AND sv.source = 'letter'
        AND sv.listener_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Return prediction scoped to this delivery
  SELECT lp.prediction INTO v_prediction
  FROM letter_predictions lp
  WHERE lp.letter_id = v_letter_id
    AND lp.story_id = p_story_id
    AND (lp.delivery_id = v_delivery_id OR lp.delivery_id IS NULL)
  ORDER BY CASE WHEN lp.delivery_id = v_delivery_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_prediction IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object('prediction', v_prediction);
END;
$$;

GRANT EXECUTE ON FUNCTION reveal_prediction_by_token(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION reveal_prediction_by_token(UUID, UUID) TO authenticated;

-- ============================================================================
-- 7. Replace update_delivery_status_by_token — add forward-only guard (bug #10)
-- ============================================================================
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
  v_current_status TEXT;
  v_status_order INTEGER[];
  v_current_rank INTEGER;
  v_new_rank INTEGER;
BEGIN
  -- Status ordering: sent=1, opened=2, in_progress=3, completed=4
  v_status_order := ARRAY[1, 2, 3, 4];

  SELECT ld.id, ld.status INTO v_delivery_id, v_current_status
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND (ld.invitation_expires_at IS NULL OR ld.invitation_expires_at > now())
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RETURN false;
  END IF;

  -- Map status to rank
  v_current_rank := CASE v_current_status
    WHEN 'sent' THEN 1 WHEN 'opened' THEN 2 WHEN 'in_progress' THEN 3 WHEN 'completed' THEN 4 ELSE 0 END;
  v_new_rank := CASE p_status
    WHEN 'sent' THEN 1 WHEN 'opened' THEN 2 WHEN 'in_progress' THEN 3 WHEN 'completed' THEN 4 ELSE 0 END;

  -- Reject backward transitions
  IF v_new_rank <= v_current_rank THEN
    RETURN true; -- no-op, not an error
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

-- ============================================================================
-- 8. Replace seal_and_send_letter — accept receiver_name + duplicate guard (bug #7)
-- ============================================================================
CREATE OR REPLACE FUNCTION seal_and_send_letter(
  p_letter_id UUID,
  p_predictions JSONB DEFAULT '[]'::jsonb,
  p_deliveries JSONB DEFAULT '[]'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id UUID;
  v_mode TEXT;
  v_letter_status TEXT;
  v_source_doc_id UUID;
  v_pred JSONB;
  v_del JSONB;
  v_delivery_id UUID;
BEGIN
  -- Validate sender owns the letter and it's still draft
  SELECT sender_id, mode, status, source_doc_id
  INTO v_sender_id, v_mode, v_letter_status, v_source_doc_id
  FROM clarity_letters
  WHERE id = p_letter_id;

  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Letter not found: %', p_letter_id;
  END IF;

  IF v_sender_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the letter sender can seal this letter';
  END IF;

  IF v_letter_status != 'draft' THEN
    RAISE EXCEPTION 'Letter is already sealed or expired (status: %)', v_letter_status;
  END IF;

  -- Snapshot story_versions + doc_stories into letter_story_snapshots
  INSERT INTO letter_story_snapshots (letter_id, story_id, version_id, position, point_config, visibility)
  SELECT
    p_letter_id,
    ds.story_id,
    sv.id,
    ds.position,
    ds.point_config,
    s.visibility::text
  FROM doc_stories ds
  JOIN stories s ON s.id = ds.story_id
  JOIN story_versions sv ON sv.story_id = s.id AND sv.version_number = s.current_version
  WHERE ds.doc_id = v_source_doc_id
    AND (v_mode = 'one-to-one' OR s.visibility = 'public'::content_visibility)
  ON CONFLICT (letter_id, story_id) DO NOTHING;

  -- Create predictions from the provided array
  FOR v_pred IN SELECT * FROM jsonb_array_elements(p_predictions)
  LOOP
    INSERT INTO letter_predictions (letter_id, delivery_id, story_id, prediction)
    VALUES (
      p_letter_id,
      CASE WHEN v_pred->>'delivery_id' IS NOT NULL
        THEN (v_pred->>'delivery_id')::UUID
        ELSE NULL
      END,
      (v_pred->>'story_id')::UUID,
      (v_pred->>'prediction')::INTEGER
    )
    ON CONFLICT ON CONSTRAINT letter_predictions_unique DO NOTHING;
  END LOOP;

  -- Create deliveries — now accepts receiver_name, with duplicate guard
  FOR v_del IN SELECT * FROM jsonb_array_elements(p_deliveries)
  LOOP
    INSERT INTO letter_deliveries (letter_id, receiver_email, receiver_name, invitation_expires_at)
    VALUES (
      p_letter_id,
      v_del->>'receiver_email',
      v_del->>'receiver_name',
      now() + interval '7 days'
    )
    ON CONFLICT (letter_id, receiver_email) WHERE receiver_email IS NOT NULL DO NOTHING;
  END LOOP;

  -- Seal the letter
  UPDATE clarity_letters
  SET status = 'sealed', sealed_at = now()
  WHERE id = p_letter_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION seal_and_send_letter(UUID, JSONB, JSONB) TO authenticated;

-- ============================================================================
-- 9. Replace submit_rating_by_token — bug #1 (remove accuracy_achieved),
--    already has session_id = NULL (correct). Add version_id + letter_id lookup.
-- ============================================================================
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
  v_letter_id UUID;
  v_sender_id UUID;
  v_version_id UUID;
BEGIN
  -- Validate token + get sender + letter
  SELECT ld.id, cl.id, cl.sender_id INTO v_delivery_id, v_letter_id, v_sender_id
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND (ld.invitation_expires_at IS NULL OR ld.invitation_expires_at > now())
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RETURN false;
  END IF;

  -- Get version_id from snapshot
  SELECT lss.version_id INTO v_version_id
  FROM letter_story_snapshots lss
  WHERE lss.letter_id = v_letter_id AND lss.story_id = p_story_id
  LIMIT 1;

  -- Insert story verification (rating)
  -- Bug #1 fix: do NOT set accuracy_achieved (it's GENERATED ALWAYS)
  -- session_id = NULL (letters don't use clarity_sessions)
  INSERT INTO story_verifications (
    story_id, version_id, speaker_id, listener_id,
    listener_rating, speaker_rating,
    source, verified, session_id
  ) VALUES (
    p_story_id,
    v_version_id,
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
