-- Migration: P1529 -- the "Make your Clarity Canvas" setup part before round 1 (event_canvas_setups + two host RPCs)
-- Created: 2026-11-12
-- Spec: features/p1529_canvas_event_host_coordination.md ("UAT round 2026-11-12 (b)", E5)
-- Guaranteed by: src/tests/p1529-canvas-setup.test.tsx (client); e2e/integration/p1529-db-schema.spec.ts ("canvas setup").
--
-- client-safe (P887): one new table and two new functions. Nothing existing is changed or revoked.
-- client-safe: new table and new host-only RPCs; deployed clients never call or read them, and no existing object is changed.
-- new function (host_start_canvas_setup, host_end_canvas_setup)
--
-- WHY. When the Clarity Canvas is made at the event the host runs a timed part before round 1. The host's screen, the projector and every
-- phone must agree on it, so it is one row per event: when it ends. Time running out never blocks anything: the row only drives what is
-- shown, and no other function reads it.
--
-- WHAT. event_evening_ends-shaped (one row per event, read gate can_see_event_rounds). host_start_canvas_setup(event, seconds) writes the
-- end (seconds 1..7200); host_end_canvas_setup(event) moves the end to now. Both host only, Sales Mastermind only, refused once a round exists.

BEGIN;

CREATE TABLE IF NOT EXISTS public.event_canvas_setups (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL
);
ALTER TABLE public.event_canvas_setups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_canvas_setups FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.event_canvas_setups TO authenticated;
DROP POLICY IF EXISTS "visible with the rounds" ON public.event_canvas_setups;
CREATE POLICY "visible with the rounds" ON public.event_canvas_setups
  FOR SELECT TO authenticated USING (public.can_see_event_rounds(event_id));

CREATE OR REPLACE FUNCTION public.host_start_canvas_setup(p_event uuid, p_seconds int)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host uuid;
  v_ends timestamptz;
BEGIN
  SELECT e.host_id INTO v_host FROM public.events e WHERE e.id = p_event;
  IF v_host IS NULL OR v_host IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'only the host can run the canvas setup' USING ERRCODE = '42501';
  END IF;
  IF public._event_flow(p_event) <> 'sales-mastermind' THEN
    RAISE EXCEPTION 'the canvas setup is only for the Sales Mastermind' USING ERRCODE = '22023';
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

CREATE OR REPLACE FUNCTION public.host_end_canvas_setup(p_event uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host uuid;
BEGIN
  SELECT e.host_id INTO v_host FROM public.events e WHERE e.id = p_event;
  IF v_host IS NULL OR v_host IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'only the host can run the canvas setup' USING ERRCODE = '42501';
  END IF;
  -- Idempotent: a setup already over keeps its end; no row stays as it is.
  UPDATE public.event_canvas_setups SET ends_at = clock_timestamp() WHERE event_id = p_event AND ends_at > clock_timestamp();
END;
$$;
REVOKE ALL ON FUNCTION public.host_end_canvas_setup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_end_canvas_setup(uuid) TO authenticated;

COMMIT;
