-- Migration: P1315 — joining a room by id applies the same event-access rule as entering one
-- Created: 2026-09-15
-- Spec: features/p1315_room_membership_contract.md
-- Guaranteed by: e2e/integration/20260915120100_p1315_join_room_event_access.spec.ts
--
-- diffed against: 20260914120400_p1307_join_room_starts_new_capture.sql (join_transcribe_room).
--   ONE change: the room-exists guard now also reads the room's event_id, and the function calls
--   public.assert_transcribe_event_access(event_id, caller) before writing the member row.
--   Signature, RETURNS TABLE columns, the consent and session guards, the upsert, the COMMENT
--   (extended by one sentence) and the grants are otherwise carried over unchanged.
--
-- WHY. P1307 made "registered for the event, or its host, and before the grace window closes" the
-- rule for becoming a member of an event's room, and applied it to enter_transcribe_room and
-- create_transcribe_room (20260914120200). join_transcribe_room is the third way to become a member
-- and did not apply it, so the rule held on two of three entry points. This is that decision applied
-- to the remaining path — not a new product rule. A room with no event is unaffected: the shared
-- check returns immediately when event_id is NULL.
--
-- client-safe: function body only; no signature, grant, column or policy change. A caller who may
--   attend the event (or any caller of a room with no event) sees no difference.

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
-- use_column: the RETURNS TABLE columns are also OUT variables and collide with the table's
-- columns inside ON CONFLICT's target list (42702). Nothing here reads an OUT variable, so
-- resolving every such name to the column is safe (see 20260908170000).
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_event_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- IS NOT TRUE, not = FALSE: NULL must refuse too.
  IF p_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'consent is required to join a transcription room' USING ERRCODE = '42501';
  END IF;

  SELECT r.event_id INTO v_event_id
    FROM public.transcribe_rooms r
   WHERE r.id = p_room_id AND r.ended_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room not found or already ended' USING ERRCODE = '42501';
  END IF;

  -- P1315: the P1307 membership rule for an event's room (registered or host, within the grace
  -- window). Returns immediately for a room with no event.
  PERFORM public.assert_transcribe_event_access(v_event_id, v_uid);

  IF NOT EXISTS (
    SELECT 1 FROM public.clarity_sessions s
    WHERE s.id = p_session_id AND s.creator_profile_id = v_uid
  ) THEN
    RAISE EXCEPTION 'session does not belong to the caller' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH upserted AS (
    INSERT INTO public.transcribe_room_members AS m
      (room_id, profile_id, display_name, session_id, consent_given_at, last_seen_at)
    VALUES (p_room_id, v_uid, btrim(p_display_name), p_session_id, now(), now())
    -- Re-entry (a refresh, a double tap, or a deliberate re-join after ending) is idempotent
    -- and keeps the ORIGINAL consent timestamp. P1307: it is also a new capture, so the end
    -- marker is cleared and presence restamped. joined_at is deliberately absent — the
    -- per-person three hours run from the first join, and a re-join never resets them.
    ON CONFLICT (room_id, profile_id) DO UPDATE
      SET consent_given_at = COALESCE(m.consent_given_at, now()),
          capture_ended_at = NULL,
          last_seen_at     = now()
    RETURNING m.id, m.room_id, m.profile_id, m.display_name, m.session_id, m.joined_at, m.consent_given_at
  )
  SELECT u.id, u.room_id, u.profile_id, u.display_name, u.session_id, u.joined_at, u.consent_given_at
  FROM upserted u;
END;
$$;

COMMENT ON FUNCTION public.join_transcribe_room(uuid, text, uuid, boolean) IS
  'P1236 Decision 5 + P1307: joins a transcribe room by id with consent written in the same '
  'statement as the member row. A re-join starts a new capture (clears capture_ended_at, stamps '
  'last_seen_at) and never resets joined_at. Derives profile_id from auth.uid() — do not add a '
  'profile_id argument. P1315: an event''s room applies the same access rule as entering it.';

REVOKE ALL ON FUNCTION public.join_transcribe_room(uuid, text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_transcribe_room(uuid, text, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.join_transcribe_room(uuid, text, uuid, boolean) TO authenticated;

DO $check$
DECLARE
  v_src text;
BEGIN
  IF has_function_privilege('anon', 'public.join_transcribe_room(uuid, text, uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1315: anon holds EXECUTE on join_transcribe_room';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.join_transcribe_room(uuid, text, uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1315: authenticated lost EXECUTE on join_transcribe_room — joining by code is dead';
  END IF;

  -- Read the LIVE body, not this file: the check must actually be in what was installed.
  SELECT p.prosrc INTO v_src FROM pg_proc p
   WHERE p.oid = 'public.join_transcribe_room(uuid, text, uuid, boolean)'::regprocedure;
  IF v_src NOT LIKE '%assert_transcribe_event_access(v_event_id, v_uid)%' THEN
    RAISE EXCEPTION 'P1315: installed join_transcribe_room does not call assert_transcribe_event_access';
  END IF;

  -- The shared check must still be unreachable by clients (P1307's own invariant).
  IF has_function_privilege('authenticated', 'public.assert_transcribe_event_access(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.assert_transcribe_event_access(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1315: assert_transcribe_event_access must not be client-callable';
  END IF;
END
$check$;
