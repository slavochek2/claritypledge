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
