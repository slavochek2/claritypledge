-- P132: Add composite index for efficient position lookups
-- This optimizes the batch fetching queries for user positions and position counts

-- Composite index for user position lookup (point_id, user_id)
-- This makes "WHERE point_id IN (...) AND user_id = ?" queries faster
CREATE INDEX IF NOT EXISTS idx_point_positions_point_user
  ON point_positions(point_id, user_id);

-- Note: The existing idx_positions_point index is sufficient for position count aggregation
-- No need for additional indexes since we're not using soft-delete (no WHERE deleted_at IS NULL)
