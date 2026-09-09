-- Migration: P1275 — starting a /transcribe room, atomically
-- Created: 2026-09-08
-- Spec: features/p1275_transcribe_room_creation_fails_rls.md
-- Reproduced by: e2e/p1275-transcribe-room-create.spec.ts (UI canary, red before this)
-- Guaranteed by: e2e/integration/p1275-create-transcribe-room-rpc.spec.ts
--
-- THE BUG. P1207 narrowed transcribe_rooms' SELECT policy from USING (true) to
-- members-only, closing a room-code enumeration hole. `INSERT ... RETURNING` is evaluated
-- under the SELECT policy for the row it just wrote — and at the instant a room is created
-- its creator is not yet a member, so the read-back is refused and the whole INSERT aborts.
-- createRoom() used `.insert(...).select().single()`, which is exactly that statement, so
-- creating an ad-hoc room has been broken in production since 2026-09-01.
--
-- Proven rather than reasoned (test DB, two arms, one identity, both rolled back, with
-- SET LOCAL ROLE authenticated):
--     INSERT INTO transcribe_rooms (code) VALUES (...)              -> succeeds
--     INSERT INTO transcribe_rooms (code) VALUES (...) RETURNING id -> 42501
-- Arm one is the one that matters: the INSERT policy (WITH CHECK (true)) permits the
-- write. Only the read-back is refused. Nothing else about the table is broken.
--
-- WHY A FUNCTION, and why the fix used on the JOIN path does not work here. P1149 hit the
-- same trap on transcribe_room_members and split it into insert-then-read, which works
-- there because the second statement gets a fresh snapshot in which the member row exists.
-- For a ROOM there is no such snapshot: the creator still is not a member, so a separate
-- read is refused for the same reason the RETURNING was. (get_transcribe_room_by_code()
-- would technically read it back, being SECURITY DEFINER — rejected anyway, because that
-- leaves a window in which a room exists with no members, and a member-less room is
-- unreadable by its own creator AND un-endable, the UPDATE policy being member-scoped too.
-- The window is the defect; narrowing it is not fixing it.)
--
-- SCOPE OF THAT GUARANTEE, stated precisely. This function makes a member-less room
-- unreachable THROUGH ITSELF. It does not make one unrepresentable, because
-- transcribe_rooms still carries P1149's `WITH CHECK (true)` INSERT policy, and RLS is
-- enforced at PostgREST — not by the JS client — so any authenticated caller can still POST
-- the table directly and create one. Closing that is the paired contract migration
-- (…_p1275_b_close_direct_room_insert.sql), which is held to deploy time because it breaks
-- any client still taking the direct path.
--
-- Loosening the SELECT policy was rejected outright: it reintroduces the enumeration hole.
-- This migration does NOT touch any policy.
--
-- new function: create_transcribe_room does not exist in any prior migration (grep over
-- supabase/migrations/ returns this file only) and is absent from prod's pg_proc (checked
-- 2026-09-08). Nothing is redefined, so there is no prior version to diff against.
--
-- client-safe: purely additive — one NEW function, no policy, column or grant changed.
-- The currently-deployed bundle knows nothing about it and behaves exactly as it does
-- today (which is to say: still broken, until its own deploy lands). Apply this BEFORE the
-- client that calls it; the reverse order is the one that 404s.

CREATE OR REPLACE FUNCTION public.create_transcribe_room(
  p_code text,
  p_display_name text,
  p_session_id uuid,
  p_event_id uuid DEFAULT NULL
)
RETURNS TABLE (
  room_id uuid,
  room_code text,
  room_event_id uuid,
  room_created_at timestamptz,
  room_ended_at timestamptz,
  member_id uuid,
  member_display_name text,
  member_session_id uuid,
  member_joined_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- RETURNS TABLE columns are also plpgsql OUT variables, and `room_id` is additionally a
-- real column of transcribe_room_members. Where the two meet in a bare expression, Postgres
-- raises 42702 ("column reference is ambiguous") — at first CALL, not at CREATE, because
-- plpgsql compiles the body lazily. P1236 shipped a migration that applied cleanly and then
-- failed on every invocation for exactly this reason, and silenced it with
-- `#variable_conflict use_column`.
--
-- This function deliberately does NOT set that. Every value is carried in a v_-prefixed
-- local and every column reference is qualified, so there is no ambiguity to resolve today.
-- Setting `use_column` would only affect a FUTURE edit that introduced one — and it would
-- resolve it SILENTLY to the column instead of raising. That is the opposite of failing
-- safe: it trades a loud 42702 on the first call for a wrong value written by a
-- SECURITY DEFINER function with no error at all. Postgres's default (`error`) is the
-- safe setting here; leave it alone.
DECLARE
  v_uid     uuid := auth.uid();
  v_name    text := btrim(coalesce(p_display_name, ''));
  v_room    public.transcribe_rooms%ROWTYPE;
  v_member  public.transcribe_room_members%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- The client's generateTranscribeRoomCode() emits 6 chars from a 32-symbol alphabet with
  -- I, O, 0 and 1 removed (P1097 made it a CSPRNG). Validated here rather than as a table
  -- CHECK: rows predating this migration — including test fixtures — carry other shapes,
  -- and a CHECK would have to either reject them or be written loose enough to be useless.
  IF p_code IS NULL OR p_code !~ '^[A-HJ-NP-Z2-9]{6}$' THEN
    RAISE EXCEPTION 'room code must be 6 characters from the room-code alphabet'
      USING ERRCODE = '22023';
  END IF;

  IF length(v_name) = 0 OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'display name must be between 1 and 100 characters'
      USING ERRCODE = '22023';
  END IF;

  -- The clarity_sessions row is this seat's recording. The INSERT policy this function
  -- supersedes for the create path checked only profile_id = auth.uid() and never looked at
  -- session_id at all, so a caller could attach ANOTHER user's recording to their own seat.
  -- Bypassing RLS means inheriting the duty to be at least as strict as what it replaced —
  -- here, stricter. P1236 applies the same check on the JOIN path, but that work is still
  -- on an unmerged branch — do not read this as a reference to existing migration history.
  IF NOT EXISTS (
    SELECT 1 FROM public.clarity_sessions s
    WHERE s.id = p_session_id AND s.creator_profile_id = v_uid
  ) THEN
    RAISE EXCEPTION 'session does not belong to the caller' USING ERRCODE = '42501';
  END IF;

  -- A unique_violation on `code` is deliberately NOT caught. The client generates the code
  -- and retries up to five times on 23505; swallowing it here would turn a recoverable
  -- collision into a silent failure or a wrong room.
  INSERT INTO public.transcribe_rooms (code, event_id)
  VALUES (p_code, p_event_id)
  RETURNING * INTO v_room;

  -- The whole point: the membership lands in the SAME transaction as the room, so the
  -- state this bug is about — a room whose creator cannot read or end it — is not
  -- representable. Either both rows exist or neither does.
  INSERT INTO public.transcribe_room_members (room_id, profile_id, display_name, session_id)
  VALUES (v_room.id, v_uid, v_name, p_session_id)
  RETURNING * INTO v_member;

  RETURN QUERY SELECT
    v_room.id, v_room.code, v_room.event_id, v_room.created_at, v_room.ended_at,
    v_member.id, v_member.display_name, v_member.session_id, v_member.joined_at;
END;
$$;

COMMENT ON FUNCTION public.create_transcribe_room(text, text, uuid, uuid) IS
  'P1275: creates a /transcribe room and its creator''s membership in one transaction. '
  'Required because transcribe_rooms'' SELECT policy is member-scoped (P1207), which makes '
  'INSERT ... RETURNING fail for the creator — they are not a member yet. Derives '
  'profile_id from auth.uid(); do not add a profile_id argument.';

-- REVOKE ... FROM PUBLIC does not remove a role-direct grant, and Supabase's
-- ALTER DEFAULT PRIVILEGES hands new functions to anon and authenticated directly
-- (P1065; hit again on P1236's unmerged branch, where its join RPC needed a second
-- migration to close the same gap).
-- Revoke both explicitly, then grant back only the one that should have it.
REVOKE ALL ON FUNCTION public.create_transcribe_room(text, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_transcribe_room(text, text, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_transcribe_room(text, text, uuid, uuid) TO authenticated;
