-- P1379 (slice A, A3): a one-to-many (public) letter never discloses the author's
-- per-story prediction to a reader — nor, in results, to the author.
--
-- Founder decision 2026-09-30: public letters skip the author prediction step. New
-- public letters are sealed with no predictions; OLD public letters still hold rows
-- in letter_predictions. Those rows are KEPT (no DELETE, no schema change) and are
-- withheld here, on the server, for every reader path:
--
--   get_letter_for_public_reading  predictions := '[]' (the RPC only serves one-to-many)
--   reveal_prediction_by_token     RETURN NULL when the letter is one-to-many
--   reveal_prediction              RETURN NULL when the letter is one-to-many
--   get_letter_results             predictions := '[]' for one-to-many, BOTH perspectives
--   RLS "Predictions readable with sealed-bid"
--                                  receiver branch additionally requires mode = 'one-to-one';
--                                  sender branch unchanged
--
-- Also (UAT fix): get_letter_for_public_reading now returns letter.responses_mode.
--
-- get_letter_overview is deliberately NOT changed (author-only; the UI drops the column).
-- seal_and_send_letter is NOT changed (already accepts an empty p_predictions array).
--
-- diffed against: the latest file per object (bodies copied, only the P1379 lines added):
--   get_letter_for_public_reading  20260530161011_p852_public_reading_sender_avatar.sql
--   reveal_prediction_by_token     20260817120000_p1067_anon_rating_gates.sql (section 4c)
--   reveal_prediction              20260813170000_p1066_null_identity_authz_guards.sql (section 3)
--   get_letter_results             20260417100200_p725_results_profile_slug.sql
--   RLS policy                     20260403224331_p581_clarity_letters.sql (STEP 10)
-- Before editing, the test catalog was checked to carry each of those versions' markers
-- (P852 avatar fields, P1067 delivery gate, P1066 identity refusal, P725 slug).
-- Every guard those versions added is kept verbatim: P684 anon refusal on one-to-many,
-- P978/P1067 delivery-scoped sealed-bid gate, P1066 auth.uid() refusal.
--
-- Grants restated exactly as in each latest definition (no widening, no narrowing).
--
-- requires-frontend: 7bebb3514
--   Deployed clients before P1379 render "Calibration data unavailable." when a
--   one-to-many reveal returns no prediction. The frontend commit that adds the
--   public reveal must be live first; migrate.sh --env prod enforces this marker.
--
-- Integration test: e2e/integration/20260930120000_p1379_public_letters_no_author_prediction.spec.ts

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. get_letter_for_public_reading(uuid)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_letter_for_public_reading(p_letter_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_letter      JSONB;
  v_snapshots   JSONB;
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
    -- P1379 UAT: the reading page needs the author's response intensity; without it
    -- the client fell back to 'invite' and showed explain-back on "Just read" letters.
    'responses_mode',       cl.responses_mode,
    'status',               cl.status,
    'sealed_at',            cl.sealed_at,
    'created_at',           cl.created_at
  ) INTO v_letter
  FROM public.clarity_letters cl
  LEFT JOIN public.profiles p ON p.id = cl.sender_id
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
  FROM public.letter_story_snapshots lss
  WHERE lss.letter_id = p_letter_id;

  -- P1379: this RPC only ever returns one-to-many letters, and a one-to-many
  -- letter never discloses the author's prediction. The key stays (always '[]')
  -- so the response shape is unchanged for every client.
  RETURN jsonb_build_object(
    'letter',      v_letter,
    'snapshots',   v_snapshots,
    'predictions', '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_letter_for_public_reading(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_letter_for_public_reading(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. reveal_prediction_by_token(uuid, uuid)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reveal_prediction_by_token(p_token uuid, p_story_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_delivery_id UUID;
  v_letter_id   UUID;
  v_sender_id   UUID;
  v_receiver_id UUID;
  v_prediction  INTEGER;
BEGIN
  -- Validate token (expiry predicate removed — see P683 migration header)
  SELECT ld.id, ld.letter_id, cl.sender_id, ld.receiver_profile_id
  INTO v_delivery_id, v_letter_id, v_sender_id, v_receiver_id
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- P684: reject anonymous callers on one-to-many letters only
  IF (SELECT mode FROM clarity_letters WHERE id = v_letter_id) = 'one-to-many'
     AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required for one-to-many responses';
  END IF;

  -- P978 (restored P651): sealed-bid gate scoped to THIS delivery's listener and
  -- this letter's snapshot. A co-recipient's rating, or a rating of the same
  -- story under a different letter, must NOT unlock the reveal.
  IF v_receiver_id IS NOT NULL THEN
    -- Authenticated path: caller must have rated as this delivery's receiver.
    IF NOT EXISTS (
      SELECT 1 FROM story_verifications sv
      JOIN letter_story_snapshots lss ON lss.story_id = sv.story_id AND lss.letter_id = v_letter_id
      WHERE sv.story_id = p_story_id
        AND sv.listener_id = v_receiver_id
        AND sv.speaker_id = v_sender_id
        AND sv.source = 'letter'
    ) THEN
      RETURN NULL;
    END IF;
  ELSE
    -- Anon path: caller must have rated as the token user (auth.uid() or sentinel).
    -- P1067: and must have rated under THIS delivery. Identity alone let one
    -- caller holding two of a letter's invitations reveal under the second on
    -- the strength of a rating made under the first.
    IF NOT EXISTS (
      SELECT 1 FROM story_verifications sv
      JOIN letter_story_snapshots lss ON lss.story_id = sv.story_id AND lss.letter_id = v_letter_id
      WHERE sv.story_id = p_story_id
        AND sv.speaker_id = v_sender_id
        AND sv.source = 'letter'
        AND sv.delivery_id = v_delivery_id
        AND sv.listener_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  -- P1379: a one-to-many letter never discloses the author's prediction, even
  -- for letters sealed before P1379 that still store one. Placed after every
  -- existing gate so their refusals (and the P684 exception) are unchanged.
  IF (SELECT mode FROM clarity_letters WHERE id = v_letter_id) = 'one-to-many' THEN
    RETURN NULL;
  END IF;

  -- Return prediction scoped to this delivery
  SELECT lp.prediction INTO v_prediction
  FROM letter_predictions lp
  WHERE lp.letter_id = v_letter_id
    AND lp.story_id = p_story_id
    AND (lp.delivery_id = v_delivery_id OR lp.delivery_id IS NULL)
  ORDER BY CASE WHEN lp.delivery_id = v_delivery_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_prediction IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object('prediction', v_prediction);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reveal_prediction_by_token(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.reveal_prediction_by_token(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. reveal_prediction(uuid, uuid)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reveal_prediction(p_delivery_id uuid, p_story_id uuid)
 RETURNS smallint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receiver_id UUID;
  v_letter_id UUID;
  v_prediction SMALLINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized: authentication required' USING ERRCODE = '42501';
  END IF;

  -- Get delivery info
  SELECT receiver_profile_id, letter_id
  INTO v_receiver_id, v_letter_id
  FROM letter_deliveries
  WHERE id = p_delivery_id;

  IF v_receiver_id IS NULL OR v_receiver_id != auth.uid() THEN
    RETURN NULL;
  END IF;

  -- Check that receiver has rated this story (source='letter' verification exists)
  IF NOT EXISTS (
    SELECT 1 FROM story_verifications
    WHERE story_id = p_story_id
      AND source = 'letter'
      AND listener_id = auth.uid()
  ) THEN
    RETURN NULL;
  END IF;

  -- P1379: a one-to-many letter never discloses the author's prediction.
  IF (SELECT mode FROM clarity_letters WHERE id = v_letter_id) = 'one-to-many' THEN
    RETURN NULL;
  END IF;

  -- Return the prediction
  SELECT prediction INTO v_prediction
  FROM letter_predictions
  WHERE letter_id = v_letter_id
    AND story_id = p_story_id
    AND (delivery_id = p_delivery_id OR delivery_id IS NULL)
  ORDER BY delivery_id NULLS LAST  -- prefer delivery-specific prediction
  LIMIT 1;

  RETURN v_prediction;
END;
$function$;

REVOKE ALL ON FUNCTION public.reveal_prediction(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reveal_prediction(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reveal_prediction(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. get_letter_results(uuid, uuid)
-- ---------------------------------------------------------------------------

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
  v_letter_mode            TEXT;
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
  SELECT cl.sender_id, cl.status, cl.mode
  INTO v_sender_id, v_letter_status, v_letter_mode
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
  IF v_letter_mode = 'one-to-many' THEN
    -- P1379: a one-to-many letter shows no prediction and no gap, to the reader
    -- or to the author (founder ruling 2026-09-30). Stored rows are kept.
    v_predictions := '[]'::jsonb;
  ELSIF v_perspective = 'sender' THEN
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

-- ---------------------------------------------------------------------------
-- 5. RLS on letter_predictions — receiver branch excludes one-to-many letters
-- ---------------------------------------------------------------------------
-- Closes the direct anon-key SELECT path (and letter-sourced /live's baseline
-- read) for one-to-many letters. The sender branch is unchanged, so the author
-- keeps reading their own rows (get_letter_overview is SECURITY DEFINER anyway).

DROP POLICY IF EXISTS "Predictions readable with sealed-bid" ON letter_predictions;
CREATE POLICY "Predictions readable with sealed-bid"
  ON letter_predictions FOR SELECT USING (
    -- Sender can always see their own predictions
    _is_letter_sender(letter_id, auth.uid())
    OR (
      -- Receiver can see prediction only after they rated this story
      _is_letter_receiver(letter_id, auth.uid())
      -- P1379: and only on a one-to-one letter
      AND EXISTS (
        SELECT 1 FROM clarity_letters cl
        WHERE cl.id = letter_predictions.letter_id
          AND cl.mode = 'one-to-one'
      )
      AND EXISTS (
        SELECT 1 FROM story_verifications
        WHERE story_verifications.story_id = letter_predictions.story_id
          AND story_verifications.source = 'letter'
          AND story_verifications.listener_id = auth.uid()
      )
    )
  );

COMMIT;
