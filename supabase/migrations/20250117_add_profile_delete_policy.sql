-- Allow users to delete profiles that match their email
-- This enables /live user migration: anonymous profile → verified account
-- client-safe: version-recorded and already applied on both live databases;
-- the guard below only executes on a from-empty build and is never re-run
-- against a live DB (P1132 Appetite/Risks).
DROP POLICY IF EXISTS "Users can delete profiles by email match" ON public.profiles;
CREATE POLICY "Users can delete profiles by email match"
  ON public.profiles FOR DELETE
  USING (email = auth.email());
