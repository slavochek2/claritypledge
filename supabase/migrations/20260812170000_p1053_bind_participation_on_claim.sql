-- P1053 (Migration D): a seat that already carries a participant is not claimable by anyone else.
--
-- diffed against: 20260812150000_p1053_joiner_seat_claim_rpcs.sql
-- diff: ONE added guard in claim_joiner_seat — the `v_row.joiner_profile_id IS NOT NULL AND
--   IS DISTINCT FROM auth.uid()` block, placed after the occupancy check and before the
--   UPDATE. The signature, SECURITY DEFINER, SET search_path = public, the p_code length
--   guard, the name guard, the SELECT ... FOR UPDATE, the NOT FOUND branch, the ended_at
--   branch, the occupancy branch, the UPDATE body and the REVOKE/GRANT pair are all carried
--   over byte-for-byte. release_joiner_seat and complete_clarity_session are NOT redefined
--   here and keep their Migration A definitions.
--
-- client-safe: tightens an authorization check inside an existing SECURITY DEFINER function.
-- No grant or policy changes. The only behavior removed is one that was an exploit.
--
-- ---------------------------------------------------------------------------------------
-- ADVERSARIAL REVIEW FINDING F1 — confirmed by reproduction, not by argument
-- ---------------------------------------------------------------------------------------
-- claim_joiner_seat guarded OCCUPANCY (joiner_seat_claimed_at) and then overwrote
-- PARTICIPATION unconditionally:
--
--     joiner_profile_id = COALESCE(auth.uid(), joiner_profile_id)
--
-- release_joiner_seat deliberately clears joiner_seat_claimed_at while KEEPING
-- joiner_profile_id, so the departed participant retains transcript access. Those two facts
-- compose into a transfer. Reproduced on test:
--
--   1. Signed-in joiner V joins creator C's room. The session is recorded.
--   2. V leaves (End Session, or simply logging out — AuthContext also calls it). Row now
--      reads: seat FREE, joiner_profile_id = V.
--   3. Attacker A signs up, finds the row (the anon SELECT policy publishes every
--      null-target row), and calls claim_joiner_seat with the code.
--   4. joiner_profile_id becomes A.
--
-- Measured result: A holds the seat; V's own SELECT on session_transcripts returns ZERO
-- rows. A private conversation between C and V is handed to A, and V loses their own
-- transcript. session_transcripts and transcription_jobs both gate SELECT on
-- `creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid()`
-- (20260313120000_p495_transcription_tables.sql:71-94).
--
-- This is the P1047 part-4 shape repeating. P1047's trigger enforced
-- `OLD.joiner_profile_id IS NOT NULL -> RAISE`; part 5 reverted it because it broke rejoin,
-- and when the vacancy check moved to a dedicated column that guard was never re-derived.
-- The P1053 canary suite asserted the exploit as a PASSING control, exactly as P1047's did.
--
-- ---------------------------------------------------------------------------------------
-- THE TRADE-OFF, MADE EXPLICIT [FOUNDER DECISION 2026-08-12]
-- ---------------------------------------------------------------------------------------
-- joiner_profile_id is a SINGLE SLOT. These two properties are mutually exclusive until
-- participation moves to a child table:
--
--   (a) a DIFFERENT signed-in person may join a room a previous signed-in joiner left
--   (b) the departed participant keeps access to their own transcript
--
-- (b) wins. A room that a signed-in person has participated in is bound to them. The cost is
-- that a second signed-in stranger can no longer take that room — which for a two-person
-- practice room is the correct product behavior, not a regression.
--
-- Deliberately NOT restricted: same-user rejoin (auth.uid() matches), and claiming a room
-- that has never had a signed-in participant (joiner_profile_id IS NULL) — including every
-- anonymous practice room.
--
-- The guard also rejects an ANONYMOUS claimer on a room carrying a departed signed-in
-- participant. That is not incidental. COALESCE would preserve the old id, so the victim
-- would keep access — but the guest's NEW conversation would then be recorded into a session
-- the departed participant can still read. The leak runs in both directions; this closes both.

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

  -- Occupancy: only the same signed-in participant may re-claim a stamped seat.
  IF v_row.joiner_seat_claimed_at IS NOT NULL
     AND NOT (auth.uid() IS NOT NULL AND v_row.joiner_profile_id = auth.uid())
  THEN
    RAISE LOG 'claim_joiner_seat: seat on session % already held', v_row.id;
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  -- F1: PARTICIPATION. A vacated seat still carries whoever participated in it, and that
  -- participation is what the transcript policies key on. Anyone other than that participant
  -- — signed in as someone else, or anonymous — is refused. Without this the occupancy guard
  -- above is bypassed by simply waiting for (or triggering) a release.
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
