-- P1034: bind story_points.author_id on INSERT to auth.uid()
--
-- The story_points INSERT policy ("Story authors can link points",
-- 20260325120000_p586_visibility_privacy_foundation.sql:243-246, itself a
-- faithful recreation of 20260204_stories_points_calibration.sql:364) checks
-- only that the caller owns the REFERENCED STORY. It places no constraint on
-- the value written to story_points.author_id — a separate, denormalized
-- column on story_points itself (NOT NULL + UNIQUE(author_id, point_id) since
-- P465, 20260301120000_story_points_author_unique.sql). A caller who owns any
-- story could therefore insert a link row attributing it to another profile.
--
-- Same bug class as P1032 (stories.author_id / points.first_validator_id), on
-- a third table that P1032's spec did not cover. See features/p1034_*.md.
--
-- Fix: AND the ownership predicate onto the existing story-ownership EXISTS —
-- both conditions must hold. Note this is an AND, not a replacement: dropping
-- the EXISTS would let a caller link points to a story they do not own.
--
-- client-safe: exactly one client insert path exists —
-- src/app/data/stories-service-real.ts:597 linkPointToStory(storyId, pointId,
-- authorId) — and all four call sites pass the authenticated user
-- (StoryGuideChat.tsx:681, story-detail-page.tsx:124, story-detail-page.tsx:177,
-- create-story-page.tsx:195). No deployed client sends a foreign author_id, so
-- the new predicate rejects only forged inserts. Verified additionally that no
-- SECURITY DEFINER function inserts into story_points (0 hits across 119 such
-- functions in supabase/migrations/), so nothing routes around this WITH CHECK.
--
-- The DELETE policy is intentionally left as-is: unlinking is a story-owner
-- capability, and binding it to author_id would prevent a story owner from
-- removing a link row that this very bug allowed an attacker to forge.

DROP POLICY IF EXISTS "Story authors can link points" ON story_points;

CREATE POLICY "Story authors can link points"
  ON story_points FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (SELECT 1 FROM stories WHERE id = story_id AND author_id = auth.uid())
  );
