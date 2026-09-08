-- P1058: REVERT the per-seat capability token added by 20260908120000.
--
-- diffed against: 20260908120000_p1058_per_seat_capability_token.sql
-- diff: restores claim_joiner_seat to its 20260812210000 body (drops the
--   `joiner_seat_token = gen_random_uuid()` mint from the UPDATE's SET list) and restores
--   release_joiner_seat to its 20260908114500 two-argument form (drops p_seat_token and the
--   token equality term). Nothing else changes. The COLUMN is deliberately NOT dropped — see
--   below.
--
-- requires-frontend: 7a801a3ef
--   After this migration the anonymous release arm needs the room code and nothing else, which
--   is exactly what 7a801a3ef's client sends. The token-threading client (03e1579cc) is
--   reverted on this branch in the same commit as this file, so no deployed client will send
--   p_seat_token to a function that no longer accepts it.
--
-- ---------------------------------------------------------------------------------------
-- WHY THIS IS BEING REVERTED  [FOUNDER DECISION 2026-09-08, on adversarial-review evidence]
-- ---------------------------------------------------------------------------------------
-- 20260908120000 was written to close F4 for event practice rooms, whose codes
-- get_practice_room_codes publishes to any anon visitor. The P1058 Phase 3 adversarial review
-- found that it closes nothing, and costs availability. Three findings, all REPRODUCED on test:
--
-- 1. THE CAPABILITY IS HANDED TO THE ATTACKER ON REQUEST. claim_joiner_seat's guest-reclaim arm
--    authorizes on `joiner_name`, which is the third column of P1057's 21-column anon SELECT
--    allowlist. So an attacker reads the seated guest's name, re-claims under it, and the
--    function MINTS A FRESH TOKEN AND RETURNS IT (`RETURNING *`). Measured: victim token
--    96ec5ce1-…, attacker token 30769e8c-… on the same seat, seconds apart, from an anon client.
--    The token gates on a public string, so it is not a capability at all.
--
--    This is a consequence of P1058 itself. Migration 20260812190000 justified the
--    name-forgeable reclaim arm explicitly on AD3 — "release-then-claim already bypasses any
--    name check, so a name check on claim alone is not what is holding the attacker back."
--    20260908114500 removed AD3 and thereby voided that justification, without re-examining
--    what had been resting on it. P1058's own Non-Goals inherited the same dead premise.
--
-- 2. IT STRANDS EVERY SEAT THAT EXISTS WHEN IT LANDS. The column is added nullable with no
--    backfill, while the release arm requires `joiner_seat_token = p_seat_token`. For a seat
--    claimed before the migration the column is NULL, `NULL = x` is NULL, the row is excluded,
--    ROW_COUNT is 0 and the function raises 42501 — permanently. Measured on test: 200+ rows
--    with `joiner_seat_claimed_at IS NOT NULL AND joiner_seat_token IS NULL`. Prod has the same
--    shape. The requires-frontend ordering makes it worse rather than better: the client
--    deploys FIRST, so every seat claimed in that window also stores no token and strands.
--
-- 3. THE CLIENT COULD NOT SURVIVE A PAGE RELOAD ANYWAY. LiveSessionProvider holds the token in
--    React state and never restores it from localStorage, and setActiveSession is called only
--    at the four join/create sites — never on the restore path. So after any reload the token
--    was null while the seat was still held, and the seated guest could not leave.
--
-- None of this was caught by the 13 canaries that passed against it: they are DB-level and
-- never simulate a reload, a pre-existing seat, or a second RPC. epistemic.md 7b — the fixture
-- structurally could not emit the inputs that mattered.
--
-- WHAT REMAINS OPEN, deliberately and on the record: event practice rooms are still exposed to
-- the release-then-claim seat takeover, because their codes are published by design. That is
-- filed as its own spec together with the name-forgeable reclaim arm, which has to be decided
-- first — closing it costs a guest the ability to rejoin from a new device, which is a product
-- trade-off and not an implementation detail.
--
-- THE COLUMN IS KEPT, NOT DROPPED. Nothing writes it once the mint below is removed, so it is
-- inert: nullable, ungranted for SELECT/UPDATE/INSERT to both client roles, and referenced by no
-- code path. Keeping it avoids a destructive DROP on a shared database for a value with no
-- consumers, and the follow-up spec is likely to want the column back. Its COMMENT is rewritten
-- so a future reader cannot mistake it for a live mechanism.

COMMENT ON COLUMN public.clarity_sessions.joiner_seat_token IS
  'INERT since P1058 revert (20260908130000). Added by 20260908120000 as a per-seat capability, '
  'reverted the same day: claim_joiner_seat''s reclaim arm authorizes on joiner_name, which anon '
  'can SELECT, so the token was minted and handed to any attacker who asked. Nothing reads or '
  'writes this column today. Do NOT grant SELECT or UPDATE on it to anon/authenticated.';

-- Restore claim_joiner_seat exactly as 20260812210000 defined it (no token mint).
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
  --
  -- P1058 NOTE: arm (b) is name-forgeable, and `joiner_name` is anon-readable. P1053 accepted
  -- that because release_joiner_seat let any id-holder free the seat anyway, so the name check
  -- was not what stopped an attacker. 20260908114500 removed that, so this arm is now the
  -- weakest link in the seat surface. Deliberately NOT changed here — tightening it costs a
  -- guest the ability to rejoin from a new device, which is a founder call. Filed.
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

DROP FUNCTION IF EXISTS public.release_joiner_seat(uuid, text, uuid);

-- Restore release_joiner_seat exactly as 20260908114500 defined it (code, no token).
CREATE OR REPLACE FUNCTION public.release_joiner_seat(p_session_id uuid, p_code text DEFAULT NULL)
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
     -- F3 (P1053): on an addressed session, only the addressee may vacate the seat.
     AND (target_listener_id IS NULL OR target_listener_id = auth.uid())
     AND (
       (auth.uid() IS NOT NULL AND joiner_profile_id = auth.uid())
       OR (
         auth.uid() IS NULL
         AND joiner_profile_id IS NULL
         AND joiner_name IS NOT NULL
         AND p_code IS NOT NULL
         AND code = upper(btrim(p_code))
       )
     );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'not the seated joiner' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.release_joiner_seat(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_joiner_seat(uuid, text) TO anon, authenticated;

DO $$
BEGIN
  -- Exactly one release_joiner_seat, and it is the two-arg form. A surviving three-arg overload
  -- would make every PostgREST call ambiguous (the live failure P1063 hit on seal_and_send_letter).
  IF to_regprocedure('public.release_joiner_seat(uuid, text, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'P1058 revert: the three-arg release_joiner_seat survived';
  END IF;
  IF to_regprocedure('public.release_joiner_seat(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'P1058 revert: the original id-only kick is reachable again';
  END IF;
  IF to_regprocedure('public.release_joiner_seat(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'P1058 revert: the two-arg release_joiner_seat was not restored';
  END IF;

  -- The reverted state must still refuse a code-less anonymous release. This is the whole of
  -- what P1058 ships, so assert it here rather than only in the e2e suite.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'release_joiner_seat'
       AND pg_get_functiondef(p.oid) NOT LIKE '%code = upper(btrim(p_code))%'
  ) THEN
    RAISE EXCEPTION 'P1058 revert: the restored release_joiner_seat lost its room-code check';
  END IF;

  -- claim_joiner_seat must no longer mint a token.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'claim_joiner_seat'
       AND pg_get_functiondef(p.oid) LIKE '%joiner_seat_token%'
  ) THEN
    RAISE EXCEPTION 'P1058 revert: claim_joiner_seat still references joiner_seat_token';
  END IF;

  -- Positive controls: the guest journey stays anonymous and reachable.
  IF NOT has_function_privilege('anon', 'public.release_joiner_seat(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1058 revert: anon lost EXECUTE on release_joiner_seat';
  END IF;
  IF NOT has_function_privilege('anon', 'public.claim_joiner_seat(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1058 revert: anon lost EXECUTE on claim_joiner_seat';
  END IF;

  -- The inert column must stay ungranted, so a later reader cannot quietly turn it into a
  -- readable field and resurrect the broken design.
  IF has_column_privilege('anon', 'public.clarity_sessions', 'joiner_seat_token', 'SELECT')
     OR has_column_privilege('authenticated', 'public.clarity_sessions', 'joiner_seat_token', 'SELECT') THEN
    RAISE EXCEPTION 'P1058 revert: joiner_seat_token became client-readable';
  END IF;

  RAISE NOTICE 'P1058: per-seat token reverted; anonymous release requires the room code only.';
END;
$$;
