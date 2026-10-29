-- P1576 follow-up (founder decisions): voice notes in the owner's Mirror chat, and a waveform computed once at commit.
--
-- client-safe: adds one nullable column (audio_waveform) that clients read with the existing table-level
--   SELECT grant; no client role gains execute on anything. Voice notes become postable in a mirror
--   conversation; mirror_request_reply keeps its return type but can now return state 'transcribing' or
--   'transcript_failed' with a NULL job_id and NULL reply_message_id.
--
-- diffed against:
--   * chat_commit_voice_note: 20261027120300 body, minus the mirror refusal, plus p_waveform (new last param;
--     the old 7-argument signature is dropped so there is no ambiguous overload).
--   * chat_voice_check_post: 20261027120100 body minus the mirror refusal.
--   * chat_voice_reserve_upload: 20261027120200 body minus the mirror refusal.
--   * _chat_voice_clear_on_delete: 20261027120100 body, also clears audio_waveform.
--   * mirror_request_reply: 20261023170000 body plus the voice-transcript gate.
--   * _mirror_begin_job: 20261023150000 body plus the voice-transcript backstop.
--   * _mirror_ask_row_chars: 20261023140000 body plus transcript chars; the _mirror_begin_job ask context also
--     carries a voice row's transcript and voice flag (channels hold voice notes from other members).
--   * _mirror_context_item, _mirror_row_chars: 20261023140000 bodies, voice rows carry their transcript.
--
-- A private @mirror ask row (context_conversation_id) and an agent row still cannot carry audio:
-- chat_messages_audio_shape (kept, extended) requires kind = 'message' and context_conversation_id IS NULL.
-- Erasure: the transcript is the author's own words in their own mirror; _mirror_begin_job already derives
-- refs from _chat_author_ref(t.author_id) of every row read, which covers it.

-- 1. column + constraints ---------------------------------------------------
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS audio_waveform smallint[];

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_audio_waveform_shape;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_audio_waveform_shape CHECK (
  audio_waveform IS NULL
  OR (pg_catalog.array_ndims(audio_waveform) = 1
      AND pg_catalog.array_length(audio_waveform, 1) = 50
      AND pg_catalog.array_position(audio_waveform, NULL) IS NULL
      AND 0 <= ALL (audio_waveform) AND 100 >= ALL (audio_waveform))
);

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_audio_shape;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_audio_shape CHECK (
  (audio_duration_ms IS NULL AND audio_expired_at IS NULL AND transcript IS NULL AND transcript_status IS NULL
   AND audio_waveform IS NULL)
  OR (audio_duration_ms IS NOT NULL AND transcript_status IS NOT NULL AND kind = 'message'
      AND context_conversation_id IS NULL AND body IS NULL AND attachment_id IS NULL
      AND forward_snapshot IS NULL)
);

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_deleted_is_empty;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_deleted_is_empty CHECK (
  deleted_at IS NULL
  OR (body IS NULL AND attachment_id IS NULL AND forward_snapshot IS NULL
      AND audio_duration_ms IS NULL AND transcript IS NULL AND transcript_status IS NULL
      AND audio_waveform IS NULL)
);

COMMENT ON COLUMN public.chat_messages.audio_waveform IS
  'P1576: 50 peak bars (0..100) of a voice note, computed once at commit. NULL for notes committed before this column. Never holds a storage path.';

-- 2. delete clears the waveform too ------------------------------------------
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
  NEW.audio_waveform    := NULL;
  DELETE FROM public.chat_voice_audio a WHERE a.message_id = OLD.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._chat_voice_clear_on_delete() FROM PUBLIC, anon, authenticated;

-- 3. lift the mirror refusal --------------------------------------------------
DROP TRIGGER IF EXISTS chat_messages_voice_guard ON public.chat_messages;
DROP FUNCTION IF EXISTS public._chat_voice_guard();

CREATE OR REPLACE FUNCTION public.chat_voice_check_post(p_uid uuid, p_conversation uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._chat_assert_can_post(p_conversation, p_uid);
END;
$$;
REVOKE ALL ON FUNCTION public.chat_voice_check_post(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_voice_check_post(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.chat_voice_reserve_upload(p_uid uuid, p_conversation uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._chat_assert_can_post(p_conversation, p_uid);

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('p1576|chat-voice|' || p_uid::text, 0));
  DELETE FROM public.chat_voice_rate_limits l
   WHERE l.author_id = p_uid AND l.called_at < clock_timestamp() - interval '10 minutes';
  IF (SELECT count(*) FROM public.chat_voice_rate_limits l
       WHERE l.author_id = p_uid AND l.kind = 'upload') >= 20 THEN
    RAISE EXCEPTION 'chat: too many uploads' USING ERRCODE = '54000';
  END IF;
  INSERT INTO public.chat_voice_rate_limits (author_id, kind, called_at) VALUES (p_uid, 'upload', clock_timestamp());
END;
$$;
REVOKE ALL ON FUNCTION public.chat_voice_reserve_upload(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_voice_reserve_upload(uuid, uuid) TO service_role;

DROP FUNCTION IF EXISTS public.chat_commit_voice_note(uuid, uuid, text, integer, uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.chat_commit_voice_note(
  p_uid          uuid,
  p_conversation uuid,
  p_object_key   text,
  p_duration_ms  integer,
  p_thread_root  uuid DEFAULT NULL,
  p_reply_to     uuid DEFAULT NULL,
  p_client_id    uuid DEFAULT NULL,
  p_waveform     smallint[] DEFAULT NULL
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
  v_since := public._chat_access_since(p_conversation, p_uid);

  IF p_client_id IS NULL
     OR p_object_key IS DISTINCT FROM (lower(p_conversation::text) || '/' || lower(p_uid::text) || '/'
                                       || lower(p_client_id::text) || '.wav') THEN
    RAISE EXCEPTION 'chat: invalid voice note' USING ERRCODE = '22023';
  END IF;
  -- the waveform is 50 integer bars 0..100, or absent (the table constraint enforces the same)
  IF p_waveform IS NOT NULL AND (pg_catalog.array_ndims(p_waveform) IS DISTINCT FROM 1
       OR pg_catalog.array_length(p_waveform, 1) <> 50
       OR pg_catalog.array_position(p_waveform, NULL) IS NOT NULL
       OR 0 > ANY (p_waveform) OR 100 < ANY (p_waveform)) THEN
    RAISE EXCEPTION 'chat: invalid voice note' USING ERRCODE = '22023';
  END IF;

  -- One commit at a time per author, taken BEFORE the replay lookup. With the lookup first, N concurrent
  -- retries of one upload all missed it, queued on the lock, and each charged a ledger slot before
  -- ON CONFLICT handed back the same message: later retries then got 429 for answers that cost nothing.
  -- Now the first retry creates the message, and every later one finds it and returns before any charge.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('p1576|chat-voice|' || p_uid::text, 0));

  -- Idempotent retry (p1546): this author already committed this upload, so return THAT row. Before the
  -- length check on purpose: a replay carries no fresh duration.
  SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = p_uid AND m.client_id = p_client_id;
  IF FOUND THEN
    -- anything but a voice note under this client id (a text message sent with the upload's id) is not a replay
    IF v_row.conversation_id <> p_conversation OR v_row.audio_duration_ms IS NULL THEN
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

  -- Rate limit on a ledger a delete cannot touch (counting chat_messages let delete-and-resend dodge it).
  -- The lock above makes the count see every earlier reservation. A refused attempt
  -- raises, which rolls the ledger row back with it; only committed notes consume allowance.
  DELETE FROM public.chat_voice_rate_limits l
   WHERE l.author_id = p_uid AND l.called_at < clock_timestamp() - interval '10 minutes';
  IF (SELECT count(*) FROM public.chat_voice_rate_limits l
       WHERE l.author_id = p_uid AND l.kind = 'commit'
         AND l.called_at > clock_timestamp() - interval '1 minute') >= 10 THEN
    RAISE EXCEPTION 'chat: too many voice notes' USING ERRCODE = '54000';
  END IF;
  INSERT INTO public.chat_voice_rate_limits (author_id, kind, called_at) VALUES (p_uid, 'commit', clock_timestamp());

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
     audio_duration_ms, transcript_status, audio_waveform)
  VALUES
    (p_conversation, p_uid, NULL, p_reply_to, p_thread_root, 'message', p_client_id, clock_timestamp(),
     p_duration_ms, 'pending', p_waveform)
  ON CONFLICT (author_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    -- a concurrent call with the same client id committed first: return its row
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = p_uid AND m.client_id = p_client_id;
    -- anything but a voice note under this client id (a text message sent with the upload's id) is not a replay
    IF v_row.conversation_id <> p_conversation OR v_row.audio_duration_ms IS NULL THEN
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
REVOKE ALL ON FUNCTION public.chat_commit_voice_note(uuid, uuid, text, integer, uuid, uuid, uuid, smallint[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_commit_voice_note(uuid, uuid, text, integer, uuid, uuid, uuid, smallint[])
  TO service_role;

-- 4. the Mirror reads the transcript and waits for it ----------------------------
CREATE OR REPLACE FUNCTION public._mirror_row_chars(x public.chat_messages)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(char_length(x.body), 0)
       + CASE WHEN x.audio_duration_ms IS NOT NULL AND x.transcript_status = 'done'
              THEN COALESCE(char_length(x.transcript), 0) ELSE 0 END
       + COALESCE(char_length(x.forward_snapshot ->> 'body'), 0)
       + COALESCE(char_length(x.forward_snapshot ->> 'author_name'), 0)
       + COALESCE(char_length(x.forward_snapshot ->> 'conversation_title'), 0)
       + COALESCE((SELECT sum(COALESCE(char_length(e ->> 'body'), 0) + COALESCE(char_length(e ->> 'name'), 0))
                     FROM jsonb_array_elements(public._mirror_copy_thread(x.forward_snapshot)) e), 0)::integer;
$$;
REVOKE ALL ON FUNCTION public._mirror_row_chars(public.chat_messages) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._mirror_ask_row_chars(x public.chat_messages)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(char_length(x.body), 0)
       + CASE WHEN x.audio_duration_ms IS NOT NULL AND x.transcript_status = 'done'
              THEN COALESCE(char_length(x.transcript), 0) ELSE 0 END
       + COALESCE((SELECT char_length(COALESCE(p.name, 'Deleted user')) FROM public.profiles p WHERE p.id = x.author_id),
                  char_length('Deleted user'))
       + COALESCE(char_length(x.forward_snapshot ->> 'author_name'), 0)
       + COALESCE(char_length(x.forward_snapshot ->> 'body'), 0);
$$;
REVOKE ALL ON FUNCTION public._mirror_ask_row_chars(public.chat_messages) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._mirror_context_item(t public.chat_messages)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'who',  CASE WHEN t.kind = 'agent' THEN 'mirror' ELSE 'owner' END,
    'body', CASE WHEN t.audio_duration_ms IS NOT NULL
                 THEN CASE WHEN t.transcript_status = 'done' THEN t.transcript END
                 ELSE t.body END,
    'voice', CASE WHEN t.audio_duration_ms IS NOT NULL
                  THEN CASE WHEN t.transcript_status = 'done' THEN 'transcript' ELSE 'untranscribed' END
             END,
    'quoted', CASE WHEN t.kind = 'forward' AND t.forward_snapshot IS NOT NULL THEN
                jsonb_build_object('name', t.forward_snapshot ->> 'author_name', 'body', t.forward_snapshot ->> 'body')
              END,
    'clarify', CASE WHEN t.kind = 'clarify' AND t.forward_snapshot IS NOT NULL THEN
                 jsonb_build_object(
                   'from',   t.forward_snapshot ->> 'author_name',
                   'in',     t.forward_snapshot ->> 'conversation_title',
                   'body',   t.forward_snapshot ->> 'body',
                   'thread', public._mirror_copy_thread(t.forward_snapshot),
                   -- legacy copies (before 20261023130000) carry no total: their stored length stands in
                   'thread_total', COALESCE((t.forward_snapshot ->> 'thread_total')::integer,
                                            jsonb_array_length(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb))))
               END,
    'replies', CASE WHEN t.thread_root_id IS NULL THEN
                 (SELECT count(*) FROM public.chat_messages r
                   WHERE r.thread_root_id = t.id AND r.conversation_id = t.conversation_id AND r.deleted_at IS NULL)
               END,
    'attachment', t.attachment_kind,
    'at', t.created_at);
$$;
REVOKE ALL ON FUNCTION public._mirror_context_item(public.chat_messages) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mirror_request_reply(p_message uuid)
RETURNS TABLE (job_id uuid, state text, reply_message_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_msg public.chat_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT m.* INTO v_msg
    FROM public.chat_messages m
    JOIN public.chat_conversations c ON c.id = m.conversation_id
   WHERE m.id = p_message AND c.kind = 'mirror' AND c.owner_id = v_uid AND m.author_id = v_uid;
  IF NOT FOUND OR v_msg.deleted_at IS NOT NULL OR v_msg.kind NOT IN ('message', 'clarify') THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;

  -- P1576: a voice note is answered only once its transcript exists. No job until then; the client asks again.
  -- A transcript that is done but blank (a silent note) is treated as failed: nothing to answer.
  IF v_msg.audio_duration_ms IS NOT NULL
     AND (v_msg.transcript_status IS DISTINCT FROM 'done' OR btrim(COALESCE(v_msg.transcript, '')) = '') THEN
    RETURN QUERY SELECT NULL::uuid, CASE WHEN v_msg.transcript_status = 'pending'
                                         THEN 'transcribing' ELSE 'transcript_failed' END, NULL::uuid;
    RETURN;
  END IF;

  -- A share (a plain message with an attachment and no text) is filed quietly: no new job, no reply.
  IF v_msg.kind = 'message' AND v_msg.attachment_id IS NOT NULL AND btrim(coalesce(v_msg.body, '')) = ''
     AND NOT EXISTS (SELECT 1 FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id) THEN
    RETURN;
  END IF;

  INSERT INTO public.mirror_jobs (owner_id, kind, trigger_message_id, context_conversation_id)
  VALUES (v_uid, CASE WHEN v_msg.context_conversation_id IS NULL THEN 'reply' ELSE 'ask' END,
          v_msg.id, v_msg.context_conversation_id)
  ON CONFLICT (trigger_message_id) WHERE trigger_message_id IS NOT NULL DO NOTHING;

  RETURN QUERY
    SELECT j.id, j.state, j.reply_message_id FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id;
END;
$$;
REVOKE ALL ON FUNCTION public.mirror_request_reply(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_request_reply(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public._mirror_begin_job(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- see the header: 50,000 tokens x 3 chars; and a row cap that keeps the payload bounded
  c_chars    constant integer := 150000;
  c_rows     constant integer := 2000;
  v_job      public.mirror_jobs;
  v_msg      public.chat_messages;
  v_mirror   public.chat_conversations;
  v_since    timestamptz;
  v_ctx      jsonb;
  v_out      jsonb;
  v_total    integer;
  v_ids      uuid[];
  v_out_ids  uuid[];
  v_locked   uuid[];
  v_refs     text[];
  v_spend    uuid;
  v_owner    text;
  v_channel  text;
  v_question jsonb;
BEGIN
  -- LOCK ORDER (no cycle with erase_chat_data_for, which takes message rows, then the context lock
  -- exclusively, then jobs): this function takes context rows FOR SHARE, then the context lock SHARED, then
  -- the job row. The first read of the job is unlocked; its state is checked again under the lock below.
  SELECT * INTO v_job FROM public.mirror_jobs j WHERE j.id = p_job AND j.kind IN ('reply', 'ask');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  IF v_job.state = 'done' THEN
    RETURN jsonb_build_object('status', 'done', 'reply_message_id', v_job.reply_message_id);
  END IF;
  IF v_job.state = 'cancelled' THEN
    RETURN jsonb_build_object('status', 'cancelled');
  END IF;
  IF v_job.state = 'running' AND v_job.started_at > now() - interval '3 minutes' THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;
  IF v_job.attempts >= 3 THEN
    UPDATE public.mirror_jobs j SET state = 'failed', error_code = COALESCE(j.error_code, 'attempts'),
           finished_at = now() WHERE j.id = p_job;
    RETURN jsonb_build_object('status', 'failed');
  END IF;

  SELECT * INTO v_msg FROM public.chat_messages m WHERE m.id = v_job.trigger_message_id;
  SELECT * INTO v_mirror FROM public.chat_conversations c WHERE c.id = v_msg.conversation_id;
  IF v_msg.deleted_at IS NOT NULL OR v_mirror.kind <> 'mirror' OR v_mirror.owner_id <> v_job.owner_id THEN
    UPDATE public.mirror_jobs j SET state = 'cancelled', finished_at = now() WHERE j.id = p_job;
    RETURN jsonb_build_object('status', 'cancelled');
  END IF;
  -- P1576 backstop: the Mirror never answers a voice note before its transcript is done.
  IF v_msg.audio_duration_ms IS NOT NULL
     AND (v_msg.transcript_status IS DISTINCT FROM 'done' OR btrim(COALESCE(v_msg.transcript, '')) = '') THEN
    IF v_msg.transcript_status IS DISTINCT FROM 'pending' THEN
      UPDATE public.mirror_jobs j SET state = 'cancelled', error_code = 'transcript_failed', finished_at = now()
       WHERE j.id = p_job;
      RETURN jsonb_build_object('status', 'cancelled');
    END IF;
    RETURN jsonb_build_object('status', 'waiting');
  END IF;
  SELECT split_part(COALESCE(p.name, ''), ' ', 1) INTO v_owner FROM public.profiles p WHERE p.id = v_job.owner_id;

  IF v_job.kind = 'ask' THEN
    v_since := public._chat_access_since(v_job.context_conversation_id, v_job.owner_id);
    IF v_since IS NULL THEN
      UPDATE public.mirror_jobs j SET state = 'cancelled', error_code = 'no_access', finished_at = now()
       WHERE j.id = p_job;
      RETURN jsonb_build_object('status', 'cancelled');
    END IF;
    SELECT CASE c.kind
             WHEN 'group' THEN (SELECT o.name || ' · General' FROM public.organization o WHERE o.id = c.org_id)
             WHEN 'event' THEN (SELECT e.title FROM public.events e WHERE e.id = c.event_id)
           END
      INTO v_channel FROM public.chat_conversations c WHERE c.id = v_job.context_conversation_id;

    -- The main-channel messages the owner may read, up to the moment of the ask, newest first within the
    -- offer bound; locked below in one pass, then read.
    v_ids := ARRAY(
        SELECT s.id FROM (
          SELECT x.id, sum(public._mirror_ask_row_chars(x)) OVER (ORDER BY x.created_at DESC, x.id DESC
                   ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
            FROM public.chat_messages x
           WHERE x.conversation_id = v_job.context_conversation_id AND x.thread_root_id IS NULL
             AND x.deleted_at IS NULL AND x.created_at >= v_since AND x.created_at <= v_msg.created_at
           ORDER BY x.created_at DESC, x.id DESC LIMIT c_rows) s
         WHERE COALESCE(s.before, 0) < c_chars);

    v_out_ids := '{}';
    -- ONE lock pass over every offered row, FOR SHARE SKIP LOCKED (P1547 review 2). erase_chat_data_for
    -- locks rows in phases (the erased person's own rows, then copies of them, then copied threads, then
    -- titles), so a start that WAITED on one of those rows while holding another could deadlock with it.
    -- A row an erase (or an edit) holds is skipped instead: never read, never sent, and absent from
    -- derived_refs, which are computed from exactly the rows locked and read below. Rows this start does
    -- lock are ones the erase has not reached yet; the erase then waits for this transaction and, under
    -- the context lock, cancels the job by the refs recorded here.
    SELECT COALESCE(array_agg(q.id), '{}') INTO v_locked FROM (
      SELECT m.id FROM public.chat_messages m WHERE m.id = ANY(v_ids || v_out_ids)
       ORDER BY m.created_at, m.id FOR SHARE SKIP LOCKED) q;
    -- The message this job answers must be among the rows read: if an edit or erase holds it, SKIP LOCKED
    -- would drop it and the model would answer an older message (P1547 review 3). Busy; the client retries.
    IF v_msg.id = ANY(v_ids || v_out_ids) AND NOT (v_msg.id = ANY(v_locked)) THEN
      RETURN jsonb_build_object('status', 'busy');
    END IF;
    v_ids := ARRAY(SELECT u FROM unnest(v_ids) u WHERE u = ANY(v_locked));
    v_out_ids := ARRAY(SELECT u FROM unnest(v_out_ids) u WHERE u = ANY(v_locked));

    -- Erasure takes this lock exclusively before it cancels derived jobs, so refs recorded below are seen
    -- by it. TRY, never wait: waiting here while holding the rows above could close a cycle with an erase
    -- that holds the lock and wants one of those rows. An erase under way means "busy"; the client retries.
    IF NOT pg_try_advisory_xact_lock_shared(hashtext('p1520_mirror_context')) THEN
      RETURN jsonb_build_object('status', 'busy');
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'who',  CASE WHEN t.author_id = v_job.owner_id THEN 'owner' ELSE 'other' END,
             'name', COALESCE(tp.name, 'Deleted user'),
             'body', COALESCE(t.body, CASE WHEN t.transcript_status = 'done' THEN t.transcript END),
             'voice', CASE WHEN t.audio_duration_ms IS NOT NULL
                           THEN CASE WHEN t.transcript_status = 'done' THEN 'transcript' ELSE 'untranscribed' END
                      END,
             'quoted', CASE WHEN t.forward_snapshot IS NULL THEN NULL
                            ELSE jsonb_build_object('name', t.forward_snapshot ->> 'author_name',
                                                    'body', t.forward_snapshot ->> 'body') END,
             'attachment', t.attachment_kind,
             'at', t.created_at) ORDER BY t.created_at, t.id), '[]'::jsonb)
      INTO v_ctx
      FROM public.chat_messages t
      LEFT JOIN public.profiles tp ON tp.id = t.author_id
     WHERE t.id = ANY(v_ids) AND t.deleted_at IS NULL;
    v_question := jsonb_build_object('body', left(v_msg.body, 4000));
  ELSE
    -- A mirror-chat reply: the mirror itself, never the channel asks kept there. P1546 scope: a question
    -- inside a thread sees that thread (root and replies) as 'context'; P1547: plus the main chat as
    -- 'outside' (thread roots, never replies). A question outside threads sees the main chat only.
    v_ids := ARRAY(
        SELECT s.id FROM (
          SELECT x.id, sum(public._mirror_row_chars(x)) OVER (ORDER BY x.created_at DESC, x.id DESC
                   ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
            FROM public.chat_messages x
           WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
             AND public._mirror_in_scope(x, v_msg)
             AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at
           ORDER BY x.created_at DESC, x.id DESC LIMIT c_rows) s
         WHERE COALESCE(s.before, 0) < c_chars);
    IF v_msg.thread_root_id IS NOT NULL THEN
      v_out_ids := ARRAY(
          SELECT s.id FROM (
            SELECT x.id, sum(public._mirror_row_chars(x)) OVER (ORDER BY x.created_at DESC, x.id DESC
                     ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
              FROM public.chat_messages x
             WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
               AND x.thread_root_id IS NULL AND x.id <> v_msg.thread_root_id
               AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at
             ORDER BY x.created_at DESC, x.id DESC LIMIT c_rows) s
           WHERE COALESCE(s.before, 0) < c_chars);
    ELSE
      v_out_ids := '{}';
    END IF;

    -- ONE lock pass over every offered row, FOR SHARE SKIP LOCKED (P1547 review 2). erase_chat_data_for
    -- locks rows in phases (the erased person's own rows, then copies of them, then copied threads, then
    -- titles), so a start that WAITED on one of those rows while holding another could deadlock with it.
    -- A row an erase (or an edit) holds is skipped instead: never read, never sent, and absent from
    -- derived_refs, which are computed from exactly the rows locked and read below. Rows this start does
    -- lock are ones the erase has not reached yet; the erase then waits for this transaction and, under
    -- the context lock, cancels the job by the refs recorded here.
    SELECT COALESCE(array_agg(q.id), '{}') INTO v_locked FROM (
      SELECT m.id FROM public.chat_messages m WHERE m.id = ANY(v_ids || v_out_ids)
       ORDER BY m.created_at, m.id FOR SHARE SKIP LOCKED) q;
    -- The message this job answers must be among the rows read: if an edit or erase holds it, SKIP LOCKED
    -- would drop it and the model would answer an older message (P1547 review 3). Busy; the client retries.
    IF v_msg.id = ANY(v_ids || v_out_ids) AND NOT (v_msg.id = ANY(v_locked)) THEN
      RETURN jsonb_build_object('status', 'busy');
    END IF;
    v_ids := ARRAY(SELECT u FROM unnest(v_ids) u WHERE u = ANY(v_locked));
    v_out_ids := ARRAY(SELECT u FROM unnest(v_out_ids) u WHERE u = ANY(v_locked));

    -- Erasure takes this lock exclusively before it cancels derived jobs, so refs recorded below are seen
    -- by it. TRY, never wait: waiting here while holding the rows above could close a cycle with an erase
    -- that holds the lock and wants one of those rows. An erase under way means "busy"; the client retries.
    IF NOT pg_try_advisory_xact_lock_shared(hashtext('p1520_mirror_context')) THEN
      RETURN jsonb_build_object('status', 'busy');
    END IF;

    SELECT COALESCE(jsonb_agg(public._mirror_context_item(t) ORDER BY t.created_at, t.id), '[]'::jsonb)
      INTO v_ctx
      FROM public.chat_messages t WHERE t.id = ANY(v_ids) AND t.deleted_at IS NULL;
    IF v_msg.thread_root_id IS NOT NULL THEN
      SELECT COALESCE(jsonb_agg(public._mirror_context_item(t) ORDER BY t.created_at, t.id), '[]'::jsonb)
        INTO v_out
        FROM public.chat_messages t WHERE t.id = ANY(v_out_ids) AND t.deleted_at IS NULL;
      SELECT count(*) INTO v_total FROM public.chat_messages x
       WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
         AND public._mirror_in_scope(x, v_msg)
         AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at;
    END IF;
    v_question := NULL;  -- the trigger is the last item of the context
  END IF;

  -- whose words are in it, from exactly the rows read (locked, not deleted). A channel ask sends only each
  -- row's author and a forward's original author and body; a mirror row also its copied thread, a 1:1
  -- copy's title, and whatever an earlier mirror answer was derived from.
  IF v_job.kind = 'ask' THEN
    SELECT array_remove(array_agg(DISTINCT r), NULL) INTO v_refs FROM (
      SELECT public._chat_author_ref(t.author_id) AS r
        FROM public.chat_messages t WHERE t.id = ANY(v_ids) AND t.deleted_at IS NULL AND t.author_id IS NOT NULL
      UNION
      SELECT public._chat_author_ref(t.forward_author_id)
        FROM public.chat_messages t WHERE t.id = ANY(v_ids) AND t.deleted_at IS NULL AND t.forward_author_id IS NOT NULL
    ) refs;
  ELSE
    SELECT array_remove(array_agg(DISTINCT r), NULL) INTO v_refs FROM (
      SELECT public._chat_author_ref(t.author_id) AS r
        FROM public.chat_messages t
       WHERE t.id = ANY(v_ids || v_out_ids) AND t.deleted_at IS NULL AND t.author_id IS NOT NULL
      UNION
      SELECT public._chat_author_ref(t.forward_author_id)
        FROM public.chat_messages t
       WHERE t.id = ANY(v_ids || v_out_ids) AND t.deleted_at IS NULL AND t.forward_author_id IS NOT NULL
      UNION
      SELECT e ->> 'author_ref'
        FROM public.chat_messages t,
             jsonb_array_elements(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) e
       WHERE t.id = ANY(v_ids || v_out_ids) AND t.deleted_at IS NULL
      UNION
      SELECT t.forward_snapshot ->> 'conversation_title_ref'
        FROM public.chat_messages t
       WHERE t.id = ANY(v_ids || v_out_ids) AND t.deleted_at IS NULL AND t.forward_snapshot ? 'conversation_title_ref'
      UNION
      SELECT unnest(t.derived_refs)
        FROM public.chat_messages t
       WHERE t.id = ANY(v_ids || v_out_ids) AND t.deleted_at IS NULL AND t.kind = 'agent'
    ) refs;
  END IF;

  -- Now the job row, and its state again: another start may have run while this one waited.
  SELECT * INTO v_job FROM public.mirror_jobs j WHERE j.id = p_job FOR UPDATE;
  IF v_job.state = 'done' THEN
    RETURN jsonb_build_object('status', 'done', 'reply_message_id', v_job.reply_message_id);
  END IF;
  IF v_job.state = 'cancelled' THEN
    RETURN jsonb_build_object('status', 'cancelled');
  END IF;
  IF (v_job.state = 'running' AND v_job.started_at > now() - interval '3 minutes') OR v_job.attempts >= 3 THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;

  -- A restarted dead attempt may still have been billed: its reservation is charged in full, never released.
  IF v_job.state = 'running' AND v_job.spend_id IS NOT NULL THEN
    UPDATE public.mirror_ai_spend s SET actual_usd = s.reserved_usd, state = 'settled', settled_at = now()
     WHERE s.id = v_job.spend_id AND s.state = 'reserved';
  END IF;
  v_spend := public._mirror_reserve(v_job.owner_id, 'reply', (public._mirror_limits() ->> 'reply_max_usd')::numeric);
  IF v_spend IS NULL THEN
    UPDATE public.mirror_jobs j SET state = 'capped', error_code = 'cap', finished_at = now() WHERE j.id = p_job;
    RETURN jsonb_build_object('status', 'capped');
  END IF;

  UPDATE public.mirror_jobs j
     SET state = 'running', attempts = j.attempts + 1, started_at = now(), finished_at = NULL,
         error_code = NULL, derived_refs = COALESCE(v_refs, '{}'), spend_id = v_spend
   WHERE j.id = p_job;

  RETURN jsonb_build_object(
    'status', 'run',
    'kind', v_job.kind,
    'owner_id', v_job.owner_id,
    'mirror_name', v_mirror.title,
    'owner_first_name', NULLIF(v_owner, ''),
    'channel_title', v_channel,
    'question', v_question,
    'context', v_ctx,
    'outside', v_out,
    'thread_total', v_total,
    'reserved_usd', (public._mirror_limits() ->> 'reply_max_usd')::numeric,
    'attempt', v_job.attempts + 1);
END;
$$;
REVOKE ALL ON FUNCTION public._mirror_begin_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._mirror_begin_job(uuid) TO service_role;

-- Deploy-time assertions
DO $assert$
DECLARE
  f record;
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'chat_commit_voice_note') <> 1 THEN
    RAISE EXCEPTION 'P1576: chat_commit_voice_note must exist exactly once';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = '_chat_voice_guard') THEN
    RAISE EXCEPTION 'P1576: the mirror voice guard must be gone';
  END IF;
  FOR f IN
    SELECT p.oid, p.proname,
           (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                                         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')) AS public_exec
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('chat_commit_voice_note', 'chat_voice_check_post', 'chat_voice_reserve_upload', '_mirror_begin_job')
  LOOP
    IF has_function_privilege('anon', f.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', f.oid, 'EXECUTE') OR f.public_exec THEN
      RAISE EXCEPTION 'P1576: a client role can execute public.%', f.proname;
    END IF;
  END LOOP;
END;
$assert$;
