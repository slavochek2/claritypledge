-- P1596 (founder, 2026-11-02): a table where someone's audio is missing still gets what exists, and its thread's
-- title says so. Called by the batch worker with its claim's attempt number; repeated calls change nothing.
--
-- client-safe: service-role only; EXECUTE is revoked from PUBLIC, anon and authenticated.
-- new function
CREATE OR REPLACE FUNCTION public.mark_round_thread_partial(p_job_id uuid, p_attempt integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_note constant text := ' (some of this table''s audio is missing)';
  v_job public.transcribe_round_clean_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.transcribe_round_clean_jobs j WHERE j.id = p_job_id;
  IF NOT FOUND OR v_job.status <> 'processing' OR v_job.attempts <> p_attempt OR v_job.kind <> 'round' THEN
    RETURN;
  END IF;
  UPDATE public.chat_messages m
     SET body = m.body || c_note
    FROM public.chat_round_threads t
   WHERE t.event_id = v_job.event_id
     AND t.round_id = v_job.round_id
     AND t.table_no = v_job.table_no
     AND m.id = t.root_message_id
     AND m.deleted_at IS NULL
     AND right(m.body, char_length(c_note)) <> c_note;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_round_thread_partial(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_round_thread_partial(uuid, integer) TO service_role;
