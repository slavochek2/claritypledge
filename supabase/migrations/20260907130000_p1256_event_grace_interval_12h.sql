-- P1256: widen the event grace boundary 5h -> 12h, and stop duplicating the number.
--
-- diffed against: 20260819171000_p1114_event_room_rpcs.sql (join_event_room,
--   set_room_readiness) and 20260821120000_p1114_public_roster_reversal.sql
--   (set_room_opt_in 3-arg, reset_room_answer) — the latest defining migration for
--   each. Bodies are byte-for-byte those, with exactly one substitution per body:
--   `interval '5 hours'` -> `public.event_grace_interval()`. Nothing else changed.
--
-- client-safe: no signature, return type or column changes. Every function keeps its
--   exact argument list and RETURNS clause, so no deployed client can break on the
--   shape. The only behavioural change is that a room stays open 12h after the event
--   start instead of 5h — strictly MORE permissive, so no client call that succeeded
--   before can start failing. The new event_grace_interval() is additive.
--
-- WHY THIS MIGRATION EXISTS AT ALL: P1114 Architecture Decision 4 deliberately
-- duplicated EVENT_GRACE_HOURS as a SQL literal (`interval '5 hours'`) inside every
-- mutating room RPC, because a Postgres function cannot import a Vite-bundled TS
-- constant. Its own words: "the choice is between silent duplication and loud,
-- tested duplication." The loud half is src/tests/p1114-grace-hours-sync.test.ts,
-- and it worked exactly as designed — changing the TS constant to 12 failed that
-- canary, which is what surfaced these four SQL copies. Without it the room's
-- freeze boundary would have silently stayed at 5h while the rest of the product
-- moved to 12h, and the room would have frozen 7 hours before the event closed.
--
-- WHAT CHANGES: the literal is replaced by ONE function, so the next change to this
-- number is a one-line migration instead of a hunt through four function bodies.
-- The bodies below are otherwise byte-for-byte the live definitions, lifted from
-- their latest defining migration (join_event_room and set_room_readiness from
-- 20260819171000; set_room_opt_in — the 3-arg form, the 2-arg one was dropped —
-- and reset_room_answer from 20260821120000) with `interval '5 hours'` swapped for
-- the helper call and nothing else touched.
--
-- The canary's cross-reference comment inside each RPC still points at
-- events-service-real.ts:16 and is still correct: the two sides must still agree,
-- and the test still pins the TS half. What is no longer true is that the SQL half
-- is spread across four bodies.

CREATE OR REPLACE FUNCTION public.event_grace_interval()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT interval '12 hours' $$;

COMMENT ON FUNCTION public.event_grace_interval() IS
  'P1256: the single SQL definition of the event grace window. MUST equal EVENT_GRACE_HOURS in src/app/data/events-service-real.ts, which src/tests/p1114-grace-hours-sync.test.ts pins. Change both together, in one commit.';

-- Callable by the same roles that call the RPCs below (they are SECURITY DEFINER
-- and invoke it internally, but keeping it callable makes the boundary inspectable).
GRANT EXECUTE ON FUNCTION public.event_grace_interval() TO authenticated, anon;

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
  -- server-side. P1256: the number is no longer written here — all four RPCs now
  -- call public.event_grace_interval(), so the SQL side has ONE definition instead
  -- of four copies. The cross-language duplication with EVENT_GRACE_HOURS in
  -- src/app/data/events-service-real.ts remains (Postgres cannot import a TS
  -- constant) and is still LOUD, not silent: src/tests/p1114-grace-hours-sync.test.ts
  -- pins the TS side, and changing it without this migration fails that test — which
  -- is exactly how the 5h->12h change found these four bodies.
  -- Anchored to event START (datetime), not end, per P494.
  IF now() >= v_event_datetime + public.event_grace_interval() THEN
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
  IF now() >= v_event_datetime + public.event_grace_interval() THEN
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

CREATE OR REPLACE FUNCTION public.set_room_opt_in(p_member_id uuid, p_opted_in boolean, p_comprehension smallint)
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
  SELECT * INTO v_member FROM public.event_room_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR v_member.profile_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not authorized to change this answer' USING ERRCODE = '42501';
  END IF;

  SELECT datetime INTO v_event_datetime FROM public.events WHERE id = v_member.event_id;
  IF now() >= v_event_datetime + public.event_grace_interval() THEN
    RAISE EXCEPTION 'this room is closed' USING ERRCODE = '42501';
  END IF;

  -- A rating is required to answer at all, opt-in or opt-out alike.
  IF p_comprehension IS NULL THEN
    RAISE EXCEPTION 'a comprehension rating is required to answer' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_member.event_id::text)::bigint);

  SELECT count(*) INTO v_cascade_count
    FROM public.event_room_members
   WHERE event_id = v_member.event_id AND opted_in = true;

  INSERT INTO public.event_room_answers (room_member_id, opted_in, cascade_count)
  VALUES (p_member_id, p_opted_in, v_cascade_count);

  RETURN QUERY
  UPDATE public.event_room_members
     SET opted_in = p_opted_in, comprehension_rating = p_comprehension
   WHERE id = p_member_id
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_room_answer(p_member_id uuid)
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
    RAISE EXCEPTION 'not authorized to change this answer' USING ERRCODE = '42501';
  END IF;

  SELECT datetime INTO v_event_datetime FROM public.events WHERE id = v_member.event_id;
  IF now() >= v_event_datetime + public.event_grace_interval() THEN
    RAISE EXCEPTION 'this room is closed' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.event_room_members
     SET opted_in = NULL, comprehension_rating = NULL
   WHERE id = p_member_id
  RETURNING *;
END;
$$;
