-- ============================================================================
-- E2E Test Infrastructure: Service Role RLS Bypass Policies (Complete Fix)
-- ============================================================================
-- Purpose: Allow E2E test helpers to create test data using service_role key
-- Security: Uses proper role checking (not blanket true)
-- Replaces: 20260209_service_role_test_policies.sql (blanket true policies)
--           20260209_allow_service_role_profile_insert.sql (duplicate)
-- ============================================================================

-- Drop old blanket policies
DROP POLICY IF EXISTS "Service role bypass for profiles" ON public.profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Service role bypass for points" ON public.points;
DROP POLICY IF EXISTS "Service role bypass for point_positions" ON public.point_positions;
DROP POLICY IF EXISTS "Service role bypass for point_positions updates" ON public.point_positions;
DROP POLICY IF EXISTS "Service role bypass for point_positions deletes" ON public.point_positions;

-- Profiles
CREATE POLICY "Test data: service_role bypass for profiles"
  ON public.profiles FOR ALL
  USING (current_setting('role') = 'service_role')
  WITH CHECK (current_setting('role') = 'service_role');

-- Points
CREATE POLICY "Test data: service_role bypass for points"
  ON public.points FOR ALL
  USING (current_setting('role') = 'service_role')
  WITH CHECK (current_setting('role') = 'service_role');

-- Point Positions
CREATE POLICY "Test data: service_role bypass for point_positions"
  ON public.point_positions FOR ALL
  USING (current_setting('role') = 'service_role')
  WITH CHECK (current_setting('role') = 'service_role');

-- Point Position History (no bypass needed - trigger is SECURITY DEFINER)
-- Existing policy "Allow trigger to insert position history" (WITH CHECK true) is safe
-- because only the trigger can write to this table (not exposed via API)

-- Stories
CREATE POLICY "Test data: service_role bypass for stories"
  ON public.stories FOR ALL
  USING (current_setting('role') = 'service_role')
  WITH CHECK (current_setting('role') = 'service_role');

-- Story Points (junction table)
CREATE POLICY "Test data: service_role bypass for story_points"
  ON public.story_points FOR ALL
  USING (current_setting('role') = 'service_role')
  WITH CHECK (current_setting('role') = 'service_role');

-- Events
CREATE POLICY "Test data: service_role bypass for events"
  ON public.events FOR ALL
  USING (current_setting('role') = 'service_role')
  WITH CHECK (current_setting('role') = 'service_role');

-- Event RSVPs
CREATE POLICY "Test data: service_role bypass for event_rsvps"
  ON public.event_rsvps FOR ALL
  USING (current_setting('role') = 'service_role')
  WITH CHECK (current_setting('role') = 'service_role');

-- Event Sub-Rooms
CREATE POLICY "Test data: service_role bypass for event_sub_rooms"
  ON public.event_sub_rooms FOR ALL
  USING (current_setting('role') = 'service_role')
  WITH CHECK (current_setting('role') = 'service_role');

-- ============================================================================
-- PostgreSQL Configuration Helper (for trigger disable during test cleanup)
-- ============================================================================
-- Used by test helpers to disable triggers during cleanup:
--   session_replication_role = 'replica' → triggers disabled
--   session_replication_role = 'origin' → triggers enabled (default)

CREATE OR REPLACE FUNCTION public.set_config(
  setting_name text,
  new_value text,
  is_local boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config(setting_name, new_value, is_local);
  RETURN new_value;
END;
$$;

-- Grant execute to service_role (test helpers use this)
GRANT EXECUTE ON FUNCTION public.set_config TO service_role;
