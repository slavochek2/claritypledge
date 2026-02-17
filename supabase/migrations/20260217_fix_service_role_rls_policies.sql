-- Fix service_role RLS bypass policies
-- Previous policies used current_setting('role') = 'service_role' which checks
-- a GUC variable. PostgREST uses SET LOCAL ROLE (SQL form), not SET "role" = ...
-- (GUC form), so the GUC is never set and the check always fails.
--
-- Correct check: auth.role() = 'service_role'
-- auth.role() reads from request.jwt.claims which PostgREST does set.

-- Profiles
DROP POLICY IF EXISTS "Test data: service_role bypass for profiles" ON public.profiles;
CREATE POLICY "Test data: service_role bypass for profiles"
  ON public.profiles FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Points
DROP POLICY IF EXISTS "Test data: service_role bypass for points" ON public.points;
CREATE POLICY "Test data: service_role bypass for points"
  ON public.points FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Point Positions
DROP POLICY IF EXISTS "Test data: service_role bypass for point_positions" ON public.point_positions;
CREATE POLICY "Test data: service_role bypass for point_positions"
  ON public.point_positions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Stories
DROP POLICY IF EXISTS "Test data: service_role bypass for stories" ON public.stories;
CREATE POLICY "Test data: service_role bypass for stories"
  ON public.stories FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Story Points (junction table)
DROP POLICY IF EXISTS "Test data: service_role bypass for story_points" ON public.story_points;
CREATE POLICY "Test data: service_role bypass for story_points"
  ON public.story_points FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Events
DROP POLICY IF EXISTS "Test data: service_role bypass for events" ON public.events;
CREATE POLICY "Test data: service_role bypass for events"
  ON public.events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Event RSVPs
DROP POLICY IF EXISTS "Test data: service_role bypass for event_rsvps" ON public.event_rsvps;
CREATE POLICY "Test data: service_role bypass for event_rsvps"
  ON public.event_rsvps FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Event Sub-Rooms
DROP POLICY IF EXISTS "Test data: service_role bypass for event_sub_rooms" ON public.event_sub_rooms;
CREATE POLICY "Test data: service_role bypass for event_sub_rooms"
  ON public.event_sub_rooms FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
