-- P272: Change accuracy_achieved threshold from >= 8 to = 10
-- No data migration needed — story_verifications table is empty.
-- Triggers update_story_understood_count and update_profile_ears_count
-- reference accuracy_achieved = true and require no changes.

-- Step 1: Drop dependent partial index
DROP INDEX IF EXISTS idx_verifications_achieved;

-- Step 2: Drop generated column (PostgreSQL cannot ALTER a generated column)
ALTER TABLE story_verifications
  DROP COLUMN accuracy_achieved;

-- Step 3: Add column with updated threshold
ALTER TABLE story_verifications
  ADD COLUMN accuracy_achieved BOOLEAN
  GENERATED ALWAYS AS (speaker_rating = 10) STORED;

-- Step 4: Recreate partial index
CREATE INDEX idx_verifications_achieved
  ON story_verifications(story_id)
  WHERE accuracy_achieved = true;

-- Step 5: Tighten INSERT policy: caller must be speaker or listener
-- Drop old permissive policy by its actual name in the DB
DROP POLICY IF EXISTS "Authenticated users can create verifications" ON story_verifications;
DROP POLICY IF EXISTS "Anyone can insert verifications" ON story_verifications;
CREATE POLICY "story_verifications_insert" ON story_verifications
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    (auth.uid() = speaker_id OR auth.uid() = listener_id)
  );
