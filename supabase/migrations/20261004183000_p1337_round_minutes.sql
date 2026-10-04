-- Migration: P1337 — minutes per round, and "+1 min" on the running round
-- Created: 2026-10-04
-- Spec: features/p1337_event_journey_on_screen_steps_rotation_and_ending.md §6 (founder walkthrough 4)
-- Guaranteed by: e2e/integration/p1337-event-rounds-db.spec.ts ("minutes per round")
--
-- WHY. The founder, walking the host panel: "manually adjust minutes for tables, speaker and
-- observer". Until now every round ran 1 / 6 / 6 / 3 minutes, fixed in the client.
--
-- WHAT. Each round stores its own seconds per part — finding tables, the first speaker, the second
-- speaker, the observer. They are fixed when the round starts (the host sets minutes for the NEXT
-- round), so changing them never moves a round already running. "+1 min" adds sixty seconds to ONE
-- part of the running round: the part running now, so no boundary already passed can move back.
-- First and second speaker are separate columns for that reason — a minute added during the
-- second speaker must not lengthen the first one retroactively.
--
-- new function: host_start_round(uuid, int, int, jsonb, int, int, int) — an overload of the 4-arg
--   host_start_round(uuid, int, int, jsonb) from 20261002183700, which stays for clients still
--   calling it (its rounds take the column defaults). No defaults on the new parameters, so the
--   two never compete for the same call.
-- new function: host_extend_round(uuid, text) exists in no prior migration.
-- client-safe: additive columns with defaults (existing rows read as 60/360/360/180); the existing
--   4-arg function is untouched.

ALTER TABLE public.event_rounds
  ADD COLUMN IF NOT EXISTS seating_s INTEGER NOT NULL DEFAULT 60 CHECK (seating_s BETWEEN 0 AND 1800),
  ADD COLUMN IF NOT EXISTS first_s INTEGER NOT NULL DEFAULT 360 CHECK (first_s BETWEEN 60 AND 3600),
  ADD COLUMN IF NOT EXISTS second_s INTEGER NOT NULL DEFAULT 360 CHECK (second_s BETWEEN 60 AND 3600),
  ADD COLUMN IF NOT EXISTS observer_s INTEGER NOT NULL DEFAULT 180 CHECK (observer_s BETWEEN 0 AND 3600);

COMMENT ON COLUMN public.event_rounds.seating_s IS
  'P1337: seconds to find tables, fixed at start; "+1 min" during this part adds 60.';
COMMENT ON COLUMN public.event_rounds.first_s IS
  'P1337: seconds for the first speaker. Separate from second_s so a minute added later never moves this boundary.';

CREATE OR REPLACE FUNCTION public.host_start_round(
  p_event_id uuid,
  p_round_no int,
  p_group_size int,
  p_seats jsonb,
  p_seating_s int,
  p_speaker_s int,
  p_observer_s int
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
  INSERT INTO public.event_rounds (event_id, round_no, group_size, seating_s, first_s, second_s, observer_s)
  VALUES (p_event_id, p_round_no, p_group_size, p_seating_s, p_speaker_s, p_speaker_s, p_observer_s)
  RETURNING id INTO v_round;

  INSERT INTO public.event_round_seats (round_id, room_member_id, table_no, role)
  SELECT v_round, x.m, x.t, x.r FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text);

  RETURN v_round;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.host_start_round(uuid, int, int, jsonb, int, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_start_round(uuid, int, int, jsonb, int, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.host_extend_round(p_round_id uuid, p_phase text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event uuid;
  v_host uuid;
  v_ended timestamptz;
BEGIN
  SELECT r.event_id, e.host_id, r.ended_at INTO v_event, v_host, v_ended
    FROM public.event_rounds r JOIN public.events e ON e.id = r.event_id
   WHERE r.id = p_round_id;
  IF v_host IS NULL OR v_host IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'only the host can change the round''s minutes' USING ERRCODE = '42501';
  END IF;
  IF v_ended IS NOT NULL THEN
    RAISE EXCEPTION 'this round is over' USING ERRCODE = '22023';
  END IF;

  -- Same lock as Next round: a minute added while the next round starts lands on neither or one.
  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || v_event::text, 0));

  -- LEAST keeps the column CHECK from turning a tenth tap into an error; it simply stops growing.
  IF p_phase = 'seating' THEN
    UPDATE public.event_rounds SET seating_s = LEAST(seating_s + 60, 1800) WHERE id = p_round_id;
  ELSIF p_phase = 'first' THEN
    UPDATE public.event_rounds SET first_s = LEAST(first_s + 60, 3600) WHERE id = p_round_id;
  ELSIF p_phase = 'second' THEN
    UPDATE public.event_rounds SET second_s = LEAST(second_s + 60, 3600) WHERE id = p_round_id;
  ELSIF p_phase = 'observer' THEN
    UPDATE public.event_rounds SET observer_s = LEAST(observer_s + 60, 3600) WHERE id = p_round_id;
  ELSE
    RAISE EXCEPTION 'unknown part of the round: %', p_phase USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.host_extend_round(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_extend_round(uuid, text) TO authenticated;
