-- Migration: P1604 (2/3) — session rules 1-5, 7, 8 in the database: enter / join / create / end / touch / sweep / roll
-- Created: 2026-11-03
-- Spec: features/p1604_transcription_belongs_to_a_chat.md (Session rules 1-9, Resolved Decisions 1-5, 8, 9)
-- Guaranteed by: e2e/integration/20261103090000_p1604_transcription_belongs_to_a_chat.spec.ts
--
-- diffed against:
--   enter_transcribe_room         20260914120200_p1307_transcribe_member_cap_source.sql (signature gains p_conversation_id,
--                                 RETURNS TABLE gains room_conversation_id + room_part_no, so the old function is DROPPED
--                                 first; selection, locking, rule-7 ending of other captures, chat access are new)
--   create_transcribe_room        20261102170000_p1596_open_round_at_room_end.sql (same body and grants; ends the caller's
--                                 other open captures before it writes, rule 7)
--   join_transcribe_room          20260915120100_p1315_join_room_event_access.sql (same signature and grants; the room row is
--                                 locked, a chat's room requires chat access even by code, other captures end)
--   end_transcribe_room_capture   20260914120000_p1307_transcribe_member_capture_end.sql (same signature and grants; locks the
--                                 room row and the LAST Stop closes the room in the same transaction)
--   touch_transcribe_room_capture 20260914120000_p1307_transcribe_member_capture_end.sql (RETURN TYPE CHANGES void -> table, so
--                                 it is DROPPED first; also sets paused_since)
--   transcribe_room_sweep_tick    20260914120300_p1307_transcribe_room_jobs_transcripts_sweep.sql (per-room lock; the 3-hour
--                                 clock is the ROOM'S and rolls at 176 minutes; paused members; older-pass jobs for any
--                                 ended room, not only rooms this tick ended)
--
-- READ BEFORE TOUCHING enter_transcribe_room's room selection: it is correct only because every path that ends or fills a
--   room takes the room row lock first (enter, join, end, the sweep and the roll all do). The partial unique index
--   transcribe_rooms_one_open_per_conversation is the backstop, not the mechanism.
--
-- LIMITS
--   * The older per-person pass' jobs for a room that the LAST STOP closed are created by the next sweep tick that finds the
--     room 2 minutes old (the window in which a Stop's final audio may still upload), not at the Stop. They used to be made
--     in the same statement that ended the room.
--   * The roll mints each moved person a new clarity_sessions row (so Part 2 has its own history entry). The columns it
--     writes are the ones createClaritySession writes; the access code is minted by the column default (P1097).
--
-- client-safe: enter_transcribe_room keeps every old parameter by name and adds two trailing RETURNS columns plus one
--   defaulted parameter; a deployed client sees the same shape plus extras. touch_transcribe_room_capture now returns a row
--   where it returned nothing; a deployed client ignores the result.

-- (get_transcribe_room_by_code is also redefined below, with its own diffed-against note.)

-- ── Shared helpers (internal; no client grant) ──────────────────────────────

-- A chat's room: the caller must be able to read the chat, and the mirror (a person's own notes) never has one.
CREATE OR REPLACE FUNCTION public.assert_transcribe_chat_access(p_conversation_id uuid, p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_conversation_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chat_conversations c WHERE c.id = p_conversation_id AND c.kind <> 'mirror')
     OR public._chat_access_since(p_conversation_id, p_uid) IS NULL THEN
    -- one message for not-found, mirror and not-a-member: nothing is learned about the chat
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_transcribe_chat_access(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- An event's chat maps to its event room while the event is inside its transcription window and is not a hike.
CREATE OR REPLACE FUNCTION public._transcribe_event_room_eligible(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
     WHERE e.id = p_event_id
       AND e.series_slug IS DISTINCT FROM 'social-hike'
       AND now() < e.datetime + public.event_grace_interval());
$$;
REVOKE ALL ON FUNCTION public._transcribe_event_room_eligible(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._transcribe_new_room_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  c_alphabet CONSTANT text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  i integer;
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1 .. 6 LOOP
      v_code := v_code || substr(c_alphabet, 1 + floor(random() * 32)::integer, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.transcribe_rooms r WHERE r.code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_new_room_code() FROM PUBLIC, anon, authenticated;

-- Ends a room whose members have ALL stopped. The caller holds the room row lock. Rule 3: no grace period.
CREATE OR REPLACE FUNCTION public._transcribe_close_room_if_idle(p_room uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed uuid;
BEGIN
  UPDATE public.transcribe_rooms r
     SET ended_at = now()
   WHERE r.id = p_room
     AND r.ended_at IS NULL
     AND EXISTS (SELECT 1 FROM public.transcribe_room_members m WHERE m.room_id = r.id)
     AND NOT EXISTS (SELECT 1 FROM public.transcribe_room_members m
                      WHERE m.room_id = r.id AND m.capture_ended_at IS NULL)
  RETURNING r.id INTO v_closed;
  RETURN v_closed IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_close_room_if_idle(uuid) FROM PUBLIC, anon, authenticated;

-- Rule 7: starting or joining somewhere stops the caller's recording everywhere else. Locks every involved room in id
-- order in ONE statement, so enter, join, end and the sweep cannot deadlock on each other.
CREATE OR REPLACE FUNCTION public._transcribe_lock_rooms(p_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 1 FROM public.transcribe_rooms r WHERE r.id = ANY (p_ids) ORDER BY r.id FOR UPDATE;
$$;
REVOKE ALL ON FUNCTION public._transcribe_lock_rooms(uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._transcribe_other_open_rooms(p_uid uuid, p_keep uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT r.id), '{}')
    FROM public.transcribe_rooms r
    JOIN public.transcribe_room_members m ON m.room_id = r.id
   WHERE m.profile_id = p_uid AND m.capture_ended_at IS NULL AND r.ended_at IS NULL
     AND r.id IS DISTINCT FROM p_keep;
$$;
REVOKE ALL ON FUNCTION public._transcribe_other_open_rooms(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- The rooms in p_rooms are already locked by the caller.
CREATE OR REPLACE FUNCTION public._transcribe_end_captures_in(p_uid uuid, p_rooms uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room uuid;
BEGIN
  FOR v_room IN SELECT x FROM unnest(p_rooms) x ORDER BY x LOOP
    UPDATE public.transcribe_room_members m
       SET capture_ended_at = COALESCE(m.capture_ended_at, now())
     WHERE m.room_id = v_room AND m.profile_id = p_uid;
    PERFORM public._transcribe_close_room_if_idle(v_room);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_end_captures_in(uuid, uuid[]) FROM PUBLIC, anon, authenticated;

-- ── enter_transcribe_room ───────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.enter_transcribe_room(text, uuid, boolean, text, uuid);

CREATE OR REPLACE FUNCTION public.enter_transcribe_room(
  p_display_name text,
  p_session_id uuid,
  p_consent boolean,
  p_new_code text,
  p_event_id uuid DEFAULT NULL,
  p_conversation_id uuid DEFAULT NULL
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
  member_consent_given_at timestamptz,
  room_conversation_id uuid,
  room_part_no integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- use_column: ON CONFLICT's target list cannot take a qualified name and room_id is both an OUT variable and a
-- column (see 20260911151200). Safe: no OUT variable is ever read; values live in v_/p_/c_ names.
#variable_conflict use_column
DECLARE
  c_lock_key CONSTANT bigint := hashtext('p1236:enter_transcribe_room');
  v_uid     uuid := auth.uid();
  v_name    text := btrim(coalesce(p_display_name, ''));
  v_conv    public.chat_conversations%ROWTYPE;
  v_event   uuid := p_event_id;
  v_conv_id uuid := p_conversation_id;
  v_room    public.transcribe_rooms%ROWTYPE;
  v_peek    uuid;
  v_others  uuid[];
  v_member  public.transcribe_room_members%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'consent is required to join a transcription room' USING ERRCODE = '42501';
  END IF;
  IF length(v_name) = 0 OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'display name must be between 1 and 100 characters' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clarity_sessions s
                  WHERE s.id = p_session_id AND s.creator_profile_id = v_uid) THEN
    RAISE EXCEPTION 'session does not belong to the caller' USING ERRCODE = '42501';
  END IF;

  -- Which room is this? A chat -> its event room (while the event may still be transcribed and is not a hike), else a
  -- room of the chat with no event. An event with no chat given -> its event room. Neither -> a plain room, new each start.
  IF v_conv_id IS NOT NULL THEN
    PERFORM public.assert_transcribe_chat_access(v_conv_id, v_uid);
    SELECT c.* INTO v_conv FROM public.chat_conversations c WHERE c.id = v_conv_id;
    IF v_event IS NOT NULL AND v_conv.event_id IS DISTINCT FROM v_event THEN
      RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
    END IF;
    IF v_conv.kind = 'event' AND public._transcribe_event_room_eligible(v_conv.event_id) THEN
      v_event := v_conv.event_id;
    ELSE
      v_event := NULL;
    END IF;
  ELSIF v_event IS NOT NULL THEN
    SELECT c.id INTO v_conv_id FROM public.chat_conversations c WHERE c.kind = 'event' AND c.event_id = v_event;
  END IF;

  PERFORM public.assert_transcribe_event_access(v_event, v_uid);

  PERFORM pg_advisory_xact_lock(c_lock_key);

  -- Peek, then lock {the room I would join} + {every other room I am recording in} in ONE ordered statement.
  -- A chat is one place: its open room is joined whether it was opened as the event's room or as the chat's own (the
  -- event's window can close while that room is still running). Never matched: a plain start (neither id).
  IF v_event IS NOT NULL OR p_conversation_id IS NOT NULL THEN
    SELECT r.id INTO v_peek FROM public.transcribe_rooms r
     WHERE r.ended_at IS NULL
       AND ((v_event IS NOT NULL AND r.event_id = v_event)
            OR (p_conversation_id IS NOT NULL AND r.conversation_id = p_conversation_id))
     ORDER BY r.created_at DESC LIMIT 1;
  END IF;
  v_others := public._transcribe_other_open_rooms(v_uid, v_peek);
  PERFORM public._transcribe_lock_rooms(v_others || CASE WHEN v_peek IS NULL THEN '{}'::uuid[] ELSE ARRAY[v_peek] END);

  -- Re-read under the lock: it may have been closed by a last Stop while this call waited.
  v_room := NULL;
  IF v_peek IS NOT NULL THEN
    SELECT r.* INTO v_room FROM public.transcribe_rooms r WHERE r.id = v_peek AND r.ended_at IS NULL;
  END IF;

  -- Rule 7: stop my recording in any other room (the target, if it exists, is kept).
  PERFORM public._transcribe_end_captures_in(v_uid, public._transcribe_other_open_rooms(v_uid, v_room.id));

  IF v_room.id IS NULL THEN
    IF p_new_code IS NULL OR p_new_code !~ '^[A-HJ-NP-Z2-9]{6}$' THEN
      RAISE EXCEPTION 'room code must be 6 characters from the room-code alphabet' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.transcribe_rooms (code, event_id, conversation_id)
    VALUES (p_new_code,
            v_event,
            -- a plain room has no chat; an event room records its chat when it has one
            CASE WHEN p_conversation_id IS NOT NULL OR v_event IS NOT NULL THEN v_conv_id END)
    RETURNING * INTO v_room;
  END IF;

  INSERT INTO public.transcribe_room_members AS m
    (room_id, profile_id, display_name, session_id, consent_given_at, last_seen_at)
  VALUES (v_room.id, v_uid, v_name, p_session_id, now(), now())
  ON CONFLICT (room_id, profile_id) DO UPDATE
    SET consent_given_at = COALESCE(m.consent_given_at, now()),
        display_name     = EXCLUDED.display_name,
        capture_ended_at = NULL,
        paused_since     = NULL,
        last_seen_at     = now()
  RETURNING * INTO v_member;

  RETURN QUERY SELECT
    v_room.id, v_room.code, v_room.event_id, v_room.created_at, v_room.ended_at,
    v_member.id, v_member.profile_id, v_member.display_name, v_member.session_id,
    v_member.joined_at, v_member.consent_given_at,
    v_room.conversation_id, v_room.part_no;
END;
$$;

COMMENT ON FUNCTION public.enter_transcribe_room(text, uuid, boolean, text, uuid, uuid) IS
  'P1604: starts or joins a transcription room. p_conversation_id given: the chat''s event room (event inside its window, '
  'not a hike) or the chat''s own room; the caller must be able to read the chat. Neither id: a NEW plain room (others join '
  'by code). Ends the caller''s recording in every other room. Derives the member from auth.uid().';

REVOKE ALL ON FUNCTION public.enter_transcribe_room(text, uuid, boolean, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enter_transcribe_room(text, uuid, boolean, text, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.enter_transcribe_room(text, uuid, boolean, text, uuid, uuid) TO authenticated;

-- ── create_transcribe_room (plain rooms only; rule 7) ───────────────────────
CREATE OR REPLACE FUNCTION public.create_transcribe_room(
  p_code text,
  p_display_name text,
  p_session_id uuid,
  p_consent boolean,
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
DECLARE
  c_lock_key CONSTANT bigint := hashtext('p1236:enter_transcribe_room');
  v_uid     uuid := auth.uid();
  v_name    text := btrim(coalesce(p_display_name, ''));
  v_room    public.transcribe_rooms%ROWTYPE;
  v_member  public.transcribe_room_members%ROWTYPE;
  v_others  uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'consent is required to join a transcription room' USING ERRCODE = '42501';
  END IF;
  -- an event's room, and a chat's room, are entered through enter_transcribe_room (it serialises first arrivals and
  -- checks chat access); this function only makes plain rooms
  IF p_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'an event room is entered through enter_transcribe_room' USING ERRCODE = '42501';
  END IF;
  IF p_code IS NULL OR p_code !~ '^[A-HJ-NP-Z2-9]{6}$' THEN
    RAISE EXCEPTION 'room code must be 6 characters from the room-code alphabet' USING ERRCODE = '22023';
  END IF;
  IF length(v_name) = 0 OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'display name must be between 1 and 100 characters' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clarity_sessions s
                  WHERE s.id = p_session_id AND s.creator_profile_id = v_uid) THEN
    RAISE EXCEPTION 'session does not belong to the caller' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(c_lock_key);
  v_others := public._transcribe_other_open_rooms(v_uid, NULL);
  PERFORM public._transcribe_lock_rooms(v_others);
  PERFORM public._transcribe_end_captures_in(v_uid, v_others);

  INSERT INTO public.transcribe_rooms (code) VALUES (p_code) RETURNING * INTO v_room;

  INSERT INTO public.transcribe_room_members
    (room_id, profile_id, display_name, session_id, consent_given_at, last_seen_at)
  VALUES (v_room.id, v_uid, v_name, p_session_id, now(), now())
  RETURNING * INTO v_member;

  RETURN QUERY SELECT
    v_room.id, v_room.code, v_room.event_id, v_room.created_at, v_room.ended_at,
    v_member.id, v_member.profile_id, v_member.display_name, v_member.session_id,
    v_member.joined_at, v_member.consent_given_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_transcribe_room(text, text, uuid, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_transcribe_room(text, text, uuid, boolean, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_transcribe_room(text, text, uuid, boolean, uuid) TO authenticated;

-- ── join_transcribe_room (by id: used for a code) ───────────────────────────
CREATE OR REPLACE FUNCTION public.join_transcribe_room(
  p_room_id uuid,
  p_display_name text,
  p_session_id uuid,
  p_consent boolean
)
RETURNS TABLE (
  id uuid,
  room_id uuid,
  profile_id uuid,
  display_name text,
  session_id uuid,
  joined_at timestamptz,
  consent_given_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  c_lock_key CONSTANT bigint := hashtext('p1236:enter_transcribe_room');
  v_uid    uuid := auth.uid();
  v_room   public.transcribe_rooms%ROWTYPE;
  v_others uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'consent is required to join a transcription room' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(c_lock_key);
  v_others := public._transcribe_other_open_rooms(v_uid, p_room_id);
  PERFORM public._transcribe_lock_rooms(v_others || ARRAY[p_room_id]);

  SELECT r.* INTO v_room FROM public.transcribe_rooms r WHERE r.id = p_room_id AND r.ended_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room not found or already ended' USING ERRCODE = '42501';
  END IF;

  -- P1315: an event's room applies the event rule. P1604: a chat's room requires the chat, even by code.
  PERFORM public.assert_transcribe_event_access(v_room.event_id, v_uid);
  IF v_room.event_id IS NULL THEN
    PERFORM public.assert_transcribe_chat_access(v_room.conversation_id, v_uid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clarity_sessions s
                  WHERE s.id = p_session_id AND s.creator_profile_id = v_uid) THEN
    RAISE EXCEPTION 'session does not belong to the caller' USING ERRCODE = '42501';
  END IF;

  PERFORM public._transcribe_end_captures_in(v_uid, v_others);

  RETURN QUERY
  WITH upserted AS (
    INSERT INTO public.transcribe_room_members AS m
      (room_id, profile_id, display_name, session_id, consent_given_at, last_seen_at)
    VALUES (p_room_id, v_uid, btrim(p_display_name), p_session_id, now(), now())
    ON CONFLICT (room_id, profile_id) DO UPDATE
      SET consent_given_at = COALESCE(m.consent_given_at, now()),
          capture_ended_at = NULL,
          paused_since     = NULL,
          last_seen_at     = now()
    RETURNING m.id, m.room_id, m.profile_id, m.display_name, m.session_id, m.joined_at, m.consent_given_at
  )
  SELECT u.id, u.room_id, u.profile_id, u.display_name, u.session_id, u.joined_at, u.consent_given_at
  FROM upserted u;
END;
$$;

COMMENT ON FUNCTION public.join_transcribe_room(uuid, text, uuid, boolean) IS
  'P1236 Decision 5 + P1307 + P1604: joins a transcribe room by id with consent written in the same statement as the member '
  'row. A re-join starts a new capture and never resets joined_at. An event''s room applies the event rule (P1315); a chat''s '
  'room requires access to the chat. Ends the caller''s recording in any other room. Derives profile_id from auth.uid().';

REVOKE ALL ON FUNCTION public.join_transcribe_room(uuid, text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_transcribe_room(uuid, text, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.join_transcribe_room(uuid, text, uuid, boolean) TO authenticated;

-- ── end_transcribe_room_capture: the last Stop closes the room, same transaction ─────
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

  -- the lock enter, join, end and the sweep all take: a Stop and a join cannot both win
  PERFORM public._transcribe_lock_rooms(ARRAY[p_room_id]);

  UPDATE public.transcribe_room_members AS m
     SET capture_ended_at = COALESCE(m.capture_ended_at, now())
   WHERE m.room_id = p_room_id AND m.profile_id = v_uid
  RETURNING m.capture_ended_at INTO v_ended_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not a member of this room' USING ERRCODE = '42501';
  END IF;

  PERFORM public._transcribe_close_room_if_idle(p_room_id);
  RETURN v_ended_at;
END;
$$;

REVOKE ALL ON FUNCTION public.end_transcribe_room_capture(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.end_transcribe_room_capture(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.end_transcribe_room_capture(uuid) TO authenticated;

-- ── touch_transcribe_room_capture: the paused heartbeat, now returning the room's state ──────
DROP FUNCTION IF EXISTS public.touch_transcribe_room_capture(uuid);

CREATE OR REPLACE FUNCTION public.touch_transcribe_room_capture(p_room_id uuid)
RETURNS TABLE (room_ended boolean, moved_to_room_id uuid, moved_to_room_code text, moved_to_member_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_ended timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- COALESCE: the clock starts at the FIRST paused beat; a slice clears it (transcribe-slice)
  UPDATE public.transcribe_room_members AS m
     SET last_seen_at = now(), paused_since = COALESCE(m.paused_since, now())
   WHERE m.room_id = p_room_id AND m.profile_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not a member of this room' USING ERRCODE = '42501';
  END IF;

  SELECT r.ended_at INTO v_ended FROM public.transcribe_rooms r WHERE r.id = p_room_id;
  RETURN QUERY
  SELECT v_ended IS NOT NULL, nm.room_id, nr.code, nm.id
    FROM (SELECT 1) one
    LEFT JOIN public.transcribe_rooms nr ON nr.continues_room_id = p_room_id
    LEFT JOIN public.transcribe_room_members nm ON nm.room_id = nr.id AND nm.profile_id = v_uid
   LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.touch_transcribe_room_capture(uuid) IS
  'P1307 + P1604: the paused-capture heartbeat. Stamps last_seen_at and starts paused_since on the CALLER''s own member row, '
  'and returns whether the room ended and, if the 3-hour roll moved this person, where.';

REVOKE ALL ON FUNCTION public.touch_transcribe_room_capture(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_transcribe_room_capture(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.touch_transcribe_room_capture(uuid) TO authenticated;

-- ── The 3-hour roll (rule 8). The caller holds the old room's row lock. ─────────────────────
CREATE OR REPLACE FUNCTION public._transcribe_roll_room(p_room uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old   public.transcribe_rooms%ROWTYPE;
  v_new   public.transcribe_rooms%ROWTYPE;
  v_open  uuid[];
  v_m     public.transcribe_room_members%ROWTYPE;
  v_sess  uuid;
BEGIN
  SELECT r.* INTO v_old FROM public.transcribe_rooms r WHERE r.id = p_room AND r.ended_at IS NULL;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(array_agg(m.id), '{}') INTO v_open
    FROM public.transcribe_room_members m
   WHERE m.room_id = p_room AND m.capture_ended_at IS NULL AND m.consent_given_at IS NOT NULL;
  IF cardinality(v_open) = 0 THEN
    RETURN NULL;
  END IF;

  -- End the old room first: the one-open-room-per-chat index would refuse the next while it is open. Everyone who was
  -- recording stops here; their seat in the next room is created below from the saved ids.
  UPDATE public.transcribe_room_members m SET capture_ended_at = now()
   WHERE m.room_id = p_room AND m.capture_ended_at IS NULL;
  UPDATE public.transcribe_rooms r SET ended_at = now() WHERE r.id = p_room;

  INSERT INTO public.transcribe_rooms (code, event_id, conversation_id, part_no, continues_room_id)
  VALUES (public._transcribe_new_room_code(), v_old.event_id, v_old.conversation_id, v_old.part_no + 1, v_old.id)
  RETURNING * INTO v_new;

  FOR v_m IN SELECT m.* FROM public.transcribe_room_members m WHERE m.id = ANY (v_open) ORDER BY m.id LOOP
    -- a session of their own, so Part 2 has its own history entry (same columns createClaritySession writes)
    INSERT INTO public.clarity_sessions
      (creator_name, creator_profile_id, state, demo_status, partnership_status, is_private)
    VALUES (v_m.display_name, v_m.profile_id, '{}'::jsonb, 'waiting', 'pending', false)
    RETURNING id INTO v_sess;

    INSERT INTO public.transcribe_room_members
      (room_id, profile_id, display_name, session_id, consent_given_at, consent_carried_from_room_id,
       last_seen_at, paused_since)
    VALUES (v_new.id, v_m.profile_id, v_m.display_name, v_sess, v_m.consent_given_at, v_old.id,
            now(), v_m.paused_since);
  END LOOP;
  RETURN v_new.id;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_roll_room(uuid) FROM PUBLIC, anon, authenticated;

-- ── The sweep ───────────────────────────────────────────────────────────────
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
    END IF;

    PERFORM public._transcribe_close_room_if_idle(v_room);
  END LOOP;

  -- The older per-person pass: one job per member of every room that ended at least c_late ago (the final audio of a Stop
  -- may still be uploading before that). Bounded to the last day so a backlog of old rooms is never queued. Members with
  -- last_seen_at IS NULL are pre-P1307 seats with no archive layout to reassemble (see 20260914120300).
  INSERT INTO public.transcribe_room_transcription_jobs (room_id, member_id)
  SELECT m.room_id, m.id
    FROM public.transcribe_rooms r
    JOIN public.transcribe_room_members m ON m.room_id = r.id
   WHERE r.ended_at IS NOT NULL
     AND r.ended_at <= now() - c_late
     AND r.ended_at > now() - interval '1 day'
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

-- ── The live-session line in a chat ("{name} is transcribing, join") ───────────────────────
-- Reads only: the chat's open room (as the chat's own room or the event's room) and who is recording in it. The caller
-- must be able to read the chat; the mirror has none. The name shown is the earliest-joined person still recording.
CREATE OR REPLACE FUNCTION public.get_chat_live_transcription(p_conversation_id uuid)
RETURNS TABLE (room_id uuid, room_code text, starter_name text, recording_count integer, i_am_recording boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.code,
         (SELECT m.display_name FROM public.transcribe_room_members m
           WHERE m.room_id = r.id AND m.capture_ended_at IS NULL ORDER BY m.joined_at, m.id LIMIT 1),
         (SELECT count(*)::integer FROM public.transcribe_room_members m
           WHERE m.room_id = r.id AND m.capture_ended_at IS NULL),
         EXISTS (SELECT 1 FROM public.transcribe_room_members m
                  WHERE m.room_id = r.id AND m.profile_id = auth.uid() AND m.capture_ended_at IS NULL)
    FROM public.chat_conversations c
    JOIN public.transcribe_rooms r
      ON r.ended_at IS NULL AND (r.conversation_id = c.id OR (c.event_id IS NOT NULL AND r.event_id = c.event_id))
   WHERE c.id = p_conversation_id AND c.kind <> 'mirror'
     AND auth.uid() IS NOT NULL
     AND public._chat_access_since(c.id, auth.uid()) IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.transcribe_room_members m WHERE m.room_id = r.id AND m.capture_ended_at IS NULL)
   ORDER BY r.created_at DESC
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_chat_live_transcription(uuid) IS
  'P1604: the live transcription session of a chat the caller can read, if anyone is recording in it: the room, the earliest '
  'person still recording, how many are, and whether the caller is. Nothing for a chat the caller cannot read.';

REVOKE ALL ON FUNCTION public.get_chat_live_transcription(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_chat_live_transcription(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_chat_live_transcription(uuid) TO authenticated;

-- ── get_transcribe_room_by_code: also says whether the room belongs to a chat ──────────────
-- diffed against 20260901160000_p1207_transcribe_rooms_code_enumeration.sql (same exact-match-only lookup and the same
-- grants as 20260911143000_p1303; RETURNS TABLE gains conversation_id, in_chat and part_no, so it is DROPPED first).
-- conversation_id is the chat's id only for a caller who may read that chat; in_chat is true for anyone holding the code, so
-- the consent screen can say where the words will be posted BEFORE the person agrees. The join itself still requires the chat.
DROP FUNCTION IF EXISTS public.get_transcribe_room_by_code(text);

CREATE OR REPLACE FUNCTION public.get_transcribe_room_by_code(p_code text)
RETURNS TABLE (
  id uuid, code text, event_id uuid, created_at timestamptz, ended_at timestamptz,
  conversation_id uuid, in_chat boolean, part_no integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT r.id, r.code, r.event_id, r.created_at, r.ended_at,
         CASE WHEN r.conversation_id IS NOT NULL AND public._chat_access_since(r.conversation_id, auth.uid()) IS NOT NULL
              THEN r.conversation_id END,
         r.conversation_id IS NOT NULL,
         r.part_no
  FROM transcribe_rooms r
  -- Equality on the full code only. No LIKE, no prefix, no ordering, no limit-based paging:
  -- every one of those would turn this back into an enumeration oracle.
  WHERE r.code = upper(p_code)
    AND r.ended_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_transcribe_room_by_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_transcribe_room_by_code(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_transcribe_room_by_code(text) TO authenticated;

-- ── Post-conditions, read from the live catalog ─────────────────────────────
DO $check$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.assert_transcribe_chat_access(uuid, uuid)', 'public._transcribe_event_room_eligible(uuid)',
    'public._transcribe_new_room_code()', 'public._transcribe_close_room_if_idle(uuid)',
    'public._transcribe_lock_rooms(uuid[])', 'public._transcribe_other_open_rooms(uuid, uuid)',
    'public._transcribe_end_captures_in(uuid, uuid[])', 'public._transcribe_roll_room(uuid)',
    'public.transcribe_room_sweep_tick()']
  LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1604: % is client-callable', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.enter_transcribe_room(text, uuid, boolean, text, uuid, uuid)',
    'public.create_transcribe_room(text, text, uuid, boolean, uuid)',
    'public.join_transcribe_room(uuid, text, uuid, boolean)',
    'public.end_transcribe_room_capture(uuid)', 'public.touch_transcribe_room_capture(uuid)',
    'public.get_chat_live_transcription(uuid)', 'public.get_transcribe_room_by_code(text)']
  LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1604: anon holds EXECUTE on %', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1604: authenticated lost EXECUTE on %', v_fn;
    END IF;
  END LOOP;
END
$check$;
