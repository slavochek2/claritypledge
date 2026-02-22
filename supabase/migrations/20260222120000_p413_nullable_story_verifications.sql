-- P413: Count any completed paraphrase exchange toward calibration
-- Make story_id and version_id nullable so verifications can be recorded
-- without a formal story (loose paraphrase exchanges in /live sessions).
-- The DB trigger already increments verification_session_count unconditionally.

ALTER TABLE story_verifications
  ALTER COLUMN story_id DROP NOT NULL,
  ALTER COLUMN version_id DROP NOT NULL;

-- Guard the story understood_count trigger against null story_id
CREATE OR REPLACE FUNCTION update_story_understood_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.story_id IS NULL THEN
    RETURN NEW;
  END IF;
  UPDATE stories
  SET understood_count = (
    SELECT COUNT(DISTINCT listener_id)
    FROM story_verifications
    WHERE story_id = NEW.story_id AND accuracy_achieved = true
  )
  WHERE id = NEW.story_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
