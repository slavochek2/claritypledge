-- P1236 (f): one shared /transcribe room — everybody who opens the page lands in the SAME
-- room, instead of each person silently creating their own.
-- Spec: features/p1236_server_side_live_transcription_for_rooms.md
--
-- WHY THIS EXISTS. Joining a specific room by code has worked since P1149, and creating one
-- has worked since P1275. What has never existed is any way for a second person to LEARN a
-- code: the room screen renders the roster, the listening indicator and the messages, and
-- nowhere does it display `room.code` or offer a link (verified 2026-09-10 — the only
-- reference to `.code` in transcribe-room-page.tsx is the archival upload path). So in
-- practice every visitor created a fresh room and sat in it alone, and the two-participant
-- case — the entire point of the feature — was unreachable by ordinary use.
--
-- The founder's call, and it is the right one: do not add a share affordance, remove the
-- need for it. "Nobody knows about /transcribe. It's not like we expect people randomly go
-- into different rooms." Multi-room is a capability with no current demand; the code column,
-- the /transcribe/:code route and join_transcribe_room() all remain exactly as they are, so
-- the day a second room is genuinely wanted, nothing has to be rebuilt.
--
-- WHY A FUNCTION RATHER THAN A CLIENT-SIDE "find, else create". Two people opening the page
-- in the same second would both find nothing and both create — producing precisely the split
-- rooms this replaces, intermittently and unreproducibly. The advisory lock below makes
-- find-or-create atomic against concurrent callers. It is transaction-scoped, so it is
-- released on COMMIT or on any error; there is no unlock path to forget.
--
-- WHY THE AGE BOUND MATTERS HERE TOO. `ended_at IS NULL` alone is not "open": a room is only
-- ever ended server-side when a slice arrives for it after its duration cap, so an abandoned
-- room keeps `ended_at` NULL forever. Without the age bound this function would happily drop
-- every new visitor into a dead room from three weeks ago. 180 minutes is
-- ROOM_MAX_DURATION_MINUTES in transcribe-slice/handler.ts — the same number the ingest
-- enforces per-slice, so a room this function hands back can always still accept audio.
-- Duplicated as a literal because a Deno constant is not reachable from SQL; if one moves,
-- move both. (The sibling instance of this same bound is countActiveRooms in index.ts.)
--
-- new function
-- client-safe: additive. Creates a NEW function and changes no existing signature, so the
-- deployed bundle keeps working unchanged; the client that calls it ships in the same merge.

CREATE OR REPLACE FUNCTION public.enter_transcribe_room(
  p_display_name text,
  p_session_id uuid,
  p_consent boolean,
  p_new_code text,
  p_event_id uuid DEFAULT NULL
)
RETURNS TABLE (
  room_id uuid,
  room_code text,
  room_event_id uuid,
  room_created_at timestamptz,
  room_ended_at timestamptz,
  member_id uuid,
  member_profile_id uuid,
  member_display_name text,
  member_session_id uuid,
  member_joined_at timestamptz,
  member_consent_given_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- No `#variable_conflict use_column`, for the reason create_transcribe_room states at
-- length: RETURNS TABLE columns are OUT variables, `room_id` is also a real column of
-- transcribe_room_members, and resolving that silently to the column would let a future
-- edit write a wrong value from a SECURITY DEFINER function with no error. Every value is
-- carried in a v_-prefixed local and every column reference is qualified.
DECLARE
  -- Fixed key: this is a single global rendezvous, so every caller contends on one lock.
  -- Chosen by hashing the function's own name so it cannot collide with an unrelated
  -- advisory lock elsewhere in the schema.
  c_lock_key CONSTANT bigint := hashtext('p1236:enter_transcribe_room');
  c_max_age  CONSTANT interval := interval '180 minutes';
  v_uid      uuid := auth.uid();
  v_name     text := btrim(coalesce(p_display_name, ''));
  v_room     public.transcribe_rooms%ROWTYPE;
  v_member   public.transcribe_room_members%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- IS NOT TRUE, not = FALSE: NULL must refuse too. Same wording and errcode as
  -- join_transcribe_room and create_transcribe_room, so all three are indistinguishable
  -- to a caller.
  IF p_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'consent is required to join a transcription room' USING ERRCODE = '42501';
  END IF;

  IF length(v_name) = 0 OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'display name must be between 1 and 100 characters'
      USING ERRCODE = '22023';
  END IF;

  -- Bypassing RLS means inheriting the duty to be at least as strict as what it replaced:
  -- without this a caller could attach another user's recording to their own seat.
  IF NOT EXISTS (
    SELECT 1 FROM public.clarity_sessions s
    WHERE s.id = p_session_id AND s.creator_profile_id = v_uid
  ) THEN
    RAISE EXCEPTION 'session does not belong to the caller' USING ERRCODE = '42501';
  END IF;

  -- Everything above validates the CALLER and can run concurrently. Only the find-or-create
  -- below needs serialising, so the lock is taken as late as possible.
  PERFORM pg_advisory_xact_lock(c_lock_key);

  SELECT r.* INTO v_room
  FROM public.transcribe_rooms r
  WHERE r.ended_at IS NULL
    AND r.created_at > now() - c_max_age
    AND r.event_id IS NOT DISTINCT FROM p_event_id
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    IF p_new_code IS NULL OR p_new_code !~ '^[A-HJ-NP-Z2-9]{6}$' THEN
      RAISE EXCEPTION 'room code must be 6 characters from the room-code alphabet'
        USING ERRCODE = '22023';
    END IF;
    -- A unique_violation on `code` is deliberately NOT caught, matching
    -- create_transcribe_room: the client retries on 23505, and swallowing it here would turn
    -- a recoverable collision into a wrong room.
    INSERT INTO public.transcribe_rooms (code, event_id)
    VALUES (p_new_code, p_event_id)
    RETURNING * INTO v_room;
  END IF;

  INSERT INTO public.transcribe_room_members AS m
    (room_id, profile_id, display_name, session_id, consent_given_at)
  VALUES (v_room.id, v_uid, v_name, p_session_id, now())
  -- A refresh, a second tab, or simply arriving again re-enters here. Idempotent, and it
  -- preserves the ORIGINAL consent timestamp rather than restamping it: "when did this
  -- person agree" has one answer, and it is the first one. Same rule as join_transcribe_room.
  ON CONFLICT (room_id, profile_id) DO UPDATE
    SET consent_given_at = COALESCE(m.consent_given_at, now()),
        display_name     = EXCLUDED.display_name
  RETURNING * INTO v_member;

  RETURN QUERY SELECT
    v_room.id, v_room.code, v_room.event_id, v_room.created_at, v_room.ended_at,
    v_member.id, v_member.profile_id, v_member.display_name, v_member.session_id,
    v_member.joined_at,
    v_member.consent_given_at;
END;
$$;

COMMENT ON FUNCTION public.enter_transcribe_room(text, uuid, boolean, text, uuid) IS
  'P1236 (f): the single entry point for /transcribe with no room code. Atomically joins the '
  'newest room that can still accept audio (not ended, and younger than the ingest''s own '
  'duration cap) or creates one if there is none, and writes the caller''s consent in the '
  'same statement as the membership. Serialised by a transaction-scoped advisory lock so two '
  'simultaneous arrivals cannot split into two rooms. Derives profile_id from auth.uid(); do '
  'not add a profile_id argument, and do not add a consent-less overload.';

-- REVOKE ... FROM PUBLIC does not remove a role-direct grant, and Supabase's
-- ALTER DEFAULT PRIVILEGES hands every NEW function to anon directly (P1065). This function
-- is newly created, so it gets that fresh default grant and the revokes below are
-- load-bearing rather than ceremonial.
REVOKE ALL ON FUNCTION public.enter_transcribe_room(text, uuid, boolean, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enter_transcribe_room(text, uuid, boolean, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.enter_transcribe_room(text, uuid, boolean, text, uuid) TO authenticated;

-- POST-CONDITION: prove anon cannot execute what was just granted. P1065 is the reason this
-- is checked rather than assumed — the default grant is invisible in the migration text.
DO $check$
BEGIN
  IF has_function_privilege('anon',
       'public.enter_transcribe_room(text, uuid, boolean, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION
      'P1236(f): anon can still EXECUTE enter_transcribe_room — the P1065 default grant survived';
  END IF;
END
$check$;
