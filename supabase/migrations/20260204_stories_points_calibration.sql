-- Migration: Stories, Points, and Calibration Backend
-- Created: 2026-02-04
-- Description: Adds tables for stories, points, positions, verifications, and calibration tracking

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- 7-point Likert scale for positions
CREATE TYPE position_type AS ENUM (
  'strongly_disagree',  -- -3
  'disagree',           -- -2
  'somewhat_disagree',  -- -1
  'unsure',             --  0
  'somewhat_agree',     -- +1
  'agree',              -- +2
  'strongly_agree'      -- +3
);

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Stories: User-created content that can be verified in /live sessions
CREATE TABLE stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  current_version INTEGER DEFAULT 1,  -- tracks latest version number
  understood_count INTEGER DEFAULT 0,  -- cached: distinct listeners with ≥8/10 accuracy
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  tags TEXT[] DEFAULT '{}'
);

CREATE INDEX idx_stories_author ON stories(author_id);
CREATE INDEX idx_stories_created ON stories(created_at DESC);

-- Story versions: Immutable snapshots of story content for verification tracking
CREATE TABLE story_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(story_id, version_number)
);

CREATE INDEX idx_story_versions_story ON story_versions(story_id);

-- Points: Statements users can take positions on
CREATE TABLE points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement TEXT NOT NULL,
  context TEXT,  -- optional explanation/background
  first_validator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  tags TEXT[] DEFAULT '{}'
);

CREATE INDEX idx_points_first_validator ON points(first_validator_id);
CREATE INDEX idx_points_created ON points(created_at DESC);

-- Junction table: Many-to-many relationship between stories and points
CREATE TABLE story_points (
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  point_id UUID NOT NULL REFERENCES points(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (story_id, point_id)
);

CREATE INDEX idx_story_points_point ON story_points(point_id);

-- ============================================================================
-- POSITIONS
-- ============================================================================

-- Current position of each user on each point
CREATE TABLE point_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  point_id UUID NOT NULL REFERENCES points(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  position position_type NOT NULL,
  reasoning TEXT,  -- optional explanation for their position
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(point_id, user_id)  -- one position per user per point
);

CREATE INDEX idx_positions_point ON point_positions(point_id);
CREATE INDEX idx_positions_user ON point_positions(user_id);

-- History of all position changes (audit log)
CREATE TABLE point_position_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  point_id UUID NOT NULL REFERENCES points(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  position position_type,  -- NULL means position was removed
  reasoning TEXT,
  session_id UUID REFERENCES clarity_sessions(id),  -- if changed during /live
  changed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_position_history_point ON point_position_history(point_id);
CREATE INDEX idx_position_history_user ON point_position_history(user_id);
CREATE INDEX idx_position_history_changed ON point_position_history(changed_at DESC);

-- ============================================================================
-- VERIFICATIONS (Understanding tracked from /live sessions)
-- ============================================================================

-- Record of story verification attempts in /live sessions
CREATE TABLE story_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES story_versions(id) ON DELETE CASCADE,  -- which version was verified
  session_id UUID REFERENCES clarity_sessions(id),  -- link to /live session (optional for future non-live verifications)
  speaker_id UUID NOT NULL REFERENCES profiles(id),  -- person explaining (usually story author)
  listener_id UUID NOT NULL REFERENCES profiles(id), -- person demonstrating understanding
  speaker_rating SMALLINT CHECK (speaker_rating BETWEEN 0 AND 10),  -- speaker's rating of listener's understanding
  listener_rating SMALLINT CHECK (listener_rating BETWEEN 0 AND 10), -- listener's self-rating
  accuracy_achieved BOOLEAN GENERATED ALWAYS AS (speaker_rating >= 8) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_verifications_story ON story_verifications(story_id);
CREATE INDEX idx_verifications_version ON story_verifications(version_id);
CREATE INDEX idx_verifications_listener ON story_verifications(listener_id);
CREATE INDEX idx_verifications_speaker ON story_verifications(speaker_id);
CREATE INDEX idx_verifications_session ON story_verifications(session_id);
CREATE INDEX idx_verifications_achieved ON story_verifications(story_id) WHERE accuracy_achieved = true;

-- ============================================================================
-- PROFILE EXTENSIONS (Calibration tracking)
-- ============================================================================

-- Add calibration fields to profiles
-- Note: ears_count and verification_session_count are cached counters (updated by triggers)
-- Note: calibration averages are computed on-read via queries, not stored
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ears_count INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verification_session_count INTEGER DEFAULT 0;

-- ============================================================================
-- SESSION LINKING (Connect clarity_sessions to profiles)
-- ============================================================================

-- Add profile references to clarity_sessions for proper linking
ALTER TABLE clarity_sessions
  ADD COLUMN IF NOT EXISTS creator_profile_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS joiner_profile_id UUID REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_sessions_creator_profile ON clarity_sessions(creator_profile_id);
CREATE INDEX IF NOT EXISTS idx_sessions_joiner_profile ON clarity_sessions(joiner_profile_id);

-- ============================================================================
-- TRIGGERS: Automatic updates
-- ============================================================================

-- Create initial version when story is created
-- SECURITY DEFINER: trigger inserts into story_versions which has RLS but no INSERT policy
CREATE OR REPLACE FUNCTION create_initial_story_version()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO story_versions (story_id, version_number, title, content)
  VALUES (NEW.id, 1, NEW.title, NEW.content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_story_initial_version
AFTER INSERT ON stories
FOR EACH ROW EXECUTE FUNCTION create_initial_story_version();

-- Create new version when story content changes
-- SECURITY DEFINER: trigger inserts into story_versions which has RLS but no INSERT policy
CREATE OR REPLACE FUNCTION create_story_version_on_update()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.title IS DISTINCT FROM NEW.title OR OLD.content IS DISTINCT FROM NEW.content THEN
    NEW.current_version = OLD.current_version + 1;
    INSERT INTO story_versions (story_id, version_number, title, content)
    VALUES (NEW.id, NEW.current_version, NEW.title, NEW.content);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_story_version_on_update
BEFORE UPDATE ON stories
FOR EACH ROW EXECUTE FUNCTION create_story_version_on_update();

-- Log position changes to history
-- SECURITY DEFINER: trigger inserts into point_position_history which has RLS but no INSERT policy
CREATE OR REPLACE FUNCTION log_position_change()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO point_position_history (point_id, user_id, position, reasoning)
    VALUES (NEW.point_id, NEW.user_id, NEW.position, NEW.reasoning);
  ELSIF TG_OP = 'UPDATE' AND (OLD.position IS DISTINCT FROM NEW.position OR OLD.reasoning IS DISTINCT FROM NEW.reasoning) THEN
    INSERT INTO point_position_history (point_id, user_id, position, reasoning)
    VALUES (NEW.point_id, NEW.user_id, NEW.position, NEW.reasoning);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO point_position_history (point_id, user_id, position, reasoning)
    VALUES (OLD.point_id, OLD.user_id, NULL, NULL);  -- NULL position = removed
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_position_history
AFTER INSERT OR UPDATE OR DELETE ON point_positions
FOR EACH ROW EXECUTE FUNCTION log_position_change();

-- Update story.understood_count when verification added
CREATE OR REPLACE FUNCTION update_story_understood_count()
RETURNS TRIGGER AS $$
BEGIN
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

CREATE TRIGGER trg_story_verification_count
AFTER INSERT ON story_verifications
FOR EACH ROW EXECUTE FUNCTION update_story_understood_count();

-- Update profile.ears_count when verification added (listener achieved ≥8/10)
-- Only increments ears_count for distinct speaker-listener pairs (first successful verification)
CREATE OR REPLACE FUNCTION update_profile_ears_count()
RETURNS TRIGGER AS $$
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

CREATE TRIGGER trg_profile_ears_count
AFTER INSERT ON story_verifications
FOR EACH ROW EXECUTE FUNCTION update_profile_ears_count();

-- Update timestamps on modification
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stories_updated_at BEFORE UPDATE ON stories
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_points_updated_at BEFORE UPDATE ON points
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_positions_updated_at BEFORE UPDATE ON point_positions
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Stories: public read, verified users create, author update/delete
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stories are publicly readable"
  ON stories FOR SELECT USING (true);

CREATE POLICY "Verified users can create stories"
  ON stories FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_verified = true)
  );

CREATE POLICY "Authors can update own stories"
  ON stories FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete own stories"
  ON stories FOR DELETE USING (auth.uid() = author_id);

-- Story versions: public read, system insert (via trigger)
ALTER TABLE story_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Story versions are publicly readable"
  ON story_versions FOR SELECT USING (true);

-- Insert handled by trigger, no direct user insert needed

-- Points: public read, verified users create
ALTER TABLE points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Points are publicly readable"
  ON points FOR SELECT USING (true);

CREATE POLICY "Verified users can create points"
  ON points FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_verified = true)
  );

-- Note: Points are not editable after creation (statement is immutable)
-- First validator can be different from position-takers

-- Story-Points junction: public read, story author can link
ALTER TABLE story_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Story points are publicly readable"
  ON story_points FOR SELECT USING (true);

CREATE POLICY "Story authors can link points"
  ON story_points FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM stories WHERE id = story_id AND author_id = auth.uid())
  );

CREATE POLICY "Story authors can unlink points"
  ON story_points FOR DELETE USING (
    EXISTS (SELECT 1 FROM stories WHERE id = story_id AND author_id = auth.uid())
  );

-- Point positions: public read, verified users set own
ALTER TABLE point_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Positions are publicly readable"
  ON point_positions FOR SELECT USING (true);

CREATE POLICY "Verified users can set own position"
  ON point_positions FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_verified = true)
  );

CREATE POLICY "Users can update own position"
  ON point_positions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can remove own position"
  ON point_positions FOR DELETE USING (auth.uid() = user_id);

-- Position history: public read, system insert (via trigger)
ALTER TABLE point_position_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Position history is publicly readable"
  ON point_position_history FOR SELECT USING (true);

-- Insert handled by trigger, no direct user insert needed

-- Story verifications: public read, authenticated create
ALTER TABLE story_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Verifications are publicly readable"
  ON story_verifications FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create verifications"
  ON story_verifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- RPC FUNCTIONS (Calibration AVG computed on-read per spec decision)
-- ============================================================================

-- Listener calibration: AVG of speaker ratings and listener self-ratings
-- where the user was the listener
CREATE OR REPLACE FUNCTION get_listener_calibration_avgs(user_id_param UUID)
RETURNS TABLE(avg_speaker_rating NUMERIC, avg_listener_rating NUMERIC)
LANGUAGE sql STABLE
AS $$
  SELECT
    AVG(speaker_rating)::NUMERIC AS avg_speaker_rating,
    AVG(listener_rating)::NUMERIC AS avg_listener_rating
  FROM story_verifications
  WHERE listener_id = user_id_param;
$$;

-- Speaker calibration: AVG of speaker ratings and listener self-ratings
-- where the user was the speaker
CREATE OR REPLACE FUNCTION get_speaker_calibration_avgs(user_id_param UUID)
RETURNS TABLE(avg_speaker_rating NUMERIC, avg_listener_rating NUMERIC)
LANGUAGE sql STABLE
AS $$
  SELECT
    AVG(speaker_rating)::NUMERIC AS avg_speaker_rating,
    AVG(listener_rating)::NUMERIC AS avg_listener_rating
  FROM story_verifications
  WHERE speaker_id = user_id_param;
$$;

-- ============================================================================
-- REALTIME (Enable for live updates)
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE stories;
ALTER PUBLICATION supabase_realtime ADD TABLE points;
ALTER PUBLICATION supabase_realtime ADD TABLE point_positions;
ALTER PUBLICATION supabase_realtime ADD TABLE story_verifications;
