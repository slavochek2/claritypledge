-- client-safe: clarify_start keeps its argument list, SECURITY DEFINER, search_path and grants and its answer only gains a `scope` key; clarify_start_chat is new and granted to authenticated like clarify_start; _clarify_begin (service role, no client caller) keeps its argument list and grants and its run object only gains a `scope` key; point_chat_shared keeps its signature, return type and grants and only changes how the reader's access to the live card is read
-- new function: clarify_start_chat
-- Migration: P1631 Clarify scopes (one message, a whole thread, a whole chat) and a single-point read for point_chat_shared
-- Created: 2026-11-12
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md
-- Guaranteed by: src/tests/p1631-clarify-scope.test.ts (source contract)
--
-- Each replaced function is the newest body copied byte for byte, then the marked lines added (`-- P1631 scope`).
--
-- diffed against:
--   clarify_start(uuid)    20261110170000_p1631_review_fixes.sql (its newest definition): that body byte for byte plus the lines marked `-- P1631 scope`.
--   _clarify_begin(uuid)   20261111183000_p1631_refine_target_only_for_refines.sql (its newest definition): that body byte for byte plus the lines marked `-- P1631 scope`.
--   _point_position_write_ok(uuid) 20261112180000_p1631_publish_read_cost.sql (its newest definition): that body byte for byte plus the lines marked `-- P1631 scope`.
--   point_chat_shared(uuid) 20261112170000_p1631_publish_fixes.sql (its newest definition): that body with the one read of chat_shared_point_ids() replaced by _point_chat_readable_by_me (20261112180000_p1631_publish_read_cost.sql).
--
-- What changes and why:
--   1. clarify_threads gets a `scope` column: 'message' (the pressed message, as before), 'thread' (the pressed message is a thread's first message and the thread has replies the presser can
--      read) or 'chat' (the whole conversation). Existing threads become 'message', which is what they did. Scope belongs to the thread, so every later run of the thread reads the same scope and
--      clarify_message, clarify_another and clarify_retry need no change.
--   2. clarify_start decides 'thread' or 'message' from the pressed message and writes it on the thread. A thread root that is an outside-rounds line (not a session thread) carries its message
--      alone, so it stays 'message'.
--   3. clarify_start_chat(p_conversation, p_draft) starts Clarify on a whole chat (the chat list row, or New point in a chat's + menu). It copies the chat's newest readable top-level message to the
--      Mirror as the thread root (so access, erasure and publishing work as they do for a message), then rewrites the copy so it shows the chat and not that message. With p_draft false it makes only
--      the thread and no draft: the owner's first instruction starts the first draft.
--   4. _clarify_begin reads the thread's scope. Outside 'message' the pressed row is not marked with an author side (no `pressed_author`), because no one row is the subject. The run carries `scope`.
--   3. clarify_start_chat also sets forward_author_id = NULL on the rewritten copy: it holds nobody's words, and erase_chat_data_for matches copies by forward_author_id, so erasing the anchor's author
--      would stamp 'Deleted user' into it. The column is nullable and no CHECK needs it on a clarify row (chat_messages_forward_has_snapshot asks only for forward_snapshot); the client reads it as `?? null`.
--   4. _clarify_begin's already_drafted list also takes the statements of points published into the source conversation that the presser can read (live card, created_at >= v_since), once per point
--      and not again when the presser's own done draft already is that point.
--   4b. In 'chat' scope _clarify_begin's main-chat selection also takes replies inside ordinary threads (the `thread_root_id IS NULL` condition is dropped for chat scope only), but never a reply whose
--      thread root has a system_kind (round_thread, outside_rounds) or is registered in transcribe_session_threads: transcription threads hold other people's speech, and only the presser's own round
--      reaches the model. Message and thread scope keep the earlier selection. The character budget and row cap are unchanged. v_scope is now read before the row selection.
--   6. _point_position_write_ok no longer returns true for a point that is a Clarify draft (a clarify_drafts row names it) and has no share row. Before, anyone holding a draft's id could write a position
--      on it, and link a story (story_points_insert_chat_shared calls it). Such a draft now falls through to the owner test, then to _point_chat_readable_by_me (false while unpublished): owner only.
--      Letters are untouched (their private points have no clarify_drafts row). New partial index clarify_drafts_point so the probe is an index lookup.
--   5. point_chat_shared asks _point_chat_readable_by_me about the one point instead of building the reader's whole set of shared points.

BEGIN;

-- 1. the scope ----------------------------------------------------------------------------------------------------------------------------

ALTER TABLE public.clarify_threads
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'message' CHECK (scope IN ('message', 'thread', 'chat'));

-- 2. owner entrance: thread or message ----------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clarify_start(p_source uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_row      public.chat_messages;
  v_src_conv uuid;
  v_id       uuid;
  v_src      public.chat_messages; -- P1631 scope
  v_since    timestamptz; -- P1631 scope
  v_scope    text := 'message'; -- P1631 scope
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1631:clarify:' || v_uid::text, 0));
  PERFORM public._clarify_sweep(v_uid);
  IF EXISTS (SELECT 1 FROM public.clarify_drafts d WHERE d.owner_id = v_uid AND d.state IN ('queued', 'running')) THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;
  BEGIN
    v_row := public.clarify_chat_message(p_source, NULL);
    SELECT m.conversation_id INTO v_src_conv FROM public.chat_messages m WHERE m.id = v_row.forwarded_from_message_id;
    -- 'thread' when the pressed message is a thread's first message with at least one live reply the presser can read, and it is not an outside-rounds line that carries itself alone -- P1631 scope
    SELECT m.* INTO v_src FROM public.chat_messages m WHERE m.id = v_row.forwarded_from_message_id; -- P1631 scope
    v_since := public._chat_access_since(v_src.conversation_id, v_uid); -- P1631 scope
    IF v_src.id IS NOT NULL AND v_src.thread_root_id IS NULL AND v_since IS NOT NULL -- P1631 scope
       AND EXISTS (SELECT 1 FROM public.chat_messages x -- P1631 scope
                    WHERE x.thread_root_id = v_src.id AND x.kind = 'message' AND x.deleted_at IS NULL AND x.created_at >= v_since) -- P1631 scope
       AND (v_src.system_kind IS DISTINCT FROM 'outside_rounds' -- P1631 scope
            OR EXISTS (SELECT 1 FROM public.transcribe_session_threads st WHERE st.root_message_id = v_src.id)) THEN -- P1631 scope
      v_scope := 'thread'; -- P1631 scope
    END IF; -- P1631 scope
    INSERT INTO public.clarify_threads (root_id, owner_id, scope) VALUES (v_row.id, v_uid, v_scope) ON CONFLICT (root_id) DO NOTHING; -- P1631 scope
    INSERT INTO public.clarify_drafts (owner_id, mirror_conversation_id, thread_root_id, source_conversation_id, source_message_id)
    VALUES (v_uid, v_row.conversation_id, v_row.id, v_src_conv, v_row.forwarded_from_message_id)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- the copy above is rolled back with this block
    RETURN jsonb_build_object('status', 'busy');
  END;
  RETURN jsonb_build_object('status', 'started', 'draft_id', v_id, 'thread_root_id', v_row.id, 'mirror_conversation_id', v_row.conversation_id, 'scope', v_scope); -- P1631 scope
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_start(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_start(uuid) TO authenticated;

-- 3. owner entrance: a whole chat ---------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clarify_start_chat(p_conversation uuid, p_draft boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_since  timestamptz;
  v_kind   text;
  v_anchor public.chat_messages;
  v_row    public.chat_messages;
  v_snap   jsonb;
  v_id     uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1631:clarify:' || v_uid::text, 0));
  PERFORM public._clarify_sweep(v_uid);
  IF p_draft AND EXISTS (SELECT 1 FROM public.clarify_drafts d WHERE d.owner_id = v_uid AND d.state IN ('queued', 'running')) THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;
  v_since := public._chat_access_since(p_conversation, v_uid);
  IF v_since IS NULL THEN
    RAISE EXCEPTION 'chat: not available' USING ERRCODE = '42501';
  END IF;
  SELECT c.kind INTO v_kind FROM public.chat_conversations c WHERE c.id = p_conversation;
  IF v_kind IS NULL OR v_kind = 'mirror' THEN
    RAISE EXCEPTION 'clarify: not available' USING ERRCODE = '22023';
  END IF;
  -- the anchor: the newest top-level message the presser can read (the copy needs a real message to hang on)
  SELECT m.* INTO v_anchor FROM public.chat_messages m
   WHERE m.conversation_id = p_conversation AND m.thread_root_id IS NULL AND m.kind = 'message' AND m.context_conversation_id IS NULL
     AND m.deleted_at IS NULL AND m.created_at >= v_since AND public._clarify_row_text(m) IS NOT NULL
   ORDER BY m.created_at DESC, m.id DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'empty');
  END IF;
  BEGIN
    v_row := public.clarify_chat_message(v_anchor.id, NULL);
    -- the copy shows the chat, not the anchor message: no body, author, thread or attachment; the conversation's own title and kind stay
    v_snap := jsonb_build_object('scope', 'chat', 'new_point', NOT p_draft,
                                 'conversation_kind', v_row.forward_snapshot -> 'conversation_kind',
                                 'conversation_title', v_row.forward_snapshot -> 'conversation_title',
                                 'created_at', v_row.created_at);
    IF v_row.forward_snapshot ? 'conversation_title_ref' THEN
      v_snap := v_snap || jsonb_build_object('conversation_title_ref', v_row.forward_snapshot -> 'conversation_title_ref');
    END IF;
    -- forward_author_id goes too: the rewritten snapshot holds nobody's words, and erasing the anchor's author would otherwise stamp 'Deleted user' into it (erase_chat_data_for matches copies by forward_author_id)
    UPDATE public.chat_messages m SET forward_snapshot = v_snap, attachment_kind = NULL, attachment_id = NULL, forward_author_id = NULL WHERE m.id = v_row.id;
    INSERT INTO public.clarify_threads (root_id, owner_id, scope) VALUES (v_row.id, v_uid, 'chat');
    IF p_draft THEN
      INSERT INTO public.clarify_drafts (owner_id, mirror_conversation_id, thread_root_id, source_conversation_id, source_message_id)
      VALUES (v_uid, v_row.conversation_id, v_row.id, p_conversation, v_anchor.id)
      RETURNING id INTO v_id;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    -- the copy above is rolled back with this block
    RETURN jsonb_build_object('status', 'busy');
  END;
  RETURN jsonb_build_object('status', 'started', 'draft_id', v_id, 'thread_root_id', v_row.id, 'mirror_conversation_id', v_row.conversation_id, 'scope', 'chat');
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_start_chat(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_start_chat(uuid, boolean) TO authenticated;

-- 4. the run reads the scope --------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._clarify_begin(p_draft uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- 100,000 characters of conversation at about 3 per token is about 33,000 tokens; with the 23,000 of the bundled prompt the call stays inside the
  -- 63,000 input tokens that canvas_max_usd reserves for. The handler trims again by its own estimate before it calls the model.
  c_chars       constant integer := 100000;
  c_rows        constant integer := 2000;
  v_d           public.clarify_drafts;
  v_since       timestamptz;
  v_src         public.chat_messages;
  v_root        uuid;
  v_outside     boolean;
  v_session     boolean;
  v_thread_ids  uuid[];
  v_chat_ids    uuid[];
  v_locked      uuid[];
  v_all         uuid[];
  v_thread_chars integer;
  v_refs        text[];
  v_spend       uuid;
  v_usd         numeric;
  v_source      jsonb;
  v_thread      jsonb;
  v_chat        jsonb;
  v_already     jsonb;
  v_text        text;
  v_owner_msgs  jsonb; -- P1631 r3
  v_latest      text; -- P1631 r3
  v_latest_id   uuid; -- P1631 r4
  v_scope       text; -- P1631 scope
BEGIN
  SELECT d.* INTO v_d FROM public.clarify_drafts d WHERE d.id = p_draft;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  IF v_d.state IN ('done', 'refused', 'failed', 'capped') THEN
    RETURN jsonb_build_object('status', v_d.state);
  END IF;
  IF v_d.state = 'running' THEN
    IF v_d.started_at > now() - interval '5 minutes' THEN
      RETURN jsonb_build_object('status', 'busy');
    END IF;
    -- a dead run: charged in full, failed
    PERFORM public._clarify_sweep(v_d.owner_id);
    RETURN jsonb_build_object('status', 'failed');
  END IF;
  IF v_d.updated_at < now() - interval '5 minutes' THEN -- P1631
    -- a draft nobody started within the abandon window is failed `abandoned`, as get_clarify_thread already reports it -- P1631
    PERFORM public._clarify_sweep(v_d.owner_id); -- P1631
    RETURN jsonb_build_object('status', 'failed'); -- P1631
  END IF; -- P1631

  v_since := public._chat_access_since(v_d.source_conversation_id, v_d.owner_id);
  IF v_since IS NULL THEN
    UPDATE public.clarify_drafts d SET state = 'failed', error_code = 'no_access', updated_at = now() WHERE d.id = p_draft AND d.state = 'queued';
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  SELECT m.* INTO v_src FROM public.chat_messages m
   WHERE m.id = v_d.source_message_id AND m.deleted_at IS NULL AND m.created_at >= v_since;
  IF NOT FOUND OR public._clarify_row_text(v_src) IS NULL THEN
    UPDATE public.clarify_drafts d SET state = 'failed', error_code = 'source_gone', updated_at = now() WHERE d.id = p_draft AND d.state = 'queued';
    RETURN jsonb_build_object('status', 'gone');
  END IF;

  SELECT COALESCE((SELECT t.scope FROM public.clarify_threads t WHERE t.root_id = v_d.thread_root_id), 'message') INTO v_scope; -- P1631 scope: read before the row selection, which depends on it

  -- the pressed message's thread, as clarify_chat_message copies it: an outside-rounds root carries its message alone; a session thread is wider
  v_root := COALESCE(v_src.thread_root_id, v_src.id);
  SELECT r.system_kind = 'outside_rounds', EXISTS (SELECT 1 FROM public.transcribe_session_threads st WHERE st.root_message_id = r.id)
    INTO v_outside, v_session FROM public.chat_messages r WHERE r.id = v_root;
  v_session := COALESCE(v_session, false);
  v_outside := COALESCE(v_outside, false) AND NOT v_session;

  v_thread_ids := ARRAY(
      SELECT s.id FROM (
        SELECT x.id, sum(public._mirror_ask_row_chars(x)) OVER (ORDER BY x.created_at DESC, x.id DESC
                 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
          FROM public.chat_messages x
         WHERE NOT v_outside AND (x.id = v_root OR x.thread_root_id = v_root) AND x.id <> v_src.id
           AND x.conversation_id = v_d.source_conversation_id
           AND x.kind = 'message' AND x.context_conversation_id IS NULL
           AND x.deleted_at IS NULL AND x.created_at >= v_since AND x.created_at <= v_d.created_at
         ORDER BY x.created_at DESC, x.id DESC
         LIMIT CASE WHEN v_session THEN 720 ELSE 100 END) s
       WHERE COALESCE(s.before, 0) < c_chars / 2);
  SELECT COALESCE(sum(public._mirror_ask_row_chars(x)), 0) INTO v_thread_chars
    FROM public.chat_messages x WHERE x.id = ANY (v_thread_ids || ARRAY[v_src.id]);

  -- the main chat of the source conversation up to the press, newest first within what is left of the budget
  v_chat_ids := ARRAY(
      SELECT s.id FROM (
        SELECT x.id, sum(public._mirror_ask_row_chars(x)) OVER (ORDER BY x.created_at DESC, x.id DESC
                 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
          FROM public.chat_messages x
         WHERE x.conversation_id = v_d.source_conversation_id
           AND (x.thread_root_id IS NULL -- P1631 scope
                OR (v_scope = 'chat' AND NOT EXISTS (SELECT 1 FROM public.chat_messages r -- P1631 scope: a whole chat also reads ordinary threads, never a round, outside-rounds or session thread
                      WHERE r.id = x.thread_root_id AND (r.system_kind IS NOT NULL -- P1631 scope
                            OR EXISTS (SELECT 1 FROM public.transcribe_session_threads st WHERE st.root_message_id = r.id))))) -- P1631 scope
           AND x.kind = 'message' AND x.context_conversation_id IS NULL
           AND x.id <> v_src.id AND NOT (x.id = ANY (v_thread_ids))
           AND x.deleted_at IS NULL AND x.created_at >= v_since AND x.created_at <= v_d.created_at
         ORDER BY x.created_at DESC, x.id DESC LIMIT c_rows) s
       WHERE COALESCE(s.before, 0) < GREATEST(c_chars - v_thread_chars, 0));

  -- ONE lock pass over every row read, FOR SHARE SKIP LOCKED (see _mirror_begin_job): a row an erase or an edit holds is never read, never sent, and
  -- absent from derived_refs, which are computed from exactly the rows locked and read below.
  SELECT COALESCE(array_agg(q.id), '{}') INTO v_locked FROM (
    SELECT m.id FROM public.chat_messages m
     WHERE m.id = ANY (v_thread_ids || v_chat_ids || ARRAY[v_src.id])
     ORDER BY m.created_at, m.id FOR SHARE SKIP LOCKED) q;
  IF NOT (v_src.id = ANY (v_locked)) THEN
    RETURN jsonb_build_object('status', 'busy', 'reason', 'locked'); -- P1631
  END IF;
  v_thread_ids := ARRAY(SELECT u FROM unnest(v_thread_ids) u WHERE u = ANY (v_locked));
  v_chat_ids   := ARRAY(SELECT u FROM unnest(v_chat_ids) u WHERE u = ANY (v_locked));
  v_all := v_thread_ids || v_chat_ids || ARRAY[v_src.id];

  -- erasure takes this lock exclusively before it scrubs derived work; TRY, never wait (a wait while holding the rows above could close a cycle)
  IF NOT pg_try_advisory_xact_lock_shared(hashtext('p1520_mirror_context')) THEN
    RETURN jsonb_build_object('status', 'busy', 'reason', 'locked'); -- P1631
  END IF;

  -- the source row again, now that it is locked: an edit or an erase may have changed it
  SELECT m.* INTO v_src FROM public.chat_messages m WHERE m.id = v_src.id;
  v_text := public._clarify_row_text(v_src);
  IF v_src.deleted_at IS NOT NULL OR v_text IS NULL THEN
    UPDATE public.clarify_drafts d SET state = 'failed', error_code = 'source_gone', updated_at = now() WHERE d.id = p_draft AND d.state = 'queued';
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  v_source := jsonb_build_object('id', v_src.id, 'text', left(v_text, 4000), 'is_pressed', true,
                                 'pressed_author', CASE WHEN v_src.author_id = v_d.owner_id THEN 'owner' ELSE 'other' END); -- P1631 r3: who wrote the pressed row, never a name
  IF v_scope <> 'message' THEN -- P1631 scope
    v_source := v_source - 'pressed_author'; -- P1631 scope: a thread or a whole chat is the subject, so no one row's author is aimed at
  END IF; -- P1631 scope
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'text', left(public._clarify_row_text(t), 4000)) ORDER BY t.created_at, t.id), '[]'::jsonb)
    INTO v_thread FROM public.chat_messages t
   WHERE t.id = ANY (v_thread_ids) AND t.deleted_at IS NULL AND public._clarify_row_text(t) IS NOT NULL;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'text', left(public._clarify_row_text(t), 4000)) ORDER BY t.created_at, t.id), '[]'::jsonb)
    INTO v_chat FROM public.chat_messages t
   WHERE t.id = ANY (v_chat_ids) AND t.deleted_at IS NULL AND public._clarify_row_text(t) IS NOT NULL;

  -- whose words are in it, from exactly the rows read
  SELECT array_remove(array_agg(DISTINCT public._chat_author_ref(t.author_id)), NULL) INTO v_refs
    FROM public.chat_messages t WHERE t.id = ANY (v_all) AND t.deleted_at IS NULL AND t.author_id IS NOT NULL;

  -- the owner's newest draft, or the one a Mention in chat named: the statement a refine starts from -- P1631 r5 (moved above already_drafted, which leaves it out)
  SELECT p.statement, d3.id INTO v_latest, v_latest_id FROM public.clarify_drafts d3 JOIN public.points p ON p.id = d3.point_id -- P1631 r3
   WHERE d3.thread_root_id = v_d.thread_root_id AND d3.owner_id = v_d.owner_id AND d3.state = 'done' AND d3.id <> v_d.id -- P1631 r3
   ORDER BY (v_d.instruction IS NOT NULL AND d3.id IS NOT DISTINCT FROM v_d.refine_target_id) DESC, d3.created_at DESC, d3.id DESC LIMIT 1; -- P1631 r5: the named card first, then the newest

  -- the points this presser already made from this conversation: not to be repeated
  SELECT COALESCE(jsonb_agg(p.statement ORDER BY d2.created_at, d2.id), '[]'::jsonb) INTO v_already
    FROM public.clarify_drafts d2 JOIN public.points p ON p.id = d2.point_id
   WHERE d2.owner_id = v_d.owner_id AND d2.source_conversation_id = v_d.source_conversation_id AND d2.state = 'done'; -- P1631 r6: every done card, the refined one too (an instruction run may still answer `new`)
  -- points already published into this chat that the presser can read are not to be repeated either: live cards only, never from before the presser could read the chat -- P1631 scope
  SELECT v_already || COALESCE(jsonb_agg(q.statement ORDER BY q.created_at, q.point_id), '[]'::jsonb) INTO v_already FROM ( -- P1631 scope
    SELECT p.statement, s.created_at, s.point_id FROM public.point_chat_shares s -- P1631 scope
      JOIN public.chat_messages m ON m.id = s.message_id JOIN public.points p ON p.id = s.point_id -- P1631 scope
     WHERE s.conversation_id = v_d.source_conversation_id AND m.deleted_at IS NULL -- P1631 scope
       AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id AND m.created_at >= v_since -- P1631 scope
       AND NOT EXISTS (SELECT 1 FROM public.clarify_drafts d4 WHERE d4.owner_id = v_d.owner_id AND d4.source_conversation_id = v_d.source_conversation_id -- P1631 scope
                        AND d4.state = 'done' AND d4.point_id = s.point_id)) q; -- P1631 scope: same point once

  -- what the owner typed in this thread (their own directions, newest 20, oldest first) -- P1631 r3
  SELECT COALESCE(jsonb_agg(left(o.body, 500) ORDER BY o.created_at, o.id), '[]'::jsonb) INTO v_owner_msgs FROM ( -- P1631 r3
    SELECT m.body, m.created_at, m.id FROM public.chat_messages m -- P1631 r3
     WHERE m.thread_root_id = v_d.thread_root_id AND m.author_id = v_d.owner_id AND m.kind = 'message' -- P1631 r3
       AND m.deleted_at IS NULL AND NULLIF(btrim(m.body), '') IS NOT NULL -- P1631 r3
       AND m.created_at <= v_d.created_at -- P1631 r4
     ORDER BY m.created_at DESC, m.id DESC LIMIT 20) o; -- P1631 r3

  -- the words behind those statements are in this run too: their authors' refs are this draft's refs (so erasing one of them reaches this draft) -- P1631
  SELECT array_remove(array_agg(DISTINCT r.ref), NULL) INTO v_refs FROM ( -- P1631
    SELECT unnest(COALESCE(v_refs, '{}')) AS ref -- P1631
    UNION -- P1631
    SELECT unnest(d2.derived_refs) AS ref -- P1631
      FROM public.clarify_drafts d2 JOIN public.points p ON p.id = d2.point_id -- P1631
     WHERE d2.owner_id = v_d.owner_id AND d2.source_conversation_id = v_d.source_conversation_id AND d2.state = 'done') r; -- P1631

  -- the draft row, and its state again: another start may have run while this one waited
  SELECT d.* INTO v_d FROM public.clarify_drafts d WHERE d.id = p_draft FOR UPDATE;
  IF v_d.state <> 'queued' THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;

  v_usd := (public._mirror_limits() ->> 'canvas_max_usd')::numeric;
  v_spend := public._mirror_reserve(v_d.owner_id, 'canvas', v_usd);
  IF v_spend IS NULL THEN
    UPDATE public.clarify_drafts d SET state = 'capped', error_code = 'cap', updated_at = now() WHERE d.id = p_draft;
    RETURN jsonb_build_object('status', 'capped');
  END IF;

  UPDATE public.clarify_drafts d
     SET state = 'running', started_at = now(), spend_id = v_spend, error_code = NULL,
         derived_refs = COALESCE(v_refs, '{}'), sent_ids = v_all, updated_at = now(),
         refine_target_id = CASE WHEN v_d.instruction IS NOT NULL THEN v_latest_id ELSE NULL END -- P1631 r7: only a run with an instruction refines a card
   WHERE d.id = p_draft;

  RETURN jsonb_build_object(
    'status', 'run',
    'draft_id', p_draft,
    'run_token', v_spend, -- P1631
    'owner_id', v_d.owner_id,
    'reserved_usd', v_usd,
    'owner_instruction', v_d.instruction,
    'source_message', v_source,
    'thread', v_thread,
    'surrounding_chat', v_chat,
    'already_drafted', v_already,
    'owner_messages', v_owner_msgs, -- P1631 r3
    'latest_draft', v_latest, -- P1631 r3
    'scope', v_scope); -- P1631 scope
END;
$$;
REVOKE ALL ON FUNCTION public._clarify_begin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._clarify_begin(uuid) TO service_role;

-- 5. point_chat_shared reads one point ----------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.point_chat_shared(p_point uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public._point_has_live_share(p_point)
     AND (EXISTS (SELECT 1 FROM public.points p WHERE p.id = p_point AND p.first_validator_id = auth.uid())
          OR public._point_chat_readable_by_me(p_point)); -- P1631 scope
$$;
REVOKE ALL ON FUNCTION public.point_chat_shared(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.point_chat_shared(uuid) TO authenticated;

-- 6. only the owner may set a position on an unpublished Clarify draft ---------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS clarify_drafts_point ON public.clarify_drafts (point_id) WHERE point_id IS NOT NULL;

-- True for a point that was never published and is not a Clarify draft, for its author, and for the people the point is shared with. The policy expression runs as the caller, so it needs the grant.
CREATE OR REPLACE FUNCTION public._point_position_write_ok(p_point uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE -- P1631 publish fixes: chat_shared_point_ids() runs only for a published point and a caller who is not its owner
    WHEN NOT EXISTS (SELECT 1 FROM public.point_chat_shares s WHERE s.point_id = p_point)
         AND NOT EXISTS (SELECT 1 FROM public.clarify_drafts d WHERE d.point_id = p_point) THEN true -- P1631 scope: an unpublished Clarify draft falls through to the owner test
    WHEN EXISTS (SELECT 1 FROM public.points p WHERE p.id = p_point AND p.first_validator_id = auth.uid()) THEN true -- P1631 publish fixes
    ELSE public._point_chat_readable_by_me(p_point) -- P1631 read cost
  END; -- P1631 publish fixes
$$;
REVOKE ALL ON FUNCTION public._point_position_write_ok(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._point_position_write_ok(uuid) TO authenticated;

COMMIT;
