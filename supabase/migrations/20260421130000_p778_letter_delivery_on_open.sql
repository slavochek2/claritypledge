-- new function
-- P778: SECURITY DEFINER RPC for authenticated one-to-many letter delivery on open.
--
-- Creates a letter_deliveries row with status='opened' when an authenticated
-- non-sender opens a public one-to-many letter link. Idempotent: re-opening
-- the same letter returns the existing row unchanged (including its current
-- status if it has advanced to in_progress or completed).
--
-- Returns the full row so the caller can read completed_at / status without
-- a second query.
--
-- Sibling to P707 (create_letter_delivery). Shared-helper extraction deferred
-- to avoid scope creep — see P778 spec for rationale.

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
      status, opened_at, completed_at, stories_rated
    )
    SELECT
      p_letter_id,
      v_reader_id,
      au.email,
      'opened',
      now(),
      NULL,
      0
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

REVOKE ALL ON FUNCTION create_letter_delivery_on_open FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_letter_delivery_on_open TO authenticated;
