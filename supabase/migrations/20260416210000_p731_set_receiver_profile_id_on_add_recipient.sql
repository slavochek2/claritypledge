-- P731: Set receiver_profile_id at delivery insert time when recipient is a known user.
--
-- Housekeeping: P660 created a 2-param overload (p_letter_id, p_email). P664 added
-- p_receiver_name (3-param) via CREATE OR REPLACE — which creates a new overload rather
-- than replacing, because the signature changed. Both exist in the DB and cause "could not
-- choose best candidate" errors when calling with 2 named params. Drop the stale overload.
--
-- Bug: add_recipient_to_sealed_letter created letter_deliveries with receiver_profile_id=NULL.
-- get_inbox_items Branch 1 filters on receiver_profile_id=v_user_id, so the letter was
-- invisible in the recipient's inbox until claim_letter_delivery set receiver_profile_id
-- (only called when the recipient opened via the email link).
--
-- Fix: look up profiles.id by p_email before inserting. If found, set receiver_profile_id
-- so the delivery is visible in the inbox on the very next poll.

DROP FUNCTION IF EXISTS add_recipient_to_sealed_letter(UUID, TEXT);

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
  v_sender_id          UUID;
  v_status             TEXT;
  v_delivery_id        UUID;
  v_receiver_profile_id UUID;
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

  -- Look up profile by email so the delivery is immediately visible in inbox
  SELECT id INTO v_receiver_profile_id
  FROM profiles
  WHERE email = p_email
  LIMIT 1;

  INSERT INTO letter_deliveries (
    letter_id,
    receiver_email,
    receiver_name,
    receiver_profile_id,
    status,
    invitation_token,
    invitation_expires_at
  )
  VALUES (
    p_letter_id,
    p_email,
    p_receiver_name,
    v_receiver_profile_id,
    'sent',
    gen_random_uuid(),
    now() + interval '30 days'
  )
  RETURNING id INTO v_delivery_id;

  RETURN v_delivery_id;
END;
$$;
