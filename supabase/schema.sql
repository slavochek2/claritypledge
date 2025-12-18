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

-- Sessions (partnership container, expires after 7 days)
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
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days')
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
