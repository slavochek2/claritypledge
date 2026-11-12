-- Migration: P1529 -- host_start_canvas_setup refuses an event whose Clarity Canvas is made before the event
-- Created: 2026-11-12
-- Spec: features/p1529_canvas_event_host_coordination.md ("UAT round 2026-11-12 (b)", E1, E5)
--
-- client-safe (P887): the function keeps its signature, grants and error codes; it only refuses one more case.
-- client-safe: host-only RPC that no deployed client calls; its signature and grants are unchanged.
-- diffed against: 20261112193000 (host_start_canvas_setup). diff: events.canvas_timing is read with the host and the function raises 22023 when it is not 'at_event'; everything else is unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION public.host_start_canvas_setup(p_event uuid, p_seconds int)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host uuid;
  v_ends timestamptz;
  v_timing text;
BEGIN
  SELECT e.host_id, e.canvas_timing INTO v_host, v_timing FROM public.events e WHERE e.id = p_event;
  IF v_host IS NULL OR v_host IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'only the host can run the canvas setup' USING ERRCODE = '42501';
  END IF;
  IF public._event_flow(p_event) <> 'sales-mastermind' THEN
    RAISE EXCEPTION 'the canvas setup is only for the Sales Mastermind' USING ERRCODE = '22023';
  END IF;
  IF v_timing IS DISTINCT FROM 'at_event' THEN
    RAISE EXCEPTION 'the canvas is made before this event, so there is no canvas setup' USING ERRCODE = '22023';
  END IF;
  IF p_seconds IS NULL OR p_seconds < 1 OR p_seconds > 7200 THEN
    RAISE EXCEPTION 'the canvas setup runs 1 second to 2 hours' USING ERRCODE = '22023';
  END IF;
  -- Same lock as the rounds: a round started meanwhile is seen below.
  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || p_event::text, 0));
  IF EXISTS (SELECT 1 FROM public.event_rounds r WHERE r.event_id = p_event) THEN
    RAISE EXCEPTION 'a round has started' USING ERRCODE = '22023';
  END IF;
  v_ends := clock_timestamp() + make_interval(secs => p_seconds);
  INSERT INTO public.event_canvas_setups (event_id, started_at, ends_at) VALUES (p_event, clock_timestamp(), v_ends)
  ON CONFLICT (event_id) DO UPDATE SET started_at = EXCLUDED.started_at, ends_at = EXCLUDED.ends_at;
  RETURN v_ends;
END;
$$;
REVOKE ALL ON FUNCTION public.host_start_canvas_setup(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_start_canvas_setup(uuid, int) TO authenticated;

COMMIT;
