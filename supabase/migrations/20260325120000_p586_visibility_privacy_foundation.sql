-- Migration: P586 — Visibility & Privacy Foundation
-- Created: 2026-03-25
-- Feature: P586 - Visibility & Privacy Foundation
-- Description: Replaces story_visibility enum with content_visibility ('public','private'),
--   adds visibility to points, creates immutability triggers, tightens all SELECT RLS
--   policies from USING(true) to visibility-scoped access, adds cross-visibility
--   constraint on story_points.

-- NOTE: Supabase Management API wraps each query in its own transaction.
-- BEGIN/COMMIT omitted to avoid double-wrapping.

-- ============================================================================
-- STEP 1: Migrate 'shared' → 'public' in stories
-- ============================================================================
UPDATE stories SET visibility = 'public' WHERE visibility = 'shared';

-- ============================================================================
-- STEP 2: Drop ALL policies/defaults referencing story_visibility type
-- We must drop the column default and all policies that reference visibility
-- enum values before we can ALTER the column type.
-- ============================================================================

-- Drop column default (references old type)
ALTER TABLE stories ALTER COLUMN visibility DROP DEFAULT;

-- Drop CHECK constraint on visibility (references text values, blocks ALTER TYPE)
ALTER TABLE stories DROP CONSTRAINT IF EXISTS stories_visibility_check;

-- stories SELECT (references 'public', 'shared' enum values)
DROP POLICY IF EXISTS "Stories readable by visibility" ON stories;

-- stories INSERT
DROP POLICY IF EXISTS "Verified users can create stories" ON stories;

-- stories UPDATE
DROP POLICY IF EXISTS "Authors can update own stories" ON stories;

-- stories DELETE
DROP POLICY IF EXISTS "Authors can delete own stories" ON stories;

-- story_points SELECT
DROP POLICY IF EXISTS "Story points are publicly readable" ON story_points;

-- story_points INSERT
DROP POLICY IF EXISTS "Story authors can link points" ON story_points;

-- story_points DELETE
DROP POLICY IF EXISTS "Story authors can unlink points" ON story_points;

-- story_point_history SELECT
DROP POLICY IF EXISTS "Story point history is publicly readable" ON story_point_history;

-- story_point_history INSERT (will be tightened to WITH CHECK(false))
DROP POLICY IF EXISTS "Allow trigger to insert story point history" ON story_point_history;

-- point_positions SELECT
DROP POLICY IF EXISTS "Positions are publicly readable" ON point_positions;

-- point_positions INSERT
DROP POLICY IF EXISTS "Verified users can set own position" ON point_positions;

-- point_positions UPDATE
DROP POLICY IF EXISTS "Users can update own position" ON point_positions;

-- point_positions DELETE
DROP POLICY IF EXISTS "Users can remove own position" ON point_positions;

-- point_position_history SELECT
DROP POLICY IF EXISTS "Position history is publicly readable" ON point_position_history;

-- point_position_history INSERT
DROP POLICY IF EXISTS "Allow trigger to insert position history" ON point_position_history;

-- points SELECT
DROP POLICY IF EXISTS "Points are publicly readable" ON points;

-- points INSERT
DROP POLICY IF EXISTS "Verified users can create points" ON points;

-- story_versions SELECT (P427 policy)
DROP POLICY IF EXISTS "story_versions_select_visible" ON story_versions;

-- story_versions INSERT (two policies exist on prod DB)
DROP POLICY IF EXISTS "story_versions_insert" ON story_versions;
DROP POLICY IF EXISTS "Allow story version inserts for authenticated users" ON story_versions;

-- story_verifications SELECT
DROP POLICY IF EXISTS "Verifications are publicly readable" ON story_verifications;

-- story_verifications INSERT
DROP POLICY IF EXISTS "story_verifications_insert" ON story_verifications;

-- ============================================================================
-- STEP 3: Create new enum type
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE content_visibility AS ENUM ('public', 'private');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- STEP 4: Alter stories.visibility to content_visibility type
-- ============================================================================
ALTER TABLE stories
  ALTER COLUMN visibility TYPE content_visibility
  USING visibility::text::content_visibility;

-- ============================================================================
-- STEP 5: Drop old story_visibility type
-- ============================================================================
DROP TYPE IF EXISTS story_visibility;

-- ============================================================================
-- STEP 6: Add visibility column to points table
-- ============================================================================
ALTER TABLE points ADD COLUMN IF NOT EXISTS visibility content_visibility NOT NULL DEFAULT 'public'::content_visibility;

-- ============================================================================
-- STEP 7: Create visibility immutability triggers
-- ============================================================================

-- Stories: BEFORE UPDATE — raise exception if visibility changed
CREATE OR REPLACE FUNCTION enforce_story_visibility_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.visibility IS DISTINCT FROM OLD.visibility THEN
    RAISE EXCEPTION 'Story visibility cannot be changed after creation. Current: %, Attempted: %',
      OLD.visibility, NEW.visibility;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_story_visibility_immutable ON stories;
CREATE TRIGGER trg_story_visibility_immutable
  BEFORE UPDATE ON stories
  FOR EACH ROW EXECUTE FUNCTION enforce_story_visibility_immutable();

-- Points: BEFORE UPDATE — raise exception if visibility changed
CREATE OR REPLACE FUNCTION enforce_point_visibility_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.visibility IS DISTINCT FROM OLD.visibility THEN
    RAISE EXCEPTION 'Point visibility cannot be changed after creation. Current: %, Attempted: %',
      OLD.visibility, NEW.visibility;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_point_visibility_immutable ON points;
CREATE TRIGGER trg_point_visibility_immutable
  BEFORE UPDATE ON points
  FOR EACH ROW EXECUTE FUNCTION enforce_point_visibility_immutable();

-- ============================================================================
-- STEP 8: Cross-visibility constraint trigger on story_points
-- Reject BEFORE INSERT if story is public AND linked point is private
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_story_point_visibility_constraint()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_story_visibility content_visibility;
  v_point_visibility content_visibility;
BEGIN
  SELECT visibility INTO v_story_visibility FROM stories WHERE id = NEW.story_id;
  SELECT visibility INTO v_point_visibility FROM points WHERE id = NEW.point_id;

  IF v_story_visibility = 'public'::content_visibility AND v_point_visibility = 'private'::content_visibility THEN
    RAISE EXCEPTION 'Cannot link a private point to a public story. Story: %, Point: %',
      NEW.story_id, NEW.point_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_story_point_visibility_constraint ON story_points;
CREATE TRIGGER trg_story_point_visibility_constraint
  BEFORE INSERT ON story_points
  FOR EACH ROW EXECUTE FUNCTION enforce_story_point_visibility_constraint();

-- ============================================================================
-- STEP 9: Set stories.visibility default back to 'public' (new type)
-- ============================================================================
ALTER TABLE stories ALTER COLUMN visibility SET DEFAULT 'public'::content_visibility;

-- ============================================================================
-- STEP 10: Recreate stories SELECT — visibility-scoped (no more 'shared' branch)
-- ============================================================================
CREATE POLICY "Stories readable by visibility"
  ON stories FOR SELECT USING (
    visibility = 'public'::content_visibility
    OR author_id = auth.uid()
  );

-- ============================================================================
-- STEP 11: Recreate stories INSERT (same logic as before)
-- ============================================================================
CREATE POLICY "Verified users can create stories"
  ON stories FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_verified = true)
  );

-- ============================================================================
-- STEP 12: Recreate stories UPDATE with WITH CHECK for visibility immutability (belt)
-- The trigger (step 7) is the suspenders.
-- ============================================================================
CREATE POLICY "Authors can update own stories"
  ON stories FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- ============================================================================
-- STEP 13: Recreate stories DELETE (same logic as before)
-- ============================================================================
CREATE POLICY "Authors can delete own stories"
  ON stories FOR DELETE USING (auth.uid() = author_id);

-- ============================================================================
-- STEP 14: Replace story_points SELECT — story-visibility-scoped
-- ============================================================================
CREATE POLICY "Story points visible when story visible"
  ON story_points FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = story_points.story_id
        AND (stories.visibility = 'public'::content_visibility OR stories.author_id = auth.uid())
    )
  );

-- ============================================================================
-- STEP 15: Recreate story_points INSERT (same logic as before)
-- ============================================================================
CREATE POLICY "Story authors can link points"
  ON story_points FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM stories WHERE id = story_id AND author_id = auth.uid())
  );

-- ============================================================================
-- STEP 16: Recreate story_points DELETE (same logic as before)
-- ============================================================================
CREATE POLICY "Story authors can unlink points"
  ON story_points FOR DELETE USING (
    EXISTS (SELECT 1 FROM stories WHERE id = story_id AND author_id = auth.uid())
  );

-- ============================================================================
-- STEP 17: Replace story_point_history SELECT — story-visibility-scoped
-- ============================================================================
CREATE POLICY "Story point history visible when story visible"
  ON story_point_history FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = story_point_history.story_id
        AND (stories.visibility = 'public'::content_visibility OR stories.author_id = auth.uid())
    )
  );

-- ============================================================================
-- STEP 18: Tighten story_point_history INSERT to WITH CHECK(false)
-- Block direct API inserts. Triggers use SECURITY DEFINER and bypass RLS.
-- ============================================================================
CREATE POLICY "Story point history insert blocked"
  ON story_point_history FOR INSERT WITH CHECK (false);

-- ============================================================================
-- STEP 19: Replace points SELECT — visibility-scoped
-- ============================================================================
CREATE POLICY "Points visible by visibility"
  ON points FOR SELECT USING (
    visibility = 'public'::content_visibility
    OR first_validator_id = auth.uid()
  );

-- ============================================================================
-- STEP 20: Recreate points INSERT (same logic as before)
-- ============================================================================
CREATE POLICY "Verified users can create points"
  ON points FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_verified = true)
  );

-- ============================================================================
-- STEP 21: Replace point_positions SELECT — point-visibility-scoped
-- ============================================================================
CREATE POLICY "Positions visible by point visibility"
  ON point_positions FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM points
      WHERE points.id = point_positions.point_id
        AND (points.visibility = 'public'::content_visibility OR points.first_validator_id = auth.uid())
    )
    OR point_positions.user_id = auth.uid()
  );

-- ============================================================================
-- STEP 22: Recreate point_positions INSERT (same logic as before)
-- ============================================================================
CREATE POLICY "Verified users can set own position"
  ON point_positions FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_verified = true)
  );

-- ============================================================================
-- STEP 23: Recreate point_positions UPDATE (same logic as before)
-- ============================================================================
CREATE POLICY "Users can update own position"
  ON point_positions FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================================
-- STEP 24: Recreate point_positions DELETE (same logic as before)
-- ============================================================================
CREATE POLICY "Users can remove own position"
  ON point_positions FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- STEP 25: Replace point_position_history SELECT — point-visibility-scoped
-- ============================================================================
CREATE POLICY "Position history visible by point visibility"
  ON point_position_history FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM points
      WHERE points.id = point_position_history.point_id
        AND (points.visibility = 'public'::content_visibility OR points.first_validator_id = auth.uid())
    )
    OR point_position_history.user_id = auth.uid()
  );

-- ============================================================================
-- STEP 26: Recreate point_position_history INSERT (same logic as before)
-- ============================================================================
CREATE POLICY "Allow trigger to insert position history"
  ON point_position_history FOR INSERT WITH CHECK (true);

-- ============================================================================
-- STEP 27: Replace story_versions SELECT — content_visibility-scoped (no 'shared')
-- ============================================================================
CREATE POLICY "story_versions_select_visible"
  ON story_versions FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = story_versions.story_id
        AND (
          stories.visibility = 'public'::content_visibility
          OR stories.author_id = auth.uid()
        )
    )
  );

-- ============================================================================
-- STEP 28: Recreate story_versions INSERT (same logic as before)
-- ============================================================================
CREATE POLICY "story_versions_insert"
  ON story_versions FOR INSERT WITH CHECK (
    current_user = 'postgres'
    OR EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = story_id
        AND stories.author_id = auth.uid()
    )
  );

-- ============================================================================
-- STEP 29: Replace story_verifications SELECT — story-visibility-scoped
-- ============================================================================
CREATE POLICY "Verifications visible when story visible"
  ON story_verifications FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = story_verifications.story_id
        AND (stories.visibility = 'public'::content_visibility OR stories.author_id = auth.uid())
    )
  );

-- ============================================================================
-- STEP 30: Recreate story_verifications INSERT (same logic as before)
-- ============================================================================
CREATE POLICY "story_verifications_insert"
  ON story_verifications FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (auth.uid() = speaker_id OR auth.uid() = listener_id)
  );

-- End of migration
