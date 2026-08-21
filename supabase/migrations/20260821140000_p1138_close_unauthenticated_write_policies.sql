-- Migration: P1138 — close unauthenticated write policies
-- Created: 2026-08-21
-- Description:
--   1. Drop UPDATE policies on 4 tables carrying an unconditional predicate
--      (USING(true)) — each has zero live callers (verified: clarity_demo_rounds/
--      clarity_ideas/clarity_live_turns never call .update(); clarity_verifications'
--      only callers live in clarity-chat-page.tsx, which is headed "NOT ROUTED —
--      /clarity-chat was reverted from prod" and has no route in App.tsx).
--   2. Drop the stray unconditional INSERT policy on ml_training_sessions. It
--      coexists with the already-correct "ml_training_sessions_insert_authenticated"
--      (TO authenticated) policy from 20260404120000_security_backlog_rls.sql, which
--      stays untouched. The live upload path (supabase/functions/gcs-signed-url)
--      already 401s any caller without a valid JWT, so no legitimate write depends
--      on the broad policy — closing it is zero-cost.
--   3. Reconstruct ml_training_sessions' CREATE TABLE — it has never had one in any
--      migration (created out-of-band). CREATE TABLE IF NOT EXISTS only; no attempt
--      to reorder migration history so a from-scratch replay succeeds (20260116 and
--      20260404120000 already ALTER this table earlier in migration order and would
--      fail on a truly fresh DB regardless of this file — pre-existing, out of scope
--      here, see the w4/P1132 migration-replay-guards work).
--
-- Spec: features/p1138_world_writable_rls_policies_never_tightened.md
--
-- client-safe: every dropped policy has zero deployed-client dependency, verified
-- before writing this migration, not asserted after. The 4 UPDATE policies (demo
-- rounds/ideas/live_turns/verifications) have no .update() call site anywhere in
-- src/ for 3 of them, and clarity_verifications' only callers live in
-- clarity-chat-page.tsx, which carries its own header "NOT ROUTED — /clarity-chat
-- was reverted from prod" and has no route in src/App.tsx. The dropped
-- ml_training_sessions INSERT policy is a pure duplicate of the untouched
-- "ml_training_sessions_insert_authenticated" (TO authenticated) policy — the only
-- real write path (supabase/functions/gcs-signed-url) already requires a valid JWT
-- and 401s otherwise, so no deployed client's write ever depended on the dropped,
-- broader policy specifically.

-- ============================================================================
-- FIX 1: drop UPDATE policies with zero live callers
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can update demo rounds" ON public.clarity_demo_rounds;
DROP POLICY IF EXISTS "Anyone can update ideas" ON public.clarity_ideas;
DROP POLICY IF EXISTS "Anyone can update live turns" ON public.clarity_live_turns;
DROP POLICY IF EXISTS "Anyone can update verifications" ON public.clarity_verifications;

-- ============================================================================
-- FIX 2: ml_training_sessions — drop the stray anon-writable INSERT policy
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can insert ML training sessions" ON public.ml_training_sessions;

-- ============================================================================
-- FIX 3: reconstruct the missing CREATE TABLE (out-of-band origin — never
-- tracked in a migration; columns/types confirmed against live test data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ml_training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code TEXT NOT NULL,
  user_name TEXT NOT NULL,
  audio_path TEXT NOT NULL,
  duration_ms INTEGER,
  chunk_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON COLUMN public.ml_training_sessions.chunk_count IS 'Number of 30-second audio chunks uploaded';
COMMENT ON COLUMN public.ml_training_sessions.duration_ms IS 'Estimated duration in milliseconds (chunk_count * 30000)';

ALTER TABLE public.ml_training_sessions ENABLE ROW LEVEL SECURITY;

-- Re-assert (idempotent) the policies 20260404120000 already established, so a
-- fresh apply of this file alone leaves the table in the correct end state.
DROP POLICY IF EXISTS "ml_training_sessions_insert_authenticated" ON public.ml_training_sessions;
CREATE POLICY "ml_training_sessions_insert_authenticated"
  ON public.ml_training_sessions FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "ml_training_sessions_select_service_role" ON public.ml_training_sessions;
CREATE POLICY "ml_training_sessions_select_service_role"
  ON public.ml_training_sessions FOR SELECT
  TO service_role
  USING (true);
