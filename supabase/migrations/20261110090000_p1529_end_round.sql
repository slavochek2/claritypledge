-- P1529 (founder, 2026-11-10): the host ends a round, and the phones can tell "between rounds" from "the evening is over".
--
-- Before: a round ended only through the next round, the canvas-update step or host_end_rounds (the evening). Clock expiry ended
-- nothing, so mics kept capturing into the round, and a round ended without an update step read on the phones as "The rounds are
-- over" because nothing marked the evening itself.
--
-- 1. event_evening_ends: one row per event, stamped by host_end_rounds (the host's "End the evening"). The phones read the evening as
--    over only while that stamp is at or after the newest round's start; a round started later (Reopen) is simply newer than the stamp.
--    Read gate: can_see_event_rounds, the same as event_canvas_update_steps (20261105200000), not "any visible event".
-- 2. host_end_rounds: same guard, same UPDATE (the ended_at trigger p1596 cuts every transcript), plus the p1337_round lock host_start_round
--    and host_end_round take (before the UPDATE, so a start cannot interleave), plus the stamp. A late retry of "End the evening" moves
--    the stamp to now (and ends any round open by then): that is the same meaning, said later.
-- 3. host_end_round: ends the newest round only. Host only, serialised on the same lock host_start_round takes, idempotent
--    (a second call, or a call with no open round, changes nothing and answers false). Refused outside the Sales Mastermind flow:
--    only that flow's phones have a "between rounds" state (a Clarity Night would read the ended round as the evening's end).
--    The existing AFTER UPDATE OF ended_at trigger creates the transcript clean jobs, exactly as for every other way a round ends.
--
-- diffed against: 20261002183700 (host_end_rounds)
-- diff: the p1337_round advisory lock first, clock_timestamp() taken after it for the rounds' ended_at, and the evening stamp insert; the guard and the UPDATE are unchanged. host_end_round is new.
-- client-safe: additive (one table, one new function); host_end_rounds keeps its signature and return.

BEGIN;

CREATE TABLE IF NOT EXISTS public.event_evening_ends (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  ended_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.event_evening_ends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_evening_ends FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.event_evening_ends TO authenticated;
DROP POLICY IF EXISTS "visible with the event" ON public.event_evening_ends;
DROP POLICY IF EXISTS "visible with the rounds" ON public.event_evening_ends;
CREATE POLICY "visible with the rounds" ON public.event_evening_ends
  FOR SELECT TO authenticated USING (public.can_see_event_rounds(event_id));

-- Same body as 20261002183700 plus the stamp.
CREATE OR REPLACE FUNCTION public.host_end_rounds(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host uuid;
  v_now timestamptz;
BEGIN
  SELECT e.host_id INTO v_host FROM public.events e WHERE e.id = p_event_id;
  IF v_host IS NULL OR v_host IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'only the host can end rounds' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || p_event_id::text, 0));
  -- The clock is read AFTER the lock: now() is the transaction's start, which can be earlier than a round started by a transaction
  -- that held the lock first, and a stamp (or an ended_at) earlier than that round's start would not end it.
  v_now := clock_timestamp();
  UPDATE public.event_rounds SET ended_at = v_now
   WHERE event_id = p_event_id AND ended_at IS NULL;
  INSERT INTO public.event_evening_ends (event_id, ended_at) VALUES (p_event_id, v_now)
  ON CONFLICT (event_id) DO UPDATE SET ended_at = EXCLUDED.ended_at;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.host_end_rounds(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_end_rounds(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.host_end_round(p_event uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host uuid;
  v_round uuid;
BEGIN
  SELECT e.host_id INTO v_host FROM public.events e WHERE e.id = p_event;
  IF v_host IS NULL OR v_host IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'only the host can end a round' USING ERRCODE = '42501';
  END IF;
  IF public._event_flow(p_event) <> 'sales-mastermind' THEN
    RAISE EXCEPTION 'ending one round is only for the Sales Mastermind' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || p_event::text, 0));
  -- The newest round only, and only if it is still open: a round ended already (here, by the update step, or by the evening's end) is left as it is.
  SELECT r.id INTO v_round FROM public.event_rounds r
   WHERE r.event_id = p_event ORDER BY r.round_no DESC LIMIT 1;
  IF v_round IS NULL THEN
    RETURN false;
  END IF;
  -- clock_timestamp() after the lock, for the same reason as in host_end_rounds: never earlier than the round's own start.
  UPDATE public.event_rounds SET ended_at = clock_timestamp() WHERE id = v_round AND ended_at IS NULL;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.host_end_round(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_end_round(uuid) TO authenticated;

COMMIT;
