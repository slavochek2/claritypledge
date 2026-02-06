-- Migration: Add visibility column to stories table
-- Created: 2026-02-06
-- Feature: P126 - Create Story + View Story
-- Description: Adds visibility control (public/shared/private) to stories

-- Add visibility column with default 'public'
ALTER TABLE stories ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'shared', 'private'));

-- Update RLS SELECT policy to respect visibility
-- Public stories: anyone can see
-- Shared/private stories: only author can see (shared enforcement for /live deferred)
DROP POLICY IF EXISTS "Stories are publicly readable" ON stories;
CREATE POLICY "Stories readable by visibility"
  ON stories FOR SELECT USING (
    visibility = 'public'
    OR author_id = auth.uid()
  );
