-- P61: Events Feature - Database Schema
-- Run via Supabase Dashboard > SQL Editor

-- ============================================
-- EVENTS TABLE
-- ============================================
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,

  -- Details
  title TEXT NOT NULL,
  description TEXT NOT NULL,

  -- When
  datetime TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 120,
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',

  -- Where (physical address OR virtual link)
  location TEXT NOT NULL,

  -- Who
  host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Capacity (NULL = unlimited; host doesn't count against cap)
  max_attendees INTEGER,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'completed', 'cancelled'))
);

-- Indexes
CREATE INDEX idx_events_datetime ON events(datetime);
CREATE INDEX idx_events_host ON events(host_id);
CREATE INDEX idx_events_slug ON events(slug);

-- RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Events are viewable by everyone"
  ON events FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create events"
  ON events FOR INSERT WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can update their own events"
  ON events FOR UPDATE USING (auth.uid() = host_id);

CREATE POLICY "Hosts can delete their own events"
  ON events FOR DELETE USING (auth.uid() = host_id);

-- ============================================
-- EVENT RSVPS TABLE
-- ============================================
CREATE TABLE public.event_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rsvped_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, profile_id)
);

CREATE INDEX idx_event_rsvps_event ON event_rsvps(event_id);
CREATE INDEX idx_event_rsvps_profile ON event_rsvps(profile_id);

ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "RSVPs are viewable by everyone"
  ON event_rsvps FOR SELECT USING (true);

CREATE POLICY "Authenticated users can RSVP"
  ON event_rsvps FOR INSERT WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can cancel their own RSVP"
  ON event_rsvps FOR DELETE USING (auth.uid() = profile_id);
