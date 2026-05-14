-- diffed against: 20260425183500_p819_seal_rpc_restore_imageurl.sql
-- P833: seal_and_send_letter silently drops stories on current_version desync
--
-- Root cause: stories.current_version was historically drifted above
-- max(story_versions.version_number) by the archived seed script
-- scripts/archive/migrations/20260310-points-stories-refresh.sql.
-- No ongoing app-layer writer exists; the trigger atomically bumps + inserts.
--
-- Three layers, run in this order:
--   Layer 1 — Backfill: reset current_version down to max existing version_number.
--             Must run BEFORE Layer 3 (fail-loud RPC) goes live.
--   Layer 2 — Invariant trigger: DEFERRABLE AFTER trigger on stories prevents
--             future desync from ad-hoc SQL / script replays.
--   Layer 3 — Fail-loud RPC: pre-flight check raises if any story still has a
--             missing story_versions row; never seals an incomplete letter.
--
-- Idempotent: CREATE OR REPLACE functions, backfill WHERE predicate is safe
-- to re-run (no-op when no desynced rows remain).

BEGIN;

-- ============================================================================
-- Layer 1: Backfill
-- Reset stories.current_version to max(story_versions.version_number) for every
-- story where current_version > max(version_number).
--
-- Skips stories with no story_versions rows (those would require manual review;
-- in practice all stories created via the app have at least version 1).
-- ============================================================================

UPDATE stories s
SET current_version = sub.max_ver
FROM (
  SELECT sv.story_id, MAX(sv.version_number) AS max_ver
  FROM story_versions sv
  GROUP BY sv.story_id
) sub
WHERE sub.story_id = s.id
  AND s.current_version > sub.max_ver;

-- ============================================================================
-- Layer 2: Invariant trigger
-- A DEFERRABLE INITIALLY DEFERRED constraint trigger fires at transaction COMMIT,
-- after all row-level AFTER triggers (including create_initial_story_version).
-- This ensures the invariant sees the final committed state, not mid-transaction
-- state where the version row hasn't been inserted yet.
--
-- Enforces: stories.current_version <= max(story_versions.version_number)
-- Raises if any ad-hoc UPDATE or INSERT violates this invariant.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_story_version_invariant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_max_version INTEGER;
BEGIN
  -- Coverage note: this trigger fires on stories INSERT/UPDATE only.
  -- A direct DELETE from story_versions (e.g. in tests or ad-hoc SQL) is NOT
  -- caught here — the invariant is violated the moment the delete commits, but
  -- no trigger fires on the stories row. The constraint exists to block ad-hoc
  -- bumps to current_version (the historical drift class), not story_versions
  -- deletes. Deleting story_versions rows directly is a supported test setup
  -- pattern and is expected to produce a desync that the fail-loud RPC catches.
  SELECT COALESCE(MAX(version_number), 0)
  INTO v_max_version
  FROM story_versions
  WHERE story_id = NEW.id;

  IF NEW.current_version > v_max_version THEN
    RAISE EXCEPTION
      'stories invariant violated: current_version (%) > max story_versions.version_number (%) for story_id %',
      NEW.current_version, v_max_version, NEW.id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_story_version_invariant ON stories;

CREATE CONSTRAINT TRIGGER trg_check_story_version_invariant
  AFTER INSERT OR UPDATE ON stories
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.check_story_version_invariant();

-- ============================================================================
-- Layer 3: Fail-loud seal_and_send_letter
-- Replaces the silent INNER JOIN with a pre-flight check:
--   - Count stories in the source doc whose story_versions row is missing
--   - If any exist, RAISE EXCEPTION with the offending story_ids
-- The INSERT itself retains INNER JOIN (safe after pre-flight clears it).
--
-- Full function body rebased on 20260425183500_p819_seal_rpc_restore_imageurl.sql.
-- ============================================================================

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
  v_desynced_stories    TEXT;
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

  -- P833: pre-flight desync check.
  -- Collect story_ids whose current_version has no matching story_versions row.
  -- Raises before any state mutation — letter stays draft on desync.
  SELECT string_agg(s.id::text, ', ' ORDER BY s.id)
  INTO v_desynced_stories
  FROM doc_stories ds
  JOIN stories s ON s.id = ds.story_id
  LEFT JOIN story_versions sv
    ON sv.story_id = s.id AND sv.version_number = s.current_version
  WHERE ds.doc_id = v_source_doc_id
    AND (v_mode = 'one-to-one' OR s.visibility = 'public'::content_visibility)
    AND sv.id IS NULL;

  IF v_desynced_stories IS NOT NULL THEN
    RAISE EXCEPTION
      'seal_and_send_letter: story_versions desync for story_id(s): % — run backfill before sealing',
      v_desynced_stories;
  END IF;

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

-- ============================================================================
-- Layer 4: Back-snapshot missing story rows for already-sealed letters
-- For each sealed letter where a story from the source doc has no snapshot row
-- (because the historical silent-drop bug omitted it), insert the missing row
-- now that current_version has been corrected by Layer 1.
-- Idempotent: ON CONFLICT DO NOTHING.
--
-- Note: stories that still have zero story_versions rows after Layer 1
-- (i.e. current_version was already at max=0 or story_versions is empty) are
-- silently skipped by the INNER JOIN on story_versions. This is intentional —
-- there is no version row to snapshot. Such stories require manual review and
-- are extremely rare (all app-created stories have at least version 1 from
-- the create_initial_story_version trigger).
-- ============================================================================

DO $$
DECLARE
  v_orphan_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_orphan_count
  FROM stories s
  LEFT JOIN story_versions sv ON sv.story_id = s.id
  WHERE sv.story_id IS NULL;

  IF v_orphan_count > 0 THEN
    RAISE NOTICE 'Layer 4: % story/stories have zero story_versions rows and will be skipped by back-snapshot. Manual review required.', v_orphan_count;
  END IF;
END;
$$;

INSERT INTO letter_story_snapshots (letter_id, story_id, version_id, position, point_config, visibility)
SELECT
  l.id,
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
            WHERE pp.point_id = pt.id AND pp.user_id = l.sender_id
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
FROM clarity_letters l
JOIN doc_stories ds ON ds.doc_id = l.source_doc_id
JOIN stories s ON s.id = ds.story_id
JOIN story_versions sv ON sv.story_id = s.id AND sv.version_number = s.current_version
LEFT JOIN letter_story_snapshots lss ON lss.letter_id = l.id AND lss.story_id = ds.story_id
WHERE l.status = 'sealed'
  AND (l.mode = 'one-to-one' OR s.visibility = 'public'::content_visibility)
  AND lss.story_id IS NULL
ON CONFLICT (letter_id, story_id) DO NOTHING;

COMMIT;
