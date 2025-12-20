-- P19.3: Idea Feed & Orphan Ideas
-- Migration to add feed ideas, votes, vote history, and comments tables
-- Run this in Supabase SQL Editor to apply changes

-- ============================================================================
-- IDEA FEED TABLES (P19.3 - Orphan Ideas)
-- ============================================================================

-- Feed ideas (orphan ideas - exist independently)
CREATE TABLE IF NOT EXISTS public.clarity_feed_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  originator_name TEXT NOT NULL,
  originator_session_id UUID, -- Anonymous session ID (localStorage)

  -- Provenance: where did this idea come from?
  provenance_type TEXT NOT NULL CHECK (provenance_type IN ('direct', 'elevated_chat', 'elevated_comment')),
  source_session_id UUID REFERENCES public.clarity_sessions(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES public.clarity_chat_messages(id) ON DELETE SET NULL,
  source_comment_id UUID, -- FK added after comments table exists

  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clarity_feed_ideas_created ON public.clarity_feed_ideas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clarity_feed_ideas_originator ON public.clarity_feed_ideas(originator_session_id);
CREATE INDEX IF NOT EXISTS idx_clarity_feed_ideas_visibility ON public.clarity_feed_ideas(visibility);

-- RLS for clarity_feed_ideas
ALTER TABLE public.clarity_feed_ideas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public feed ideas are viewable by everyone" ON public.clarity_feed_ideas;
CREATE POLICY "Public feed ideas are viewable by everyone"
  ON public.clarity_feed_ideas FOR SELECT
  USING (visibility = 'public' OR true);

DROP POLICY IF EXISTS "Anyone can create feed ideas" ON public.clarity_feed_ideas;
CREATE POLICY "Anyone can create feed ideas"
  ON public.clarity_feed_ideas FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update feed ideas" ON public.clarity_feed_ideas;
CREATE POLICY "Anyone can update feed ideas"
  ON public.clarity_feed_ideas FOR UPDATE
  USING (true);

-- Enable realtime for feed ideas
ALTER PUBLICATION supabase_realtime ADD TABLE clarity_feed_ideas;

-- Comments on feed ideas
CREATE TABLE IF NOT EXISTS public.clarity_idea_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID REFERENCES public.clarity_feed_ideas(id) ON DELETE CASCADE NOT NULL,
  author_session_id UUID NOT NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  elevated_to_idea_id UUID REFERENCES public.clarity_feed_ideas(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clarity_idea_comments_idea ON public.clarity_idea_comments(idea_id);
CREATE INDEX IF NOT EXISTS idx_clarity_idea_comments_created ON public.clarity_idea_comments(created_at);

-- RLS for clarity_idea_comments
ALTER TABLE public.clarity_idea_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.clarity_idea_comments;
CREATE POLICY "Comments are viewable by everyone"
  ON public.clarity_idea_comments FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert comments" ON public.clarity_idea_comments;
CREATE POLICY "Anyone can insert comments"
  ON public.clarity_idea_comments FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update comments" ON public.clarity_idea_comments;
CREATE POLICY "Anyone can update comments"
  ON public.clarity_idea_comments FOR UPDATE
  USING (true);

-- Enable realtime for comments
ALTER PUBLICATION supabase_realtime ADD TABLE clarity_idea_comments;

-- Add FK from feed_ideas to comments (for elevated_comment provenance)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_source_comment'
    AND table_name = 'clarity_feed_ideas'
  ) THEN
    ALTER TABLE public.clarity_feed_ideas
      ADD CONSTRAINT fk_source_comment
      FOREIGN KEY (source_comment_id)
      REFERENCES public.clarity_idea_comments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Votes on feed ideas (current vote per user per idea)
CREATE TABLE IF NOT EXISTS public.clarity_idea_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID REFERENCES public.clarity_feed_ideas(id) ON DELETE CASCADE NOT NULL,
  voter_session_id UUID NOT NULL,
  voter_name TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('agree', 'disagree', 'dont_know')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(idea_id, voter_session_id)
);

CREATE INDEX IF NOT EXISTS idx_clarity_idea_votes_idea ON public.clarity_idea_votes(idea_id);
CREATE INDEX IF NOT EXISTS idx_clarity_idea_votes_voter ON public.clarity_idea_votes(voter_session_id);

-- RLS for clarity_idea_votes
ALTER TABLE public.clarity_idea_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Votes are viewable by everyone" ON public.clarity_idea_votes;
CREATE POLICY "Votes are viewable by everyone"
  ON public.clarity_idea_votes FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert votes" ON public.clarity_idea_votes;
CREATE POLICY "Anyone can insert votes"
  ON public.clarity_idea_votes FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update their own votes" ON public.clarity_idea_votes;
CREATE POLICY "Anyone can update their own votes"
  ON public.clarity_idea_votes FOR UPDATE
  USING (true);

-- Enable realtime for votes
ALTER PUBLICATION supabase_realtime ADD TABLE clarity_idea_votes;

-- Vote history (every vote change is recorded)
CREATE TABLE IF NOT EXISTS public.clarity_idea_vote_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id UUID REFERENCES public.clarity_idea_votes(id) ON DELETE CASCADE NOT NULL,
  idea_id UUID NOT NULL,
  voter_session_id UUID NOT NULL,
  voter_name TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('agree', 'disagree', 'dont_know')),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clarity_idea_vote_history_idea ON public.clarity_idea_vote_history(idea_id);
CREATE INDEX IF NOT EXISTS idx_clarity_idea_vote_history_vote ON public.clarity_idea_vote_history(vote_id);

-- RLS for clarity_idea_vote_history
ALTER TABLE public.clarity_idea_vote_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vote history is viewable by everyone" ON public.clarity_idea_vote_history;
CREATE POLICY "Vote history is viewable by everyone"
  ON public.clarity_idea_vote_history FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert vote history" ON public.clarity_idea_vote_history;
CREATE POLICY "Anyone can insert vote history"
  ON public.clarity_idea_vote_history FOR INSERT
  WITH CHECK (true);
