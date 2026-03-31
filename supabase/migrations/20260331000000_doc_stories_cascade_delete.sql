-- P610: Fix doc_stories FK to cascade on story delete.
-- Without this, deleting a story that's inside a doc fails with FK violation.
-- All other story child tables (story_points, story_versions, story_verifications,
-- story_point_history) already use ON DELETE CASCADE. This was an oversight.

ALTER TABLE doc_stories DROP CONSTRAINT IF EXISTS doc_stories_story_id_fkey;
ALTER TABLE doc_stories ADD CONSTRAINT doc_stories_story_id_fkey
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE;
