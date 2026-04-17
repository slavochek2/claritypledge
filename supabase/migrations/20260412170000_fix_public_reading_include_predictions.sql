-- Migration: fix get_letter_for_public_reading — include shared predictions
-- Bug: local mode (one-to-many anonymous reading) never received predictions,
-- causing prediction to stay null after reader submits confidence rating.
-- Fix: include delivery_id IS NULL predictions in the RPC response.

CREATE OR REPLACE FUNCTION get_letter_for_public_reading(p_letter_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_letter      JSONB;
  v_snapshots   JSONB;
  v_predictions JSONB;
BEGIN
  -- Validate: letter must exist, be sealed, and be one-to-many
  SELECT jsonb_build_object(
    'id',                   cl.id,
    'sender_id',            cl.sender_id,
    'sender_display_name',  COALESCE(p.name, 'Someone'),
    'mode',                 cl.mode,
    'status',               cl.status,
    'sealed_at',            cl.sealed_at,
    'created_at',           cl.created_at
  ) INTO v_letter
  FROM clarity_letters cl
  LEFT JOIN profiles p ON p.id = cl.sender_id
  WHERE cl.id = p_letter_id
    AND cl.status = 'sealed'
    AND cl.mode = 'one-to-many';

  IF v_letter IS NULL THEN
    RETURN NULL;
  END IF;

  -- Fetch story snapshots (P690 invariant: inside SECURITY DEFINER to bypass RLS
  -- for private-visibility source rows referenced by one-to-many letters).
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'letter_id',    lss.letter_id,
      'story_id',     lss.story_id,
      'version_id',   lss.version_id,
      'position',     lss.position,
      'point_config', lss.point_config,
      'visibility',   lss.visibility
    ) ORDER BY lss.position
  ), '[]'::jsonb) INTO v_snapshots
  FROM letter_story_snapshots lss
  WHERE lss.letter_id = p_letter_id;

  -- Fetch shared predictions (delivery_id IS NULL = one-to-many shared predictions).
  -- Sealed-bid safety: the UI state machine gates display until story-revealed phase.
  -- Client-side gating is sufficient for one-to-many public letters (no auth exists).
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'story_id',   lp.story_id,
      'prediction', lp.prediction
    )
  ), '[]'::jsonb) INTO v_predictions
  FROM letter_predictions lp
  WHERE lp.letter_id = p_letter_id
    AND lp.delivery_id IS NULL;

  RETURN jsonb_build_object(
    'letter',      v_letter,
    'snapshots',   v_snapshots,
    'predictions', v_predictions
  );
END;
$$;

-- Preserve existing grants
GRANT EXECUTE ON FUNCTION get_letter_for_public_reading(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_letter_for_public_reading(UUID) TO authenticated;
