-- P1546: threads in every chat — a 1:1 and the mirror get threads, and the mirror answers inside the
-- thread it was asked in.
--
-- client-safe: function redefinitions only, plus one new internal helper. Every deployed client keeps
--   working: it simply never offered a thread outside channels, and every call it makes is still accepted.
--
-- diffed against: 20261019203000_p1512_clarity_chat.sql (send_chat_message, get_thread_stats,
--   clarify_chat_message) and
--   20261020213000_p1520_mirror_v2.sql (_mirror_begin_job, _mirror_complete_job). Each body below is that
--   file's, with only these changes:
--   * send_chat_message: the "threads are for channels" refusal is removed. A thread root must still be a
--     live root of THIS conversation that the caller can read.
--   * get_thread_stats: the channel-only early return is removed.
--   * clarify_chat_message: the copied thread leaves out mirror agent answers and private asks
--     (kind 'agent' or context_conversation_id set), which a mirror thread can now contain.
--   * _mirror_begin_job: every mirror-chat context read also filters by _mirror_in_scope(x, trigger).
--   * _mirror_complete_job: the answer carries the trigger's thread_root_id, and a thread answer does not
--     move the mirror's last_message_at (a thread reply never does).
--
-- No RLS change: chat_messages_select is per conversation, so a thread reply in a 1:1 is readable by the
-- two people and in the mirror by its owner only, exactly as every other row of that conversation.

DROP FUNCTION IF EXISTS public.send_chat_message(uuid, text, uuid, uuid, text, uuid);
CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_conversation    uuid,
  p_body            text,
  p_reply_to        uuid DEFAULT NULL,
  p_thread_root     uuid DEFAULT NULL,
  p_attachment_kind text DEFAULT NULL,
  p_attachment_id   uuid DEFAULT NULL,
  p_client_id       uuid DEFAULT NULL
)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_conv  public.chat_conversations;
  v_since timestamptz;
  v_body  text;
  v_row   public.chat_messages;
BEGIN
  v_conv  := public._chat_assert_can_post(p_conversation, v_uid);
  v_since := public._chat_access_since(p_conversation, v_uid);

  -- Idempotent retry: this author already sent with this client id, so return THAT row. Reusing the
  -- id for a different conversation is an error, never a cross-post.
  IF p_client_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = v_uid AND m.client_id = p_client_id;
    IF FOUND THEN
      IF v_row.conversation_id <> p_conversation THEN
        RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
      END IF;
      -- A replay is a READ of the stored row, so it follows today's visibility: a message from a
      -- membership that has since ended (left and rejoined) is not handed back.
      IF v_row.created_at < v_since THEN
        RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
      END IF;
      RETURN v_row;
    END IF;
  END IF;

  v_body := NULLIF(btrim(COALESCE(p_body, '')), '');
  IF (p_attachment_kind IS NULL) <> (p_attachment_id IS NULL) THEN
    RAISE EXCEPTION 'chat: an attachment needs a kind and an id' USING ERRCODE = '22023';
  END IF;
  IF p_attachment_kind IS NOT NULL AND p_attachment_kind NOT IN ('point', 'story') THEN
    RAISE EXCEPTION 'chat: unknown attachment kind' USING ERRCODE = '22023';
  END IF;
  IF v_body IS NULL AND p_attachment_id IS NULL THEN
    RAISE EXCEPTION 'chat: empty message' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'chat: message too long' USING ERRCODE = '22023';
  END IF;
  -- One error for "does not exist" and "exists but you cannot see it", so ids cannot be probed.
  IF p_attachment_id IS NOT NULL AND NOT public._chat_can_attach(p_attachment_kind, p_attachment_id, v_uid) THEN
    RAISE EXCEPTION 'chat: attachment not available' USING ERRCODE = '22023';
  END IF;

  -- P1546: every conversation kind has threads (a 1:1 and the mirror too); who may read a reply is
  -- whoever may read its conversation, so the RLS on chat_messages needs no change.
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

  -- clock_timestamp(), not now(): now() is the START of this transaction, which can be earlier than
  -- another device's read marker written while this call was running (unread would miscount).
  INSERT INTO public.chat_messages
    (conversation_id, author_id, body, reply_to_id, thread_root_id, kind, attachment_kind, attachment_id,
     client_id, created_at)
  VALUES
    (p_conversation, v_uid, v_body, p_reply_to, p_thread_root, 'message', p_attachment_kind, p_attachment_id,
     p_client_id, clock_timestamp())
  ON CONFLICT (author_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    -- a concurrent call with the same client id committed first: return its row
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = v_uid AND m.client_id = p_client_id;
    IF v_row.conversation_id <> p_conversation THEN
      RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
    END IF;
    IF v_row.created_at < v_since THEN
      RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
    END IF;
    RETURN v_row;
  END IF;

  IF p_thread_root IS NULL THEN
    UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = p_conversation;
    -- Writing in a chat means you are in it: your own send clears a manual "unread" mark and moves
    -- your read marker to the new message. (Thread replies do not: the thread is not the channel.)
    INSERT INTO public.chat_member_state (conversation_id, profile_id, last_read_at, manual_unread)
    VALUES (p_conversation, v_uid, v_row.created_at, false)
    ON CONFLICT (conversation_id, profile_id) DO UPDATE
      SET last_read_at  = GREATEST(COALESCE(public.chat_member_state.last_read_at, '-infinity'::timestamptz),
                                   EXCLUDED.last_read_at),
          manual_unread = false;
  END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.send_chat_message(uuid, text, uuid, uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_chat_message(uuid, text, uuid, uuid, text, uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_thread_stats(uuid, uuid[]);
-- Reply counts and the most recent repliers for a page of thread roots, aggregated in one pass on
-- the server (a client-side select of the replies would be cut by row limits across roots). Only
-- roots of THIS conversation that the caller can read are answered, so an id from another chat is
-- simply absent from the result. Every conversation kind (P1546); at most 100 roots per call.
CREATE FUNCTION public.get_thread_stats(p_conversation uuid, p_roots uuid[])
RETURNS TABLE (root_id uuid, reply_count integer, recent_author_ids uuid[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid   uuid := auth.uid();
  v_since timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  v_since := public._chat_access_since(p_conversation, v_uid);
  IF v_since IS NULL THEN
    RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(cardinality(p_roots), 0) > 100 THEN
    RAISE EXCEPTION 'chat: at most 100 threads per call' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(cardinality(p_roots), 0) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH roots AS (
    SELECT m.id AS rid FROM public.chat_messages m
     WHERE m.id = ANY(p_roots) AND m.conversation_id = p_conversation
       AND m.thread_root_id IS NULL AND m.created_at >= v_since
  ), replies AS (
    SELECT m.thread_root_id AS rid, m.author_id, m.created_at
      FROM public.chat_messages m
     WHERE m.conversation_id = p_conversation
       AND m.thread_root_id IN (SELECT r.rid FROM roots r)
       AND m.deleted_at IS NULL AND m.created_at >= v_since
  ), counts AS (
    SELECT x.rid, count(*)::integer AS n FROM replies x GROUP BY x.rid
  ), recent AS (
    SELECT x.rid, x.author_id, max(x.created_at) AS last_at
      FROM replies x WHERE x.author_id IS NOT NULL GROUP BY x.rid, x.author_id
  ), ranked AS (
    SELECT y.rid, y.author_id, row_number() OVER (PARTITION BY y.rid ORDER BY y.last_at DESC, y.author_id) AS rn
      FROM recent y
  )
  SELECT r.rid,
         COALESCE(c.n, 0),
         COALESCE((SELECT array_agg(k.author_id ORDER BY k.rn) FROM ranked k WHERE k.rid = r.rid AND k.rn <= 3),
                  '{}'::uuid[])
    FROM roots r
    LEFT JOIN counts c ON c.rid = r.rid;
END;
$$;
REVOKE ALL ON FUNCTION public.get_thread_stats(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_thread_stats(uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.clarify_chat_message(p_source uuid, p_note text DEFAULT NULL)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_src       public.chat_messages;
  v_since     timestamptz;
  v_src_kind  text;
  v_author    text;
  v_root      uuid;
  v_thread    jsonb;
  v_base      jsonb;
  v_orig_id   uuid;
  v_mirror    uuid;
  v_title     text;
  v_title_ref text;
  v_src_conv  public.chat_conversations;
  v_row       public.chat_messages;
  v_note      text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  -- The clarifier's own words on top of the copy: ONE message (quote + note), like a forward's note.
  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 4000 THEN
    RAISE EXCEPTION 'chat: message too long' USING ERRCODE = '22023';
  END IF;
  -- FOR SHARE: see forward_chat_message (serialises with an in-flight erase).
  SELECT m.* INTO v_src FROM public.chat_messages m
   WHERE m.id = p_source
     AND m.created_at >= COALESCE(public._chat_access_since(m.conversation_id, v_uid), 'infinity'::timestamptz)
     FOR SHARE;
  IF NOT FOUND OR v_src.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;
  v_since := public._chat_access_since(v_src.conversation_id, v_uid);
  v_mirror := public._chat_ensure_mirror(v_uid);

  v_root := COALESCE(v_src.thread_root_id, v_src.id);
  -- P1546: a mirror thread can now hold mirror agent answers and private asks. Neither is ever copied (as
  -- _mirror_refuse_agent_copy refuses a direct copy): a copied answer would keep text derived from other
  -- people's words where erasure's derived_refs cannot find it.
  -- Lock the thread rows first (a separate statement, so the aggregate below reads a snapshot taken
  -- AFTER any erase that was holding them has committed).
  PERFORM 1 FROM public.chat_messages x
   WHERE (x.id = v_root OR x.thread_root_id = v_root)
     AND x.id <> v_src.id
     AND x.conversation_id = v_src.conversation_id
     AND x.kind <> 'agent' AND x.context_conversation_id IS NULL
     AND x.created_at >= v_since
   ORDER BY x.created_at, x.id
   FOR SHARE;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'author_ref', public._chat_author_ref(t.author_id),
           'author_name', COALESCE(tp.name, 'Deleted user'),
           'body', t.body,
           'created_at', t.created_at) ORDER BY t.created_at, t.id), '[]'::jsonb)
    INTO v_thread
    FROM (SELECT x.* FROM public.chat_messages x
           WHERE (x.id = v_root OR x.thread_root_id = v_root)
             AND x.id <> v_src.id
             AND x.conversation_id = v_src.conversation_id
             AND x.kind <> 'agent' AND x.context_conversation_id IS NULL
             AND x.deleted_at IS NULL
             AND x.created_at >= v_since
           ORDER BY x.created_at, x.id
           LIMIT 100) t
    LEFT JOIN public.profiles tp ON tp.id = t.author_id;

  IF v_src.kind = 'message' THEN
    SELECT * INTO v_src_conv FROM public.chat_conversations c WHERE c.id = v_src.conversation_id;
    SELECT COALESCE(p.name, 'Deleted user') INTO v_author
      FROM (SELECT 1) one LEFT JOIN public.profiles p ON p.id = v_src.author_id;
    -- "Clarified from <author> in <title>": the title as the CLARIFIER sees the chat.
    IF v_src_conv.kind = 'dm' THEN
      SELECT COALESCE(p.name, 'Deleted user'),
             public._chat_author_ref(CASE WHEN v_src_conv.dm_user_a = v_uid THEN v_src_conv.dm_user_b ELSE v_src_conv.dm_user_a END)
        INTO v_title, v_title_ref
        FROM (SELECT 1) one
        LEFT JOIN public.profiles p
               ON p.id = CASE WHEN v_src_conv.dm_user_a = v_uid THEN v_src_conv.dm_user_b ELSE v_src_conv.dm_user_a END;
    ELSIF v_src_conv.kind = 'group' THEN
      SELECT o.name || ' · General' INTO v_title FROM public.organization o WHERE o.id = v_src_conv.org_id;
    ELSIF v_src_conv.kind = 'event' THEN
      SELECT e.title INTO v_title FROM public.events e WHERE e.id = v_src_conv.event_id;
    ELSE
      v_title := COALESCE(v_src_conv.title, 'Mirror');
    END IF;
    v_base := jsonb_build_object(
      'author_name', v_author,
      'body', v_src.body,
      'created_at', v_src.created_at,
      'conversation_kind', v_src_conv.kind,
      'conversation_title', v_title);
    -- the other person's opaque ref, so erasing THEM can blank their name out of this title
    IF v_title_ref IS NOT NULL THEN
      v_base := v_base || jsonb_build_object('conversation_title_ref', v_title_ref);
    END IF;
    v_orig_id := v_src.author_id;
  ELSE
    v_base := v_src.forward_snapshot - 'thread';
    v_orig_id := v_src.forward_author_id;
  END IF;

  INSERT INTO public.chat_messages
    (conversation_id, author_id, body, kind, forward_snapshot, forward_author_id,
     forwarded_from_message_id, attachment_kind, attachment_id, created_at)
  VALUES
    (v_mirror, v_uid, v_note, 'clarify', v_base || jsonb_build_object('thread', v_thread), v_orig_id,
     v_src.id, v_src.attachment_kind, v_src.attachment_id, clock_timestamp())
  RETURNING * INTO v_row;

  UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = v_mirror;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_chat_message(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_chat_message(uuid, text) TO authenticated;

-- P1546: is row x in the context of a mirror question m? Asked inside a thread: the thread's root and its
-- replies. Asked outside threads: rows outside threads. (The general context rules stay P1520's until P1547.)
CREATE OR REPLACE FUNCTION public._mirror_in_scope(x public.chat_messages, m public.chat_messages)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN m.thread_root_id IS NULL THEN x.thread_root_id IS NULL
              ELSE x.id = m.thread_root_id OR x.thread_root_id = m.thread_root_id END;
$$;
REVOKE ALL ON FUNCTION public._mirror_in_scope(public.chat_messages, public.chat_messages) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._mirror_begin_job(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job      public.mirror_jobs;
  v_msg      public.chat_messages;
  v_mirror   public.chat_conversations;
  v_since    timestamptz;
  v_ctx      jsonb;
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

    -- Lock first (separate statement), then read: the context is the last 30 main-channel messages the
    -- owner may read, up to the moment of the ask.
    PERFORM 1 FROM (
      SELECT x.id FROM public.chat_messages x
       WHERE x.conversation_id = v_job.context_conversation_id AND x.thread_root_id IS NULL
         AND x.deleted_at IS NULL AND x.created_at >= v_since AND x.created_at <= v_msg.created_at
       ORDER BY x.created_at DESC, x.id DESC LIMIT 30) ids
      JOIN public.chat_messages m ON m.id = ids.id
     ORDER BY m.created_at, m.id
       FOR SHARE OF m;

    -- Erasure takes this lock exclusively before it cancels derived jobs, so refs recorded below are seen
    -- by it. TRY, never wait: waiting here while holding the rows above could close a cycle with an erase
    -- that holds the lock and wants one of those rows. An erase under way means "busy"; the client retries.
    IF NOT pg_try_advisory_xact_lock_shared(hashtext('p1520_mirror_context')) THEN
      RETURN jsonb_build_object('status', 'busy');
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'who',  CASE WHEN t.author_id = v_job.owner_id THEN 'owner' ELSE 'other' END,
             'name', COALESCE(tp.name, 'Deleted user'),
             'body', left(t.body, 1000),
             'quoted', CASE WHEN t.forward_snapshot IS NULL THEN NULL
                            ELSE jsonb_build_object('name', t.forward_snapshot ->> 'author_name',
                                                    'body', left(t.forward_snapshot ->> 'body', 1000)) END,
             'attachment', t.attachment_kind,
             'at', t.created_at) ORDER BY t.created_at, t.id), '[]'::jsonb),
           array_remove(
             array_agg(DISTINCT public._chat_author_ref(t.author_id)) FILTER (WHERE t.author_id IS NOT NULL)
             || array_agg(DISTINCT public._chat_author_ref(t.forward_author_id)) FILTER (WHERE t.forward_author_id IS NOT NULL),
             NULL)
      INTO v_ctx, v_refs
      FROM (SELECT x.* FROM public.chat_messages x
             WHERE x.conversation_id = v_job.context_conversation_id AND x.thread_root_id IS NULL
               AND x.deleted_at IS NULL AND x.created_at >= v_since AND x.created_at <= v_msg.created_at
             ORDER BY x.created_at DESC, x.id DESC LIMIT 30) t
      LEFT JOIN public.profiles tp ON tp.id = t.author_id;
    v_question := jsonb_build_object('body', left(v_msg.body, 4000));
  ELSE
    -- A mirror-chat reply: the last 30 rows of the mirror itself, never the channel asks kept there. P1546: a
    -- question asked inside a thread sees that thread (root and replies); one outside threads sees no thread replies.
    PERFORM 1 FROM (
      SELECT x.id FROM public.chat_messages x
       WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
         AND public._mirror_in_scope(x, v_msg)
         AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at
       ORDER BY x.created_at DESC, x.id DESC LIMIT 30) ids
      JOIN public.chat_messages m ON m.id = ids.id
     ORDER BY m.created_at, m.id
       FOR SHARE OF m;

    -- Erasure takes this lock exclusively before it cancels derived jobs, so refs recorded below are seen
    -- by it. TRY, never wait: waiting here while holding the rows above could close a cycle with an erase
    -- that holds the lock and wants one of those rows. An erase under way means "busy"; the client retries.
    IF NOT pg_try_advisory_xact_lock_shared(hashtext('p1520_mirror_context')) THEN
      RETURN jsonb_build_object('status', 'busy');
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'who',  CASE WHEN t.kind = 'agent' THEN 'mirror' ELSE 'owner' END,
             'body', left(t.body, 1000),
             'clarify', CASE WHEN t.kind IN ('clarify', 'forward') AND t.forward_snapshot IS NOT NULL THEN
                          jsonb_build_object(
                            'from',  t.forward_snapshot ->> 'author_name',
                            'in',    t.forward_snapshot ->> 'conversation_title',
                            'body',  left(t.forward_snapshot ->> 'body', 1000),
                            'thread', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                                'name', e ->> 'author_name', 'body', left(e ->> 'body', 500))
                                              ORDER BY ord), '[]'::jsonb)
                                         FROM (SELECT e, ord FROM jsonb_array_elements(
                                                 COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb))
                                                 WITH ORDINALITY AS a(e, ord)
                                               ORDER BY ord DESC LIMIT 10) last10))
                        END,
             'attachment', t.attachment_kind,
             'at', t.created_at) ORDER BY t.created_at, t.id), '[]'::jsonb)
      INTO v_ctx
      FROM (SELECT x.* FROM public.chat_messages x
             WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
         AND public._mirror_in_scope(x, v_msg)
               AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at
             ORDER BY x.created_at DESC, x.id DESC LIMIT 30) t;

    -- whose words are in it: the original authors of copies, every copied thread entry, and whatever an
    -- earlier mirror reply in the context was itself derived from
    SELECT array_remove(array_agg(DISTINCT r), NULL) INTO v_refs FROM (
      SELECT public._chat_author_ref(t.forward_author_id) AS r
        FROM (SELECT x.* FROM public.chat_messages x
               WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
         AND public._mirror_in_scope(x, v_msg)
                 AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at
               ORDER BY x.created_at DESC, x.id DESC LIMIT 30) t
       WHERE t.forward_author_id IS NOT NULL
      UNION
      SELECT e ->> 'author_ref'
        FROM (SELECT x.* FROM public.chat_messages x
               WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
         AND public._mirror_in_scope(x, v_msg)
                 AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at
               ORDER BY x.created_at DESC, x.id DESC LIMIT 30) t,
             jsonb_array_elements(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) e
      UNION
      -- a 1:1 clarify carries the other person's name as its title
      SELECT t.forward_snapshot ->> 'conversation_title_ref'
        FROM (SELECT x.* FROM public.chat_messages x
               WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
         AND public._mirror_in_scope(x, v_msg)
                 AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at
               ORDER BY x.created_at DESC, x.id DESC LIMIT 30) t
       WHERE t.forward_snapshot ? 'conversation_title_ref'
      UNION
      SELECT unnest(t.derived_refs)
        FROM (SELECT x.* FROM public.chat_messages x
               WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
         AND public._mirror_in_scope(x, v_msg)
                 AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at
               ORDER BY x.created_at DESC, x.id DESC LIMIT 30) t
       WHERE t.kind = 'agent'
    ) refs;
    v_question := NULL;  -- the trigger is the last item of the context
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
    'reserved_usd', (public._mirror_limits() ->> 'reply_max_usd')::numeric,
    'attempt', v_job.attempts + 1);
END;
$$;
REVOKE ALL ON FUNCTION public._mirror_begin_job(uuid) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public._mirror_complete_job(uuid, text, numeric);
DROP FUNCTION IF EXISTS public._mirror_complete_job(uuid, text, numeric, integer);
CREATE FUNCTION public._mirror_complete_job(p_job uuid, p_body text, p_actual_usd numeric, p_attempt integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job  public.mirror_jobs;
  v_msg  public.chat_messages;
  v_body text;
  v_row  public.chat_messages;
BEGIN
  -- Lock order as in _mirror_begin_job: the message row before the job row.
  SELECT m.* INTO v_msg FROM public.chat_messages m
    JOIN public.mirror_jobs j ON j.trigger_message_id = m.id
   WHERE j.id = p_job AND j.kind IN ('reply', 'ask')
     FOR SHARE OF m;
  SELECT * INTO v_job FROM public.mirror_jobs j WHERE j.id = p_job AND j.kind IN ('reply', 'ask') FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  -- A late answer from an abandoned attempt touches nothing: its reservation was charged in full when the
  -- job restarted, and the current attempt's reservation belongs to the current attempt.
  IF p_attempt IS NOT NULL AND p_attempt <> v_job.attempts THEN
    RETURN NULL;
  END IF;
  IF v_job.spend_id IS NOT NULL THEN
    PERFORM public._mirror_settle(v_job.spend_id, p_actual_usd);
  END IF;
  IF v_job.state <> 'running' THEN
    RETURN NULL;
  END IF;

  IF v_msg.id IS NULL OR v_msg.deleted_at IS NOT NULL
     OR (v_job.kind = 'ask' AND public._chat_access_since(v_job.context_conversation_id, v_job.owner_id) IS NULL) THEN
    UPDATE public.mirror_jobs j SET state = 'cancelled', finished_at = now() WHERE j.id = p_job;
    RETURN NULL;
  END IF;
  v_body := NULLIF(btrim(COALESCE(p_body, '')), '');
  IF v_body IS NULL THEN
    UPDATE public.mirror_jobs j SET state = 'failed', error_code = 'empty', finished_at = now() WHERE j.id = p_job;
    RETURN NULL;
  END IF;

  -- P1546: the answer goes where the question was asked: inside its thread, or outside threads.
  INSERT INTO public.chat_messages
    (conversation_id, author_id, body, kind, reply_to_id, thread_root_id, context_conversation_id, derived_refs,
     created_at)
  VALUES
    (v_msg.conversation_id, NULL, left(v_body, 4000), 'agent', v_msg.id, v_msg.thread_root_id,
     v_msg.context_conversation_id, v_job.derived_refs, clock_timestamp())
  RETURNING * INTO v_row;

  -- P1546: an answer inside a thread is a thread reply, and a thread reply never moves the chat (as in send).
  IF v_row.thread_root_id IS NULL THEN
    UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = v_msg.conversation_id;
  END IF;
  -- An answer to a channel ask was read where it was asked: if the owner had read their mirror up to the
  -- ask, the answer does not make the mirror unread.
  IF v_job.kind = 'ask' THEN
    UPDATE public.chat_member_state s
       SET last_read_at = v_row.created_at
     WHERE s.conversation_id = v_msg.conversation_id AND s.profile_id = v_job.owner_id
       AND s.last_read_at >= v_msg.created_at;
  END IF;

  UPDATE public.mirror_jobs j
     SET state = 'done', reply_message_id = v_row.id, finished_at = now()
   WHERE j.id = p_job;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public._mirror_complete_job(uuid, text, numeric, integer) FROM PUBLIC, anon, authenticated;

-- DROP FUNCTION above dropped the service-role grant; CREATE OR REPLACE keeps it, re-granted for both all the same.
GRANT EXECUTE ON FUNCTION public._mirror_begin_job(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._mirror_complete_job(uuid, text, numeric, integer) TO service_role;
