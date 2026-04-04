-- P642: Fix seal_and_send_letter to denormalize story content into point_config.
-- The reader component expects point_config.storyText and point_config.points[]
-- but the seal RPC was only copying raw doc_stories.point_config (ordering metadata).
-- This replaces the INSERT with a version that builds enriched point_config JSONB
-- containing the actual story text and point data for immutable snapshots.

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
  -- Denormalize content into point_config for immutable reading
  -- For 1-to-many: enforce only public-visibility stories (Security gap #7)
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
            )
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

  -- Create deliveries from the provided array
  FOR v_del IN SELECT * FROM jsonb_array_elements(p_deliveries)
  LOOP
    INSERT INTO letter_deliveries (letter_id, receiver_email, invitation_expires_at)
    VALUES (
      p_letter_id,
      v_del->>'receiver_email',
      now() + interval '7 days'
    );
  END LOOP;

  -- Seal the letter
  UPDATE clarity_letters
  SET status = 'sealed', sealed_at = now()
  WHERE id = p_letter_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION seal_and_send_letter(UUID, JSONB, JSONB) TO authenticated;
