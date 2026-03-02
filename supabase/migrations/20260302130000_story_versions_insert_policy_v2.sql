-- Migration: Tighten story_versions INSERT policy (replaces v1 from same day)
-- Created: 2026-03-02
-- Feature: P465 — fix for M1 review finding
--
-- Problem with v1: `auth.uid() IS NULL` matches BOTH the SECURITY DEFINER
-- trigger (postgres role, no auth context) AND anonymous API callers (anon key,
-- no JWT sub claim). This allowed any unauthenticated caller to inject garbage
-- version rows into any story's version history.
--
-- Fix: scope the trigger-context branch to `current_user = 'postgres'`.
-- In Supabase, the SECURITY DEFINER trigger runs as the `postgres` role;
-- anon API callers run as the `anon` role. Only postgres can satisfy this
-- branch, closing the unauthenticated-insert loophole.

DO $$
BEGIN
  -- Drop the v1 policy (auth.uid() IS NULL was too broad)
  DROP POLICY IF EXISTS "story_versions_insert" ON story_versions;

  -- Recreate with narrower trigger-context check
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'story_versions' AND policyname = 'story_versions_insert'
  ) THEN
    CREATE POLICY "story_versions_insert" ON story_versions
      FOR INSERT WITH CHECK (
        -- Allow the SECURITY DEFINER trigger (runs as postgres role)
        current_user = 'postgres'
        -- Allow direct inserts by the story author
        OR EXISTS (
          SELECT 1 FROM stories
          WHERE stories.id = story_id
            AND stories.author_id = auth.uid()
        )
      );
  END IF;
END $$;
