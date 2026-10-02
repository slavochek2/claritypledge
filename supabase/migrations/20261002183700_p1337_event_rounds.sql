-- new tables: event_rounds, event_round_seats, event_round_tables, event_round_presence
-- new functions: can_see_event_rounds, host_start_round, host_set_round_seats, host_end_rounds,
--   host_set_round_presence, confirm_round_seat, set_round_topic, set_round_position_moved
--   (every function below is new: no prior definition to diff against)
--
-- P1337: at a Clarity Night the room is grouped into trios by how much people disagree, rounds
-- run on the host's bell, and every phone says where to sit and what to talk about.
--
-- client-safe: additive only. Four new tables and new functions; no existing table, column,
--   policy or function is altered.
--
-- WHO COMPUTES THE GROUPING: the host's own client (src/lib/round-grouping.ts — a pure, seeded,
-- unit-tested function) and writes the result through host_start_round / host_set_round_seats.
-- The inputs it needs are all already readable by the host: the public room roster, positions
-- on public points, and the recorder flag through get_event_prep_host_view. Doing the search in
-- plpgsql would put a randomised optimiser where it cannot be tested; the integrity that DOES
-- belong in the database is here — only the host writes seats, every seat is a member of that
-- event's room, round numbers are strictly sequential.
--
-- SEATS KEY ON event_room_members.id, not profile_id: a room member's profile_id is SET NULL on
-- profile deletion (P1114: "the record of who was there is never deleted"), and the seating is
-- the same kind of record — "who was Ana with when she said that?".
--
-- PRIVACY: the seating is shown on the projector, so every room member may read it (SELECT via
-- can_see_event_rounds). Two things are not public: position_moved (the per-person "did your
-- position move?" answer — research record, excluded from the column grant) and presence
-- (left / sitting out — host only). No client role can INSERT/UPDATE/DELETE any of these
-- tables; every write goes through a SECURITY DEFINER function below.
--
-- SECURITY DEFINER pattern (P1381): SET search_path = '', explicit REVOKE EXECUTE FROM PUBLIC,
-- anon. Note the P880 trust-column guard fires only for anon/authenticated, so these definer
-- writers bypass it — none of them touches profiles.

-- ============================================================================
-- 1. Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  round_no INTEGER NOT NULL CHECK (round_no BETWEEN 1 AND 9),
  group_size INTEGER NOT NULL CHECK (group_size BETWEEN 2 AND 4),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  UNIQUE (event_id, round_no)
);

COMMENT ON TABLE public.event_rounds IS
  'P1337: one row per round the host started. started_at is the one clock for the room (90s to find tables, then 6/6/3).';

CREATE TABLE IF NOT EXISTS public.event_round_seats (
  round_id UUID NOT NULL REFERENCES public.event_rounds(id) ON DELETE CASCADE,
  room_member_id UUID NOT NULL REFERENCES public.event_room_members(id) ON DELETE CASCADE,
  table_no INTEGER NOT NULL CHECK (table_no BETWEEN 1 AND 99),
  role TEXT NOT NULL CHECK (role IN ('first', 'second', 'observer')),
  -- "I'm at table N": where they actually sat, and attendance. Never a gate (spec Invariants).
  confirmed_at TIMESTAMPTZ,
  -- "Did your position move?" after the round. NULL = not answered. Not in the column grant.
  position_moved BOOLEAN,
  PRIMARY KEY (round_id, room_member_id)
);

CREATE INDEX IF NOT EXISTS idx_event_round_seats_member ON public.event_round_seats(room_member_id);

COMMENT ON TABLE public.event_round_seats IS
  'P1337: who sat at which table in which role, per round. Written by host_start_round / host_set_round_seats only.';

-- The statement a table chose ("we're talking about this one"). Last tap wins, anyone at the
-- table — a note, not a permission.
CREATE TABLE IF NOT EXISTS public.event_round_tables (
  round_id UUID NOT NULL REFERENCES public.event_rounds(id) ON DELETE CASCADE,
  table_no INTEGER NOT NULL CHECK (table_no BETWEEN 1 AND 99),
  topic_point_id UUID REFERENCES public.points(id) ON DELETE SET NULL,
  topic_set_by UUID REFERENCES public.event_room_members(id) ON DELETE SET NULL,
  topic_set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, table_no)
);

COMMENT ON TABLE public.event_round_tables IS
  'P1337: the statement each table marked as the one they talked about. Written by set_round_topic only.';

-- Host-only tidy-up: someone left, or sits out a round. Optional by design — a ghost makes
-- a table of two and the format absorbs it.
CREATE TABLE IF NOT EXISTS public.event_round_presence (
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  room_member_id UUID NOT NULL REFERENCES public.event_room_members(id) ON DELETE CASCADE,
  left_at TIMESTAMPTZ,
  sits_out_round INTEGER CHECK (sits_out_round IS NULL OR sits_out_round BETWEEN 1 AND 9),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, room_member_id)
);

COMMENT ON TABLE public.event_round_presence IS
  'P1337: host marks left / sitting out a round. Host-only read and write.';

-- ============================================================================
-- 2. Visibility helper
-- ============================================================================
-- SECURITY DEFINER so the policies below can test room membership without recursing through
-- event_room_members' own policies. Returns only a boolean about the caller.

CREATE OR REPLACE FUNCTION public.can_see_event_rounds(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.events e
             WHERE e.id = p_event_id AND e.host_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.event_room_members m
                WHERE m.event_id = p_event_id AND m.profile_id = (SELECT auth.uid()))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_see_event_rounds(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_event_rounds(uuid) TO authenticated;

-- ============================================================================
-- 3. RLS — read for host + room members, no client writes at all
-- ============================================================================

ALTER TABLE public.event_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_round_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_round_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_round_presence ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.event_rounds FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.event_round_seats FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.event_round_tables FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.event_round_presence FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.event_rounds TO authenticated;
GRANT SELECT (round_id, room_member_id, table_no, role, confirmed_at) ON public.event_round_seats TO authenticated;
GRANT SELECT ON public.event_round_tables TO authenticated;
GRANT SELECT ON public.event_round_presence TO authenticated;

CREATE POLICY "Room members and host read rounds"
  ON public.event_rounds FOR SELECT TO authenticated
  USING (public.can_see_event_rounds(event_id));

CREATE POLICY "Room members and host read seats"
  ON public.event_round_seats FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.event_rounds r
                  WHERE r.id = event_round_seats.round_id
                    AND public.can_see_event_rounds(r.event_id)));

CREATE POLICY "Room members and host read table topics"
  ON public.event_round_tables FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.event_rounds r
                  WHERE r.id = event_round_tables.round_id
                    AND public.can_see_event_rounds(r.event_id)));

CREATE POLICY "Host reads presence"
  ON public.event_round_presence FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e
                  WHERE e.id = event_round_presence.event_id
                    AND e.host_id = (SELECT auth.uid())));

-- ============================================================================
-- 4. Host writers
-- ============================================================================
-- p_seats: [{"m": "<room_member_id>", "t": <table_no>, "r": "first"|"second"|"observer"}, ...]

-- Shared validation: every seat is a member of this event's room, no member twice, at most
-- one first and one second per table, every table has a pair or is a lone seat.
CREATE OR REPLACE FUNCTION public.p1337_assert_valid_seats(p_event_id uuid, p_seats jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_total int;
  v_distinct int;
  v_members int;
BEGIN
  IF p_seats IS NULL OR jsonb_typeof(p_seats) IS DISTINCT FROM 'array' OR jsonb_array_length(p_seats) = 0 THEN
    RAISE EXCEPTION 'seats must be a non-empty array' USING ERRCODE = '22023';
  END IF;

  SELECT count(*), count(DISTINCT x.m) INTO v_total, v_distinct
    FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text);
  IF v_total IS DISTINCT FROM v_distinct THEN
    RAISE EXCEPTION 'a person is seated twice' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_members
    FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text)
    JOIN public.event_room_members rm ON rm.id = x.m AND rm.event_id = p_event_id;
  IF v_members IS DISTINCT FROM v_total THEN
    RAISE EXCEPTION 'every seat must be a member of this event room' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text)
              WHERE x.t IS NULL OR x.t NOT BETWEEN 1 AND 99
                 OR x.r IS NULL OR x.r NOT IN ('first', 'second', 'observer')) THEN
    RAISE EXCEPTION 'invalid table or role' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text)
              WHERE x.r IN ('first', 'second')
              GROUP BY x.t, x.r HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'a table has two people in the same speaking role' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.p1337_assert_valid_seats(uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.host_start_round(
  p_event_id uuid,
  p_round_no int,
  p_group_size int,
  p_seats jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host uuid;
  v_last int;
  v_round uuid;
BEGIN
  SELECT e.host_id INTO v_host FROM public.events e WHERE e.id = p_event_id;
  IF v_host IS NULL OR v_host IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'only the host can run rounds' USING ERRCODE = '42501';
  END IF;

  -- Serialise two taps of "Next round" (two host devices, a double tap).
  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || p_event_id::text, 0));

  SELECT COALESCE(max(r.round_no), 0) INTO v_last FROM public.event_rounds r WHERE r.event_id = p_event_id;
  IF p_round_no IS DISTINCT FROM v_last + 1 THEN
    RAISE EXCEPTION 'round % is not next (last started: %)', p_round_no, v_last USING ERRCODE = '22023';
  END IF;

  PERFORM public.p1337_assert_valid_seats(p_event_id, p_seats);

  UPDATE public.event_rounds SET ended_at = now()
   WHERE event_id = p_event_id AND ended_at IS NULL;

  INSERT INTO public.event_rounds (event_id, round_no, group_size)
  VALUES (p_event_id, p_round_no, p_group_size)
  RETURNING id INTO v_round;

  INSERT INTO public.event_round_seats (round_id, room_member_id, table_no, role)
  SELECT v_round, x.m, x.t, x.r FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text);

  RETURN v_round;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.host_start_round(uuid, int, int, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_start_round(uuid, int, int, jsonb) TO authenticated;

-- Swap / undo / recompute on the CURRENT round. Keeps a person's confirm tap and answer when
-- their table did not change; clears them when it did (the tap recorded a table they left).
CREATE OR REPLACE FUNCTION public.host_set_round_seats(p_round_id uuid, p_seats jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event uuid;
  v_host uuid;
  v_round_no int;
  v_last int;
BEGIN
  SELECT r.event_id, r.round_no, e.host_id INTO v_event, v_round_no, v_host
    FROM public.event_rounds r JOIN public.events e ON e.id = r.event_id
   WHERE r.id = p_round_id;
  IF v_host IS NULL OR v_host IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'only the host can change seats' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || v_event::text, 0));

  SELECT max(r.round_no) INTO v_last FROM public.event_rounds r WHERE r.event_id = v_event;
  IF v_round_no IS DISTINCT FROM v_last THEN
    RAISE EXCEPTION 'only the current round can be changed' USING ERRCODE = '22023';
  END IF;

  PERFORM public.p1337_assert_valid_seats(v_event, p_seats);

  DELETE FROM public.event_round_seats s
   WHERE s.round_id = p_round_id
     AND s.room_member_id NOT IN (SELECT x.m FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text));

  INSERT INTO public.event_round_seats AS s (round_id, room_member_id, table_no, role)
  SELECT p_round_id, x.m, x.t, x.r FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text)
  ON CONFLICT (round_id, room_member_id) DO UPDATE
    SET role = EXCLUDED.role,
        confirmed_at = CASE WHEN s.table_no = EXCLUDED.table_no THEN s.confirmed_at END,
        position_moved = CASE WHEN s.table_no = EXCLUDED.table_no THEN s.position_moved END,
        table_no = EXCLUDED.table_no;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.host_set_round_seats(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_set_round_seats(uuid, jsonb) TO authenticated;

-- End of the evening: close the open round so phones stop showing a table.
CREATE OR REPLACE FUNCTION public.host_end_rounds(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host uuid;
BEGIN
  SELECT e.host_id INTO v_host FROM public.events e WHERE e.id = p_event_id;
  IF v_host IS NULL OR v_host IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'only the host can end rounds' USING ERRCODE = '42501';
  END IF;
  UPDATE public.event_rounds SET ended_at = now()
   WHERE event_id = p_event_id AND ended_at IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.host_end_rounds(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_end_rounds(uuid) TO authenticated;

-- p_left: true marks left (now), false clears it. p_sits_out_round: the round they sit out,
-- or NULL to clear.
CREATE OR REPLACE FUNCTION public.host_set_round_presence(
  p_event_id uuid,
  p_room_member_id uuid,
  p_left boolean,
  p_sits_out_round int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host uuid;
BEGIN
  SELECT e.host_id INTO v_host FROM public.events e WHERE e.id = p_event_id;
  IF v_host IS NULL OR v_host IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'only the host can change who is here' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.event_room_members m
                  WHERE m.id = p_room_member_id AND m.event_id = p_event_id) THEN
    RAISE EXCEPTION 'not a member of this event room' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.event_round_presence AS p (event_id, room_member_id, left_at, sits_out_round)
  VALUES (p_event_id, p_room_member_id, CASE WHEN p_left THEN now() END, p_sits_out_round)
  ON CONFLICT (event_id, room_member_id) DO UPDATE
    SET left_at = CASE WHEN p_left THEN COALESCE(p.left_at, now()) END,
        sits_out_round = EXCLUDED.sits_out_round,
        updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.host_set_round_presence(uuid, uuid, boolean, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_set_round_presence(uuid, uuid, boolean, int) TO authenticated;

-- ============================================================================
-- 5. Attendee writers — each touches only the caller's own seat / own table
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirm_round_seat(p_round_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.event_round_seats s
     SET confirmed_at = COALESCE(s.confirmed_at, now())
    FROM public.event_room_members m
   WHERE s.round_id = p_round_id
     AND m.id = s.room_member_id
     AND m.profile_id = (SELECT auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_round_seat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_round_seat(uuid) TO authenticated;

-- p_point_id NULL clears the mark. Anyone seated at that table in that round, observer
-- included; last tap wins.
CREATE OR REPLACE FUNCTION public.set_round_topic(p_round_id uuid, p_table_no int, p_point_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member uuid;
BEGIN
  SELECT s.room_member_id INTO v_member
    FROM public.event_round_seats s
    JOIN public.event_room_members m ON m.id = s.room_member_id
   WHERE s.round_id = p_round_id
     AND s.table_no = p_table_no
     AND m.profile_id = (SELECT auth.uid());
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'only someone at this table can mark its statement' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.event_round_tables AS t (round_id, table_no, topic_point_id, topic_set_by)
  VALUES (p_round_id, p_table_no, p_point_id, v_member)
  ON CONFLICT (round_id, table_no) DO UPDATE
    SET topic_point_id = EXCLUDED.topic_point_id,
        topic_set_by = EXCLUDED.topic_set_by,
        topic_set_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_round_topic(uuid, int, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_round_topic(uuid, int, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_round_position_moved(p_round_id uuid, p_moved boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.event_round_seats s
     SET position_moved = p_moved
    FROM public.event_room_members m
   WHERE s.round_id = p_round_id
     AND m.id = s.room_member_id
     AND m.profile_id = (SELECT auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_round_position_moved(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_round_position_moved(uuid, boolean) TO authenticated;
