-- Migration: P1604 (5/5) — the older per-person pass keeps its timing for rooms the sweep ends
-- Created: 2026-11-04
-- Spec: features/p1604_transcription_belongs_to_a_chat.md (Appetite: "the older per-person pass stays as the fallback")
-- Guaranteed by: e2e/integration/p1307-sweep-tick.spec.ts ("ending a room creates exactly one transcription-job row per member")
--
-- diffed against: transcribe_room_sweep_tick 20261103090100_p1604_transcription_belongs_to_a_chat_rooms.sql (same body, signature
--   and grants). ONE change: a room this tick closed because nobody was sending (everyone silent for 10 minutes, or everyone
--   paused for 10 minutes) gets its older-pass jobs in the same tick again, exactly as before P1604. Nobody is uploading to a
--   room like that, so the 2-minute wait that 20261103090100 added for every ended room is not needed there. Rooms the last
--   Stop closed, and rooms the 3-hour roll ended (their people flush a final chunk after moving), still wait 2 minutes.
--   This keeps the older pass "unchanged" where it can be, and the p1307 sweep-tick spec true without edits.
--
-- client-safe: function body only; no signature, grant, column or policy change.

CREATE OR REPLACE FUNCTION public.transcribe_room_sweep_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Rule 8: the ROOM'S clock. 176 < the cleaner's 3-hour limit (round_clean.MAX_WINDOW_S), so even with a 2-minute sweep the
  -- room ends before its window can exceed it. The slice and signed-URL functions refuse at 180 minutes as a backstop.
  c_roll  CONSTANT interval := interval '176 minutes';
  -- Rules 4 + 5 (founder: 10 minutes). The client's paused heartbeat (every 2 minutes) stays well inside it.
  c_stale CONSTANT interval := interval '10 minutes';
  -- Rule 4 of the Resolved Decisions: audio recorded before a Stop may upload for this long afterwards.
  c_late  CONSTANT interval := interval '2 minutes';
  v_room  uuid;
  -- rooms THIS tick closed because nobody was sending (silent or paused): no final upload can be in flight
  v_swept uuid[] := '{}';
BEGIN
  FOR v_room IN SELECT r.id FROM public.transcribe_rooms r WHERE r.ended_at IS NULL ORDER BY r.id LOOP
    -- the same lock enter, join and end take; skip a room another transaction closed while this tick waited
    PERFORM 1 FROM public.transcribe_rooms r WHERE r.id = v_room AND r.ended_at IS NULL FOR UPDATE;
    CONTINUE WHEN NOT FOUND;

    -- Rule 4: someone who vanished without Stop is waited for up to 10 minutes of silence from their device.
    UPDATE public.transcribe_room_members m SET capture_ended_at = now()
     WHERE m.room_id = v_room AND m.capture_ended_at IS NULL
       AND COALESCE(m.last_seen_at, m.joined_at) < now() - c_stale;

    -- Rule 5: everyone still recording is paused, and has been for 10 minutes: the session ends.
    IF EXISTS (SELECT 1 FROM public.transcribe_room_members m WHERE m.room_id = v_room AND m.capture_ended_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM public.transcribe_room_members m
                        WHERE m.room_id = v_room AND m.capture_ended_at IS NULL
                          AND (m.paused_since IS NULL OR m.paused_since >= now() - c_stale)) THEN
      UPDATE public.transcribe_room_members m SET capture_ended_at = now()
       WHERE m.room_id = v_room AND m.capture_ended_at IS NULL;
    END IF;

    -- Rule 8: a session running 3 hours is ended and carried on as Part 2.
    IF EXISTS (SELECT 1 FROM public.transcribe_rooms r WHERE r.id = v_room AND r.created_at + c_roll <= now()) THEN
      PERFORM public._transcribe_roll_room(v_room);
    ELSIF public._transcribe_close_room_if_idle(v_room) THEN
      v_swept := v_swept || v_room;
    END IF;
  END LOOP;

  -- The older per-person pass: one job per member of every room that ended at least c_late ago (the final audio of a Stop
  -- may still be uploading before that). Bounded to the last day so a backlog of old rooms is never queued. Members with
  -- last_seen_at IS NULL are pre-P1307 seats with no archive layout to reassemble (see 20260914120300).
  INSERT INTO public.transcribe_room_transcription_jobs (room_id, member_id)
  SELECT m.room_id, m.id
    FROM public.transcribe_rooms r
    JOIN public.transcribe_room_members m ON m.room_id = r.id
   WHERE r.ended_at IS NOT NULL
     AND (r.id = ANY (v_swept)
          OR (r.ended_at <= now() - c_late AND r.ended_at > now() - interval '1 day'))
     AND m.last_seen_at IS NOT NULL
  ON CONFLICT (room_id, member_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.transcribe_room_sweep_tick() IS
  'P1307 Decision 2 + P1604: ends silent members (10 minutes) and rooms whose open members are all paused for 10 minutes, '
  'rolls a room at 176 minutes into Part 2, closes idle rooms, and creates the older pass'' jobs for rooms ended 2 minutes ago. '
  'A last Stop closes its room itself (end_transcribe_room_capture). Takes the room row lock. Idempotent.';

REVOKE ALL ON FUNCTION public.transcribe_room_sweep_tick() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transcribe_room_sweep_tick() FROM anon;
REVOKE ALL ON FUNCTION public.transcribe_room_sweep_tick() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transcribe_room_sweep_tick() TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.transcribe_room_sweep_tick()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.transcribe_room_sweep_tick()', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1604: transcribe_room_sweep_tick is client-callable';
  END IF;
END
$check$;
