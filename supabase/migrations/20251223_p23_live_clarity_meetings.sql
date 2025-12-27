-- P23: Live Clarity Meetings
-- Adds support for real-time in-person clarity sessions
-- Two people join, talk naturally, app acts as quiet referee

-- ============================================================================
-- 1. Add mode column to clarity_sessions
-- ============================================================================

ALTER TABLE public.clarity_sessions
ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'async' CHECK (mode IN ('async', 'live', 'review'));

-- live_state stores current live session state (current idea, speaker, round, etc.)
ALTER TABLE public.clarity_sessions
ADD COLUMN IF NOT EXISTS live_state JSONB DEFAULT '{}';

COMMENT ON COLUMN public.clarity_sessions.mode IS 'Session mode: async (chat), live (in-person), review (reviewing live session)';
COMMENT ON COLUMN public.clarity_sessions.live_state IS 'Current live session state for realtime sync';

-- ============================================================================
-- 2. Create clarity_live_turns table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.clarity_live_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES clarity_sessions(id) ON DELETE CASCADE,
  idea_id UUID REFERENCES clarity_ideas(id) ON DELETE SET NULL,

  -- Who did what
  speaker_name TEXT NOT NULL,
  listener_name TEXT NOT NULL,
  actor_name TEXT NOT NULL,  -- Who made this turn (speaker or listener)
  role TEXT NOT NULL CHECK (role IN ('speaker', 'listener')),

  -- Turn content
  transcript TEXT,  -- Transcribed speech (populated after)

  -- Ratings (0-10 scale)
  self_rating INTEGER CHECK (self_rating >= 0 AND self_rating <= 10),
  other_rating INTEGER CHECK (other_rating >= 0 AND other_rating <= 10),

  -- Flags
  flag TEXT CHECK (flag IN ('new_idea', 'judgment', 'not_what_i_meant', 'your_idea')),

  -- Tracking
  round_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_live_turns_session ON public.clarity_live_turns(session_id);
CREATE INDEX IF NOT EXISTS idx_live_turns_idea ON public.clarity_live_turns(idea_id);
CREATE INDEX IF NOT EXISTS idx_live_turns_created ON public.clarity_live_turns(created_at);

-- RLS for clarity_live_turns
ALTER TABLE public.clarity_live_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Live turns are viewable by everyone"
  ON public.clarity_live_turns FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert live turns"
  ON public.clarity_live_turns FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update live turns"
  ON public.clarity_live_turns FOR UPDATE
  USING (true);

-- Enable realtime for live turns
ALTER PUBLICATION supabase_realtime ADD TABLE clarity_live_turns;

-- ============================================================================
-- 3. Update clarity_ideas for live sessions
-- ============================================================================

-- Add columns for tracking understanding in live sessions
ALTER TABLE public.clarity_ideas
ADD COLUMN IF NOT EXISTS is_understood BOOLEAN DEFAULT FALSE;

ALTER TABLE public.clarity_ideas
ADD COLUMN IF NOT EXISTS final_rating INTEGER;

ALTER TABLE public.clarity_ideas
ADD COLUMN IF NOT EXISTS total_rounds INTEGER DEFAULT 0;

ALTER TABLE public.clarity_ideas
ADD COLUMN IF NOT EXISTS understood_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.clarity_ideas
ADD COLUMN IF NOT EXISTS source_live_turn_id UUID REFERENCES clarity_live_turns(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.clarity_ideas.is_understood IS 'True when speaker confirmed 9-10/10 understanding';
COMMENT ON COLUMN public.clarity_ideas.final_rating IS 'Last speaker rating (0-10)';
COMMENT ON COLUMN public.clarity_ideas.total_rounds IS 'Number of paraphrase rounds to reach understanding';
COMMENT ON COLUMN public.clarity_ideas.understood_at IS 'When understanding was achieved';
COMMENT ON COLUMN public.clarity_ideas.source_live_turn_id IS 'Link to the live turn that created this idea';
