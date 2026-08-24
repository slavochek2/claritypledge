-- P701: Drop stories.title and story_versions.title columns.
--
-- Column is always empty (all 9 system stories have no title).
-- Code fallbacks already handle the missing title everywhere.
--
-- IMPORTANT: Run AFTER deploying the code changes that remove .title references.
--   Deploying code first ensures the app never reads a column that doesn't exist.
--   Running this before deploy would cause TS errors in flight.

ALTER TABLE stories DROP COLUMN IF EXISTS title;
ALTER TABLE story_versions DROP COLUMN IF EXISTS title;
