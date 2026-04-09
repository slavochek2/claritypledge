-- P671: Server-side auto-reveal in patch_live_state
--
-- Closes the race condition where both clients read checkerSubmitted=false
-- before the other's write lands, so both write ratingPhase='waiting' and
-- neither ever advances to 'revealed'.
--
-- After the JSONB merge, atomically checks: if both checkerSubmitted and
-- responderSubmitted are true AND ratingPhase is still 'waiting', advances
-- to 'revealed'. This is the atomic floor — even when both clients race,
-- the server detects "both submitted" and advances.
--
-- Also preserves the auth guard from 20260403120100_security_fix_rpc_auth.sql.

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
    AND (creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid())
  RETURNING live_state INTO merged;

  IF merged IS NOT NULL
     AND (merged->>'checkerSubmitted')::boolean IS TRUE
     AND (merged->>'responderSubmitted')::boolean IS TRUE
     AND merged->>'ratingPhase' = 'waiting'
  THEN
    UPDATE clarity_sessions
    SET live_state = live_state || '{"ratingPhase": "revealed"}'::jsonb
    WHERE id = p_session_id
      AND (creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid());
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION patch_live_state(uuid, jsonb) TO authenticated;
