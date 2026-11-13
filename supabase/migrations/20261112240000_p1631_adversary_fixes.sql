-- client-safe: every replaced function keeps its signature, return type, SECURITY DEFINER, search_path and grants. Behaviour changes only narrow what is read or written: a transcribed event line is no longer a chat-scope anchor or surrounding row; a Clarify draft point is left out of a letter, refused by the token response and skipped by the replay; the replay copies only answers for points in the sealed letter; a published card inside a round or session thread is not shown to a run
-- Migration: P1631 adversary fixes (hostile review of 20261112200000, 20261112210000, 20261112220000, 20261112230000)
-- Created: 2026-11-12
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md
-- Guaranteed by: src/tests/p1631-clarify-scope.test.ts, src/tests/p1631-letter-path-migration.test.ts (source contract), src/tests/integration/p1631-clarify-scope.test.ts, src/tests/integration/p1631-letter-path.test.ts
--
-- Earlier P1631 migrations are applied and are not edited; every change is here. Each replaced function is the newest body copied byte for byte, then the marked lines added
-- (`-- P1631 adversary fixes`). No line of the old bodies is changed or removed.
--
-- diffed against:
--   clarify_start_chat(uuid, boolean)       20261112220000_p1631_chat_scope_fixes.sql (its newest definition)
--   _clarify_begin(uuid)                    20261112230000_p1631_review_fixes.sql (its newest definition)
--   seal_and_send_letter(uuid,jsonb,jsonb,text) 20261112210000_p1631_letter_path.sql (its newest definition)
--   submit_point_response_by_token(uuid,uuid,text) 20261112210000_p1631_letter_path.sql (its newest definition)
--   replay_letter_positions()               20261112230000_p1631_review_fixes.sql (its newest definition)
--
-- 1. (HIGH) Another table's transcribed speech reached the model in chat scope. At an event, _transcribe_post_line posts a late arrival's lines at the channel's TOP LEVEL (is_transcription true,
--    system_kind NULL), so they passed the system_kind filter of 20261112220000: such a line could be the anchor, the re-anchor target or a surrounding row. Now (a) the clarify_start_chat anchor and
--    the _clarify_begin re-anchor also require is_transcription = false, and (b) the surrounding-chat selection (v_chat_ids) excludes is_transcription rows in EVERY scope. The pressed row itself is
--    not touched: it is the source, not surrounding chat, and in thread scope a pressed session thread still carries its own lines. Typed messages only in the surrounding chat.
-- 2. A Clarify point (any point named by a clarify_drafts row, published or not) never travels through a letter. seal_and_send_letter leaves it out of the snapshot, submit_point_response_by_token
--    refuses it, replay_letter_positions skips it: the same test as the point_chat_shares guards of 20261112210000, as `point_chat_shares OR clarify_drafts`. Letters sealed before this migration that
--    already hold such a point are covered by the second and third guard. (clarify_drafts_point indexes the probe, 20261112200000.)
-- 3. (PREDATES P1631) letter_point_responses' INSERT policy checks only that the caller is the delivery's receiver, not that the point is in that letter, and replay_letter_positions copies any staged
--    row into point_positions as the table owner. A recipient could stage an answer for any point id they hold and have it written as a position. replay_letter_positions now copies only rows whose
--    point_id is in the delivery's sealed letter snapshot (the same jsonb_array_elements(point_config->'points') test submit_point_response_by_token uses). The client INSERT policy itself is not changed here.
-- 4. already_drafted (the points shown as "do not repeat") skips a published card that sits in a thread whose root has a system_kind (round or outside-rounds) or is a session root: clarify_publish puts
--    a point made from a round-thread reply into that round thread, and the statement paraphrases another table's speech. The derived_refs block of 20261112230000 gets the same filter, so the two stay one set.
-- 5. That derived_refs block also adds the PUBLISHER's own ref (_chat_author_ref(s.shared_by)) for each published point shown, so erasing the publisher reaches this draft (their words are the statement).
-- 6. Byte-for-byte audit of 20261112200000 (reported, nothing changed): (a) in _clarify_begin the old chat-selection line `WHERE x.conversation_id = v_d.source_conversation_id AND x.thread_root_id IS NULL`
--    was split: the WHERE kept the first condition unmarked and `x.thread_root_id IS NULL` moved into a marked, parenthesised condition `(x.thread_root_id IS NULL OR (chat scope AND ...))`; for message and
--    thread scope the meaning is identical. (b) in clarify_start the old `INSERT INTO public.clarify_threads (root_id, owner_id) VALUES (...) ON CONFLICT (root_id) DO NOTHING; -- P1631` line was replaced by
--    the same statement with `scope` (marked `-- P1631 scope`). Neither is a bug. The earlier headers' "byte for byte plus the marked lines" was therefore not literally true for those two lines.
-- 7. The sealed snapshot's `order` and `hidden` arrays copy the author's story arrangement unchanged, so the id of a point left out of `points` (a Clarify draft, a chat-published point, a foreign
--    private point) could still reach the recipient. One added UPDATE after the snapshot insert keeps only the ids that are in the snapshot's own `points` (order of `order` kept).
-- 8. Behaviour note for 20261112220000 (its header says the run re-anchors "when the anchor is gone"): the code re-anchors EVERY chat-scope run to the newest eligible top-level row that exists up to the
--    draft's created_at, and updates the queued draft's source_message_id when it differs. Because clarify_message and clarify_another stamp each later draft with a later created_at, a later run of a
--    chat-scope thread reads messages posted after the first press. This is intended. The Mirror copy's forwarded_from_message_id still names the first anchor.

BEGIN;

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
     AND m.system_kind IS NULL -- P1631 chat scope fixes: never a round-thread or session root (another table's speech)
     AND m.is_transcription = false -- P1631 adversary fixes: never a transcribed line (a late arrival's lines are posted at the top level)
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
  v_anchor      uuid; -- P1631 chat scope fixes
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
  -- a whole-chat thread outlives its anchor: when the anchor was deleted or its author erased, the run moves to the newest eligible top-level row (the same filter as clarify_start_chat's anchor) -- P1631 chat scope fixes
  IF COALESCE((SELECT t.scope FROM public.clarify_threads t WHERE t.root_id = v_d.thread_root_id), 'message') = 'chat' THEN -- P1631 chat scope fixes
    SELECT m.id INTO v_anchor FROM public.chat_messages m -- P1631 chat scope fixes
     WHERE m.conversation_id = v_d.source_conversation_id AND m.thread_root_id IS NULL AND m.kind = 'message' AND m.context_conversation_id IS NULL -- P1631 chat scope fixes
       AND m.system_kind IS NULL AND m.deleted_at IS NULL AND m.created_at >= v_since AND m.created_at <= v_d.created_at -- P1631 chat scope fixes
       AND m.is_transcription = false -- P1631 adversary fixes
       AND public._clarify_row_text(m) IS NOT NULL -- P1631 chat scope fixes
     ORDER BY m.created_at DESC, m.id DESC LIMIT 1; -- P1631 chat scope fixes
    IF v_anchor IS NOT NULL AND v_anchor IS DISTINCT FROM v_d.source_message_id THEN -- P1631 chat scope fixes
      UPDATE public.clarify_drafts d SET source_message_id = v_anchor WHERE d.id = p_draft AND d.state = 'queued'; -- P1631 chat scope fixes
      v_d.source_message_id := v_anchor; -- P1631 chat scope fixes
    END IF; -- P1631 chat scope fixes
  END IF; -- P1631 chat scope fixes
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
           AND NOT (v_scope = 'chat' AND v_src.system_kind IS NOT NULL) -- P1631 chat scope fixes: a whole-chat run never reads the thread of a round or session root
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
           AND (v_scope <> 'chat' OR x.system_kind IS NULL) -- P1631 chat scope fixes: a whole-chat run never sends a round-thread or session root row
           AND x.is_transcription = false -- P1631 adversary fixes: surrounding chat is typed messages only, in every scope (the pressed row is the source, not surrounding chat)
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
       AND (m.thread_root_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.chat_messages rr WHERE rr.id = m.thread_root_id -- P1631 adversary fixes: not a card inside a round, outside-rounds or session thread
             AND (rr.system_kind IS NOT NULL OR EXISTS (SELECT 1 FROM public.transcribe_session_threads sst WHERE sst.root_message_id = rr.id)))) -- P1631 adversary fixes
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
  -- the same for the points published into this chat that are in already_drafted: the refs of the drafts that made them (same filter: live card, readable by the presser) -- P1631 review fixes
  SELECT array_remove(array_agg(DISTINCT r.ref), NULL) INTO v_refs FROM ( -- P1631 review fixes
    SELECT unnest(COALESCE(v_refs, '{}')) AS ref -- P1631 review fixes
    UNION -- P1631 review fixes
    SELECT unnest(d5.derived_refs) AS ref FROM public.clarify_drafts d5 -- P1631 review fixes
     WHERE d5.state = 'done' AND d5.point_id IN ( -- P1631 review fixes
       SELECT s.point_id FROM public.point_chat_shares s JOIN public.chat_messages m ON m.id = s.message_id -- P1631 review fixes
        WHERE s.conversation_id = v_d.source_conversation_id AND m.deleted_at IS NULL -- P1631 review fixes
          AND (m.thread_root_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.chat_messages rr WHERE rr.id = m.thread_root_id -- P1631 adversary fixes: the same set as already_drafted
                AND (rr.system_kind IS NOT NULL OR EXISTS (SELECT 1 FROM public.transcribe_session_threads sst WHERE sst.root_message_id = rr.id)))) -- P1631 adversary fixes
          AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id AND m.created_at >= v_since)) r; -- P1631 review fixes
  -- and the publisher's own ref for each published point shown: their words are the statement (so erasing the publisher reaches this draft) -- P1631 adversary fixes
  SELECT array_remove(array_agg(DISTINCT r.ref), NULL) INTO v_refs FROM ( -- P1631 adversary fixes
    SELECT unnest(COALESCE(v_refs, '{}')) AS ref -- P1631 adversary fixes
    UNION -- P1631 adversary fixes
    SELECT public._chat_author_ref(s.shared_by) AS ref FROM public.point_chat_shares s JOIN public.chat_messages m ON m.id = s.message_id -- P1631 adversary fixes
     WHERE s.conversation_id = v_d.source_conversation_id AND m.deleted_at IS NULL -- P1631 adversary fixes
       AND (m.thread_root_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.chat_messages rr WHERE rr.id = m.thread_root_id -- P1631 adversary fixes
             AND (rr.system_kind IS NOT NULL OR EXISTS (SELECT 1 FROM public.transcribe_session_threads sst WHERE sst.root_message_id = rr.id)))) -- P1631 adversary fixes
       AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id AND m.created_at >= v_since) r; -- P1631 adversary fixes

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

-- ============================================================================
-- seal_and_send_letter
-- ============================================================================
CREATE OR REPLACE FUNCTION seal_and_send_letter(
  p_letter_id      UUID,
  p_predictions    JSONB DEFAULT '[]'::jsonb,
  p_deliveries     JSONB DEFAULT '[]'::jsonb,
  p_responses_mode TEXT DEFAULT 'invite'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id           UUID;
  v_sender_email        TEXT;
  v_mode                TEXT;
  v_letter_status       TEXT;
  v_source_doc_id       UUID;
  v_pred                JSONB;
  v_del                 JSONB;
  v_receiver_email      TEXT;
  v_receiver_profile_id UUID;
  v_desynced_stories    TEXT;
  v_is_admin            BOOLEAN;  -- P975 (restored from P914)
  v_delivery_id         UUID;     -- P1650
  v_post_ids            UUID[] := '{}';  -- P1650: deliveries to post a card for, after the seal
  v_post_names          TEXT[] := '{}';  -- P1650 fix: what the sender typed for each of them (NULL = picked from the list)
  v_post_id             UUID;     -- P1650
  v_post_status         TEXT;     -- P1650
  v_skipped             JSONB := '[]'::jsonb;  -- P1650
  v_i                   INTEGER;  -- P1650 fix
BEGIN
  -- Validate p_responses_mode before any writes (don't rely on CHECK for error message)
  IF p_responses_mode NOT IN ('off', 'invite', 'push') THEN
    RAISE EXCEPTION 'Invalid responses_mode: %. Must be one of: off, invite, push', p_responses_mode;
  END IF;

  SELECT sender_id, mode, status, source_doc_id
  INTO v_sender_id, v_mode, v_letter_status, v_source_doc_id
  FROM clarity_letters
  WHERE id = p_letter_id;

  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Letter not found: %', p_letter_id;
  END IF;

  IF v_sender_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the letter sender can seal this letter';
  END IF;

  IF v_letter_status != 'draft' THEN
    RAISE EXCEPTION 'Letter is already sealed or expired (status: %)', v_letter_status;
  END IF;

  SELECT email INTO v_sender_email
  FROM auth.users
  WHERE id = v_sender_id;

  -- P975 (restored from P914): resolve admin bypass once, up front.
  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
  FROM profiles p
  WHERE p.id = v_sender_id;

  -- P833: pre-flight desync check.
  SELECT string_agg(s.id::text, ', ' ORDER BY s.id)
  INTO v_desynced_stories
  FROM doc_stories ds
  JOIN stories s ON s.id = ds.story_id
  LEFT JOIN profiles ap ON ap.id = s.author_id
  LEFT JOIN story_versions sv
    ON sv.story_id = s.id AND sv.version_number = s.current_version
  WHERE ds.doc_id = v_source_doc_id
    AND (v_mode = 'one-to-one' OR s.visibility = 'public'::content_visibility)
    AND sv.id IS NULL;

  IF v_desynced_stories IS NOT NULL THEN
    RAISE EXCEPTION
      'seal_and_send_letter: story_versions desync for story_id(s): % — run backfill before sealing',
      v_desynced_stories;
  END IF;

  -- P952 AD-2: write responses_mode in-transaction, after ownership check
  UPDATE clarity_letters
  SET responses_mode = p_responses_mode
  WHERE id = p_letter_id;

  INSERT INTO letter_story_snapshots (letter_id, story_id, version_id, position, point_config, visibility)
  SELECT
    p_letter_id,
    ds.story_id,
    sv.id,
    ds.position,
    jsonb_build_object(
      'storyText', COALESCE(sv.content, ''),
      'imageUrl', COALESCE(s.image_url, ''),
      'videoUrl', COALESCE(s.video_url, ''),
      'videoQuotes', COALESCE(s.video_quotes, '{"quotes": [], "durationSeconds": null}'::jsonb),
      'storyAuthorId', s.author_id::text,
      'storyAuthorName', COALESCE(ap.name, ''),
      'points', COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'id', pt.id::text,
            'text', pt.statement,
            'authorPosition', (
              SELECT pp.position::text
              FROM point_positions pp
              WHERE pp.point_id = pt.id AND pp.user_id = v_sender_id
              LIMIT 1
            ),
            'visibility', pt.visibility::text,
            'hidden', COALESCE((ds.point_config->'hidden')::jsonb ? pt.id::text, false)
          ) ORDER BY sp.created_at
        )
        FROM story_points sp
        JOIN points pt ON pt.id = sp.point_id
        WHERE sp.story_id = ds.story_id
          AND pt.superseded_by IS NULL
          -- P1515: never copy the statement of a private point the sender does not own. Anyone
          -- may link their own story to a point id they know, so without this a letter would
          -- carry another person's private statement in its snapshot.
          AND (pt.visibility = 'public'::content_visibility OR pt.first_validator_id = v_sender_id)
          -- P1631 letter: a point that was ever published into a chat has no link; it stays out of the snapshot, so no token response can reach it
          AND NOT EXISTS (SELECT 1 FROM public.point_chat_shares pcs WHERE pcs.point_id = pt.id) -- P1631 letter
          AND NOT EXISTS (SELECT 1 FROM public.clarify_drafts cdr WHERE cdr.point_id = pt.id) -- P1631 adversary fixes: a Clarify point (published or not) never travels through a letter
        ), '[]'::jsonb
      ),
      'order', COALESCE(ds.point_config->'order', '[]'::jsonb),
      'hidden', COALESCE(ds.point_config->'hidden', '[]'::jsonb),
      'lead_count', CASE
        WHEN jsonb_typeof(ds.point_config->'lead_count') = 'number'
          THEN to_jsonb(GREATEST(0, floor((ds.point_config->>'lead_count')::numeric)::int))
        ELSE '1'::jsonb
      END
    ),
    s.visibility::text
  FROM doc_stories ds
  JOIN stories s ON s.id = ds.story_id
  LEFT JOIN profiles ap ON ap.id = s.author_id
  JOIN story_versions sv ON sv.story_id = s.id AND sv.version_number = s.current_version
  WHERE ds.doc_id = v_source_doc_id
    AND (v_mode = 'one-to-one' OR s.visibility = 'public'::content_visibility)
  ON CONFLICT (letter_id, story_id) DO NOTHING;
  -- the snapshot's `order` and `hidden` arrays keep only ids that are in its own `points`: the id of a point left out above (a Clarify point, a chat-published point, a foreign private point) must not reach the recipient -- P1631 adversary fixes
  UPDATE letter_story_snapshots lss SET point_config = lss.point_config || jsonb_build_object( -- P1631 adversary fixes
    'order', COALESCE((SELECT jsonb_agg(o.v ORDER BY o.n) -- P1631 adversary fixes
                         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(lss.point_config->'order') = 'array' THEN lss.point_config->'order' ELSE '[]'::jsonb END) WITH ORDINALITY o(v, n) -- P1631 adversary fixes
                        WHERE o.v IN (SELECT kp->'id' FROM jsonb_array_elements(lss.point_config->'points') kp)), '[]'::jsonb), -- P1631 adversary fixes
    'hidden', COALESCE((SELECT jsonb_agg(h.v ORDER BY h.n) -- P1631 adversary fixes
                         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(lss.point_config->'hidden') = 'array' THEN lss.point_config->'hidden' ELSE '[]'::jsonb END) WITH ORDINALITY h(v, n) -- P1631 adversary fixes
                        WHERE h.v IN (SELECT kp->'id' FROM jsonb_array_elements(lss.point_config->'points') kp)), '[]'::jsonb)) -- P1631 adversary fixes
   WHERE lss.letter_id = p_letter_id; -- P1631 adversary fixes

  FOR v_pred IN SELECT * FROM jsonb_array_elements(p_predictions)
  LOOP
    INSERT INTO letter_predictions (letter_id, delivery_id, story_id, prediction)
    VALUES (
      p_letter_id,
      CASE WHEN v_pred->>'delivery_id' IS NOT NULL
        THEN (v_pred->>'delivery_id')::UUID
        ELSE NULL
      END,
      (v_pred->>'story_id')::UUID,
      (v_pred->>'prediction')::INTEGER
    )
    ON CONFLICT ON CONSTRAINT letter_predictions_unique DO NOTHING;
  END LOOP;

  FOR v_del IN SELECT * FROM jsonb_array_elements(p_deliveries)
  LOOP
    v_receiver_email := v_del->>'receiver_email';
    v_receiver_profile_id := NULLIF(v_del->>'receiver_profile_id', '')::UUID;

    IF v_receiver_email IS NULL AND v_receiver_profile_id IS NOT NULL THEN
      IF v_receiver_profile_id = v_sender_id THEN
        RAISE EXCEPTION 'Cannot send a letter to yourself (receiver matches sender)';
      END IF;
      -- P975 (restored from P914): relationship-scope gate. A non-admin sender may
      -- only resolve the email of a profile inside their relationship scope. Blocks
      -- the email-harvesting oracle that the gateless P952 4-arg overload reopened.
      -- NOT EXISTS (never NOT IN): a NULL in the scope set would make NOT IN return
      -- NULL (treated as not-true), silently failing open.
      IF NOT v_is_admin
         AND NOT EXISTS (
           SELECT 1 FROM public.p878_relationship_scope(v_sender_id) s
           WHERE s = v_receiver_profile_id
         ) THEN
        RAISE EXCEPTION 'Recipient is not in your relationship scope';
      END IF;
      SELECT email INTO v_receiver_email
      FROM profiles
      WHERE id = v_receiver_profile_id;
      IF v_receiver_email IS NULL THEN
        RAISE EXCEPTION 'Recipient profile has no resolvable email';
      END IF;
    ELSIF v_receiver_email IS NOT NULL THEN
      IF v_receiver_email = v_sender_email THEN
        RAISE EXCEPTION 'Cannot send a letter to yourself (receiver_email matches sender)';
      END IF;
      v_receiver_profile_id := NULL;
      SELECT id INTO v_receiver_profile_id
      FROM profiles
      WHERE lower(email) = lower(v_receiver_email)
      LIMIT 1;
    END IF;

    v_delivery_id := NULL; -- P1650: a conflicting insert returns no row; never carry the previous id
    INSERT INTO letter_deliveries (
      letter_id, receiver_email, receiver_name,
      receiver_profile_id, invitation_expires_at,
      created_by_sender -- P1650: the sender made this row
    )
    VALUES (
      p_letter_id,
      v_receiver_email,
      v_del->>'receiver_name',
      v_receiver_profile_id,
      now() + interval '7 days',
      true -- P1650
    )
    ON CONFLICT (letter_id, receiver_email) WHERE receiver_email IS NOT NULL DO NOTHING
    RETURNING id INTO v_delivery_id; -- P1650

    IF v_delivery_id IS NOT NULL AND v_receiver_profile_id IS NOT NULL THEN
      v_post_ids := v_post_ids || v_delivery_id; -- P1650
      -- P1650 fix: the label the sender typed. The typed name, else the typed email; NULL when the sender picked a person
      -- from the list (the email in v_receiver_email was then resolved by the server and must never be returned).
      -- P1650 review: a whitespace-only typed name or email counts as empty.
      v_post_names := v_post_names || COALESCE(NULLIF(btrim(v_del->>'receiver_name'), ''), NULLIF(btrim(v_del->>'receiver_email'), ''))::text;
    END IF;
  END LOOP;

  UPDATE clarity_letters
  SET status = 'sealed', sealed_at = now()
  WHERE id = p_letter_id;

  -- P1650: a card in each invited recipient's 1:1 (one-to-one AND one-to-many letters), after the letter is sealed.
  -- Sealing must never fail because of chat: a failure is a warning and the recipient is reported as skipped.
  FOR v_i IN 1 .. cardinality(v_post_ids)
  LOOP
    v_post_id := v_post_ids[v_i];
    BEGIN
      v_post_status := public._chat_post_letter_delivery(v_post_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'seal_and_send_letter: chat message not posted (%)', SQLERRM;
      v_post_status := 'skipped';
    END;
    IF v_post_status = 'skipped' THEN
      -- P1650 fix: exactly {delivery_id, name}; never a profile id, never a server-resolved email.
      -- P1650 review: never an empty name.
      v_skipped := v_skipped || jsonb_build_array((
        SELECT jsonb_build_object(
                 'delivery_id', d.id,
                 'name', COALESCE(v_post_names[v_i], NULLIF(btrim(pr.name), ''), 'this recipient'))
          FROM letter_deliveries d
          LEFT JOIN profiles pr ON pr.id = d.receiver_profile_id
         WHERE d.id = v_post_id));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('sealed', true, 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION seal_and_send_letter(UUID, JSONB, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION seal_and_send_letter(UUID, JSONB, JSONB, TEXT) TO authenticated;

-- ============================================================================
-- submit_point_response_by_token
-- ============================================================================
CREATE OR REPLACE FUNCTION submit_point_response_by_token(
  p_token UUID,
  p_point_id UUID,
  p_position TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_id UUID;
  v_letter_id   UUID;
BEGIN
  -- NULL guard on p_point_id before any writes
  IF p_point_id IS NULL THEN
    RETURN false;
  END IF;

  -- Enum validation — reject unknown position values cleanly before cast.
  -- IMPORTANT: these must match the actual position_type enum values.
  IF p_position NOT IN (
    'strongly_disagree', 'disagree', 'somewhat_disagree', 'unsure',
    'somewhat_agree', 'agree', 'strongly_agree'
  ) THEN
    RETURN false;
  END IF;

  -- Validate token (expiry check removed in P683; invitation_expires_at gates
  -- session minting only, not engagement writes).
  SELECT ld.id, ld.letter_id INTO v_delivery_id, v_letter_id
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RETURN false;
  END IF;

  -- P684: reject anonymous callers on one-to-many letters (public letters require auth)
  IF (SELECT mode FROM clarity_letters WHERE id = v_letter_id) = 'one-to-many'
     AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required for one-to-many responses';
  END IF;

  -- Authorization guard: p_point_id must be in the letter's sealed point_config.
  -- Uses jsonb_array_elements(point_config->'points') — the immutable snapshot —
  -- NOT a story_points JOIN, which can diverge after seal (point deleted from
  -- story, test fixture missing story_points row, etc.).
  IF NOT EXISTS (
    SELECT 1
    FROM letter_story_snapshots lss,
         jsonb_array_elements(lss.point_config->'points') pt
    WHERE lss.letter_id = v_letter_id
      AND (pt->>'id')::uuid = p_point_id
  ) THEN
    RETURN false;
  END IF;

  -- P1631 letter: a point that was ever published into a chat takes no response through a link (this write runs as the table owner and would skip the chat's position policy)
  IF EXISTS (SELECT 1 FROM public.point_chat_shares pcs WHERE pcs.point_id = p_point_id) THEN -- P1631 letter
    RETURN false; -- P1631 letter
  END IF; -- P1631 letter
  -- P1631 adversary fixes: nor does a Clarify point (published or not): its positions belong to its owner until it is published into a chat
  IF EXISTS (SELECT 1 FROM public.clarify_drafts cdr WHERE cdr.point_id = p_point_id) THEN -- P1631 adversary fixes
    RETURN false; -- P1631 adversary fixes
  END IF; -- P1631 adversary fixes
  -- Primary write: letter engagement record (idempotent).
  INSERT INTO letter_point_responses (delivery_id, point_id, position)
  VALUES (v_delivery_id, p_point_id, p_position)
  ON CONFLICT DO NOTHING;

  -- P705/P716 dual-write: live display store.
  -- Condition: auth.uid() IS NOT NULL (current caller), not v_receiver_id + is_verified.
  -- This covers the unclaimed-delivery case where receiver_profile_id is still NULL.
  -- SECURITY DEFINER bypasses RLS so both verified and unverified authenticated
  -- users write immediately. Anon callers skip; positions replay via
  -- persist_anonymous_completion at signup.
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO point_positions (point_id, user_id, position)
    VALUES (p_point_id, auth.uid(), p_position::position_type)
    ON CONFLICT (point_id, user_id) DO UPDATE
      SET position = EXCLUDED.position, updated_at = now();
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_point_response_by_token(UUID, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION submit_point_response_by_token(UUID, UUID, TEXT) TO authenticated;

-- ============================================================================
-- replay_letter_positions
-- ============================================================================
CREATE OR REPLACE FUNCTION public.replay_letter_positions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_count     INTEGER;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = v_caller_id AND is_verified = true
  ) THEN
    RETURN 0;
  END IF;

  INSERT INTO point_positions (point_id, user_id, position)
  SELECT DISTINCT ON (lpr.point_id)
         lpr.point_id,
         v_caller_id,
         lpr.position::position_type
  FROM letter_point_responses lpr
  JOIN letter_deliveries ld ON ld.id = lpr.delivery_id
  WHERE ld.receiver_profile_id = v_caller_id
    AND NOT EXISTS (SELECT 1 FROM public.point_chat_shares pcs WHERE pcs.point_id = lpr.point_id) -- P1631 review fixes: a chat-published point takes positions only from people who can read its card
    AND NOT EXISTS (SELECT 1 FROM public.clarify_drafts cdr WHERE cdr.point_id = lpr.point_id) -- P1631 adversary fixes: nor does a Clarify point, published or not
    AND EXISTS (SELECT 1 FROM public.letter_story_snapshots lss, jsonb_array_elements(lss.point_config->'points') kp -- P1631 adversary fixes: only an answer for a point in that delivery's sealed letter (predates P1631: the staging policy never checked it)
                 WHERE lss.letter_id = ld.letter_id AND (kp->>'id')::uuid = lpr.point_id) -- P1631 adversary fixes
    AND lpr.position IN (
      'strongly_disagree', 'disagree', 'somewhat_disagree', 'unsure',
      'somewhat_agree', 'agree', 'strongly_agree'
    )
  ORDER BY lpr.point_id, lpr.created_at DESC NULLS LAST
  ON CONFLICT (point_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.replay_letter_positions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.replay_letter_positions() FROM anon;
GRANT EXECUTE ON FUNCTION public.replay_letter_positions() TO authenticated;

COMMIT;
