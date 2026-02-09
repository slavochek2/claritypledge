-- Migration: Convert story visibility from TEXT to ENUM
-- Created: 2026-02-09
-- Feature: P132 - Data Integrity (code review fix)
-- Description: Adds story_visibility enum type and converts visibility column
--              Stronger constraint than TEXT + CHECK (enforced at type level)

-- Create enum type
CREATE TYPE story_visibility AS ENUM ('public', 'shared', 'private');

-- Convert column to use enum (existing values are compatible)
ALTER TABLE stories
  ALTER COLUMN visibility TYPE story_visibility
  USING visibility::story_visibility;

-- Drop the old CHECK constraint (replaced by enum type constraint)
ALTER TABLE stories DROP CONSTRAINT IF EXISTS stories_visibility_check;
