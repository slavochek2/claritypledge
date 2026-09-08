-- P1058 (F4): release_joiner_seat was an unauthenticated, product-wide guest kick.
--
-- diffed against: 20260812180000_p1053_guard_transcript_and_addressee.sql (release_joiner_seat)
-- diff: TWO changes, both to the anonymous arm; everything else carried over byte-for-byte.
--   1. The signature gains `p_code text DEFAULT NULL`. The DEFAULT is deliberate: it keeps a
--      one-argument call resolvable, so the SIGNED-IN arm (and P1063's anon-reachability
--      control, which calls with p_session_id alone) is unaffected during the deploy window.
--   2. The guest arm gains `p_code IS NOT NULL AND code = upper(btrim(p_code))`.
--   The RETURNS void, LANGUAGE plpgsql, SECURITY DEFINER, SET search_path = public, the
--   UPDATE's SET list, the F3 addressee term, the signed-in arm, GET DIAGNOSTICS and the
--   42501 RAISE are unchanged. The DROP of the id-only signature is what makes this a
--   replacement rather than an overload — see check 1 in the verification block.
--
-- requires-frontend: 7a801a3ef
--   The signature gains a second argument and the guest arm now REQUIRES it. Deployed clients
--   call clearSessionJoiner(sessionId) with no code, so on an anonymous seat they would begin
--   receiving 42501 the moment this lands. 7a801a3ef threads the code through all three call
--   sites; migrate.sh blocks the prod apply until it is an ancestor of origin/main.
--   SIGNED-IN callers are unaffected either way — their arm is untouched and needs no code —
--   so the coupling covers a guest-leave regression only, never a signed-in one.
--
-- ---------------------------------------------------------------------------------------
-- THE DEFECT, REPRODUCED (not inferred)
-- ---------------------------------------------------------------------------------------
-- The guest arm of release_joiner_seat authorized on possession of the SESSION ID alone:
--
--     OR (auth.uid() IS NULL AND joiner_profile_id IS NULL AND joiner_name IS NOT NULL)
--
-- `id` is anon-SELECTable. P1057's column allowlist (20260817140001) grants anon SELECT on 21
-- of the table's 22 columns and excludes exactly one: `code`. So an unauthenticated caller can
-- list session ids it holds no code for, and evict the seated guest on any of them.
--
-- Measured on the test project, e2e/integration/p1058-release-seat-authorization.spec.ts:
--   * an anon caller holding ONLY the id cleared joiner_name and joiner_seat_claimed_at;
--   * the same call flipped live_state.joinerEnded, so the creator's UI renders a departure
--     the guest never made;
--   * chaining it defeated P1053's occupancy guard outright — claim (refused, seat held),
--     release (succeeds), claim again (accepted). Observed joiner_name: 'Attacker'.
--
-- Bounds, also measured, and they held: a SIGNED-IN seat holder could not be evicted, an
-- ADDRESSED session could not be touched, and `joiner_profile_id` never moved. So this is
-- denial of service and impersonation of a departure — NOT transcript disclosure. The
-- transcript SELECT policy keys on joiner_profile_id, which a release does not write.
--
-- ---------------------------------------------------------------------------------------
-- WHY THE CODE, AND NOT IDENTITY  [FOUNDER DECISION — narrows P1053 AD3]
-- ---------------------------------------------------------------------------------------
-- P1053's AD3 accepted this exposure deliberately, on the grounds that requiring identity
-- would break the anonymous guest leave path outright: a guest has no auth.uid(), so "the
-- same guest leaving" and "an attacker" are indistinguishable by identity. That reasoning is
-- correct and is NOT overturned here.
--
-- It is sidestepped. Identity is not the only thing that separates the two — possession of the
-- ROOM CODE does, and a real occupant always has one because they typed it to get in. The code
-- is the single column P1057 took away from anon, which is precisely what makes it a usable
-- secret and an enumerated id not one. claim_joiner_seat has always keyed on the code; this
-- makes release symmetric with claim rather than inventing a new mechanism.
--
-- So AD3 narrows from "any anon id-holder may release an anonymously-held seat" to "any anon
-- CODE-holder may". The guest leave path keeps working, anonymously, with no account.
--
-- ACCEPTED RESIDUE, stated so it is never mistaken for an oversight: for EVENT PRACTICE ROOMS
-- the code is deliberately published — get_practice_room_codes is granted to anon and returns
-- codes to every visitor of a public event page (P1057 D-A, a standing founder decision). For
-- that room class only, F4 survives this fix: a visitor can still evict and take a seat. The
-- rooms were already open by design ("a stranger can still join one"), but EVICTION is a
-- strictly larger harm than joining, and this migration does not close it. Making event rooms
-- attendee-only is a product question; revoking a leaked code is P1098. A canary in the P1058
-- suite pins this residue so it is visible rather than forgotten.
--
-- ---------------------------------------------------------------------------------------
-- EVERY NEW CONDITION SITS IN A `WHERE`, DELIBERATELY
-- ---------------------------------------------------------------------------------------
-- This is P1058 Phase 2's crux and the reason F5 and P1063 happened. The same predicate is
-- fail-OPEN inside an `IF` (plpgsql SKIPS a branch whose condition is NULL, and a skipped
-- refusal is an allow) and fail-CLOSED inside a `WHERE` (NULL is not TRUE, so the row is
-- excluded, ROW_COUNT is 0, and the RAISE below fires). Nothing in this function is an `IF`
-- over a nullable column, and the p_code comparisons are added to the existing WHERE for that
-- reason. A NULL p_code therefore refuses; it does not fall through.
--
-- The explicit `p_code IS NOT NULL` is redundant against `code = upper(btrim(p_code))` — it is
-- written anyway so the intent survives a future refactor that moves the predicate.
--
-- No new information channel: a wrong code and a missing seat both raise the same
-- 'not the seated joiner' / 42501, so the function does not discriminate for an attacker. It
-- is no more of a code-guessing oracle than claim_joiner_seat, which has always been one.

DROP FUNCTION IF EXISTS public.release_joiner_seat(uuid);

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
       -- Signed-in participant vacating their own seat. UNCHANGED by P1058: identity already
       -- authorizes this arm, so it needs no code and sees no deploy window.
       (auth.uid() IS NOT NULL AND joiner_profile_id = auth.uid())
       -- Anonymous guest vacating their own seat, now bound to possession of the room code.
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

-- ============================================================================
-- Verification — assert the live catalog, never this file's text
-- ============================================================================
-- P1063's lesson: a REVOKE/GRANT that reads correctly can be a silent no-op. has_function_privilege
-- resolves PUBLIC and role inheritance; information_schema filtered by grantee does not.

DO $$
DECLARE
  v_new_count int;
BEGIN
  -- Signature checks use to_regprocedure, NOT pg_get_function_identity_arguments. The first
  -- draft of this block compared that function's TEXT output against 'uuid, text' and aborted
  -- the migration: it does not render in the format assumed. to_regprocedure resolves a
  -- signature through the type system instead of a string shape, so it cannot be wrong about
  -- formatting, and it returns NULL rather than raising when the function is absent.

  -- 1. The id-only signature must be GONE. If it survives, PostgREST can still resolve the
  --    unauthenticated kick and this whole migration is decorative — and worse, two overloads
  --    would make every call ambiguous (the live failure P1063 hit on seal_and_send_letter).
  IF to_regprocedure('public.release_joiner_seat(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'P1058: release_joiner_seat(uuid) still exists — the id-only kick is still reachable';
  END IF;

  -- 2. The new signature must exist, exactly once. to_regprocedure answers "resolvable";
  --    the pg_proc count answers "not accidentally overloaded", which is the P1063 failure.
  IF to_regprocedure('public.release_joiner_seat(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'P1058: release_joiner_seat(uuid, text) was not created';
  END IF;
  SELECT count(*) INTO v_new_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'release_joiner_seat';
  IF v_new_count <> 1 THEN
    RAISE EXCEPTION 'P1058: expected exactly one release_joiner_seat overload, found %', v_new_count;
  END IF;

  -- 3. Positive control. The guest leave path is anonymous BY DESIGN — if this migration left
  --    anon unable to execute at all, checks 1 and 2 would both pass and every guest would be
  --    silently unable to leave a room. That is the P886 shape: a gate narrower than the flow.
  IF NOT has_function_privilege('anon', 'public.release_joiner_seat(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1058: anon lost EXECUTE on release_joiner_seat — the guest leave path is dead';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.release_joiner_seat(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1058: authenticated lost EXECUTE on release_joiner_seat';
  END IF;

  -- 4. The fix's entire premise: `code` must remain unreadable by anon. If a later migration
  --    re-grants it, the code stops being a secret and this authorization silently degrades to
  --    the id-only kick it replaced — with nothing else in the repo noticing.
  IF has_column_privilege('anon', 'public.clarity_sessions', 'code', 'SELECT') THEN
    RAISE EXCEPTION 'P1058: anon can SELECT clarity_sessions.code — code-based release authorization is void (P1057 regressed)';
  END IF;

  RAISE NOTICE 'P1058: release_joiner_seat now requires the room code on the anonymous arm.';
END;
$$;
