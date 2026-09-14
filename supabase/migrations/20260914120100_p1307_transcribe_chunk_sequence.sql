-- Migration: P1307 (2/4) — server-issued, monotonic archive chunk numbers
-- Created: 2026-09-14
-- Spec: features/p1307_event_transcription_from_ready_across_pages_into_sessions.md
--   Architecture Decision 6.
-- Guaranteed by: e2e/integration/p1307-chunk-and-heartbeat-rpc.spec.ts
--
-- THE BUG. The room page numbered archive chunks with a client-local counter that restarts at
-- 0 on every mount (transcribe-room-page.tsx chunkNumberRef). Object names are
-- chunk_NNN.webm under a per-member prefix, and signing carries no overwrite precondition, so
-- pause/resume, a refresh, re-entry or a second tab rewrote chunk_000.webm — the opening of
-- the recording was silently replaced by whatever came after the return.
--
-- THE FIX. The number is server state. reserve_room_chunk_number() advances
-- next_chunk_seq and returns the previous value in one statement, so two calls can never
-- receive the same number and a reload continues where the member left off. One contiguous
-- sequence per member is also what the whole-recording pass reads to detect a gap.
--
-- Not done here, and flagged rather than designed (Decision 6): an ifGenerationMatch: 0
-- precondition on the signed URL. That lives in the out-of-repo Cloud Function.
--
-- new function: reserve_room_chunk_number(uuid) does not exist in any prior migration; nothing is
--   redefined.
--
-- client-safe: purely additive — a defaulted NOT NULL column and a new function. Existing
--   clients never read the column and never call the function.

ALTER TABLE public.transcribe_room_members
  ADD COLUMN IF NOT EXISTS next_chunk_seq integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.transcribe_room_members.next_chunk_seq IS
  'P1307 Decision 6: the next archive chunk number this member will be issued. Advanced only by '
  'reserve_room_chunk_number(). Never reset — an archived chunk must never be overwritten.';

CREATE OR REPLACE FUNCTION public.reserve_room_chunk_number(p_room_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_seq integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- The UPDATE takes the row lock, so concurrent reservations for one member serialise and
  -- each sees the value the previous one wrote.
  UPDATE public.transcribe_room_members AS m
     SET next_chunk_seq = m.next_chunk_seq + 1
   WHERE m.room_id = p_room_id
     AND m.profile_id = v_uid
  RETURNING m.next_chunk_seq - 1 INTO v_seq;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not a member of this room' USING ERRCODE = '42501';
  END IF;

  RETURN v_seq;
END;
$$;

COMMENT ON FUNCTION public.reserve_room_chunk_number(uuid) IS
  'P1307 Decision 6: reserves and returns the caller''s next archive chunk number (0, 1, 2, …), '
  'monotonic for the member''s whole room lifetime. Derives the member from auth.uid().';

REVOKE ALL ON FUNCTION public.reserve_room_chunk_number(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_room_chunk_number(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reserve_room_chunk_number(uuid) TO authenticated;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.reserve_room_chunk_number(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1307: anon still holds EXECUTE on reserve_room_chunk_number(uuid)';
  END IF;
END
$check$;
