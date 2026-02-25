-- Migration: P427 — Fix story_versions SELECT policy (RLS privacy leak)
-- Created: 2026-02-25
-- Feature: P427 - Story Edit/Delete
-- Description: Replaces USING (true) on story_versions with a policy scoped to
--              users who can read the parent story. Previously, editing any story
--              (including private/shared) created publicly-readable version rows.
--
-- Access rule: a user may SELECT a story_version iff they can see the parent story.
-- This mirrors the three-branch stories SELECT policy (public / shared / author).
-- The live-page verifier path (clarity-live-page.tsx) also benefits: it can still
-- look up the current version for any story visible to the session participant.

DO $$
BEGIN
  -- Drop the permissive public-read policy
  DROP POLICY IF EXISTS "Story versions are publicly readable" ON story_versions;
  -- Defensive drop in case the policy was renamed in any environment
  DROP POLICY IF EXISTS "story_versions_select_public" ON story_versions;
  DROP POLICY IF EXISTS "Allow read access to story versions" ON story_versions;

  -- Create a new policy: SELECT allowed when the parent story is visible to the user.
  -- Visibility branches:
  --   1. Public story  → anyone may read versions
  --   2. Author        → always allowed
  --   3. Shared story  → users who co-registered for an event with the author
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'story_versions' AND policyname = 'story_versions_select_visible'
  ) THEN
    CREATE POLICY "story_versions_select_visible" ON story_versions
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM stories
          WHERE stories.id = story_versions.story_id
            AND (
              -- Public: anyone can read
              stories.visibility = 'public'

              -- Author can always read their own story versions
              OR stories.author_id = auth.uid()

              -- Shared: readable by users who co-registered for any event with the author
              OR (
                stories.visibility = 'shared'
                AND auth.uid() IS NOT NULL
                AND EXISTS (
                  SELECT 1 FROM event_rsvps reader_rsvp
                  WHERE reader_rsvp.profile_id = auth.uid()
                    AND EXISTS (
                      SELECT 1 FROM event_rsvps author_rsvp
                      WHERE author_rsvp.event_id = reader_rsvp.event_id
                        AND author_rsvp.profile_id = stories.author_id
                      UNION ALL
                      SELECT 1 FROM events hosted
                      WHERE hosted.id = reader_rsvp.event_id
                        AND hosted.host_id = stories.author_id
                    )
                )
              )
            )
        )
      );
  END IF;
END $$;
