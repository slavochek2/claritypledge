-- new function -- all four RPCs below are first defined here; verified with
-- `grep -rl 'FUNCTION public.<name>' supabase/migrations/` returning no prior file.
-- P1114: the event room — join_event_room / set_room_opt_in / set_room_readiness /
-- get_my_room_status.
--
-- client-safe: this migration has never shipped to prod (feature/p1114-event-room is
-- unmerged) — no deployed client calls any of these four functions with the old
-- (member_id, secret, ...) signature this edit removes, so there is nothing live for
-- the REVOKE/signature-change statements below to break.
--
-- REVISED 2026-08-20 (spec's Solution, "REVISED (2)" block — supersedes Architecture
-- Decision 1 in full): the founder retired the walk-in ("this person doesn't exist even
-- for normal events"). With no unauthenticated person left to serve, the bearer-secret
-- mechanism these four functions originally used (`p_secret uuid`, checked against
-- `client_secret`) is removed in favor of the pattern used everywhere else in this
-- codebase: `auth.uid()`-based ownership. `client_secret` stays on the table (other
-- tests — e2e/integration/p1114-db-schema.spec.ts — pin its existence and confidentiality
-- as a still-valid column-level guard) but is no longer read, checked, or returned by
-- any function here. `GRANT EXECUTE ... TO anon` is revoked on all four: an
-- unauthenticated surface with no user is a surface, not a spare part.
--
-- This migration has never shipped (feature/p1114-event-room, not merged to main) —
-- edited in place rather than layered with a second migration.
--
-- P1063 gotcha (20260813080000_p1063_revoke_anon_execute_on_signed_in_rpcs.sql): this
-- project's `ALTER DEFAULT PRIVILEGES` grants EXECUTE to `anon` directly (role-direct,
-- not via PUBLIC) on every new function in `public`. `REVOKE ALL ... FROM PUBLIC` alone
-- is therefore a silent no-op against that grant — verified live via
-- `has_function_privilege('anon', ..., 'EXECUTE')` returning true after a PUBLIC-only
-- revoke. Every REVOKE below targets `PUBLIC, anon` explicitly for this reason.
--
-- Decision 1 (pre-revision) is preserved for the parts that still hold: this is still
-- the ONLY path onto or off of an event_room_members row (direct client INSERT/UPDATE
-- stays revoked — companion migration 20260819160000), and every mutating RPC still
-- independently re-checks the freeze boundary server-side.
--
-- SET search_path = public (not '') on every function below: matches the p1053/p1057
-- precedent rather than an empty search_path, because these functions reference
-- unqualified table/column names inside PL/pgSQL bodies the way those precedents do.

-- ============================================================================
-- 1. join_event_room — the only INSERT path onto event_room_members
-- ============================================================================

CREATE OR REPLACE FUNCTION public.join_event_room(p_event_id uuid, p_display_name text)
RETURNS SETOF public.event_room_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_datetime timestamptz;
  v_count integer;
  -- Roster flooding (Security Review, Input Validation ⚠️). Founder decision,
  -- 2026-08-19: MITIGATE, not ACCEPT. N = 1000 — see the spec's Founder Decisions
  -- section for the full reasoning; this is now a defense-in-depth backstop rather
  -- than the primary control, since every caller must additionally be signed in.
  v_room_cap CONSTANT integer := 1000;
BEGIN
  -- REVISED 2026-08-20: no unauthenticated caller reaches this function at all
  -- (GRANT EXECUTE below is authenticated-only), but this guard makes the invariant
  -- true of the function body itself, not merely of the grant around it.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;

  SELECT datetime INTO v_event_datetime FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  -- Decision 4: every mutating RPC independently re-checks the freeze boundary
  -- server-side. The "5" here MUST equal EVENT_GRACE_HOURS in
  -- src/app/data/events-service-real.ts:16 (P494) — Postgres cannot import a TS
  -- constant, so this is unavoidable cross-language duplication. It is LOUD
  -- duplication, not silent: this comment cross-references the TS constant, and
  -- src/tests/p1114-grace-hours-sync.test.ts (frontend build) pins the TS side so a
  -- future change to either side without the other fails a test instead of silently
  -- diverging. Anchored to event START (datetime), not end, per P494.
  IF now() >= v_event_datetime + interval '5 hours' THEN
    RAISE EXCEPTION 'this room is closed' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_count FROM public.event_room_members WHERE event_id = p_event_id;
  IF v_count >= v_room_cap THEN
    RAISE EXCEPTION 'this room is full' USING ERRCODE = '54000';
  END IF;

  -- profile_id derives from auth.uid() ONLY. There is no p_profile_id parameter on
  -- this function — so there is nothing for a client to pass that would spoof it. A
  -- caller that supplies an extra p_profile_id argument is rejected by PostgREST
  -- before this function body ever runs.
  --
  -- Non-Goals: this INSERT never touches event_rsvps and never checks max_attendees
  -- — both are explicit spec Non-Goals. Registration is the GATE the client checks
  -- before ever routing here (event_rsvps), not a condition this function enforces —
  -- the gate and the join are deliberately two different reads (spec Solution
  -- REVISED (2): "event_rsvps is now the room's gate... one rule, not two" describes
  -- the UI's door, not a second server-side capacity check this Non-Goal excludes).
  --
  -- ON CONFLICT: a signed-in caller who already has a row for this event (e.g. a
  -- second device) rejoins onto the SAME row rather than failing against the
  -- partial unique index (companion migration).
  RETURN QUERY
  INSERT INTO public.event_room_members (event_id, display_name, profile_id)
  VALUES (p_event_id, p_display_name, auth.uid())
  ON CONFLICT (event_id, profile_id) WHERE profile_id IS NOT NULL
    DO UPDATE SET display_name = EXCLUDED.display_name
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.join_event_room(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_event_room(uuid, text) TO authenticated;

-- ============================================================================
-- 2. set_room_opt_in — the only path that changes opted_in, and writes history
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_room_opt_in(p_member_id uuid, p_opted_in boolean)
RETURNS SETOF public.event_room_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member public.event_room_members;
  v_event_datetime timestamptz;
  v_cascade_count integer;
BEGIN
  -- FOR UPDATE serializes concurrent callers touching THIS row — same idiom as
  -- claim_joiner_seat. On its own it does NOT serialize the cascade count across
  -- DIFFERENT members opting in on the SAME event at the same moment; the advisory
  -- lock below closes that gap.
  SELECT * INTO v_member FROM public.event_room_members WHERE id = p_member_id FOR UPDATE;
  -- REVISED 2026-08-20: ownership is auth.uid() = profile_id, the pattern used
  -- everywhere else in this codebase — not a bearer secret. auth.uid() IS NULL is
  -- unreachable given the authenticated-only grant below, kept here so the function
  -- body itself never trusts an unauthenticated caller even if the grant ever drifts.
  IF NOT FOUND OR auth.uid() IS NULL OR v_member.profile_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not authorized to change this answer' USING ERRCODE = '42501';
  END IF;

  SELECT datetime INTO v_event_datetime FROM public.events WHERE id = v_member.event_id;
  IF now() >= v_event_datetime + interval '5 hours' THEN
    RAISE EXCEPTION 'this room is closed' USING ERRCODE = '42501';
  END IF;

  -- Per-event advisory lock: serializes cascade_count computation against every
  -- OTHER concurrent set_room_opt_in call on the SAME event. Released automatically
  -- at transaction end.
  PERFORM pg_advisory_xact_lock(hashtext(v_member.event_id::text)::bigint);

  -- THE single most important integrity requirement (spec, Security Review →
  -- Authorization): computed HERE, at the moment of insert, from server-side state
  -- only. p_opted_in is the only client-supplied value this function's signature
  -- accepts for the answer itself; there is no p_cascade_count parameter.
  SELECT count(*) INTO v_cascade_count
    FROM public.event_room_members
   WHERE event_id = v_member.event_id AND opted_in = true;

  -- Full history retained (spec §6) — this INSERT never overwrites a prior answer.
  INSERT INTO public.event_room_answers (room_member_id, opted_in, cascade_count)
  VALUES (p_member_id, p_opted_in, v_cascade_count);

  RETURN QUERY
  UPDATE public.event_room_members
     SET opted_in = p_opted_in
   WHERE id = p_member_id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.set_room_opt_in(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_room_opt_in(uuid, boolean) TO authenticated;

-- ============================================================================
-- 3. set_room_readiness — the room's OWN readiness, no expiry, auth.uid()-gated
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_room_readiness(p_member_id uuid, p_value smallint)
RETURNS SETOF public.event_room_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member public.event_room_members;
  v_event_datetime timestamptz;
BEGIN
  SELECT * INTO v_member FROM public.event_room_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR v_member.profile_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not authorized to change this value' USING ERRCODE = '42501';
  END IF;

  SELECT datetime INTO v_event_datetime FROM public.events WHERE id = v_member.event_id;
  IF now() >= v_event_datetime + interval '5 hours' THEN
    RAISE EXCEPTION 'this room is closed' USING ERRCODE = '42501';
  END IF;

  -- The 0-10 bound itself is the table's own CHECK constraint (companion migration)
  -- — not duplicated here. An out-of-range p_value fails the UPDATE below with
  -- 23514, which is sufficient: this function's job is authorization and the freeze
  -- gate, not range validation the table already owns.
  RETURN QUERY
  UPDATE public.event_room_members
     SET readiness_value = p_value
   WHERE id = p_member_id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.set_room_readiness(uuid, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_room_readiness(uuid, smallint) TO authenticated;

-- ============================================================================
-- 4. get_my_room_status — the self-read that bypasses the public roster policy
-- ============================================================================
-- REVISED 2026-08-20: keyed by (event_id, auth.uid()) rather than (member_id,
-- secret) — the caller's session IS the proof of identity now, so there is no
-- longer a member id or secret for the client to persist anywhere at all (closes
-- Decision 8's localStorage requirement at the root, not just at the client). This
-- bypasses the "opted_in = true" SELECT policy (companion migration) entirely for
-- the caller's OWN row. No freeze-boundary gate here on purpose — a person's own
-- status is a read, not a mutation, and a frozen room must still "display who was
-- there."
CREATE OR REPLACE FUNCTION public.get_my_room_status(p_event_id uuid)
RETURNS SETOF public.event_room_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT * FROM public.event_room_members
   WHERE event_id = p_event_id AND profile_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_room_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_room_status(uuid) TO authenticated;

-- Old signatures (uuid, uuid, boolean / uuid, uuid, smallint / uuid, uuid) never
-- shipped — this migration has not been applied to any deployed environment, so
-- there is no stale overload to drop.
