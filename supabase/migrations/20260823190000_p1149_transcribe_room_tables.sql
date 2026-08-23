-- P1149: /transcribe — the live room transcription chat.
--
-- Three tables, per features/p1149_live_room_transcription_chat.md Architecture A1/A2/A4:
--
--   transcribe_rooms         — the room itself. event_id is NULLABLE (A1): an ad-hoc room
--                               has no event. Deliberately NOT event_room_members — that
--                               table's event_id is NOT NULL and carries P1114 semantics
--                               (opted_in, client_secret, comprehension_rating) that do not
--                               belong here. Do NOT modify event_room_members from this file.
--
--   transcribe_room_members  — one row per participant per room. Signed-in only (spec
--                               Non-Goals: "Do NOT support unauthenticated participants"),
--                               so membership binds directly to profile_id/auth.uid() — no
--                               client_secret bearer-token indirection is needed here,
--                               unlike event_room_members's walk-in case.
--
--   transcribe_messages      — the room's live chat text (A4). Only finalized utterances
--                               are ever written (interim text never reaches the server —
--                               that is what makes "only you see this" true). RLS read
--                               requires membership of that room, NOT USING(true) — the one
--                               place the legacy-open clarity_sessions posture must not be
--                               copied (A4, A2 "known wart, accepted").
--
-- A2: each participant's stream is one clarity_sessions row (session_id below), minted on
-- join by the client via the existing createClaritySession path. This migration does not
-- touch clarity_sessions, transcription_jobs, or session_transcripts.

-- ============================================================================
-- 1. transcribe_rooms
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.transcribe_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transcribe_rooms_code ON public.transcribe_rooms(code);
CREATE INDEX IF NOT EXISTS idx_transcribe_rooms_event ON public.transcribe_rooms(event_id) WHERE event_id IS NOT NULL;

ALTER TABLE public.transcribe_rooms ENABLE ROW LEVEL SECURITY;

-- Room existence + code are readable by any signed-in user — required to join by code,
-- same reasoning as clarity_sessions' "Sessions are viewable by everyone (needed for
-- joining)" (20250101_initial_schema.sql:156), narrowed to `authenticated` per this spec's
-- signed-in-only non-goal.
CREATE POLICY "authenticated users can read rooms"
  ON public.transcribe_rooms FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated users can create rooms"
  ON public.transcribe_rooms FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- The UPDATE policy ("only a member can end the room") is declared after section 2
-- below — it references transcribe_room_members, which does not exist yet here.

-- ============================================================================
-- 2. transcribe_room_members
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.transcribe_room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.transcribe_rooms(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 100),
  session_id UUID NOT NULL REFERENCES public.clarity_sessions(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS transcribe_room_members_room_profile_unique
  ON public.transcribe_room_members(room_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_transcribe_room_members_room ON public.transcribe_room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_transcribe_room_members_session ON public.transcribe_room_members(session_id);

ALTER TABLE public.transcribe_room_members ENABLE ROW LEVEL SECURITY;

-- Founder Decision "Presence — everyone in the room is visible by name" (spec): every
-- OTHER member of a room a caller already belongs to is visible. Scoped by membership of
-- the SAME room, unlike event_room_members' event-wide public roster — this is the one
-- room-scoped equivalent, not a second global visibility model.
--
-- SUPERSEDED (20260823200000_p1149_fix_room_members_rls_recursion.sql): this USING clause
-- self-references transcribe_room_members inside its own SELECT policy, which Postgres
-- cannot evaluate without recursively re-evaluating this same policy — "infinite recursion
-- detected in policy for relation transcribe_room_members" (42P17), reproduced live via
-- e2e/p1149-chat-render.spec.ts. Left here unedited as the historical record of what
-- originally shipped and why (P1114 precedent); that migration is authoritative for the
-- CURRENT policy text.
CREATE POLICY "room members can see the roster"
  ON public.transcribe_room_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transcribe_room_members me
      WHERE me.room_id = transcribe_room_members.room_id AND me.profile_id = auth.uid()
    )
  );

-- Joining a room is a self-insert: a caller may only ever insert a membership row for
-- their own profile_id. There is no client_secret indirection here (unlike P1114's
-- walk-in case) because every participant is signed in.
CREATE POLICY "authenticated users can join as themselves"
  ON public.transcribe_room_members FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

-- Deferred from section 1: only a member of the room can end it. Declared here because
-- it references transcribe_room_members, which now exists.
CREATE POLICY "room members can end the room"
  ON public.transcribe_rooms FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transcribe_room_members m
      WHERE m.room_id = transcribe_rooms.id AND m.profile_id = auth.uid()
    )
  );

-- ============================================================================
-- 3. transcribe_messages
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.transcribe_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.transcribe_rooms(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.transcribe_room_members(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (length(btrim(text)) > 0),
  spoken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A4 / DW-4: only finalized utterances are ever written. Enforced at the DB level, not
  -- only client-side — interim text must never even be insertable, not merely "usually
  -- isn't sent". A future column repurposing interim storage would need a new table, not
  -- a flip of this constraint.
  is_final BOOLEAN NOT NULL DEFAULT true CHECK (is_final = true),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transcribe_messages_room ON public.transcribe_messages(room_id, spoken_at);

ALTER TABLE public.transcribe_messages ENABLE ROW LEVEL SECURITY;

-- A4: "read requires membership of that room — not USING (true)." Read access persists
-- after the session ends (spec: "the record of who was there is never deleted") — this
-- policy has no time bound, matching that.
CREATE POLICY "room members can read messages"
  ON public.transcribe_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transcribe_room_members m
      WHERE m.room_id = transcribe_messages.room_id AND m.profile_id = auth.uid()
    )
  );

-- A caller may only write a message attributed to their OWN membership row, in a room
-- they belong to.
CREATE POLICY "room members can send their own messages"
  ON public.transcribe_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transcribe_room_members m
      WHERE m.id = transcribe_messages.member_id
        AND m.room_id = transcribe_messages.room_id
        AND m.profile_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. Realtime — transcribe_messages and transcribe_room_members only
-- ============================================================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.transcribe_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.transcribe_room_members;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
