-- P751: Add imageUrl to seal_and_send_letter snapshot output.
--
-- Root cause: seal_and_send_letter (last redefined by P701) builds the
-- point_config JSONB without an imageUrl key. stories.image_url exists
-- (added in P591). story_versions.image_url does NOT exist — use s.image_url.
--
-- Change: add 'imageUrl', COALESCE(s.image_url, '') to jsonb_build_object.
-- Base: P701 body (20260417180000_p701_scrub_title_references.sql).
-- Idempotent: CREATE OR REPLACE. No GRANT change needed.
-- Rollback: re-apply P701 body (additive key — absence defaults to ''/'undefined' client-side).

BEGIN;

CREATE OR REPLACE FUNCTION public.seal_and_send_letter(
  p_letter_id uuid,
  p_predictions jsonb DEFAULT '[]'::jsonb,
  p_deliveries jsonb DEFAULT '[]'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      'imageUrl', COALESCE(s.image_url, ''),
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
$function$;

GRANT EXECUTE ON FUNCTION seal_and_send_letter(UUID, JSONB, JSONB) TO authenticated;

COMMIT;
