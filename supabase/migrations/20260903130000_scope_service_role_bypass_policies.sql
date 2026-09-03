-- client-safe: only adds a Postgres role-level restriction to policies that
-- were already conditioned on auth.role() = 'service_role' — no authenticated
-- or anon client currently satisfies that check, so no client behavior changes.
--
-- Adds `TO service_role` to the 8 "Test data: service_role bypass" policies.
-- 20260217_fix_service_role_rls_policies.sql (and prod's current live
-- definition) relied only on the auth.role() function check, with no
-- SQL-level role restriction — the P1039 unscoped-RLS gate (which postdates
-- that migration) correctly flags this: without TO service_role, the
-- independent Postgres role boundary these policies are meant to provide is
-- absent, leaving only the JWT-claim comparison as a single line of defense.
--
-- An earlier draft of 20260903120000 tried to re-issue these policies with an
-- `intentionally-public` annotation instead of fixing the scoping — wrong:
-- these were never intended to be public, and a false annotation on a live
-- security gate is worse than the drift it was covering (codex review,
-- 2026-09-03). This is the actual fix; 20260903120000 was left as originally
-- applied (unscoped) to match what the test ledger recorded.
--
-- This creates a real, correctly-flagged drift entry against prod (test will
-- scope TO service_role, prod will not) until a matching migration ships to
-- prod — expected and intentional, not something to suppress.

DROP POLICY IF EXISTS "Test data: service_role bypass for profiles" ON public.profiles;
CREATE POLICY "Test data: service_role bypass for profiles"
  ON public.profiles FOR ALL
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Test data: service_role bypass for points" ON public.points;
CREATE POLICY "Test data: service_role bypass for points"
  ON public.points FOR ALL
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Test data: service_role bypass for point_positions" ON public.point_positions;
CREATE POLICY "Test data: service_role bypass for point_positions"
  ON public.point_positions FOR ALL
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Test data: service_role bypass for stories" ON public.stories;
CREATE POLICY "Test data: service_role bypass for stories"
  ON public.stories FOR ALL
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Test data: service_role bypass for story_points" ON public.story_points;
CREATE POLICY "Test data: service_role bypass for story_points"
  ON public.story_points FOR ALL
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Test data: service_role bypass for events" ON public.events;
CREATE POLICY "Test data: service_role bypass for events"
  ON public.events FOR ALL
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Test data: service_role bypass for event_rsvps" ON public.event_rsvps;
CREATE POLICY "Test data: service_role bypass for event_rsvps"
  ON public.event_rsvps FOR ALL
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Test data: service_role bypass for event_sub_rooms" ON public.event_sub_rooms;
CREATE POLICY "Test data: service_role bypass for event_sub_rooms"
  ON public.event_sub_rooms FOR ALL
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
