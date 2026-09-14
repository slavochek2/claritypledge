-- Migration: P1307 (5/5) — joining by room code starts a new capture too
-- Created: 2026-09-14
-- Spec: features/p1307_event_transcription_from_ready_across_pages_into_sessions.md
--   Architecture Decision 1 correction ("a re-join must start a new capture") and Decision 2
--   (last_seen_at), applied to the second join path.
-- Guaranteed by: e2e/integration/p1307-join-room-rejoin.spec.ts
--
-- diffed against: 20260908170000_p1236_transcribe_consent_and_limits.sql (join_transcribe_room).
--   Signature, RETURNS TABLE columns, guards and comments are unchanged. Two changes, both in the
--   upsert: last_seen_at is written on insert, and ON CONFLICT clears capture_ended_at and
--   stamps last_seen_at. joined_at is still never in the SET list.
--
-- WHY. 20260914120200 applied the Decision 1 correction to enter_transcribe_room (the event and
-- shared-room path) but not to join_transcribe_room, which /transcribe/:code uses. Found by the
-- /dev code review, verified against the migration text. Two defects followed:
--   1. A person who ended their capture and re-joined the same open room by its code stayed
--      "ended" on the server while their device captured again: gcs-signed-url refused every
--      archive upload and the sweep treated them as gone.
--   2. A new member joining by code had last_seen_at = NULL until their first accepted slice.
--      The sweep creates whole-recording jobs only for members with last_seen_at set, so a
--      member whose room ended before their first slice got no job for chunks already archived.
--
-- client-safe: function body only. Same signature and grants; CREATE OR REPLACE keeps both,
--   and the post-condition below reads the anon grant back from the catalog.

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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- IS NOT TRUE, not = FALSE: NULL must refuse too.
  IF p_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'consent is required to join a transcription room' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.transcribe_rooms r
    WHERE r.id = p_room_id AND r.ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'room not found or already ended' USING ERRCODE = '42501';
  END IF;

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
  'profile_id argument.';

REVOKE ALL ON FUNCTION public.join_transcribe_room(uuid, text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_transcribe_room(uuid, text, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.join_transcribe_room(uuid, text, uuid, boolean) TO authenticated;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.join_transcribe_room(uuid, text, uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1307: anon holds EXECUTE on join_transcribe_room';
  END IF;
END
$check$;
