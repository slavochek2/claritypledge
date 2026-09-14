-- Migration: P1302 (d) — a child row may be written only by a party to its session
-- Created: 2026-09-11
-- Spec: features/p1302_a_session_with_no_named_listener_is_readable_by_anyone.md
-- Reproduced by: e2e/integration/p1302-session-select-scope.spec.ts (A12b)
--
-- diffed against: 20260911120200_p1302_c_writes_by_identity_or_anon_code.sql — this file changes only
--   the three child INSERT policies' access term and adds one conjunct to the row policy's WITH CHECK
--   anon arm. patch_live_state is NOT redefined here.
--
-- requires-frontend: 84567ac94
--   No new client dependency beyond 20260911120000's.
--
-- WHY (delta review of 233dbfff1, findings HIGH 1 and MEDIUM 2)
--   (c) scoped the child INSERTs with can_read_clarity_session(session_id). That function is the READ
--   predicate, and its code arm is deliberately role-agnostic — a signed-in visitor to a public event
--   page holds that room's published code and may READ the room. Using it to gate a WRITE contradicted
--   the rule (c) states for itself: "writing is a participant act … the room-code WRITE path is only
--   ever a guest's, i.e. anon". So any signed-in account holding a published practice-room code could
--   still INSERT fabricated turns, ideas or demo rounds into that room, which the parties then read
--   back through the P1207 SELECT policy. Injection rather than disclosure, and a narrowing of a wider
--   pre-existing hole (p520 admitted ANY signed-in user to any non-cancelled room with no code at all)
--   — but not the bound this spec claims.
--
--   The three policies are TO authenticated, so an anon guest has no INSERT policy on these tables
--   either way and none is lost: guests write session state, never child rows.
--
--   The identity test is written inline rather than through a helper. The subquery runs as the caller,
--   so clarity_sessions' own SELECT policy also applies to it — but the identity terms are stated here
--   explicitly, so a row the caller cannot see yields EXISTS false and the policy fails CLOSED. That is
--   the difference from the `NOT EXISTS(cancelled)` guard this migration keeps beside it, which fails
--   OPEN on an invisible row and is why (c) had to add a term at all.

-- ── HIGH 1: child INSERTs are identity-only ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can insert demo rounds" ON public.clarity_demo_rounds;
CREATE POLICY "Anyone can insert demo rounds"
  ON public.clarity_demo_rounds FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.clarity_sessions s
       WHERE s.id = session_id
         AND auth.uid() IN (s.creator_profile_id, s.joiner_profile_id, s.target_listener_id)
    )
    AND NOT EXISTS (SELECT 1 FROM public.clarity_sessions s WHERE s.id = session_id AND s.status = 'cancelled')
  );

DROP POLICY IF EXISTS "Anyone can insert ideas" ON public.clarity_ideas;
CREATE POLICY "Anyone can insert ideas"
  ON public.clarity_ideas FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.clarity_sessions s
       WHERE s.id = session_id
         AND auth.uid() IN (s.creator_profile_id, s.joiner_profile_id, s.target_listener_id)
    )
    AND NOT EXISTS (SELECT 1 FROM public.clarity_sessions s WHERE s.id = session_id AND s.status = 'cancelled')
  );

DROP POLICY IF EXISTS "Anyone can insert live turns" ON public.clarity_live_turns;
CREATE POLICY "Anyone can insert live turns"
  ON public.clarity_live_turns FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.clarity_sessions s
       WHERE s.id = session_id
         AND auth.uid() IN (s.creator_profile_id, s.joiner_profile_id, s.target_listener_id)
    )
    AND NOT EXISTS (SELECT 1 FROM public.clarity_sessions s WHERE s.id = session_id AND s.status = 'cancelled')
  );

-- ── MEDIUM 2: the WITH CHECK anon arm repeats the bound its USING states ─────────────────────
-- Harmless today only because `ended_at` sits outside anon's UPDATE grant — i.e. the policy leaned on
-- a grant list in another migration for a bound it states itself. Stated here instead.
DROP POLICY IF EXISTS clarity_sessions_creator_update ON public.clarity_sessions;
CREATE POLICY clarity_sessions_creator_update
  ON public.clarity_sessions
  FOR UPDATE
  TO anon, authenticated
  USING (
    status IS DISTINCT FROM 'cancelled'
    AND (
      auth.uid() = creator_profile_id
      OR auth.uid() = joiner_profile_id
      OR auth.uid() = target_listener_id
      OR (
        auth.uid() IS NULL
        AND ended_at IS NULL
        AND target_listener_id IS NULL
        AND code = ANY (ARRAY(
          SELECT upper(btrim(part))
            FROM unnest(string_to_array(
                   left(COALESCE(
                     NULLIF(current_setting('request.headers', true), '')::json ->> 'x-clarity-room-code',
                     ''), 32),
                   ',')) WITH ORDINALITY AS t(part, ord)
           WHERE upper(btrim(part)) ~ '^[A-Z0-9]{6}$'
           ORDER BY ord
           LIMIT 2
        ))
      )
    )
  )
  WITH CHECK (
    creator_profile_id IS NOT NULL
    AND (
      auth.uid() = creator_profile_id
      OR auth.uid() = joiner_profile_id
      OR auth.uid() = target_listener_id
      OR (
        auth.uid() IS NULL
        AND ended_at IS NULL
        AND target_listener_id IS NULL
        AND code = ANY (ARRAY(
          SELECT upper(btrim(part))
            FROM unnest(string_to_array(
                   left(COALESCE(
                     NULLIF(current_setting('request.headers', true), '')::json ->> 'x-clarity-room-code',
                     ''), 32),
                   ',')) WITH ORDINALITY AS t(part, ord)
           WHERE upper(btrim(part)) ~ '^[A-Z0-9]{6}$'
           ORDER BY ord
           LIMIT 2
        ))
      )
    )
  );

-- ── Guard, re-asserted ───────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_extra text;
BEGIN
  SELECT string_agg(policyname || ' (' || cmd || ')', ', ')
    INTO v_extra
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'clarity_sessions'
     AND cmd IN ('SELECT', 'UPDATE', 'ALL')
     AND policyname NOT IN ('clarity_sessions_select', 'clarity_sessions_creator_update');
  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'P1302: unexpected read/write policy on clarity_sessions: %', v_extra;
  END IF;
END
$$;
