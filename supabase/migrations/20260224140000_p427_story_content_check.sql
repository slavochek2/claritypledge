-- P427: Add CHECK constraint to stories.content (max 10,000 chars)
-- Security review flagged absence of DB-level content length constraint as Medium severity.
-- Idempotent: no-op if constraint already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stories_content_length_check'
    AND conrelid = 'stories'::regclass
  ) THEN
    ALTER TABLE stories
      ADD CONSTRAINT stories_content_length_check
        CHECK (char_length(content) <= 10000);
  END IF;
END $$;
