-- FIX: Add missing UPDATE policy for profiles
-- This allows users to update their own profiles (needed for verification)

-- First, drop existing policies if they need updating
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can update profiles" ON public.profiles;

-- Add policy to allow users to update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Also allow service role (for admin operations)
-- This is important for verification flows that might use service role
CREATE POLICY "Service role can update profiles"
  ON public.profiles FOR UPDATE
  USING (auth.role() = 'service_role');

-- Verify policies are set up correctly
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'profiles'
ORDER BY policyname;

-- Check if trigger exists
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- If no trigger found, uncomment and run the following:
/*
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, linkedin_url, reason, avatar_color, is_verified)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', 'Anonymous User'),
    new.raw_user_meta_data->>'role',
    new.raw_user_meta_data->>'linkedin_url',
    new.raw_user_meta_data->>'reason',
    COALESCE(new.raw_user_meta_data->>'avatar_color', '#0044CC'),
    true  -- Set verified to true since they clicked the email link
  );
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
*/

