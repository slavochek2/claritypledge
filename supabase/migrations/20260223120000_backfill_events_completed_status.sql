-- Backfill: mark past events as completed
-- Events stuck in 'upcoming' status whose full duration has elapsed.
-- Root cause: no auto-complete mechanism existed; status was never set to 'completed'.
-- The query fix in getPastEvents() is the primary guard; this migration keeps DB state clean.

UPDATE events
SET status = 'completed'
WHERE status = 'upcoming'
  AND datetime + (duration_minutes * interval '1 minute') < NOW();
