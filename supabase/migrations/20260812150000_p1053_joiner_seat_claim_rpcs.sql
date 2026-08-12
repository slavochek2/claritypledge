-- P1053 (Migration A): server-side join authorization — the additive half.
--
-- client-safe: additive columns and new/extended functions; no grant or policy is narrowed.
-- Nothing deployed changes behavior when this lands. The RPCs are unreachable from the
-- current bundle (no call site yet) and the columns are not in any client GRANT UPDATE.
-- The privilege narrowing that makes the RPCs load-bearing is Migration B
-- (20260812130000_p1053_revoke_client_joiner_writes.sql), which is `requires-frontend`.
--
-- Applying this file ALONE closes nothing — that is deliberate and is the spec's Risk 3
-- ("a decorative RPC"). The canaries are expected to stay red after this file and go green
-- only after Migration B. See features/p1053_server_side_join_authorization.md, Build
-- Sequence steps 4-5.
--
-- ---------------------------------------------------------------------------------------
-- WHY TWO NEW COLUMNS
-- ---------------------------------------------------------------------------------------
-- `joiner_profile_id` currently means two different things at once: WHO OCCUPIES THE SEAT
-- and WHO PARTICIPATED (the latter is what session_transcripts / transcription_jobs gate
-- SELECT on). They diverge the moment a joiner leaves — clearSessionJoiner nulls
-- joiner_name but deliberately keeps joiner_profile_id, because the departed participant
-- still needs their transcript. Occupancy therefore needs its own signal.
--
--   joiner_seat_claimed_at — occupancy. NULL = seat free. Server-written only.
--   ended_at               — session closed. NULL = open. Server-written only.
--
-- Both are deliberately absent from every client GRANT UPDATE. That is what makes them
-- non-forgeable, and it is the whole reason they exist rather than reusing a column the
-- caller can already write:
--
--   * `joiner_name IS NOT NULL` was rejected as the vacancy signal because joiner_name is
--     a caller-supplied display string (claim_joiner_seat takes it as an argument). An
--     authorization predicate keyed on attacker-controlled text is the exact pattern this
--     spec exists to remove — an empty or whitespace name would claim a seat that then
--     reads vacant.
--   * `live_state->>'sessionEnded'` was rejected as the ended signal because live_state is
--     in the client UPDATE allowlist AND writable by an unauthenticated caller through
--     patch_live_state. Gating on it is forgeable: clear the flag, then claim, and a closed
--     session re-opens with its transcript intact (Security Review, TOCTOU race 2).
--
-- `joiner_left_at` was considered and rejected as the occupancy column name: it needs a
-- non-NULL default so a brand-new room reads vacant, which inverts its own name and makes
-- every INSERT path responsible for stamping it. `joiner_seat_claimed_at` gets NULL = free
-- for free.
--
-- NOTE: the CHECK constraint tying joiner_seat_claimed_at to joiner_name is NOT in this
-- file. It lives in Migration B. Adding it here would break the live leave path: the
-- currently-deployed clearSessionJoiner (api.ts:1235) nulls joiner_name via a direct
-- UPDATE while leaving joiner_profile_id set, and after the backfill below that row carries
-- a stamped joiner_seat_claimed_at — so the constraint would reject a write the deployed
-- bundle still makes. That is P1047 part 4's failure mode (a guard that silently
-- re-classified live rows and took rejoin down) and this file will not repeat it.

-- ============================================================================
-- 1. Columns + backfill
-- ============================================================================

ALTER TABLE public.clarity_sessions
  ADD COLUMN IF NOT EXISTS joiner_seat_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at               timestamptz;

COMMENT ON COLUMN public.clarity_sessions.joiner_seat_claimed_at IS
  'P1053: seat occupancy. NULL = free. Server-written only (claim_joiner_seat sets it, '
  'release_joiner_seat clears it). Never in a client GRANT UPDATE — the vacancy signal '
  'must not be caller-supplied. Distinct from joiner_profile_id, which means PARTICIPATED '
  'and survives the joiner leaving so their transcript stays readable.';

COMMENT ON COLUMN public.clarity_sessions.ended_at IS
  'P1053: session closed. NULL = open. Server-written only (complete_clarity_session). '
  'Never in a client GRANT UPDATE. Exists because live_state->>''sessionEnded'' is '
  'client-forgeable via patch_live_state and so cannot gate an authorization gate.';

-- Preserve today's occupancy semantics exactly. `joiner_name IS NOT NULL` is precisely the
-- check the client performs today (api.ts:989), so no live room changes occupancy state at
-- migration time. Getting this wrong in either direction is a live outage: too broad and
-- every vacated room reads occupied (rejoin breaks — P1047 part 4); too narrow and every
-- occupied room reads free (seizure canary passes vacuously).
UPDATE public.clarity_sessions
   SET joiner_seat_claimed_at = COALESCE(last_activity_at, created_at)
 WHERE joiner_name IS NOT NULL
   AND joiner_seat_claimed_at IS NULL;

-- Sessions already ended must not become claimable at migration time.
UPDATE public.clarity_sessions
   SET ended_at = COALESCE(last_activity_at, created_at)
 WHERE ended_at IS NULL
   AND (live_state->>'sessionEnded')::boolean IS TRUE;

-- ============================================================================
-- 2. claim_joiner_seat — the only path onto the joiner seat
-- ============================================================================
-- Keyed on the room CODE, never the session id [FOUNDER DECISION 2026-08-12]. The id is
-- freely readable (the SELECT policy exposes every null-target row to anon), so an
-- id-keyed signature would authorize every enumerator. The code is the bearer capability.
--
-- SET search_path = public — NOT '' — because this UPDATE fires two existing triggers
-- (clarity_sessions_pin_joiner_profile_id, trg_prevent_is_private_change) which resolve
-- unqualified names; a write RPC firing legacy triggers under search_path = '' fails with
-- 42P01 (docs/decisions.md 2026-06-06).
--
-- The pin trigger does not obstruct this function: it exempts current_user IN
-- ('service_role','postgres','supabase_admin'), and a SECURITY DEFINER function executes as
-- its owner. The trigger therefore stays in place as defense-in-depth on the DIRECT-UPDATE
-- path only — which is precisely why an RPC-driven seizure canary is required in addition
-- to the direct-PATCH one. The RPC is the sole enforcement point on this path.

CREATE OR REPLACE FUNCTION public.claim_joiner_seat(p_code text, p_joiner_name text)
RETURNS SETOF public.clarity_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.clarity_sessions;
BEGIN
  -- Bound the input before any function materializes it. Without this an unauthenticated
  -- caller passes a multi-megabyte string that upper(btrim(...)) copies per request. It
  -- also equalizes failure timing, which serves the single-error-message rule below.
  IF p_code IS NULL OR length(btrim(p_code)) <> 6 THEN
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  IF p_joiner_name IS NULL OR btrim(p_joiner_name) = '' THEN
    RAISE EXCEPTION 'joiner name is required' USING ERRCODE = '22023';
  END IF;

  -- FOR UPDATE serializes concurrent claimers on the row lock: two simultaneous callers
  -- queue, and the loser re-reads joiner_seat_claimed_at below AFTER acquiring the lock.
  -- Same atomic-conditional idiom as set_my_pledge (docs/decisions.md 2026-06-05).
  SELECT * INTO v_row
    FROM public.clarity_sessions
   WHERE code = upper(btrim(p_code))
     FOR UPDATE;

  IF NOT FOUND THEN
    -- Distinguishable failure messages are an existence oracle: they let an attacker
    -- confirm valid codes cheaply and then enumerate the SEATED subset, which is exactly
    -- the transcript-bearing one. One generic message to the client; the distinction is
    -- kept server-side in the log.
    RAISE LOG 'claim_joiner_seat: no room for code %', upper(btrim(p_code));
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  -- An ended session is not joinable. Gated on the server-written column, never on
  -- live_state->>'sessionEnded' (client-forgeable via patch_live_state).
  IF v_row.ended_at IS NOT NULL THEN
    RAISE LOG 'claim_joiner_seat: session % already ended', v_row.id;
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  -- Occupied seat: only the SAME SIGNED-IN participant may re-claim it (rejoin after a
  -- refresh or reconnect). This is what closes the seat-seizure exploit — an attacker
  -- naming themselves on a seat held by another profile is rejected here.
  --
  -- [FOUNDER DECISION 2026-08-12] There is deliberately NO anonymous rejoin branch. The
  -- reviewed design gated guest rejoin on `v_row.joiner_name = p_joiner_name`, which is a
  -- discriminator the anon SELECT hands the attacker. The alternative — mint a per-seat
  -- secret at claim and require it for rejoin — was rejected because as scoped it closes
  -- nothing: release_joiner_seat (AD3) deliberately permits any anonymous caller holding
  -- the session id to release an anonymously-held seat, so the attacker releases the seat
  -- and then claims the now-vacant seat with no secret at all. A secret on claim alone is
  -- bypassed by the leave path.
  --
  -- What this concedes: anonymous practice rooms have no participant identity. That is the
  -- pre-existing product model, not a new weakness. What it does NOT concede: no
  -- session_transcripts row is reachable through an anonymous seat, because that policy
  -- gates on a non-NULL auth.uid() which a guest never has. Signed-in seats — the ones that
  -- carry transcripts — are fully protected by the arm below.
  IF v_row.joiner_seat_claimed_at IS NOT NULL
     AND NOT (auth.uid() IS NOT NULL AND v_row.joiner_profile_id = auth.uid())
  THEN
    RAISE LOG 'claim_joiner_seat: seat on session % already held', v_row.id;
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  -- COALESCE(auth.uid(), joiner_profile_id): an anonymous claimer takes a real seat with a
  -- NULL participant id, and does not blank an existing participant id on rejoin.
  RETURN QUERY
  UPDATE public.clarity_sessions
     SET joiner_name            = btrim(p_joiner_name),
         joiner_profile_id      = COALESCE(auth.uid(), joiner_profile_id),
         joiner_seat_claimed_at = now()
   WHERE id = v_row.id
  RETURNING *;
END;
$$;

-- Role reachability is decided by the REVOKE, not the GRANT (docs/decisions.md 2026-08-10).
REVOKE ALL ON FUNCTION public.claim_joiner_seat(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_joiner_seat(text, text) TO anon, authenticated;

-- ============================================================================
-- 3. release_joiner_seat — the leave-path counterpart
-- ============================================================================
-- Takes p_session_id because both call sites already hold the id and nothing else
-- (clarity-live-page.tsx:3584 from session.id; AuthContext.tsx:194 from sessionStorage).
-- A code-keyed signature would force a lookup at both sites for no security gain: the
-- authorization here is "are you the occupant", not "do you hold the capability".

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
         -- joiner_profile_id deliberately UNTOUCHED. The departed participant keeps
         -- transcript, job and history access. This is the entire point of separating
         -- occupancy from participation, and the naive fix (nulling it here) is what the
         -- departed-participant canary exists to catch.
         live_state = COALESCE(live_state, '{}'::jsonb)
                      || jsonb_build_object('joinerEnded', true,
                                            'joinerEndedAt', now()::text)
   WHERE id = p_session_id
     AND joiner_seat_claimed_at IS NOT NULL
     AND (
       (auth.uid() IS NOT NULL AND joiner_profile_id = auth.uid())
       -- Verbatim reuse of patch_live_state's guest predicate
       -- (20260409140000_fix_guest_patch_live_state.sql), so guest release is reachable
       -- exactly where guest state-writes already are. Requiring joiner_profile_id IS NULL
       -- is what closes seat erasure: an unauthenticated caller can no longer strip a
       -- SIGNED-IN joiner's seat.
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

-- ============================================================================
-- 4. complete_clarity_session — stamp the server-written ended_at
-- ============================================================================
-- diffed against: 20260420140000_p769_complete_clarity_session_sets_session_ended.sql
-- diff: the first UPDATE additionally sets ended_at. Everything else — the authorization
-- check, the live_state merge, the status update, the invite close, the signature,
-- SECURITY DEFINER, SET search_path = public, and the REVOKE/GRANT pair — is carried over
-- byte-for-byte.
--
-- COALESCE(ended_at, now()) preserves P769's documented idempotency: re-running on an
-- already-ended session must not move the timestamp.

CREATE OR REPLACE FUNCTION public.complete_clarity_session(p_session_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization: session creator, joiner, target_listener, OR service_role caller
  -- (service_role is identified by auth.uid() IS NULL — trusted server-side path)
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM clarity_sessions
    WHERE id = p_session_id
      AND (
        creator_profile_id = auth.uid()
        OR joiner_profile_id = auth.uid()
        OR target_listener_id = auth.uid()
      )
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- P769: Set sessionEnded flag in live_state atomically
  -- P1053: and stamp the server-written ended_at, which claim_joiner_seat gates on.
  UPDATE clarity_sessions
    SET live_state = COALESCE(live_state, '{}') || jsonb_build_object('sessionEnded', true, 'sessionEndedAt', now()::text),
        ended_at   = COALESCE(ended_at, now())
    WHERE id = p_session_id;

  -- Mark session completed
  UPDATE clarity_sessions
    SET status = 'completed'
    WHERE id = p_session_id;

  -- Close linked invite(s) atomically (no-op for non-letter sessions)
  UPDATE clarity_live_invites
    SET closed_at = now()
    WHERE session_id = p_session_id
      AND closed_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_clarity_session(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_clarity_session(UUID) TO authenticated;
