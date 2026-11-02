-- P1596 review (Opus): the note's retitle takes the thread lock its contract requires. Without it a retry could read a
-- name, block on an erasure's row lock, and write the erased name back.
--
-- client-safe: post_clean_round is service-role only; EXECUTE stays revoked from PUBLIC, anon and authenticated.
--
-- diffed against:
--   post_clean_round  20261102100000_p1596_partial_flag_durable.sql (same body; adds the thread lock before the flag)
CREATE OR REPLACE FUNCTION public.post_clean_round(p_job_id uuid, p_attempt integer, p_items jsonb, p_partial boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job    public.transcribe_round_clean_jobs;
  v_p      uuid;
  v_i      record;
  v_n      integer := 0;
  v_thread uuid;
BEGIN
  SELECT j.* INTO v_job FROM public.transcribe_round_clean_jobs j WHERE j.id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'processing' OR v_job.attempts IS DISTINCT FROM p_attempt THEN
    RAISE EXCEPTION 'clean post: stale or unclaimed job' USING ERRCODE = '22023';
  END IF;
  IF NOT public._transcribe_clean_enabled() THEN
    RAISE EXCEPTION 'clean post: posting is switched off' USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'clean post: items must be an array' USING ERRCODE = '22023';
  END IF;

  -- all speaker locks first, in profile-id order (see LOCK ORDER in 20261101140000)
  FOR v_p IN
    SELECT DISTINCT m.profile_id
      FROM jsonb_array_elements(p_items) it
      JOIN public.transcribe_room_members m ON m.id = (it ->> 'member_id')::uuid
     WHERE m.profile_id IS NOT NULL
     ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('p1592:speaker:' || v_p::text, 0));
  END LOOP;

  FOR v_i IN
    SELECT (it ->> 'member_id')::uuid AS member_id, (it ->> 'chunk_ms')::bigint AS chunk_ms, it ->> 'text' AS txt
      FROM jsonb_array_elements(p_items) it
     ORDER BY (it ->> 'chunk_ms')::bigint, (it ->> 'member_id')
  LOOP
    IF public._post_clean_round_item(p_job_id, v_i.member_id, v_i.chunk_ms, v_i.txt) IS NOT NULL THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;

  -- The note commits with the text. A retry that posts nothing new still lands here.
  IF p_partial AND v_job.kind = 'round' THEN
    SELECT t.id INTO v_thread FROM public.chat_round_threads t
     WHERE t.round_id = v_job.round_id AND t.table_no = v_job.table_no;
    IF v_thread IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('p1592:thread:' || v_job.round_id::text || ':' || v_job.table_no::text, 0));
      UPDATE public.chat_round_threads SET audio_missing = true WHERE id = v_thread;
      PERFORM public._transcribe_retitle_thread(v_thread);
    END IF;
  END IF;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.post_clean_round(uuid, integer, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_clean_round(uuid, integer, jsonb, boolean) TO service_role;
