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

-- Helper to handle new user signup
-- DEPRECATED: This trigger is a fallback only. Primary profile creation happens
-- in AuthCallbackPage.tsx which sets is_verified=true and generates unique slugs.
-- The ON CONFLICT DO NOTHING prevents errors when AuthCallbackPage creates the profile first.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, slug, role, linkedin_url, reason, avatar_color)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'slug',
    new.raw_user_meta_data->>'role',
    new.raw_user_meta_data->>'linkedin_url',
    new.raw_user_meta_data->>'reason',
    new.raw_user_meta_data->>'avatar_color'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Trigger the function every time a user is created
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
