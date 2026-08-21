-- Migration: Convert story visibility from TEXT to ENUM
-- Created: 2026-02-09
-- Feature: P132 - Data Integrity (code review fix)
-- Description: Adds story_visibility enum type and converts visibility column
--              Stronger constraint than TEXT + CHECK (enforced at type level)
-- client-safe: version-recorded and already applied on both live databases;
-- the restructuring below only executes on a from-empty build and is never
-- re-run against a live DB (P1132 Appetite/Risks). The recreated policy
-- (line ~20) matches 20260206_add_story_visibility.sql's predicate verbatim.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'story_visibility') THEN
    CREATE TYPE story_visibility AS ENUM ('public', 'shared', 'private');
  END IF;
END $$;

-- Drop the old TEXT CHECK before the type change: Postgres re-validates it
-- mid-conversion and there is no story_visibility = text operator.
ALTER TABLE stories DROP CONSTRAINT IF EXISTS stories_visibility_check;

-- Drop the dependent policy: ALTER COLUMN TYPE is refused while a policy
-- references the column. Recreated below with 20260206's predicate.
DROP POLICY IF EXISTS "Stories readable by visibility" ON stories;

ALTER TABLE stories ALTER COLUMN visibility DROP DEFAULT;

ALTER TABLE stories
  ALTER COLUMN visibility TYPE story_visibility
  USING visibility::story_visibility;

ALTER TABLE stories ALTER COLUMN visibility SET DEFAULT 'public'::story_visibility;

CREATE POLICY "Stories readable by visibility"
  ON stories FOR SELECT USING (
    visibility = 'public'
    OR author_id = auth.uid()
  );
