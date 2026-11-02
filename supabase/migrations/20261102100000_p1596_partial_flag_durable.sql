-- P1596 review (Codex, Gemini): the missing-audio note commits with the text and survives a re-title. It was a string
-- appended by a second call: a crash between the calls lost it, and _transcribe_retitle_thread (erasure, name changes)
-- rebuilt the title without it.
--
-- client-safe: post_clean_round and _transcribe_retitle_thread are not client-callable; EXECUTE stays revoked from
--   PUBLIC, anon and authenticated. No client reads the new column.
--
-- diffed against:
--   post_clean_round            20261101140000_p1596_review_fixes.sql (same body; gains p_partial and the flag update)
--   _transcribe_retitle_thread  20261029180000_p1592_event_transcripts_round_threads.sql (same body; adds the note)
ALTER TABLE public.chat_round_threads ADD COLUMN IF NOT EXISTS audio_missing boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.mark_round_thread_partial(uuid, integer);
DROP FUNCTION IF EXISTS public.post_clean_round(uuid, integer, jsonb);

CREATE OR REPLACE FUNCTION public._transcribe_retitle_thread(p_thread uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_root    uuid;
  v_no      integer;
  v_missing boolean;
  v_names   text[];
  v_title   text;
BEGIN
  SELECT t.root_message_id, r.round_no, t.audio_missing INTO v_root, v_no, v_missing
    FROM public.chat_round_threads t JOIN public.event_rounds r ON r.id = t.round_id
   WHERE t.id = p_thread;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT array_agg(tm.display_name ORDER BY lower(tm.display_name), tm.profile_id) INTO v_names
    FROM public.chat_round_thread_members tm
   WHERE tm.thread_id = p_thread AND btrim(COALESCE(tm.display_name, '')) <> '';
  v_title := public._transcribe_round_title(v_no, COALESCE(v_names, '{}'));
  IF v_missing THEN
    v_title := v_title || ' (some of this table''s audio is missing)';
  END IF;
  UPDATE public.chat_messages m
     SET body = v_title
   WHERE m.id = v_root AND m.deleted_at IS NULL
     AND m.body IS DISTINCT FROM v_title;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_retitle_thread(uuid) FROM PUBLIC, anon, authenticated;

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
      UPDATE public.chat_round_threads SET audio_missing = true WHERE id = v_thread;
      PERFORM public._transcribe_retitle_thread(v_thread);
    END IF;
  END IF;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.post_clean_round(uuid, integer, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_clean_round(uuid, integer, jsonb, boolean) TO service_role;
