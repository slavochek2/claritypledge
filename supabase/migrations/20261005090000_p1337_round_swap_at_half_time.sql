-- Migration: P1337 — "Swap at half time" can be turned off for a round
-- Created: 2026-10-05
-- Spec: features/p1337_event_journey_on_screen_steps_rotation_and_ending.md §6 (founder walkthrough 5)
-- Guaranteed by: e2e/integration/p1337-event-rounds-db.spec.ts ("swap at half time")
--
-- WHY. The founder: "what if we make it flexible … disable this split where they can use 12
-- minutes and whenever they want, practically switching speaker and listener as they wish, using
-- the badges." Every round so far forced the swap at six minutes.
--
-- WHAT. event_rounds.split_speakers (default true = today's behaviour). Off, the two speakers'
-- seconds run as ONE talking part (first_s + second_s): no swap moment, no swap bell, the pair
-- trade the badges themselves. The seconds stay stored per speaker so the round's total and
-- "+1 min" keep their meaning.
--
-- new function: host_start_round(uuid, int, int, jsonb, int, int, int, boolean) — a third
--   overload; no defaults, so PostgREST resolves each call by its named arguments and the 4- and
--   7-argument versions (20261002183700, 20261004183000) stay valid for clients still calling them.
-- replaced: host_extend_round(uuid, text) — same signature; with the split off, the first and
--   second speaker form one part, and a minute added during it goes to the second speaker's seconds
--   (the end of the shared part), never moving anything already passed.
-- client-safe: additive column with a default; existing functions keep their behaviour for split rounds.

ALTER TABLE public.event_rounds
  ADD COLUMN IF NOT EXISTS split_speakers BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.event_rounds.split_speakers IS
  'P1337: true = the speakers swap at half time (first_s then second_s). false = one talking part of first_s + second_s; the pair swap badges themselves.';

CREATE OR REPLACE FUNCTION public.host_start_round(
  p_event_id uuid,
  p_round_no int,
  p_group_size int,
  p_seats jsonb,
  p_seating_s int,
  p_speaker_s int,
  p_observer_s int,
  p_split_speakers boolean
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

  -- The column CHECKs reject out-of-range minutes.
  INSERT INTO public.event_rounds (event_id, round_no, group_size, seating_s, first_s, second_s, observer_s, split_speakers)
  VALUES (p_event_id, p_round_no, p_group_size, p_seating_s, p_speaker_s, p_speaker_s, p_observer_s, COALESCE(p_split_speakers, true))
  RETURNING id INTO v_round;

  INSERT INTO public.event_round_seats (round_id, room_member_id, table_no, role)
  SELECT v_round, x.m, x.t, x.r FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text);

  RETURN v_round;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.host_start_round(uuid, int, int, jsonb, int, int, int, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_start_round(uuid, int, int, jsonb, int, int, int, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.host_extend_round(p_round_id uuid, p_phase text)
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
BEGIN
  IF p_phase IS NULL OR p_phase NOT IN ('seating', 'first', 'second', 'observer') THEN
    RAISE EXCEPTION 'unknown part of the round: %', p_phase USING ERRCODE = '22023';
  END IF;

  SELECT r.event_id, e.host_id INTO v_event, v_host
    FROM public.event_rounds r JOIN public.events e ON e.id = r.event_id
   WHERE r.id = p_round_id;
  IF v_host IS NULL OR v_host IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'only the host can change the round''s minutes' USING ERRCODE = '42501';
  END IF;

  -- Same lock as Next round, taken BEFORE the round is read: a round closed while we waited is seen.
  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || v_event::text, 0));

  SELECT * INTO v_round FROM public.event_rounds WHERE id = p_round_id;
  IF v_round.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'this round is over' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.event_round_seats s WHERE s.round_id = p_round_id AND s.role = 'observer')
    INTO v_has_observer;
  v_elapsed := extract(epoch FROM (now() - v_round.started_at));

  -- The part running now — the same arithmetic as src/lib/round-clock.ts.
  IF v_elapsed < v_round.seating_s THEN
    v_part := 'seating';
  ELSIF v_round.split_speakers AND v_elapsed < v_round.seating_s + v_round.first_s THEN
    v_part := 'first';
  ELSIF v_elapsed < v_round.seating_s + v_round.first_s + v_round.second_s THEN
    -- Split off: one shared talking part; its extra minute goes on the end (second_s).
    v_part := 'second';
  ELSIF v_has_observer AND v_elapsed < v_round.seating_s + v_round.first_s + v_round.second_s + v_round.observer_s THEN
    v_part := 'observer';
  ELSE
    RAISE EXCEPTION 'time is up for this round' USING ERRCODE = '22023';
  END IF;

  -- LEAST keeps the column CHECK from turning a tenth tap into an error; it simply stops growing.
  IF v_part = 'seating' THEN
    UPDATE public.event_rounds SET seating_s = LEAST(seating_s + 60, 1800) WHERE id = p_round_id;
  ELSIF v_part = 'first' THEN
    UPDATE public.event_rounds SET first_s = LEAST(first_s + 60, 3600) WHERE id = p_round_id;
  ELSIF v_part = 'second' THEN
    UPDATE public.event_rounds SET second_s = LEAST(second_s + 60, 3600) WHERE id = p_round_id;
  ELSE
    UPDATE public.event_rounds SET observer_s = LEAST(observer_s + 60, 3600) WHERE id = p_round_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.host_extend_round(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_extend_round(uuid, text) TO authenticated;
