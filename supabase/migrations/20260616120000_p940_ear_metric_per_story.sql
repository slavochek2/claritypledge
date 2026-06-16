-- P940: Redefine the "ear" metric.
-- diffed against: 20260312120000_fix_ear_count_trigger_security.sql
--
-- OLD: ears_count = number of DISTINCT speakers who rated this listener's explain-back
--      at >= 8/10 (accuracy_achieved). Deduped per (speaker_id, listener_id) pair, so a
--      single speaker rating the same listener 5 times counted as 1 ear.
--
-- NEW: ears_count = number of DISTINCT stories the listener was rated on, regardless of
--      score. An "attempt to verify" (the speaker rating the paraphrase) counts. Deduped
--      per story_id. Practice-volume signal, coherent with the listening-calibration
--      component (which counts every session). See features/p940_ear_metric_redefinition.md.
--
-- verification_session_count and stories.understood_count behavior are UNCHANGED.

-- Step 1: Recompute trigger function (idempotent recompute, not incremental).
-- Keeps SECURITY DEFINER + search_path from 20260312120000 so it can update both
-- profiles regardless of who inserts the verification (RLS would otherwise block it).
CREATE OR REPLACE FUNCTION update_profile_ears_count()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ears_count = distinct stories this listener has been rated on (any score).
  -- Recompute from source on every insert: idempotent, no dedup-state bookkeeping,
  -- no drift. NEW row is already visible (AFTER INSERT), so it is included.
  UPDATE profiles
  SET
    ears_count = (
      SELECT COUNT(DISTINCT story_id)
      FROM story_verifications
      WHERE listener_id = NEW.listener_id
        AND story_id IS NOT NULL
    ),
    verification_session_count = verification_session_count + 1
  WHERE id = NEW.listener_id;

  -- Speaker's session count (unchanged behavior).
  IF NEW.speaker_id != NEW.listener_id THEN
    UPDATE profiles
    SET verification_session_count = verification_session_count + 1
    WHERE id = NEW.speaker_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger definition is unchanged (AFTER INSERT, FOR EACH ROW) — only the function body
-- changed, so the existing trg_profile_ears_count keeps pointing at it. No re-create needed.

-- Step 2: Backfill ears_count for all existing profiles under the new definition.
-- Does NOT touch verification_session_count (its semantics are unchanged).
UPDATE profiles SET ears_count = 0;

UPDATE profiles p
SET ears_count = sub.cnt
FROM (
  SELECT listener_id, COUNT(DISTINCT story_id) AS cnt
  FROM story_verifications
  WHERE story_id IS NOT NULL
  GROUP BY listener_id
) sub
WHERE p.id = sub.listener_id;
