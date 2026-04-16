-- P721: Restore IF FOUND guard in submit_rating_by_token + repair dirty data
--
-- Root cause: P683/P684 rewrote submit_rating_by_token and lost the IF FOUND guard
-- that was introduced in P651. Without it, duplicate calls (retries, double-submits)
-- increment stories_rated unconditionally even when ON CONFLICT DO NOTHING is a no-op,
-- causing steps_completed > total_steps in the inbox.
--
-- Part A: Restore the guard (idempotent — CREATE OR REPLACE)
-- Part B: Repair existing dirty data

-- Part A: Restored function with IF FOUND guard
CREATE OR REPLACE FUNCTION submit_rating_by_token(
  p_token UUID,
  p_story_id UUID,
  p_rating INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_id UUID;
  v_letter_id   UUID;
  v_sender_id   UUID;
BEGIN
  -- Validate token + get sender + letter
  SELECT ld.id, cl.id, cl.sender_id INTO v_delivery_id, v_letter_id, v_sender_id
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RETURN false;
  END IF;

  -- P684: reject anonymous callers on one-to-many letters only
  IF (SELECT mode FROM clarity_letters WHERE id = v_letter_id) = 'one-to-many'
     AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required for one-to-many responses';
  END IF;

  -- Insert story verification (rating)
  -- Note: accuracy_achieved is GENERATED; session_id is FK to clarity_sessions (NULL for letters)
  INSERT INTO story_verifications (
    story_id, version_id, speaker_id, listener_id,
    listener_rating, speaker_rating,
    source, verified, session_id
  ) VALUES (
    p_story_id,
    (SELECT version_id FROM letter_story_snapshots WHERE letter_id = v_letter_id AND story_id = p_story_id LIMIT 1),
    v_sender_id,
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    p_rating, 0,
    'letter', false, NULL
  )
  ON CONFLICT DO NOTHING;

  -- P721: Only increment counter if a row was actually inserted.
  -- Without this guard, duplicate calls (retries, double-submits) inflate
  -- stories_rated past the real story count, producing "9 of 8 steps" in the inbox.
  IF FOUND THEN
    UPDATE letter_deliveries
    SET stories_rated = stories_rated + 1
    WHERE id = v_delivery_id;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_rating_by_token(UUID, UUID, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION submit_rating_by_token(UUID, UUID, INTEGER) TO authenticated;

-- Part B: Repair dirty data — reset stories_rated to actual distinct rated story count
-- for any delivery where it exceeds the number of stories in the letter.
UPDATE letter_deliveries ld
SET stories_rated = (
  SELECT COUNT(DISTINCT sv.story_id)
  FROM story_verifications sv
  JOIN letter_story_snapshots lss
    ON lss.story_id = sv.story_id
    AND lss.letter_id = ld.letter_id
  WHERE sv.listener_id = COALESCE(ld.receiver_profile_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND sv.source = 'letter'
)
WHERE ld.stories_rated > (
  SELECT COUNT(*)
  FROM letter_story_snapshots
  WHERE letter_id = ld.letter_id
);
