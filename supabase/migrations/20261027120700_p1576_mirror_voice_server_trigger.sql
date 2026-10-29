-- P1576 follow-up (founder decision, option A): the SERVER starts the Mirror's reply to a voice note.
--
-- client-safe: no column, grant or signature changes; adds one trigger and one internal function that no client
--   role can execute. The browser never asks for a voice note's reply any more (it still can, through
--   mirror_request_reply, for "Try again").
--
-- diffed against: the job insert is mirror_request_reply's (20261027120600), kind 'reply', no context
--   conversation; the pg_net call is _chat_voice_call_sweep's (20261027120100, P1256).
--
-- When a voice note's transcript becomes 'done' (non-blank) in the OWNER's own mirror, this inserts the one
-- mirror_jobs row for it (ON CONFLICT DO NOTHING: the unique index on trigger_message_id makes a second 'done'
-- update, or a user "Try again", reuse the same job) and calls the mirror-reply edge function with the job id.
--
-- Vault secrets, read at RUN time (names; values are never in a migration):
--   mirror_reply_url        the mirror-reply function URL
--   mirror_internal_secret  equals the MIRROR_INTERNAL_SECRET env on mirror-reply (sent as x-mirror-internal)
--   chat_voice_anon_key     REUSED from the chat-voice sweep: the same project anon key, so no second copy to rotate
-- Any missing -> RAISE WARNING and return: the job stays 'queued' and the owner can press Try again.
--
-- The trigger never fails the UPDATE: everything after the job insert, and the insert itself, sit in a block
-- that turns any error into a WARNING, so a vault or pg_net problem cannot roll back the transcript write.
--
-- Prod: MIRROR_AI_ENABLED is false there, so the function answers 503 DISABLED and the job stays 'queued'.
-- That is harmless: the client shows no AI controls while the mirror is disabled (availability check), a queued
-- job holds no spend reservation (the reservation is made by _mirror_begin_job), erase_chat_data_for and the
-- cancel rules treat a queued job like any other, and when the mirror is switched on the owner's Try again
-- (or a new note) goes through the existing user path against the same job row.

CREATE OR REPLACE FUNCTION public._mirror_voice_start_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner  uuid;
  v_job    uuid;
  v_url    text;
  v_secret text;
  v_jwt    text;
BEGIN
  SELECT c.owner_id INTO v_owner
    FROM public.chat_conversations c
   WHERE c.id = NEW.conversation_id AND c.kind = 'mirror';
  IF v_owner IS NULL OR NEW.author_id IS DISTINCT FROM v_owner
     OR NEW.context_conversation_id IS NOT NULL OR NEW.deleted_at IS NOT NULL
     OR btrim(COALESCE(NEW.transcript, '')) = '' THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.mirror_jobs (owner_id, kind, trigger_message_id, context_conversation_id)
    VALUES (v_owner, 'reply', NEW.id, NULL)
    ON CONFLICT (trigger_message_id) WHERE trigger_message_id IS NOT NULL DO NOTHING;
    SELECT j.id INTO v_job FROM public.mirror_jobs j
     WHERE j.trigger_message_id = NEW.id AND j.state = 'queued';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_mirror_voice_start_reply: job not created (sqlstate %), transcript write kept', SQLSTATE;
    RETURN NEW;
  END;
  IF v_job IS NULL THEN
    RETURN NEW; -- already running, done, failed or cancelled: nothing to start
  END IF;

  -- A SEPARATE block: a failed dispatch must not roll back the queued job above. A queued job that never
  -- runs is still visible to the owner (the client's job check turns it into "failed, Try again").
  BEGIN
    SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'mirror_reply_url';
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'mirror_internal_secret';
    SELECT decrypted_secret INTO v_jwt    FROM vault.decrypted_secrets WHERE name = 'chat_voice_anon_key';
    IF v_url IS NULL OR v_secret IS NULL OR v_jwt IS NULL THEN
      RAISE WARNING '_mirror_voice_start_reply: vault config missing (url: %, secret: %, jwt: %), job left queued',
        (v_url IS NOT NULL), (v_secret IS NOT NULL), (v_jwt IS NOT NULL);
      RETURN NEW;
    END IF;
    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
                   'Content-Type',      'application/json',
                   'Authorization',     'Bearer ' || v_jwt,
                   'x-mirror-internal', v_secret),
      body    := jsonb_build_object('job_id', v_job),
      timeout_milliseconds := 60000);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_mirror_voice_start_reply: dispatch failed (sqlstate %), job left queued', SQLSTATE;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._mirror_voice_start_reply() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_messages_mirror_voice_reply ON public.chat_messages;
CREATE TRIGGER chat_messages_mirror_voice_reply
  AFTER UPDATE OF transcript_status ON public.chat_messages
  FOR EACH ROW
  WHEN (NEW.audio_duration_ms IS NOT NULL AND NEW.transcript_status = 'done'
        AND OLD.transcript_status IS DISTINCT FROM 'done')
  EXECUTE FUNCTION public._mirror_voice_start_reply();
