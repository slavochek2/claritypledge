-- Migration: P1307 (3/4) — one room per event for as long as it is open, per-person cap,
-- re-join starts a new capture, and event rooms only for people who may attend
-- Created: 2026-09-14
-- Spec: features/p1307_event_transcription_from_ready_across_pages_into_sessions.md
--   Architecture Decision 3 (item 2), Decision 1 correction, Security Review Parent
--   verification 2.
-- Guaranteed by: e2e/integration/p1307-enter-room-event-access.spec.ts,
--   src/tests/p1236-duration-bound-drift.test.ts
--
-- diffed against: 20260911151200_p1236_g_fix_enter_room_ambiguity.sql (enter_transcribe_room)
--   and 20260909100000_p1236_e_create_room_requires_consent.sql (create_transcribe_room).
--   Signatures and RETURNS TABLE columns are unchanged; CREATE OR REPLACE keeps both
--   functions' grants, which are re-asserted and read back below all the same.
--
-- THREE CHANGES TO enter_transcribe_room, which must land together:
--
--   1. The room-SELECTION query no longer filters on room age. D11 moves the 3-hour cap from
--      the room to the person (transcribe-slice now measures it from the member's own
--      joined_at), and one room serves a whole event — so a latecomer 3 hours in must join the
--      SAME room, not open a second one and split the event's transcript in two.
--
--      *** READ BEFORE TOUCHING THIS QUERY. *** The age filter existed to stop a new arrival
--      being dropped into a weeks-old ABANDONED room. With it gone, "ended_at IS NULL" is the
--      only liveness signal, and that is safe ONLY because transcribe_room_sweep_tick()
--      (20260914120300) ends every room whose members have all stopped (cap or 10 minutes of
--      silence from every device) every 2 minutes. If that sweep is ever unscheduled or
--      removed, restore a room-age bound here in the same change, or this regresses to the
--      abandoned-room bug.
--
--   2. A re-join clears capture_ended_at (and stamps last_seen_at). D1 lets a person switch
--      transcription off and on again from the ready screen; without this they would stay
--      "ended" and the sweep would treat them as gone. joined_at is still never in the SET
--      list, so the per-person 3 hours runs from their FIRST Continue and switching off and on
--      never resets it — that is what keeps D8's backstop a backstop.
--
--   3. p_event_id is checked on the server. Until now the event gate was client routing only:
--      any signed-in caller who knew an event id could open its room and read everything said.
--      The rule is the one useEventRoomAccess applies on the client (EventRoomAccess.tsx:
--      granted = signed in AND (registered OR host)), plus the same freeze boundary the event
--      room RPCs use (event start + event_grace_interval()), so server and client agree.
--      create_transcribe_room accepts p_event_id too and gets the identical check.
--
-- client-safe: function bodies only; no signature, column, grant or policy changes. A deployed
--   client calling either function with p_event_id = NULL is unaffected; one passing an event
--   id it may not attend was exactly the hole being closed.

-- ── Shared check ────────────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose, and reachable by nobody but the definer functions below:
-- called from a SECURITY DEFINER body it runs as that function's owner, so it reads events and
-- event_rsvps with the same privileges they have. Exposing it to clients would add a way to ask
-- "am I registered / is this event frozen" that the product does not offer.
CREATE OR REPLACE FUNCTION public.assert_transcribe_event_access(p_event_id uuid, p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_datetime timestamptz;
  v_host_id  uuid;
BEGIN
  IF p_event_id IS NULL THEN
    RETURN; -- an ad-hoc /transcribe room has no event to attend
  END IF;

  SELECT e.datetime, e.host_id INTO v_datetime, v_host_id
  FROM public.events e
  WHERE e.id = p_event_id;

  -- Not-found, closed and not-registered share one errcode; only the message differs, and it
  -- names nothing about who is registered.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  -- Anchored to event START, per P494, exactly as join_event_room does.
  IF now() >= v_datetime + public.event_grace_interval() THEN
    RAISE EXCEPTION 'this room is closed' USING ERRCODE = '42501';
  END IF;

  IF v_host_id IS DISTINCT FROM p_uid AND NOT EXISTS (
    SELECT 1 FROM public.event_rsvps r
    WHERE r.event_id = p_event_id AND r.profile_id = p_uid
  ) THEN
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_transcribe_event_access(uuid, uuid) IS
  'P1307: raises unless p_uid may be transcribed in p_event_id''s room (registered or host, and '
  'before the event''s grace window closes). Internal to enter_/create_transcribe_room; no client grant.';

REVOKE ALL ON FUNCTION public.assert_transcribe_event_access(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_transcribe_event_access(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.assert_transcribe_event_access(uuid, uuid) FROM authenticated;

-- ── enter_transcribe_room ───────────────────────────────────────────────────
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
-- use_column is required: ON CONFLICT's target list cannot take a qualified name and room_id
-- is both an OUT variable and a column (see 20260911151200). Safe here for the same reason
-- it was there: no OUT variable is ever read; values live in v_/p_/c_ names.
#variable_conflict use_column
DECLARE
  c_lock_key CONSTANT bigint := hashtext('p1236:enter_transcribe_room');
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

  PERFORM public.assert_transcribe_event_access(p_event_id, v_uid);

  PERFORM pg_advisory_xact_lock(c_lock_key);

  -- Liveness is ended_at alone. See the header: this depends on the sweep in 20260914120300.
  SELECT r.* INTO v_room
  FROM public.transcribe_rooms r
  WHERE r.ended_at IS NULL
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
    (room_id, profile_id, display_name, session_id, consent_given_at, last_seen_at)
  VALUES (v_room.id, v_uid, v_name, p_session_id, now(), now())
  ON CONFLICT (room_id, profile_id) DO UPDATE
    SET consent_given_at = COALESCE(m.consent_given_at, now()),
        display_name     = EXCLUDED.display_name,
        -- A re-join into a still-open room is a new capture (Decision 1 correction).
        -- joined_at is deliberately absent: the per-person cap runs from the first Continue.
        capture_ended_at = NULL,
        last_seen_at     = now()
  RETURNING * INTO v_member;

  RETURN QUERY SELECT
    v_room.id, v_room.code, v_room.event_id, v_room.created_at, v_room.ended_at,
    v_member.id, v_member.profile_id, v_member.display_name, v_member.session_id,
    v_member.joined_at,
    v_member.consent_given_at;
END;
$$;

-- ── create_transcribe_room ──────────────────────────────────────────────────
-- Body identical to 20260909100000 except the event check and last_seen_at on the new seat.
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
-- No `#variable_conflict use_column`, deliberately — see 20260909100000. There is no ON
-- CONFLICT here and every reference is qualified; the default (raise) is the fail-safe.
DECLARE
  v_uid     uuid := auth.uid();
  v_name    text := btrim(coalesce(p_display_name, ''));
  v_room    public.transcribe_rooms%ROWTYPE;
  v_member  public.transcribe_room_members%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'consent is required to join a transcription room' USING ERRCODE = '42501';
  END IF;

  IF p_code IS NULL OR p_code !~ '^[A-HJ-NP-Z2-9]{6}$' THEN
    RAISE EXCEPTION 'room code must be 6 characters from the room-code alphabet'
      USING ERRCODE = '22023';
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

  PERFORM public.assert_transcribe_event_access(p_event_id, v_uid);

  INSERT INTO public.transcribe_rooms (code, event_id)
  VALUES (p_code, p_event_id)
  RETURNING * INTO v_room;

  INSERT INTO public.transcribe_room_members
    (room_id, profile_id, display_name, session_id, consent_given_at, last_seen_at)
  VALUES (v_room.id, v_uid, v_name, p_session_id, now(), now())
  RETURNING * INTO v_member;

  RETURN QUERY SELECT
    v_room.id, v_room.code, v_room.event_id, v_room.created_at, v_room.ended_at,
    v_member.id, v_member.profile_id, v_member.display_name, v_member.session_id,
    v_member.joined_at,
    v_member.consent_given_at;
END;
$$;

REVOKE ALL ON FUNCTION public.enter_transcribe_room(text, uuid, boolean, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enter_transcribe_room(text, uuid, boolean, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.enter_transcribe_room(text, uuid, boolean, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.create_transcribe_room(text, text, uuid, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_transcribe_room(text, text, uuid, boolean, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_transcribe_room(text, text, uuid, boolean, uuid) TO authenticated;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.enter_transcribe_room(text, uuid, boolean, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1307: anon holds EXECUTE on enter_transcribe_room';
  END IF;
  IF has_function_privilege('anon', 'public.create_transcribe_room(text, text, uuid, boolean, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1307: anon holds EXECUTE on create_transcribe_room';
  END IF;
  IF has_function_privilege('authenticated', 'public.assert_transcribe_event_access(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.assert_transcribe_event_access(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1307: assert_transcribe_event_access must not be client-callable';
  END IF;
END
$check$;
