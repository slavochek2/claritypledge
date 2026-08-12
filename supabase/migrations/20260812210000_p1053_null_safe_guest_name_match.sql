-- P1053 (Migration H): the last comparison in claim_joiner_seat that is not NULL-safe by itself.
--
-- diffed against: 20260812200000_p1053_fix_occupancy_null_fail_open.sql (claim_joiner_seat)
-- diff: ONE operator change inside the guest-reclaim arm — `v_row.joiner_name = btrim(p_joiner_name)`
--   becomes `v_row.joiner_name IS NOT DISTINCT FROM btrim(p_joiner_name)`. Every other line of the
--   function, including the signature, SECURITY DEFINER, SET search_path = public, all guards, the
--   UPDATE body and the REVOKE/GRANT pair, is carried over byte-for-byte. release_joiner_seat and
--   complete_clarity_session are NOT redefined here.
--
-- client-safe: no behavior change under the invariants that hold today (proof below). No grant or
-- policy changes.
--
-- ---------------------------------------------------------------------------------------
-- WHY, WHEN IT CHANGES NOTHING TODAY
-- ---------------------------------------------------------------------------------------
-- Surfaced by the second code review, which audited every boolean condition in the three P1053
-- functions for NULL-reachable operands after F5. Its conclusion: F5 was the only live hole, and
-- every remaining condition is NULL-safe by construction — with exactly one exception.
--
-- The guest-reclaim arm compared `v_row.joiner_name = btrim(p_joiner_name)`. That is a plain `=`
-- against a nullable column, sitting inside an `IF`, which is precisely the shape F5 was:
--
--     AND NOT ( auth.uid() IS NULL AND joiner_profile_id IS NULL
--               AND joiner_name = btrim(p_joiner_name) AND NOT EXISTS ... )
--
-- If `joiner_name` were NULL, that term is NULL, the inner AND-chain is NULL, `NOT NULL` is NULL,
-- and the outer chain collapses to NULL — so the occupancy guard is SKIPPED and the claim is
-- ALLOWED. Same failure mode as F5, same construct, one line away.
--
-- It cannot fire today, and the reason is an EXTERNAL invariant rather than the operator: the
-- CHECK constraint `clarity_sessions_seat_claim_requires_name` (Migration B, 20260812160000)
-- guarantees `joiner_seat_claimed_at IS NOT NULL => joiner_name IS NOT NULL`, and the outer
-- AND-chain has already required `joiner_seat_claimed_at IS NOT NULL`. Verified live on test: an
-- INSERT stamping a seat with a NULL name is rejected with 23514.
--
-- So this migration fixes nothing that is currently broken. It is worth doing anyway:
--
--   * Every sibling predicate in this function (F1, F2, F3, F5) is NULL-safe by its own operators.
--     This one relied on a constraint declared in a different migration. A reader auditing the
--     function in isolation cannot see why it is safe, and an auditor who drops or weakens that
--     CHECK — or backfills a row around it — reopens an F5-class fail-open with no local signal.
--   * The whole lesson of F5 is that NULL-safety should be visible at the point of comparison, not
--     inferred from an invariant maintained elsewhere. Leaving the one exception in place while
--     writing that lesson down would be advice the code does not take.
--
-- `IS NOT DISTINCT FROM` gives identical results whenever `joiner_name` is non-NULL, which the
-- CHECK already guarantees, so the behavior change is empty under current invariants — and when
-- `joiner_name` IS NULL it yields FALSE (refuse) instead of NULL (skip, allow). Fail-closed.
-- `p_joiner_name` is separately guaranteed non-NULL and non-empty by the guard at the top of the
-- function, so `btrim(p_joiner_name)` is never NULL and the two-NULLs-are-equal case cannot arise.

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
  -- Both arms use NULL-safe comparisons. A plain `=` against a nullable column here yields NULL,
  -- and plpgsql SKIPS an IF whose condition is NULL — a skipped refusal guard is an allow. That
  -- was F5 on arm (a); arm (b)'s name check is the same shape and is pinned the same way.
  IF v_row.joiner_seat_claimed_at IS NOT NULL
     AND NOT (auth.uid() IS NOT NULL AND v_row.joiner_profile_id IS NOT DISTINCT FROM auth.uid())
     AND NOT (
       auth.uid() IS NULL
       AND v_row.joiner_profile_id IS NULL
       AND v_row.joiner_name IS NOT DISTINCT FROM btrim(p_joiner_name)
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
