-- P819: Restore 'imageUrl' to seal_and_send_letter snapshot output.
-- diffed against: 20260418220000_fix_p757_svtitle_regression.sql
--
-- Root cause (confirmed via /reproduce 2026-04-25):
--   P749 (20260418144500), P757 (20260418210000), and fix_p757 (20260418220000)
--   each ran CREATE OR REPLACE on seal_and_send_letter without preserving the
--   'imageUrl' key that P751 (20260418120000) added. The most recent definition
--   (fix_p757) is therefore the active RPC on test + prod, and it omits imageUrl.
--   New letters sealed after P777's backfill (2026-04-21) therefore silently
--   regenerate the missing-key bug.
--
-- Fix:
--   1. Re-add 'imageUrl', COALESCE(s.image_url, '') to the jsonb_build_object,
--      rebased on fix_p757's full body (which includes P749's per-point hidden flag
--      and P757's receiver_profile_id lookup).
--   2. Backfill any letter_story_snapshots rows created after P777 ran that are
--      still missing the key (idempotent — same predicate as P777).
--
-- Idempotent: CREATE OR REPLACE. Backfill re-run is a no-op.

BEGIN;

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
  v_sender_id           UUID;
  v_sender_email        TEXT;
  v_mode                TEXT;
  v_letter_status       TEXT;
  v_source_doc_id       UUID;
  v_pred                JSONB;
  v_del                 JSONB;
  v_delivery_id         UUID;
  v_receiver_email      TEXT;
  v_receiver_profile_id UUID;
BEGIN
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

  SELECT email INTO v_sender_email
  FROM auth.users
  WHERE id = v_sender_id;

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
            'visibility', pt.visibility::text,
            'hidden', COALESCE((ds.point_config->'hidden')::jsonb ? pt.id::text, false)
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

  FOR v_del IN SELECT * FROM jsonb_array_elements(p_deliveries)
  LOOP
    v_receiver_email := v_del->>'receiver_email';

    IF v_receiver_email = v_sender_email THEN
      RAISE EXCEPTION 'Cannot send a letter to yourself (receiver_email matches sender)';
    END IF;

    v_receiver_profile_id := NULL;
    IF v_receiver_email IS NOT NULL THEN
      SELECT id INTO v_receiver_profile_id
      FROM profiles
      WHERE lower(email) = lower(v_receiver_email)
      LIMIT 1;
    END IF;

    INSERT INTO letter_deliveries (
      letter_id, receiver_email, receiver_name,
      receiver_profile_id, invitation_expires_at
    )
    VALUES (
      p_letter_id,
      v_receiver_email,
      v_del->>'receiver_name',
      v_receiver_profile_id,
      now() + interval '7 days'
    )
    ON CONFLICT (letter_id, receiver_email) WHERE receiver_email IS NOT NULL DO NOTHING;
  END LOOP;

  UPDATE clarity_letters
  SET status = 'sealed', sealed_at = now()
  WHERE id = p_letter_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION seal_and_send_letter(UUID, JSONB, JSONB) TO authenticated;

-- Backfill: patch snapshots sealed after P777 ran (2026-04-21) that are still
-- missing imageUrl because fix_p757 was the active RPC at seal time.
-- Idempotent — same predicate as P777; skips rows already carrying the key.
UPDATE letter_story_snapshots lss
SET point_config = jsonb_set(
  lss.point_config,
  '{imageUrl}',
  to_jsonb(s.image_url)
)
FROM stories s
WHERE s.id = lss.story_id
  AND s.image_url IS NOT NULL
  AND s.image_url <> ''
  AND NOT (lss.point_config ? 'imageUrl');

COMMIT;
