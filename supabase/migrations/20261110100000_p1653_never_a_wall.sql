-- P1653: the canvas agent is never a wall. Server half.
--
-- diffed against: 20261102110100_p1536_x9_review_fixes.sql (_canvas_draft_expire: that body with the two reply sentences below and nothing else);
--   20261103010000_p1536_server_review_fixes.sql (_canvas_draft_run_complete, read for the guards this file's question completion repeats: owner, lock order,
--   cancelled, not running, settle, closed draft; it is NOT redefined).
-- client-safe: three new service-role functions and one function body whose only change is a reply posted for a run it already failed. No signature, no
--   grant a client can reach, no existing answer changes.
--
-- 1. A run that asks a follow-up completes as a FINISHED run with nothing changed (F1), so the owner's message stays in later runs (the shared input selector
--    reads done runs, and it is not changed). `_canvas_draft_run_complete_question` is its own function, not `_canvas_draft_run_complete` with no actions:
--    that function takes the first-draft branch on an empty, focus-less draft and inserts an Undo step (a step per run whose scope is not empty), so a question
--    would show an Undo control for a canvas nothing changed on. This one writes NO step, no point, no question, no link, no offer and no focus: the draft
--    stays exactly as the first draft it was, and the answer run is a first draft again. It counts as 1 of the draft's used runs, like any finished run.
-- 2. `abandoned` and `transcript_failed` (the expire step) now post the approved words into an open draft's thread, carrying the run id (so the bubble can
--    offer Try again, which the client shows by the run's code). Before, the owner saw only a Try again button.
-- 3. `_canvas_draft_fail_reply`: posts words for a run the database already failed without one (`not_offered` at complete, `transcript_failed` at begin), once.
-- 4. `_canvas_draft_remove_material`: "Not mine" takes a page out of the draft's material, so a later run does not read it. Link rows only, of the run's draft.

CREATE OR REPLACE FUNCTION public._canvas_draft_run_complete_question(p_run uuid, p_owner uuid, p_reply text, p_usd numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run      public.canvas_draft_runs;
  v_d        public.canvas_drafts;
  v_full     numeric;
  v_reply    text;
  v_reply_id uuid;
BEGIN
  IF p_run IS NULL OR p_owner IS NULL THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run;
  IF NOT FOUND OR v_run.owner_id IS DISTINCT FROM p_owner THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_run.owner_id::text, 0));
  PERFORM public._canvas_draft_expire(v_run.owner_id);
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = v_run.draft_id FOR UPDATE;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run FOR UPDATE;
  IF v_run.state = 'cancelled' THEN
    SELECT s.reserved_usd INTO v_full FROM public.mirror_ai_spend s WHERE s.id = v_run.spend_id;
    PERFORM public._mirror_settle(v_run.spend_id, COALESCE(p_usd, v_full));   -- erased: the call was made, nothing is written
    RETURN jsonb_build_object('status', 'gone', 'state', 'cancelled');
  END IF;
  IF v_run.state <> 'running' OR v_run.kind <> 'message' THEN
    RETURN jsonb_build_object('status', 'gone', 'state', v_run.state);
  END IF;
  v_reply := NULLIF(btrim(COALESCE(p_reply, '')), '');
  IF v_reply IS NULL THEN
    RAISE EXCEPTION 'canvas draft: a question needs words' USING ERRCODE = '22023';
  END IF;

  SELECT s.reserved_usd INTO v_full FROM public.mirror_ai_spend s WHERE s.id = v_run.spend_id;
  PERFORM public._mirror_settle(v_run.spend_id, COALESCE(p_usd, v_full));
  IF v_d.state <> 'open' THEN
    UPDATE public.canvas_draft_runs r SET state = 'failed', error_code = 'draft_closed', finished_at = now() WHERE r.id = p_run;
    RETURN jsonb_build_object('status', 'gone', 'state', 'failed', 'error_code', 'draft_closed');
  END IF;

  -- the reply, carrying the run id; then the run is done with an empty scope. Nothing else is written: no step (nothing to Undo), no point, no focus.
  v_reply_id := public._canvas_draft_post_reply(v_d.conversation_id, v_d.thread_root_id, v_reply, v_run.derived_refs, v_run.id);
  UPDATE public.canvas_draft_runs r
     SET state = 'done', finished_at = now(), scope = '{}', reply_message_id = v_reply_id
   WHERE r.id = v_run.id;
  UPDATE public.canvas_drafts d SET revision = d.revision + 1, run_count = d.run_count + 1 WHERE d.id = v_d.id;
  RETURN jsonb_build_object(
    'status', 'ok', 'applied', false, 'scope', '[]'::jsonb, 'reply_message_id', v_reply_id,
    'revision', (SELECT d.revision FROM public.canvas_drafts d WHERE d.id = v_d.id), 'version', v_d.version_name);
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_run_complete_question(uuid, uuid, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_run_complete_question(uuid, uuid, text, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public._canvas_draft_fail_reply(p_run uuid, p_owner uuid, p_reply text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.canvas_draft_runs;
  v_d   public.canvas_drafts;
  v_id  uuid;
BEGIN
  IF p_run IS NULL OR p_owner IS NULL OR NULLIF(btrim(COALESCE(p_reply, '')), '') IS NULL THEN
    RETURN false;
  END IF;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run;
  IF NOT FOUND OR v_run.owner_id IS DISTINCT FROM p_owner THEN
    RETURN false;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_run.owner_id::text, 0));
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = v_run.draft_id FOR UPDATE;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run FOR UPDATE;
  -- only a run that failed and has said nothing, on an open draft, and only the kinds a v6 thread shows
  IF v_run.state <> 'failed' OR v_run.reply_message_id IS NOT NULL OR v_d.state <> 'open' OR v_run.kind NOT IN ('message', 'focus', 'fork_first') THEN
    RETURN false;
  END IF;
  v_id := public._canvas_draft_post_reply(v_d.conversation_id, v_d.thread_root_id, p_reply, v_run.derived_refs, v_run.id);
  UPDATE public.canvas_draft_runs r SET reply_message_id = v_id WHERE r.id = p_run;
  RETURN v_id IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_fail_reply(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_fail_reply(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public._canvas_draft_remove_material(p_run uuid, p_owner uuid, p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.canvas_draft_runs;
  n     integer;
BEGIN
  IF p_run IS NULL OR p_owner IS NULL OR p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN 0;
  END IF;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run;
  IF NOT FOUND OR v_run.owner_id IS DISTINCT FROM p_owner THEN
    RETURN 0;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_run.owner_id::text, 0));
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run FOR UPDATE;
  IF v_run.state <> 'running' THEN
    RETURN 0;
  END IF;
  DELETE FROM public.canvas_draft_material m
   WHERE m.draft_id = v_run.draft_id AND m.owner_id = p_owner AND m.kind = 'link' AND m.id = ANY (p_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_remove_material(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_remove_material(uuid, uuid, uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public._canvas_draft_expire(p_owner uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_queued  CONSTANT interval := interval '3 minutes';
  c_running CONSTANT interval := interval '5 minutes';
  -- X9: how long a voice run may wait for its transcript. The transcript job tries 3 times, 2 minutes apart at the earliest, on a 5-minute sweep, and
  -- a final failure settles the run at once, so every path that can still deliver a transcript is over well inside this.
  c_voice_wait CONSTANT interval := interval '30 minutes';
  v_c   record;
  v_run public.canvas_draft_runs;
  v_d   public.canvas_drafts;
  v_id  uuid;
  n     integer := 0;
BEGIN
  -- X9: a voice run whose transcript has landed but whose dispatch lease has no start (the trigger did not stamp it: a retried run, a run made before
  -- the stamp existed, a stamp that could not take its lock) starts that lease now, so it is never failed for the time it spent waiting.
  UPDATE public.canvas_draft_runs r SET ready_at = now()
   WHERE r.owner_id = p_owner AND r.state = 'queued' AND r.input_kind = 'voice' AND r.ready_at IS NULL
     AND EXISTS (SELECT 1 FROM public.chat_messages t
                  WHERE t.id = r.trigger_message_id AND t.transcript_status = 'done' AND btrim(COALESCE(t.transcript, '')) <> '');
  FOR v_c IN
    SELECT r.id, r.draft_id, r.state,
           (r.state = 'queued' AND r.input_kind = 'voice' AND t.id IS NOT NULL
            AND (t.transcript_status = 'failed'
                 OR (t.transcript_status = 'done' AND btrim(COALESCE(t.transcript, '')) = ''))) AS voice_failed
      FROM public.canvas_draft_runs r
      LEFT JOIN public.chat_messages t ON t.id = r.trigger_message_id
     WHERE r.owner_id = p_owner AND r.state IN ('queued', 'running')
       AND ((r.state = 'queued' AND r.input_kind <> 'voice' AND r.created_at < now() - c_queued)
         OR (r.state = 'queued' AND r.input_kind = 'voice' AND r.ready_at IS NOT NULL AND r.ready_at < now() - c_queued)
         OR (r.state = 'queued' AND r.input_kind = 'voice' AND r.ready_at IS NULL AND r.created_at < now() - c_voice_wait)
         OR (r.state = 'running' AND COALESCE(r.started_at, r.created_at) < now() - c_running)
         OR (r.state = 'queued' AND r.input_kind = 'voice' AND t.id IS NOT NULL
             AND (t.transcript_status = 'failed'
                  OR (t.transcript_status = 'done' AND btrim(COALESCE(t.transcript, '')) = ''))))
     ORDER BY r.created_at, r.id
  LOOP
    -- draft row first, then the run row
    SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = v_c.draft_id FOR UPDATE;
    SELECT r.* INTO v_run FROM public.canvas_draft_runs r
     WHERE r.id = v_c.id AND r.state IN ('queued', 'running') FOR UPDATE;
    CONTINUE WHEN NOT FOUND;
    IF v_run.state = 'running' AND v_run.spend_id IS NOT NULL THEN
      UPDATE public.mirror_ai_spend s SET actual_usd = s.reserved_usd, state = 'settled', settled_at = now()
       WHERE s.id = v_run.spend_id AND s.state = 'reserved';
    END IF;
    UPDATE public.canvas_draft_runs r
       SET state = 'failed', error_code = CASE WHEN v_c.voice_failed THEN 'transcript_failed' ELSE 'abandoned' END,
           finished_at = now()
     WHERE r.id = v_run.id;
    -- a v6 run moves the revision; an expired LEGACY run must not (a draft with revision > 0 is a v6 draft)
    IF v_run.kind IN ('message', 'focus', 'fork_first') THEN
      UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_run.draft_id;
      -- P1653: the owner is told, in an open thread, with the run id so the bubble can offer Try again (the approved words)
      IF v_d.state = 'open' THEN
        v_id := public._canvas_draft_post_reply(
          v_d.conversation_id, v_d.thread_root_id,
          CASE WHEN v_c.voice_failed THEN 'I could not make out that voice note, so nothing changed on the canvas. Record it again or type it.'
               ELSE 'That did not finish, so nothing changed on the canvas. Try again.' END,
          v_run.derived_refs, v_run.id);
        UPDATE public.canvas_draft_runs r SET reply_message_id = v_id WHERE r.id = v_run.id;
      END IF;
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_expire(uuid) FROM PUBLIC, anon, authenticated;
