-- P707: SECURITY DEFINER RPC for authenticated one-to-many letter delivery
--
-- letter_deliveries has WITH CHECK(false) RLS — all client inserts are blocked.
-- This function runs as the function owner (bypasses RLS) and is the only
-- permitted insert path for authenticated recipients.
--
-- One-to-one path uses UPDATE on a pre-existing invitation row — do NOT use
-- this function for that path.

-- Deduplicate any existing rows before creating the unique index.
-- Keeps the most recent delivery per (letter_id, receiver_profile_id) pair.
-- Only deletes rows that have no FK children — avoids cascading data loss on
-- letter_point_responses and letter_predictions (both have ON DELETE CASCADE).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY letter_id, receiver_profile_id
           ORDER BY created_at DESC NULLS LAST
         ) AS rn
  FROM letter_deliveries
  WHERE receiver_profile_id IS NOT NULL
)
DELETE FROM letter_deliveries
WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
  AND NOT EXISTS (
    SELECT 1 FROM letter_point_responses WHERE delivery_id = letter_deliveries.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM letter_predictions WHERE delivery_id = letter_deliveries.id
  );

-- Unique index: prevent duplicate deliveries for the same authenticated recipient.
-- Also acts as an idempotency guard against double-submits and race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_letter_deliveries_one_per_recipient
  ON letter_deliveries (letter_id, receiver_profile_id)
  WHERE receiver_profile_id IS NOT NULL;

-- SECURITY DEFINER RPC: creates a letter_delivery row for an authenticated recipient.
-- Idempotent: returns existing delivery_id if recipient already submitted.
CREATE OR REPLACE FUNCTION create_letter_delivery(
  p_letter_id UUID,
  p_stories_rated INT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_id UUID;
  v_recipient_id UUID;
  v_sender_id UUID;
BEGIN
  v_recipient_id := auth.uid();
  IF v_recipient_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Idempotency: return existing delivery if recipient already submitted
  SELECT id INTO v_delivery_id
  FROM letter_deliveries
  WHERE letter_id = p_letter_id AND receiver_profile_id = v_recipient_id
  LIMIT 1;

  IF FOUND THEN
    RETURN v_delivery_id;
  END IF;

  -- Guard: letter must exist and caller must not be the sender
  SELECT sender_id INTO v_sender_id FROM clarity_letters WHERE id = p_letter_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Letter not found';
  END IF;

  IF v_sender_id = v_recipient_id THEN
    RAISE EXCEPTION 'Sender cannot submit a response to their own letter';
  END IF;

  INSERT INTO letter_deliveries (
    letter_id, receiver_profile_id, receiver_email,
    status, completed_at, stories_rated
  )
  SELECT
    p_letter_id,
    v_recipient_id,
    au.email,
    'completed',
    now(),
    p_stories_rated
  FROM auth.users au
  WHERE au.id = v_recipient_id
  RETURNING id INTO v_delivery_id;

  RETURN v_delivery_id;

EXCEPTION
  -- Concurrent double-submit: another request raced past the SELECT above and
  -- inserted first. Re-SELECT to return the existing row idempotently.
  WHEN unique_violation THEN
    SELECT id INTO v_delivery_id
    FROM letter_deliveries
    WHERE letter_id = p_letter_id AND receiver_profile_id = v_recipient_id
    LIMIT 1;
    RETURN v_delivery_id;
END;
$$;

REVOKE ALL ON FUNCTION create_letter_delivery FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_letter_delivery TO authenticated;
