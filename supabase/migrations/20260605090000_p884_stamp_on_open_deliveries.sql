-- diffed against: 20260421130000_p778_letter_delivery_on_open.sql
--
-- P884 (follow-up to 20260604100000): P778 self-enrolled reader deliveries
-- must never receive an invitation email.
--
-- create_letter_delivery_on_open inserts a delivery with receiver_email when an
-- authenticated reader opens a public one-to-many letter. Post-P884,
-- send-letter-emails emails every delivery with notified_at IS NULL — so a row
-- created by this RPC would get ONE unsolicited "invitation" email the next
-- time the sender adds a recipient. Fix: stamp notified_at at insert time
-- (the reader self-enrolled; there is nothing to notify them about).
--
-- Function body otherwise identical to 20260421130000_p778_letter_delivery_on_open.sql.

CREATE OR REPLACE FUNCTION create_letter_delivery_on_open(
  p_letter_id UUID
)
RETURNS SETOF letter_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reader_id UUID;
  v_sender_id UUID;
BEGIN
  v_reader_id := auth.uid();
  IF v_reader_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Idempotency: return existing delivery if reader already has one
  -- (status may have advanced to in_progress or completed — return as-is)
  IF EXISTS (
    SELECT 1 FROM letter_deliveries
    WHERE letter_id = p_letter_id AND receiver_profile_id = v_reader_id
  ) THEN
    RETURN QUERY
      SELECT * FROM letter_deliveries
      WHERE letter_id = p_letter_id AND receiver_profile_id = v_reader_id
      LIMIT 1;
    RETURN;
  END IF;

  -- Guard: letter must be a sealed one-to-many letter and caller must not be the sender
  SELECT sender_id INTO v_sender_id
  FROM clarity_letters
  WHERE id = p_letter_id
    AND status = 'sealed'
    AND mode = 'one-to-many';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Letter not accessible';
  END IF;

  IF v_sender_id = v_reader_id THEN
    RAISE EXCEPTION 'Sender cannot open their own letter as a reader';
  END IF;

  RETURN QUERY
    INSERT INTO letter_deliveries (
      letter_id, receiver_profile_id, receiver_email,
      status, opened_at, completed_at, stories_rated,
      notified_at  -- P884: do-not-notify — the reader opened the letter themselves
    )
    SELECT
      p_letter_id,
      v_reader_id,
      au.email,
      'opened',
      now(),
      NULL,
      0,
      now()
    FROM auth.users au
    WHERE au.id = v_reader_id
    RETURNING *;

EXCEPTION
  -- Concurrent double-open: another request inserted first — return the existing row.
  WHEN unique_violation THEN
    RETURN QUERY
      SELECT * FROM letter_deliveries
      WHERE letter_id = p_letter_id AND receiver_profile_id = v_reader_id
      LIMIT 1;
END;
$$;

-- CREATE OR REPLACE with an unchanged signature preserves existing privileges
-- (REVOKE PUBLIC / GRANT authenticated from 20260421130000) — no re-grant needed.

-- Catch-up: stamp any on-open delivery created between the 20260604100000
-- backfill and this migration (test env only — on prod both migrations apply
-- in the same deploy). Narrow predicate: only P778-shaped rows (self-enrolled
-- readers), so legitimately unsent invitation deliveries are never swept.
UPDATE letter_deliveries
SET notified_at = COALESCE(opened_at, now())
WHERE status = 'opened'
  AND receiver_profile_id IS NOT NULL
  AND receiver_email IS NOT NULL
  AND notified_at IS NULL
  AND opened_at IS NOT NULL;
