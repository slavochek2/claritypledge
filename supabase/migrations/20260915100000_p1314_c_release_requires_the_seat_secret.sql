-- P1314 (C): taking a seat is authorized by a private secret; leaving it was authorized by a
-- public code. This makes release symmetric with claim.
--
-- diffed against: 20260908114500_p1058_release_seat_requires_code.sql (release_joiner_seat)
-- diff: TWO changes, both inside the ANONYMOUS arm of the existing WHERE. Everything else —
-- RETURNS void, LANGUAGE plpgsql, SECURITY DEFINER, SET search_path = public, the UPDATE's SET
-- list, the F3 addressee term, the signed-in arm, GET DIAGNOSTICS and the 42501 RAISE — is
-- carried over byte-for-byte from P1058.
--   1. The signature gains `p_seat_secret uuid DEFAULT NULL`. The DEFAULT keeps every existing
--      two-argument call resolvable, so the SIGNED-IN arm sees no deploy window at all.
--   2. The guest arm's `p_code` term becomes a two-branch disjunction: the seat secret when the
--      seat carries one, the room code only when it does not.
-- The DROP of the (uuid, text) signature is what makes this a replacement rather than an
-- overload — P1063's lesson: two resolvable overloads make every named-argument call from
-- PostgREST ambiguous, which is a live outage, not a lint failure.
--
-- ---------------------------------------------------------------------------------------
-- DEPENDS ON P1269 — THIS MIGRATION CANNOT APPLY BEFORE 20260911090000
-- ---------------------------------------------------------------------------------------
-- `joiner_seat_secret` is added by 20260911090000_p1269_guest_seat_secret_and_presence.sql.
-- Measured 2026-09-15: the column exists on the TEST project and does NOT exist on PROD, so
-- P1269 must be live on prod before this file is applied there.
--
-- The precondition block below runs BEFORE the CREATE, deliberately. plpgsql does not resolve
-- table or column references at creation time, so without it this migration would install a
-- function that parses fine and then raises 42703 on the first guest who tries to leave a
-- room — a silent breakage discovered by a user rather than by the deploy.
--
-- ---------------------------------------------------------------------------------------
-- THE DEFECT, REPRODUCED (not inferred) — see features/p1314, embargoed
-- ---------------------------------------------------------------------------------------
-- P1269 bound CLAIMING a seat to a per-seat secret and left RELEASING it bound to the room
-- code, which P1058 had chosen precisely because `code` is the one column P1057 withholds from
-- anon. That reasoning holds for ordinary rooms and fails for one room class: for EVENT
-- PRACTICE ROOMS the code was published to every visitor (P1057 D-A), so in those rooms the
-- code is not a secret and release was authorized by a public value.
--
-- release_joiner_seat sets `joiner_seat_claimed_at = NULL`. That is the exact column P1269's
-- entire occupancy guard is gated on (20260911090000: `IF v_row.joiner_seat_claimed_at IS NOT
-- NULL AND NOT (...)`). So release-then-claim walks straight past a guard that refuses the
-- direct claim. Measured on test 2026-09-14, anon key only, 29 seconds claim to eviction:
--   * attacker calls claim_joiner_seat directly            -> REFUSED, 'cannot join this room', 401
--   * attacker calls release_joiner_seat(session_id, code) -> HTTP 204, seat vacated
--   * attacker calls claim_joiner_seat again               -> seat taken, new secret issued
-- The first line is the control: P1269 works. The defect is the path around it.
--
-- P1314 half D closes the disclosure that makes the code reachable in the first place. This
-- half closes the eviction REGARDLESS of who holds the code, which is why it is worth doing
-- after D as well — P1098 records that a leaked room code cannot be revoked.
--
-- ---------------------------------------------------------------------------------------
-- THE LEGACY FALLBACK, AND WHY IT IS KEYED ON THE ROW AND NOT ON THE ARGUMENT
-- ---------------------------------------------------------------------------------------
-- Seats claimed before P1269 carry no secret. `joiner_seat_secret IS NULL` is a property of
-- the ROW, so an attacker cannot select which branch applies by choosing what to send: on a
-- secret-bearing seat the code branch is unreachable no matter what arrives in p_code.
--
-- Writing it the other way round — "use the secret if one was supplied, else the code" — would
-- be the whole vulnerability restored, because the attacker controls that condition.
--
-- The fallback shrinks to nothing on its own: every claim since P1269 mints a secret, and a
-- legacy seat is abandoned by P1269's 15-minute presence window regardless.
--
-- ---------------------------------------------------------------------------------------
-- EVERY NEW CONDITION SITS IN A `WHERE`, DELIBERATELY (carried from P1058)
-- ---------------------------------------------------------------------------------------
-- The same predicate is fail-OPEN inside an `IF` (plpgsql SKIPS a branch whose condition is
-- NULL, and a skipped refusal is an allow) and fail-CLOSED inside a `WHERE` (NULL is not TRUE,
-- so the row is excluded, ROW_COUNT is 0, and the RAISE fires). Both sides of the secret
-- comparison are required to be NOT NULL explicitly rather than relying on `=` yielding NULL,
-- and `IS NOT DISTINCT FROM` is deliberately NOT used: it would make two NULLs equal, letting
-- a caller who sends no secret match a seat that holds none. That is P1269's own idiom.
--
-- No new information channel: a wrong secret, a wrong code and a vacant seat all raise the
-- same 'not the seated joiner' / 42501.
--
-- WHAT THIS DOES NOT DO: it does not clear `joiner_seat_secret` on release. A vacated seat is
-- claimable by anyone in any case (P1269's occupancy guard only engages when
-- joiner_seat_claimed_at IS NOT NULL), so a stale secret on a vacant seat authorizes nothing,
-- and the next claim overwrites it. Nulling it would additionally break the reclaim path for a
-- guest with a second tab open. Left alone on purpose, not by omission.
--
-- requires-frontend: PENDING
--   The guest arm now REQUIRES the seat secret on any seat that carries one. Deployed clients
--   call clearSessionJoiner(sessionId, code) with no secret, so a guest pressing "End Session"
--   on a post-P1269 seat receives 42501 until the app half ships. All three call sites catch
--   the error, so nothing crashes; the seat stays occupied until P1269's 15-minute presence
--   window frees it, and in active-session-banner.tsx the guest's banner clears locally while
--   the server row does not change — the exact silent no-op that file's own P1058 comment warns
--   about. DATABASE FIRST is still correct: app-first sends an argument this function does not
--   accept, and PostgREST answers PGRST202 for EVERY release including signed-in ones, which is
--   a strictly wider break. This annotation is filled in with the app-half commit sha before
--   the prod apply; migrate.sh's prod gate blocks until that sha is an ancestor of origin/main.
--
-- client-safe: NOT CLAIMED. This migration is app-coupled by construction; see above.

-- ============================================================================
-- Precondition — P1269 must already be live. Runs BEFORE the replacement.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'clarity_sessions'
           AND column_name  = 'joiner_seat_secret'
      )
  THEN
    RAISE EXCEPTION
      'P1314 C: clarity_sessions.joiner_seat_secret is absent — apply P1269 (20260911090000) first. Installing this function without it would leave every guest unable to leave a room.';
  END IF;

  IF to_regprocedure('public.release_joiner_seat(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'P1314 C: release_joiner_seat(uuid, text) is absent — expected P1058 (20260908114500) to be live';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.release_joiner_seat(uuid, text);

CREATE OR REPLACE FUNCTION public.release_joiner_seat(
  p_session_id  uuid,
  p_code        text DEFAULT NULL,
  p_seat_secret uuid DEFAULT NULL
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
         live_state = COALESCE(live_state, '{}'::jsonb)
                      || jsonb_build_object('joinerEnded', true,
                                            'joinerEndedAt', now()::text)
   WHERE id = p_session_id
     AND joiner_seat_claimed_at IS NOT NULL
     -- F3 (P1053): on an addressed session, only the addressee may vacate the seat.
     AND (target_listener_id IS NULL OR target_listener_id = auth.uid())
     AND (
       -- Signed-in participant vacating their own seat. UNCHANGED by P1058 and by P1314:
       -- identity already authorizes this arm, so it needs neither code nor secret and sees
       -- no deploy window.
       (auth.uid() IS NOT NULL AND joiner_profile_id = auth.uid())
       -- Anonymous guest vacating their own seat.
       OR (
         auth.uid() IS NULL
         AND joiner_profile_id IS NULL
         AND joiner_name IS NOT NULL
         AND (
           -- P1314 C: the seat carries a secret, so the secret is the only thing that
           -- authorizes leaving it. The room code is not consulted on this branch.
           (
             joiner_seat_secret IS NOT NULL
             AND p_seat_secret  IS NOT NULL
             AND joiner_seat_secret = p_seat_secret
           )
           -- Legacy seat claimed before P1269: no secret exists to present, so P1058's
           -- code term still applies. Gated on the ROW's column, never on what the caller
           -- chose to send.
           OR (
             joiner_seat_secret IS NULL
             AND p_code IS NOT NULL
             AND code = upper(btrim(p_code))
           )
         )
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
-- Verification — assert the live catalog and the INSTALLED source, never this file's text
-- ============================================================================
DO $$
DECLARE
  v_count int;
  v_src   text;
BEGIN
  -- 1. The two-argument signature must be GONE. If it survives, the code-only release is still
  --    reachable and this migration is decorative — and worse, two overloads make every
  --    named-argument call from PostgREST ambiguous (P1063, live outage on seal_and_send_letter).
  IF to_regprocedure('public.release_joiner_seat(uuid, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'P1314 C: release_joiner_seat(uuid, text) still exists — the code-only release is still reachable';
  END IF;

  IF to_regprocedure('public.release_joiner_seat(uuid, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'P1314 C: release_joiner_seat(uuid, text, uuid) was not created';
  END IF;

  SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'release_joiner_seat';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'P1314 C: expected exactly one release_joiner_seat overload, found %', v_count;
  END IF;

  -- 2. Positive control, carried from P1058 check 3. The guest leave path is anonymous BY
  --    DESIGN. If this migration left anon unable to execute at all, checks above would pass
  --    while every guest silently lost the ability to leave a room — the P886 shape, a gate
  --    narrower than the flow it guards.
  IF NOT has_function_privilege('anon', 'public.release_joiner_seat(uuid, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1314 C: anon lost EXECUTE on release_joiner_seat — the guest leave path is dead';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.release_joiner_seat(uuid, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1314 C: authenticated lost EXECUTE on release_joiner_seat';
  END IF;

  -- 3. The premise of THIS fix: the secret must stay unreadable by anon. If a later migration
  --    grants it — or a table-level GRANT SELECT sweeps it in, which P1269's own header warns
  --    would also put it on the realtime payload — this authorization degrades to the code-only
  --    release it replaces, with nothing else in the repo noticing.
  IF has_column_privilege('anon', 'public.clarity_sessions', 'joiner_seat_secret', 'SELECT') THEN
    RAISE EXCEPTION 'P1314 C: anon can SELECT clarity_sessions.joiner_seat_secret — secret-based release authorization is void';
  END IF;

  -- 4. P1058's premise, still load-bearing for the legacy branch.
  IF has_column_privilege('anon', 'public.clarity_sessions', 'code', 'SELECT') THEN
    RAISE EXCEPTION 'P1314 C: anon can SELECT clarity_sessions.code — the legacy release branch is void (P1057 regressed)';
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'release_joiner_seat';

  -- 5. The two properties this migration exists to establish, asserted against the installed
  --    source so a later CREATE OR REPLACE that drops one is caught here rather than by a guest.
  IF v_src !~ 'joiner_seat_secret[[:space:]]*=[[:space:]]*p_seat_secret' THEN
    RAISE EXCEPTION 'P1314 C: the secret comparison is gone from the anonymous arm — release is code-authorized again';
  END IF;
  IF v_src !~ 'joiner_seat_secret IS NULL' THEN
    RAISE EXCEPTION 'P1314 C: the legacy fallback is no longer gated on the row — an attacker could select the code branch';
  END IF;

  -- 6. P1057's standing rule for this table's definer functions.
  IF v_src ~ 'SELECT[[:space:]]+\*' OR v_src ~ 'RETURNING[[:space:]]+\*' THEN
    RAISE EXCEPTION 'P1314 C: SELECT */RETURNING * reintroduced — a future ADD COLUMN would join the anon output unreviewed (P1057)';
  END IF;

  RAISE NOTICE 'P1314 C: leaving a seat now requires the seat secret whenever the seat carries one.';
END;
$$;
