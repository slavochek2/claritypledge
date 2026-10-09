-- diffed against: 20260415160000_p707_create_letter_delivery_rpc.sql
--
-- P1321 (definer-function review, lead L1): create_letter_delivery(uuid, int) enrolled its caller
-- as the receiver of ANY letter whose id they supplied — its only guards were "the letter exists"
-- and "you are not the sender". A delivery row is what makes someone a letter's receiver, so a
-- signed-in caller who knew a letter id could enrol themselves on a draft or on a private
-- one-to-one letter.
--
-- Its only caller is the signed-in reader of a PUBLIC letter (letters-service.ts
-- submitLetterResponseAuthenticated, reached from the ready_public reading flow and from the
-- signup page's buffered one-to-many draft). One-to-one receivers are invited — their delivery
-- row already exists and is updated, never created here (see the P707 header). So the function
-- now refuses anything but a sealed one-to-many letter, the same guard
-- create_letter_delivery_on_open has carried since P778.
--
-- The idempotency return stays BEFORE the guard on purpose: a reader who already holds a
-- delivery (e.g. the letter later expired) gets their existing row back, never a new one.
--
-- Function body otherwise identical to 20260415160000. CREATE OR REPLACE with an unchanged
-- signature preserves the existing ACL (no PUBLIC/anon EXECUTE since P1063).

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

  -- Guard: only a sealed one-to-many (public) letter enrols a new reader (P1321 L1)
  SELECT sender_id INTO v_sender_id
  FROM clarity_letters
  WHERE id = p_letter_id
    AND status = 'sealed'
    AND mode = 'one-to-many';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Letter not accessible';
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
