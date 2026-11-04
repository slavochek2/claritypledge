-- Migration: P1604 (1/3) — schema: a transcription room can belong to a chat; clean text gets its own per-job table
-- Created: 2026-11-03
-- Spec: features/p1604_transcription_belongs_to_a_chat.md (Resolved Decisions 1, 5, 7, 8)
-- Guaranteed by: e2e/integration/20261103090000_p1604_transcription_belongs_to_a_chat.spec.ts
--
-- diffed against: 20260823190000_p1149_transcribe_room_tables.sql (transcribe_rooms, transcribe_room_members),
--   20261101120000_p1596_clean_round_transcripts.sql + 20261102133000_p1596_threads_in_time_order.sql
--   (transcribe_round_clean_jobs: event_id NOT NULL relaxed, conversation_id added, place gains 'session').
--   Every change is additive or a relaxation; no existing column is dropped or retyped.
--
-- WHAT CHANGES
--   1. transcribe_rooms: conversation_id, part_no, continues_room_id. A partial unique index allows ONE open room
--      per conversation (Resolved Decision 1).
--   2. transcribe_room_members: paused_since (set by the paused heartbeat, cleared by any slice; Decision 5) and
--      consent_carried_from_room_id (a seat created by a Part 2 roll carries the earlier room's consent; Decision 8).
--   3. transcribe_round_clean_jobs: event_id may be NULL (a chat session or a plain room has no event) and a job may
--      name its conversation. A room job's place gains 'session' (one job per room outside rounds).
--   4. transcribe_clean_texts (new): the cleaned text of every job, whether or not it was posted to a chat. Separate
--      from transcribe_room_transcripts, so the older pass and the clean pass cannot overwrite each other in either
--      order (Decision 7). No client privilege: history reads it through get_my_clean_transcript (migration 3/3),
--      which only returns jobs the caller was part of.
--   5. transcribe_session_threads (new): the thread root of ONE room session in ONE chat (Decision 6). Service role only.
--
-- client-safe: columns have defaults or are nullable; the new tables are unreachable by clients. A deployed client
--   that knows none of this keeps working.

-- ── 1. Rooms ────────────────────────────────────────────────────────────────
ALTER TABLE public.transcribe_rooms
  ADD COLUMN IF NOT EXISTS conversation_id   uuid REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS part_no           integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS continues_room_id uuid REFERENCES public.transcribe_rooms(id) ON DELETE SET NULL;

ALTER TABLE public.transcribe_rooms DROP CONSTRAINT IF EXISTS transcribe_rooms_part_no_check;
ALTER TABLE public.transcribe_rooms ADD CONSTRAINT transcribe_rooms_part_no_check CHECK (part_no >= 1);

COMMENT ON COLUMN public.transcribe_rooms.conversation_id IS
  'P1604: the chat this room belongs to, if any. A chat has at most one open room. NULL = a plain /transcribe room, '
  'whose text goes to session history only.';
COMMENT ON COLUMN public.transcribe_rooms.part_no IS
  'P1604: 1 for a session''s first room; a session that runs to the 3-hour roll continues in a room with part_no + 1.';
COMMENT ON COLUMN public.transcribe_rooms.continues_room_id IS
  'P1604: the room this one carries on from (Part 2), set only by the sweep''s roll.';

CREATE UNIQUE INDEX IF NOT EXISTS transcribe_rooms_one_open_per_conversation
  ON public.transcribe_rooms (conversation_id)
  WHERE ended_at IS NULL AND conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS transcribe_rooms_continues
  ON public.transcribe_rooms (continues_room_id) WHERE continues_room_id IS NOT NULL;

-- ── 2. Members ──────────────────────────────────────────────────────────────
ALTER TABLE public.transcribe_room_members
  ADD COLUMN IF NOT EXISTS paused_since                 timestamptz,
  ADD COLUMN IF NOT EXISTS consent_carried_from_room_id uuid REFERENCES public.transcribe_rooms(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.transcribe_room_members.paused_since IS
  'P1604 rule 5: set by the paused heartbeat (touch_transcribe_room_capture), cleared by any accepted slice and by a '
  're-join. The sweep ends a room whose open members have ALL been paused for 10 minutes. No client UPDATE policy.';
COMMENT ON COLUMN public.transcribe_room_members.consent_carried_from_room_id IS
  'P1604 rule 8: this seat was created by the 3-hour roll, with consent_given_at copied from the same person''s seat in '
  'that earlier room. No new consent tap happened; this column says so.';

-- ── 3. Clean jobs may belong to a chat session or a plain room ──────────────
ALTER TABLE public.transcribe_round_clean_jobs ALTER COLUMN event_id DROP NOT NULL;
ALTER TABLE public.transcribe_round_clean_jobs
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE CASCADE;

ALTER TABLE public.transcribe_round_clean_jobs DROP CONSTRAINT IF EXISTS transcribe_round_clean_jobs_shape;
ALTER TABLE public.transcribe_round_clean_jobs ADD CONSTRAINT transcribe_round_clean_jobs_shape CHECK (
  (kind = 'round' AND event_id IS NOT NULL AND round_id IS NOT NULL AND table_no IS NOT NULL)
  OR (kind = 'room' AND room_id IS NOT NULL AND round_id IS NULL AND table_no IS NULL));

ALTER TABLE public.transcribe_round_clean_jobs DROP CONSTRAINT IF EXISTS transcribe_round_clean_jobs_place_check;
ALTER TABLE public.transcribe_round_clean_jobs ADD CONSTRAINT transcribe_round_clean_jobs_place_check CHECK (
  (kind = 'round' AND place IS NULL) OR (kind = 'room' AND place IN ('before', 'end', 'session')));

-- ── 4. Clean text per job ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transcribe_clean_texts (
  job_id     uuid   NOT NULL REFERENCES public.transcribe_round_clean_jobs(id) ON DELETE CASCADE,
  member_id  uuid   NOT NULL REFERENCES public.transcribe_room_members(id) ON DELETE CASCADE,
  chunk_ms   bigint NOT NULL,
  text       text   NOT NULL CHECK (length(btrim(text)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, member_id, chunk_ms)
);
CREATE INDEX IF NOT EXISTS transcribe_clean_texts_member ON public.transcribe_clean_texts (member_id);

ALTER TABLE public.transcribe_clean_texts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.transcribe_clean_texts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.transcribe_clean_texts TO service_role;

COMMENT ON TABLE public.transcribe_clean_texts IS
  'P1604 Decision 7: the cleaned text of every clean job (one row per job, speaker, chunk), kept whether or not the '
  'line was posted to a chat. Service role writes it inside post_clean_round; clients read it only through '
  'get_my_clean_transcript, which returns jobs the caller was a seat of.';

-- ── 5. One thread root per room session per chat ────────────────────────────
CREATE TABLE IF NOT EXISTS public.transcribe_session_threads (
  room_id         uuid PRIMARY KEY REFERENCES public.transcribe_rooms(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  root_message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE
);
ALTER TABLE public.transcribe_session_threads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.transcribe_session_threads FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.transcribe_session_threads TO service_role;

COMMENT ON TABLE public.transcribe_session_threads IS
  'P1604 rule 6: the thread a room''s session posts into when it is not at a round table. The root is a system post '
  '(system_kind outside_rounds) whose body is "session|<start ISO>|<part_no>"; the client shows it as a date and time in '
  'the reader''s time zone.';

DO $check$
BEGIN
  IF has_table_privilege('authenticated', 'public.transcribe_clean_texts', 'SELECT')
     OR has_table_privilege('anon', 'public.transcribe_clean_texts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.transcribe_session_threads', 'SELECT')
     OR has_table_privilege('anon', 'public.transcribe_session_threads', 'SELECT') THEN
    RAISE EXCEPTION 'P1604: a service-only table is client-reachable';
  END IF;
END
$check$;
