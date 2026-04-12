-- Fix: block self-sends at the send and claim steps.
--
-- Two guards:
--
-- 1. seal_and_send_letter: if any delivery's receiver_email matches the
--    sender's own email in auth.users, raise an exception before creating
--    the delivery. This is the primary prevention point.
--
-- 2. claim_letter_delivery: if auth.uid() matches the letter's sender_id,
--    return an 'error: cannot_claim_own_letter' response. This covers edge
--    cases (manually crafted tokens, future code paths).
--
-- The inbox filter added in 20260412134713 remains as a safety net for any
-- historical self-sent data.
--
-- Base: 20260410091421_seal_rpc_add_point_visibility.sql

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
  v_sender_email TEXT;
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

  -- Look up sender's email for self-send guard
  SELECT email INTO v_sender_email
  FROM auth.users
  WHERE id = v_sender_id;

  -- Snapshot story_versions + doc_stories into letter_story_snapshots.
  -- Denormalize story content into point_config for immutable reading (P642).
  -- For 1-to-many: enforce only public-visibility stories.
  INSERT INTO letter_story_snapshots (letter_id, story_id, version_id, position, point_config, visibility)
  SELECT
    p_letter_id,
    ds.story_id,
    sv.id,
    ds.position,
    jsonb_build_object(
      'storyText', COALESCE(sv.content, ''),
      'storyTitle', COALESCE(sv.title, ''),
      'points', COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'id', pt.id::text,
            'text', pt.statement,
            'authorPosition', (
              SELECT pp.position::text
              FROM point_positions pp
              WHERE pp.point_id = pt.id AND pp.user_id = v_sender_id
              LIMIT 1
            ),
            'visibility', pt.visibility::text
          ) ORDER BY sp.created_at
        )
        FROM story_points sp
        JOIN points pt ON pt.id = sp.point_id
        WHERE sp.story_id = ds.story_id
        ), '[]'::jsonb
      ),
      'order', COALESCE(ds.point_config->'order', '[]'::jsonb),
      'hidden', COALESCE(ds.point_config->'hidden', '[]'::jsonb)
    ),
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

  -- Create deliveries — block self-sends, accepts receiver_name, with duplicate guard (P651)
  FOR v_del IN SELECT * FROM jsonb_array_elements(p_deliveries)
  LOOP
    IF v_del->>'receiver_email' = v_sender_email THEN
      RAISE EXCEPTION 'Cannot send a letter to yourself (receiver_email matches sender)';
    END IF;

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

-- claim_letter_delivery: block sender from claiming their own letter delivery.
--
-- Base: 20260404102539_p642_claim_letter_delivery.sql

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
  v_sender_id UUID;
BEGIN
  -- Validate token + expiry + letter status
  SELECT ld.id, ld.letter_id, ld.receiver_profile_id, cl.sender_id
  INTO v_delivery_id, v_letter_id, v_current_receiver, v_sender_id
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND (ld.invitation_expires_at IS NULL OR ld.invitation_expires_at > now())
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Block sender from claiming their own letter
  IF v_sender_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'cannot_claim_own_letter');
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
