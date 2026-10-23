-- client-safe: internal service-role functions only; return shapes unchanged or only gain keys/statuses the edge already handles (busy).
-- diffed against: 20261023140000_p1547_review_fixes_2.sql
-- P1547 review round 3: _mirror_begin_job never answers an older message when the one it answers is
-- held by an edit or erase (the single FOR SHARE SKIP LOCKED pass would have dropped it). Same function
-- as 20261023140000 with that check added after both lock passes; grants unchanged.

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
             'body', t.body,
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
