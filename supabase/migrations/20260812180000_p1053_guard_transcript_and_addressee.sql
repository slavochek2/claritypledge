-- P1053 (Migration E): guard the asset itself, and restore the addressee binding.
--
-- diffed against: 20260812170000_p1053_bind_participation_on_claim.sql (claim_joiner_seat)
--                 20260812150000_p1053_joiner_seat_claim_rpcs.sql      (release_joiner_seat)
-- diff: claim_joiner_seat gains TWO guards — a recorded-session check and a
--   target_listener_id check — both placed after the ended_at branch and before the
--   occupancy branch. release_joiner_seat gains one AND-term binding target_listener_id.
--   Every other line of both functions, including signatures, SECURITY DEFINER,
--   SET search_path = public, and the REVOKE/GRANT pairs, is carried over byte-for-byte.
--   complete_clarity_session is NOT redefined here.
--
-- client-safe: tightens authorization inside existing SECURITY DEFINER functions. No grant
-- or policy changes. Both behaviors removed were exploits, each reproduced on test first.
--
-- ---------------------------------------------------------------------------------------
-- FINDING F2 — anon-release then signed-in-claim launders a guest seat into a transcript
-- ---------------------------------------------------------------------------------------
-- Migration D bound PARTICIPATION: a vacated seat carrying joiner_profile_id is refused to
-- everyone else. That guard cannot fire on a GUEST-held seat, because a guest seat has
-- joiner_profile_id IS NULL. So:
--
--   1. Creator (signed in) runs a session with an anonymous guest. It is recorded.
--   2. Attacker, UNAUTHENTICATED, calls release_joiner_seat(id) — permitted by AD3's guest
--      branch for any anon caller holding the id, which the anon SELECT policy publishes.
--      The live guest is evicted.
--   3. Attacker signs in and calls claim_joiner_seat(code). joiner_profile_id becomes theirs.
--   4. session_transcripts SELECT now passes for them.
--
-- Reproduced on test. The victim takes no action; the guest is simply kicked.
--
-- Fixing this on the RELEASE side is not available: a guest has no auth.uid(), so "the same
-- guest returning" and "an attacker" are indistinguishable, and requiring identity there
-- would break the guest leave path outright (AD3). The fix therefore guards the ASSET.
--
-- A session that has already produced a stored transcript or a transcription job is a
-- recorded conversation. Joining one late is not a legitimate flow — a new participant
-- belongs in a new room. This also independently blunts F1 for exactly the rows that hold
-- the asset.
--
-- ACCEPTED COST — SCOPE CORRECTED 2026-08-12, this comment was narrower than the code.
--
-- It previously read "a guest who disconnects AFTER TRANSCRIPTION HAS BEGUN cannot re-claim
-- their own seat." That is wrong, and the error is not in this guard — it is that a *different*
-- guard makes the transcript condition irrelevant for guests. The OCCUPANCY check below reads
--
--     joiner_seat_claimed_at IS NOT NULL AND NOT (auth.uid() IS NOT NULL AND joiner_profile_id = auth.uid())
--
-- and for an anonymous caller `auth.uid() IS NOT NULL` is false, so it fires on ANY still-stamped
-- seat — with no transcript anywhere in the condition. Measured on test: guest claims a seat,
-- immediately re-claims, second call raises 42501 with `session_transcripts` count = 0.
--
-- TRUE SCOPE: an anonymous guest who disconnects for ANY reason without an explicit leave — page
-- refresh, tab close, mic-permission retry, network blip — cannot re-enter their own room, from
-- the first second of the session. There is no heartbeat or presence timeout that frees the seat,
-- and `pagehide` performs no DB write. The room is lost to them.
--
-- This follows from the founder's Reconciliation item 3 resolution (option (a): delete the
-- name-equality rejoin branch), which was chosen with "removing the branch without a replacement
-- breaks guest rejoin, which is a live flow" stated in the problem text. So the behavior is
-- signed off; only the scope written here was wrong. Note that spec AD5 still DESCRIBES a guest
-- branch (b) as implemented — AD5 is stale on that point and Reconciliation item 3 governs.
--
-- Signed-in participants are unaffected — their rejoin passes on the auth.uid() arm.
--
-- ---------------------------------------------------------------------------------------
-- FINDING F3 — letter sessions lost their addressee binding
-- ---------------------------------------------------------------------------------------
-- The clarity_sessions UPDATE policy (20260811170000_p1047_restore_creator_not_null_check)
-- restricts writes on `target_listener_id IS NOT NULL` rows to the addressee or the creator,
-- in both USING and WITH CHECK. joinClaritySession was bound by it while it wrote through a
-- direct UPDATE. claim_joiner_seat is SECURITY DEFINER, bypasses RLS entirely, and never
-- referenced target_listener_id — so a forwarded invite link let anyone take a seat addressed
-- to a named person. Reproduced on test.
--
-- This is the general hazard of moving a write behind SECURITY DEFINER: every predicate the
-- RLS policy was silently enforcing must be re-derived by hand inside the function.

CREATE OR REPLACE FUNCTION public.claim_joiner_seat(p_code text, p_joiner_name text)
RETURNS SETOF public.clarity_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.clarity_sessions;
BEGIN
  IF p_code IS NULL OR length(btrim(p_code)) <> 6 THEN
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  IF p_joiner_name IS NULL OR btrim(p_joiner_name) = '' THEN
    RAISE EXCEPTION 'joiner name is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
    FROM public.clarity_sessions
   WHERE code = upper(btrim(p_code))
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE LOG 'claim_joiner_seat: no room for code %', upper(btrim(p_code));
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  IF v_row.ended_at IS NOT NULL THEN
    RAISE LOG 'claim_joiner_seat: session % already ended', v_row.id;
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  -- F3: a session addressed to a specific listener is claimable only by that listener.
  -- Re-derives the predicate the RLS UPDATE policy enforced before this write moved behind
  -- SECURITY DEFINER.
  IF v_row.target_listener_id IS NOT NULL
     AND auth.uid() IS DISTINCT FROM v_row.target_listener_id
  THEN
    RAISE LOG 'claim_joiner_seat: session % is addressed to %', v_row.id, v_row.target_listener_id;
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  -- F2: a recorded session is not joinable by a newcomer. Scoped so it never blocks the
  -- participant who is already on the row — their rejoin is legitimate and gains them
  -- nothing they do not already hold.
  IF (v_row.joiner_profile_id IS NULL OR v_row.joiner_profile_id IS DISTINCT FROM auth.uid())
     AND (
       EXISTS (SELECT 1 FROM public.session_transcripts t WHERE t.session_id = v_row.id)
       OR EXISTS (SELECT 1 FROM public.transcription_jobs j WHERE j.session_id = v_row.id)
     )
  THEN
    RAISE LOG 'claim_joiner_seat: session % already carries a recording', v_row.id;
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  -- Occupancy: only the same signed-in participant may re-claim a stamped seat.
  IF v_row.joiner_seat_claimed_at IS NOT NULL
     AND NOT (auth.uid() IS NOT NULL AND v_row.joiner_profile_id = auth.uid())
  THEN
    RAISE LOG 'claim_joiner_seat: seat on session % already held', v_row.id;
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  -- F1: a vacated seat still carries whoever participated in it.
  IF v_row.joiner_profile_id IS NOT NULL
     AND v_row.joiner_profile_id IS DISTINCT FROM auth.uid()
  THEN
    RAISE LOG 'claim_joiner_seat: session % carries participant %', v_row.id, v_row.joiner_profile_id;
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.clarity_sessions
     SET joiner_name            = btrim(p_joiner_name),
         joiner_profile_id      = COALESCE(auth.uid(), joiner_profile_id),
         joiner_seat_claimed_at = now()
   WHERE id = v_row.id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_joiner_seat(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_joiner_seat(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.release_joiner_seat(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.clarity_sessions
     SET joiner_name            = NULL,
         joiner_seat_claimed_at = NULL,
         live_state = COALESCE(live_state, '{}'::jsonb)
                      || jsonb_build_object('joinerEnded', true,
                                            'joinerEndedAt', now()::text)
   WHERE id = p_session_id
     AND joiner_seat_claimed_at IS NOT NULL
     -- F3: on an addressed session, only the addressee may vacate the seat. Without this an
     -- anon caller can evict the named listener from a letter session through the guest
     -- branch below.
     AND (target_listener_id IS NULL OR target_listener_id = auth.uid())
     AND (
       (auth.uid() IS NOT NULL AND joiner_profile_id = auth.uid())
       OR (auth.uid() IS NULL AND joiner_profile_id IS NULL AND joiner_name IS NOT NULL)
     );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'not the seated joiner' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.release_joiner_seat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_joiner_seat(uuid) TO anon, authenticated;
