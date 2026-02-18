-- P124: Event Rooms — Sub-rooms for in-event /live pairing
-- Enables "tap to step aside" flow: tap person on event page → create sub-room → join /live session

-- ============================================
-- EVENT SUB-ROOMS TABLE
-- ============================================
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

  -- Prevent self-pairing at DB level
  CONSTRAINT no_self_pairing CHECK (initiator_id != target_id)
);

-- ============================================
-- INDEXES
-- ============================================

-- Fast lookup: all sub-rooms for an event (the main query for event page)
CREATE INDEX idx_event_sub_rooms_event ON event_sub_rooms(event_id);

-- Fast lookup: sub-rooms involving a specific user
CREATE INDEX idx_event_sub_rooms_initiator ON event_sub_rooms(initiator_id);
CREATE INDEX idx_event_sub_rooms_target ON event_sub_rooms(target_id);

-- Race condition prevention: only one non-terminal sub-room per target per event.
-- If two people tap Carol simultaneously, only the first INSERT succeeds.
-- "Non-terminal" = pending or active (not completed, cancelled, or expired).
CREATE UNIQUE INDEX idx_one_active_sub_room_per_target
  ON event_sub_rooms(event_id, target_id)
  WHERE status IN ('pending', 'active');

-- Also prevent initiator from being in multiple active sub-rooms per event
CREATE UNIQUE INDEX idx_one_active_sub_room_per_initiator
  ON event_sub_rooms(event_id, initiator_id)
  WHERE status IN ('pending', 'active');

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.event_sub_rooms ENABLE ROW LEVEL SECURITY;

-- Everyone at the event can see sub-rooms (needed for session list + availability)
CREATE POLICY "Sub-rooms are viewable by everyone"
  ON event_sub_rooms FOR SELECT USING (true);

-- Authenticated users can create sub-rooms (must be the initiator)
CREATE POLICY "Authenticated users can create sub-rooms"
  ON event_sub_rooms FOR INSERT
  WITH CHECK (auth.uid() = initiator_id);

-- Participants can update sub-rooms they're involved in
-- (join = target updates to active, complete/cancel = either party)
CREATE POLICY "Participants can update their sub-rooms"
  ON event_sub_rooms FOR UPDATE
  USING (auth.uid() = initiator_id OR auth.uid() = target_id);

-- Only initiator can delete (cancel before target joins)
CREATE POLICY "Initiators can delete their sub-rooms"
  ON event_sub_rooms FOR DELETE
  USING (auth.uid() = initiator_id);

-- ============================================
-- EXPIRY: Auto-expire stale pending sub-rooms on INSERT
-- ============================================
-- Without this, expired pending sub-rooms (status='pending', expires_at < NOW())
-- permanently block the partial unique index, preventing the target from being
-- invited again at the same event. This trigger cleans them up on each insert.

CREATE OR REPLACE FUNCTION expire_stale_sub_rooms()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE event_sub_rooms
  SET status = 'expired'
  WHERE event_id = NEW.event_id
    AND status = 'pending'
    AND expires_at < NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_expire_stale_sub_rooms
  BEFORE INSERT ON event_sub_rooms
  FOR EACH ROW
  EXECUTE FUNCTION expire_stale_sub_rooms();

-- ============================================
-- REALTIME
-- ============================================
-- Enable Postgres Changes for real-time sub-room state on event page
ALTER PUBLICATION supabase_realtime ADD TABLE event_sub_rooms;
