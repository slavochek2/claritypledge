-- P701 cleanup: scrub title references from PL/pgSQL function bodies.
--
-- Fix: P701 (20260413110000_p701_drop_story_title.sql) dropped stories.title
-- and story_versions.title columns but left THREE PL/pgSQL bodies referencing
-- them. PL/pgSQL deferred symbol resolution meant CREATE OR REPLACE succeeded
-- at migration time; the functions raise "column does not exist" at first call.
--
-- Three affected bodies:
-- 1. seal_and_send_letter — last redefined by 20260412135402_fix_block_self_send.sql
--    (before column drop); body's letter_story_snapshots INSERT references sv.title.
-- 2. create_initial_story_version — AFTER INSERT trigger on stories, inserts
--    NEW.title into story_versions.
-- 3. create_story_version_on_update — BEFORE UPDATE trigger on stories, compares
--    OLD.title / NEW.title and inserts into story_versions.
--
-- Impact on prod: dormant until triggered. Zero letters sealed on prod means
-- seal_and_send_letter hasn't hit the broken path. But create_initial_story_version
-- fires on any stories INSERT — story creation was broken on prod until this migration.
--
-- Supersedes: 20260410090000_fix_seal_denormalize_regression.sql
--   That migration's function-redefine is re-done here with sv.title removed.
--   Its backfill UPDATE is skipped — SELECT COUNT(*) FROM clarity_letters
--   WHERE sealed_at IS NOT NULL = 0 on prod (nothing to backfill).
--   The superseded file is annotated with RAISE EXCEPTION to prevent re-run.

BEGIN;

-- ============================================================================
-- 1. seal_and_send_letter — remove storyTitle from point_config jsonb
-- Base: 20260412135402_fix_block_self_send.sql + 20260410091421 visibility field
-- Diff from current prod: only removes `'storyTitle', COALESCE(sv.title, ''),` line
-- ============================================================================

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

-- ============================================================================
-- 2. create_initial_story_version — drop title column from INSERT
-- Trigger: AFTER INSERT ON stories (trg_story_initial_version)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_initial_story_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO story_versions (story_id, version_number, content)
  VALUES (NEW.id, 1, NEW.content);
  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 3. create_story_version_on_update — drop title comparison + INSERT column
-- Trigger: BEFORE UPDATE ON stories (trg_story_version_on_update)
-- Only content changes trigger a new version now (title no longer exists).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_story_version_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.content IS DISTINCT FROM NEW.content THEN
    NEW.current_version = OLD.current_version + 1;
    INSERT INTO story_versions (story_id, version_number, content)
    VALUES (NEW.id, NEW.current_version, NEW.content);
  END IF;
  RETURN NEW;
END;
$function$;

COMMIT;
