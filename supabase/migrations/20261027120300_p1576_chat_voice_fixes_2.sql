-- P1576 Part B, second follow-up (round-2 review). The earlier voice-notes migrations
-- (20261027120100, 20261027120200) are already applied on the test database, so they are NOT edited.
--
-- client-safe: server-side only. One service-role-only function is redefined with an unchanged signature;
--   no client role can execute it before or after, and nothing else is touched.
--
-- diffed against: 20261027120200_p1576_chat_voice_fixes.sql (chat_commit_voice_note), with ONE change:
--   the per-author advisory lock is taken before the replay lookup instead of after it. A retry of an
--   upload that is already a message is now answered before any quota is charged, so ten overlapping
--   retries cost one ledger row, not ten, and cannot lock the author out with 429 for idempotent replays.
--   Everything else (derived key, replay refusal for non-voice rows, 10 per minute on the commit ledger,
--   thread and reply rules) is that file's body.

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
     audio_duration_ms, transcript_status)
  VALUES
    (p_conversation, p_uid, NULL, p_reply_to, p_thread_root, 'message', p_client_id, clock_timestamp(),
     p_duration_ms, 'pending')
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
REVOKE ALL ON FUNCTION public.chat_commit_voice_note(uuid, uuid, text, integer, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_commit_voice_note(uuid, uuid, text, integer, uuid, uuid, uuid)
  TO service_role;

DO $assert$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid,
           (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                                         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')) AS public_exec
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'chat_commit_voice_note'
  LOOP
    IF has_function_privilege('anon', f.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', f.oid, 'EXECUTE') OR f.public_exec THEN
      RAISE EXCEPTION 'P1576: a client role can execute public.chat_commit_voice_note';
    END IF;
  END LOOP;
END;
$assert$;
