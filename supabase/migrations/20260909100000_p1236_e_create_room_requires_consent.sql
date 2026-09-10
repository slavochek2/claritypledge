-- P1236 (e): make create_transcribe_room() take consent, the way join_transcribe_room() does.
-- Spec: features/p1236_server_side_live_transcription_for_rooms.md
--
-- WHY THIS EXISTS. Two branches solved two halves of the same table and neither knew about
-- the other. P1275 shipped create_transcribe_room() to main on 2026-09-08 because
-- INSERT ... RETURNING on transcribe_rooms is evaluated under a member-scoped SELECT policy
-- (P1207) and the creator is not a member yet. P1236, on its own branch since 2026-09-03,
-- made consent a REQUIRED argument of join_transcribe_room() and wrote it in the same
-- statement as the member row — so that "a member without consent" stops being a
-- representable state, which is what lets the capture branch be turned back on at all.
--
-- Merged as they stand, that claim is false. create_transcribe_room() is SECURITY DEFINER,
-- so it bypasses RLS entirely, and it inserts a transcribe_room_members row with no
-- consent_given_at at all. P1236's own contract migration (…_p1236_b_…) drops the direct
-- member INSERT *policy*, which does nothing to a definer function that never consults one.
-- Every room creator would therefore hold a seat with consent_given_at IS NULL while audio
-- capture is live — and transcribe-slice refuses exactly that seat (403), so the room's own
-- creator would be the one participant who is never transcribed.
--
-- The fix is the same shape P1236 already chose for the join path: consent is an argument,
-- it is required, and the server writes it. Not a client boolean, not a later UPDATE.
--
-- DROP-then-CREATE, not CREATE OR REPLACE. Adding a parameter creates an OVERLOAD; the old
-- 4-argument form would remain callable and would remain a consent bypass, which is the
-- entire defect being closed. PostgREST resolves by argument names, so a stale client
-- calling without p_consent gets PGRST202 (no matching function) rather than a silent
-- fallback to the permissive overload. That is the intended failure.
--
-- requires-frontend: 35752a156
-- The deployed bundle calls the 4-argument form. Dropping it 404s room creation until the
-- client that passes p_consent is live, so this must not apply before that client ships.
--
-- 35752a156 is the commit that carries the p_consent client, on this branch and NOT on
-- origin/main — which is the whole point. The gate (scripts/migrate.sh:446) is a single
-- `git merge-base --is-ancestor <sha> origin/main`: a marker naming a commit that is ALREADY
-- an ancestor prints "coupling OK" and applies. An earlier draft of this file named
-- 3255fd18b — P1275's own commit, the one that shipped the 4-argument client — which is
-- already on origin/main, so the gate would have printed "coupling OK" and dropped the
-- function out from under the live bundle. A marker that can never block is indistinguishable
-- from no marker, and it is worse, because it reads like protection.
--
-- Re-resolve after /ship: cherry-picking rewrites the sha, and P1053 records this exact
-- marker blocking forever on a commit its own pipeline had destroyed. Sibling (b) carries
-- the same obligation.

DROP FUNCTION IF EXISTS public.create_transcribe_room(text, text, uuid, uuid);

-- POST-CONDITION, not decoration. `DROP ... IF EXISTS` matches ONE exact signature and exits 0
-- when it matches nothing. If prod has drifted — a hand-applied variant, a different argument
-- order — the DROP is a silent no-op and the consent-less overload survives next to its own
-- fix, which is the entire defect this file exists to close. This repo has been bitten by that
-- class twice on record (P1063: four prod RPCs carrying lockdowns that had never taken effect;
-- sibling …_p1236_d_…), both caught by reading the live catalog rather than the migration text.
-- Same remedy shape as 20260817140001_p1057_revoke_code_select.sql.
--
-- to_regprocedure(), NOT pg_get_function_identity_arguments(). The first draft of this check
-- compared that function's output against the literal 'text, text, uuid, uuid' and could never
-- match: it returns argument NAMES too — 'p_code text, p_display_name text, p_session_id uuid,
-- p_event_id uuid'. The check silently passed with the 4-argument form sitting right there,
-- which is the same "gate that cannot fire" defect as the requires-frontend marker above, in
-- the same file, written while fixing it. Found only by running the failure path (epistemic
-- gate 7). to_regprocedure resolves by TYPE signature and is indifferent to parameter names;
-- it returns NULL instead of raising when nothing matches, which is why there is no exception
-- handler here.
DO $check$
DECLARE
  v_leftover oid := to_regprocedure('public.create_transcribe_room(text, text, uuid, uuid)');
BEGIN
  IF v_leftover IS NOT NULL THEN
    RAISE EXCEPTION
      'P1236(e): a consent-less create_transcribe_room(text, text, uuid, uuid) is still present '
      'after the DROP — the signature on this database differs from the one this migration '
      'targets. Inspect pg_proc and drop it by its real identity before re-running.';
  END IF;
END
$check$;

CREATE FUNCTION public.create_transcribe_room(
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
-- No `#variable_conflict use_column` here, deliberately, and P1275's reasoning is carried
-- forward verbatim because it still applies: RETURNS TABLE columns are also OUT variables,
-- and `room_id` is additionally a real column of transcribe_room_members. Every value below
-- is carried in a v_-prefixed local and every column reference is qualified, so there is no
-- ambiguity to resolve. Setting use_column would only affect a FUTURE edit that introduced
-- one, and would resolve it SILENTLY to the column rather than raising 42702 — a wrong value
-- written by a SECURITY DEFINER function with no error at all. Postgres's default is the
-- fail-safe setting; leave it alone.
DECLARE
  v_uid     uuid := auth.uid();
  v_name    text := btrim(coalesce(p_display_name, ''));
  v_room    public.transcribe_rooms%ROWTYPE;
  v_member  public.transcribe_room_members%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- IS NOT TRUE, not = FALSE: NULL must refuse too. Same wording and errcode as
  -- join_transcribe_room, so the two paths are indistinguishable to a caller.
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

  -- Bypassing RLS means inheriting the duty to be at least as strict as what it replaced.
  -- Without this, a caller could attach another user's recording to their own seat.
  IF NOT EXISTS (
    SELECT 1 FROM public.clarity_sessions s
    WHERE s.id = p_session_id AND s.creator_profile_id = v_uid
  ) THEN
    RAISE EXCEPTION 'session does not belong to the caller' USING ERRCODE = '42501';
  END IF;

  -- A unique_violation on `code` is deliberately NOT caught. The client generates the code
  -- and retries up to five times on 23505; swallowing it here would turn a recoverable
  -- collision into a silent failure or a wrong room.
  INSERT INTO public.transcribe_rooms (code, event_id)
  VALUES (p_code, p_event_id)
  RETURNING * INTO v_room;

  -- Room, membership and consent in ONE transaction. Either all three exist or none do.
  INSERT INTO public.transcribe_room_members (room_id, profile_id, display_name, session_id, consent_given_at)
  VALUES (v_room.id, v_uid, v_name, p_session_id, now())
  RETURNING * INTO v_member;

  RETURN QUERY SELECT
    v_room.id, v_room.code, v_room.event_id, v_room.created_at, v_room.ended_at,
    v_member.id, v_member.profile_id, v_member.display_name, v_member.session_id,
    v_member.joined_at,
    v_member.consent_given_at;
END;
$$;

COMMENT ON FUNCTION public.create_transcribe_room(text, text, uuid, boolean, uuid) IS
  'P1275 + P1236: creates a /transcribe room, its creator''s membership and that member''s '
  'consent in one transaction. The room half exists because transcribe_rooms'' SELECT policy '
  'is member-scoped (P1207), so INSERT ... RETURNING fails for a creator who is not yet a '
  'member. The consent half exists because this function is SECURITY DEFINER and therefore '
  'bypasses the policies P1236 uses to make an unconsented member unrepresentable — a '
  'definer function has to enforce that itself. Derives profile_id from auth.uid(); do not '
  'add a profile_id argument, and do not re-add a consent-less overload.';

-- REVOKE ... FROM PUBLIC does not remove a role-direct grant, and Supabase's
-- ALTER DEFAULT PRIVILEGES hands every NEW function to anon directly (P1065). This function
-- is newly created above, not replaced, so it gets a fresh default grant to anon and the
-- revoke below is load-bearing rather than ceremonial.
REVOKE ALL ON FUNCTION public.create_transcribe_room(text, text, uuid, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_transcribe_room(text, text, uuid, boolean, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_transcribe_room(text, text, uuid, boolean, uuid) TO authenticated;
