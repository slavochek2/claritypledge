-- P671: Auto-reveal when both participants have submitted ratings.
--
-- Upgrades patch_live_state() with an atomic floor: after the JSONB merge,
-- if checkerSubmitted=true AND responderSubmitted=true AND ratingPhase='waiting',
-- the server advances ratingPhase to 'revealed' in the same transaction.
--
-- This eliminates the race where both clients independently write ratingPhase='waiting'
-- (their own submission), then each waits for the other's Realtime event to flip to
-- 'revealed'. The server now guarantees the flip atomically.
--
-- Auth guard: only session participants (creator or joiner) may call this function.

CREATE OR REPLACE FUNCTION patch_live_state(
  p_session_id uuid,
  p_patch      jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merged jsonb;
BEGIN
  -- Auth guard: caller must be creator or joiner of this session
  IF NOT EXISTS (
    SELECT 1 FROM clarity_sessions
    WHERE id = p_session_id
      AND (creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE clarity_sessions
  SET live_state = (
    SELECT
      CASE
        WHEN (merged->>'checkerSubmitted')::boolean = true
          AND (merged->>'responderSubmitted')::boolean = true
          AND merged->>'ratingPhase' = 'waiting'
        THEN merged || '{"ratingPhase":"revealed"}'::jsonb
        ELSE merged
      END
    FROM (SELECT COALESCE(live_state, '{}'::jsonb) || p_patch AS merged) sub
  )
  WHERE id = p_session_id;
END;
$$;
