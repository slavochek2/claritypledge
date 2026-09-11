-- P1269: a guest's display name is not a credential. Replace it with a per-seat secret,
-- and bound seat ownership by verified presence rather than by anything anyone can read.
--
-- diffed against: 20260812210000_p1053_null_safe_guest_name_match.sql (claim_joiner_seat).
--   The signed-in arms (F1, F2, F3), the code/name input guards, the ended-session guard, the
--   row lock and the RAISE LOG lines are carried over unchanged. release_joiner_seat is NOT
--   redefined here — P1058's room-code requirement stands untouched.
--
-- diff, in one sentence: the guest-reclaim arm no longer accepts a NAME. It accepts the seat
--   secret minted when the seat was claimed, or — if the seat has shown no presence for 15
--   minutes — treats the seat as abandoned and lets anyone claim it fresh.
--
-- requires-frontend: 0000000000000000000000000000000000000000
--
-- DELIBERATELY UNSATISFIABLE, AND IT MUST STAY THAT WAY UNTIL SHIP. This marker hard-blocks
-- the PROD apply (migrate.sh gate 2), which is correct today: until the client that stores and
-- resends the seat secret is live, a guest has no secret to present, so applying this to prod
-- first would remove name-based rejoin while giving nothing back — every guest who reloads
-- would wait out the 15-minute timer.
--
-- AT SHIP TIME, re-point this to the LANDED commit sha, not the branch-local one. /ship
-- cherry-picks, so the sha changes; P1058 blocked its own prod apply for exactly this reason
-- and needed a re-point commit AFTER the cherry-pick and BEFORE the migrate. Same sequence here.
--
-- ---------------------------------------------------------------------------------------
-- THE DEFECT
-- ---------------------------------------------------------------------------------------
-- claim_joiner_seat's guest-reclaim arm authorized on
-- `joiner_name IS NOT DISTINCT FROM btrim(p_joiner_name)`. `joiner_name` is inside the anon
-- SELECT allowlist, and for event practice rooms the room code is handed to any anonymous
-- caller that names an event id. So a stranger could read the seated guest's name, re-claim
-- the seat under it, and be treated as that guest. Reproduced twice on test, 2026-09-08,
-- during P1058's Phase 3 adversarial review.
--
-- P1058 already tried the obvious fix (mint a per-seat secret, require it on RELEASE) and had
-- to revert it, because the reclaim arm handed the freshly minted secret to the attacker: two
-- secrets were issued for the same seat, seconds apart, to two different anonymous callers.
-- Any per-seat capability is void while a name-authorized reclaim arm stands. That is why this
-- migration closes the reclaim arm rather than adding a capability beside it.
--
-- ---------------------------------------------------------------------------------------
-- WHERE THIS DEPARTS FROM THE SPEC'S RECORDED SHAPE, AND WHY
-- ---------------------------------------------------------------------------------------
-- The founder decided: "close the forgeable path, with a bounded grace window", and delegated
-- the window's length and mechanics ("I'll let you decide"). The spec then wrote the window as:
-- name-only reclaim permitted INSIDE 15 minutes of the guest's last verified presence.
--
-- That shape does not close the exploit, and the reason is structural rather than a detail: a
-- guest who is actually in the room has a RECENT last-presence by definition, so the window is
-- open for exactly as long as the victim is sitting in it. The attacker reads the name, claims
-- inside the window, and the forgery succeeds — which is the case the spec exists to stop.
-- The window as written protects the abandoned seat and leaves the occupied one open; the
-- threat is the other way round.
--
-- So the mechanics are inverted here, and the name is removed from authorization entirely:
--
--   * secret matches            -> reclaim, and refresh presence. This is the common case
--                                  (reload, tab reopen, network blip) and it is silent.
--   * no presence for 15 min    -> the seat is ABANDONED. Anyone may claim it fresh, and a new
--                                  secret is minted. Not a "reclaim" — the seat is simply free.
--   * otherwise                 -> refused.
--
-- This satisfies the spec's own Invariant, which the spec's mechanics did not:
-- "Whatever a guest presents to prove seat ownership MUST NOT be derivable from any column the
-- anon SELECT allowlist publishes." A name now proves nothing, inside the window or outside it.
--
-- THE COST, STATED PLAINLY because it is the half the founder weighted heavily in P1053: a
-- guest who loses local storage (cleared cache, dead phone, different device) can no longer
-- re-enter their own seat immediately by retyping their name. They wait out the 15-minute
-- abandonment timer, or the host ends the round. That is a real regression in a real scenario,
-- and it is the price of the name not being a credential. The alternative on the table — the
-- spec's literal window — buys that convenience back by leaving the live exploit open, which
-- is not a trade this spec is allowed to make.
--
-- 15 minutes is kept from the spec's reasoning: it covers a browser crash plus reopen, stays
-- well inside a live session, and is half the shortest room lifetime (30 minutes,
-- 20260221160452_p406_event_practice_rooms.sql), so an abandonment timer can never outlive the
-- room it protects.
--
-- ---------------------------------------------------------------------------------------
-- LEGACY SEATS NEED NO BACKFILL, AND MUST NOT FAIL OPEN
-- ---------------------------------------------------------------------------------------
-- Every seat claimed before this migration has joiner_seat_secret IS NULL and
-- joiner_last_seen_at IS NULL. Treating a NULL presence as "abandoned" would make every
-- pre-existing seat instantly claimable by anyone — a fail-open on exactly the rows the fix is
-- supposed to protect. Treating it as "present" would strand them forever.
--
-- Neither is needed: presence is read as COALESCE(joiner_last_seen_at, joiner_seat_claimed_at),
-- so a legacy seat falls back to WHEN IT WAS CLAIMED. A legacy seat claimed two minutes ago is
-- protected for thirteen more; one claimed an hour ago is abandoned and reclaimable. This is a
-- read-side default, so there is no backfill UPDATE and no repair pass to get wrong, and the
-- deploy window carries no row that is worse off than it is today.
--
-- The residual is a legacy guest mid-session whose tab reloads inside the deploy window: their
-- client holds no secret, so they wait out the timer. Bounded, self-healing, and strictly
-- better than the status quo in which a stranger could have taken that seat at any moment.

-- ============================================================================
-- Columns
-- ============================================================================
ALTER TABLE public.clarity_sessions
  ADD COLUMN IF NOT EXISTS joiner_seat_secret  uuid,
  ADD COLUMN IF NOT EXISTS joiner_last_seen_at timestamptz;

COMMENT ON COLUMN public.clarity_sessions.joiner_seat_secret IS
  'P1269: per-seat capability minted by claim_joiner_seat for an anonymous guest seat. The ONLY '
  'proof of guest seat ownership. Never granted to anon/authenticated for SELECT — it reaches '
  'its holder solely as a column of claim_joiner_seat''s returned row (SECURITY DEFINER).';

COMMENT ON COLUMN public.clarity_sessions.joiner_last_seen_at IS
  'P1269: last verified presence of the seated guest, written by claim_joiner_seat and refreshed '
  'by touch_joiner_seat. Read as COALESCE(joiner_last_seen_at, joiner_seat_claimed_at) so a seat '
  'claimed before P1269 falls back to its claim time rather than reading as abandoned.';

-- Deliberately NO grant of these two columns to anon or authenticated. P1057 grants
-- clarity_sessions column-by-column (21 of 23 before this migration, no table-level SELECT), so
-- a new column is ungranted by default — asserted below rather than assumed.
--
-- THAT ONE GRANT GUARDS TWO SURFACES, not one. clarity_sessions is in the supabase_realtime
-- publication with no column list, and the client subscribes to its UPDATE events. Realtime
-- filters each subscriber's payload by that subscriber's column grants — measured on test
-- 2026-09-11 in both directions: ungranted, an anon WebSocket receives the 21 granted columns
-- and no secret; with `GRANT SELECT (joiner_seat_secret) TO anon`, the secret arrives on every
-- presence ping. So a future table-level `GRANT SELECT ... TO anon` would leak the secret over
-- REST AND over the wire at once. The DO block below asserts the grant once, at apply time;
-- e2e/integration/p1269-guest-seat-forgery.spec.ts asserts the realtime payload on every run.

-- ============================================================================
-- claim_joiner_seat — the 2-argument overload is DROPPED, not left beside the new one
-- ============================================================================
-- A DEFAULT on the new parameter would otherwise leave claim_joiner_seat(text, text) callable,
-- and that overload IS the forgeable path. Same reasoning, and the same assertion, as P1058
-- applied to release_joiner_seat.
DROP FUNCTION IF EXISTS public.claim_joiner_seat(text, text);

CREATE OR REPLACE FUNCTION public.claim_joiner_seat(
  p_code        text,
  p_joiner_name text,
  p_seat_secret uuid DEFAULT NULL
)
RETURNS SETOF public.clarity_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row      public.clarity_sessions;
  v_presence timestamptz;
  v_secret_ok boolean;
  v_abandoned boolean;
  v_new_secret uuid;
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

  -- ── P1269: presence and secret, computed once and NULL-safe by construction ────────────
  -- A legacy seat (claimed before this migration) has no joiner_last_seen_at, so presence
  -- falls back to its claim time. Both operands can still be NULL for an UNCLAIMED seat, in
  -- which case v_abandoned is NULL — handled by only ever consulting it under
  -- `joiner_seat_claimed_at IS NOT NULL`, below.
  v_presence := COALESCE(v_row.joiner_last_seen_at, v_row.joiner_seat_claimed_at);
  v_abandoned := v_presence IS NOT NULL AND v_presence < now() - interval '15 minutes';

  -- `IS NOT DISTINCT FROM` would make two NULLs equal, which would let a caller sending no
  -- secret match a seat holding no secret. Both sides are required to be present.
  v_secret_ok := p_seat_secret IS NOT NULL
                 AND v_row.joiner_seat_secret IS NOT NULL
                 AND p_seat_secret = v_row.joiner_seat_secret;

  -- Occupancy. A stamped seat is re-claimable by exactly three callers:
  --   (a) the seated SIGNED-IN participant (refresh, mic retry, rejoin prompt);
  --   (b) the seated GUEST presenting the seat secret minted when they claimed it;
  --   (c) anyone at all, once the seat has shown no presence for 15 minutes — at which point
  --       it is not a reclaim, it is a free seat.
  -- Arm (b) replaces P1053's name comparison. The name is no longer consulted anywhere in
  -- this function's authorization, which is the whole of P1269.
  --
  -- Every arm uses NULL-safe operators. A plain `=` against a nullable column here yields
  -- NULL, and plpgsql SKIPS an IF whose condition is NULL — a skipped refusal guard is an
  -- allow. That was P1053 F5, and arms (b) and (c) are pinned the same way.
  IF v_row.joiner_seat_claimed_at IS NOT NULL
     AND NOT (auth.uid() IS NOT NULL AND v_row.joiner_profile_id IS NOT DISTINCT FROM auth.uid())
     AND NOT (
       auth.uid() IS NULL
       AND v_row.joiner_profile_id IS NULL
       AND v_secret_ok
       AND NOT EXISTS (SELECT 1 FROM public.session_transcripts t WHERE t.session_id = v_row.id)
       AND NOT EXISTS (SELECT 1 FROM public.transcription_jobs j WHERE j.session_id = v_row.id)
     )
     AND NOT (
       v_row.joiner_profile_id IS NULL
       AND v_abandoned IS TRUE
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

  -- A guest who presented the right secret KEEPS it: re-minting on every reload would
  -- invalidate any other tab the same guest still has open. Every other guest claim — a first
  -- claim, or a claim on an abandoned seat — mints a fresh one, so the previous holder's
  -- secret stops working the moment their seat is taken.
  IF auth.uid() IS NULL THEN
    v_new_secret := CASE WHEN v_secret_ok THEN v_row.joiner_seat_secret ELSE gen_random_uuid() END;
  ELSE
    v_new_secret := NULL;  -- a signed-in seat is authorized by auth.uid(), never by a secret
  END IF;

  RETURN QUERY
  UPDATE public.clarity_sessions
     SET joiner_name            = btrim(p_joiner_name),
         joiner_profile_id      = COALESCE(auth.uid(), joiner_profile_id),
         joiner_seat_claimed_at = now(),
         joiner_seat_secret     = v_new_secret,
         joiner_last_seen_at    = now()
   WHERE id = v_row.id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_joiner_seat(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_joiner_seat(text, text, uuid) TO anon, authenticated;

-- ============================================================================
-- touch_joiner_seat — the presence write the 15-minute rule depends on
-- ============================================================================
-- Without this, joiner_last_seen_at would only ever equal the claim time, and the abandonment
-- timer would expire under a guest who is sitting in the room — the weaker "claim-time" shape
-- the spec explicitly refused. Presence is what makes the rule mean what it says.
--
-- Authorization is the secret and nothing else. It returns a boolean rather than a row so it
-- cannot become a read oracle for any session column, and it refuses to touch a seat that has
-- been taken over by a signed-in participant.
CREATE OR REPLACE FUNCTION public.touch_joiner_seat(p_session_id uuid, p_seat_secret uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_session_id IS NULL OR p_seat_secret IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.clarity_sessions
     SET joiner_last_seen_at = now()
   WHERE id = p_session_id
     AND joiner_profile_id IS NULL
     AND joiner_seat_secret IS NOT NULL
     AND joiner_seat_secret = p_seat_secret
     AND ended_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_joiner_seat(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_joiner_seat(uuid, uuid) TO anon, authenticated;

-- ============================================================================
-- Verification — fail loud, in the migration itself
-- ============================================================================
DO $$
DECLARE
  v_count integer;
BEGIN
  -- The forgeable overload must be GONE, not merely shadowed.
  IF to_regprocedure('public.claim_joiner_seat(text, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'P1269: claim_joiner_seat(text, text) still exists — the name-authorized reclaim is still reachable';
  END IF;

  SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'claim_joiner_seat';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'P1269: expected exactly one claim_joiner_seat overload, found %', v_count;
  END IF;

  IF to_regprocedure('public.claim_joiner_seat(text, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'P1269: claim_joiner_seat(text, text, uuid) was not created';
  END IF;

  -- The guest join path must stay reachable without an account.
  IF NOT has_function_privilege('anon', 'public.claim_joiner_seat(text, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1269: anon lost EXECUTE on claim_joiner_seat — the guest join path is dead';
  END IF;
  IF NOT has_function_privilege('anon', 'public.touch_joiner_seat(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1269: anon lost EXECUTE on touch_joiner_seat — presence would never refresh and every seat would expire under a live guest';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.claim_joiner_seat(text, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1269: authenticated lost EXECUTE on claim_joiner_seat';
  END IF;

  -- The secret must never be directly readable. This is the entire security property: if anon
  -- can SELECT it, it is exactly as forgeable as the name it replaced.
  IF has_column_privilege('anon', 'public.clarity_sessions', 'joiner_seat_secret', 'SELECT') THEN
    RAISE EXCEPTION 'P1269: anon can SELECT clarity_sessions.joiner_seat_secret — the seat capability is void';
  END IF;
  IF has_column_privilege('authenticated', 'public.clarity_sessions', 'joiner_seat_secret', 'SELECT') THEN
    RAISE EXCEPTION 'P1269: authenticated can SELECT clarity_sessions.joiner_seat_secret';
  END IF;

  -- Nor writable: the definer functions are the only writers. A client UPDATE could otherwise
  -- set a seat's secret to a value of the attacker's choosing and then "reclaim" with it.
  IF has_column_privilege('anon', 'public.clarity_sessions', 'joiner_seat_secret', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.clarity_sessions', 'joiner_seat_secret', 'UPDATE') THEN
    RAISE EXCEPTION 'P1269: a client role can UPDATE joiner_seat_secret';
  END IF;
  IF has_column_privilege('anon', 'public.clarity_sessions', 'joiner_last_seen_at', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.clarity_sessions', 'joiner_last_seen_at', 'UPDATE') THEN
    RAISE EXCEPTION 'P1269: a client role can UPDATE joiner_last_seen_at — presence could be forged to hold a seat open or to expire a live one';
  END IF;

  -- P1058's room-code requirement on release must be untouched by this migration.
  IF to_regprocedure('public.release_joiner_seat(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'P1269: release_joiner_seat(uuid) reappeared — P1058 regressed';
  END IF;

  RAISE NOTICE 'P1269: guest seat ownership is the seat secret; a name authorizes nothing; an unattended seat frees after 15 minutes.';
END;
$$;
