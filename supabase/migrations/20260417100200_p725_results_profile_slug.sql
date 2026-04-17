-- P725: Extend get_letter_results() to include slug in both profile JSONB objects.
--
-- Used by /letter/:id/results to render the "Letter from/to [Name]" identity row
-- and the per-point avatars. Adding slug to jsonb_build_object does not change
-- the function's return type signature (only the JSONB contents), so CREATE OR
-- REPLACE is safe — no DROP required.
--
-- Matches AD4 of P725 spec.

CREATE OR REPLACE FUNCTION get_letter_results(
  p_letter_id  UUID,
  p_delivery_id UUID DEFAULT NULL
)
RETURNS TABLE (
  perspective      TEXT,
  sender_profile   JSONB,
  receiver_profile JSONB,
  snapshots        JSONB,
  predictions      JSONB,
  ratings          JSONB,
  point_responses  JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id              UUID;
  v_letter_status          TEXT;
  v_receiver_profile_id    UUID;
  v_actual_delivery_id     UUID;
  v_perspective            TEXT;
  v_sender_profile_json    JSONB;
  v_receiver_profile_json  JSONB;
  v_snapshot_story_ids     UUID[];
  v_snapshots              JSONB;
  v_predictions            JSONB;
  v_ratings                JSONB;
  v_point_responses        JSONB;
BEGIN
  -- ── Step 1: Resolve letter ownership ─────────────────────────────────────
  SELECT cl.sender_id, cl.status
  INTO v_sender_id, v_letter_status
  FROM clarity_letters cl
  WHERE cl.id = p_letter_id;

  -- Letter not found or not sealed → return NULL silently
  IF v_sender_id IS NULL OR v_letter_status != 'sealed' THEN
    RETURN;
  END IF;

  -- ── Step 2: Determine perspective ────────────────────────────────────────
  IF auth.uid() = v_sender_id THEN
    v_perspective := 'sender';

    -- If delivery_id supplied, resolve receiver for sender view
    IF p_delivery_id IS NOT NULL THEN
      SELECT ld.receiver_profile_id, ld.id
      INTO v_receiver_profile_id, v_actual_delivery_id
      FROM letter_deliveries ld
      WHERE ld.id = p_delivery_id
        AND ld.letter_id = p_letter_id;
      -- Note: delivery may not exist or belong to another letter → v_receiver_profile_id stays NULL
    END IF;

  ELSE
    -- Caller is not the sender — must be a receiver with a valid delivery
    IF p_delivery_id IS NULL THEN
      RETURN;  -- receiver path requires explicit delivery_id
    END IF;

    SELECT ld.receiver_profile_id, ld.id
    INTO v_receiver_profile_id, v_actual_delivery_id
    FROM letter_deliveries ld
    WHERE ld.id = p_delivery_id
      AND ld.letter_id = p_letter_id
      AND ld.receiver_profile_id = auth.uid();

    IF v_actual_delivery_id IS NULL THEN
      RETURN;  -- delivery not found or not owned by caller
    END IF;

    v_perspective := 'receiver';
  END IF;

  -- ── Step 3: Fetch profile objects (P725: include slug) ───────────────────
  SELECT jsonb_build_object(
    'id',          p.id,
    'name',        p.name,
    'slug',        p.slug,
    'avatar_url',  p.avatar_url,
    'avatar_color', p.avatar_color,
    'role',        p.role,
    'has_pledged', COALESCE(p.has_pledged, false),
    'ears_count',  COALESCE(p.ears_count, 0)
  )
  INTO v_sender_profile_json
  FROM profiles p
  WHERE p.id = v_sender_id;

  IF v_receiver_profile_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id',          p.id,
      'name',        p.name,
      'slug',        p.slug,
      'avatar_url',  p.avatar_url,
      'avatar_color', p.avatar_color,
      'role',        p.role,
      'has_pledged', COALESCE(p.has_pledged, false),
      'ears_count',  COALESCE(p.ears_count, 0)
    )
    INTO v_receiver_profile_json
    FROM profiles p
    WHERE p.id = v_receiver_profile_id;
  END IF;

  -- ── Step 4: Fetch snapshots ───────────────────────────────────────────────
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'story_id',    lss.story_id,
      'version_id',  lss.version_id,
      'position',    lss.position,
      'point_config', lss.point_config,
      'visibility',  lss.visibility
    ) ORDER BY lss.position
  ), '[]'::jsonb)
  INTO v_snapshots
  FROM letter_story_snapshots lss
  WHERE lss.letter_id = p_letter_id;

  SELECT COALESCE(array_agg(lss.story_id), '{}')
  INTO v_snapshot_story_ids
  FROM letter_story_snapshots lss
  WHERE lss.letter_id = p_letter_id;

  -- ── Step 5: Fetch predictions (sealed-bid enforced) ───────────────────────
  IF v_perspective = 'sender' THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'story_id',   lp.story_id,
        'prediction', lp.prediction
      )
    ), '[]'::jsonb)
    INTO v_predictions
    FROM letter_predictions lp
    WHERE lp.letter_id = p_letter_id
      AND (
        p_delivery_id IS NULL
        OR lp.delivery_id = p_delivery_id
        OR lp.delivery_id IS NULL
      );
  ELSE
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'story_id',   lp.story_id,
        'prediction', lp.prediction
      )
    ), '[]'::jsonb)
    INTO v_predictions
    FROM letter_predictions lp
    WHERE lp.letter_id = p_letter_id
      AND (lp.delivery_id = p_delivery_id OR lp.delivery_id IS NULL)
      AND EXISTS (
        SELECT 1 FROM story_verifications sv
        WHERE sv.story_id = lp.story_id
          AND sv.source = 'letter'
          AND sv.listener_id = auth.uid()
      );
  END IF;

  -- ── Step 6: Fetch ratings ─────────────────────────────────────────────────
  IF v_actual_delivery_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'story_id',       sv.story_id,
        'listener_rating', sv.listener_rating
      )
    ), '[]'::jsonb)
    INTO v_ratings
    FROM story_verifications sv
    WHERE sv.source = 'letter'
      AND sv.speaker_id = v_sender_id
      AND sv.story_id = ANY(v_snapshot_story_ids)
      AND sv.listener_id = (
        CASE WHEN v_perspective = 'receiver' THEN auth.uid()
             ELSE v_receiver_profile_id
        END
      );
  ELSE
    v_ratings := '[]'::jsonb;
  END IF;

  -- ── Step 7: Fetch point responses ─────────────────────────────────────────
  IF v_actual_delivery_id IS NOT NULL AND (
    v_perspective = 'receiver'
    OR (v_perspective = 'sender' AND p_delivery_id IS NOT NULL)
  ) THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'point_id',    lpr.point_id,
        'delivery_id', lpr.delivery_id,
        'position',    lpr.position
      )
    ), '[]'::jsonb)
    INTO v_point_responses
    FROM letter_point_responses lpr
    WHERE lpr.delivery_id = v_actual_delivery_id;
  ELSE
    v_point_responses := '[]'::jsonb;
  END IF;

  RETURN QUERY SELECT
    v_perspective,
    v_sender_profile_json,
    v_receiver_profile_json,
    v_snapshots,
    v_predictions,
    v_ratings,
    v_point_responses;
END;
$$;

GRANT EXECUTE ON FUNCTION get_letter_results(UUID, UUID) TO authenticated;
