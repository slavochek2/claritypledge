-- Migration: P1302 (c) — writing by room code is anon-only; child INSERTs inherit session scope
-- Created: 2026-09-11
-- Spec: features/p1302_a_session_with_no_named_listener_is_readable_by_anyone.md
-- Reproduced by: e2e/integration/p1302-session-select-scope.spec.ts (A8b, A10, A11, A12)
--
-- diffed against: 20260911120000_p1302_session_access_predicate.sql (patch_live_state — the ONLY change is
--   the added `ended_at IS NULL` term on the guest arm; every other line, including the cancelled guard,
--   the participant arms and the auto-reveal block, is byte-identical to that version)
--
-- requires-frontend: 84567ac94
--   Same client dependency as 20260911120000: the deployed bundle must send the room-code header.
--
-- WHY THIS EXISTS (code review of the 120000/120100 pair, findings H1, M1, M3)
--   The read predicate is deliberately role-agnostic: a signed-in visitor to a public event page
--   holds that room's published code and may READ the room, exactly as an anon guest may. But the
--   UPDATE policy reused that same predicate, so a signed-in NON-PARTY holding a public code passed
--   USING and WITH CHECK and could write the creator's columns (`authenticated` keeps them; only
--   `anon` was revoked) or set status='cancelled' to brick the room. Writing is a participant act:
--   a signed-in participant always writes by IDENTITY (creator/joiner/listener — a joiner becomes
--   one through claim_joiner_seat), so the room-code WRITE path is only ever a guest's, i.e. anon.
--
--   Three corrections, all last-wins over 120000 (prod applies 120000→120100→120200 fresh; test
--   already has the earlier 120000 and 120100, so this migration is what brings it to final state):
--     H1 — the UPDATE code branch requires `auth.uid() IS NULL` (anon), open room, not ended.
--     M1 — patch_live_state's guest arm gets the same `ended_at IS NULL` bound the row policy has.
--     M3 — the child-table INSERT policies (demo_rounds/ideas/live_turns) gained a silent hole when
--          120000 made a cancelled/foreign row invisible to a non-party: their `NOT EXISTS(cancelled)`
--          guard then reads true for a row the caller cannot see, so any signed-in user could insert
--          into any open room's children. Scope each INSERT to can_read_clarity_session(session_id).
--
-- OUT OF SCOPE (stated, not silently skipped): clarity_verifications' INSERT policy is scoped
--   independently of this predicate. That predates P1302 and P1302 does not worsen it; the
--   practical reach is already bounded by the parent row's own scope. Detail is recorded in the
--   private security log rather than here, because the gap is not closed. Not a P1302 regression.

-- ── H1: UPDATE — identity always; room code only for an anon guest, open + live room ──────────
-- The header parse is inlined (not via clarity_request_room_codes(), which anon may not EXECUTE);
-- it is byte-identical to the SELECT policy's parse and to clarity_request_room_codes().
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

-- ── M1: patch_live_state — the guest arm also requires the room be live ──────────────────────
-- Ported from 20260911120000 (itself from p520); the only change is `AND ended_at IS NULL` on the
-- guest arm, matching the row UPDATE policy's anon bound.
CREATE OR REPLACE FUNCTION patch_live_state(
  p_session_id uuid,
  p_patch      jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  merged jsonb;
BEGIN
  UPDATE clarity_sessions
  SET live_state = COALESCE(live_state, '{}'::jsonb) || p_patch
  WHERE id = p_session_id
    AND status IS DISTINCT FROM 'cancelled'
    AND (
      creator_profile_id = auth.uid()
      OR joiner_profile_id = auth.uid()
      OR (
        auth.uid() IS NULL
        AND joiner_profile_id IS NULL
        AND joiner_name IS NOT NULL
        AND ended_at IS NULL
        AND code = ANY (public.clarity_request_room_codes())
      )
    )
  RETURNING live_state INTO merged;

  IF merged IS NOT NULL
     AND (merged->>'checkerSubmitted')::boolean IS TRUE
     AND (merged->>'responderSubmitted')::boolean IS TRUE
     AND merged->>'ratingPhase' = 'waiting'
  THEN
    UPDATE clarity_sessions
    SET live_state = live_state || '{"ratingPhase": "revealed"}'::jsonb
    WHERE id = p_session_id;
  END IF;
END;
$$;

-- ── M3: child-table INSERTs inherit the session's visibility ─────────────────────────────────
-- `can_read_clarity_session` is SECURITY DEFINER and granted to anon/authenticated, so it is legal
-- inside a policy evaluated as the caller (unlike clarity_request_room_codes, which is not). The
-- session row is pre-existing, so the id lookup is not the INSERT-RETURNING snapshot case.
DROP POLICY IF EXISTS "Anyone can insert demo rounds" ON public.clarity_demo_rounds;
CREATE POLICY "Anyone can insert demo rounds"
  ON public.clarity_demo_rounds FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
    AND public.can_read_clarity_session(session_id)
    AND NOT EXISTS (SELECT 1 FROM public.clarity_sessions s WHERE s.id = session_id AND s.status = 'cancelled')
  );

DROP POLICY IF EXISTS "Anyone can insert ideas" ON public.clarity_ideas;
CREATE POLICY "Anyone can insert ideas"
  ON public.clarity_ideas FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
    AND public.can_read_clarity_session(session_id)
    AND NOT EXISTS (SELECT 1 FROM public.clarity_sessions s WHERE s.id = session_id AND s.status = 'cancelled')
  );

DROP POLICY IF EXISTS "Anyone can insert live turns" ON public.clarity_live_turns;
CREATE POLICY "Anyone can insert live turns"
  ON public.clarity_live_turns FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
    AND public.can_read_clarity_session(session_id)
    AND NOT EXISTS (SELECT 1 FROM public.clarity_sessions s WHERE s.id = session_id AND s.status = 'cancelled')
  );

-- ── Guard, re-asserted (the 120000 DO-block, unchanged) ──────────────────────────────────────
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
