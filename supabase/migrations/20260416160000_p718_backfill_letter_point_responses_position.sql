-- P718: Backfill letter_point_responses.position — convert numeric strings to PositionType labels
--
-- Root cause: confirm-letter-response edge function called String(p.position) on numeric
-- values from POSITION_VALUES map, storing "2" instead of "agree" in position TEXT column.
-- The results page casts position back to PositionType for display — "2" matches nothing,
-- so recipient positions appeared blank.
--
-- This migration converts all rows where position contains a numeric string (-3..3)
-- to the correct PositionType label. Rows already containing valid labels are untouched.
-- Idempotent: running twice produces the same result.

UPDATE letter_point_responses
SET position = CASE position
  WHEN '-3' THEN 'strongly_disagree'
  WHEN '-2' THEN 'disagree'
  WHEN '-1' THEN 'somewhat_disagree'
  WHEN '0'  THEN 'unsure'
  WHEN '1'  THEN 'somewhat_agree'
  WHEN '2'  THEN 'agree'
  WHEN '3'  THEN 'strongly_agree'
  ELSE position
END
WHERE position ~ '^-?[0-3]$';
