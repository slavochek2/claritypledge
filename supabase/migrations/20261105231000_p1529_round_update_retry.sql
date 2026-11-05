-- P1529 D23: Try again on a failed "Make my next version" keeps the round-update mode.
-- diffed against: 20261105230000_p1529_round_update_flag.sql (_canvas_run_is_round_update).
-- client-safe: same signature, service role only. A retry keeps the failed run's trigger message (canvas_draft_retry) and takes a
-- new client id, so the mode now follows the tap's trigger message. An owner's later message on the draft has its own trigger
-- and keeps the strict rule.
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
      JOIN public.canvas_draft_runs tap ON tap.draft_id = r.draft_id
       AND tap.client_id = public._p1529_derived_id(t.round_id, r.draft_id, 'run')
     WHERE r.id = p_run AND r.trigger_message_id IS NOT NULL AND r.trigger_message_id = tap.trigger_message_id);
$$;
REVOKE ALL ON FUNCTION public._canvas_run_is_round_update(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_run_is_round_update(uuid) TO service_role;
COMMIT;
