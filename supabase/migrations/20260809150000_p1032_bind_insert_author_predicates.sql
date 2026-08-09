-- P1032: bind the author column on stories/points INSERT policies to auth.uid()
--
-- 20260325120000_p586_visibility_privacy_foundation.sql recreated these two
-- INSERT policies checking only caller verification (auth.uid() IS NOT NULL +
-- is_verified), never that the row's author column names the caller. Every
-- sibling policy on the same tables (stories UPDATE/DELETE, point_positions
-- INSERT, story_points INSERT) already binds ownership — this was an omission
-- in that migration, not a deliberate policy. See features/p1032_*.md.
--
-- Fix: add the same ownership predicate the sibling UPDATE/DELETE policies use.
--
-- client-safe: the only client insert paths (stories-service-real.ts:174,
-- points-service-real.ts:211) already set author_id/first_validator_id from
-- the authenticated session (auth.uid()), never from a caller-supplied value
-- — the new predicate only rejects forged inserts that no deployed client
-- ever sends. Verified: 0 hits for "INSERT INTO stories|points" outside these
-- two client paths (grep across src/, supabase/, scripts/).

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
