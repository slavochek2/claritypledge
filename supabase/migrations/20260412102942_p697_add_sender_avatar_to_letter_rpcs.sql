-- Migration: P697 — add sender avatar fields to letter reading RPCs
-- Both get_letter_for_reading and get_letter_for_public_reading already JOIN profiles
-- but only return sender_display_name. Adding avatar_url, avatar_color, has_pledged
-- so recipients see the sender's Google photo and pledge ring.

-- ============================================================================
-- 1. get_letter_for_reading (token path — anonymous-safe one-to-one reading)
--    Adds 3 fields to jsonb_build_object; all other logic identical to P651.
-- ============================================================================

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
  -- Validate token + expiry + letter status (identical to P651)
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

  -- Fetch letter WITH sender name + avatar fields (JOIN to profiles)
  SELECT jsonb_build_object(
    'id',                   cl.id,
    'source_doc_id',        cl.source_doc_id,
    'sender_id',            cl.sender_id,
    'sender_display_name',  COALESCE(p.name, 'Someone'),
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

  -- Fetch snapshots (ordered by position)
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

  -- Fetch delivery — NO receiver_email (redacted, bug #9 from P651)
  SELECT jsonb_build_object(
    'id',                       ld.id,
    'letter_id',                ld.letter_id,
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

-- Re-grant (idempotent)
GRANT EXECUTE ON FUNCTION get_letter_for_reading(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_letter_for_reading(UUID) TO authenticated;

-- ============================================================================
-- 2. get_letter_for_public_reading (public path — one-to-many anonymous reading)
--    Adds 3 fields to jsonb_build_object; all other logic identical to last version
--    (20260412170000_fix_public_reading_include_predictions.sql).
-- ============================================================================

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
