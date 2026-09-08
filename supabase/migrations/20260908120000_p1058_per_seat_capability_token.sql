-- P1058 (residue): close F4 for EVENT PRACTICE ROOMS, where the room code is published.
--
-- diffed against: 20260908114500_p1058_release_seat_requires_code.sql (release_joiner_seat)
--                 20260812210000_p1053_null_safe_guest_name_match.sql  (claim_joiner_seat)
-- diff:
--   claim_joiner_seat   — ONE change: the UPDATE's SET list gains
--                         `joiner_seat_token = gen_random_uuid()`. Every guard above it, the
--                         signature, RETURNS SETOF, SECURITY DEFINER, search_path and the
--                         REVOKE/GRANT pair are carried over byte-for-byte.
--   release_joiner_seat — TWO changes: the signature gains `p_seat_token uuid DEFAULT NULL`,
--                         and the anonymous arm gains a token equality term. The signed-in
--                         arm, the F3 addressee term, the SET list, GET DIAGNOSTICS and the
--                         42501 RAISE are unchanged.
--
-- requires-frontend: 7a801a3ef
--   Carried forward from the previous migration and NOT tightened, deliberately. The anonymous
--   arm now needs a token that only a post-deploy client can hold, so a deployed old client
--   loses guest-leave the moment this lands — the same window the code requirement already
--   opened, against the same arm. The client commit that threads the token through is on this
--   branch and ships in the same bundle; the marker's job is to stop the migration reaching
--   prod ahead of that bundle, which this SHA already does.
--
-- ---------------------------------------------------------------------------------------
-- WHY A TOKEN, WHEN THE CODE ALREADY AUTHORIZES  [FOUNDER DECISION 2026-09-08]
-- ---------------------------------------------------------------------------------------
-- 20260908114500 bound the anonymous release to the room code, which closed F4 for every room
-- whose code is shared 1:1. It did NOT close it for event practice rooms: get_practice_room_codes
-- is granted to anon and publishes those codes to every visitor of a public event page (P1057
-- D-A). For that room class the code is not a secret, so an "authorization" resting on it is not
-- one, and a visitor could still evict a seated guest and take the seat.
--
-- The founder's call was to close it here rather than file it: those rooms were already
-- stranger-JOINABLE by design, but EVICTION is a strictly larger harm than joining, and nothing
-- in P1057 D-A accepted eviction.
--
-- A capability, not an identity and not a shared secret. `joiner_seat_token` is minted fresh by
-- claim_joiner_seat on every successful claim and handed only to the caller who won the seat.
-- It cannot be read from the table by anyone: P1057 put clarity_sessions on DEFAULT-DENY column
-- grants, so a column added later is unreadable by anon and authenticated until it is named in a
-- GRANT — and this one deliberately never is. The verification block asserts that rather than
-- trusting it. The claimer still receives it because claim_joiner_seat is SECURITY DEFINER and
-- returns SETOF clarity_sessions: a definer function's result is not filtered by the caller's
-- column privileges. Confirmed on test before this was designed, by calling claim_joiner_seat as
-- anon and observing `code` — a column anon cannot SELECT — present in the returned row.
--
-- This preserves AD3's core: no identity is required, so the anonymous guest leave path lives.
-- The guest arm now needs BOTH the code and the token. They are written to the client at the same
-- moment and travel together, so requiring both adds no new failure mode, and it means the room
-- code still has to be right even if a token is ever guessed or replayed.
--
-- WHAT THIS DOES NOT DO: it does not make a leaked code revocable, and it does not decide whether
-- event rooms should be attendee-only. Both remain P1098 / product questions.
--
-- Fail direction, restated because it is the crux of this spec's Phase 2: every new term sits in
-- a WHERE, never an IF. A NULL token yields NULL, WHERE excludes the row, ROW_COUNT is 0 and the
-- RAISE fires. There is no branch to skip.

ALTER TABLE public.clarity_sessions ADD COLUMN IF NOT EXISTS joiner_seat_token uuid;

COMMENT ON COLUMN public.clarity_sessions.joiner_seat_token IS
  'P1058: per-seat capability minted by claim_joiner_seat and required by release_joiner_seat''s '
  'anonymous arm. Never granted to anon/authenticated for SELECT — it is handed to the claimer '
  'through the definer function''s result, which column privileges do not filter.';

-- No GRANT. P1057 (20260817140001) revoked table-wide SELECT and granted an explicit column
-- allowlist, so this column is unreadable by anon and authenticated by construction. Likewise
-- P1047 (20260811150000) revoked table-wide UPDATE and P1097 (20260901200100) revoked INSERT,
-- each re-granting an explicit column list — so clients can neither write nor forge this value.

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

  -- P1058: mint a fresh capability for THIS occupancy. Re-minting on the guest-reclaim arm is
  -- deliberate — a refresh issues a new token to the same person and invalidates the previous
  -- one, so a token captured from an earlier occupancy cannot release a later seat.
  RETURN QUERY
  UPDATE public.clarity_sessions
     SET joiner_name            = btrim(p_joiner_name),
         joiner_profile_id      = COALESCE(auth.uid(), joiner_profile_id),
         joiner_seat_claimed_at = now(),
         joiner_seat_token      = gen_random_uuid()
   WHERE id = v_row.id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_joiner_seat(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_joiner_seat(text, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.release_joiner_seat(uuid, text);

CREATE OR REPLACE FUNCTION public.release_joiner_seat(
  p_session_id uuid,
  p_code       text DEFAULT NULL,
  p_seat_token uuid DEFAULT NULL
)
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
         joiner_seat_token      = NULL,
         live_state = COALESCE(live_state, '{}'::jsonb)
                      || jsonb_build_object('joinerEnded', true,
                                            'joinerEndedAt', now()::text)
   WHERE id = p_session_id
     AND joiner_seat_claimed_at IS NOT NULL
     -- F3 (P1053): on an addressed session, only the addressee may vacate the seat.
     AND (target_listener_id IS NULL OR target_listener_id = auth.uid())
     AND (
       -- Signed-in participant vacating their own seat. Authorized on identity; needs neither
       -- the code nor the token, and is untouched by P1058.
       (auth.uid() IS NOT NULL AND joiner_profile_id = auth.uid())
       -- Anonymous guest vacating their own seat: the room code AND the seat capability.
       OR (
         auth.uid() IS NULL
         AND joiner_profile_id IS NULL
         AND joiner_name IS NOT NULL
         AND p_code IS NOT NULL
         AND code = upper(btrim(p_code))
         AND p_seat_token IS NOT NULL
         AND joiner_seat_token = p_seat_token
       )
     );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'not the seated joiner' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.release_joiner_seat(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_joiner_seat(uuid, text, uuid) TO anon, authenticated;

-- ============================================================================
-- Verification — assert the live catalog, never this file's text
-- ============================================================================

DO $$
DECLARE
  v_count int;
BEGIN
  -- 1. Exactly one release_joiner_seat, and it is the 3-arg form. Two overloads would make
  --    every PostgREST call ambiguous (the live failure P1063 hit on seal_and_send_letter),
  --    and a surviving 2-arg form would still accept a code-only release on an event room.
  IF to_regprocedure('public.release_joiner_seat(uuid, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'P1058: release_joiner_seat(uuid, text) survived — an event-room release can still skip the token';
  END IF;
  IF to_regprocedure('public.release_joiner_seat(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'P1058: release_joiner_seat(uuid) survived — the original id-only kick is reachable';
  END IF;
  IF to_regprocedure('public.release_joiner_seat(uuid, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'P1058: release_joiner_seat(uuid, text, uuid) was not created';
  END IF;
  SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'release_joiner_seat';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'P1058: expected exactly one release_joiner_seat overload, found %', v_count;
  END IF;

  -- 2. THE POINT OF THIS MIGRATION: the capability must be unreadable by both client roles.
  --    If either can SELECT it, an event-page visitor reads the token off the row and the
  --    token authorizes nothing.
  IF has_column_privilege('anon', 'public.clarity_sessions', 'joiner_seat_token', 'SELECT') THEN
    RAISE EXCEPTION 'P1058: anon can SELECT joiner_seat_token — the capability is public and closes nothing';
  END IF;
  IF has_column_privilege('authenticated', 'public.clarity_sessions', 'joiner_seat_token', 'SELECT') THEN
    RAISE EXCEPTION 'P1058: authenticated can SELECT joiner_seat_token — the capability is readable off the row';
  END IF;

  -- 3. Nor writable — a forgeable capability is not one.
  IF has_column_privilege('anon', 'public.clarity_sessions', 'joiner_seat_token', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.clarity_sessions', 'joiner_seat_token', 'UPDATE') THEN
    RAISE EXCEPTION 'P1058: a client role can UPDATE joiner_seat_token — the capability is forgeable';
  END IF;

  -- 4. Positive control. The guest journey is anonymous BY DESIGN: if this migration left anon
  --    unable to execute either RPC, checks 1-3 all pass and every guest is silently unable to
  --    join or leave. That is the P886 shape — a gate narrower than the flow it guards.
  IF NOT has_function_privilege('anon', 'public.release_joiner_seat(uuid, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1058: anon lost EXECUTE on release_joiner_seat — the guest leave path is dead';
  END IF;
  IF NOT has_function_privilege('anon', 'public.claim_joiner_seat(text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1058: anon lost EXECUTE on claim_joiner_seat — the guest join path is dead';
  END IF;

  -- 5. P1057 must still hold, or the code half of the guest arm degrades to nothing.
  IF has_column_privilege('anon', 'public.clarity_sessions', 'code', 'SELECT') THEN
    RAISE EXCEPTION 'P1058: anon can SELECT clarity_sessions.code — P1057 regressed';
  END IF;

  RAISE NOTICE 'P1058: per-seat capability token in force; anonymous release needs code + token.';
END;
$$;
