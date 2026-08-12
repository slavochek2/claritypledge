-- P1053 (Migration F): restore guest seat reclaim, bounded to unrecorded rooms.
--
-- diffed against: 20260812180000_p1053_guard_transcript_and_addressee.sql (claim_joiner_seat)
-- diff: ONE change — the occupancy guard gains a third exemption arm for an anonymous caller
--   re-claiming the guest seat they already hold. The signature, SECURITY DEFINER,
--   SET search_path = public, the p_code length guard, the name guard, the SELECT … FOR UPDATE,
--   the NOT FOUND branch, the ended_at branch, the F3 addressee branch, the F2 recorded-session
--   branch, the F1 participation branch, the UPDATE body and the REVOKE/GRANT pair are all
--   carried over byte-for-byte. release_joiner_seat and complete_clarity_session are NOT
--   redefined here.
--
-- client-safe: widens one authorization branch back to a flow that worked before this feature
-- branch. No grant or policy changes. Adds no capability an attacker did not already hold —
-- see "Why this is not a new exposure" below.
--
-- ---------------------------------------------------------------------------------------
-- WHY [FOUNDER DECISION 2026-08-12]
-- ---------------------------------------------------------------------------------------
-- Migration A's occupancy guard reads:
--
--     joiner_seat_claimed_at IS NOT NULL
--     AND NOT (auth.uid() IS NOT NULL AND joiner_profile_id = auth.uid())
--
-- For an anonymous caller `auth.uid() IS NOT NULL` is false, so this fires on ANY still-stamped
-- seat. Measured on test before this migration: a guest claims a seat, immediately re-claims,
-- and the second call raises 42501 with `session_transcripts` count = 0.
--
-- Consequence: an anonymous guest who disconnects for any reason WITHOUT an explicit leave —
-- page refresh, tab close, mic-permission retry, network blip — could not re-enter their own
-- room, from the first second of the session. Nothing frees the seat on a plain disconnect:
-- there is no heartbeat or presence timeout, and `pagehide` performs no DB write
-- (clarity-live-page.tsx). The room was simply lost to them.
--
-- This replaced a flow that DID work before this branch: `joinClaritySession`'s
-- `existing.joiner_name === joinerName` rejoin. Reconciliation item 3 deleted that branch
-- (option (a)) with "removing the branch without a replacement breaks guest rejoin, which is a
-- live flow" stated in the problem text — so the loss was signed off in the abstract. On seeing
-- the concrete scope (every refresh, not just recorded sessions) the founder chose to restore
-- it, bounded.
--
-- ---------------------------------------------------------------------------------------
-- WHY THIS IS NOT A NEW EXPOSURE
-- ---------------------------------------------------------------------------------------
-- The exemption keys on `joiner_name`, which the wide anon SELECT publishes. So a code-holder
-- can read the seated guest's name, resubmit it, and take the seat. That forgeability is real
-- and is the reason the Security Review struck the branch from AD2.
--
-- It grants no capability the attacker lacks today. AD3 deliberately permits ANY anonymous
-- caller holding the session id to `release_joiner_seat` on an anonymously-held seat ("the same
-- exposure `patch_live_state` has accepted since P671"). So the seat is already takeable in two
-- steps — release, then claim the now-vacant seat, which needs no name at all. This is the
-- identical argument the founder used to reject option (b): a secret on claim alone is bypassed
-- by the leave path. The same reasoning cuts the other way here — a name check on claim alone
-- is not what is holding the attacker back, so removing it costs nothing and restoring it
-- costs nothing.
--
-- What the exemption CANNOT do, by construction:
--   * it requires `joiner_profile_id IS NULL`, so it never touches a seat a signed-in user
--     holds or has held — the F1 asset stays sealed;
--   * the UPDATE writes `COALESCE(auth.uid(), joiner_profile_id)` and `auth.uid()` is NULL on
--     this arm, so `joiner_profile_id` stays NULL and NO `session_transcripts` row becomes
--     reachable (that policy gates on a non-NULL `auth.uid()` a guest never has);
--   * it requires no transcript and no transcription job on the row (see below).
--
-- ---------------------------------------------------------------------------------------
-- THE TRANSCRIPT CHECK IS DELIBERATELY REDUNDANT
-- ---------------------------------------------------------------------------------------
-- The F2 guard already sits ABOVE the occupancy guard and refuses any claimer whose
-- `joiner_profile_id` is not already on the row when a transcript or job exists — which covers
-- every anonymous caller. So by ordering alone, this exemption could never fire on a recorded
-- room and the EXISTS checks below are unnecessary.
--
-- They are written anyway, because ordering is exactly what this codebase has lost before: P1047
-- part 4's guard was dropped during a CREATE OR REPLACE and nobody noticed until the exploit was
-- reproduced. A future reorder or rewrite that moves F2 below this point would silently widen
-- this arm into "any code-holder may take a recorded guest room by name." Self-contained is the
-- property worth paying two EXISTS for. The pair is also pinned in CRITICAL_PREDICATES
-- (src/tests/sd-guard-completeness.test.ts) so a silent drop fails a test rather than shipping.

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
  --       participant and no recording. Restores the pre-P1053 guest refresh path.
  IF v_row.joiner_seat_claimed_at IS NOT NULL
     AND NOT (auth.uid() IS NOT NULL AND v_row.joiner_profile_id = auth.uid())
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
