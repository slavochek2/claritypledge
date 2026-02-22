-- P406: Practice Rooms — Event-Native Session Start
-- Creates event_practice_rooms table for open-room style session discovery

CREATE TABLE public.event_practice_rooms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.clarity_sessions(id) ON DELETE SET NULL,
  status     TEXT NOT NULL DEFAULT 'waiting'
             CHECK (status IN ('waiting', 'active', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes')
);

ALTER TABLE public.event_practice_rooms ENABLE ROW LEVEL SECURITY;

-- Anyone can read rooms (needed for public event page)
CREATE POLICY "event_practice_rooms_select"
  ON public.event_practice_rooms FOR SELECT
  USING (true);

-- Only authenticated creator can open a room
CREATE POLICY "event_practice_rooms_insert"
  ON public.event_practice_rooms FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

-- Creator can update their own room; joiner can set status=active on join
CREATE POLICY "event_practice_rooms_update"
  ON public.event_practice_rooms FOR UPDATE
  USING (
    auth.uid() = creator_id
    OR EXISTS (
      SELECT 1 FROM public.clarity_sessions cs
      WHERE cs.id = event_practice_rooms.session_id
        AND cs.joiner_profile_id = auth.uid()
    )
  );

-- DB-enforced: one waiting room per (event, creator) at a time
CREATE UNIQUE INDEX idx_one_waiting_room_per_creator
  ON public.event_practice_rooms(event_id, creator_id)
  WHERE status = 'waiting';

CREATE INDEX idx_event_practice_rooms_event ON public.event_practice_rooms(event_id);
