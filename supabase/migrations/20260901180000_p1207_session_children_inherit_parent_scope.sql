-- Migration: P1207 F10 — session child tables must inherit the parent's visibility
-- Created: 2026-09-01
-- Spec: features/p1207_adversarial_permission_audit_before_agent_api.md
-- Audit: docs/audits/p1207-phase1-findings.md (F10)
-- Reproduced by: e2e/integration/p1207-session-child-scope.spec.ts
--
-- clarity_sessions gates directed sessions correctly:
--   qual = (target_listener_id IS NULL)
--          OR (auth.uid() = target_listener_id OR auth.uid() = creator_profile_id)
-- An OPEN session (no target listener) is public by design — that is the anonymous /live flow,
-- where participants join by code and have no account. A DIRECTED session is private to its two
-- parties.
--
-- The three child tables did not inherit that. Each carried a bare `qual = true`:
--   clarity_demo_rounds  "Demo rounds are viewable by everyone"
--   clarity_ideas        "Ideas are viewable by everyone"
--   clarity_live_turns   "Live turns are viewable by everyone"
--
-- So the parent hid a private session's row while its CONTENT stayed world-readable. Measured on
-- test with a directed session between two profiles, read by an anonymous client:
--   parent row  -> 0 rows   (correctly gated)
--   live turns  -> 1 row    [{"transcript":"SENTINEL private transcript","self_rating":9}]
-- The transcript and the speaker's private self-rating are the most sensitive content the
-- product holds, and they were reachable by anyone, for every directed session, with no id and
-- no credential — a plain unfiltered select returns them.
--
-- These tables were EMPTY on test, which is why Phase 1 could not classify them: a clean anon
-- result on an empty table proves nothing. They were seeded specifically to close that gap, and
-- four of the six vacuous tables turned out to be anon-enumerable with full content.
--
-- FIX: each child's predicate becomes "the parent is visible to me", expressed as an EXISTS
-- against clarity_sessions, which re-uses the parent's own rule rather than restating it. Open
-- sessions stay fully public, so the anonymous /live flow is unchanged; directed sessions become
-- readable only by their two parties, matching the parent exactly.
--
-- client-safe: no client change is needed and none is made. Every /live read is scoped to a
-- session the caller is participating in, and for the anonymous flow that session has
-- target_listener_id IS NULL, which the new predicate admits unchanged. The only reads that stop
-- working are cross-session reads of DIRECTED sessions, which no client performs — those are
-- exactly the leak.

CREATE OR REPLACE FUNCTION public.can_read_clarity_session(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  -- Mirrors clarity_sessions' own SELECT predicate. SECURITY DEFINER so the child policy can
  -- evaluate it without the caller needing to read clarity_sessions directly (they may hold no
  -- column grants there), and STABLE so it is not re-evaluated per row unnecessarily.
  SELECT EXISTS (
    SELECT 1 FROM clarity_sessions s
    WHERE s.id = p_session_id
      AND (
        s.target_listener_id IS NULL
        OR auth.uid() = s.target_listener_id
        OR auth.uid() = s.creator_profile_id
      )
  );
$$;
-- new function: can_read_clarity_session does not exist in any prior migration (grep) and is
-- absent from prod's pg_proc (checked 2026-09-01). Nothing is redefined here.

GRANT EXECUTE ON FUNCTION public.can_read_clarity_session(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Demo rounds are viewable by everyone" ON public.clarity_demo_rounds;
CREATE POLICY "Demo rounds follow their session's visibility"
  ON public.clarity_demo_rounds FOR SELECT TO anon, authenticated
  USING (can_read_clarity_session(session_id));

DROP POLICY IF EXISTS "Ideas are viewable by everyone" ON public.clarity_ideas;
CREATE POLICY "Ideas follow their session's visibility"
  ON public.clarity_ideas FOR SELECT TO anon, authenticated
  USING (can_read_clarity_session(session_id));

DROP POLICY IF EXISTS "Live turns are viewable by everyone" ON public.clarity_live_turns;
CREATE POLICY "Live turns follow their session's visibility"
  ON public.clarity_live_turns FOR SELECT TO anon, authenticated
  USING (can_read_clarity_session(session_id));

COMMENT ON FUNCTION public.can_read_clarity_session(uuid) IS
  'P1207 F10: the single source of truth for "may this caller see this session''s content". '
  'Child tables (demo_rounds, ideas, live_turns) call it instead of restating the parent rule, '
  'so the parent and its children cannot drift apart again — which is exactly how a directed '
  'session''s transcript became world-readable while its own row was correctly hidden.';
