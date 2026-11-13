-- client-safe: clarify_start_chat, _clarify_begin and replay_letter_positions keep their signatures, return types, SECURITY DEFINER, search_path and grants. Behaviour: the table-privacy exclusions of 20261112200000, 20261112220000 and 20261112240000 now apply only in an EVENT chat, so a recording in a DM or a group is read by chat-scope Clarify; at an event the presser's own transcribed lines are kept; the replay's snapshot join no longer fails on a malformed snapshot row
-- Migration: P1631 event-only exclusion (round 2 hostile review N2, N3, N4)
-- Created: 2026-11-12
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md
-- Guaranteed by: src/tests/p1631-clarify-scope.test.ts, src/tests/p1631-letter-path-migration.test.ts (source contract), src/tests/integration/p1631-clarify-scope.test.ts, src/tests/integration/p1631-letter-path.test.ts
--
-- Earlier P1631 migrations are applied and are not edited. Each replaced function is the newest body (20261112240000) copied byte for byte, then marked lines (`-- P1631 event only`).
-- Unlike 240000 this file also REPLACES a fixed list of earlier lines in place (each replacement is a marked line at the same position; the unit test removes the replaced old lines and the marked
-- new ones and requires the rest to be identical). The replaced lines are:
--   clarify_start_chat: the anchor's `m.is_transcription = false` line.
--   _clarify_begin:     the re-anchor's `m.is_transcription = false` line; the thread selection's `NOT (v_scope = 'chat' AND v_src.system_kind IS NOT NULL)` line; the chat selection's two lines of the
--                       round/outside/session-thread exclusion (`OR (v_scope = 'chat' AND NOT EXISTS (...` and its closing `OR EXISTS (... transcribe_session_threads ...)))))` line), its
--                       `(v_scope <> 'chat' OR x.system_kind IS NULL)` line and its `x.is_transcription = false` line; the first line of each of the three published-card thread filters (already_drafted, the
--                       draft-refs subselect, the publisher-ref select).
--   replay_letter_positions: the two lines of the snapshot-membership join.
--
-- diffed against:
--   clarify_start_chat(uuid, boolean)       20261112240000_p1631_adversary_fixes.sql (its newest definition)
--   _clarify_begin(uuid)                    20261112240000_p1631_adversary_fixes.sql (its newest definition)
--   replay_letter_positions()               20261112240000_p1631_adversary_fixes.sql (its newest definition)
--
-- N3. The exclusions exist to keep OTHER TABLES' speech out of a run at an event. In a DM or a group the recording (a session thread, its transcribed lines) IS the conversation, and every member can read
--     it. The source conversation's kind is read once (clarify_start_chat: v_kind, already read; _clarify_begin: v_event, new) and these apply only when it is 'event':
--       - the transcribed-line exclusion of the anchor, the re-anchor and the surrounding chat (is_transcription);
--       - in chat scope: the top-level system_kind filter on the surrounding chat, and the exclusion of replies inside round, outside-rounds and session threads (a DM session thread can hold up to 720
--         rows; c_chars and the row caps still bound the read);
--       - in chat scope: the guard that reads no thread when the anchor has a system_kind;
--       - the published-card thread filter of already_drafted and of the two derived_refs selects.
--     Unchanged everywhere: the anchor needs `system_kind IS NULL` (a root's title is never a good anchor), kind = 'message', no context conversation, and the pressed row/thread rules.
-- N4. At an event the PRESSER's own top-level transcribed lines are kept in the surrounding chat (a late arrival's own table is posted at the top level): the filter is `NOT v_event OR is_transcription = false
--     OR author_id = owner`. Another attendee's transcribed line is still excluded.
-- N2. The replay's snapshot join lacked the P705 type guard (20260415160001): a scalar `points` or a non-uuid id raised an error and rolled back the whole replay for that recipient. It now wraps
--     jsonb_array_elements in `CASE WHEN jsonb_typeof(lss.point_config->'points') = 'array' ... ELSE '[]'` and compares the id as text (`kp->>'id' = lpr.point_id::text`), so one malformed row costs
--     only that letter. (The 240000 gap this closes predates P1631 in the staging policy; this file only hardens the new join.)

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
     AND (v_kind <> 'event' OR m.is_transcription = false) -- P1631 event only: at an event a transcribed line is never an anchor (a late arrival's lines are posted at the top level); in a DM or group a recording is the conversation
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
  v_event       boolean; -- P1631 event only
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
  -- the table-privacy exclusions below apply at an EVENT only: in a DM or a group a recording is the conversation -- P1631 event only
  SELECT COALESCE((SELECT c.kind = 'event' FROM public.chat_conversations c WHERE c.id = v_d.source_conversation_id), false) INTO v_event; -- P1631 event only
  -- a whole-chat thread outlives its anchor: when the anchor was deleted or its author erased, the run moves to the newest eligible top-level row (the same filter as clarify_start_chat's anchor) -- P1631 chat scope fixes
  IF COALESCE((SELECT t.scope FROM public.clarify_threads t WHERE t.root_id = v_d.thread_root_id), 'message') = 'chat' THEN -- P1631 chat scope fixes
    SELECT m.id INTO v_anchor FROM public.chat_messages m -- P1631 chat scope fixes
     WHERE m.conversation_id = v_d.source_conversation_id AND m.thread_root_id IS NULL AND m.kind = 'message' AND m.context_conversation_id IS NULL -- P1631 chat scope fixes
       AND m.system_kind IS NULL AND m.deleted_at IS NULL AND m.created_at >= v_since AND m.created_at <= v_d.created_at -- P1631 chat scope fixes
       AND (NOT v_event OR m.is_transcription = false) -- P1631 event only
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
           AND NOT (v_scope = 'chat' AND v_event AND v_src.system_kind IS NOT NULL) -- P1631 event only: at an event a whole-chat run never reads the thread of a round or session root
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
                OR (v_scope = 'chat' AND (NOT v_event OR NOT EXISTS (SELECT 1 FROM public.chat_messages r -- P1631 event only: a whole chat also reads ordinary thread replies; at an event never a round, outside-rounds or session thread
                      WHERE r.id = x.thread_root_id AND (r.system_kind IS NOT NULL -- P1631 scope
                            OR EXISTS (SELECT 1 FROM public.transcribe_session_threads st WHERE st.root_message_id = r.id)))))) -- P1631 event only
           AND (v_scope <> 'chat' OR NOT v_event OR x.system_kind IS NULL) -- P1631 event only: at an event a whole-chat run never sends a round-thread or session root row
           AND (NOT v_event OR x.is_transcription = false OR x.author_id = v_d.owner_id) -- P1631 event only: at an event surrounding chat is typed messages and the presser's own transcribed lines, in every scope
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
       AND (NOT v_event OR m.thread_root_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.chat_messages rr WHERE rr.id = m.thread_root_id -- P1631 event only: at an event not a card inside a round, outside-rounds or session thread
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
          AND (NOT v_event OR m.thread_root_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.chat_messages rr WHERE rr.id = m.thread_root_id -- P1631 event only: the same set as already_drafted
                AND (rr.system_kind IS NOT NULL OR EXISTS (SELECT 1 FROM public.transcribe_session_threads sst WHERE sst.root_message_id = rr.id)))) -- P1631 adversary fixes
          AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id AND m.created_at >= v_since)) r; -- P1631 review fixes
  -- and the publisher's own ref for each published point shown: their words are the statement (so erasing the publisher reaches this draft) -- P1631 adversary fixes
  SELECT array_remove(array_agg(DISTINCT r.ref), NULL) INTO v_refs FROM ( -- P1631 adversary fixes
    SELECT unnest(COALESCE(v_refs, '{}')) AS ref -- P1631 adversary fixes
    UNION -- P1631 adversary fixes
    SELECT public._chat_author_ref(s.shared_by) AS ref FROM public.point_chat_shares s JOIN public.chat_messages m ON m.id = s.message_id -- P1631 adversary fixes
     WHERE s.conversation_id = v_d.source_conversation_id AND m.deleted_at IS NULL -- P1631 adversary fixes
       AND (NOT v_event OR m.thread_root_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.chat_messages rr WHERE rr.id = m.thread_root_id -- P1631 event only
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
    AND EXISTS (SELECT 1 FROM public.letter_story_snapshots lss, jsonb_array_elements(CASE WHEN jsonb_typeof(lss.point_config->'points') = 'array' THEN lss.point_config->'points' ELSE '[]'::jsonb END) kp -- P1631 event only: only an answer for a point in that delivery's sealed letter; the P705 type guard keeps a malformed snapshot from failing the whole replay
                 WHERE lss.letter_id = ld.letter_id AND kp->>'id' = lpr.point_id::text) -- P1631 event only
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
