-- Migration: P1337 — "−1 min", "Match on #tag" and the showcase round
-- Created: 2026-10-05
-- Spec: features/p1337_event_journey_on_screen_steps_rotation_and_ending.md §6 (founder walkthrough 6, item 9)
-- Guaranteed by: e2e/integration/p1337-event-rounds-db.spec.ts ("walkthrough 6")
--
-- WHY. The founder asked for: a minute less beside "+1 min"; matching a round on another tag than the
-- event's (the table's statements follow it); and a showcase round — the host chooses who sits (by
-- tapping people, or "Recorders"), those are grouped by disagreement, everyone else watches.
--
-- WHAT.
--   event_rounds.match_tag  — the tag this round was grouped on and its tables talk about (NULL = the
--                             event's statement_tag). Same pattern as events.statement_tag.
--   event_rounds.showcase   — true: only the chosen people are seated; the rest of the room watches.
--                             Seats were already allowed to be a subset (p1337_assert_valid_seats).
--   host_start_round(…, p_split_speakers, p_match_tag, p_showcase) — a fourth overload; the 4-, 7- and
--                             8-argument versions stay valid for clients still calling them.
--   host_shorten_round(p_round_id) — a minute off the part running now, computed on the server under
--                             the round lock (as host_extend_round). It never moves time already
--                             passed: at most the part ends now. The speakers' parts keep their 60 s
--                             floor (the column CHECK).
-- new function: host_start_round(uuid, int, int, jsonb, int, int, int, boolean, text, boolean) — a new
--   overload, its body copied from the 8-argument one plus the two columns.
-- new function: host_shorten_round(uuid) — the part arithmetic copied from host_extend_round.
-- diffed against: 20261005090000_p1337_round_swap_at_half_time.sql
-- client-safe: additive columns with defaults; new functions only.

ALTER TABLE public.event_rounds
  ADD COLUMN IF NOT EXISTS match_tag TEXT
    CHECK (match_tag IS NULL OR match_tag ~ '^[a-z0-9][a-z0-9_-]{0,49}$'),
  ADD COLUMN IF NOT EXISTS showcase BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.event_rounds.match_tag IS
  'P1337: the tag this round was grouped on; its tables talk about these statements. NULL = events.statement_tag.';
COMMENT ON COLUMN public.event_rounds.showcase IS
  'P1337: true = the host chose who sits; everyone not seated watches.';

CREATE OR REPLACE FUNCTION public.host_start_round(
  p_event_id uuid,
  p_round_no int,
  p_group_size int,
  p_seats jsonb,
  p_seating_s int,
  p_speaker_s int,
  p_observer_s int,
  p_split_speakers boolean,
  p_match_tag text,
  p_showcase boolean
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

  -- The column CHECKs reject out-of-range minutes and a malformed tag.
  INSERT INTO public.event_rounds
    (event_id, round_no, group_size, seating_s, first_s, second_s, observer_s, split_speakers, match_tag, showcase)
  VALUES
    (p_event_id, p_round_no, p_group_size, p_seating_s, p_speaker_s, p_speaker_s, p_observer_s,
     COALESCE(p_split_speakers, true), NULLIF(p_match_tag, ''), COALESCE(p_showcase, false))
  RETURNING id INTO v_round;

  INSERT INTO public.event_round_seats (round_id, room_member_id, table_no, role)
  SELECT v_round, x.m, x.t, x.r FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text);

  RETURN v_round;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.host_start_round(uuid, int, int, jsonb, int, int, int, boolean, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_start_round(uuid, int, int, jsonb, int, int, int, boolean, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.host_shorten_round(p_round_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event uuid;
  v_host uuid;
  v_round public.event_rounds%ROWTYPE;
  v_elapsed numeric;
  v_has_observer boolean;
  v_part text;
  v_into numeric;
BEGIN
  SELECT r.event_id, e.host_id INTO v_event, v_host
    FROM public.event_rounds r JOIN public.events e ON e.id = r.event_id
   WHERE r.id = p_round_id;
  IF v_host IS NULL OR v_host IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'only the host can change the round''s minutes' USING ERRCODE = '42501';
  END IF;

  -- Same lock as Next round and "+1 min", taken BEFORE the round is read.
  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || v_event::text, 0));

  SELECT * INTO v_round FROM public.event_rounds WHERE id = p_round_id;
  IF v_round.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'this round is over' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.event_round_seats s WHERE s.round_id = p_round_id AND s.role = 'observer')
    INTO v_has_observer;
  v_elapsed := extract(epoch FROM (now() - v_round.started_at));

  -- The part running now, and how far into it we are — the arithmetic of src/lib/round-clock.ts.
  IF v_elapsed < v_round.seating_s THEN
    v_part := 'seating';
    v_into := v_elapsed;
  ELSIF v_round.split_speakers AND v_elapsed < v_round.seating_s + v_round.first_s THEN
    v_part := 'first';
    v_into := v_elapsed - v_round.seating_s;
  ELSIF v_elapsed < v_round.seating_s + v_round.first_s + v_round.second_s THEN
    -- Split off: one shared talking part; its minute comes off the end (second_s).
    v_part := 'second';
    v_into := v_elapsed - v_round.seating_s - v_round.first_s;
  ELSIF v_has_observer AND v_elapsed < v_round.seating_s + v_round.first_s + v_round.second_s + v_round.observer_s THEN
    v_part := 'observer';
    v_into := v_elapsed - v_round.seating_s - v_round.first_s - v_round.second_s;
  ELSE
    RAISE EXCEPTION 'time is up for this round' USING ERRCODE = '22023';
  END IF;

  -- A minute less, never less than what has already passed in this part (it ends now at most),
  -- and never under the column's floor.
  IF v_part = 'seating' THEN
    UPDATE public.event_rounds SET seating_s = GREATEST(seating_s - 60, ceil(v_into)::int, 0) WHERE id = p_round_id;
  ELSIF v_part = 'first' THEN
    UPDATE public.event_rounds SET first_s = LEAST(GREATEST(first_s - 60, ceil(v_into)::int, 60), first_s) WHERE id = p_round_id;
  ELSIF v_part = 'second' THEN
    -- Split off, the shared part is first_s + second_s: time passed beyond first_s is second_s's.
    UPDATE public.event_rounds
       SET second_s = LEAST(GREATEST(second_s - 60, ceil(v_into)::int, 60), second_s)
     WHERE id = p_round_id;
  ELSE
    UPDATE public.event_rounds SET observer_s = GREATEST(observer_s - 60, ceil(v_into)::int, 0) WHERE id = p_round_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.host_shorten_round(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_shorten_round(uuid) TO authenticated;
