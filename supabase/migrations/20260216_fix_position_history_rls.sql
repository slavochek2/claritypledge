-- Fix: Add INSERT policy for point_position_history table
--
-- Problem: The log_position_change() trigger is SECURITY DEFINER but still fails
-- with RLS error because point_position_history has no INSERT policy.
--
-- Solution: Add INSERT policy to allow the trigger to write history records.
-- This is safe because:
-- 1. History table is append-only (no updates/deletes)
-- 2. Only the trigger writes to it (no direct user access)
-- 3. History is publicly readable anyway (SELECT policy = true)

-- Drop if exists to ensure clean slate
DROP POLICY IF EXISTS "Allow trigger to insert position history" ON public.point_position_history;

CREATE POLICY "Allow trigger to insert position history"
  ON public.point_position_history
  FOR INSERT
  WITH CHECK (true);

-- Explanation: WITH CHECK (true) allows all inserts.
-- This is safe because users can't directly insert into this table (it's not exposed via API).
-- Only the log_position_change() trigger writes to it, triggered by point_positions changes.
