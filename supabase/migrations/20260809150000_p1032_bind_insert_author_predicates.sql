-- P1032: bind the author column on stories/points INSERT policies to auth.uid()
--
-- The INSERT policies on stories and points have checked only caller
-- verification (auth.uid() IS NOT NULL + is_verified), never that the row's
-- author column names the caller, since the tables were first created
-- (20260204_stories_points_calibration.sql:322-326, :348-352) — P586's
-- 20260325120000_p586_visibility_privacy_foundation.sql recreated the same
-- unbound policies without introducing the gap. The sibling UPDATE/DELETE
-- policies on stories, and point_positions INSERT, already bind ownership.
-- See features/p1032_*.md.
--
-- Fix: add the same ownership predicate the sibling UPDATE/DELETE policies use.
--
-- client-safe: every client insert path into stories/points already sets
-- author_id/first_validator_id from the authenticated session (auth.uid()),
-- never from a caller-supplied value — the new predicate only rejects forged
-- inserts that no deployed client ever sends. Checked: stories-service-real.ts:174,
-- points-service-real.ts:211, letters-service.ts:1966 (createLetterPositionStory).
-- Raw-SQL inserts in scripts/archive/migrations/ run over a privileged
-- connection that bypasses RLS entirely, so they're unaffected either way.
--
-- Known sibling gap NOT fixed here (different table, out of this fix's scope):
-- story_points has its own author_id column (NOT NULL, unique per
-- author+point, 20260301120000_story_points_author_unique.sql) that its
-- INSERT policy ("Story authors can link points",
-- 20260325120000_p586_visibility_privacy_foundation.sql:243-246) never binds
-- to auth.uid() — only that the caller owns the referenced story. Tracked as
-- P1034.

DROP POLICY IF EXISTS "Verified users can create stories" ON stories;

CREATE POLICY "Verified users can create stories"
  ON stories FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND author_id = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_verified = true)
  );

DROP POLICY IF EXISTS "Verified users can create points" ON points;

CREATE POLICY "Verified users can create points"
  ON points FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND first_validator_id = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_verified = true)
  );
