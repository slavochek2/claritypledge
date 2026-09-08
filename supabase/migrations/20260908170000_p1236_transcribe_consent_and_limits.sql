-- Migration: P1236 — server state for the live transcription path
-- Created: 2026-09-08
-- Spec: features/p1236_server_side_live_transcription_for_rooms.md (Decisions 4, 5, 6)
--
-- Three things become server state, because the live path is about to start writing
-- audio and transcripts on the server's authority rather than the client's:
--
--   1. CONSENT (Decision 5). `consentGiven` is a React useState boolean today
--      (transcribe-room-page.tsx) — never sent, never persisted. privacy.md's promise
--      "nothing is captured before you do" currently holds ONLY because
--      RECORD_AUDIO_WHILE_LIVE = false makes the capture branch dead code. P1236 turns
--      capture back on, and at that moment a valid member JWT replayed without ever
--      rendering the consent screen is indistinguishable server-side from a consented
--      one. Consent has to be a row, written atomically with the join.
--
--   2. A PER-MEMBER SLICE COUNTER (Decision 6). With nothing allocated in the live path,
--      call volume is the only cost variable, so the ceiling has to count calls.
--
--   3. AN ORDERING INDEX for de-duplication (Decision 4), which reads the same member's
--      most recent message before every insert.
--
-- new function: join_transcribe_room does not exist in any prior migration (grep over
-- supabase/migrations/ returns this file only). is_transcribe_room_member and
-- get_transcribe_room_by_code are NOT touched.
--
-- client-safe: purely additive. Two nullable/defaulted columns, one index, one NEW function.
-- Nothing existing is dropped, revoked or retyped, so the currently-deployed bundle — which
-- knows about none of it — behaves exactly as it does today. This is deliberately the
-- EXPAND half of an expand/contract pair: the contract half, which removes the direct
-- INSERT policy and therefore DOES break the deployed client, is a separate migration
-- (…_p1236_b_drop_direct_member_insert.sql) carrying a requires-frontend marker. Both
-- orderings are safe with the split; neither is safe without it.

-- ============================================================================
-- 1. transcribe_room_members: consent, and the slice ceiling's counter
-- ============================================================================

ALTER TABLE public.transcribe_room_members
  ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ;

ALTER TABLE public.transcribe_room_members
  ADD COLUMN IF NOT EXISTS slice_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.transcribe_room_members.consent_given_at IS
  'P1236 Decision 5: when this member agreed to be recorded and transcribed. Deliberately '
  'NULLABLE and deliberately NOT backfilled — rows that pre-date P1236 were created by a '
  'client that never asked the server for consent, and inventing a timestamp for them '
  'would be fabricating the consent this column exists to record. Every server path that '
  'reaches audio MUST treat NULL as REFUSE (fail closed), not as "probably fine". '
  'Written only by join_transcribe_room(); there is no INSERT policy on this table.';

COMMENT ON COLUMN public.transcribe_room_members.slice_count IS
  'P1236 Decision 6 ceiling 2: number of live audio slices this member has had transcribed. '
  'Incremented by the transcribe-slice edge function under the service role, in the same '
  'statement as the message insert. Client-invisible and client-unsettable by construction — '
  'there is no UPDATE policy on this table for authenticated callers.';

-- ============================================================================
-- 2. transcribe_messages: the de-duplication read path
-- ============================================================================
--
-- Decision 4 reads "that member's most recent row" before every insert:
--   WHERE member_id = $1 ORDER BY spoken_at DESC LIMIT 1
-- The existing idx_transcribe_messages_room is (room_id, spoken_at) and does not serve
-- that predicate. At one read per slice per member this runs ~900 times per member-hour.

CREATE INDEX IF NOT EXISTS idx_transcribe_messages_member
  ON public.transcribe_messages(member_id, spoken_at);

-- ============================================================================
-- 3. Room duration cap — a constant, NOT a column. Recorded here so the decision is
--    discoverable from the schema rather than only from a TypeScript file.
-- ============================================================================
--
-- Decision 6 ceiling 1 is a maximum room duration of 180 minutes, enforced in the
-- transcribe-slice edge function against transcribe_rooms.created_at. The spec allows
-- "the room-duration column or constant"; this migration deliberately adds NO column.
--
-- A column would imply per-room variability that nothing in the product sets, and a
-- settable-looking column on a cost ceiling is a trap: the first thing anyone would ask
-- of it is an UPDATE policy, and the whole point of Decision 6 is that these bounds are
-- not client-reachable. The value lives as ROOM_MAX_DURATION_MINUTES in
-- supabase/functions/transcribe-slice/handler.ts. If a per-room cap is ever genuinely
-- needed, add the column THEN, with the policy question answered.

-- ============================================================================
-- 4. Joining becomes an RPC (the direct INSERT path goes in the contract migration)
-- ============================================================================
--
-- WHY A FUNCTION AT ALL — this reasoning moves here from transcribe-service.ts, where it
-- was recorded as a comment on the deliberate two-statement insert-then-read:
--
--   `.insert(...).select().single()` compiles to INSERT ... RETURNING, and RETURNING is
--   evaluated under the SELECT policy ("room members can see the roster") for THIS row
--   inside the SAME command as its own INSERT. That policy calls
--   is_transcribe_room_member(), which queries transcribe_room_members — and within one
--   command that inner query cannot see the row this very INSERT is still writing. So
--   RETURNING fails RLS even though the INSERT's own WITH CHECK passes. Reproduced
--   directly in SQL with SET LOCAL ROLE authenticated: the identical INSERT with no
--   RETURNING succeeds.
--
-- SECURITY DEFINER sidesteps that (the definer is the table owner, so no policy is
-- evaluated), which is what lets consent and the row be written in one statement. That
-- atomicity is the point: a separate POST /consent after join would leave a window in
-- which a member row exists without consent, and that state is exactly what this
-- migration makes unrepresentable.
--
-- WHAT THE FUNCTION CHECKS, and why each check is here rather than in the client:
--   * auth.uid() is the profile_id. It is NEVER an argument — a SECURITY DEFINER function
--     that accepts the identity it is about to write is an impersonation primitive.
--   * consent must be passed TRUE. There is no default.
--   * the room must exist and must not have ended.
--   * the clarity_sessions row must belong to the caller. The old INSERT policy checked
--     only profile_id = auth.uid() and never looked at session_id, so a caller could
--     attach ANOTHER user's recording session to their own seat. Bypassing RLS means
--     inheriting the duty to be at least as strict as the policy replaced, and here that
--     means being stricter.

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
-- The RETURNS TABLE columns (id, room_id, profile_id, …) are also plpgsql OUT VARIABLES,
-- and they collide with the identically-named table columns inside ON CONFLICT's target
-- list: "column reference \"room_id\" is ambiguous" (42702). The collision is invisible at
-- CREATE time — the function compiles, and only the first CALL fails — which is why this
-- was caught by the integration canary and not by applying the migration.
-- use_column resolves every such name to the column. Nothing here reads an OUT variable
-- (the result is produced by RETURN QUERY, not by assignment), so there is nothing for
-- this setting to break; the arguments are p_-prefixed and the local is v_-prefixed, so
-- neither is ambiguous in the first place. Renaming the OUT columns is NOT an option —
-- they are the JSON keys the client maps to DbMember.
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
      (room_id, profile_id, display_name, session_id, consent_given_at)
    VALUES (p_room_id, v_uid, btrim(p_display_name), p_session_id, now())
    -- A page refresh or a double "Join room" tap re-enters here. Idempotent, and it
    -- preserves the ORIGINAL consent timestamp rather than restamping it: the question
    -- "when did this person agree" has one answer, and it is the first one. COALESCE also
    -- heals a pre-P1236 row on the owner's next join — that is not a loophole, because
    -- reaching this line at all required passing p_consent = TRUE.
    ON CONFLICT (room_id, profile_id) DO UPDATE
      SET consent_given_at = COALESCE(m.consent_given_at, now())
    RETURNING m.id, m.room_id, m.profile_id, m.display_name, m.session_id, m.joined_at, m.consent_given_at
  )
  SELECT u.id, u.room_id, u.profile_id, u.display_name, u.session_id, u.joined_at, u.consent_given_at
  FROM upserted u;
END;
$$;

COMMENT ON FUNCTION public.join_transcribe_room(uuid, text, uuid, boolean) IS
  'P1236 Decision 5: with the paired contract migration, the ONLY way a '
  'transcribe_room_members row is created. Takes consent '
  'as a required argument and writes it in the same statement as the row, so a member '
  'without consent is not a representable state. Derives profile_id from auth.uid() — do '
  'not add a profile_id argument.';

REVOKE ALL ON FUNCTION public.join_transcribe_room(uuid, text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_transcribe_room(uuid, text, uuid, boolean) TO authenticated;

-- The direct self-insert policy ("authenticated users can join as themselves") is what
-- still makes a consent-free member row possible, and it is removed by the contract
-- migration named in the header — not here. Until that one lands, this RPC is the
-- PREFERRED path, not yet the ONLY one.
