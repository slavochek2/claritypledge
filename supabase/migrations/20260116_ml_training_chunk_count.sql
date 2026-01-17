-- Add chunk_count column to ml_training_sessions for better tracking
-- Each chunk is 30 seconds of audio

ALTER TABLE ml_training_sessions
ADD COLUMN IF NOT EXISTS chunk_count INTEGER;

-- Add comments explaining the columns
COMMENT ON COLUMN ml_training_sessions.chunk_count IS 'Number of 30-second audio chunks uploaded';
COMMENT ON COLUMN ml_training_sessions.duration_ms IS 'Estimated duration in milliseconds (chunk_count * 30000)';
