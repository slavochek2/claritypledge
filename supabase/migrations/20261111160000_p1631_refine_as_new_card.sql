-- client-safe: the two service-role workers keep their argument lists, SECURITY DEFINER, search_path and grants (no client calls them); clarify_message gains ONE trailing argument with a default (a deployed client that sends two arguments still resolves to it, and its answer is unchanged); clarify_draft_edit and get_clarify_thread keep their signatures and grants; get_clarify_thread's answer gains one key per draft (a client that ignores it is unaffected). A refine now adds a card instead of replacing one, which a deployed client shows as one more draft in the thread.
-- Migration: P1631 thread redesign (founder-approved 2026-11-11): a refine is a NEW card and the old one stays; Mention in chat names the card a message refines; a hand edit clears the owner's position
-- Created: 2026-11-11
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md
-- Guaranteed by: src/tests/p1631-clarify-drafts-migration.test.ts (source contract), src/tests/integration/p1631-clarify-drafts.test.ts (behaviour on the test database)
--
-- diffed against:
--   _clarify_begin(uuid)                           20261110210000_p1631_refine_fixes.sql (its newest definition): that body byte for byte, except the lines marked `-- P1631 r5`.
--   _clarify_complete(uuid, jsonb, numeric, uuid)  20261110210000_p1631_refine_fixes.sql (its newest definition): that body byte for byte, except the lines marked `-- P1631 r5` and the block this file removes (see Changes).
--   clarify_message(uuid, text)                    20261110210000_p1631_refine_fixes.sql (its newest definition): that body byte for byte plus the lines marked `-- P1631 r5`; replaced by clarify_message(uuid, text, uuid).
--   clarify_draft_edit(uuid, text)                 20261110153000_p1631_clarify_drafts.sql (its newest definition): that body byte for byte plus the lines marked `-- P1631 r5`.
--   get_clarify_thread(uuid)                       20261110153000_p1631_clarify_drafts.sql (its newest definition): that body byte for byte plus the lines marked `-- P1631 r5`.
--
-- Changes:
--   complete  the "refine in place" block is REMOVED: a refine result is the run's own draft row with its own new point, exactly like any other draft. The owner's position is NOT copied (the new card has none),
--             the old draft row, its point and its position are not touched, and nothing is deleted. The new row keeps refine_target_id (the card the instruction was about) when the instruction refined the latest
--             draft; it is set to NULL for an "Another point" run (no instruction) and for a model answer of target `new`, so the column reads "this card refines that card" and nothing else.
--   begin     the card shown to the model as latest_draft is the one named by refine_target_id when the run has an instruction and that card is still a done draft of this thread (Mention in chat), else the newest done draft as before.
--             already_drafted leaves out that card on a refine (the new point is its replacement, not a repeat). The latest-draft read moves above the already_drafted read, which needs its id.
--   message   a new optional argument p_target: the card a Mention in chat names. It must be a done draft of this thread owned by the caller (any other id is refused like a thread that is not available); it is stored as the
--             new draft's refine_target_id, which begin then honours.
--   edit      a changed text clears the owner's position on that point in the same call (an unchanged text writes nothing, as before).
--   thread    each draft also carries refine_target_id, so the screen can tell which card a card replaced.

-- The old two-argument function is dropped: with a defaulted third argument both would match a two-argument call and the call would be ambiguous.
DROP FUNCTION IF EXISTS public.clarify_message(uuid, text);

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
         WHERE x.conversation_id = v_d.source_conversation_id AND x.thread_root_id IS NULL
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
   WHERE d2.owner_id = v_d.owner_id AND d2.source_conversation_id = v_d.source_conversation_id AND d2.state = 'done'
     AND NOT (v_d.instruction IS NOT NULL AND d2.id IS NOT DISTINCT FROM v_latest_id); -- P1631 r5: a refine replaces that card, so it is not a repeat

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
         refine_target_id = v_latest_id -- P1631 r4: the draft whose statement is sent as latest_draft
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
    'latest_draft', v_latest); -- P1631 r3
END;
$$;
REVOKE ALL ON FUNCTION public._clarify_begin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._clarify_begin(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public._clarify_complete(p_draft uuid, p_result jsonb, p_usd numeric, p_run uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_d        public.clarify_drafts;
  v_reserved numeric;
  v_charge   numeric;
  v_decision text;
  v_stmt     text;
  v_a        jsonb := '[]'::jsonb;
  v_b        jsonb := '[]'::jsonb;
  v_sugg     jsonb := '[]'::jsonb;
  v_el       jsonb;
  v_pid      uuid;
  v_bad      boolean := false;
  v_target   text; -- P1631 r3
BEGIN
  SELECT d.* INTO v_d FROM public.clarify_drafts d WHERE d.id = p_draft FOR UPDATE;
  IF NOT FOUND THEN
    IF p_run IS NOT NULL THEN -- P1631 r2: the draft is gone (deleted or erased): its run's reservation must not stay held; _mirror_settle touches a row only while still `reserved`
      PERFORM public._mirror_settle(p_run, COALESCE(p_usd, (SELECT s.reserved_usd FROM public.mirror_ai_spend s WHERE s.id = p_run))); -- P1631 r2
    END IF; -- P1631 r2
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  SELECT s.reserved_usd INTO v_reserved FROM public.mirror_ai_spend s WHERE s.id = p_run; -- P1631
  v_charge := COALESCE(p_usd, v_reserved);
  IF v_d.state <> 'running' OR v_d.spend_id IS DISTINCT FROM p_run THEN -- P1631
    IF p_run IS NOT NULL THEN -- P1631
      PERFORM public._mirror_settle(p_run, v_charge); -- P1631
    END IF;
    RETURN jsonb_build_object('status', 'gone');
  END IF;

  IF p_result IS NULL OR jsonb_typeof(p_result) <> 'object' THEN
    v_bad := true;
  ELSE
    v_decision := p_result ->> 'decision';
    IF v_decision = 'draft' THEN
      v_target := p_result ->> 'target'; -- P1631 r3: validated here; absent or null means the latest
      IF v_target IS NOT NULL AND v_target NOT IN ('latest', 'new') THEN -- P1631 r3
        v_bad := true; -- P1631 r3
      END IF; -- P1631 r3
      v_stmt := btrim(COALESCE(p_result ->> 'statement', ''));
      IF char_length(v_stmt) NOT BETWEEN 1 AND 300 THEN
        v_bad := true;
      END IF;
      IF NOT v_bad AND p_result -> 'cited' IS NOT NULL AND jsonb_typeof(p_result -> 'cited') = 'object' THEN
        v_a := COALESCE(p_result -> 'cited' -> 'a', '[]'::jsonb);
        v_b := COALESCE(p_result -> 'cited' -> 'b', '[]'::jsonb);
      ELSIF NOT v_bad AND p_result -> 'cited' IS NOT NULL AND jsonb_typeof(p_result -> 'cited') <> 'null' THEN
        v_bad := true;
      END IF;
      IF NOT v_bad AND (jsonb_typeof(v_a) <> 'array' OR jsonb_typeof(v_b) <> 'array'
                        OR jsonb_array_length(v_a) > 20 OR jsonb_array_length(v_b) > 20) THEN
        v_bad := true;
      END IF;
      IF NOT v_bad THEN
        FOR v_el IN SELECT e FROM jsonb_array_elements(v_a || v_b) e LOOP
          -- one test per IF branch: the cast to uuid must only run on text that has the shape of one
          IF jsonb_typeof(v_el) <> 'string' THEN
            v_bad := true;
          ELSIF (v_el #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            v_bad := true;
          ELSIF NOT ((v_el #>> '{}')::uuid = ANY (v_d.sent_ids)) THEN
            v_bad := true;
          END IF;
        END LOOP;
      END IF;
    ELSIF v_decision = 'refuse' THEN
      -- an explicit instruction always drafts: a refusal answering one is not an answer
      IF v_d.instruction IS NOT NULL THEN
        v_bad := true;
      ELSIF jsonb_typeof(p_result -> 'suggestions') = 'array' THEN
        -- P1631: distinct strings only (the client keys its chips by text), first occurrence wins, at most 3
        SELECT COALESCE(jsonb_agg(to_jsonb(s.t) ORDER BY s.o), '[]'::jsonb) INTO v_sugg FROM ( -- P1631
          SELECT q.t, q.o FROM (SELECT btrim(e #>> '{}') AS t, min(o) AS o FROM jsonb_array_elements(p_result -> 'suggestions') WITH ORDINALITY AS x(e, o) -- P1631
           WHERE jsonb_typeof(e) = 'string' AND char_length(btrim(e #>> '{}')) BETWEEN 1 AND 200 GROUP BY btrim(e #>> '{}')) q -- P1631
           ORDER BY q.o LIMIT 3) s; -- P1631
      END IF;
      -- P1631: a refusal with nothing to offer after filtering is not an answer: bad_output (settled at the actual cost below)
      IF NOT v_bad AND jsonb_array_length(v_sugg) = 0 THEN -- P1631
        v_bad := true; -- P1631
      END IF; -- P1631
    ELSE
      v_bad := true;
    END IF;
  END IF;

  IF v_bad THEN
    UPDATE public.clarify_drafts d SET state = 'failed', error_code = 'bad_output', updated_at = now() WHERE d.id = v_d.id;
    PERFORM public._mirror_settle(v_d.spend_id, v_charge);
    RETURN jsonb_build_object('status', 'failed', 'code', 'bad_output');
  END IF;

  -- P1631 r5: no refine-in-place. A refine result is this run's own draft row with its own new point, below; the owner's earlier card, its point and its position are left exactly as they were.

  IF v_decision = 'draft' THEN
    INSERT INTO public.points (statement, first_validator_id, visibility, tags, system_tags)
    VALUES (v_stmt, v_d.owner_id, 'private'::public.content_visibility, '{}', '{}')
    RETURNING id INTO v_pid;
    UPDATE public.clarify_drafts d
       SET state = 'done', point_id = v_pid, cited = jsonb_build_object('a', v_a, 'b', v_b), suggestions = NULL, error_code = NULL, updated_at = now(),
           refine_target_id = CASE WHEN v_d.instruction IS NOT NULL AND COALESCE(v_target, 'latest') = 'latest' THEN v_d.refine_target_id ELSE NULL END -- P1631 r5: set only when this card refines another
     WHERE d.id = v_d.id;
    PERFORM public._mirror_settle(v_d.spend_id, v_charge);
    RETURN jsonb_build_object('status', 'done', 'point_id', v_pid);
  END IF;

  UPDATE public.clarify_drafts d
     SET state = 'refused', suggestions = v_sugg, cited = NULL, error_code = NULL, updated_at = now()
   WHERE d.id = v_d.id;
  PERFORM public._mirror_settle(v_d.spend_id, v_charge);
  RETURN jsonb_build_object('status', 'refused');
END;
$$;
REVOKE ALL ON FUNCTION public._clarify_complete(uuid, jsonb, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._clarify_complete(uuid, jsonb, numeric, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.clarify_message(p_thread_root uuid, p_text text, p_target uuid DEFAULT NULL) -- P1631 r5
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_last  public.clarify_drafts;
  v_text  text := NULLIF(btrim(COALESCE(p_text, '')), '');
  v_msg   public.chat_messages;
  v_id    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_text IS NULL OR char_length(v_text) > 500 THEN
    RAISE EXCEPTION 'clarify: bad message' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1631:clarify:' || v_uid::text, 0));
  PERFORM public._clarify_sweep(v_uid);
  IF NOT EXISTS (SELECT 1 FROM public.clarify_threads t WHERE t.root_id = p_thread_root AND t.owner_id = v_uid) THEN
    RAISE EXCEPTION 'clarify: thread not available' USING ERRCODE = '42501';
  END IF;
  IF p_target IS NOT NULL AND NOT EXISTS ( -- P1631 r5: the card a Mention in chat names: the caller's own, in this thread, made
    SELECT 1 FROM public.clarify_drafts d WHERE d.id = p_target AND d.owner_id = v_uid AND d.thread_root_id = p_thread_root AND d.state = 'done' AND d.point_id IS NOT NULL) THEN -- P1631 r5
    RAISE EXCEPTION 'clarify: draft not available' USING ERRCODE = '42501'; -- P1631 r5
  END IF; -- P1631 r5
  SELECT d.* INTO v_last FROM public.clarify_drafts d
   WHERE d.thread_root_id = p_thread_root AND d.owner_id = v_uid
   ORDER BY d.created_at DESC, d.id DESC LIMIT 1;
  IF NOT FOUND THEN -- P1631 r4: every draft of the thread was deleted; start again from the thread root, which still carries the copy of the pressed message
    IF NOT EXISTS (SELECT 1 FROM public.clarify_threads t WHERE t.root_id = p_thread_root AND t.owner_id = v_uid) THEN -- P1631 r4
      RAISE EXCEPTION 'clarify: thread not available' USING ERRCODE = '42501'; -- P1631 r4
    END IF; -- P1631 r4
    SELECT r.conversation_id, r.id, r.forwarded_from_message_id, (SELECT m.conversation_id FROM public.chat_messages m WHERE m.id = r.forwarded_from_message_id) -- P1631 r4
      INTO v_last.mirror_conversation_id, v_last.thread_root_id, v_last.source_message_id, v_last.source_conversation_id -- P1631 r4
      FROM public.chat_messages r WHERE r.id = p_thread_root AND r.deleted_at IS NULL; -- P1631 r4
    IF v_last.source_message_id IS NULL OR v_last.source_conversation_id IS NULL THEN -- P1631 r4
      RAISE EXCEPTION 'clarify: thread not available' USING ERRCODE = '42501'; -- P1631 r4
    END IF; -- P1631 r4
  END IF; -- P1631 r4
  IF EXISTS (SELECT 1 FROM public.clarify_drafts d WHERE d.owner_id = v_uid AND d.state IN ('queued', 'running')) THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;
  v_msg := public.send_chat_message(v_last.mirror_conversation_id, v_text, NULL, p_thread_root);
  INSERT INTO public.clarify_drafts (owner_id, mirror_conversation_id, thread_root_id, source_conversation_id, source_message_id, instruction, refine_target_id) -- P1631 r5
  VALUES (v_uid, v_last.mirror_conversation_id, v_last.thread_root_id, v_last.source_conversation_id, v_last.source_message_id, v_text, p_target) -- P1631 r5
  RETURNING id INTO v_id; -- a unique_violation (a race past the lock) rolls the whole call back, the message with it
  UPDATE public.clarify_drafts d SET created_at = clock_timestamp() WHERE d.id = v_id; -- P1631 r4: send_chat_message stamps the message with clock_timestamp(); the run must not be older than its own message
  RETURN jsonb_build_object('status', 'started', 'draft_id', v_id, 'message_id', v_msg.id, 'thread_root_id', v_last.thread_root_id, 'mirror_conversation_id', v_last.mirror_conversation_id);
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_message(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_message(uuid, text, uuid) TO authenticated;

-- The owner edits the text of a draft point. A point is fixed once someone else has a position on it. An unchanged text writes nothing.
CREATE OR REPLACE FUNCTION public.clarify_draft_edit(p_draft uuid, p_statement text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_d    public.clarify_drafts;
  v_p    public.points;
  v_stmt text := btrim(COALESCE(p_statement, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT d.* INTO v_d FROM public.clarify_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clarify: draft not available' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_stmt) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'clarify: bad statement' USING ERRCODE = '22023';
  END IF;
  IF v_d.state <> 'done' OR v_d.point_id IS NULL THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'no_point');
  END IF;
  SELECT p.* INTO v_p FROM public.points p WHERE p.id = v_d.point_id AND p.first_validator_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'no_point');
  END IF;
  IF EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = v_p.id AND pp.user_id <> v_uid) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'fixed');
  END IF;
  IF v_stmt = btrim(v_p.statement) THEN
    RETURN jsonb_build_object('status', 'ok', 'changed', false, 'point_id', v_p.id);
  END IF;
  UPDATE public.points p SET statement = v_stmt WHERE p.id = v_p.id;
  DELETE FROM public.point_positions pp WHERE pp.point_id = v_p.id AND pp.user_id = v_uid; -- P1631 r5: new words, so the owner's earlier position on the old words no longer stands
  RETURN jsonb_build_object('status', 'ok', 'changed', true, 'point_id', v_p.id);
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_draft_edit(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_draft_edit(uuid, text) TO authenticated;

-- One Clarify thread as its owner sees it: the drafts oldest first. Cited lines are read from chat_messages by id, now, with no author names, and only rows the
-- owner can still read; quote text never comes from the model. A run past 5 minutes reads as failed `abandoned` (the sweep writes it at the next press or retry).
CREATE OR REPLACE FUNCTION public.get_clarify_thread(p_thread_root uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'thread_root_id', p_thread_root,
    'drafts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id,
        'state', CASE WHEN (d.state = 'running' AND d.started_at < now() - interval '5 minutes')
                        OR (d.state = 'queued' AND d.updated_at < now() - interval '5 minutes') THEN 'failed' ELSE d.state END,
        'error_code', CASE WHEN (d.state = 'running' AND d.started_at < now() - interval '5 minutes')
                        OR (d.state = 'queued' AND d.updated_at < now() - interval '5 minutes') THEN 'abandoned' ELSE d.error_code END,
        'instruction', d.instruction,
        'created_at', d.created_at,
        'refine_target_id', d.refine_target_id, -- P1631 r5: the card this card replaced, when it did
        'point', CASE WHEN p.id IS NOT NULL THEN jsonb_build_object(
                   'id', p.id, 'statement', p.statement,
                   'owner_position', (SELECT pp.position::text FROM public.point_positions pp WHERE pp.point_id = p.id AND pp.user_id = v_uid)) END,
        'suggestions', d.suggestions,
        'cited', CASE WHEN d.cited IS NULL THEN NULL ELSE jsonb_build_object(
          'a', public._clarify_cited_rows(d.cited -> 'a', v_uid),
          'b', public._clarify_cited_rows(d.cited -> 'b', v_uid)) END
      ) ORDER BY d.created_at, d.id)
      FROM public.clarify_drafts d
      LEFT JOIN public.points p ON p.id = d.point_id AND p.first_validator_id = v_uid
     WHERE d.thread_root_id = p_thread_root AND d.owner_id = v_uid), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.get_clarify_thread(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_clarify_thread(uuid) TO authenticated;
