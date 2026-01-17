-- Allow users to delete profiles that match their email
-- This enables /live user migration: anonymous profile → verified account
CREATE POLICY "Users can delete profiles by email match"
  ON public.profiles FOR DELETE
  USING (email = auth.email());
