-- Migration: P1236 (Migration C) — one transaction for the message and its counter
-- Created: 2026-09-08
-- Spec: features/p1236_server_side_live_transcription_for_rooms.md (Decision 6, ceiling 2)
--
-- client-safe: purely additive, and not reachable by a client at all. One NEW function,
-- EXECUTE granted to service_role only. No policy, column or existing function is touched,
-- so the deployed bundle — which cannot call it — is unaffected in either deploy order.
--
-- WHY A FUNCTION rather than two writes from the edge function.
--
-- Decision 6 says the per-member slice counter is "incremented by the service-role write
-- in the same statement as the message insert". Two separate PostgREST calls cannot be
-- that: a failed insert after a successful bump leaves the ceiling counting slices that
-- were never transcribed, and a failed bump after a successful insert leaves the ceiling
-- permanently under-counting — which is the direction that matters, because the ceiling is
-- a SPEND control and an under-counting spend control is not one. A function body is a
-- single transaction, so both land or neither does.
--
-- WHY service_role ONLY. The whole point of Decision 2 is that attribution is derived
-- server-side and never accepted from a client. A function that writes an attributed
-- transcript row while bypassing RLS is exactly the primitive a client must not hold, so
-- it is granted to nobody else — not authenticated, not anon. transcribe_messages' own
-- "room members can send their own messages" INSERT policy is unchanged and still governs
-- what a client can write directly.
--
-- new function: record_transcribe_slice does not exist in any prior migration.

CREATE OR REPLACE FUNCTION public.record_transcribe_slice(
  p_room_id uuid,
  p_member_id uuid,
  p_text text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- The counter moves FIRST so that NOT FOUND aborts before anything is written. This
  -- also re-checks the (member, room) pairing the caller claims: the edge function already
  -- derived member_id from (room_id, auth.uid()), and this is the second lock on the same
  -- door — cheap, and the door it guards is speaker attribution.
  UPDATE public.transcribe_room_members
     SET slice_count = slice_count + 1
   WHERE id = p_member_id
     AND room_id = p_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member does not belong to this room' USING ERRCODE = '42501';
  END IF;

  -- spoken_at is deliberately absent: it takes the column DEFAULT now(). It is the
  -- de-duplication ordering key (Decision 4), and a caller that can set it can choose the
  -- merge order. is_final is likewise fixed — the CHECK constraint only ever admits true,
  -- and the live path has no interim text to write now that useSpeechToText is gone.
  INSERT INTO public.transcribe_messages (room_id, member_id, text, is_final)
  VALUES (p_room_id, p_member_id, btrim(p_text), true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.record_transcribe_slice(uuid, uuid, text) IS
  'P1236 Decision 6: writes one de-duplicated transcript row and advances that member''s '
  'slice counter in one transaction. service_role only — a client holding this could write '
  'an attributed transcript row with RLS bypassed. spoken_at is never a parameter.';

REVOKE ALL ON FUNCTION public.record_transcribe_slice(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_transcribe_slice(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.record_transcribe_slice(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_transcribe_slice(uuid, uuid, text) TO service_role;
