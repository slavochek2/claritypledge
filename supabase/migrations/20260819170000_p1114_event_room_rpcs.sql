-- new function -- all four RPCs below are first defined here; verified with
-- `grep -rl 'FUNCTION public.<name>' supabase/migrations/` returning no prior file.
-- P1114: the event room — join_event_room / set_room_opt_in / set_room_readiness /
-- get_my_room_status.
--
-- Decision 1: the ONLY path onto or off of an event_room_members row. Direct client
-- INSERT/UPDATE is revoked on that table (companion migration 20260819160000) — these four
-- SECURITY DEFINER functions are what makes that revoke non-decorative, same shape as
-- claim_joiner_seat / release_joiner_seat (20260812150000_p1053_joiner_seat_claim_rpcs.sql).
--
-- SET search_path = public (not '') on every function below: matches the p1053/p1057
-- precedent rather than an empty search_path, because these functions reference
-- unqualified table/column names inside PL/pgSQL bodies the way those precedents do.
--
-- client-safe: no existing client code calls any of these four names — the surface is
-- entirely new. Nothing deployed changes behavior when this migration lands.

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
  -- Roster flooding (Security Review, Input Validation ⚠️; Risks: "Roster flooding via the
  -- public join RPC — no auth, no captcha, and the output is on a wall"). Founder decision,
  -- 2026-08-19: MITIGATE, not ACCEPT — this failure mode is visible to the whole room at
  -- once, unlike /ready's equivalent unrate-limited risk. N = 1000, recorded here AND in
  -- the spec's Founder Decisions section (features/p1114_..._opt_in.md) per that section's
  -- own instruction that a magic number belongs written down, not buried in a migration.
  -- Reasoning: the largest event this product runs today is on the order of dozens of
  -- people, a room of twelve is the spec's own reference point for "never approaches it" —
  -- 1000 is roughly two orders of magnitude of headroom above any plausible legitimate
  -- room size, so no real event is ever refused, while still bounding a flood's damage to
  -- a row count small enough for manual cleanup rather than unbounded growth.
  v_room_cap CONSTANT integer := 1000;
BEGIN
  SELECT datetime INTO v_event_datetime FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  -- Decision 4 (Architecture Decisions, Security Review RLS ⚠️ item 3): every mutating RPC
  -- independently re-checks the freeze boundary server-side. The "5" here MUST equal
  -- EVENT_GRACE_HOURS in src/app/data/events-service-real.ts:16 (P494) — Postgres cannot
  -- import a TS constant, so this is unavoidable cross-language duplication. It is LOUD
  -- duplication, not silent: this comment cross-references the TS constant, and
  -- src/tests/p1114-grace-hours-sync.test.ts (frontend build) pins the TS side so a future
  -- change to either side without the other fails a test instead of silently diverging.
  -- Anchored to event START (datetime), not end, per P494 — the room stays open exactly as
  -- long as the event reads "upcoming" everywhere else in the app.
  IF now() >= v_event_datetime + interval '5 hours' THEN
    RAISE EXCEPTION 'this room is closed' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_count FROM public.event_room_members WHERE event_id = p_event_id;
  IF v_count >= v_room_cap THEN
    RAISE EXCEPTION 'this room is full' USING ERRCODE = '54000';
  END IF;

  -- profile_id derives from auth.uid() ONLY. There is no p_profile_id parameter on this
  -- function — so there is nothing for a client to pass that would spoof it. A caller that
  -- supplies an extra p_profile_id argument is rejected by PostgREST before this function
  -- body ever runs (unknown-parameter signature mismatch), which is the mechanism the
  -- Security Review's Authorization ⚠️ item asked to be confirmed.
  --
  -- Non-Goals: this INSERT never touches event_rsvps and never checks max_attendees — both
  -- are explicit spec Non-Goals, and neither column/table is referenced anywhere below.
  --
  -- ON CONFLICT: Decision 8 expects a room to be open across multiple devices/tabs over one
  -- evening (a phone and a projector). A signed-in caller who already has a row for this
  -- event (e.g. a second device that never received the first device's localStorage) rejoins
  -- onto the SAME row and gets its existing client_secret back via RETURNING, rather than
  -- failing against the partial unique index (companion migration). A guest (profile_id IS
  -- NULL) never conflicts — the partial index excludes NULL profile_id, so every walk-in
  -- always gets a brand-new row and a brand-new secret, including two walk-ins sharing a name.
  RETURN QUERY
  INSERT INTO public.event_room_members (event_id, display_name, profile_id)
  VALUES (p_event_id, p_display_name, auth.uid())
  ON CONFLICT (event_id, profile_id) WHERE profile_id IS NOT NULL
    DO UPDATE SET display_name = EXCLUDED.display_name
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.join_event_room(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_event_room(uuid, text) TO anon, authenticated;

-- ============================================================================
-- 2. set_room_opt_in — the only path that changes opted_in, and writes history
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_room_opt_in(p_member_id uuid, p_secret uuid, p_opted_in boolean)
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
  -- claim_joiner_seat. On its own it does NOT serialize the cascade count across DIFFERENT
  -- members opting in on the SAME event at the same moment; the advisory lock below closes
  -- that gap. /generate-tests explicitly flagged this as an untested race ("Concurrent
  -- set_room_opt_in race on cascade_count... an untested gap, not silently assumed safe") —
  -- this migration closes it rather than leaving it open, because the spec calls the cascade
  -- counter "the single most important integrity requirement" it has.
  SELECT * INTO v_member FROM public.event_room_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND OR v_member.client_secret <> p_secret THEN
    -- Authorization ⚠️: normal `=` comparison is acceptable per the spec's own Security
    -- Review — this is not a password, the token space is a full UUID, and it is not
    -- brute-forceable at any meaningful rate through PostgREST/RPC.
    RAISE EXCEPTION 'not authorized to change this answer' USING ERRCODE = '42501';
  END IF;

  SELECT datetime INTO v_event_datetime FROM public.events WHERE id = v_member.event_id;
  -- Decision 4 — see join_event_room above for the full duplication note (same "5",
  -- same EVENT_GRACE_HOURS cross-reference, not repeated per-function).
  IF now() >= v_event_datetime + interval '5 hours' THEN
    RAISE EXCEPTION 'this room is closed' USING ERRCODE = '42501';
  END IF;

  -- Per-event advisory lock: serializes cascade_count computation against every OTHER
  -- concurrent set_room_opt_in call on the SAME event, so two simultaneous opt-ins cannot
  -- both read the same "already opted in" count and both write a cascade_count that ignores
  -- the other. Released automatically at transaction end (xact-scoped, no explicit unlock
  -- needed). A hashtext() collision between two different event_id values only costs
  -- unnecessary serialization between two unrelated events' opt-ins — it can never produce
  -- an incorrect count — which is an acceptable trade for not standing up a dedicated lock
  -- table for this.
  PERFORM pg_advisory_xact_lock(hashtext(v_member.event_id::text)::bigint);

  -- THE single most important integrity requirement (spec, Security Review → Authorization):
  -- computed HERE, at the moment of insert, from server-side state only — count of members
  -- already opted in for this event, BEFORE this answer is applied. p_opted_in is the only
  -- client-supplied value this function's signature accepts for the answer itself; there is
  -- no p_cascade_count parameter, so there is nothing for a client to spoof. An extra
  -- parameter on the RPC call is rejected by PostgREST before this function body ever runs.
  SELECT count(*) INTO v_cascade_count
    FROM public.event_room_members
   WHERE event_id = v_member.event_id AND opted_in = true;

  -- Full history retained (spec §6: "changes are allowed and the full history is kept") —
  -- this INSERT never overwrites a prior answer; event_room_answers is append-only.
  INSERT INTO public.event_room_answers (room_member_id, opted_in, cascade_count)
  VALUES (p_member_id, p_opted_in, v_cascade_count);

  RETURN QUERY
  UPDATE public.event_room_members
     SET opted_in = p_opted_in
   WHERE id = p_member_id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.set_room_opt_in(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_room_opt_in(uuid, uuid, boolean) TO anon, authenticated;

-- ============================================================================
-- 3. set_room_readiness — the room's OWN readiness, no expiry, secret-gated
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_room_readiness(p_member_id uuid, p_secret uuid, p_value smallint)
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
  IF NOT FOUND OR v_member.client_secret <> p_secret THEN
    RAISE EXCEPTION 'not authorized to change this value' USING ERRCODE = '42501';
  END IF;

  SELECT datetime INTO v_event_datetime FROM public.events WHERE id = v_member.event_id;
  -- Decision 4 — Build Sequence step 1 names all three mutating RPCs (join_event_room,
  -- set_room_opt_in, set_room_readiness) as independently re-checking this boundary.
  IF now() >= v_event_datetime + interval '5 hours' THEN
    RAISE EXCEPTION 'this room is closed' USING ERRCODE = '42501';
  END IF;

  -- The 0-10 bound itself is the table's own CHECK constraint (companion migration) —
  -- not duplicated here. An out-of-range p_value fails the UPDATE below with 23514, which
  -- is sufficient: this function's job is authorization and the freeze gate, not range
  -- validation the table already owns.
  RETURN QUERY
  UPDATE public.event_room_members
     SET readiness_value = p_value
   WHERE id = p_member_id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.set_room_readiness(uuid, uuid, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_room_readiness(uuid, uuid, smallint) TO anon, authenticated;

-- ============================================================================
-- 4. get_my_room_status — the self-read that bypasses the public roster policy
-- ============================================================================
-- Decision 2: the ONLY sanctioned way to read an opted-out (or not-yet-answered) row is
-- through here — the caller's own device, proving it holds client_secret. SECURITY DEFINER
-- means this bypasses the "opted_in = true" SELECT policy (companion migration) entirely
-- once the secret checks out; it does NOT bypass the secret check itself. No freeze-boundary
-- gate here on purpose — Done-When #14 requires a frozen room to still "display who was
-- there," and a person's own status is exactly that kind of read, not a mutation.
CREATE OR REPLACE FUNCTION public.get_my_room_status(p_member_id uuid, p_secret uuid)
RETURNS SETOF public.event_room_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member public.event_room_members;
BEGIN
  SELECT * INTO v_member FROM public.event_room_members WHERE id = p_member_id;
  IF NOT FOUND OR v_member.client_secret <> p_secret THEN
    RAISE EXCEPTION 'not authorized to read this status' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT * FROM public.event_room_members WHERE id = p_member_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_room_status(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_room_status(uuid, uuid) TO anon, authenticated;
