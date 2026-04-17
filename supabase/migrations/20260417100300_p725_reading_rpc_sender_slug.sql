-- P725: Add sender_slug to both reading RPCs.
--
-- get_letter_for_reading / get_letter_for_public_reading each already LEFT JOIN
-- profiles on cl.sender_id (P697 added the avatar fields). Adding p.slug to the
-- letter jsonb_build_object is a purely additive change — no signature change,
-- no return-type change (still JSONB).
--
-- The public RPC currently exposes only name + basic letter fields (intentional
-- — no avatar on public reading per 20260412170000). P725 only adds slug there;
-- the avatar decision is out of scope for this migration.
--
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION get_letter_for_reading(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_letter_id   UUID;
  v_delivery_id UUID;
  v_letter      JSONB;
  v_snapshots   JSONB;
  v_delivery    JSONB;
BEGIN
  SELECT cl.id, ld.id
  INTO v_letter_id, v_delivery_id
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_letter_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Letter + sender profile fields (P697: avatar, P717: parent guards, P725: slug)
  SELECT jsonb_build_object(
    'id',                   cl.id,
    'source_doc_id',        cl.source_doc_id,
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
  WHERE cl.id = v_letter_id;

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
  WHERE lss.letter_id = v_letter_id;

  SELECT jsonb_build_object(
    'id',                       ld.id,
    'letter_id',                ld.letter_id,
    'receiver_email',           ld.receiver_email,
    'receiver_profile_id',      ld.receiver_profile_id,
    'receiver_name',            ld.receiver_name,
    'invitation_token',         ld.invitation_token,
    'invitation_expires_at',    ld.invitation_expires_at,
    'access_token_expires_at',  ld.access_token_expires_at,
    'status',                   ld.status,
    'stories_rated',            ld.stories_rated,
    'opened_at',                ld.opened_at,
    'completed_at',             ld.completed_at,
    'created_at',               ld.created_at
  ) INTO v_delivery
  FROM letter_deliveries ld
  WHERE ld.id = v_delivery_id;

  RETURN jsonb_build_object(
    'letter',    v_letter,
    'snapshots', v_snapshots,
    'delivery',  v_delivery
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_letter_for_reading(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_letter_for_reading(UUID) TO authenticated;

-- Public reading RPC — also exposes sender_slug (anonymous letters, one-to-many)
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
