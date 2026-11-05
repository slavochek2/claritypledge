-- P1529 D23: tells the drafting worker a run came from "Make my next version".
-- new function
-- client-safe: one new function, service role only. Only the tap's own run counts: an owner's later message on the
-- same draft keeps the strict rule, and so does a retry (known limitation).
BEGIN;
CREATE OR REPLACE FUNCTION public._canvas_run_is_round_update(p_run uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.canvas_draft_runs r
      JOIN public.event_next_version_taps t ON t.draft_id = r.draft_id
     WHERE r.id = p_run AND r.client_id = public._p1529_derived_id(t.round_id, r.draft_id, 'run'));
$$;
REVOKE ALL ON FUNCTION public._canvas_run_is_round_update(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_run_is_round_update(uuid) TO service_role;
COMMIT;
