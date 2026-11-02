-- P1536 section 3c, X9: voice notes in every canvas thread.
--
-- diffed against: 20261030080000_p1536_v6_engine.sql (canvas_workspace_send: its v6 body with ONE gate added at the start of the voice branch,
--   nothing else; every v6 guard stays). canvas_voice_send and the trigger in 3. are new; the trigger is built from _mirror_voice_start_reply
--   (20261027120700, P1576): the same vault read, the same two exception blocks, the same pg_net call. No later migration defines
--   canvas_workspace_send (checked: the v6 engine is the only earlier body).
-- client-safe: canvas_workspace_send keeps its name, argument list, grants and every answer for a text or file message; the only change is that a
--   {kind:'voice'} attachment from a client is now refused (42501) before anything is written. No client sends one (the voice button goes through
--   chat-voice, deployed with this migration), so a deployed client is unaffected. canvas_voice_send is service-role only.
--
-- 1. ONE copy of the send, and a voice note is only ever made by the voice commit. canvas_voice_send(p_uid, ...) is what chat-voice calls after it
--    has validated the STORED bytes. It does not re-implement the send: for the length of its own transaction it makes auth.uid() the id it was
--    given and the role claim 'service_role' (the standard request.jwt.claims settings, transaction-local and restored before it returns),
--    then calls canvas_workspace_send itself. So every guard of that function (sign in, ownership of the canvas and version, the client id,
--    the box tags, the voice shape, the draft cap) applies to a voice note exactly as it does to a typed message.
--    canvas_workspace_send refuses a {kind:'voice'} attachment unless that role claim is 'service_role'. A signed-in client cannot make the claim:
--    PostgREST fills request.jwt.claims from the verified token, and a client's token says 'authenticated'. This is the trust root every
--    auth.uid() policy in the database already stands on; no new flag or setting is introduced (the repo removed its client-settable set_config()
--    for exactly that reason: 20260403130000). The refusal comes before the lock and before any write, so a refused note leaves no draft, thread,
--    message or run.
--    canvas_voice_send is granted to the service role alone and acts for p_uid only: a canvas, version or draft that is not p_uid's is the
--    same 42501 as for any user. The object key chat-voice validated must be the one the note was stored under (the key canvas_workspace_send
--    derives from the draft's conversation, the owner and the client id), or the whole send is refused and rolls back, a draft it just made included.
-- 3. (section 3 below) The run begins when the transcript lands. An AFTER UPDATE trigger on chat_messages.transcript_status, for the QUEUED voice run of
--    that message:
--      done   -> calls canvas-draft's internal route over pg_net, with the run id and its owner's id (the run's begin proves the pair).
--                The route begins the run (P1576's pattern for the mirror reply: the server owns the trigger, the browser only shows status).
--      failed (or a blank transcript) -> settles the run in the database through _canvas_draft_expire, which already fails exactly this
--                case ('transcript_failed') with no model call and no charge and moves the draft's revision. The owner's engine lock is
--                only TRIED, so the transcript write never waits on, or deadlocks with, an engine RPC; when it is busy, the next RPC's
--                own expire step settles it.
--    Neither branch can fail the transcript write: every statement is in an exception block that turns an error into a WARNING.
--    A dispatch that fails or never arrives leaves the run queued: the client's start request (use-canvas-thread) or the lease expiry
--    (3 minutes) recovers it.
--
-- Vault secrets read at RUN time (names; values are never in a migration):
--   canvas_draft_url              the canvas-draft function URL
--   canvas_draft_internal_secret  equals the CANVAS_DRAFT_INTERNAL_SECRET env on canvas-draft (sent as x-canvas-draft-internal)
--   chat_voice_anon_key           REUSED (the project anon key, the gateway JWT), as the mirror trigger does
-- Any missing -> RAISE WARNING and return: the run stays queued.

-- ============================================================================
-- 1. The send: v6 plus the voice gate
-- ============================================================================
CREATE OR REPLACE FUNCTION public.canvas_workspace_send(
  p_canvas uuid, p_from_version uuid, p_expected_draft uuid, p_expected_revision integer, p_replace boolean,
  p_body text, p_box_refs text[], p_attachment jsonb, p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_open CONSTANT integer := 10;
  c_cap      CONSTANT integer := 30;
  v_uid    uuid := auth.uid();
  v_body   text := NULLIF(btrim(COALESCE(p_body, '')), '');
  v_refs   text[];
  v_att    text;
  v_label  text;
  v_input  text := 'text';
  v_canvas public.canvases;
  v_d      public.canvas_drafts;
  v_have   boolean := false;
  v_prev   uuid;
  v_code   text;
  v_msg    public.chat_messages;
  v_run    uuid;
  v_rev    integer;
  v_key    text;
  v_wave   smallint[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = v_uid AND pr.is_verified = true) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'canvas send: a client id is required' USING ERRCODE = '22023';
  END IF;
  IF char_length(COALESCE(v_body, '')) > 4000 THEN
    RAISE EXCEPTION 'canvas send: message too long' USING ERRCODE = '22023';
  END IF;
  IF p_box_refs IS NOT NULL AND cardinality(p_box_refs) > 0 THEN
    IF NOT (p_box_refs <@ public._canvas_box_tags()) THEN
      RAISE EXCEPTION 'canvas send: unknown box tag' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(DISTINCT b ORDER BY b) INTO v_refs FROM unnest(p_box_refs) b;
  END IF;
  IF p_attachment IS NOT NULL THEN
    IF jsonb_typeof(p_attachment) <> 'object' OR COALESCE(p_attachment ->> 'kind', '') NOT IN ('file', 'voice') THEN
      RAISE EXCEPTION 'canvas send: bad attachment' USING ERRCODE = '22023';
    END IF;
    v_att := p_attachment ->> 'kind';
    IF v_att = 'file' THEN
      v_label := NULLIF(left(btrim(COALESCE(p_attachment ->> 'label', '')), 200), '');
      IF v_label IS NULL THEN
        RAISE EXCEPTION 'canvas send: a file needs a label' USING ERRCODE = '22023';
      END IF;
      v_input := 'file';
    ELSE
      -- X9: a voice note is made only by the voice commit (canvas_voice_send, called by chat-voice with the service role after it has read the
      -- stored bytes). The role claim is the one a client's signed token cannot carry, so this is exactly as strong as every auth.uid() policy.
      IF COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'canvas send: a voice note arrives only through the voice commit' USING ERRCODE = '42501';
      END IF;
      IF v_body IS NOT NULL OR COALESCE(p_attachment ->> 'duration_ms', '') !~ '^[0-9]{1,6}$' THEN
        RAISE EXCEPTION 'canvas send: bad voice note' USING ERRCODE = '22023';
      END IF;
      v_input := 'voice';
    END IF;
  ELSIF v_body IS NULL THEN
    RAISE EXCEPTION 'canvas send: empty message' USING ERRCODE = '22023';
  END IF;
  IF p_canvas IS NULL AND (p_from_version IS NOT NULL OR p_expected_draft IS NOT NULL OR COALESCE(p_replace, false)) THEN
    RAISE EXCEPTION 'canvas send: a new canvas has no version or draft' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));
  PERFORM public._canvas_draft_expire(v_uid);

  -- a repeat: the first result (with the draft's CURRENT revision), nothing written
  SELECT r.id INTO v_prev FROM public.canvas_draft_runs r WHERE r.owner_id = v_uid AND r.client_id = p_client_id;
  IF FOUND THEN
    RETURN public._canvas_draft_run_result(v_prev, true);
  END IF;

  IF p_canvas IS NULL THEN
    v_code := public._canvas_draft_busy_code(v_uid, NULL, true);
    IF v_code IS NOT NULL THEN
      RETURN public._canvas_draft_refuse(v_code, NULL);
    END IF;
  ELSE
    SELECT c.* INTO v_canvas FROM public.canvases c WHERE c.id = p_canvas AND c.owner_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
    END IF;
    SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.canvas_id = v_canvas.id AND d.state = 'open' FOR UPDATE;
    IF FOUND THEN
      v_have := true;
      v_code := public._canvas_draft_busy_code(v_uid, v_d.id, true);
      IF v_code IS NOT NULL THEN
        RETURN public._canvas_draft_refuse(v_code, v_d.id);
      END IF;
      IF NOT COALESCE(p_replace, false) AND public._canvas_draft_used_runs(v_d.id) >= c_cap THEN
        RETURN public._canvas_draft_refuse('cap_reached', v_d.id);
      END IF;
      IF p_expected_draft IS DISTINCT FROM v_d.id OR p_expected_revision IS DISTINCT FROM v_d.revision THEN
        RETURN public._canvas_draft_refuse('stale_view', v_d.id);
      END IF;
      IF COALESCE(p_replace, false) THEN
        PERFORM public._canvas_draft_discard_inner(v_d.id);
        v_have := false;
      END IF;
    ELSE
      v_code := public._canvas_draft_busy_code(v_uid, NULL, true);
      IF v_code IS NOT NULL THEN
        RETURN public._canvas_draft_refuse(v_code, NULL);
      END IF;
      IF p_expected_draft IS NOT NULL THEN
        RETURN public._canvas_draft_refuse('stale_view', NULL);    -- the draft the client saw is gone
      END IF;
    END IF;
    -- no draft open and no version named: only a canvas with nothing published yet (a first canvas whose draft was
    -- discarded: "Start over") opens a fresh first draft
    IF NOT v_have AND p_from_version IS NULL
       AND EXISTS (SELECT 1 FROM public.canvas_versions v WHERE v.canvas_id = v_canvas.id AND v.published_at IS NOT NULL) THEN
      RAISE EXCEPTION 'canvas send: no draft is open and no version to start from' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF NOT v_have THEN
    IF (SELECT count(*) FROM public.canvas_drafts d WHERE d.owner_id = v_uid AND d.state = 'open') >= c_max_open THEN
      RAISE EXCEPTION 'too many open drafts' USING ERRCODE = '54000';
    END IF;
    IF p_canvas IS NULL THEN
      v_canvas := public._canvas_draft_new_canvas(v_uid);
    END IF;
    v_d := public._canvas_draft_new(v_uid, v_canvas.id, p_from_version, NULL, NULL);
  END IF;

  -- the owner's message
  IF v_att = 'voice' THEN
    v_key := lower(v_d.conversation_id::text) || '/' || lower(v_uid::text) || '/' || lower(p_client_id::text) || '.wav';
    IF jsonb_typeof(p_attachment -> 'waveform') = 'array' THEN
      v_wave := ARRAY(SELECT x::smallint FROM jsonb_array_elements_text(p_attachment -> 'waveform') x);
    END IF;
    v_msg := public.chat_commit_voice_note(v_uid, v_d.conversation_id, v_key, (p_attachment ->> 'duration_ms')::integer,
                                           v_d.thread_root_id, NULL, p_client_id, v_wave);
    IF v_msg.thread_root_id IS DISTINCT FROM v_d.thread_root_id THEN
      RAISE EXCEPTION 'canvas send: that voice note belongs to another thread' USING ERRCODE = '22023';
    END IF;
    UPDATE public.chat_messages m SET box_refs = v_refs WHERE m.id = v_msg.id;
  ELSE
    INSERT INTO public.chat_messages (conversation_id, author_id, body, thread_root_id, kind, client_id, box_refs, created_at)
    VALUES (v_d.conversation_id, v_uid, COALESCE(v_body, v_label), v_d.thread_root_id, 'message', p_client_id, v_refs, clock_timestamp())
    RETURNING * INTO v_msg;
  END IF;

  UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id RETURNING d.revision INTO v_rev;
  INSERT INTO public.canvas_draft_runs
    (draft_id, owner_id, kind, speed, state, trigger_message_id, scope, client_id, input_kind, created_revision)
  VALUES (v_d.id, v_uid, 'message', 'fast', 'queued', v_msg.id, v_refs, p_client_id, v_input, v_rev)
  RETURNING id INTO v_run;
  RETURN public._canvas_draft_run_result(v_run, false);
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_workspace_send(uuid, uuid, uuid, integer, boolean, text, text[], jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_workspace_send(uuid, uuid, uuid, integer, boolean, text, text[], jsonb, uuid)
  TO authenticated;

-- ============================================================================
-- 2. The voice send: service role only, for a caller the edge function verified
-- ============================================================================
-- canvas_voice_send(p_uid, p_canvas, p_from_version, p_expected_draft, p_expected_revision, p_replace, p_box_refs, p_object_key,
--                   p_duration_ms, p_waveform, p_client_id)
-- Same arguments and answers as canvas_workspace_send for a voice attachment, plus the verified user and the object key chat-voice
-- validated. p_client_id is the upload key's last segment, so a repeat of one upload (a lost response, a double tap, concurrent
-- commits) returns the first result and writes nothing.
CREATE OR REPLACE FUNCTION public.canvas_voice_send(
  p_uid uuid, p_canvas uuid, p_from_version uuid, p_expected_draft uuid, p_expected_revision integer, p_replace boolean,
  p_box_refs text[], p_object_key text, p_duration_ms integer, p_waveform jsonb, p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub    text := current_setting('request.jwt.claim.sub', true);
  v_claims text := current_setting('request.jwt.claims', true);
  v_res    jsonb;
  v_path   text;
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

  -- the note this call WROTE must be stored under the key chat-voice validated; anything else refuses the whole send (and rolls back what it
  -- wrote). A repeat wrote nothing: it returns the first result, whose key was checked when it was written.
  IF v_res ->> 'status' = 'ok' AND COALESCE((v_res ->> 'replayed')::boolean, false) = false THEN
    SELECT a.audio_path INTO v_path FROM public.chat_voice_audio a WHERE a.message_id = (v_res ->> 'message_id')::uuid;
    IF v_path IS DISTINCT FROM p_object_key THEN
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

-- ============================================================================
-- 3. The run begins when the transcript lands
-- ============================================================================
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

DROP TRIGGER IF EXISTS chat_messages_canvas_voice_settled ON public.chat_messages;
CREATE TRIGGER chat_messages_canvas_voice_settled
  AFTER UPDATE OF transcript_status ON public.chat_messages
  FOR EACH ROW
  WHEN (NEW.audio_duration_ms IS NOT NULL AND NEW.transcript_status IN ('done', 'failed')
        AND OLD.transcript_status IS DISTINCT FROM NEW.transcript_status)
  EXECUTE FUNCTION public._canvas_voice_transcript_settled();

