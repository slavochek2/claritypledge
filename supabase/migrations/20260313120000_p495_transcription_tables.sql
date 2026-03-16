-- P495: Automatic Live Session Transcription with Speaker Labels
-- Creates three tables: session_transcripts, transcription_jobs, user_voice_profiles
-- Plus RLS policies, triggers, and the retry_transcription RPC.

-- ============================================================================
-- 0. pgvector extension (for speaker embeddings)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- 1. session_transcripts — stores final transcripts per session
-- ============================================================================
CREATE TABLE IF NOT EXISTS session_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES clarity_sessions(id) ON DELETE CASCADE,
  session_code TEXT,
  language TEXT,
  segments JSONB NOT NULL DEFAULT '[]'::jsonb,
  speaker_map JSONB,
  model_version TEXT,
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_transcripts_session_id
  ON session_transcripts(session_id);

-- ============================================================================
-- 2. transcription_jobs — tracks async transcription pipeline status
-- ============================================================================
CREATE TABLE IF NOT EXISTS transcription_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code TEXT NOT NULL,
  session_id UUID NOT NULL REFERENCES clarity_sessions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transcription_jobs_session_id
  ON transcription_jobs(session_id);

-- ============================================================================
-- 3. user_voice_profiles — speaker identification embeddings
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_voice_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  embedding VECTOR(512),
  session_count INTEGER NOT NULL DEFAULT 1,
  last_session_id UUID REFERENCES clarity_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- CHECK constraint on embedding dimension is implicit from VECTOR(512)

-- ============================================================================
-- 4. RLS Policies
-- ============================================================================
ALTER TABLE session_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcription_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_voice_profiles ENABLE ROW LEVEL SECURITY;

-- session_transcripts: participant-only SELECT
CREATE POLICY "Participants can read session transcripts"
  ON session_transcripts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clarity_sessions cs
      WHERE cs.id = session_transcripts.session_id
        AND (cs.creator_profile_id = auth.uid() OR cs.joiner_profile_id = auth.uid())
    )
  );

-- session_transcripts: service_role-only INSERT/UPDATE/DELETE (no user policies for writes)
-- By enabling RLS and not granting any INSERT/UPDATE/DELETE policies to authenticated users,
-- only service_role (which bypasses RLS) can write.

-- transcription_jobs: participant-only SELECT
CREATE POLICY "Participants can read transcription jobs"
  ON transcription_jobs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clarity_sessions cs
      WHERE cs.id = transcription_jobs.session_id
        AND (cs.creator_profile_id = auth.uid() OR cs.joiner_profile_id = auth.uid())
    )
  );

-- transcription_jobs: service_role-only writes (same pattern — no INSERT/UPDATE/DELETE policies)

-- user_voice_profiles: user can only read own profile
CREATE POLICY "Users can read own voice profile"
  ON user_voice_profiles FOR SELECT
  USING (user_id = auth.uid());

-- user_voice_profiles: service_role-only writes (no INSERT/UPDATE/DELETE policies for users)

-- ============================================================================
-- 5. BEFORE INSERT trigger: block transcripts for private sessions
-- ============================================================================
CREATE OR REPLACE FUNCTION check_session_not_private()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM clarity_sessions
    WHERE id = NEW.session_id AND is_private = true
  ) THEN
    RAISE EXCEPTION 'Cannot create transcript for private session';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_private_session_transcript ON session_transcripts;
CREATE TRIGGER trg_block_private_session_transcript
  BEFORE INSERT ON session_transcripts
  FOR EACH ROW
  EXECUTE FUNCTION check_session_not_private();

-- ============================================================================
-- 6. is_private immutability trigger on clarity_sessions
-- ============================================================================
CREATE OR REPLACE FUNCTION prevent_is_private_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_private IS DISTINCT FROM NEW.is_private THEN
    RAISE EXCEPTION 'Cannot change is_private after session creation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_is_private_change ON clarity_sessions;
CREATE TRIGGER trg_prevent_is_private_change
  BEFORE UPDATE ON clarity_sessions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_is_private_change();

-- ============================================================================
-- 7. retry_transcription RPC — participant-only, rate-limited
-- ============================================================================
CREATE OR REPLACE FUNCTION retry_transcription(p_session_id UUID)
RETURNS VOID AS $$
DECLARE
  v_session_code TEXT;
  v_last_retry TIMESTAMPTZ;
BEGIN
  -- Verify caller is a participant
  IF NOT EXISTS (
    SELECT 1 FROM clarity_sessions
    WHERE id = p_session_id
      AND (creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not a participant of this session';
  END IF;

  -- Rate limit: 5 minutes between retries
  SELECT MAX(created_at) INTO v_last_retry
  FROM transcription_jobs
  WHERE session_id = p_session_id AND status = 'pending';

  IF v_last_retry IS NOT NULL AND v_last_retry > now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'Please wait 5 minutes before retrying';
  END IF;

  -- Get session code
  SELECT code INTO v_session_code
  FROM clarity_sessions
  WHERE id = p_session_id;

  -- Insert new pending job
  INSERT INTO transcription_jobs (session_id, session_code, status)
  VALUES (p_session_id, v_session_code, 'pending');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
