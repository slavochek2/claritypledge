-- Migration: P1529 / INBOX-338 -- reserve the numbers of chunks lost before upload together with the next chunk's, in one call
-- Created: 2026-11-14
-- Spec: features/p1529_canvas_event_host_coordination.md ("INBOX-338 transcription fixes")
-- Guaranteed by: e2e/integration/p1529-reserve-after-gap.spec.ts
--
-- WHY. The capture's upload queue sheds or drops a chunk that never got its number during a long outage. Its number is left
-- unused so the archive keeps the hole (the whole-recording pass times chunks by their numbers). Reserving each such number
-- with its own reserve_room_chunk_number call is one RPC per lost chunk (metered-services rule 1, review); this reserves the
-- skipped range and the chunk's own number in one statement.
--
-- new function: reserve_room_chunk_number_after_gap(uuid, integer). Same caller derivation and refusals as
--   reserve_room_chunk_number (20260914120100): the member row is (p_room_id, auth.uid()), never an argument.
-- client-safe: a new function; nothing existing changes. A client older than this branch never calls it.

BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_room_chunk_number_after_gap(p_room_id uuid, p_skip integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_seq integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  -- At most a few hours of 30 s chunks; anything else is a client bug, refused before anything is written.
  IF p_skip IS NULL OR p_skip < 0 OR p_skip > 10000 THEN
    RAISE EXCEPTION 'skip out of range' USING ERRCODE = '22023';
  END IF;

  -- The UPDATE takes the row lock, as in reserve_room_chunk_number: concurrent reservations for one member serialise.
  UPDATE public.transcribe_room_members AS m
     SET next_chunk_seq = m.next_chunk_seq + p_skip + 1
   WHERE m.room_id = p_room_id
     AND m.profile_id = v_uid
  RETURNING m.next_chunk_seq - 1 INTO v_seq;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not a member of this room' USING ERRCODE = '42501';
  END IF;

  RETURN v_seq;
END;
$$;

COMMENT ON FUNCTION public.reserve_room_chunk_number_after_gap(uuid, integer) IS
  'P1529 INBOX-338: leaves p_skip archive chunk numbers unused (chunks lost before upload) and reserves and returns the next one, '
  'in one call. Derives the member from auth.uid().';

REVOKE ALL ON FUNCTION public.reserve_room_chunk_number_after_gap(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_room_chunk_number_after_gap(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.reserve_room_chunk_number_after_gap(uuid, integer) TO authenticated;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.reserve_room_chunk_number_after_gap(uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'INBOX-338: anon still holds EXECUTE on reserve_room_chunk_number_after_gap';
  END IF;
END
$check$;

COMMIT;
