-- Migration: P1529 — "+1 min" still works once the clock has run out, while the round is open
-- Created: 2026-11-10
-- Spec: features/p1529_canvas_event_host_coordination.md (founder UAT, 2026-11-10: the host may give more time after time is up)
-- Guaranteed by: e2e/integration/p1337-event-rounds-db.spec.ts ("minutes per round")
--
-- WHY. host_extend_round refused with "time is up for this round" the moment the clock ran out, although the round stayed open until the
-- host ended it (nothing ends a round on its own). The host screen now offers "+1 min" after time is up.
--
-- WHAT. Past the end of an OPEN round the last part is extended instead of refused: the observer's when an observer is seated AND
-- observer_s > 0, else the end of the talking part (second_s; with the split off that is the shared part's end). The new length makes ONE
-- MINUTE REMAIN from now (elapsed past the end + 60 s), so the clock runs again. Where that would pass the column maximum (3600 s), or a
-- running part is already at its maximum (seating 1800 s, others 3600 s), the call raises 'this round cannot be extended further' with
-- errcode 54000, so the host screen can say so (before, a running part at its maximum succeeded and changed nothing). Every other guard is
-- unchanged: host only (42501), the round's own event, an ended round is refused (22023), the p1337_round lock first, a running part not
-- at its maximum is extended by 60 s as before.
--
-- diffed against: 20261005090000 (host_extend_round)
-- diff: (1) DECLARE gains `v_over boolean := false` and `v_new int`. (2) The final ELSE of the part chain no longer RAISEs 'time is up for
--   this round'; it sets v_over := true and v_part := observer (when an observer is seated and observer_s > 0) or second. (3) A new
--   `IF v_over THEN ... RETURN; END IF;` block after the chain computes v_new = old seconds + whole seconds past the end + 60, raises
--   54000 when v_new > 3600, else stores it. (4) Before the existing LEAST updates, a running part already at its maximum raises 54000.
--   The LEAST updates, the guards, the lock and the grants are byte-identical.
-- client-safe: same signature and grants; a call past the end of an open round changes from error 22023 to success, and a call at a part's
--   maximum from a silent no-op to error 54000.

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
  v_over boolean := false;
  v_new int;
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
    -- The clock has run out but the round is still open (ended_at IS NULL, checked above under the lock): the host may give more time.
    -- The round's last part is extended: the observer's when an observer is seated AND the observer part has minutes, else the end of the
    -- talking part (second_s, which also ends the shared part when the split is off). It is set so ONE MINUTE REMAINS from now.
    v_over := true;
    v_part := CASE WHEN v_has_observer AND v_round.observer_s > 0 THEN 'observer' ELSE 'second' END;
  END IF;

  IF v_over THEN
    IF v_part = 'observer' THEN
      v_new := v_round.observer_s + ceil(v_elapsed - (v_round.seating_s + v_round.first_s + v_round.second_s + v_round.observer_s))::int + 60;
    ELSE
      v_new := v_round.second_s + ceil(v_elapsed - (v_round.seating_s + v_round.first_s + v_round.second_s))::int + 60;
    END IF;
    -- Past the column's 3600 s the clock could not run again: a distinct refusal (54000) the host screen words, never a silent success.
    IF v_new > 3600 THEN
      RAISE EXCEPTION 'this round cannot be extended further' USING ERRCODE = '54000';
    END IF;
    IF v_part = 'observer' THEN
      UPDATE public.event_rounds SET observer_s = v_new WHERE id = p_round_id;
    ELSE
      UPDATE public.event_rounds SET second_s = v_new WHERE id = p_round_id;
    END IF;
    RETURN;
  END IF;

  -- A running part already at its column maximum cannot grow: the same distinct refusal (it used to succeed and change nothing).
  IF (v_part = 'seating' AND v_round.seating_s >= 1800) OR (v_part = 'first' AND v_round.first_s >= 3600)
     OR (v_part = 'second' AND v_round.second_s >= 3600) OR (v_part = 'observer' AND v_round.observer_s >= 3600) THEN
    RAISE EXCEPTION 'this round cannot be extended further' USING ERRCODE = '54000';
  END IF;

  -- LEAST keeps the column CHECK when fewer than 60 s of room are left.
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
