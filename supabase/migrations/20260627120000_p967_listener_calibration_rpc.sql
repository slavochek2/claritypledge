-- P967: Listening Calibration Breakdown
-- new function
--
-- Creates get_my_listener_calibration_diffs() — a SECURITY DEFINER RPC that
-- returns the calling user's listener calibration rows with partner metadata.
--
-- Security contract (all four are mandatory):
--   (a) SECURITY DEFINER + SET search_path = public
--   (b) No parameters — identity from auth.uid() only, never a client-supplied id
--   (c) WHERE listener_id = auth.uid() AND speaker_rating IS NOT NULL AND listener_rating IS NOT NULL
--       (auth filter + eligibility filter: matches get_my_listener_calibration_diffs WHERE clause)
--   (d) GRANT EXECUTE TO authenticated only, never anon

CREATE OR REPLACE FUNCTION get_my_listener_calibration_diffs()
RETURNS TABLE (
  id             UUID,
  story_id       UUID,
  listener_rating SMALLINT,
  speaker_rating  SMALLINT,
  speaker_name   TEXT,
  speaker_slug   TEXT,
  story_title    TEXT,
  created_at     TIMESTAMPTZ,
  sort_order     INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sv.id,
    sv.story_id,
    sv.listener_rating,
    sv.speaker_rating,
    p.name::TEXT       AS speaker_name,
    p.slug::TEXT       AS speaker_slug,
    NULL::TEXT         AS story_title,
    sv.created_at,
    sv.sort_order
  FROM story_verifications sv
  JOIN profiles p ON p.id = sv.speaker_id
  LEFT JOIN stories s ON s.id = sv.story_id
  WHERE sv.listener_id = auth.uid()
    AND sv.speaker_rating IS NOT NULL
    AND sv.listener_rating IS NOT NULL
    -- eligibility: matches get_my_listener_calibration_diffs WHERE clause
  ORDER BY sv.created_at DESC;
$$;

-- Grant to authenticated only — anon receives permission denied (fail-closed)
GRANT EXECUTE ON FUNCTION get_my_listener_calibration_diffs() TO authenticated;
