-- P1576 Part B: voice notes in human chats and threads.
--
-- client-safe: additive. New nullable columns on chat_messages, two new service-role-only tables,
--   new service-role-only functions, two triggers, one cron pair, and two relaxed/extended CHECKs:
--   chat_messages_has_content gains an OR branch (every row that passed before passes now) and
--   chat_messages_deleted_is_empty gains three more NULL requirements that every existing row already
--   meets (no row has audio or a transcript yet). get_my_chats keeps its signature; only the
--   preview text of a voice note changes. An older deployed client simply never sees a voice note
--   as anything but a message with no text.
--
-- diffed against:
--   * 20261019203000_p1512_clarity_chat.sql: the CHECK constraints chat_messages_has_content and
--     chat_messages_deleted_is_empty (nothing later redefines them) and get_my_chats() (nothing later
--     redefines it; the body below is that file's, with ONE change: a voice note's preview is
--     'Voice message', and the last-message lateral also reads m.audio_duration_ms).
--   * 20261022160000_p1546_threads_everywhere.sql: send_chat_message. Its idempotent-replay, thread
--     root and reply-target rules are copied into chat_commit_voice_note (the latest definition; the
--     p1547 review-fix files do not touch it). send_chat_message itself is NOT redefined: a voice note
--     arrives through chat_commit_voice_note because the caller there is the edge function, acting AS
--     the user (p_uid), and the audio object must exist before the row does.
--
-- DELIBERATE DEVIATIONS from the design brief, with reasons:
--   * The storage path lives in public.chat_voice_audio, NOT in a chat_messages column. Clients read
--     chat_messages by a table-level SELECT grant (and Realtime pushes whole rows), so any column on it
--     is readable by every participant; a column-level REVOKE would break `select(...)` of the other
--     columns and Realtime. A side table with no client grants keeps the path server-only by construction.
--   * transcript_attempts / transcript_attempted_at live on that same side table, so a retry never
--     rewrites a chat_messages row (no Realtime UPDATE per attempt).
--   * Deleting a message and erasing an account clear the audio through ONE BEFORE UPDATE trigger
--     (_chat_voice_clear_on_delete) instead of editing delete_chat_message and erase_chat_data_for.
--     Both of those already UPDATE deleted_at; the trigger covers them, the mirror step-6 erase, and any
--     future path, without copying two large function bodies (erase_chat_data_for carries a lock-order
--     argument that a copy could silently break). Hard deletes (conversation removed) cascade to the
--     side table, whose AFTER DELETE trigger enqueues the purge.
--
-- ENV-SPECIFIC PREREQUISITES (the cron jobs are inert without them, exactly as P1256's are):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/chat-voice', 'chat_voice_url', 'P1576 cron target');
--   select vault.create_secret('<the CRON_SECRET set on the chat-voice edge function>', 'chat_voice_cron_secret', 'P1576 cron auth');
--   select vault.create_secret('<the project anon key>', 'chat_voice_anon_key', 'P1576 gateway JWT');

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- 1. chat_messages: audio marker, transcript
-- ============================================================================
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS audio_duration_ms integer,
  ADD COLUMN IF NOT EXISTS audio_expired_at  timestamptz,
  ADD COLUMN IF NOT EXISTS transcript        text,
  ADD COLUMN IF NOT EXISTS transcript_status text;

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_audio_duration_range;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_audio_duration_range
  CHECK (audio_duration_ms IS NULL OR audio_duration_ms BETWEEN 1 AND 120000);
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_transcript_len;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_transcript_len
  CHECK (transcript IS NULL OR char_length(transcript) <= 20000);
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_transcript_status_check;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_transcript_status_check
  CHECK (transcript_status IS NULL OR transcript_status IN ('pending', 'done', 'failed'));

-- A voice note is a plain human message that carries nothing else; every audio field is NULL
-- together or the row is a voice note. A private @mirror ask (context_conversation_id) and an agent
-- reply can never be one. This also makes editing a voice note's body a constraint violation, so
-- edit_chat_message needs no change (the UI does not offer the edit).
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_audio_shape;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_audio_shape CHECK (
  (audio_duration_ms IS NULL AND audio_expired_at IS NULL AND transcript IS NULL AND transcript_status IS NULL)
  OR (audio_duration_ms IS NOT NULL AND transcript_status IS NOT NULL AND kind = 'message'
      AND context_conversation_id IS NULL AND body IS NULL AND attachment_id IS NULL
      AND forward_snapshot IS NULL)
);

-- p1512 bodies, extended: audio counts as content; a deleted message carries no audio or transcript.
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_deleted_is_empty;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_deleted_is_empty CHECK (
  deleted_at IS NULL
  OR (body IS NULL AND attachment_id IS NULL AND forward_snapshot IS NULL
      AND audio_duration_ms IS NULL AND transcript IS NULL AND transcript_status IS NULL)
);
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_has_content;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_has_content CHECK (
  deleted_at IS NOT NULL OR body IS NOT NULL OR attachment_id IS NOT NULL OR forward_snapshot IS NOT NULL
  OR audio_duration_ms IS NOT NULL
);

-- ============================================================================
-- 2. Server-only tables: where the audio lives, and what is waiting to be deleted from storage
-- ============================================================================
-- audio_path is derived, never free-form: <conversation id>/<author id>/<client id>.wav, lower-case uuids.
-- The author segment binds an object to its uploader: only that person can commit or delete it.
CREATE TABLE IF NOT EXISTS public.chat_voice_audio (
  message_id             uuid PRIMARY KEY REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  audio_path             text NOT NULL UNIQUE
    CHECK (audio_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.wav$'),
  transcript_attempts    integer NOT NULL DEFAULT 0,
  transcript_attempted_at timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_voice_purge (
  path        text PRIMARY KEY,
  enqueued_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_voice_purge_enqueued ON public.chat_voice_purge (enqueued_at);

ALTER TABLE public.chat_voice_audio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_voice_purge ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chat_voice_audio FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.chat_voice_purge FROM PUBLIC, anon, authenticated, service_role;
-- chat_voice_audio is written only by the SECURITY DEFINER functions below; service_role may read it
-- and update the retry bookkeeping (the integration canary backdates attempts). The purge queue is
-- read and drained directly by the edge function's sweep.
GRANT SELECT, UPDATE ON TABLE public.chat_voice_audio TO service_role;
GRANT SELECT, DELETE ON TABLE public.chat_voice_purge TO service_role;

CREATE INDEX IF NOT EXISTS chat_messages_voice_author_created
  ON public.chat_messages (author_id, created_at) WHERE audio_duration_ms IS NOT NULL;

COMMENT ON TABLE public.chat_voice_audio IS
  'P1576: storage path + transcript retry bookkeeping of a voice note. Server-only: no client grant, RLS on, no policy.';
COMMENT ON TABLE public.chat_voice_purge IS
  'P1576: storage objects waiting to be deleted. Filled by a trigger on chat_voice_audio whenever a row goes away.';

-- Whenever audio goes away (message delete, account erasure, 30-day retention, conversation removed)
-- its object is queued for deletion from the bucket. The sweep drains the queue.
CREATE OR REPLACE FUNCTION public._chat_voice_enqueue_purge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.chat_voice_purge (path) VALUES (OLD.audio_path) ON CONFLICT (path) DO NOTHING;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public._chat_voice_enqueue_purge() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_voice_audio_purge ON public.chat_voice_audio;
CREATE TRIGGER chat_voice_audio_purge AFTER DELETE ON public.chat_voice_audio
  FOR EACH ROW EXECUTE FUNCTION public._chat_voice_enqueue_purge();

-- ============================================================================
-- 3. Triggers on chat_messages
-- ============================================================================
-- (a) No voice note in a mirror conversation, by any writer. The edge function and the commit RPC
-- refuse earlier; this is the backstop a future writer cannot skip.
CREATE OR REPLACE FUNCTION public._chat_voice_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.chat_conversations c WHERE c.id = NEW.conversation_id AND c.kind = 'mirror') THEN
    RAISE EXCEPTION 'chat: voice notes are not available in this chat' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._chat_voice_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_messages_voice_guard ON public.chat_messages;
CREATE TRIGGER chat_messages_voice_guard BEFORE INSERT OR UPDATE OF audio_duration_ms ON public.chat_messages
  FOR EACH ROW WHEN (NEW.audio_duration_ms IS NOT NULL) EXECUTE FUNCTION public._chat_voice_guard();

-- (b) A deleted message, an erased account and any other UPDATE that sets deleted_at drop the audio
-- and the transcript with it. Runs BEFORE the row is checked, so chat_messages_deleted_is_empty
-- sees the cleared row. The DELETE fires the purge enqueue above.
CREATE OR REPLACE FUNCTION public._chat_voice_clear_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.audio_duration_ms := NULL;
  NEW.audio_expired_at  := NULL;
  NEW.transcript        := NULL;
  NEW.transcript_status := NULL;
  DELETE FROM public.chat_voice_audio a WHERE a.message_id = OLD.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._chat_voice_clear_on_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_messages_voice_clear ON public.chat_messages;
CREATE TRIGGER chat_messages_voice_clear BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW WHEN (
    NEW.deleted_at IS NOT NULL
    AND (OLD.audio_duration_ms IS NOT NULL OR OLD.audio_expired_at IS NOT NULL
         OR OLD.transcript IS NOT NULL OR OLD.transcript_status IS NOT NULL)
  ) EXECUTE FUNCTION public._chat_voice_clear_on_delete();

-- ============================================================================
-- 4. Service-role functions (the edge function acts AS the user through p_uid)
-- ============================================================================
-- Raises unless p_uid may post a voice note in the conversation. Same error text for "no such
-- conversation" and "not yours" (it comes from _chat_assert_can_post), so ids cannot be probed.
CREATE OR REPLACE FUNCTION public.chat_voice_check_post(p_uid uuid, p_conversation uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conv public.chat_conversations;
BEGIN
  v_conv := public._chat_assert_can_post(p_conversation, p_uid);
  IF v_conv.kind = 'mirror' THEN
    RAISE EXCEPTION 'chat: voice notes are not available in this chat' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_voice_check_post(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_voice_check_post(uuid, uuid) TO service_role;

-- Does a committed message already reference this object? The edge function asks before it would ever
-- delete an object it just rejected: an object a message points at is never deleted by a failed commit.
CREATE OR REPLACE FUNCTION public.chat_voice_key_committed(p_object_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_voice_audio a WHERE a.audio_path = p_object_key);
$$;
REVOKE ALL ON FUNCTION public.chat_voice_key_committed(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_voice_key_committed(text) TO service_role;

-- send_chat_message (p1546) for a voice note: the same membership, replay, thread and reply rules,
-- with p_uid instead of auth.uid(), no body or attachment, and these additions:
--   * mirror conversations are refused;
--   * the object path is DERIVED from (conversation, author, client id); any other path is refused;
--   * at most 10 voice notes per author per minute (SQLSTATE 54000), because each one is a Gemini call.
CREATE OR REPLACE FUNCTION public.chat_commit_voice_note(
  p_uid          uuid,
  p_conversation uuid,
  p_object_key   text,
  p_duration_ms  integer,
  p_thread_root  uuid DEFAULT NULL,
  p_reply_to     uuid DEFAULT NULL,
  p_client_id    uuid DEFAULT NULL
)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conv  public.chat_conversations;
  v_since timestamptz;
  v_row   public.chat_messages;
BEGIN
  v_conv := public._chat_assert_can_post(p_conversation, p_uid);
  IF v_conv.kind = 'mirror' THEN
    RAISE EXCEPTION 'chat: voice notes are not available in this chat' USING ERRCODE = '22023';
  END IF;
  v_since := public._chat_access_since(p_conversation, p_uid);

  IF p_client_id IS NULL
     OR p_object_key IS DISTINCT FROM (lower(p_conversation::text) || '/' || lower(p_uid::text) || '/'
                                       || lower(p_client_id::text) || '.wav') THEN
    RAISE EXCEPTION 'chat: invalid voice note' USING ERRCODE = '22023';
  END IF;

  -- Idempotent retry (p1546): this author already committed this upload, so return THAT row. Before the
  -- length check on purpose: a replay carries no fresh duration.
  SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = p_uid AND m.client_id = p_client_id;
  IF FOUND THEN
    IF v_row.conversation_id <> p_conversation THEN
      RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
    END IF;
    IF v_row.created_at < v_since THEN
      RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
    END IF;
    RETURN v_row;
  END IF;

  IF p_duration_ms IS NULL OR p_duration_ms < 1 OR p_duration_ms > 120000 THEN
    RAISE EXCEPTION 'chat: invalid voice note length' USING ERRCODE = '22023';
  END IF;

  IF (SELECT count(*) FROM public.chat_messages m
       WHERE m.author_id = p_uid AND m.audio_duration_ms IS NOT NULL
         AND m.created_at > clock_timestamp() - interval '1 minute') >= 10 THEN
    RAISE EXCEPTION 'chat: too many voice notes' USING ERRCODE = '54000';
  END IF;

  IF p_thread_root IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.chat_messages t
                    WHERE t.id = p_thread_root AND t.conversation_id = p_conversation
                      AND t.deleted_at IS NULL AND t.thread_root_id IS NULL AND t.created_at >= v_since) THEN
      RAISE EXCEPTION 'chat: thread not available' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_reply_to IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.chat_messages t
                    WHERE t.id = p_reply_to AND t.conversation_id = p_conversation
                      AND t.deleted_at IS NULL AND t.created_at >= v_since) THEN
      RAISE EXCEPTION 'chat: reply target not available' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- clock_timestamp(), not now(): see send_chat_message.
  INSERT INTO public.chat_messages
    (conversation_id, author_id, body, reply_to_id, thread_root_id, kind, client_id, created_at,
     audio_duration_ms, transcript_status)
  VALUES
    (p_conversation, p_uid, NULL, p_reply_to, p_thread_root, 'message', p_client_id, clock_timestamp(),
     p_duration_ms, 'pending')
  ON CONFLICT (author_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    -- a concurrent call with the same client id committed first: return its row
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = p_uid AND m.client_id = p_client_id;
    IF v_row.conversation_id <> p_conversation THEN
      RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
    END IF;
    IF v_row.created_at < v_since THEN
      RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
    END IF;
    RETURN v_row;
  END IF;

  INSERT INTO public.chat_voice_audio (message_id, audio_path) VALUES (v_row.id, p_object_key);

  IF p_thread_root IS NULL THEN
    UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = p_conversation;
    INSERT INTO public.chat_member_state (conversation_id, profile_id, last_read_at, manual_unread)
    VALUES (p_conversation, p_uid, v_row.created_at, false)
    ON CONFLICT (conversation_id, profile_id) DO UPDATE
      SET last_read_at  = GREATEST(COALESCE(public.chat_member_state.last_read_at, '-infinity'::timestamptz),
                                   EXCLUDED.last_read_at),
          manual_unread = false;
  END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_commit_voice_note(uuid, uuid, text, integer, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_commit_voice_note(uuid, uuid, text, integer, uuid, uuid, uuid)
  TO service_role;

-- The object key of a voice note p_uid may read; NULL when the audio is gone (expired, deleted).
-- Raises 42501 for a message p_uid cannot read, with the same text whether it exists or not.
CREATE OR REPLACE FUNCTION public.chat_voice_playback_target(p_uid uuid, p_message uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_msg   public.chat_messages;
  v_since timestamptz;
BEGIN
  SELECT * INTO v_msg FROM public.chat_messages m WHERE m.id = p_message;
  IF NOT FOUND OR p_uid IS NULL THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;
  v_since := public._chat_access_since(v_msg.conversation_id, p_uid);
  IF v_since IS NULL OR v_msg.created_at < v_since THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT a.audio_path FROM public.chat_voice_audio a WHERE a.message_id = p_message);
END;
$$;
REVOKE ALL ON FUNCTION public.chat_voice_playback_target(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_voice_playback_target(uuid, uuid) TO service_role;

-- Counts one transcription attempt and returns the object key, or NULL when there is nothing to do:
-- not pending, deleted, three attempts used, or tried less than 2 minutes ago. The row update is the
-- claim, so two overlapping runs cannot both spend the same attempt.
CREATE OR REPLACE FUNCTION public.chat_voice_claim_transcription(p_message uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_path text;
BEGIN
  UPDATE public.chat_voice_audio a
     SET transcript_attempts = a.transcript_attempts + 1, transcript_attempted_at = now()
    FROM public.chat_messages m
   WHERE a.message_id = p_message AND m.id = a.message_id
     AND m.transcript_status = 'pending' AND m.deleted_at IS NULL
     AND a.transcript_attempts < 3
     AND (a.transcript_attempted_at IS NULL OR a.transcript_attempted_at < now() - interval '2 minutes')
  RETURNING a.audio_path INTO v_path;
  RETURN v_path;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_voice_claim_transcription(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_voice_claim_transcription(uuid) TO service_role;

-- Stores the outcome of an attempt. A success writes the transcript (only while pending and not
-- deleted: a delete that raced the job wins). A failure marks the message failed once the third
-- attempt is used; before that it stays pending and the sweep retries it.
CREATE OR REPLACE FUNCTION public.chat_voice_finish_transcription(p_message uuid, p_ok boolean, p_text text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_ok THEN
    UPDATE public.chat_messages m
       SET transcript = left(COALESCE(p_text, ''), 20000), transcript_status = 'done'
     WHERE m.id = p_message AND m.transcript_status = 'pending' AND m.deleted_at IS NULL;
  ELSE
    UPDATE public.chat_messages m
       SET transcript_status = 'failed'
      FROM public.chat_voice_audio a
     WHERE m.id = p_message AND a.message_id = m.id
       AND m.transcript_status = 'pending' AND m.deleted_at IS NULL AND a.transcript_attempts >= 3;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_voice_finish_transcription(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_voice_finish_transcription(uuid, boolean, text) TO service_role;

-- Pending notes the sweep should try again: no attempt in the last 2 minutes (or never, and older
-- than 2 minutes), attempts left.
CREATE OR REPLACE FUNCTION public.chat_voice_retry_candidates(p_limit integer DEFAULT 10)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.id
    FROM public.chat_messages m
    JOIN public.chat_voice_audio a ON a.message_id = m.id
   WHERE m.transcript_status = 'pending' AND m.deleted_at IS NULL
     AND a.transcript_attempts < 3
     AND COALESCE(a.transcript_attempted_at, m.created_at) < now() - interval '2 minutes'
   ORDER BY m.created_at
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
$$;
REVOKE ALL ON FUNCTION public.chat_voice_retry_candidates(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_voice_retry_candidates(integer) TO service_role;

-- Pending notes whose three attempts are spent and whose last try is stale (the job died between
-- the attempt and its bookkeeping): mark them failed so the bubble stops saying "Transcribing…".
CREATE OR REPLACE FUNCTION public.chat_voice_fail_exhausted()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.chat_messages m
     SET transcript_status = 'failed'
    FROM public.chat_voice_audio a
   WHERE a.message_id = m.id AND m.transcript_status = 'pending' AND m.deleted_at IS NULL
     AND a.transcript_attempts >= 3 AND a.transcript_attempted_at < now() - interval '2 minutes';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_voice_fail_exhausted() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_voice_fail_exhausted() TO service_role;

-- ============================================================================
-- 5. Retention: audio is deleted after 30 days, the transcript stays
-- ============================================================================
-- Removing the side-table row queues the object (trigger above); the message keeps its duration and
-- transcript and gains audio_expired_at, so the bubble reads "Audio expired". A note still pending at
-- that point can never be transcribed, so it becomes failed. Bounded per run.
CREATE OR REPLACE FUNCTION public.chat_voice_expire_old(p_limit integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n integer;
BEGIN
  WITH expired AS (
    SELECT a.message_id
      FROM public.chat_voice_audio a
      JOIN public.chat_messages m ON m.id = a.message_id
     WHERE m.created_at < now() - interval '30 days'
     ORDER BY m.created_at
     LIMIT GREATEST(COALESCE(p_limit, 5000), 1)
  ), gone AS (
    DELETE FROM public.chat_voice_audio a USING expired WHERE a.message_id = expired.message_id
    RETURNING a.message_id
  )
  UPDATE public.chat_messages m
     SET audio_expired_at  = now(),
         transcript_status = CASE WHEN m.transcript_status = 'pending' THEN 'failed' ELSE m.transcript_status END
    FROM gone WHERE m.id = gone.message_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_voice_expire_old(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_voice_expire_old(integer) TO service_role;

-- pg_net call into chat-voice mode `sweep`. Vault lookup at RUN time (P1256): the anon key satisfies
-- the API gateway's JWT check and is not the boundary; x-cron-secret is.
CREATE OR REPLACE FUNCTION public._chat_voice_call_sweep()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url    text;
  v_secret text;
  v_jwt    text;
BEGIN
  SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'chat_voice_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'chat_voice_cron_secret';
  SELECT decrypted_secret INTO v_jwt    FROM vault.decrypted_secrets WHERE name = 'chat_voice_anon_key';
  IF v_url IS NULL OR v_secret IS NULL OR v_jwt IS NULL THEN
    RAISE WARNING '_chat_voice_call_sweep: vault config missing (url: %, secret: %, jwt: %), skipping tick',
      (v_url IS NOT NULL), (v_secret IS NOT NULL), (v_jwt IS NOT NULL);
    RETURN;
  END IF;
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_jwt,
                 'x-cron-secret', v_secret),
    body    := '{"mode":"sweep"}'::jsonb,
    timeout_milliseconds := 30000);
END;
$$;
REVOKE ALL ON FUNCTION public._chat_voice_call_sweep() FROM PUBLIC, anon, authenticated;

-- Is there anything for the sweep to do? A pending transcript whose last try (or creation) is more than
-- 2 minutes old, or an object waiting in the purge queue. The ticks ask this IN SQL first, so an idle
-- system makes no edge-function invocation at all (a */5 job calling unconditionally would be about
-- 8,640 invocations a month for nothing).
CREATE OR REPLACE FUNCTION public._chat_voice_has_work()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_voice_purge)
      OR EXISTS (
        SELECT 1
          FROM public.chat_messages m
          JOIN public.chat_voice_audio a ON a.message_id = m.id
         WHERE m.transcript_status = 'pending' AND m.deleted_at IS NULL
           AND COALESCE(a.transcript_attempted_at, m.created_at) < now() - interval '2 minutes');
$$;
REVOKE ALL ON FUNCTION public._chat_voice_has_work() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS chat_messages_voice_pending
  ON public.chat_messages (created_at) WHERE transcript_status = 'pending';

-- every 5 minutes: retry stuck transcripts, drain the purge queue, but only when there is work
CREATE OR REPLACE FUNCTION public.chat_voice_sweep_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public._chat_voice_has_work() THEN
    PERFORM public._chat_voice_call_sweep();
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_voice_sweep_tick() FROM PUBLIC, anon, authenticated;

-- daily: expire old audio, then ask the sweep to delete the objects it queued (only if any were)
CREATE OR REPLACE FUNCTION public.chat_voice_retention_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.chat_voice_expire_old();
  IF public._chat_voice_has_work() THEN
    PERFORM public._chat_voice_call_sweep();
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_voice_retention_tick() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Idempotent: unschedule first so re-running the migration does not stack jobs.
    PERFORM cron.unschedule('chat_voice_sweep')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chat_voice_sweep');
    PERFORM cron.schedule('chat_voice_sweep', '*/5 * * * *', $job$ SELECT public.chat_voice_sweep_tick(); $job$);

    PERFORM cron.unschedule('chat_voice_retention')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chat_voice_retention');
    PERFORM cron.schedule('chat_voice_retention', '17 3 * * *', $job$ SELECT public.chat_voice_retention_tick(); $job$);
  END IF;
END $$;

-- ============================================================================
-- 6. get_my_chats (p1512 body): a voice note's list preview
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_my_chats()
RETURNS TABLE (
  conversation_id      uuid,
  kind                 text,
  title                text,
  other_id             uuid,
  other_name           text,
  other_slug           text,
  other_avatar_url     text,
  other_avatar_color   text,
  other_deleted        boolean,
  org_id               uuid,
  org_slug             text,
  org_name             text,
  event_id             uuid,
  event_slug           text,
  event_title          text,
  event_datetime       timestamptz,
  owner_first_name     text,
  last_message_id      uuid,
  last_author_id       uuid,
  last_author_name     text,
  last_body            text,
  last_message_kind    text,
  last_message_deleted boolean,
  last_message_at      timestamptz,
  unread_count         integer,
  manual_unread        boolean,
  archived             boolean,
  last_read_at         timestamptz,
  is_partner           boolean,
  members_since        timestamptz,
  can_send             boolean,
  blocked_by_me        boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM public._chat_ensure_for_user(v_uid);

  RETURN QUERY
  SELECT
    c.id,
    c.kind,
    c.title,
    op.id,
    op.name,
    op.slug,
    op.avatar_url,
    op.avatar_color,
    (c.kind = 'dm' AND op.id IS NULL),
    org.id,
    org.slug,
    org.name,
    ev.id,
    ev.slug,
    ev.title,
    ev.datetime,
    split_part(ow.name, ' ', 1),
    lm.id,
    lm.author_id,
    lm.author_name,
    -- A clarify shows the clarifier's note when there is one, else the copied words from the snapshot;
    -- delete and erase clear both.
    CASE WHEN lm.deleted_at IS NOT NULL THEN 'Message deleted'
         WHEN lm.audio_duration_ms IS NOT NULL THEN 'Voice message'
         WHEN lm.kind = 'clarify' THEN COALESCE(lm.body, lm.forward_snapshot ->> 'body')
         ELSE lm.body END,
    lm.kind,
    (lm.deleted_at IS NOT NULL),
    lm.created_at,
    COALESCE(un.n, 0),
    COALESCE(st.manual_unread, false),
    COALESCE(st.archived, false),
    st.last_read_at,
    (c.kind = 'dm' AND op.id IS NOT NULL AND public._chat_shared_reason(v_uid, op.id) = 'partner'),
    NULLIF(mine.since, '-infinity'::timestamptz),
    -- false for a 1:1 once either side has blocked the other (or the other account is gone); the
    -- blocked side only learns "cannot send", never who blocked whom
    (c.kind <> 'dm' OR (op.id IS NOT NULL AND NOT public._chat_blocked_either(v_uid, op.id))),
    (c.kind = 'dm' AND op.id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.chat_blocks b WHERE b.blocker_id = v_uid AND b.blocked_id = op.id))
  FROM public._chat_my_conversations(v_uid) mine
  JOIN public.chat_conversations c ON c.id = mine.id
  LEFT JOIN public.chat_member_state st ON st.conversation_id = c.id AND st.profile_id = v_uid
  LEFT JOIN public.profiles op
         ON c.kind = 'dm'
        AND op.id = CASE WHEN c.dm_user_a = v_uid THEN c.dm_user_b ELSE c.dm_user_a END
  LEFT JOIN public.events ev ON ev.id = c.event_id
  LEFT JOIN public.organization org ON org.id = COALESCE(c.org_id, ev.org_id)
  LEFT JOIN public.profiles ow ON ow.id = c.owner_id
  LEFT JOIN LATERAL (
    SELECT m.id, m.author_id, ap.name AS author_name, m.body, m.kind, m.forward_snapshot, m.deleted_at, m.created_at,
           m.audio_duration_ms
      FROM public.chat_messages m
      LEFT JOIN public.profiles ap ON ap.id = m.author_id
     WHERE m.conversation_id = c.id
       AND m.thread_root_id IS NULL
       AND m.created_at >= mine.since
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS n
      FROM public.chat_messages m
     WHERE m.conversation_id = c.id
       AND m.thread_root_id IS NULL
       AND m.deleted_at IS NULL
       AND m.author_id IS DISTINCT FROM v_uid
       AND m.created_at >= mine.since
       AND m.created_at > COALESCE(st.last_read_at, '-infinity'::timestamptz)
  ) un ON true
  ORDER BY COALESCE(lm.created_at, c.created_at) DESC, c.id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_chats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_chats() TO authenticated;

-- ============================================================================
-- 7. Deploy-time assertions
-- ============================================================================
DO $assert$
DECLARE
  f record;
BEGIN
  IF has_table_privilege('anon', 'public.chat_voice_audio', 'SELECT')
     OR has_table_privilege('authenticated', 'public.chat_voice_audio', 'SELECT')
     OR has_table_privilege('authenticated', 'public.chat_voice_audio', 'INSERT')
     OR has_table_privilege('anon', 'public.chat_voice_purge', 'SELECT')
     OR has_table_privilege('authenticated', 'public.chat_voice_purge', 'SELECT')
     OR has_table_privilege('authenticated', 'public.chat_voice_purge', 'DELETE') THEN
    RAISE EXCEPTION 'P1576: a client role holds a privilege on a voice storage table';
  END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.chat_voice_audio'::regclass)
     OR NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.chat_voice_purge'::regclass) THEN
    RAISE EXCEPTION 'P1576: RLS is not enabled on a voice storage table';
  END IF;

  FOR f IN
    SELECT p.oid, p.proname,
           (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                                         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')) AS public_exec
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE 'chat\_voice\_%' OR p.proname LIKE '\_chat\_voice\_%' OR p.proname = 'chat_commit_voice_note')
  LOOP
    IF has_function_privilege('anon', f.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', f.oid, 'EXECUTE') OR f.public_exec THEN
      RAISE EXCEPTION 'P1576: a client role can execute public.%', f.proname;
    END IF;
  END LOOP;

  IF NOT has_function_privilege('authenticated', 'public.get_my_chats()', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1576: authenticated lost EXECUTE on get_my_chats';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.chat_messages'::regclass
                  AND tgname IN ('chat_messages_voice_guard', 'chat_messages_voice_clear') HAVING count(*) = 2) THEN
    RAISE EXCEPTION 'P1576: chat_messages voice triggers are missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.chat_voice_audio'::regclass
                  AND tgname = 'chat_voice_audio_purge') THEN
    RAISE EXCEPTION 'P1576: the purge trigger is missing';
  END IF;
  IF pg_get_constraintdef((SELECT oid FROM pg_constraint
        WHERE conrelid = 'public.chat_messages'::regclass AND conname = 'chat_messages_has_content'))
       NOT LIKE '%audio_duration_ms%' THEN
    RAISE EXCEPTION 'P1576: has_content does not count audio';
  END IF;
END;
$assert$;
