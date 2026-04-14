-- Fix existing rows where completed_at and status are out of sync,
-- then enforce the invariant with a CHECK constraint.

-- Fix rows where completed_at is set but status wasn't updated to 'completed'
UPDATE letter_deliveries
SET status = 'completed'
WHERE completed_at IS NOT NULL
  AND status != 'completed';

-- Fix rows where status='completed' but completed_at was never set
UPDATE letter_deliveries
SET completed_at = created_at
WHERE status = 'completed'
  AND completed_at IS NULL;

-- Now enforce: completed_at and status='completed' must be set together
ALTER TABLE letter_deliveries
  ADD CONSTRAINT completed_at_status_sync
  CHECK ((completed_at IS NULL) = (status != 'completed'));
