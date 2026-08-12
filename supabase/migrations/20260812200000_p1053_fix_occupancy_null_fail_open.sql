-- P1053 (Migration G): the occupancy guard fails OPEN on guest-held seats. Three-valued logic.
--
-- diffed against: 20260812190000_p1053_restore_guest_seat_reclaim.sql (claim_joiner_seat)
-- diff: ONE operator change inside the occupancy guard — `v_row.joiner_profile_id = auth.uid()`
--   becomes `v_row.joiner_profile_id IS NOT DISTINCT FROM auth.uid()`. Every other line of the
--   function, including the signature, SECURITY DEFINER, SET search_path = public, all four
--   preceding guards, the guest-reclaim arm added by Migration F, the F1 branch, the UPDATE body
--   and the REVOKE/GRANT pair, is carried over byte-for-byte. release_joiner_seat and
--   complete_clarity_session are NOT redefined here.
--
-- client-safe: strictly narrower. It closes a path that should never have been open; no
-- legitimate caller loses access (proof below). No grant or policy changes.
--
-- ---------------------------------------------------------------------------------------
-- FINDING F5 — a signed-in stranger takes a LIVE anonymous guest's seat
-- ---------------------------------------------------------------------------------------
-- Reproduced on test before being believed. A live guest holds a seat; a signed-in stranger
-- calls claim_joiner_seat with any name and succeeds:
--
--   before: joiner_name = 'Live Guest', joiner_profile_id = NULL, seat stamped
--   claim:  error = null                      <- the occupancy guard did not fire
--   after:  joiner_name = 'Attacker', joiner_profile_id = <attacker uid>
--
-- MECHANISM. The guard read:
--
--     IF v_row.joiner_seat_claimed_at IS NOT NULL
--        AND NOT (auth.uid() IS NOT NULL AND v_row.joiner_profile_id = auth.uid())
--
-- On a guest-held seat `joiner_profile_id` is NULL, so for a SIGNED-IN caller:
--
--     v_row.joiner_profile_id = auth.uid()   ->  NULL      (not false — NULL = x is NULL)
--     true AND NULL                          ->  NULL
--     NOT NULL                               ->  NULL
--     true AND NULL                          ->  NULL
--     IF NULL THEN ...                       ->  does not fire
--
-- In plpgsql a NULL condition is not an error and not true — the branch is simply skipped. For a
-- refusal guard, "skipped" means ALLOWED. The guard failed open.
--
-- WHY EVERY EXISTING CANARY MISSED IT (epistemic gate 7b — the fixture could not emit the input).
-- The suite tests two shapes: an ANONYMOUS caller against an occupied seat, and a SIGNED-IN
-- caller against a seat held by another SIGNED-IN user. Neither reaches the NULL:
--   * anonymous caller  -> `auth.uid() IS NOT NULL` is false, and `false AND NULL` is FALSE, not
--     NULL. The guard fires correctly. This is why "claim_joiner_seat refuses to claim a seat
--     that is already occupied" has been green the whole time.
--   * signed-in vs signed-in -> `joiner_profile_id` is non-NULL, so the comparison is a real
--     boolean and the guard fires correctly.
-- The missing input is the CROSS pair: seat held by a GUEST, claimer SIGNED IN. Nothing in the
-- fixture constructed it until Migration F's verification did, by accident.
--
-- IMPACT. It is not only seat theft. The UPDATE writes
-- `joiner_profile_id = COALESCE(auth.uid(), joiner_profile_id)`, so the stranger becomes the
-- row's participant. If that session subsequently produces a transcript, they are inside the
-- `creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid()` SELECT policy and can read
-- it. F2 guards sessions that are ALREADY recorded; this reaches the same asset by arriving
-- BEFORE the recording starts. Same destination, earlier door.
--
-- NOT A PROD REGRESSION. Pre-P1053 there is no claim_joiner_seat, and the only occupancy check is
-- client-side JavaScript that any caller can skip — the seat is takeable by anyone today. This is
-- an incompletely-closed hole in the fix, not a new one in production.
--
-- INTRODUCED BY MIGRATION A (20260812150000), inherited unchanged through D, E and F. Adding
-- further `AND NOT (…)` terms in F could never have helped: `NULL AND true` is still NULL.
--
-- ---------------------------------------------------------------------------------------
-- THE FIX, AND WHY IT IS EXACTLY THIS
-- ---------------------------------------------------------------------------------------
-- `IS NOT DISTINCT FROM` is NULL-safe: it returns true or false, never NULL, and treats two NULLs
-- as equal. Truth table for the exemption arm `auth.uid() IS NOT NULL AND joiner_profile_id IS
-- NOT DISTINCT FROM auth.uid()`:
--
--   seat holder      caller        arm     guard fires?   correct?
--   guest (NULL)     signed in     false   YES refuse     yes  <- F5, was NULL/allowed
--   guest (NULL)     anonymous     false   guest arm      yes  <- Migration F handles it
--   signed-in U      U             true    no, allowed    yes  <- rejoin/mic-retry preserved
--   signed-in U      signed-in V   false   YES refuse     yes
--   signed-in U      anonymous     false   YES refuse     yes
--
-- No legitimate caller loses access: the only row that changes from allow to refuse is the one
-- where the arm was NULL, which is precisely the attack.
--
-- Deliberately NOT rewritten with `=`-plus-explicit-NULL-checks. `IS NOT DISTINCT FROM` states
-- the intent in one operator and cannot be half-applied by a later editor. The other predicates
-- in this function were already written with `IS DISTINCT FROM` (F1, F2, F3) and are NULL-safe;
-- this line was the sole `=` comparison against a nullable column, and it was the sole hole.
--
-- `release_joiner_seat` carries the same `=` shape but is NOT affected and is NOT changed here:
-- its comparison sits in a WHERE clause, where NULL excludes the row, yielding 0 updated rows and
-- a raised 'not the seated joiner'. That is fail-CLOSED. The asymmetry is the lesson — the same
-- expression fails open in an IF and closed in a WHERE.

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
  IF v_row.target_listener_id IS NOT NULL
     AND auth.uid() IS DISTINCT FROM v_row.target_listener_id
  THEN
    RAISE LOG 'claim_joiner_seat: session % is addressed to %', v_row.id, v_row.target_listener_id;
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  -- F2: a recorded session is not joinable by a newcomer.
  IF (v_row.joiner_profile_id IS NULL OR v_row.joiner_profile_id IS DISTINCT FROM auth.uid())
     AND (
       EXISTS (SELECT 1 FROM public.session_transcripts t WHERE t.session_id = v_row.id)
       OR EXISTS (SELECT 1 FROM public.transcription_jobs j WHERE j.session_id = v_row.id)
     )
  THEN
    RAISE LOG 'claim_joiner_seat: session % already carries a recording', v_row.id;
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  -- Occupancy. A stamped seat is re-claimable by exactly two callers:
  --   (a) the seated SIGNED-IN participant (refresh, mic retry, rejoin prompt);
  --   (b) the seated GUEST, identified by name, and only while the room holds no signed-in
  --       participant and no recording.
  -- F5: arm (a) uses IS NOT DISTINCT FROM. With plain `=` it evaluates to NULL on a guest-held
  -- seat for a signed-in caller, and a NULL IF condition skips the refusal — fail-open.
  IF v_row.joiner_seat_claimed_at IS NOT NULL
     AND NOT (auth.uid() IS NOT NULL AND v_row.joiner_profile_id IS NOT DISTINCT FROM auth.uid())
     AND NOT (
       auth.uid() IS NULL
       AND v_row.joiner_profile_id IS NULL
       AND v_row.joiner_name = btrim(p_joiner_name)
       AND NOT EXISTS (SELECT 1 FROM public.session_transcripts t WHERE t.session_id = v_row.id)
       AND NOT EXISTS (SELECT 1 FROM public.transcription_jobs j WHERE j.session_id = v_row.id)
     )
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
