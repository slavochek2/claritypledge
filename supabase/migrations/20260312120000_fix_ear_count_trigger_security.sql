-- Fix: Add SECURITY DEFINER to ear count trigger so it can update
-- both speaker and listener profiles regardless of who inserts the verification.
-- Without this, RLS on profiles (auth.uid() = id) silently blocks cross-user updates.

-- Also backfill ears_count and verification_session_count from actual data,
-- since the old trigger silently dropped updates for the non-inserting user.

-- Step 1: Recreate trigger function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION update_profile_ears_count()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.accuracy_achieved THEN
    -- Only increment ears_count if this is the first successful verification
    -- for this specific speaker-listener pair (distinct listeners)
    IF NOT EXISTS (
      SELECT 1 FROM story_verifications
      WHERE speaker_id = NEW.speaker_id
        AND listener_id = NEW.listener_id
        AND accuracy_achieved = true
        AND id != NEW.id
    ) THEN
      UPDATE profiles
      SET
        ears_count = ears_count + 1,
        verification_session_count = verification_session_count + 1
      WHERE id = NEW.listener_id;
    ELSE
      -- Already counted this listener, just increment session count
      UPDATE profiles
      SET verification_session_count = verification_session_count + 1
      WHERE id = NEW.listener_id;
    END IF;
  ELSE
    -- Still count the session even if accuracy not achieved
    UPDATE profiles
    SET verification_session_count = verification_session_count + 1
    WHERE id = NEW.listener_id;
  END IF;

  -- Also increment speaker's session count
  IF NEW.speaker_id != NEW.listener_id THEN
    UPDATE profiles
    SET verification_session_count = verification_session_count + 1
    WHERE id = NEW.speaker_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Backfill ears_count from actual story_verifications data.
-- Reset to 0 first, then recompute from verified distinct speaker-listener pairs.
UPDATE profiles SET ears_count = 0, verification_session_count = 0;

-- Backfill verification_session_count: count all verifications where user was listener
UPDATE profiles p
SET verification_session_count = sub.cnt
FROM (
  SELECT listener_id, COUNT(*) AS cnt
  FROM story_verifications
  GROUP BY listener_id
) sub
WHERE p.id = sub.listener_id;

-- Add speaker session counts
UPDATE profiles p
SET verification_session_count = verification_session_count + sub.cnt
FROM (
  SELECT speaker_id, COUNT(*) AS cnt
  FROM story_verifications
  WHERE speaker_id != listener_id
  GROUP BY speaker_id
) sub
WHERE p.id = sub.speaker_id;

-- Backfill ears_count: count distinct speakers who gave accuracy_achieved=true to this listener
UPDATE profiles p
SET ears_count = sub.cnt
FROM (
  SELECT listener_id, COUNT(DISTINCT speaker_id) AS cnt
  FROM story_verifications
  WHERE accuracy_achieved = true
  GROUP BY listener_id
) sub
WHERE p.id = sub.listener_id;
