-- P571: Hide test accounts from public pledgers page
-- Adds is_test_account flag to profiles; default false (all real users unaffected).
-- Known test accounts are flagged explicitly — they retain full login/app access.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN NOT NULL DEFAULT false;

-- Flag known test account (slava@inguro.com flagged via dashboard — not in public SQL)
UPDATE profiles SET is_test_account = true
  WHERE email = 'e2e-agent@claritypledge.com';

-- Prevent users from self-clearing the test account flag via direct REST
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND is_test_account = (SELECT is_test_account FROM profiles WHERE id = auth.uid()));
