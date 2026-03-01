-- Migration: Add author_id to story_points for 1-story-per-user-per-point enforcement
-- P465: Point card footer redesign
-- Date: 2026-03-01

BEGIN;

-- Step 1: Add author_id column (nullable initially, for backfill)
ALTER TABLE story_points
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

-- Step 2: Backfill from stories table
UPDATE story_points sp
SET author_id = s.author_id
FROM stories s
WHERE sp.story_id = s.id
  AND sp.author_id IS NULL;

-- Step 3: Pre-flight check — surface any violations before adding constraint
DO $$
DECLARE
  violation_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO violation_count
  FROM (
    SELECT author_id, point_id
    FROM story_points
    WHERE author_id IS NOT NULL
    GROUP BY author_id, point_id
    HAVING COUNT(*) > 1
  ) dups;

  IF violation_count > 0 THEN
    -- Delete duplicate story_points rows, keeping the oldest (smallest ctid as tiebreaker)
    DELETE FROM story_points sp
    WHERE sp.ctid NOT IN (
      SELECT MIN(sp2.ctid)
      FROM story_points sp2
      WHERE sp2.author_id IS NOT NULL
      GROUP BY sp2.author_id, sp2.point_id
    );

    RAISE NOTICE 'Resolved % duplicate (author_id, point_id) pairs in story_points', violation_count;
  ELSE
    RAISE NOTICE 'No duplicate (author_id, point_id) pairs found — clean backfill';
  END IF;
END $$;

-- Step 4: Make non-nullable
ALTER TABLE story_points ALTER COLUMN author_id SET NOT NULL;

-- Step 5: Add unique constraint
ALTER TABLE story_points
  ADD CONSTRAINT story_points_author_point_unique UNIQUE (author_id, point_id);

-- Step 6: Add index on author_id for viewer-story lookups
CREATE INDEX IF NOT EXISTS idx_story_points_author ON story_points(author_id);

COMMIT;
