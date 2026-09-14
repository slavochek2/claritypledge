-- Migration: P1307 (1/4) — per-person end of capture, the paused heartbeat, and no client room end
-- Created: 2026-09-14
-- Spec: features/p1307_event_transcription_from_ready_across_pages_into_sessions.md
--   Architecture Decision 1 (per-member end marker), Decision 2 correction (last_seen_at +
--   touch_transcribe_room_capture), Security Review Parent verification 1 (drop the
--   "room members can end the room" UPDATE policy in THIS migration).
-- Guaranteed by: e2e/integration/p1307-end-capture-rpc.spec.ts,
--   e2e/integration/p1307-chunk-and-heartbeat-rpc.spec.ts (touch half),
--   e2e/integration/p1307-schema-and-grants.spec.ts,
--   e2e/integration/20260824000000_p1149_room_end_policy_column_guard.spec.ts (inverted)
--
-- WHAT CHANGES.
--   1. transcribe_room_members.capture_ended_at — when THIS member's capture stopped. Written
--      only by end_transcribe_room_capture() (the member themselves) or by the sweep
--      (…_120300), never by another client. First-wins, like consent_given_at.
--   2. transcribe_room_members.last_seen_at — the last time this member's device showed it
--      was still there: every accepted slice (transcribe-slice, service role) AND the paused
--      heartbeat below. Staleness is measured from this, not from transcribe_messages
--      .spoken_at, because silent slices never write a message and a paused member (a /live
--      session, an explain-back recording, an immersive letter screen) sends no slices at all.
--   3. The "room members can end the room" UPDATE policy is DROPPED and no client UPDATE is
--      left on transcribe_rooms. Under P1307 no client ends a room for anyone else: a room
--      ends only when the sweep finds every member ended (…_120300). Leaving the policy in
--      place would let the old one-member-ends-it-for-all path coexist with the per-person
--      RPC and defeat the invariant. The column-guard trigger from 20260824000000 stays as
--      defence in depth against any future policy that reopens UPDATE on this table.
--
-- NO UPDATE POLICY ON transcribe_room_members IS ADDED, for either column. Both are writable
-- only through SECURITY DEFINER functions that derive the member from auth.uid() and take no
-- member id — the same "client-invisible and client-unsettable by construction" shape
-- consent_given_at and slice_count already have (20260908170000).
--
-- new function: end_transcribe_room_capture(uuid) and touch_transcribe_room_capture(uuid) do not
--   exist in any prior migration; nothing is redefined.
--
-- client-safe: the columns and functions are additive. The dropped policy only affects a
--   client that ends a room with a direct UPDATE (the pre-P1307 endRoom()). Such an UPDATE
--   now matches zero rows and returns no error — the old client already reads zero rows as
--   "someone else ended it first" — and the room is ended server-side by the sweep that ships
--   in 20260914120300 of this same release. Nothing that was working starts throwing.

ALTER TABLE public.transcribe_room_members
  ADD COLUMN IF NOT EXISTS capture_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

COMMENT ON COLUMN public.transcribe_room_members.capture_ended_at IS
  'P1307: when this member''s capture stopped. Set by end_transcribe_room_capture() (the member) '
  'or transcribe_room_sweep_tick() (cap or staleness), cleared by enter_transcribe_room() on a '
  're-join into a still-open room. No client UPDATE policy exists for it; do not add one.';

COMMENT ON COLUMN public.transcribe_room_members.last_seen_at IS
  'P1307: last presence signal from this member''s device — an accepted slice (service role) or '
  'the paused heartbeat (touch_transcribe_room_capture). The sweep ends a member whose signal is '
  'older than 10 minutes. Not last_slice_at: a paused member sends no slices and must not read as gone.';

-- ── end_transcribe_room_capture ─────────────────────────────────────────────
-- No member-id argument: a function that accepts the identity it is about to act on is an
-- impersonation primitive. The WHERE clause makes it structurally impossible to reach
-- another member's row.
CREATE OR REPLACE FUNCTION public.end_transcribe_room_capture(p_room_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_ended_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- COALESCE: first-wins. A second End (the bar and the room page, two taps, a retry) keeps
  -- the original time, which the whole-recording pass reads to judge archive completeness.
  UPDATE public.transcribe_room_members AS m
     SET capture_ended_at = COALESCE(m.capture_ended_at, now())
   WHERE m.room_id = p_room_id
     AND m.profile_id = v_uid
  RETURNING m.capture_ended_at INTO v_ended_at;

  IF NOT FOUND THEN
    -- Same message as the edge functions' not-a-member refusal: a caller learns nothing about
    -- a room they are not in.
    RAISE EXCEPTION 'not a member of this room' USING ERRCODE = '42501';
  END IF;

  RETURN v_ended_at;
END;
$$;

COMMENT ON FUNCTION public.end_transcribe_room_capture(uuid) IS
  'P1307 Decision 1: ends the CALLER''s own capture in a transcribe room (first-wins). Never ends '
  'the room and never touches another member. Derives the member from auth.uid(); do not add a '
  'member id argument.';

-- ── touch_transcribe_room_capture ───────────────────────────────────────────
-- The paused heartbeat. Carries no audio and writes no archive: it only says "this device is
-- still here, deliberately not sending". A tab closed while paused stops touching and the
-- sweep ends it after N minutes, as intended.
CREATE OR REPLACE FUNCTION public.touch_transcribe_room_capture(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.transcribe_room_members AS m
     SET last_seen_at = now()
   WHERE m.room_id = p_room_id
     AND m.profile_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not a member of this room' USING ERRCODE = '42501';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.touch_transcribe_room_capture(uuid) IS
  'P1307 Decision 2 correction: the paused-capture heartbeat. Stamps last_seen_at on the CALLER''s '
  'own member row only. No audio, no slice. Derives the member from auth.uid().';

-- REVOKE ... FROM PUBLIC does not remove Supabase's role-direct default grant to anon (P1065);
-- both revokes are required, and the post-condition below reads the live catalog to prove it.
REVOKE ALL ON FUNCTION public.end_transcribe_room_capture(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.end_transcribe_room_capture(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.end_transcribe_room_capture(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.touch_transcribe_room_capture(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_transcribe_room_capture(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.touch_transcribe_room_capture(uuid) TO authenticated;

-- ── No client ends a room ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "room members can end the room" ON public.transcribe_rooms;

-- POST-CONDITIONS, read from the live catalog rather than trusted from the text above.
DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.end_transcribe_room_capture(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1307: anon still holds EXECUTE on end_transcribe_room_capture(uuid)';
  END IF;
  IF has_function_privilege('anon', 'public.touch_transcribe_room_capture(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1307: anon still holds EXECUTE on touch_transcribe_room_capture(uuid)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'transcribe_rooms' AND cmd IN ('UPDATE', 'ALL')
  ) THEN
    RAISE EXCEPTION 'P1307: a client UPDATE policy is still present on transcribe_rooms — '
      'no client may end a room for anyone else';
  END IF;
END
$check$;
