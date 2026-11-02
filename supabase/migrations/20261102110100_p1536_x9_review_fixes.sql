-- P1536 section 3c, X9 review fixes (adversarial and external review of 4b9771a30). The applied migration 20261102100100 stays as it is.
--
-- diffed against: 20261030080000_p1536_v6_engine.sql (_canvas_draft_expire: its v6 body with the voice-run lease below and nothing else);
--   20261102100100_p1536_x9_voice_notes.sql (_canvas_voice_transcript_settled: that body plus the lease stamp; canvas_voice_send: that body with
--   search_path '' and the key check on every result).
-- client-safe: one nullable column, two column grants (a client may now read a run's input_kind and ready_at), and three function bodies. No
--   signature, no existing grant or answer changes for a client. A run that is not a voice run expires exactly as before.
--
-- 1. A voice run waits for its transcript. The v6 expire step failed any queued run 3 minutes after it was made. A voice run's transcript is made by a
--    job that retries (3 attempts, at least 2 minutes apart, on a 5-minute sweep), so a transcript that landed on its second attempt landed on a run the
--    next engine call had already failed as 'abandoned' (reproduced on the test project: a 5-minute-old waiting run is failed by the first state read).
--    Now:
--      * a voice run still waiting for its transcript is not expired for age until it has waited 30 minutes (every route that can still deliver a
--        transcript is over well inside that; a final failure settles the run at once, as before, and a failed or blank transcript still fails it
--        with no model call and no charge);
--      * the dispatch lease (3 minutes) starts when the transcript LANDS: the trigger stamps canvas_draft_runs.ready_at, and the expire step stamps any
--        landed run the trigger could not (a retried run, a run made before this fix);
--      * a run that is not a voice run is unchanged: 3 minutes from creation. _canvas_draft_expire_all selects owners by creation age, a superset of
--        everything above, so it needs no change.
--    input_kind and ready_at are readable by the run's owner (column grant), so the client's own lease arithmetic can match the server's.
-- 2. canvas_voice_send: SET search_path = '' (every object it names was already schema-qualified), and the stored-key check now runs on a repeat as
--    well: the expected key is derived from the message the send returned (conversation, author, client id), so a repeat with another key is refused and
--    a legitimate repeat still returns the first result.

ALTER TABLE public.canvas_draft_runs ADD COLUMN IF NOT EXISTS ready_at timestamptz;
GRANT SELECT (input_kind, ready_at) ON public.canvas_draft_runs TO authenticated;

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
    PERFORM 1 FROM public.canvas_drafts d WHERE d.id = v_c.draft_id FOR UPDATE;
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
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_expire(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._canvas_voice_transcript_settled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run    uuid;
  v_owner  uuid;
  v_url    text;
  v_secret text;
  v_jwt    text;
BEGIN
  BEGIN
    SELECT r.id, r.owner_id INTO v_run, v_owner
      FROM public.canvas_draft_runs r
     WHERE r.trigger_message_id = NEW.id AND r.input_kind = 'voice' AND r.state = 'queued'
     ORDER BY r.created_at DESC LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_canvas_voice_transcript_settled: run lookup failed (sqlstate %), transcript write kept', SQLSTATE;
    RETURN NEW;
  END;
  IF v_run IS NULL THEN
    RETURN NEW; -- not a canvas voice note, or its run already began, ended or was never queued
  END IF;

  -- a failed transcript (or a blank one) fails the run now: no model call, no charge
  IF NEW.transcript_status = 'failed' OR btrim(COALESCE(NEW.transcript, '')) = '' THEN
    BEGIN
      IF pg_try_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_owner::text, 0)) THEN
        PERFORM public._canvas_draft_expire(v_owner);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '_canvas_voice_transcript_settled: settle failed (sqlstate %), the next engine call settles it', SQLSTATE;
    END;
    RETURN NEW;
  END IF;

  -- the dispatch lease starts when the transcript lands, not when the run was made (the wait for a transcript can be minutes). A run row another
  -- statement holds is skipped: the next engine call stamps it (_canvas_draft_expire), so this can never wait on a lock.
  BEGIN
    UPDATE public.canvas_draft_runs r SET ready_at = now()
     WHERE r.id = (SELECT q.id FROM public.canvas_draft_runs q WHERE q.id = v_run AND q.state = 'queued' AND q.ready_at IS NULL FOR UPDATE SKIP LOCKED);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_canvas_voice_transcript_settled: lease stamp failed (sqlstate %), the next engine call stamps it', SQLSTATE;
  END;

  -- a SEPARATE block: a failed dispatch must not undo anything above, and leaves the run queued for the client's start or the lease
  BEGIN
    SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'canvas_draft_url';
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'canvas_draft_internal_secret';
    SELECT decrypted_secret INTO v_jwt    FROM vault.decrypted_secrets WHERE name = 'chat_voice_anon_key';
    IF v_url IS NULL OR v_secret IS NULL OR v_jwt IS NULL THEN
      RAISE WARNING '_canvas_voice_transcript_settled: vault config missing (url: %, secret: %, jwt: %), run left queued',
        (v_url IS NOT NULL), (v_secret IS NOT NULL), (v_jwt IS NOT NULL);
      RETURN NEW;
    END IF;
    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
                   'Content-Type',            'application/json',
                   'Authorization',           'Bearer ' || v_jwt,
                   'x-canvas-draft-internal', v_secret),
      body    := jsonb_build_object('run_id', v_run, 'owner_id', v_owner),
      timeout_milliseconds := 30000);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_canvas_voice_transcript_settled: dispatch failed (sqlstate %), run left queued', SQLSTATE;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_voice_transcript_settled() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.canvas_voice_send(
  p_uid uuid, p_canvas uuid, p_from_version uuid, p_expected_draft uuid, p_expected_revision integer, p_replace boolean,
  p_box_refs text[], p_object_key text, p_duration_ms integer, p_waveform jsonb, p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub    text := current_setting('request.jwt.claim.sub', true);
  v_claims text := current_setting('request.jwt.claims', true);
  v_res    jsonb;
  v_expect text;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF p_object_key IS NULL OR p_duration_ms IS NULL THEN
    RAISE EXCEPTION 'canvas send: bad voice note' USING ERRCODE = '22023';
  END IF;

  -- act as p_uid for this transaction only (restored below); the role claim is the service role's, which is what its caller really is
  -- (the grant above) and what canvas_workspace_send reads before it accepts a voice attachment
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_uid::text, 'role', 'service_role')::text, true);

  v_res := public.canvas_workspace_send(
    p_canvas, p_from_version, p_expected_draft, p_expected_revision, p_replace, NULL, p_box_refs,
    jsonb_strip_nulls(jsonb_build_object('kind', 'voice', 'duration_ms', p_duration_ms, 'waveform', p_waveform)), p_client_id);

  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_sub, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_claims, ''), true);

  -- The note must be stored under the key chat-voice validated, on a repeat as well as a first write: the key canvas_workspace_send derives is the
  -- conversation, the owner and the client id of the message it made or returned. Anything else refuses the call (and rolls back what it wrote); a
  -- legitimate repeat has the same key, so it still returns the first result, even after a final transcript failure deleted the audio row.
  IF v_res ->> 'status' = 'ok' THEN
    SELECT lower(m.conversation_id::text) || '/' || lower(m.author_id::text) || '/' || lower(m.client_id::text) || '.wav'
      INTO v_expect FROM public.chat_messages m WHERE m.id = (v_res ->> 'message_id')::uuid;
    IF v_expect IS DISTINCT FROM p_object_key THEN
      RAISE EXCEPTION 'canvas send: that voice note is stored under another key' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN v_res;
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_voice_send(uuid, uuid, uuid, uuid, integer, boolean, text[], text, integer, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_voice_send(uuid, uuid, uuid, uuid, integer, boolean, text[], text, integer, jsonb, uuid)
  TO service_role;
