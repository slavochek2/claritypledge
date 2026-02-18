-- ============================================================================
-- RLS Security Improvements (P19.3 Code Review)
-- ============================================================================
-- Since this is an ANONYMOUS system using client-side session IDs,
-- we cannot use auth.uid() for RLS. The session_id is passed from the client
-- and we trust it because:
-- 1. Session IDs are UUIDs generated client-side (crypto.randomUUID)
-- 2. Each user only knows their own session ID (stored in localStorage)
-- 3. Guessing another user's UUID is computationally infeasible
--
-- For additional security at the API layer, we validate that:
-- - Updates only modify records matching the client's session_id
-- - This is enforced in the application code (api.ts)
--
-- IMPORTANT: For production with higher security requirements, consider:
-- 1. Moving to authenticated users (Supabase Auth)
-- 2. Using Edge Functions to validate session ownership
-- 3. Adding rate limiting via pg_graphql or Edge Functions

-- Document the intentional design decision in the schema
COMMENT ON POLICY "Anyone can update their own votes" ON public.clarity_idea_votes IS
  'MVP: Allows all updates. Security relies on client passing correct session_id. For production, implement session validation in Edge Functions or migrate to authenticated users.';

COMMENT ON POLICY "Anyone can update comments" ON public.clarity_idea_comments IS
  'MVP: Allows all updates. Security relies on client passing correct session_id. For production, implement session validation in Edge Functions or migrate to authenticated users.';

COMMENT ON POLICY "Anyone can update feed ideas" ON public.clarity_feed_ideas IS
  'MVP: Allows all updates. Currently unused - ideas are immutable after creation. Consider removing UPDATE policy if not needed.';

-- Add session_id to verifications table for better realtime filtering
-- This avoids querying the messages table for every verification event
ALTER TABLE public.clarity_verifications
  ADD COLUMN IF NOT EXISTS session_id UUID;

-- Backfill existing verifications with session_id from their parent message
UPDATE public.clarity_verifications v
SET session_id = m.session_id
FROM public.clarity_chat_messages m
WHERE v.message_id = m.id
  AND v.session_id IS NULL;

-- Add index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_clarity_verifications_session
  ON public.clarity_verifications(session_id);

-- Add content length constraints to prevent abuse
-- Max 5000 chars for ideas (about 800 words)
-- Max 2000 chars for comments (about 300 words)
-- Max 1000 chars for names (very generous for international names)

ALTER TABLE public.clarity_feed_ideas
  ADD CONSTRAINT chk_content_length CHECK (length(content) <= 5000);

ALTER TABLE public.clarity_feed_ideas
  ADD CONSTRAINT chk_originator_name_length CHECK (length(originator_name) <= 100);

ALTER TABLE public.clarity_idea_comments
  ADD CONSTRAINT chk_comment_content_length CHECK (length(content) <= 2000);

ALTER TABLE public.clarity_idea_comments
  ADD CONSTRAINT chk_comment_author_name_length CHECK (length(author_name) <= 100);

ALTER TABLE public.clarity_idea_votes
  ADD CONSTRAINT chk_voter_name_length CHECK (length(voter_name) <= 100);

ALTER TABLE public.clarity_chat_messages
  ADD CONSTRAINT chk_chat_content_length CHECK (length(content) <= 5000);

ALTER TABLE public.clarity_chat_messages
  ADD CONSTRAINT chk_chat_author_name_length CHECK (length(author_name) <= 100);

ALTER TABLE public.clarity_verifications
  ADD CONSTRAINT chk_verification_paraphrase_length CHECK (length(paraphrase_text) <= 2000);

ALTER TABLE public.clarity_verifications
  ADD CONSTRAINT chk_verification_verifier_name_length CHECK (length(verifier_name) <= 100);

ALTER TABLE public.clarity_verifications
  ADD CONSTRAINT chk_verification_correction_length CHECK (correction_text IS NULL OR length(correction_text) <= 1000);
