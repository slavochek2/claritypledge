-- P677: Fix position history trigger blocked by RLS
--
-- Two compounding bugs prevented positions from persisting:
--
--   Bug 1: log_position_change() lost SECURITY DEFINER on live DB (likely stripped by
--          db push). The trigger runs as the calling user and hits RLS on
--          point_position_history.
--
--   Bug 2: point_position_history INSERT policy has WITH CHECK (false), added in the
--          Apr 3 security migration on the assumption the trigger would bypass RLS via
--          SECURITY DEFINER. With Bug 1, it cannot.
--
-- Fix: Belt-and-suspenders — restore SECURITY DEFINER AND relax the INSERT policy.
-- Either fix alone is now sufficient if the other regresses.

-- ============================================================================
-- Fix 1: Re-create log_position_change() with SECURITY DEFINER
-- Identical body to original (20260204_stories_points_calibration.sql).
-- ============================================================================
CREATE OR REPLACE FUNCTION log_position_change()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO point_position_history (point_id, user_id, position, reasoning)
    VALUES (NEW.point_id, NEW.user_id, NEW.position, NEW.reasoning);
  ELSIF TG_OP = 'UPDATE' AND (OLD.position IS DISTINCT FROM NEW.position OR OLD.reasoning IS DISTINCT FROM NEW.reasoning) THEN
    INSERT INTO point_position_history (point_id, user_id, position, reasoning)
    VALUES (NEW.point_id, NEW.user_id, NEW.position, NEW.reasoning);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO point_position_history (point_id, user_id, position, reasoning)
    VALUES (OLD.point_id, OLD.user_id, NULL, NULL);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Fix 2: Change point_position_history INSERT policy from WITH CHECK (false)
-- to WITH CHECK (auth.uid() = user_id).
--
-- WITH CHECK (false) was intended to block direct client inserts while allowing
-- the SECURITY DEFINER trigger to bypass RLS. In practice, WITH CHECK (false)
-- blocks every INSERT — including the trigger when SECURITY DEFINER is missing.
--
-- WITH CHECK (auth.uid() = user_id) still prevents a user from fabricating
-- history for another user while allowing the trigger to insert correctly.
-- ============================================================================
DROP POLICY IF EXISTS "Allow trigger to insert position history" ON point_position_history;

CREATE POLICY "Allow trigger to insert position history"
  ON point_position_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);
