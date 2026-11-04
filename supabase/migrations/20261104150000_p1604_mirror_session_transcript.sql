-- Migration: P1604 (11/11) — a Clarified SESSION thread fits a whole 3-hour transcript for the mirror agent (interim, founder-approved)
-- Created: 2026-11-04
-- Spec: features/p1604_transcription_belongs_to_a_chat.md (Cost Budget)
-- Guaranteed by: e2e/integration/p1604-clarify-session-thread.spec.ts, src/tests/p1604-mirror-session-budget.test.ts
--
-- diffed against: 20261104140000_p1604_clarify_session_thread.sql (clarify_chat_message),
--   20261027120600_p1576_mirror_voice_and_waveform.sql (_mirror_begin_job, _mirror_context_item),
--   20261023130000_p1547_review_fixes.sql (_mirror_copy_thread),
--   20261023120000_p1547_mirror_token_budget.sql (_mirror_limits).
--   Each body is that file's with ONLY these changes; every other chat keeps today's numbers exactly.
--   * clarify_chat_message: a SESSION thread (root registered in transcribe_session_threads) keeps its root and the newest 720 other
--     lines (720 = 4 speakers x 180 one-minute blocks in a 3-hour session; was 100), and marks its snapshot session_thread = true.
--   * _mirror_copy_thread: a snapshot marked session_thread is offered up to 180,000 characters (60,000 tokens x 3); others 15,000.
--   * _mirror_context_item: carries session_thread to the edge function.
--   * _mirror_begin_job: when a session copy is among the offered rows, the offer window is widened (300,000 characters = 100,000
--     tokens x 3), the reservation is reply_session_max_usd, and 'session' is returned. Otherwise unchanged.
--   * _mirror_limits: one new key, reply_session_max_usd = (100,000 in x $1.50 + 4,000 out x $7.50) / 1e6 x 1.25 = $0.225.
--
-- client-safe: function bodies only; one new key in a service-role-only JSON.

CREATE OR REPLACE FUNCTION public._mirror_limits()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'reply_max_usd',             0.105,   -- (50000 in x $1.50 + 1200 out x $7.50) / 1e6 x 1.25; mirror-agent.ts BUDGET_TOKENS/MAX_OUT_TOKENS
    'reply_session_max_usd',     0.225,   -- (100000 in x $1.50 + 4000 out x $7.50) / 1e6 x 1.25; mirror-agent.ts SESSION_* (a Clarified session thread)
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

CREATE OR REPLACE FUNCTION public._mirror_copy_thread(p_snap jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(k.e ORDER BY k.ord), '[]'::jsonb) FROM (
    SELECT s.e, s.ord FROM (
      SELECT jsonb_build_object('name', a.e ->> 'author_name', 'body', a.e ->> 'body') AS e, a.ord,
             sum(COALESCE(char_length(a.e ->> 'body'), 0) + COALESCE(char_length(a.e ->> 'author_name'), 0))
               OVER (ORDER BY a.ord DESC) AS upto
        FROM jsonb_array_elements(COALESCE(p_snap -> 'thread', '[]'::jsonb)) WITH ORDINALITY AS a(e, ord)) s
     -- a Clarified SESSION thread (snapshot flag) is offered up to 60,000 tokens x 3 chars; every other copy keeps 15,000
     WHERE s.upto <= CASE WHEN p_snap ->> 'session_thread' = 'true' THEN 180000 ELSE 15000 END) k;
$$;

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
                   'session_thread', COALESCE((t.forward_snapshot ->> 'session_thread') = 'true', false),
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
  v_total     integer;
  v_outside   boolean;
  v_session   boolean;
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
  -- P1592: the before / conversation / after-round threads hold an event's worth of many speakers' lines. A copy of a line in
  -- one (or of its root) carries that message alone, never the thread: the same as a top-level unseated line before this change.
  -- P1604: a SESSION thread (a root registered in transcribe_session_threads, system_kind 'outside_rounds' as well) is one
  -- transcription session, and Clarify carries its whole thread from the root or from any line, like any other thread.
  SELECT r.system_kind = 'outside_rounds', EXISTS (SELECT 1 FROM public.transcribe_session_threads st WHERE st.root_message_id = r.id)
    INTO v_outside, v_session FROM public.chat_messages r WHERE r.id = v_root;
  v_session := COALESCE(v_session, false);
  v_outside := COALESCE(v_outside, false) AND NOT v_session;
  -- P1546: a mirror thread can now hold mirror agent answers and private asks. Neither is ever copied (as
  -- _mirror_refuse_agent_copy refuses a direct copy): a copied answer would keep text derived from other
  -- people's words where erasure's derived_refs cannot find it.
  -- Lock the thread rows first (a separate statement, so the aggregate below reads a snapshot taken
  -- AFTER any erase that was holding them has committed).
  PERFORM 1 FROM public.chat_messages x
   WHERE NOT v_outside AND (x.id = v_root OR x.thread_root_id = v_root)
     AND x.id <> v_src.id
     AND x.conversation_id = v_src.conversation_id
     AND x.kind <> 'agent' AND x.context_conversation_id IS NULL
     AND x.created_at >= v_since
   ORDER BY x.created_at, x.id
   FOR SHARE;
  -- P1547: the NEWEST 100 entries (stored oldest first), and how many there were, so the mirror can say
  -- "showing the last N of M replies" truthfully.
  SELECT count(*) INTO v_total FROM public.chat_messages x
   WHERE NOT v_outside AND (x.id = v_root OR x.thread_root_id = v_root)
     AND x.id <> v_src.id
     AND x.conversation_id = v_src.conversation_id
     AND x.kind <> 'agent' AND x.context_conversation_id IS NULL
     AND x.deleted_at IS NULL
     AND x.created_at >= v_since;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'author_ref', public._chat_author_ref(t.author_id),
           'author_name', COALESCE(tp.name, 'Deleted user'),
           -- P1592: a copied round-thread root carries "Round {n}" without the names
           'body', CASE WHEN t.system_kind = 'round_thread' THEN public._transcribe_bare_root_title(t.id) ELSE t.body END,
           'created_at', t.created_at,
           'is_transcription', t.is_transcription,
           'system_kind', t.system_kind) ORDER BY t.created_at, t.id), '[]'::jsonb)
    INTO v_thread
    FROM ((SELECT x.* FROM public.chat_messages x
            WHERE NOT v_outside AND (x.id = v_root OR x.thread_root_id = v_root)
              AND x.id <> v_src.id
              AND x.conversation_id = v_src.conversation_id
              AND x.kind <> 'agent' AND x.context_conversation_id IS NULL
              AND x.deleted_at IS NULL
              AND x.created_at >= v_since
              AND NOT (v_session AND x.id = v_root)
            ORDER BY x.created_at DESC, x.id DESC
            LIMIT CASE WHEN v_session THEN 720 ELSE 100 END)
          UNION ALL
          -- a session thread always carries its root (its title, and what tells the mirror it is a transcript), cut or not
          (SELECT x.* FROM public.chat_messages x
            WHERE v_session AND x.id = v_root AND x.id <> v_src.id
              AND x.conversation_id = v_src.conversation_id AND x.deleted_at IS NULL AND x.created_at >= v_since)) t
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
      'body', CASE WHEN v_src.system_kind = 'round_thread' THEN public._transcribe_bare_root_title(v_src.id) ELSE v_src.body END,
      'created_at', v_src.created_at,
      'is_transcription', v_src.is_transcription,
      'system_kind', v_src.system_kind,
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
  -- P1604: the mirror reads this to give a whole transcript its larger budget (mirror-agent.ts SESSION_*)
  IF v_session AND v_src.kind = 'message' THEN
    v_base := v_base || jsonb_build_object('session_thread', true);
  END IF;

  INSERT INTO public.chat_messages
    (conversation_id, author_id, body, kind, forward_snapshot, forward_author_id,
     forwarded_from_message_id, attachment_kind, attachment_id, created_at)
  VALUES
    (v_mirror, v_uid, v_note, 'clarify', v_base || jsonb_build_object('thread', v_thread, 'thread_total', v_total), v_orig_id,
     v_src.id, v_src.attachment_kind, v_src.attachment_id, clock_timestamp())
  RETURNING * INTO v_row;

  UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = v_mirror;
  RETURN v_row;
END;
$$;

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
  v_chars    integer := 150000;   -- the offer bound: c_chars, or the session profile's
  v_session  boolean := false;    -- P1604: a Clarified session thread is among the offered rows
  v_pass     integer;
  v_reply_usd numeric;
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
    -- P1604: a Clarified session thread among the rows widens the offer to its profile (100,000 tokens x 3 chars) and the
    -- selection is made again over the wider window; nothing else changes the offer. mirror-agent.ts reads the same flag.
    FOR v_pass IN 1..2 LOOP
      v_ids := ARRAY(
          SELECT s.id FROM (
            SELECT x.id, sum(public._mirror_row_chars(x)) OVER (ORDER BY x.created_at DESC, x.id DESC
                     ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
              FROM public.chat_messages x
             WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
               AND public._mirror_in_scope(x, v_msg)
               AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at
             ORDER BY x.created_at DESC, x.id DESC LIMIT c_rows) s
           WHERE COALESCE(s.before, 0) < v_chars);
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
             WHERE COALESCE(s.before, 0) < v_chars);
      ELSE
        v_out_ids := '{}';
      END IF;
      v_session := EXISTS (SELECT 1 FROM public.chat_messages x
                            WHERE x.id = ANY(v_ids || v_out_ids) AND x.deleted_at IS NULL
                              AND x.forward_snapshot ->> 'session_thread' = 'true');
      EXIT WHEN v_pass = 2 OR NOT v_session;
      v_chars := 300000;
    END LOOP;

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
  v_reply_usd := (public._mirror_limits() ->> CASE WHEN v_session THEN 'reply_session_max_usd' ELSE 'reply_max_usd' END)::numeric;
  v_spend := public._mirror_reserve(v_job.owner_id, 'reply', v_reply_usd);
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
    'reserved_usd', v_reply_usd,
    'session', v_session,
    'attempt', v_job.attempts + 1);
END;
$$;

REVOKE ALL ON FUNCTION public._mirror_limits() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_copy_thread(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_context_item(public.chat_messages) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_begin_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._mirror_begin_job(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.clarify_chat_message(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_chat_message(uuid, text) TO authenticated;

DO $check$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public._mirror_limits()', 'public._mirror_copy_thread(jsonb)',
                               'public._mirror_context_item(public.chat_messages)', 'public._mirror_begin_job(uuid)']
  LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1604: % is client-callable', v_fn;
    END IF;
  END LOOP;
  IF (public._mirror_limits() ->> 'reply_max_usd')::numeric <> 0.105 THEN
    RAISE EXCEPTION 'P1604: the standard reply reservation must stay 0.105';
  END IF;
END
$check$;
