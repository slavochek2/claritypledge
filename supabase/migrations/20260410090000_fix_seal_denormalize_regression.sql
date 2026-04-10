-- Fix: P651 clobbered P642's seal_and_send_letter denormalization.
--
-- P651 replaced the enriched jsonb_build_object(...) in the snapshot INSERT
-- with bare ds.point_config (raw ordering metadata). Any letter sealed after P651
-- has an empty storyText and zero points in the sent/public view.
--
-- This migration:
-- 1. Restores the P642 enrichment block (storyText, storyTitle, points[])
-- 2. Preserves all P651 additions (receiver_name, duplicate guard)
-- 3. Backfills existing broken snapshots where storyText is missing

-- ============================================================================
-- 1. Replace seal_and_send_letter — restore P642 enrichment + keep P651 additions
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

  -- Create deliveries — accepts receiver_name, with duplicate guard (P651)
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
-- 2. Backfill existing broken snapshots (sealed after P651, before this fix)
-- Only touches rows where storyText is missing (the broken ones).
-- ============================================================================
-- clarity_letters joined via comma + WHERE (not JOIN) because lss is the UPDATE target
-- and PostgreSQL disallows referencing the UPDATE target table in FROM-clause JOIN conditions.
UPDATE letter_story_snapshots lss
SET point_config = jsonb_build_object(
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
          WHERE pp.point_id = pt.id AND pp.user_id = cl.sender_id
          LIMIT 1
        )
      ) ORDER BY sp.created_at
    )
    FROM story_points sp
    JOIN points pt ON pt.id = sp.point_id
    WHERE sp.story_id = lss.story_id
    ), '[]'::jsonb
  ),
  'order', COALESCE(lss.point_config->'order', '[]'::jsonb),
  'hidden', COALESCE(lss.point_config->'hidden', '[]'::jsonb)
)
FROM stories s,
  story_versions sv,
  clarity_letters cl
WHERE s.id = lss.story_id
  AND sv.story_id = s.id AND sv.version_number = s.current_version
  AND cl.id = lss.letter_id
  AND (lss.point_config->>'storyText') IS NULL;
