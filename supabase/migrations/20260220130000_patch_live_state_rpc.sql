-- P399: Atomic partial merge for live_state JSON column
--
-- Prevents the full-overwrite race condition where a participant with a stale
-- confirmedLiveStateRef accidentally clears selectedStoryData (and other fields)
-- written by their partner. The jsonb || operator merges only the provided patch
-- keys, leaving all other live_state keys intact.
--
-- Called by patchClaritySessionLiveState() in api.ts for partial writes
-- (ratings, celebrationAcknowledgedBy, etc.) that must not touch story fields.

CREATE OR REPLACE FUNCTION patch_live_state(
  p_session_id uuid,
  p_patch      jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE clarity_sessions
  SET live_state = COALESCE(live_state, '{}'::jsonb) || p_patch
  WHERE id = p_session_id;
END;
$$;
