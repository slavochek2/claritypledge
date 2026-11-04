-- Migration: P1604 (14/14) — restore main's canvas caps in _mirror_limits() next to the session reply reservation
-- Created: 2026-11-05
-- Spec: features/p1604_transcription_belongs_to_a_chat.md (rebase onto main: a function two branches both redefined)
-- Guaranteed by: src/tests/p1604-mirror-session-budget.test.ts (reads the newest _mirror_limits() definition)
--
-- diffed against: 20261030080000_p1536_v6_engine.sql (_mirror_limits: main's newest body, byte for byte, with ONE added key,
--   reply_session_max_usd = 0.225).
--   Why this file exists: 20261104150000_p1604_mirror_session_transcript.sql redefined _mirror_limits() from the P1547 body, written before
--   P1536's canvas keys (canvas_max_usd, extract_max_usd, person_canvas_*, global_canvas_*, and a $50.00 total) existed. Applied in
--   filename order after P1536's 20261029100100 and 20261030080000, it silently replaced them. This file is later than every P1536
--   migration, so it restores the combined body: main's caps plus the session reservation. Nothing else changes.
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
    'person_reply_daily_usd',    0.60,
    'person_reply_daily_count',  30,
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
    RAISE EXCEPTION 'P1604: _mirror_limits() must carry the canvas caps and both reply reservations';
  END IF;
END
$check$;
