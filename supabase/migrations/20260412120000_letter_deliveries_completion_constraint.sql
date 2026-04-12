-- Enforce invariant: completed_at and status='completed' must be set together.
-- Neither can be set without the other. Prevents silent divergence between
-- the two completion signals on letter_deliveries.
ALTER TABLE letter_deliveries
  ADD CONSTRAINT completed_at_status_sync
  CHECK ((completed_at IS NULL) = (status != 'completed'));
