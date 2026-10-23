-- P1547: the mirror remembers — a token budget instead of 30 messages.
--
-- client-safe: function redefinitions plus two internal helpers. _mirror_begin_job keeps its signature
--   and its return keys; it adds 'outside' and 'thread_total' (the edge function reads them, old code
--   ignores them).
--
-- diffed against: 20261022160000_p1546_threads_everywhere.sql (_mirror_begin_job) and
--   20261020213000_p1520_mirror_v2.sql (_mirror_limits). Each body below is that file's, with only these
--   changes:
--   * _mirror_limits: reply_max_usd 0.03 -> 0.105 = (50,000 in x $1.50 + 1,200 out x $7.50) / 1e6 x 1.25,
--     mirror-agent.ts BUDGET_TOKENS / MAX_OUT_TOKENS (src/tests/p1547-mirror-budget.test.ts keeps them equal).
--     Every other value unchanged.
--   * _mirror_begin_job: WHERE the budget is spent is the edge function's (mirror-agent.ts selectNewestFirst:
--     it is the only place that sees the escaped, final request text it measures). This function only
--     offers a bounded superset, newest first, and no longer cuts any text:
--       - rows are taken newest first until their raw size reaches _mirror_offer_chars() (150,000 =
--         50,000 tokens x 3 chars). The edge estimate charges at least one token per three raw characters
--         (more for non-ASCII), so anything older than that cannot fit the budget and is never needed;
--       - and never more than _mirror_offer_rows() rows (500), so the payload stays bounded even for
--         one-character messages: 500 x (<= 4,000-char body + a copy) — and the copies' size is counted,
--         capped at 15,000 each, so few large copies are offered at once.
--     The per-message 1,000/500-character cuts and the 10-entry copied-thread cut are gone (the edge
--     function's item caps replace them).
--     A question in a mirror thread gets the thread as 'context' (P1546's scope, unchanged) plus 'outside':
--     the mirror's main-chat rows, thread roots carrying their reply count ('replies'), never replies.
--     'thread_total' is the thread's whole size, for "showing the last N of M".
--     A channel ask: that channel's main-chat rows the owner may read (P1520's access rules, unchanged).
--   * Erasure provenance: EVERY offered row (a superset of what reaches the request) is locked FOR SHARE
--     and contributes to derived_refs: authors, original authors of copies, every copied thread entry's
--     author, a 1:1 copy's title ref, and the derived_refs of earlier mirror answers (transitive).
--     Over-inclusion only means an erase clears more answers, never fewer.
--
-- LOCK ORDER unchanged (P1520): context rows FOR SHARE, then TRY the context lock shared, then the job row.

CREATE OR REPLACE FUNCTION public._mirror_limits()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'reply_max_usd',             0.105,   -- (50000 in x $1.50 + 1200 out x $7.50) / 1e6 x 1.25; mirror-agent.ts BUDGET_TOKENS/MAX_OUT_TOKENS
    'portrait_max_usd',          0.70,    -- 2 generations x (primary + fallback image) + 2 vision checks, x 1.25
    'person_reply_daily_usd',    0.60,
    'person_reply_daily_count',  30,
    'person_portrait_daily_usd', 2.10,
    'person_portrait_daily_count', 3,
    'global_reply_daily_usd',    5.00,
    'global_portrait_daily_usd', 6.00,
    'global_total_daily_usd',    10.00
  );
$$;
REVOKE ALL ON FUNCTION public._mirror_limits() FROM PUBLIC, anon, authenticated;

-- The raw size a row is counted at when the offer is bounded: its body plus its copy (capped: a copied
-- thread is one item of at most 20% of the budget in the request, so counting it whole would starve the
-- offer of older rows it does have room for).
CREATE OR REPLACE FUNCTION public._mirror_row_chars(x public.chat_messages)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(char_length(x.body), 0) + LEAST(COALESCE(char_length(x.forward_snapshot::text), 0), 15000);
$$;
REVOKE ALL ON FUNCTION public._mirror_row_chars(public.chat_messages) FROM PUBLIC, anon, authenticated;

-- One mirror-chat row as the edge function reads it (P1520's shape, uncut). 'replies': a thread root's
-- live reply count, so a thread the request does not quote appears as its root plus "N replies".
CREATE OR REPLACE FUNCTION public._mirror_context_item(t public.chat_messages)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'who',  CASE WHEN t.kind = 'agent' THEN 'mirror' ELSE 'owner' END,
    'body', t.body,
    'clarify', CASE WHEN t.kind IN ('clarify', 'forward') AND t.forward_snapshot IS NOT NULL THEN
                 jsonb_build_object(
                   'from',   t.forward_snapshot ->> 'author_name',
                   'in',     t.forward_snapshot ->> 'conversation_title',
                   'body',   t.forward_snapshot ->> 'body',
                   'thread', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                       'name', e ->> 'author_name', 'body', e ->> 'body') ORDER BY ord), '[]'::jsonb)
                                FROM jsonb_array_elements(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb))
                                     WITH ORDINALITY AS a(e, ord)))
               END,
    'replies', CASE WHEN t.thread_root_id IS NULL THEN
                 (SELECT count(*) FROM public.chat_messages r
                   WHERE r.thread_root_id = t.id AND r.conversation_id = t.conversation_id AND r.deleted_at IS NULL)
               END,
    'attachment', t.attachment_kind,
    'at', t.created_at);
$$;
REVOKE ALL ON FUNCTION public._mirror_context_item(public.chat_messages) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._mirror_begin_job(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- see the header: 50,000 tokens x 3 chars; and a row cap that keeps the payload bounded
  c_chars    constant integer := 150000;
  c_rows     constant integer := 500;
  v_job      public.mirror_jobs;
  v_msg      public.chat_messages;
  v_mirror   public.chat_conversations;
  v_since    timestamptz;
  v_ctx      jsonb;
  v_out      jsonb;
  v_total    integer;
  v_ids      uuid[];
  v_out_ids  uuid[];
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

    -- Lock first, then read: the main-channel messages the owner may read, up to the moment of the ask,
    -- newest first within the offer bound.
    SELECT COALESCE(array_agg(q.id ORDER BY q.created_at, q.id), '{}') INTO v_ids FROM (
      SELECT m.id, m.created_at FROM (
        SELECT s.id FROM (
          SELECT x.id, sum(public._mirror_row_chars(x)) OVER (ORDER BY x.created_at DESC, x.id DESC
                   ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
            FROM public.chat_messages x
           WHERE x.conversation_id = v_job.context_conversation_id AND x.thread_root_id IS NULL
             AND x.deleted_at IS NULL AND x.created_at >= v_since AND x.created_at <= v_msg.created_at
           ORDER BY x.created_at DESC, x.id DESC LIMIT c_rows) s
         WHERE COALESCE(s.before, 0) < c_chars) ids
      JOIN public.chat_messages m ON m.id = ids.id
     ORDER BY m.created_at, m.id
       FOR SHARE OF m) q;

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
    v_out_ids := '{}';
    v_question := jsonb_build_object('body', left(v_msg.body, 4000));
  ELSE
    -- A mirror-chat reply: the mirror itself, never the channel asks kept there. P1546 scope: a question
    -- inside a thread sees that thread (root and replies) as 'context'; P1547: plus the main chat as
    -- 'outside' (thread roots, never replies). A question outside threads sees the main chat only.
    SELECT COALESCE(array_agg(q.id ORDER BY q.created_at, q.id), '{}') INTO v_ids FROM (
      SELECT m.id, m.created_at FROM (
        SELECT s.id FROM (
          SELECT x.id, sum(public._mirror_row_chars(x)) OVER (ORDER BY x.created_at DESC, x.id DESC
                   ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
            FROM public.chat_messages x
           WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
             AND public._mirror_in_scope(x, v_msg)
             AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at
           ORDER BY x.created_at DESC, x.id DESC LIMIT c_rows) s
         WHERE COALESCE(s.before, 0) < c_chars) ids
      JOIN public.chat_messages m ON m.id = ids.id
     ORDER BY m.created_at, m.id
       FOR SHARE OF m) q;
    IF v_msg.thread_root_id IS NOT NULL THEN
      SELECT COALESCE(array_agg(q.id ORDER BY q.created_at, q.id), '{}') INTO v_out_ids FROM (
        SELECT m.id, m.created_at FROM (
          SELECT s.id FROM (
            SELECT x.id, sum(public._mirror_row_chars(x)) OVER (ORDER BY x.created_at DESC, x.id DESC
                     ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
              FROM public.chat_messages x
             WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
               AND x.thread_root_id IS NULL AND x.id <> v_msg.thread_root_id
               AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at
             ORDER BY x.created_at DESC, x.id DESC LIMIT c_rows) s
           WHERE COALESCE(s.before, 0) < c_chars) ids
        JOIN public.chat_messages m ON m.id = ids.id
       ORDER BY m.created_at, m.id
         FOR SHARE OF m) q;
    ELSE
      v_out_ids := '{}';
    END IF;

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

  -- whose words are in it: every offered row's author, the original authors of copies, every copied
  -- thread entry, a 1:1 copy's title ref, and whatever an earlier mirror reply was itself derived from
  SELECT array_remove(array_agg(DISTINCT r), NULL) INTO v_refs FROM (
    SELECT public._chat_author_ref(t.author_id) AS r
      FROM public.chat_messages t WHERE t.id = ANY(v_ids || v_out_ids) AND t.author_id IS NOT NULL
    UNION
    SELECT public._chat_author_ref(t.forward_author_id)
      FROM public.chat_messages t WHERE t.id = ANY(v_ids || v_out_ids) AND t.forward_author_id IS NOT NULL
    UNION
    SELECT e ->> 'author_ref'
      FROM public.chat_messages t,
           jsonb_array_elements(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) e
     WHERE t.id = ANY(v_ids || v_out_ids)
    UNION
    SELECT t.forward_snapshot ->> 'conversation_title_ref'
      FROM public.chat_messages t
     WHERE t.id = ANY(v_ids || v_out_ids) AND t.forward_snapshot ? 'conversation_title_ref'
    UNION
    SELECT unnest(t.derived_refs)
      FROM public.chat_messages t WHERE t.id = ANY(v_ids || v_out_ids) AND t.kind = 'agent'
  ) refs;

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
