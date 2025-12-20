-- Enable Row Level Security
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;

-- PROFILES TABLE
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  slug text unique,
  email text unique not null,
  name text not null,
  role text,
  linkedin_url text,
  reason text,
  avatar_color text,
  is_verified boolean default false,
  pledge_version integer default 2,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- WITNESSES TABLE
create table public.witnesses (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references public.profiles(id) on delete cascade not null, -- The person receiving the witness
  witness_name text not null,
  witness_linkedin_url text,
  witness_profile_id uuid references public.profiles(id), -- Optional link if witness is also a user
  is_verified boolean default true, -- Set to true for now as per current logic
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS POLICIES

alter table public.profiles enable row level security;
alter table public.witnesses enable row level security;

-- Profiles: 
-- Anyone can read profiles
create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using ( true );

-- Users can insert their own profile (linked to auth.uid)
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check ( auth.uid() = id );

-- Users can update own profile
create policy "Users can update own profile"
  on public.profiles for update
  using ( auth.uid() = id );

-- Witnesses:
-- Anyone can read witnesses
create policy "Witnesses are viewable by everyone"
  on public.witnesses for select
  using ( true );

-- Authenticated users can insert witnesses
create policy "Authenticated users can insert witnesses"
  on public.witnesses for insert
  with check ( true );

-- NOTE: Database trigger for automatic profile creation has been REMOVED.
-- Profile creation is handled ONLY by AuthCallbackPage.tsx after email verification.
-- This ensures proper slug generation and is_verified=true is always set.
--
-- The old trigger (on_auth_user_created) was removed from production on 2025-12-04
-- because it created profiles with NULL slugs (metadata didn't include slug).

-- ============================================================================
-- CLARITY PARTNERS TABLES (P19 MVP)
-- ============================================================================

-- Sessions (partnership container, no expiry - chats live forever)
CREATE TABLE public.clarity_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- 6-char room code
  creator_name TEXT NOT NULL,
  creator_note TEXT, -- "why I'm inviting you"
  joiner_name TEXT,
  state JSONB NOT NULL DEFAULT '{}', -- current UI state for sync
  demo_status TEXT CHECK (demo_status IN ('waiting', 'in_progress', 'completed')) DEFAULT 'waiting',
  partnership_status TEXT CHECK (partnership_status IN ('pending', 'accepted', 'declined')) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE -- NULL means no expiry
);

CREATE INDEX idx_clarity_sessions_code ON public.clarity_sessions(code);

-- RLS for clarity_sessions
ALTER TABLE public.clarity_sessions ENABLE ROW LEVEL SECURITY;

-- Anyone can read sessions (needed for joining)
CREATE POLICY "Sessions are viewable by everyone"
  ON public.clarity_sessions FOR SELECT
  USING (true);

-- Anyone can create sessions (no auth required for MVP)
CREATE POLICY "Anyone can create sessions"
  ON public.clarity_sessions FOR INSERT
  WITH CHECK (true);

-- Anyone can update sessions (for realtime sync)
CREATE POLICY "Anyone can update sessions"
  ON public.clarity_sessions FOR UPDATE
  USING (true);

-- Enable realtime for sync
ALTER PUBLICATION supabase_realtime ADD TABLE clarity_sessions;

-- Demo rounds (each paraphrase attempt within a level)
CREATE TABLE public.clarity_demo_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.clarity_sessions(id) ON DELETE CASCADE NOT NULL,
  level INT NOT NULL CHECK (level BETWEEN 1 AND 5),
  round_number INT NOT NULL CHECK (round_number >= 1),
  speaker_name TEXT NOT NULL,
  listener_name TEXT NOT NULL,
  idea_text TEXT, -- Speaker's transcribed idea (null for level 5 which uses preset text)
  paraphrase_text TEXT, -- Listener's transcribed paraphrase
  speaker_rating INT CHECK (speaker_rating BETWEEN 0 AND 100), -- Speaker's assessment of understanding
  listener_self_rating INT CHECK (listener_self_rating BETWEEN 0 AND 100), -- Listener's self-assessment
  calibration_gap INT, -- speaker_rating - listener_self_rating (computed on insert)
  correction_text TEXT, -- Speaker's correction if not understood
  is_accepted BOOLEAN DEFAULT false, -- Speaker accepted this round
  position TEXT CHECK (position IN ('agree', 'disagree', 'skip')), -- Only set after understanding achieved
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX idx_clarity_demo_rounds_session ON public.clarity_demo_rounds(session_id);

-- RLS for clarity_demo_rounds
ALTER TABLE public.clarity_demo_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Demo rounds are viewable by everyone"
  ON public.clarity_demo_rounds FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert demo rounds"
  ON public.clarity_demo_rounds FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update demo rounds"
  ON public.clarity_demo_rounds FOR UPDATE
  USING (true);

-- Ideas backlog (transcribed ideas become future discussion topics)
CREATE TABLE public.clarity_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.clarity_sessions(id) ON DELETE CASCADE NOT NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  source_level INT CHECK (source_level BETWEEN 1 AND 5), -- Which demo level this came from (null if added later)
  status TEXT CHECK (status IN ('pending', 'in_meeting', 'discussed', 'skipped')) DEFAULT 'pending',
  -- Results (populated after discussion in future meetings)
  rounds_count INT,
  final_accuracy INT,
  position TEXT CHECK (position IN ('agree', 'disagree', 'skip')),
  discussed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX idx_clarity_ideas_session ON public.clarity_ideas(session_id);

-- RLS for clarity_ideas
ALTER TABLE public.clarity_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ideas are viewable by everyone"
  ON public.clarity_ideas FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert ideas"
  ON public.clarity_ideas FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update ideas"
  ON public.clarity_ideas FOR UPDATE
  USING (true);

-- Enable realtime for ideas sync
ALTER PUBLICATION supabase_realtime ADD TABLE clarity_ideas;

-- ============================================================================
-- CLARITY CHAT TABLES (P19.2 MVP)
-- ============================================================================
-- Note: Reuses clarity_sessions as chat container (code, creator_name, joiner_name)
-- The key difference: chat ideas are freeform messages, not demo-level specific

-- Chat messages (ideas in chat context)
CREATE TABLE public.clarity_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.clarity_sessions(id) ON DELETE CASCADE NOT NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  explanation_requested_at TIMESTAMP WITH TIME ZONE DEFAULT NULL, -- When author requested listener to explain back. NULL = no request.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX idx_clarity_chat_messages_session ON public.clarity_chat_messages(session_id);
CREATE INDEX idx_clarity_chat_messages_created ON public.clarity_chat_messages(created_at);

-- RLS for clarity_chat_messages
ALTER TABLE public.clarity_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Chat messages are viewable by everyone"
  ON public.clarity_chat_messages FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert chat messages"
  ON public.clarity_chat_messages FOR INSERT
  WITH CHECK (true);

-- Enable realtime for chat messages
ALTER PUBLICATION supabase_realtime ADD TABLE clarity_chat_messages;

-- Verifications (paraphrase attempts on chat messages)
-- Supports multiple rounds: if author provides correction, verifier can retry
CREATE TABLE public.clarity_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES public.clarity_chat_messages(id) ON DELETE CASCADE NOT NULL,
  verifier_name TEXT NOT NULL,
  paraphrase_text TEXT NOT NULL,
  self_rating INT CHECK (self_rating BETWEEN 0 AND 100), -- Verifier's self-assessment
  accuracy_rating INT CHECK (accuracy_rating BETWEEN 0 AND 100), -- NULL until author rates
  calibration_gap INT, -- accuracy_rating - self_rating (computed when rated)
  correction_text TEXT, -- Author's feedback if not accepted (what was missed/wrong)
  round_number INT DEFAULT 1, -- Which attempt this is (1, 2, 3...)
  status TEXT CHECK (status IN ('pending', 'accepted', 'needs_retry')) DEFAULT 'pending',
  position TEXT CHECK (position IN ('agree', 'disagree', 'dont_know')), -- NULL until set
  audio_url TEXT, -- URL to audio recording in Supabase Storage
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX idx_clarity_verifications_message ON public.clarity_verifications(message_id);

-- RLS for clarity_verifications
ALTER TABLE public.clarity_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Verifications are viewable by everyone"
  ON public.clarity_verifications FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert verifications"
  ON public.clarity_verifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update verifications"
  ON public.clarity_verifications FOR UPDATE
  USING (true);

-- Enable realtime for verifications
ALTER PUBLICATION supabase_realtime ADD TABLE clarity_verifications;

-- Trigger: Clear explanation request when verification is created
-- This ensures the request is "answered" when someone explains back
CREATE OR REPLACE FUNCTION clear_explanation_request()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.clarity_chat_messages
  SET explanation_requested_at = NULL
  WHERE id = NEW.message_id
    AND explanation_requested_at IS NOT NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_verification_created
  AFTER INSERT ON public.clarity_verifications
  FOR EACH ROW
  EXECUTE FUNCTION clear_explanation_request();

-- ============================================================================
-- IDEA FEED TABLES (P19.3 - Orphan Ideas)
-- ============================================================================
-- Public feed where ideas exist independently of their creators.
-- Separate from clarity_ideas which is session-scoped for chat context.

-- Feed ideas (orphan ideas - exist independently)
CREATE TABLE public.clarity_feed_ideas (
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

CREATE INDEX idx_clarity_feed_ideas_created ON public.clarity_feed_ideas(created_at DESC);
CREATE INDEX idx_clarity_feed_ideas_originator ON public.clarity_feed_ideas(originator_session_id);
CREATE INDEX idx_clarity_feed_ideas_visibility ON public.clarity_feed_ideas(visibility);

-- RLS for clarity_feed_ideas
ALTER TABLE public.clarity_feed_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public feed ideas are viewable by everyone"
  ON public.clarity_feed_ideas FOR SELECT
  USING (visibility = 'public' OR true); -- For MVP, show all; refine later for private

CREATE POLICY "Anyone can create feed ideas"
  ON public.clarity_feed_ideas FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update feed ideas"
  ON public.clarity_feed_ideas FOR UPDATE
  USING (true);

-- Enable realtime for feed ideas
ALTER PUBLICATION supabase_realtime ADD TABLE clarity_feed_ideas;

-- Comments on feed ideas (must be created before votes for FK order)
CREATE TABLE public.clarity_idea_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID REFERENCES public.clarity_feed_ideas(id) ON DELETE CASCADE NOT NULL,
  author_session_id UUID NOT NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  elevated_to_idea_id UUID REFERENCES public.clarity_feed_ideas(id) ON DELETE SET NULL, -- If promoted to idea
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX idx_clarity_idea_comments_idea ON public.clarity_idea_comments(idea_id);
CREATE INDEX idx_clarity_idea_comments_created ON public.clarity_idea_comments(created_at);

-- RLS for clarity_idea_comments
ALTER TABLE public.clarity_idea_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments are viewable by everyone"
  ON public.clarity_idea_comments FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert comments"
  ON public.clarity_idea_comments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update comments"
  ON public.clarity_idea_comments FOR UPDATE
  USING (true);

-- Enable realtime for comments
ALTER PUBLICATION supabase_realtime ADD TABLE clarity_idea_comments;

-- Now add FK from feed_ideas to comments (for elevated_comment provenance)
ALTER TABLE public.clarity_feed_ideas
  ADD CONSTRAINT fk_source_comment
  FOREIGN KEY (source_comment_id)
  REFERENCES public.clarity_idea_comments(id) ON DELETE SET NULL;

-- Votes on feed ideas (current vote per user per idea)
CREATE TABLE public.clarity_idea_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id UUID REFERENCES public.clarity_feed_ideas(id) ON DELETE CASCADE NOT NULL,
  voter_session_id UUID NOT NULL, -- Anonymous session ID (localStorage)
  voter_name TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('agree', 'disagree', 'dont_know')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(idea_id, voter_session_id)
);

CREATE INDEX idx_clarity_idea_votes_idea ON public.clarity_idea_votes(idea_id);
CREATE INDEX idx_clarity_idea_votes_voter ON public.clarity_idea_votes(voter_session_id);

-- RLS for clarity_idea_votes
ALTER TABLE public.clarity_idea_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Votes are viewable by everyone"
  ON public.clarity_idea_votes FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert votes"
  ON public.clarity_idea_votes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update their own votes"
  ON public.clarity_idea_votes FOR UPDATE
  USING (true); -- For MVP, allow all; could restrict to voter_session_id match

-- Enable realtime for votes
ALTER PUBLICATION supabase_realtime ADD TABLE clarity_idea_votes;

-- Vote history (every vote change is recorded)
CREATE TABLE public.clarity_idea_vote_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id UUID REFERENCES public.clarity_idea_votes(id) ON DELETE CASCADE NOT NULL,
  idea_id UUID NOT NULL,
  voter_session_id UUID NOT NULL,
  voter_name TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('agree', 'disagree', 'dont_know')),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX idx_clarity_idea_vote_history_idea ON public.clarity_idea_vote_history(idea_id);
CREATE INDEX idx_clarity_idea_vote_history_vote ON public.clarity_idea_vote_history(vote_id);

-- RLS for clarity_idea_vote_history
ALTER TABLE public.clarity_idea_vote_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vote history is viewable by everyone"
  ON public.clarity_idea_vote_history FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert vote history"
  ON public.clarity_idea_vote_history FOR INSERT
  WITH CHECK (true);
