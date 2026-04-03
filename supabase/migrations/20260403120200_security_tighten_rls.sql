-- Migration: Security — Tighten RLS policies
-- Created: 2026-04-03
-- Description: Three targeted RLS fixes:
--   1. point_position_history INSERT: WITH CHECK (true) → WITH CHECK (false) — trigger-only writes
--   2. clarity_feed_ideas SELECT: dead code USING (visibility = 'public' OR true) → USING (visibility = 'public')
--   3. Legacy anonymous tables INSERT: WITH CHECK (true) → WITH CHECK (auth.uid() IS NOT NULL)

-- NOTE: Supabase Management API wraps each query in its own transaction.
-- BEGIN/COMMIT omitted to avoid double-wrapping.

-- ============================================================================
-- FIX 1: point_position_history INSERT — block direct client inserts
-- The log_position_change() trigger is SECURITY DEFINER and bypasses RLS.
-- Direct client inserts must be blocked to prevent fabricated history records.
-- ============================================================================

DROP POLICY IF EXISTS "Allow trigger to insert position history" ON point_position_history;

CREATE POLICY "Allow trigger to insert position history"
  ON point_position_history FOR INSERT
  WITH CHECK (false);

-- ============================================================================
-- FIX 2: clarity_feed_ideas SELECT — remove dead OR true clause
-- Old: USING (visibility = 'public' OR true) — always evaluates to true,
--      exposing private ideas to all clients.
-- New: USING (visibility = 'public') — only public ideas are readable.
-- ============================================================================

DROP POLICY IF EXISTS "Public feed ideas are viewable by everyone" ON clarity_feed_ideas;

CREATE POLICY "Public feed ideas are viewable by everyone"
  ON public.clarity_feed_ideas FOR SELECT
  USING (visibility = 'public');

-- ============================================================================
-- FIX 3: Legacy anonymous tables — require authentication for INSERT
-- Tables were created with WITH CHECK (true) for anonymous MVP usage.
-- Now require auth.uid() IS NOT NULL to block unauthenticated writes.
-- ============================================================================

-- clarity_demo_rounds
DROP POLICY IF EXISTS "Anyone can insert demo rounds" ON public.clarity_demo_rounds;

CREATE POLICY "Anyone can insert demo rounds"
  ON public.clarity_demo_rounds FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- clarity_ideas
DROP POLICY IF EXISTS "Anyone can insert ideas" ON public.clarity_ideas;

CREATE POLICY "Anyone can insert ideas"
  ON public.clarity_ideas FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- clarity_chat_messages
DROP POLICY IF EXISTS "Anyone can insert chat messages" ON public.clarity_chat_messages;

CREATE POLICY "Anyone can insert chat messages"
  ON public.clarity_chat_messages FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- clarity_verifications
DROP POLICY IF EXISTS "Anyone can insert verifications" ON public.clarity_verifications;

CREATE POLICY "Anyone can insert verifications"
  ON public.clarity_verifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- clarity_live_turns
DROP POLICY IF EXISTS "Anyone can insert live turns" ON public.clarity_live_turns;

CREATE POLICY "Anyone can insert live turns"
  ON public.clarity_live_turns FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
