-- Allow service_role to insert profiles (for E2E tests)
-- Service role is used by test helpers to create test users
-- This policy only applies when using the service_role key

CREATE POLICY "Service role can insert profiles"
  ON public.profiles FOR INSERT
  TO service_role
  WITH CHECK (true);
