-- P1035: drop unscoped service-role bypass policies (points, point_positions, profiles)
--
-- 20260219_service_role_test_policies.sql created these policies intending them to be
-- service-role-only ("allow the service_role key... to bypass RLS"), but never added
-- `TO service_role` — they defaulted to applying to every role. A correctly-scoped
-- duplicate of each (`"Test data: service_role bypass for {table}"`, gated on
-- `current_setting('role') = 'service_role'`) already exists from earlier migrations
-- and is unaffected by this change. See features/p1035_*.md.
--
-- client-safe: the duplicates being dropped never provided any capability the scoped
-- versions don't already cover for the service role, and no client (anon/authenticated)
-- insert path relies on an unauthenticated bypass — dropping only removes access that
-- was never supposed to exist.

DROP POLICY IF EXISTS "Service role bypass for points" ON points;
DROP POLICY IF EXISTS "Service role bypass for point_positions" ON point_positions;
DROP POLICY IF EXISTS "Service role bypass for point_positions updates" ON point_positions;
DROP POLICY IF EXISTS "Service role bypass for point_positions deletes" ON point_positions;
DROP POLICY IF EXISTS "Service role bypass for profiles" ON profiles;
