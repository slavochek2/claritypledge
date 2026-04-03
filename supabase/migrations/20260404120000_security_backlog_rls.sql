-- Security backlog: minor RLS/policy fixes
-- Fix 1: witnesses INSERT — restrict to own profile_id
-- Fix 2: ml_training_sessions — enable RLS, allow authenticated inserts
-- Fix 3: story_versions INSERT — remove redundant current_user = 'postgres' check

-- ============================================================================
-- FIX 1: witnesses INSERT
-- Old policy used WITH CHECK (true) — any authenticated user could create a
-- witness record for any profile. Restrict to own profile_id.
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can insert witnesses" ON public.witnesses;

CREATE POLICY "Authenticated users can insert witnesses"
  ON public.witnesses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = profile_id);

-- ============================================================================
-- FIX 2: ml_training_sessions — enable RLS
-- Table had no RLS enabled. No user_id column exists (uses user_name string),
-- so user-scoping is not possible. Allow authenticated users to insert (same
-- access the app relies on — inserts are non-fatal tracking records).
-- SELECT/UPDATE/DELETE restricted to service_role only (admin tooling).
-- ============================================================================
ALTER TABLE ml_training_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ml_training_sessions_insert_authenticated" ON ml_training_sessions;
DROP POLICY IF EXISTS "ml_training_sessions_select_service_role" ON ml_training_sessions;

CREATE POLICY "ml_training_sessions_insert_authenticated"
  ON ml_training_sessions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "ml_training_sessions_select_service_role"
  ON ml_training_sessions FOR SELECT
  TO service_role
  USING (true);

-- ============================================================================
-- FIX 3: story_versions INSERT
-- Old policy included `current_user = 'postgres'` — a session-role check that
-- can never be true in normal Supabase operation (roles are anon/authenticated/
-- service_role). Remove it; the EXISTS check on stories.author_id is sufficient.
-- ============================================================================
DROP POLICY IF EXISTS "story_versions_insert" ON story_versions;

CREATE POLICY "story_versions_insert"
  ON story_versions FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM stories
      WHERE stories.id = story_id
        AND stories.author_id = auth.uid()
    )
  );
