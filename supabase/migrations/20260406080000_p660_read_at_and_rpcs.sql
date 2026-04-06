-- P660: Letters Navigation Architecture — read_at column + RPCs
-- Adds inbox read/unread state and two SECURITY DEFINER RPCs for:
-- 1. Marking inbox items as read (sender or receiver)
-- 2. Adding recipients to sealed letters (sender only)

-- ============================================================================
-- 1. Add read_at column to letter_deliveries
-- ============================================================================

ALTER TABLE letter_deliveries
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Index for badge count query: unread deliveries for a user
CREATE INDEX IF NOT EXISTS idx_letter_deliveries_receiver_read_at
  ON letter_deliveries (receiver_profile_id, read_at)
  WHERE read_at IS NULL;

-- ============================================================================
-- 2. RPC: mark_inbox_item_read
-- ============================================================================
-- Validates caller is either the receiver OR the sender of the parent letter.
-- Sets read_at = now() if not already set. Idempotent.

CREATE OR REPLACE FUNCTION mark_inbox_item_read(p_delivery_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receiver_profile_id UUID;
  v_sender_id UUID;
BEGIN
  -- Look up delivery + parent letter sender
  SELECT
    d.receiver_profile_id,
    l.sender_id
  INTO v_receiver_profile_id, v_sender_id
  FROM letter_deliveries d
  JOIN clarity_letters l ON l.id = d.letter_id
  WHERE d.id = p_delivery_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found' USING ERRCODE = 'P0002';
  END IF;

  -- Authorize: must be receiver or sender
  IF auth.uid() IS DISTINCT FROM v_receiver_profile_id
     AND auth.uid() IS DISTINCT FROM v_sender_id THEN
    RAISE EXCEPTION 'Not authorized to mark this item as read' USING ERRCODE = '42501';
  END IF;

  -- Idempotent: only set if not already read
  UPDATE letter_deliveries
    SET read_at = now()
    WHERE id = p_delivery_id
      AND read_at IS NULL;
END;
$$;

-- ============================================================================
-- 3. RPC: add_recipient_to_sealed_letter
-- ============================================================================
-- Validates: caller is sender, letter is sealed, email is valid format.
-- Creates a new delivery row with status 'sent'.

CREATE OR REPLACE FUNCTION add_recipient_to_sealed_letter(p_letter_id UUID, p_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id UUID;
  v_status TEXT;
  v_delivery_id UUID;
BEGIN
  -- Validate letter exists and get sender + status
  SELECT sender_id, status
  INTO v_sender_id, v_status
  FROM clarity_letters
  WHERE id = p_letter_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Letter not found' USING ERRCODE = 'P0002';
  END IF;

  -- Must be the sender
  IF auth.uid() IS DISTINCT FROM v_sender_id THEN
    RAISE EXCEPTION 'Only the letter sender can add recipients' USING ERRCODE = '42501';
  END IF;

  -- Must be sealed
  IF v_status != 'sealed' THEN
    RAISE EXCEPTION 'Can only add recipients to sealed letters' USING ERRCODE = 'P0001';
  END IF;

  -- Validate email format (basic check)
  IF p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid email format' USING ERRCODE = 'P0001';
  END IF;

  -- Create delivery
  INSERT INTO letter_deliveries (letter_id, receiver_email, status, invitation_token, invitation_expires_at)
  VALUES (
    p_letter_id,
    p_email,
    'sent',
    gen_random_uuid()::text,
    now() + interval '30 days'
  )
  RETURNING id INTO v_delivery_id;

  RETURN v_delivery_id;
END;
$$;
