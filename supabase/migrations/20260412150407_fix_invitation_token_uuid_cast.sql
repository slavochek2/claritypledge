-- Fix: invitation_token column is UUID, not TEXT.
-- The ::text cast in the INSERT caused "column 'invitation_token' is of type uuid
-- but expression is of type text" on every add-recipient call.
-- Bug present since P660, inherited by P664.

CREATE OR REPLACE FUNCTION add_recipient_to_sealed_letter(
  p_letter_id UUID,
  p_email TEXT,
  p_receiver_name TEXT DEFAULT NULL
)
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

  -- Create delivery (includes receiver_name when provided)
  INSERT INTO letter_deliveries (letter_id, receiver_email, receiver_name, status, invitation_token, invitation_expires_at)
  VALUES (
    p_letter_id,
    p_email,
    p_receiver_name,
    'sent',
    gen_random_uuid(),
    now() + interval '30 days'
  )
  RETURNING id INTO v_delivery_id;

  RETURN v_delivery_id;
END;
$$;
