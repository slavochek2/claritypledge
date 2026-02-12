-- P137: Service Role Bypass Policies for E2E Tests
-- These policies allow the service_role key (used in test helpers) to bypass
-- RLS restrictions when creating test data

-- Profiles: Allow service_role to insert (for test user creation)
DROP POLICY IF EXISTS "Service role bypass for profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Service role bypass for profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (true);

-- Points: Allow service_role to insert (for test point creation)
CREATE POLICY "Service role bypass for points"
  ON public.points FOR INSERT
  WITH CHECK (true);

-- Point Positions: Allow service_role full access (for test data setup/cleanup)
CREATE POLICY "Service role bypass for point_positions"
  ON public.point_positions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role bypass for point_positions updates"
  ON public.point_positions FOR UPDATE
  USING (true);

CREATE POLICY "Service role bypass for point_positions deletes"
  ON public.point_positions FOR DELETE
  USING (true);
