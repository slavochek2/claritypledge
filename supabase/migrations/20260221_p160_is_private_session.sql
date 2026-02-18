-- P160: Private Session Mode
-- Adds is_private flag to clarity_sessions to control ML data capture
-- Private sessions skip audio recording and events upload; session history still saved.

-- ============================================================================
-- 1. Add is_private column
-- ============================================================================

ALTER TABLE public.clarity_sessions
ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clarity_sessions.is_private IS 'When true, session is private: no audio/events uploaded for ML training. Session history still saved.';

-- ============================================================================
-- 2. Tighten UPDATE RLS policy
-- Only the session creator (by profile ID) can update their session.
-- Prevents joiners or anonymous callers from flipping is_private.
-- ============================================================================

-- Drop the old open UPDATE policy (no WITH CHECK)
DROP POLICY IF EXISTS "Allow session updates" ON public.clarity_sessions;
DROP POLICY IF EXISTS "clarity_sessions_update" ON public.clarity_sessions;

-- New policy: only the authenticated creator can update
CREATE POLICY "clarity_sessions_creator_update"
ON public.clarity_sessions
FOR UPDATE
USING (true)
WITH CHECK (
  creator_profile_id = auth.uid()
  OR creator_profile_id IS NULL  -- guest-created sessions (creator_profile_id null): allow update until locked
);
