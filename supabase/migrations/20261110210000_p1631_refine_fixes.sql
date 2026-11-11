-- client-safe: the two service-role workers keep their argument lists, SECURITY DEFINER, search_path and grants (no client calls them); clarify_message and clarify_another keep their signatures, answers and grants and only start from the thread root when every draft is gone.
-- Migration: P1631 step 1b review fixes (hostile review round 5: a refine never deletes a point anything references; a thread with no drafts left still works; the owner messages a run reads are bounded to the run)
-- Created: 2026-11-10
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md
-- Guaranteed by: src/tests/p1631-clarify-drafts-migration.test.ts (source contract), src/tests/integration/p1631-clarify-drafts.test.ts (behaviour on the test database)
--
-- diffed against:
--   _clarify_begin(uuid)                           20261110200000_p1631_refine.sql (its newest definition): that body byte for byte plus the lines marked `-- P1631 r4`.
--   _clarify_complete(uuid, jsonb, numeric, uuid)  20261110200000_p1631_refine.sql (its newest definition): that body byte for byte, except the lines marked `-- P1631 r4`.
--   clarify_message(uuid, text)                    20261110200000_p1631_refine.sql (its newest definition): that body byte for byte plus the lines marked `-- P1631 r4`.
--   clarify_another(uuid, text)                    20261110153000_p1631_clarify_drafts.sql (its newest definition): that body byte for byte plus the lines marked `-- P1631 r4`.
--
-- Changes:
--   begin     owner_messages holds only messages sent at or before the draft was queued.
--   complete  a refine deletes the old point only when nothing references it (private, the presser's, no position by anyone else, no story, canvas, letter, badge or supersede link, no canvas_ tag,
--             no other clarify draft); otherwise the old row stays, unlinked from the draft. sent_ids are deduplicated on a refine.
--   message   the queued run is stamped after its own message (clock_timestamp), so begin's owner_messages bound includes it.
--   message / another  with every draft of the thread deleted, a new draft starts from the thread root (its copy of the pressed message), for the thread's owner only.

-- The run records which draft it showed the model as the latest: complete refines exactly that one. No foreign key: a deleted target must read as gone, not as null.
-- Not in the owner's column grant, so no client can read it.
ALTER TABLE public.clarify_drafts ADD COLUMN IF NOT EXISTS refine_target_id uuid;

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

  -- the points this presser already made from this conversation: not to be repeated
  SELECT COALESCE(jsonb_agg(p.statement ORDER BY d2.created_at, d2.id), '[]'::jsonb) INTO v_already
    FROM public.clarify_drafts d2 JOIN public.points p ON p.id = d2.point_id
   WHERE d2.owner_id = v_d.owner_id AND d2.source_conversation_id = v_d.source_conversation_id AND d2.state = 'done';

  -- what the owner typed in this thread (their own directions, newest 20, oldest first) and their newest draft, which a refine replaces -- P1631 r3
  SELECT COALESCE(jsonb_agg(left(o.body, 500) ORDER BY o.created_at, o.id), '[]'::jsonb) INTO v_owner_msgs FROM ( -- P1631 r3
    SELECT m.body, m.created_at, m.id FROM public.chat_messages m -- P1631 r3
     WHERE m.thread_root_id = v_d.thread_root_id AND m.author_id = v_d.owner_id AND m.kind = 'message' -- P1631 r3
       AND m.deleted_at IS NULL AND NULLIF(btrim(m.body), '') IS NOT NULL -- P1631 r3
       AND m.created_at <= v_d.created_at -- P1631 r4
     ORDER BY m.created_at DESC, m.id DESC LIMIT 20) o; -- P1631 r3
  SELECT p.statement, d3.id INTO v_latest, v_latest_id FROM public.clarify_drafts d3 JOIN public.points p ON p.id = d3.point_id -- P1631 r3
   WHERE d3.thread_root_id = v_d.thread_root_id AND d3.owner_id = v_d.owner_id AND d3.state = 'done' AND d3.id <> v_d.id -- P1631 r3
   ORDER BY d3.created_at DESC, d3.id DESC LIMIT 1; -- P1631 r3

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
  v_l        public.clarify_drafts; -- P1631 r3
  v_lp       public.points; -- P1631 r3
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

  -- P1631 r3: a message in the thread refines the owner's latest draft (target 'latest', the default) unless the model asked for another point. The draft keeps its row and gets a NEW point row;
  -- the owner's position carries over; the run row goes. A point someone other than the owner has a position on is fixed: then the run row stays as a new draft.
  IF v_decision = 'draft' AND v_d.instruction IS NOT NULL AND COALESCE(v_target, 'latest') = 'latest' THEN -- P1631 r3
    SELECT l.* INTO v_l FROM public.clarify_drafts l -- P1631 r3
     WHERE l.id = v_d.refine_target_id AND l.owner_id = v_d.owner_id AND l.state = 'done' AND l.point_id IS NOT NULL -- P1631 r4: exactly the draft the model saw, if it is still there
     FOR UPDATE; -- P1631 r4
    IF FOUND THEN -- P1631 r3
      SELECT p.* INTO v_lp FROM public.points p WHERE p.id = v_l.point_id AND p.first_validator_id = v_d.owner_id FOR UPDATE; -- P1631 r3
      IF FOUND AND NOT EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = v_lp.id AND pp.user_id IS DISTINCT FROM v_d.owner_id) THEN -- P1631 r3
        INSERT INTO public.points (statement, first_validator_id, visibility, tags, system_tags) -- P1631 r3
        VALUES (v_stmt, v_d.owner_id, 'private'::public.content_visibility, '{}', '{}') -- P1631 r3
        RETURNING id INTO v_pid; -- P1631 r3
        INSERT INTO public.point_positions (point_id, user_id, position, reasoning) -- P1631 r3
        SELECT v_pid, pp.user_id, pp.position, pp.reasoning FROM public.point_positions pp WHERE pp.point_id = v_lp.id AND pp.user_id = v_d.owner_id; -- P1631 r3
        UPDATE public.clarify_drafts l -- P1631 r3
           SET point_id = v_pid, cited = jsonb_build_object('a', v_a, 'b', v_b), -- P1631 r3
               derived_refs = ARRAY(SELECT DISTINCT u FROM unnest(l.derived_refs || v_d.derived_refs) u), sent_ids = ARRAY(SELECT DISTINCT u FROM unnest(l.sent_ids || v_d.sent_ids) u), updated_at = now() -- P1631 r4
         WHERE l.id = v_l.id; -- P1631 r3
        -- the old point goes only when nothing references it: any reference keeps the row (it is just no longer this draft's point) -- P1631 r4
        DELETE FROM public.points p WHERE p.id = v_lp.id -- P1631 r4
           AND p.visibility = 'private'::public.content_visibility AND p.first_validator_id = v_d.owner_id AND p.superseded_by IS NULL -- P1631 r4
           AND NOT EXISTS (SELECT 1 FROM public.points s WHERE s.superseded_by = p.id) -- P1631 r4
           AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.tags, '{}') || COALESCE(p.system_tags, '{}')) t WHERE t LIKE 'canvas\_%') -- P1631 r4
           AND NOT EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = p.id AND pp.user_id IS DISTINCT FROM v_d.owner_id) -- P1631 r4
           AND NOT EXISTS (SELECT 1 FROM public.story_points sp WHERE sp.point_id = p.id) -- P1631 r4
           AND NOT EXISTS (SELECT 1 FROM public.canvas_added_stories cs WHERE cs.point_id = p.id) -- P1631 r4
           AND NOT EXISTS (SELECT 1 FROM public.canvas_draft_points cp WHERE cp.point_id = p.id) -- P1631 r4
           AND NOT EXISTS (SELECT 1 FROM public.letter_point_responses lr WHERE lr.point_id = p.id) -- P1631 r4
           AND NOT EXISTS (SELECT 1 FROM public.badge_points bp WHERE bp.point_id = p.id) -- P1631 r4
           AND NOT EXISTS (SELECT 1 FROM public.clarify_drafts od WHERE od.point_id = p.id); -- P1631 r4
        PERFORM public._mirror_settle(v_d.spend_id, v_charge); -- P1631 r3
        DELETE FROM public.clarify_drafts d WHERE d.id = v_d.id; -- P1631 r3
        RETURN jsonb_build_object('status', 'done', 'point_id', v_pid, 'refined', v_l.id); -- P1631 r3
      END IF; -- P1631 r3
    END IF; -- P1631 r3
  END IF; -- P1631 r3

  IF v_decision = 'draft' THEN
    INSERT INTO public.points (statement, first_validator_id, visibility, tags, system_tags)
    VALUES (v_stmt, v_d.owner_id, 'private'::public.content_visibility, '{}', '{}')
    RETURNING id INTO v_pid;
    UPDATE public.clarify_drafts d
       SET state = 'done', point_id = v_pid, cited = jsonb_build_object('a', v_a, 'b', v_b), suggestions = NULL, error_code = NULL, updated_at = now()
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

CREATE OR REPLACE FUNCTION public.clarify_message(p_thread_root uuid, p_text text)
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
  INSERT INTO public.clarify_drafts (owner_id, mirror_conversation_id, thread_root_id, source_conversation_id, source_message_id, instruction)
  VALUES (v_uid, v_last.mirror_conversation_id, v_last.thread_root_id, v_last.source_conversation_id, v_last.source_message_id, v_text)
  RETURNING id INTO v_id; -- a unique_violation (a race past the lock) rolls the whole call back, the message with it
  UPDATE public.clarify_drafts d SET created_at = clock_timestamp() WHERE d.id = v_id; -- P1631 r4: send_chat_message stamps the message with clock_timestamp(); the run must not be older than its own message
  RETURN jsonb_build_object('status', 'started', 'draft_id', v_id, 'message_id', v_msg.id, 'thread_root_id', v_last.thread_root_id, 'mirror_conversation_id', v_last.mirror_conversation_id);
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_message(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_message(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.clarify_another(p_thread_root uuid, p_instruction text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_last  public.clarify_drafts;
  v_instr text := NULLIF(btrim(COALESCE(p_instruction, '')), '');
  v_id    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_instr IS NOT NULL AND char_length(v_instr) > 500 THEN
    RAISE EXCEPTION 'clarify: instruction too long' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1631:clarify:' || v_uid::text, 0));
  PERFORM public._clarify_sweep(v_uid);
  IF NOT EXISTS (SELECT 1 FROM public.clarify_threads t WHERE t.root_id = p_thread_root AND t.owner_id = v_uid) THEN -- P1631 r4: the thread's owner only, checked up front as clarify_message does
    RAISE EXCEPTION 'clarify: thread not available' USING ERRCODE = '42501'; -- P1631 r4
  END IF; -- P1631 r4
  SELECT d.* INTO v_last FROM public.clarify_drafts d
   WHERE d.thread_root_id = p_thread_root AND d.owner_id = v_uid
   ORDER BY d.created_at DESC, d.id DESC LIMIT 1;
  IF NOT FOUND THEN -- P1631 r4: every draft of the thread was deleted; start again from the thread root, which still carries the copy of the pressed message
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
  BEGIN
    INSERT INTO public.clarify_drafts (owner_id, mirror_conversation_id, thread_root_id, source_conversation_id, source_message_id, instruction)
    VALUES (v_uid, v_last.mirror_conversation_id, v_last.thread_root_id, v_last.source_conversation_id, v_last.source_message_id, v_instr)
    RETURNING id INTO v_id;
    UPDATE public.clarify_drafts d SET created_at = clock_timestamp() WHERE d.id = v_id; -- P1631 r4: stamped as clarify_message stamps its run
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'busy');
  END;
  RETURN jsonb_build_object('status', 'started', 'draft_id', v_id, 'thread_root_id', v_last.thread_root_id, 'mirror_conversation_id', v_last.mirror_conversation_id);
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_another(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_another(uuid, text) TO authenticated;
