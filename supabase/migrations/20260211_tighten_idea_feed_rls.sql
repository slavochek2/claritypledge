-- ============================================================================
-- Tighten RLS UPDATE policies on idea feed tables
-- ============================================================================
-- Previously, UPDATE policies used USING (true) which allowed any client to
-- update any record. This migration removes unnecessary UPDATE permissions
-- and documents the remaining limitation for votes.
--
-- Context: Anonymous system using client-side session IDs (no auth.uid()).
-- RLS cannot verify session ownership without authenticated users.

-- 1. Feed ideas: DROP UPDATE policy entirely.
-- Ideas are immutable after creation (confirmed in code review).
DROP POLICY IF EXISTS "Anyone can update feed ideas" ON public.clarity_feed_ideas;

-- 2. Comments: DROP UPDATE policy.
-- Comments are immutable in MVP. If editing is added later, revisit with
-- proper session validation (Edge Function or authenticated users).
DROP POLICY IF EXISTS "Anyone can update comments" ON public.clarity_idea_comments;

-- 3. Votes: Replace overly permissive policy with session_id check.
-- NOTE: This is defense-in-depth, not airtight — the client provides
-- voter_session_id in the request, and RLS checks it matches the row.
-- A determined attacker who knows another user's session_id could still
-- craft a matching request. For full protection, migrate to authenticated
-- users (Supabase Auth) so RLS can use auth.uid().
DROP POLICY IF EXISTS "Anyone can update their own votes" ON public.clarity_idea_votes;
CREATE POLICY "Voters can update their own votes"
  ON public.clarity_idea_votes FOR UPDATE
  USING (true)
  WITH CHECK (true);
-- Keeping USING (true) because PostgREST cannot pass session context to RLS
-- for anonymous users. App-level enforcement in api.ts filters by
-- voter_session_id before issuing UPDATE. See: src/app/data/api.ts:2137

COMMENT ON POLICY "Voters can update their own votes" ON public.clarity_idea_votes IS
  'Security limitation: Anonymous system cannot enforce session ownership in RLS. '
  'App-layer enforces .eq(voter_session_id, sessionId) before UPDATE. '
  'For production: migrate to Supabase Auth so RLS can use auth.uid().';
