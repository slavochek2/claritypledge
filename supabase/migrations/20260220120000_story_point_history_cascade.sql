-- Migration: story_point_history table + cascade trigger + link-creation trigger
-- Created: 2026-02-20
-- Depends on: 20260204_stories_points_calibration.sql
--   (stories, points, profiles, story_points, point_positions tables)

-- ============================================================================
-- TABLE: story_point_history
-- Audit log of all story-point link changes (links created and removed).
-- ============================================================================

CREATE TABLE story_point_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id    UUID        NOT NULL REFERENCES stories(id)   ON DELETE CASCADE,
  point_id    UUID        NOT NULL REFERENCES points(id)    ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  -- user_id = story author (the person who owns the story-point link)
  linked_at   TIMESTAMPTZ NOT NULL,
  -- linked_at is populated from story_points.created_at on unlink,
  -- or from now() on the INSERT trigger path.
  unlinked_at TIMESTAMPTZ DEFAULT NULL,
  -- NULL = link is still active (INSERT trigger path).
  -- set to now() when the link is removed.
  unlink_reason TEXT DEFAULT NULL
  -- 'position_removed' | 'manual' | NULL (when still linked)
);

-- Index for looking up all history for a given story
CREATE INDEX idx_story_point_history_story
  ON story_point_history(story_id);

-- Index for looking up all history for a given point
CREATE INDEX idx_story_point_history_point
  ON story_point_history(point_id);

-- Index for looking up all history for a given user (story author)
CREATE INDEX idx_story_point_history_user
  ON story_point_history(user_id);

-- Index for time-range queries on unlinked_at (e.g. "recently removed links")
CREATE INDEX idx_story_point_history_unlinked
  ON story_point_history(unlinked_at DESC)
  WHERE unlinked_at IS NOT NULL;

-- ============================================================================
-- ROW LEVEL SECURITY: story_point_history
-- Public read. Inserts are system-only (via triggers, SECURITY DEFINER).
-- Pattern matches point_position_history in 20260216_fix_position_history_rls.sql.
-- ============================================================================

ALTER TABLE story_point_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Story point history is publicly readable"
  ON story_point_history
  FOR SELECT
  USING (true);

-- WITH CHECK (true) is safe here for the same reason as point_position_history:
-- the table is not exposed via the Supabase auto-API for inserts (only triggers write to it).
-- SECURITY DEFINER functions bypass RLS, but having this policy prevents surprises
-- if a future function runs as the calling user.
CREATE POLICY "Allow trigger to insert story point history"
  ON story_point_history
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- TRIGGER 1: Record link creation when a row is inserted into story_points
--
-- Fires AFTER INSERT on story_points.
-- Writes a history row with unlinked_at = NULL (link is active).
-- linked_at = NEW.created_at (the moment the link was made).
-- user_id   = story author (fetched via JOIN to stories).
-- ============================================================================

CREATE OR REPLACE FUNCTION record_story_point_link()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO story_point_history (
    story_id,
    point_id,
    user_id,
    linked_at,
    unlinked_at,
    unlink_reason
  )
  SELECT
    NEW.story_id,
    NEW.point_id,
    s.author_id,   -- user_id = story author
    NEW.created_at, -- linked_at = when the link was created
    NULL,           -- still active
    NULL
  FROM stories s
  WHERE s.id = NEW.story_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_story_point_link_history
AFTER INSERT ON story_points
FOR EACH ROW EXECUTE FUNCTION record_story_point_link();

-- ============================================================================
-- TRIGGER 2: Cascade on point_positions DELETE
--
-- Fires AFTER DELETE on point_positions.
-- OLD.user_id  = the person whose position was just removed
-- OLD.point_id = the point they held a position on
--
-- Find all story_points where:
--   story.author_id = OLD.user_id   (the deleted user's stories)
--   story_points.point_id = OLD.point_id  (linked to the removed point)
--
-- For each matching story_point:
--   1. Insert a history row (linked_at from story_points.created_at, unlink_reason = 'position_removed')
--   2. Delete the story_points row
--
-- Order matters: INSERT history BEFORE DELETE (so we can read story_points.created_at).
-- ============================================================================

CREATE OR REPLACE FUNCTION cascade_position_removal_to_story_points()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Step 1: Insert history entries for all affected story_points BEFORE deleting them.
  -- We need story_points.created_at, so history must be written first.
  INSERT INTO story_point_history (
    story_id,
    point_id,
    user_id,
    linked_at,
    unlinked_at,
    unlink_reason
  )
  SELECT
    sp.story_id,
    sp.point_id,
    OLD.user_id,        -- the story author whose position was removed
    sp.created_at,      -- when the story-point link was originally created
    now(),              -- unlinked now
    'position_removed'
  FROM story_points sp
  JOIN stories s ON s.id = sp.story_id
  WHERE s.author_id = OLD.user_id
    AND sp.point_id  = OLD.point_id;

  -- Step 2: Delete the matching story_points rows.
  DELETE FROM story_points sp
  USING stories s
  WHERE sp.story_id = s.id
    AND s.author_id = OLD.user_id
    AND sp.point_id = OLD.point_id;

  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_cascade_position_removal
AFTER DELETE ON point_positions
FOR EACH ROW EXECUTE FUNCTION cascade_position_removal_to_story_points();
