-- Migration: Fix story_versions INSERT policy
-- Created: 2026-03-02
-- Feature: P465 (uncovered during test run)
--
-- Problem: story_versions has RLS enabled but no INSERT policy. The SECURITY
-- DEFINER trigger (create_initial_story_version) runs as the `postgres` role,
-- which in Supabase does not have BYPASSRLS. So trigger INSERTs are blocked
-- with error 42501, causing createTestStory to fail in E2E tests.
--
-- Fix: Add an INSERT policy that allows:
--   1. The trigger (postgres/internal context: auth.uid() IS NULL)
--   2. A user inserting a version for their own story (direct API access)
--
-- SELECT is still governed by the separate "story_versions_select_visible"
-- policy from P427 — this policy only covers INSERT.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'story_versions' AND policyname = 'story_versions_insert'
  ) THEN
    CREATE POLICY "story_versions_insert" ON story_versions
      FOR INSERT WITH CHECK (
        -- Allow the SECURITY DEFINER trigger (runs as postgres, no auth context)
        auth.uid() IS NULL
        -- Allow direct inserts by the story author
        OR EXISTS (
          SELECT 1 FROM stories
          WHERE stories.id = story_id
            AND stories.author_id = auth.uid()
        )
      );
  END IF;
END $$;
