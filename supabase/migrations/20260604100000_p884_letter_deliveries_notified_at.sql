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

-- Backfill: stamp every existing delivery with a receiver_email. Two row
-- classes, same correct outcome:
--   1. Seal/add-recipient deliveries — already emailed at creation (both paths
--      invoked send-letter-emails immediately after insert). Without the
--      backfill, the next add-recipient would re-email every prior recipient.
--   2. P778 self-enrolled reader deliveries (create_letter_delivery_on_open,
--      status='opened') — never emailed and never should be: the reader opened
--      the letter themselves. Stamping marks them do-not-notify. The RPC itself
--      stamps at insert from the follow-up migration onward.
UPDATE letter_deliveries
SET notified_at = COALESCE(created_at, now())
WHERE receiver_email IS NOT NULL
  AND notified_at IS NULL;
