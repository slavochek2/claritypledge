-- P884: Adding a recipient to a sealed letter re-sent invitation emails to ALL
-- previous recipients. send-letter-emails fetched every delivery with a
-- receiver_email (no already-notified filter) on every invoke.
--
-- Fix foundation: track notification state on the delivery row itself so the
-- edge function is idempotent — it claims un-notified rows atomically
-- (UPDATE ... WHERE notified_at IS NULL) before sending, and skips the rest.
-- Covers both the add-recipient re-send and duplicate letter-wide invokes
-- (double-click seal / network retry).

ALTER TABLE letter_deliveries ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

COMMENT ON COLUMN letter_deliveries.notified_at IS
  'P884: when the invitation email for this delivery was sent (claimed atomically by send-letter-emails). NULL = not yet notified.';

-- Backfill: every existing delivery with a receiver_email was already emailed
-- at creation time — both creation paths (seal + add-recipient) invoked
-- send-letter-emails letter-wide immediately after inserting the row. Without
-- this backfill, the next add-recipient on an existing letter would re-email
-- every prior recipient one final time.
UPDATE letter_deliveries
SET notified_at = COALESCE(created_at, now())
WHERE receiver_email IS NOT NULL
  AND notified_at IS NULL;
