-- Migration: P1604 (15/15) — the founder raised the per-person daily reply allowance
-- Created: 2026-11-05
-- Spec: features/p1604_transcription_belongs_to_a_chat.md (Cost Budget: the figures are kept private)
-- Guaranteed by: src/tests/p1604-mirror-session-budget.test.ts (pins this body against 20261105000000, line by line)
--
-- diffed against: 20261105000000_p1604_mirror_limits_with_canvas.sql (_mirror_limits: that body, byte for byte, with exactly two values
--   changed: person_reply_daily_usd and person_reply_daily_count, each raised, at the founder's request so a whole-transcript Clarify
--   fits the day. Nothing else changes; in particular the shared reply cap (global_reply_daily_usd), the total, the canvas caps and both
--   per-reply reservations are untouched. One heavy user can now reach 40% of the shared reply cap; that is noted, not changed here.)
--
-- client-safe: function body only (service-role-only JSON).

CREATE OR REPLACE FUNCTION public._mirror_limits()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'reply_max_usd',             0.105,   -- (50000 in x $1.50 + 1200 out x $7.50) / 1e6 x 1.25; mirror-agent.ts BUDGET_TOKENS/MAX_OUT_TOKENS
    -- P1604: a Clarified session thread (a whole transcript). (100000 in x $1.50 + 4000 out x $7.50) / 1e6 x 1.25; mirror-agent.ts SESSION_*
    'reply_session_max_usd',     0.225,
    'portrait_max_usd',          0.70,    -- 2 generations x (primary + fallback image) + 2 vision checks, x 1.25
    'person_reply_daily_usd',    2.00,
    'person_reply_daily_count',  75,
    'person_portrait_daily_usd', 2.10,
    'person_portrait_daily_count', 3,
    'global_reply_daily_usd',    5.00,
    'global_portrait_daily_usd', 6.00,
    -- P1536 canvas drafts. canvas_max_usd = (63,000 in x $1.50 + 16,000 out x $7.50) / 1e6 x 1.25 (the mirror's
    -- reservation prices, not the registry's lower ones). extract_max_usd: one extraction call of a file.
    'canvas_max_usd',            0.27,
    'extract_max_usd',           0.35,
    'person_canvas_daily_usd',   6.00,
    'person_canvas_daily_count', 60,
    'global_canvas_daily_usd',   45.00,
    -- Founder 2026-10-29 (D18): per person 60 runs and $6.00 a day, shared canvas bucket $45.00 a day. Chat replies keep
    -- their own $5.00 (global_reply_daily_usd) and the total stays at $50.00 a day (founder 2026-10-27).
    'global_total_daily_usd',    50.00
  );
$$;

REVOKE ALL ON FUNCTION public._mirror_limits() FROM PUBLIC, anon, authenticated;

DO $check$
BEGIN
  IF (public._mirror_limits() ->> 'canvas_max_usd') IS NULL OR (public._mirror_limits() ->> 'reply_session_max_usd') IS NULL
     OR (public._mirror_limits() ->> 'reply_max_usd')::numeric <> 0.105 THEN
    RAISE EXCEPTION 'P1604: _mirror_limits() must still carry the canvas caps and both reply reservations';
  END IF;
END
$check$;
