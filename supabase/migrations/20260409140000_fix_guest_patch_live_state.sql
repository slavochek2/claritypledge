-- P671: Fix guest writes to patch_live_state
--
-- Root cause: Guest users (anon role) cannot call patch_live_state because:
--   1. GRANT: RPC was only granted to `authenticated` — PostgREST blocks anon calls
--      before the function body runs.
--   2. WHERE: auth.uid() IS NULL for anon users; joiner_profile_id IS NULL for guests;
--      NULL = NULL is FALSE in PostgreSQL → UPDATE matches 0 rows.
--
-- Fix:
--   - Add guest OR branch: auth.uid() IS NULL AND joiner_profile_id IS NULL AND joiner_name IS NOT NULL
--   - GRANT EXECUTE to `anon` role
--   - Drop redundant auth re-check in second UPDATE (already inside SECURITY DEFINER;
--     session UUID guards access)
--
-- Security: Guest can only write to sessions where joiner_profile_id IS NULL AND
-- joiner_name IS NOT NULL (guest sessions only). Session UUID is v4 (122-bit entropy).
-- Equivalent access to what guests already have via direct table UPDATE (existing RLS).

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
    AND (
      creator_profile_id = auth.uid()
      OR joiner_profile_id = auth.uid()
      OR (
        auth.uid() IS NULL
        AND joiner_profile_id IS NULL
        AND joiner_name IS NOT NULL
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

GRANT EXECUTE ON FUNCTION patch_live_state(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION patch_live_state(uuid, jsonb) TO anon;
