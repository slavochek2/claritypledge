-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- PROFILES TABLE
create table public.profiles (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  name text not null,
  role text,
  linkedin_url text,
  reason text,
  avatar_color text default '#0044CC',
  is_verified boolean default false,
  signed_at timestamp with time zone default timezone('utc'::text, now()) not null,
  reciprocations integer default 0
);

-- WITNESSES TABLE
create table public.witnesses (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  linkedin_url text,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null,
  is_verified boolean default false
);

-- ROW LEVEL SECURITY (RLS) POLICIES
alter table public.profiles enable row level security;
alter table public.witnesses enable row level security;

-- Allow anyone to read profiles
create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using (true);

-- Allow anyone to insert a profile (Pledge Sign Flow)
-- Note: In a production app, you'd want Captcha or Auth here to prevent spam
create policy "Anyone can sign the pledge"
  on public.profiles for insert
  with check (true);

-- Allow anyone to read witnesses
create policy "Witnesses are viewable by everyone"
  on public.witnesses for select
  using (true);

-- Allow anyone to insert a witness (Endorsement Flow)
create policy "Anyone can witness"
  on public.witnesses for insert
  with check (true);

