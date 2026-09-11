-- P1236 (g): enter_transcribe_room failed on EVERY call — "column reference room_id is
-- ambiguous" (42702). Fix-forward for 20260910120000_p1236_f_enter_shared_room.sql.
-- Spec: features/p1236_server_side_live_transcription_for_rooms.md
--
-- WHAT BROKE. RETURNS TABLE columns are also plpgsql OUT VARIABLES. `room_id` is both an
-- OUT variable of this function and a real column of transcribe_room_members, and inside
-- ON CONFLICT's target list postgres cannot tell which one is meant. The function COMPILES
-- — the collision is invisible at CREATE time — and every call fails at runtime.
--
-- WHY (f) HAD IT AND ITS SIBLING DID NOT. join_transcribe_room hit this exact error first
-- (20260908170000, lines 138-147) and fixed it with `#variable_conflict use_column`,
-- writing down why that is safe there. (f) then read that note and deliberately went the
-- OTHER way: "No #variable_conflict use_column ... Every value is carried in a v_-prefixed
-- local and every column reference is qualified."
--
-- The first half is true. The second is not, and cannot be: **ON CONFLICT's conflict-target
-- list does not accept a qualified name.** `ON CONFLICT (m.room_id, ...)` is a syntax
-- error, so the one place the ambiguity actually arises is the one place the chosen
-- strategy has no way to reach. Qualifying everything else is necessary and insufficient.
--
-- create_transcribe_room never hit it because it has no ON CONFLICT at all — so "the
-- sibling works, therefore the approach is sound" was never evidence for (f).
--
-- HOW IT REACHED PRODUCTION-SHAPED CODE. The migration applies cleanly, the DO-block
-- post-condition passes, and a service-role probe returns the function's own 42501
-- "not authenticated" guard — which reads as "the function is reachable and correct". It
-- is reachable. It is not correct. Nothing short of an authenticated call reaches the
-- INSERT, and no test made one until the two-participant e2e was written (P1236 Done-When,
-- 2026-09-11), which failed on its first run with exactly this error.
--
-- WHY use_column IS SAFE HERE, checked rather than copied from the sibling: nothing in
-- this body reads an OUT variable. Every value is produced into a v_-prefixed local and
-- returned by RETURN QUERY from those locals; arguments are p_-prefixed and constants are
-- c_-prefixed, so none of them can collide with a column name. The only name that collides
-- at all is `room_id`, and resolving it to the column is what we want everywhere it
-- appears. Renaming the OUT columns is NOT an option — they are the JSON keys the client
-- maps to DbCreatedRoom.
--
-- Everything below is byte-identical to (f) except the added #variable_conflict line.
-- Grants and the anon-revoke post-condition are unchanged and are not repeated: CREATE OR
-- REPLACE preserves both, and re-issuing them would imply they had been lost.
--
-- diffed against: 20260910120000_p1236_f_enter_shared_room.sql
--   The ONLY difference is the added `#variable_conflict use_column` line. Signature,
--   RETURNS TABLE columns, guards, lock, query and INSERT are byte-identical — verified by
--   diffing the two bodies rather than by reading them side by side.
--
-- client-safe: replaces a function body only. No signature change, no column change.

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
#variable_conflict use_column
DECLARE
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

  IF p_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'consent is required to join a transcription room' USING ERRCODE = '42501';
  END IF;

  IF length(v_name) = 0 OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'display name must be between 1 and 100 characters'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clarity_sessions s
    WHERE s.id = p_session_id AND s.creator_profile_id = v_uid
  ) THEN
    RAISE EXCEPTION 'session does not belong to the caller' USING ERRCODE = '42501';
  END IF;

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
    INSERT INTO public.transcribe_rooms (code, event_id)
    VALUES (p_new_code, p_event_id)
    RETURNING * INTO v_room;
  END IF;

  INSERT INTO public.transcribe_room_members AS m
    (room_id, profile_id, display_name, session_id, consent_given_at)
  VALUES (v_room.id, v_uid, v_name, p_session_id, now())
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
