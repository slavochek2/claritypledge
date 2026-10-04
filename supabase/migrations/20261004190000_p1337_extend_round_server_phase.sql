-- Migration: P1337 — "+1 min" decides the running part on the server, under the lock
-- Created: 2026-10-04
-- Spec: features/p1337_event_journey_on_screen_steps_rotation_and_ending.md §6 (founder walkthrough 4)
-- Guaranteed by: e2e/integration/p1337-event-rounds-db.spec.ts ("minutes per round")
--
-- WHY (Codex review of 20261004183000):
--   1. host_extend_round read ended_at BEFORE taking the round lock. A "+1 min" waiting on the lock
--      while "Next round" closed the round then extended the closed round and reported success.
--   2. It trusted the part the client named. A tap made just before a boundary can arrive just
--      after it; extending the part that already ended moves the clock BACK into that part.
--
-- WHAT. Same signature. The lock comes first; then the round is re-read; then the part running now
-- is computed from started_at and the stored seconds — the same arithmetic as src/lib/round-clock.ts
-- (seating, first, second, then observer only when the round seats an observer). p_phase is kept for
-- the signature and still validated, but the server's part is the one extended. Past the end of the
-- round there is nothing to extend: refused.
--
-- new function: none (replaces host_extend_round(uuid, text) from 20261004183000).
-- client-safe: same signature and grants; behaviour changes only at a part boundary or a closed round.

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

  IF v_elapsed < v_round.seating_s THEN
    v_part := 'seating';
  ELSIF v_elapsed < v_round.seating_s + v_round.first_s THEN
    v_part := 'first';
  ELSIF v_elapsed < v_round.seating_s + v_round.first_s + v_round.second_s THEN
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
