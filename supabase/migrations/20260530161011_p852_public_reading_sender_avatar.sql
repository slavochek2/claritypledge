-- P852 Phase-3: expose sender avatar fields on get_letter_for_public_reading.
-- diffed against: 20260417100300_p725_reading_rpc_sender_slug.sql
--
-- Why: the public RPC already returns `sender_display_name` (full name) — hiding
-- only the photo doesn't add privacy, it just creates an inconsistent identity
-- presentation between the authenticated and public reading paths. The sender
-- opening their own one-to-many letter currently sees blue-default initials
-- instead of their own Google photo because this RPC strips the avatar fields.
-- The P725 comment claiming the omission was "intentional" was likely an
-- oversight: the prior migration (P697) added avatar to get_letter_for_reading
-- but never propagated to get_letter_for_public_reading.
--
-- Symmetry with get_letter_for_reading (P697 + P725):
--   sender_avatar_url, sender_avatar_color, sender_has_pledged.
--
-- Idempotent: CREATE OR REPLACE.

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
  SELECT jsonb_build_object(
    'id',                   cl.id,
    'sender_id',            cl.sender_id,
    'sender_display_name',  COALESCE(p.name, 'Someone'),
    'sender_slug',          p.slug,
    'sender_avatar_url',    p.avatar_url,
    'sender_avatar_color',  p.avatar_color,
    'sender_has_pledged',   COALESCE(p.has_pledged, false),
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

GRANT EXECUTE ON FUNCTION get_letter_for_public_reading(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_letter_for_public_reading(UUID) TO authenticated;
