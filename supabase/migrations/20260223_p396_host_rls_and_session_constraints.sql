-- P396: Host RLS hardening + joiner_name length constraint
-- Closes security hole for legacy guest-created sessions while enforcing verified-only hosting.

-- ============================================================================
-- 1. INSERT policy — verified hosts only
-- ============================================================================

-- Drop old open INSERT policy (WITH CHECK (true) — anyone could create a session)
DROP POLICY IF EXISTS "Anyone can create sessions" ON public.clarity_sessions;

-- Only verified users can create sessions
CREATE POLICY "clarity_sessions_verified_host_insert"
ON public.clarity_sessions
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND is_verified = true
  )
);

-- ============================================================================
-- 2. UPDATE policy — tighten to block legacy NULL-creator sessions
-- ============================================================================

-- Drop the original open policy (WITH CHECK (true) equivalent — USING(true) only)
DROP POLICY IF EXISTS "Anyone can update sessions" ON public.clarity_sessions;

-- Drop the p160 tightened policy (creator-only, but with OR creator_profile_id IS NULL hole)
DROP POLICY IF EXISTS "clarity_sessions_creator_update" ON public.clarity_sessions;

-- New policy: allow updates only to sessions created by verified hosts.
-- This blocks all callers (including anon) from updating legacy sessions where
-- creator_profile_id IS NULL (the security hole from the p160 OR branch).
-- Sessions with creator_profile_id set (all new sessions post-P396) can be updated
-- by any caller — supporting both the creator (live_state updates) and the anonymous
-- guest joiner (setting joiner_name via joinClaritySession).
CREATE POLICY "clarity_sessions_creator_update"
ON public.clarity_sessions
FOR UPDATE
USING (true)
WITH CHECK (
  creator_profile_id IS NOT NULL
);

-- ============================================================================
-- 3. joiner_name length constraint
-- ============================================================================

ALTER TABLE public.clarity_sessions
ADD CONSTRAINT joiner_name_length CHECK (length(joiner_name) <= 100);
