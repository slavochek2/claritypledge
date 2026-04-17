-- P642: SECURITY DEFINER RPC for anonymous letter reading.
-- Fixes RLS block: getLetterForReading() used direct table queries that
-- require auth.uid() != NULL, blocking anonymous recipients with valid tokens.
-- This RPC validates the token and returns all data needed for reading.

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
  -- Validate token + expiry + letter status (same logic as get_letter_by_token)
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

  -- Fetch letter
  SELECT jsonb_build_object(
    'id', cl.id,
    'source_doc_id', cl.source_doc_id,
    'sender_id', cl.sender_id,
    'mode', cl.mode,
    'status', cl.status,
    'sealed_at', cl.sealed_at,
    'created_at', cl.created_at
  ) INTO v_letter
  FROM clarity_letters cl
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

  -- Fetch delivery
  SELECT jsonb_build_object(
    'id', ld.id,
    'letter_id', ld.letter_id,
    'receiver_email', ld.receiver_email,
    'receiver_profile_id', ld.receiver_profile_id,
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

-- Allow anonymous access (recipient may not be logged in)
GRANT EXECUTE ON FUNCTION get_letter_for_reading(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_letter_for_reading(UUID) TO authenticated;
