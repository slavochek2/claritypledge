-- Migration: Make story title nullable
-- Feature: P126 - Stories no longer have titles (content-only)
-- Description: Stories are now just text content without a separate title field.
--   The title column is kept for backward compatibility with existing data
--   but is no longer required on insert.

-- Make title nullable on stories
ALTER TABLE stories ALTER COLUMN title DROP NOT NULL;
ALTER TABLE stories ALTER COLUMN title SET DEFAULT '';

-- Make title nullable on story_versions (trigger copies from stories)
ALTER TABLE story_versions ALTER COLUMN title DROP NOT NULL;
ALTER TABLE story_versions ALTER COLUMN title SET DEFAULT '';
