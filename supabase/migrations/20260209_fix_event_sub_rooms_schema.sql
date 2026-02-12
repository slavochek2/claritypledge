-- Fix event_sub_rooms schema mismatch
-- Table existed with old schema, missing initiator_id and other columns
-- Drop and recreate with correct P135 schema

DROP TABLE IF EXISTS public.event_sub_rooms CASCADE;

CREATE TABLE public.event_sub_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which event this sub-room belongs to
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,

  -- Linked clarity session (filled when both join /live)
  session_id UUID REFERENCES public.clarity_sessions(id) ON DELETE SET NULL,

  -- Who initiated and who was targeted
  initiator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Sub-room lifecycle: pending → active → completed | cancelled | expired
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'completed', 'cancelled', 'expired')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '3 minutes'),

  -- Session join code (filled when status = active)
  session_code TEXT
);

-- RLS policies
ALTER TABLE public.event_sub_rooms ENABLE ROW LEVEL SECURITY;

-- Users can see sub-rooms where they're initiator or target
CREATE POLICY "Users can view their own sub-rooms"
  ON public.event_sub_rooms FOR SELECT
  USING (
    auth.uid() = initiator_id OR
    auth.uid() = target_id
  );

-- Users can create sub-rooms where they're the initiator
CREATE POLICY "Users can create sub-rooms as initiator"
  ON public.event_sub_rooms FOR INSERT
  WITH CHECK (auth.uid() = initiator_id);

-- Users can update sub-rooms where they're initiator or target
CREATE POLICY "Users can update their own sub-rooms"
  ON public.event_sub_rooms FOR UPDATE
  USING (
    auth.uid() = initiator_id OR
    auth.uid() = target_id
  );

-- Index for faster lookups
CREATE INDEX idx_event_sub_rooms_event_id ON public.event_sub_rooms(event_id);
CREATE INDEX idx_event_sub_rooms_status ON public.event_sub_rooms(status);
CREATE INDEX idx_event_sub_rooms_expires_at ON public.event_sub_rooms(expires_at);
