-- client-safe: every change is additive or a refusal lifted. Three new clarify_drafts columns are not granted to clients (they read them through get_clarify_thread, which only gains keys); clarify_draft_edit gains an optional third argument and keeps working with two; the Mirror refusals in the Clarify and Transcribe functions are removed, so no existing call starts failing.
-- diffed against (newest prior definition of each function it redefines; a comment-only addition after the migration was applied):
--   clarify_draft_edit, get_clarify_thread (list shape): 20261112150000_p1631_publish_to_chat.sql / 20261113100000_p1631_recording_clarify.sql
--   clarify_publish: 20261113140000_p1631_thread_point_into_thread.sql
--   clarify_start_chat: 20261112250000_p1631_event_only_exclusion.sql
--   _clarify_begin: 20261113100000_p1631_recording_clarify.sql
--   _clarify_complete, clarify_message: 20261111160000_p1631_refine_as_new_card.sql
--   clarify_start: 20261112200000_p1631_clarify_scope.sql
--   clarify_another: 20261110210000_p1631_refine_fixes.sql
--   mirror_request_reply: 20261110170000_p1631_review_fixes.sql
--   _point_position_write_ok: 20261112200000_p1631_clarify_scope.sql
--   clarify_start_recording: 20261113190000_p1631_recording_clarify_fixes.sql
--   assert_transcribe_chat_access, get_chat_live_transcription: 20261103090100_p1604_transcription_belongs_to_a_chat_rooms.sql
--   _transcribe_chat_name: 20261104110000_p1604_transcription_states.sql
--   get_chat_transcription_processing: 20261104120000_p1604_state_order_and_newest_failure.sql
-- new function: _clarify_mirror_row_ok, clarify_set_visibility
--
-- P1722: make a point alone with the Mirror, private or public, using the screens we already have. Server half.
--
--   1. clarify_drafts gets visibility (private by default on every card), first_published_at (the first publish, never cleared, so a hard-deleted card does not reopen the choice)
--      and public_warning_needed (derived by the server when it chooses the rows a run reads; true unless the run read only the owner's own typed words in the owner's Mirror).
--   2. clarify_set_visibility: the owner's switch, refused on a draft that was ever published or is not the latest card.
--   3. clarify_publish: a Public path (a NEW public point, because trg_point_visibility_immutable never lets a point change visibility), and the Mirror lifted (the card posts to the Mirror main chat, never a thread).
--   4. Tags by typing: model text loses every '#' before it is stored; clarify_draft_edit stores only tags that appear as #tag in the saved text.
--   5. Clarify in the Mirror: clarify_start, clarify_start_chat and the row selection of _clarify_begin, with the Solution-3 exclusion list in _clarify_mirror_row_ok.
--   6. Transcribe in the Mirror: the five server sites that refused a Mirror room.
--   7. mirror_request_reply refuses is_transcription rows; _point_position_write_ok answers true first for a public point.

ALTER TABLE public.clarify_drafts
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS first_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS public_warning_needed boolean NOT NULL DEFAULT true;

ALTER TABLE public.clarify_drafts DROP CONSTRAINT IF EXISTS clarify_drafts_visibility_check;
ALTER TABLE public.clarify_drafts ADD CONSTRAINT clarify_drafts_visibility_check CHECK (visibility IN ('private', 'public'));

-- a draft whose card was ever posted keeps that fact on its own row (share rows cascade away when a message or chat is hard-deleted)
UPDATE public.clarify_drafts d
   SET first_published_at = s.first_at
  FROM (SELECT sh.draft_id, min(sh.created_at) AS first_at FROM public.point_chat_shares sh WHERE sh.draft_id IS NOT NULL GROUP BY sh.draft_id) s
 WHERE s.draft_id = d.id AND d.first_published_at IS NULL;

-- The rows a Mirror Clarify may press or send to the model: the owner's own typed message, voice note or transcribed line. Never a Clarify root, a forward, a shared card,
-- a Mirror agent reply (kind 'agent'), a private ask, a round or session root, or any row inside a Clarify or canvas-draft thread.
CREATE OR REPLACE FUNCTION public._clarify_mirror_row_ok(x public.chat_messages, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT x.kind = 'message' AND x.author_id = p_uid AND x.forwarded_from_message_id IS NULL AND x.attachment_id IS NULL
     AND x.context_conversation_id IS NULL AND x.system_kind IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.clarify_threads t WHERE t.root_id = COALESCE(x.thread_root_id, x.id))
     AND NOT EXISTS (SELECT 1 FROM public.canvas_drafts cd WHERE cd.thread_root_id = COALESCE(x.thread_root_id, x.id));
$$;
REVOKE ALL ON FUNCTION public._clarify_mirror_row_ok(public.chat_messages, uuid) FROM PUBLIC, anon, authenticated;


-- ---- _clarify_complete
CREATE OR REPLACE FUNCTION public._clarify_complete(p_draft uuid, p_result jsonb, p_usd numeric, p_run uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      v_stmt := btrim(replace(COALESCE(p_result ->> 'statement', ''), '#', '')); -- P1722: model text never holds a '#', so every #tag in a draft was typed by the owner
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
$function$
 ;


-- ---- _clarify_begin
CREATE OR REPLACE FUNCTION public._clarify_begin(p_draft uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_mirror      boolean; -- P1722: the source is the owner's own Mirror
  v_warn        boolean := true; -- P1722: the Public warning, false only for a draft read from the owner's own typed words
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
  IF COALESCE((SELECT t.scope FROM public.clarify_threads t WHERE t.root_id = v_d.thread_root_id), 'message') = 'recording' THEN -- P1631 recording
    RETURN public._clarify_begin_recording(p_draft); -- P1631 recording: a live recording reads transcribe_messages, never chat_messages
  END IF; -- P1631 recording

  v_since := public._chat_access_since(v_d.source_conversation_id, v_d.owner_id);
  IF v_since IS NULL THEN
    UPDATE public.clarify_drafts d SET state = 'failed', error_code = 'no_access', updated_at = now() WHERE d.id = p_draft AND d.state = 'queued';
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  -- the table-privacy exclusions below apply at an EVENT only: in a DM or a group a recording is the conversation -- P1631 event only
  SELECT COALESCE((SELECT c.kind = 'event' FROM public.chat_conversations c WHERE c.id = v_d.source_conversation_id), false) INTO v_event; -- P1631 event only
  SELECT COALESCE((SELECT c.kind = 'mirror' AND c.owner_id = v_d.owner_id FROM public.chat_conversations c WHERE c.id = v_d.source_conversation_id), false) INTO v_mirror; -- P1722
  -- a whole-chat thread outlives its anchor: when the anchor was deleted or its author erased, the run moves to the newest eligible top-level row (the same filter as clarify_start_chat's anchor) -- P1631 chat scope fixes
  IF COALESCE((SELECT t.scope FROM public.clarify_threads t WHERE t.root_id = v_d.thread_root_id), 'message') = 'chat' THEN -- P1631 chat scope fixes
    SELECT m.id INTO v_anchor FROM public.chat_messages m -- P1631 chat scope fixes
     WHERE m.conversation_id = v_d.source_conversation_id AND m.thread_root_id IS NULL AND m.kind = 'message' AND m.context_conversation_id IS NULL -- P1631 chat scope fixes
       AND m.system_kind IS NULL AND m.deleted_at IS NULL AND m.created_at >= v_since AND m.created_at <= v_d.created_at -- P1631 chat scope fixes
       AND (NOT v_event OR m.is_transcription = false) -- P1631 event only
       AND (NOT v_mirror OR public._clarify_mirror_row_ok(m, v_d.owner_id)) -- P1722: in the Mirror never a card, a forward or a Clarify or canvas thread row
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
           AND (NOT v_mirror OR public._clarify_mirror_row_ok(x, v_d.owner_id)) -- P1722
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
           AND (NOT v_mirror OR public._clarify_mirror_row_ok(x, v_d.owner_id)) -- P1722: forwards and shared cards are never model rows in the Mirror
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
  -- P1722: the Public warning is skipped only when the source is the owner's Mirror and every row read is a typed message or voice note of the owner's own
  -- (no transcribed line, forward or shared card). Any other draft warns, and so does a draft whose rows are unknown (the column default is true).
  v_warn := NOT (v_mirror AND NOT EXISTS (
    SELECT 1 FROM public.chat_messages w
     WHERE w.id = ANY (v_all)
       AND NOT (w.kind = 'message' AND w.author_id = v_d.owner_id AND w.is_transcription = false
                AND w.forwarded_from_message_id IS NULL AND w.attachment_id IS NULL)));

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
         derived_refs = COALESCE(v_refs, '{}'), sent_ids = v_all, updated_at = now(), public_warning_needed = v_warn, -- P1722
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
$function$
 ;


-- ---- clarify_start
CREATE OR REPLACE FUNCTION public.clarify_start(p_source uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- P1722: in the owner's Mirror only a message the owner typed, spoke or had transcribed is a source: never a Clarify root, a forward, a shared card, a Mirror reply or a row inside a Clarify or canvas-draft thread
    IF EXISTS (SELECT 1 FROM public.chat_messages sm JOIN public.chat_conversations sc ON sc.id = sm.conversation_id -- P1722
                WHERE sm.id = p_source AND sc.kind = 'mirror' AND sc.owner_id = v_uid -- P1722
                  AND NOT public._clarify_mirror_row_ok(sm, v_uid)) THEN -- P1722
      RAISE EXCEPTION 'clarify: not available' USING ERRCODE = '22023'; -- P1722
    END IF; -- P1722
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
$function$
 ;


-- ---- clarify_start_chat
CREATE OR REPLACE FUNCTION public.clarify_start_chat(p_conversation uuid, p_draft boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  IF v_kind IS NULL THEN -- P1722: the Mirror is no longer refused here (the access check above already limits it to its owner)
    RAISE EXCEPTION 'clarify: not available' USING ERRCODE = '22023';
  END IF;
  -- the anchor: the newest top-level message the presser can read (the copy needs a real message to hang on)
  SELECT m.* INTO v_anchor FROM public.chat_messages m
   WHERE m.conversation_id = p_conversation AND m.thread_root_id IS NULL AND m.kind = 'message' AND m.context_conversation_id IS NULL
     AND m.system_kind IS NULL -- P1631 chat scope fixes: never a round-thread or session root (another table's speech)
     AND (v_kind <> 'event' OR m.is_transcription = false) -- P1631 event only: at an event a transcribed line is never an anchor (a late arrival's lines are posted at the top level); in a DM or group a recording is the conversation
     AND (v_kind <> 'mirror' OR public._clarify_mirror_row_ok(m, v_uid)) -- P1722: in the Mirror a Clarify root, forward, card or Mirror reply is skipped, never an anchor and never a refusal
     AND m.deleted_at IS NULL AND m.created_at >= v_since AND public._clarify_row_text(m) IS NOT NULL
   ORDER BY m.created_at DESC, m.id DESC LIMIT 1;
  IF NOT FOUND THEN
    IF v_kind = 'mirror' AND NOT p_draft THEN -- P1722: a New point in a Mirror with nothing to hang on: the thread root is a Clarify row of its own, no copy of any message
      BEGIN
        v_snap := jsonb_build_object('scope', 'chat', 'new_point', true, 'conversation_kind', 'mirror',
                                     'conversation_title', COALESCE((SELECT c.title FROM public.chat_conversations c WHERE c.id = p_conversation), 'Mirror'),
                                     'created_at', clock_timestamp());
        INSERT INTO public.chat_messages (conversation_id, author_id, body, kind, forward_snapshot, forward_author_id, forwarded_from_message_id, created_at)
        VALUES (p_conversation, v_uid, NULL, 'clarify', v_snap, NULL, NULL, clock_timestamp())
        RETURNING * INTO v_row;
        UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = p_conversation;
        INSERT INTO public.clarify_threads (root_id, owner_id, scope) VALUES (v_row.id, v_uid, 'chat');
      EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('status', 'busy');
      END;
      RETURN jsonb_build_object('status', 'started', 'draft_id', NULL, 'thread_root_id', v_row.id, 'mirror_conversation_id', v_row.conversation_id, 'scope', 'chat');
    END IF;
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
$function$
 ;


-- ---- clarify_message
CREATE OR REPLACE FUNCTION public.clarify_message(p_thread_root uuid, p_text text, p_target uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_last  public.clarify_drafts;
  v_text  text := NULLIF(btrim(COALESCE(p_text, '')), '');
  v_msg   public.chat_messages;
  v_id    uuid;
  v_noanchor boolean := false; -- P1722: a Mirror New point made from nothing: its root copies no message, so the owner's own reply is the source
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
  -- P1722: a Mirror New point made from nothing: a 'chat'-scope thread whose root is a Clarify row in the owner's Mirror that copies no message
  SELECT true INTO v_noanchor FROM public.chat_messages r JOIN public.clarify_threads t ON t.root_id = r.id AND t.owner_id = v_uid AND t.scope = 'chat'
    JOIN public.chat_conversations c ON c.id = r.conversation_id AND c.kind = 'mirror' AND c.owner_id = v_uid
   WHERE r.id = p_thread_root AND r.deleted_at IS NULL AND r.kind = 'clarify' AND r.forwarded_from_message_id IS NULL;
  v_noanchor := COALESCE(v_noanchor, false);
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
    IF v_noanchor THEN -- P1722: the source is the reply sent below, and the Mirror is its conversation
      v_last.source_conversation_id := v_last.mirror_conversation_id;
    ELSIF v_last.source_message_id IS NULL OR v_last.source_conversation_id IS NULL THEN -- P1631 r4
      RAISE EXCEPTION 'clarify: thread not available' USING ERRCODE = '42501'; -- P1631 r4
    END IF; -- P1631 r4
  END IF; -- P1631 r4
  IF v_noanchor AND v_last.mirror_conversation_id IS NULL THEN -- P1722: the root is gone
    RAISE EXCEPTION 'clarify: thread not available' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clarify_drafts d WHERE d.owner_id = v_uid AND d.state IN ('queued', 'running')) THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;
  v_msg := public.send_chat_message(v_last.mirror_conversation_id, v_text, NULL, p_thread_root);
  INSERT INTO public.clarify_drafts (owner_id, mirror_conversation_id, thread_root_id, source_conversation_id, source_message_id, instruction, refine_target_id) -- P1631 r5
  VALUES (v_uid, v_last.mirror_conversation_id, v_last.thread_root_id, v_last.source_conversation_id, CASE WHEN v_noanchor THEN v_msg.id ELSE v_last.source_message_id END, v_text, p_target) -- P1631 r5; P1722: a root with no copied message reads from the reply just sent
  RETURNING id INTO v_id; -- a unique_violation (a race past the lock) rolls the whole call back, the message with it
  UPDATE public.clarify_drafts d SET created_at = clock_timestamp() WHERE d.id = v_id; -- P1631 r4: send_chat_message stamps the message with clock_timestamp(); the run must not be older than its own message
  RETURN jsonb_build_object('status', 'started', 'draft_id', v_id, 'message_id', v_msg.id, 'thread_root_id', v_last.thread_root_id, 'mirror_conversation_id', v_last.mirror_conversation_id);
END;
$function$
 ;


-- ---- clarify_another
CREATE OR REPLACE FUNCTION public.clarify_another(p_thread_root uuid, p_instruction text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    IF v_last.source_message_id IS NULL AND v_last.mirror_conversation_id IS NOT NULL -- P1722: a Mirror New point made from nothing copies no message; the owner's newest live reply in the thread is the source
       AND EXISTS (SELECT 1 FROM public.clarify_threads t JOIN public.chat_conversations c ON c.id = v_last.mirror_conversation_id AND c.kind = 'mirror' AND c.owner_id = v_uid -- P1722
                    WHERE t.root_id = p_thread_root AND t.owner_id = v_uid AND t.scope = 'chat') THEN -- P1722
      v_last.source_conversation_id := v_last.mirror_conversation_id; -- P1722
      SELECT m.id INTO v_last.source_message_id FROM public.chat_messages m -- P1722
       WHERE m.thread_root_id = p_thread_root AND m.author_id = v_uid AND m.kind = 'message' AND m.deleted_at IS NULL AND NULLIF(btrim(m.body), '') IS NOT NULL -- P1722
       ORDER BY m.created_at DESC, m.id DESC LIMIT 1; -- P1722
    END IF; -- P1722
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
$function$
 ;


-- ---- mirror_request_reply
CREATE OR REPLACE FUNCTION public.mirror_request_reply(p_message uuid)
 RETURNS TABLE(job_id uuid, state text, reply_message_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_msg public.chat_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT m.* INTO v_msg
    FROM public.chat_messages m
    JOIN public.chat_conversations c ON c.id = m.conversation_id
   WHERE m.id = p_message AND c.kind = 'mirror' AND c.owner_id = v_uid AND m.author_id = v_uid;
  IF NOT FOUND OR v_msg.deleted_at IS NOT NULL OR v_msg.kind NOT IN ('message', 'clarify') THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;

  -- P1722: a transcribed line (a recording made in the Mirror posts its lines here) starts no Mirror reply: no job, as for a quiet share. A job that already exists is still returned.
  IF v_msg.is_transcription AND NOT EXISTS (SELECT 1 FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id) THEN
    RETURN;
  END IF;

  -- P1536 (founder 2026-10-27: the mirror stays quiet in canvas threads): no job for any message in a thread rooted
  -- at a canvas draft, or for the root itself, whatever the draft's state (open, published or discarded). The canvas
  -- engine posts its own replies; in a published thread the client asks "Start a new version?". A job that already
  -- exists is still returned, as for a quiet share. Ordinary mirror threads are unchanged.
  -- Placed BEFORE P1576's transcript wait: a voice note in a canvas thread is quiet at once, never 'transcribing'
  -- (that state promises a Mirror reply once the transcript lands, and none will come here).
  IF EXISTS (SELECT 1 FROM public.canvas_drafts d
              WHERE d.thread_root_id = COALESCE(v_msg.thread_root_id, v_msg.id))
     AND NOT EXISTS (SELECT 1 FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id) THEN
    RETURN;
  END IF;

  -- P1576: a voice note is answered only once its transcript exists. No job until then; the client asks again.
  -- A transcript that is done but blank (a silent note) is treated as failed: nothing to answer.
  IF v_msg.audio_duration_ms IS NOT NULL
     AND (v_msg.transcript_status IS DISTINCT FROM 'done' OR btrim(COALESCE(v_msg.transcript, '')) = '') THEN
    RETURN QUERY SELECT NULL::uuid, CASE WHEN v_msg.transcript_status = 'pending'
                                         THEN 'transcribing' ELSE 'transcript_failed' END, NULL::uuid;
    RETURN;
  END IF;

  -- P1631: the same quiet rule for a Clarify-draft thread (its root, or any reply in it), keyed on the thread MARKER clarify_start writes, never on draft rows: deleting the last draft must not turn the generic reply on.
  -- Placed AFTER the transcript wait so the P1536 edit above (the canvas rule directly before that wait) stays one contiguous text, which
  -- p1536-draft-versions-migration.test.ts pins in the newest definition; a voice note here is answered 'transcribing' until its transcript lands,
  -- and the server-side voice path below is quiet at once.
  IF EXISTS (SELECT 1 FROM public.clarify_threads ct -- P1631
              WHERE ct.root_id = COALESCE(v_msg.thread_root_id, v_msg.id)) -- P1631
     AND NOT EXISTS (SELECT 1 FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id) THEN -- P1631
    RETURN; -- P1631
  END IF; -- P1631

  -- A share (a plain message with an attachment and no text) is filed quietly: no new job, no reply.
  IF v_msg.kind = 'message' AND v_msg.attachment_id IS NOT NULL AND btrim(coalesce(v_msg.body, '')) = ''
     AND NOT EXISTS (SELECT 1 FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id) THEN
    RETURN;
  END IF;

  INSERT INTO public.mirror_jobs (owner_id, kind, trigger_message_id, context_conversation_id)
  VALUES (v_uid, CASE WHEN v_msg.context_conversation_id IS NULL THEN 'reply' ELSE 'ask' END,
          v_msg.id, v_msg.context_conversation_id)
  ON CONFLICT (trigger_message_id) WHERE trigger_message_id IS NOT NULL DO NOTHING;

  RETURN QUERY
    SELECT j.id, j.state, j.reply_message_id FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id;
END;
$function$
 ;


-- ---- _point_position_write_ok
CREATE OR REPLACE FUNCTION public._point_position_write_ok(p_point uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE -- P1631 publish fixes: chat_shared_point_ids() runs only for a published point and a caller who is not its owner
    WHEN EXISTS (SELECT 1 FROM public.points pu WHERE pu.id = p_point AND pu.visibility = 'public'::public.content_visibility) THEN true -- P1722: a public point (a published public Clarify point included) is answerable by anyone signed in, whether or not its card still exists
    WHEN NOT EXISTS (SELECT 1 FROM public.point_chat_shares s WHERE s.point_id = p_point)
         AND NOT EXISTS (SELECT 1 FROM public.clarify_drafts d WHERE d.point_id = p_point) THEN true -- P1631 scope: an unpublished Clarify draft falls through to the owner test
    WHEN EXISTS (SELECT 1 FROM public.points p WHERE p.id = p_point AND p.first_validator_id = auth.uid()) THEN true -- P1631 publish fixes
    ELSE public._point_chat_readable_by_me(p_point) -- P1631 read cost
  END; -- P1631 publish fixes
$function$
 ;


-- ---- get_clarify_thread
CREATE OR REPLACE FUNCTION public.get_clarify_thread(p_thread_root uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        'source_kind', (SELECT c.kind FROM public.chat_conversations c WHERE c.id = d.source_conversation_id), -- P1631 publish: a Mirror-sourced card has no chat to publish into
        'published', COALESCE((SELECT jsonb_agg(jsonb_build_object('conversation_id', s.conversation_id, 'message_id', s.message_id) ORDER BY s.created_at) -- P1631 publish
                                 FROM public.point_chat_shares s JOIN public.chat_messages m ON m.id = s.message_id -- P1631 publish
                                WHERE s.point_id = p.id AND m.deleted_at IS NULL AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id), '[]'::jsonb), -- P1631 publish
        'visibility', d.visibility, -- P1722: the owner's choice for this card, private until they switch it
        'ever_published', (d.first_published_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.point_chat_shares s2 WHERE s2.point_id = d.point_id)), -- P1722: a card of a draft that was ever posted can no longer change visibility
        'is_latest', NOT EXISTS (SELECT 1 FROM public.clarify_drafts r WHERE r.owner_id = v_uid AND r.refine_target_id = d.id AND r.state = 'done' AND r.point_id IS NOT NULL), -- P1722: the same test clarify_publish uses for earlier_version
        'public_warning', d.public_warning_needed, -- P1722: server-derived; false only for a draft read from the owner's own typed words in the owner's Mirror
        'point', CASE WHEN p.id IS NOT NULL THEN jsonb_build_object(
                   'id', p.id, 'statement', p.statement, 'tags', to_jsonb(COALESCE(p.tags, '{}'::text[])), 'point_visibility', p.visibility::text,
                   'owner_position', (SELECT pp.position::text FROM public.point_positions pp WHERE pp.point_id = p.id AND pp.user_id = v_uid)) END,
        'suggestions', d.suggestions,
        'cited', CASE WHEN d.cited IS NULL THEN NULL ELSE jsonb_build_object(
          'a', public._clarify_cited_rows(d.cited -> 'a', v_uid) || public._clarify_cited_recording_rows(d.cited -> 'a', v_uid), -- P1631 recording
          'b', public._clarify_cited_rows(d.cited -> 'b', v_uid) || public._clarify_cited_recording_rows(d.cited -> 'b', v_uid)) END -- P1631 recording
      ) ORDER BY d.created_at, d.id)
      FROM public.clarify_drafts d
      LEFT JOIN public.points p ON p.id = d.point_id AND p.first_validator_id = v_uid
     WHERE d.thread_root_id = p_thread_root AND d.owner_id = v_uid), '[]'::jsonb));
END;
$function$
 ;


-- ---- clarify_start_recording
CREATE OR REPLACE FUNCTION public.clarify_start_recording(p_room uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_room    public.transcribe_rooms;
  v_seat    uuid;
  v_conv    public.chat_conversations;
  v_since   timestamptz;
  v_kind    text;
  v_round   uuid;
  v_table   integer;
  v_until   timestamptz := clock_timestamp();
  v_newest  uuid;
  v_thread  public.clarify_threads;
  v_root    public.chat_messages;
  v_mirror  uuid;
  v_title   text;
  v_ref     text;
  v_snap    jsonb;
  v_row     public.chat_messages;
  v_id      uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1631:clarify:' || v_uid::text, 0));
  PERFORM public._clarify_sweep(v_uid);
  IF EXISTS (SELECT 1 FROM public.clarify_drafts d WHERE d.owner_id = v_uid AND d.state IN ('queued', 'running')) THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;
  -- the presser holds a seat in this room, and the room belongs to a chat they can read (never a Mirror)
  SELECT r.* INTO v_room FROM public.transcribe_rooms r WHERE r.id = p_room;
  SELECT m.id INTO v_seat FROM public.transcribe_room_members m WHERE m.room_id = p_room AND m.profile_id = v_uid;
  IF v_room.id IS NULL OR v_seat IS NULL OR v_room.conversation_id IS NULL THEN
    RAISE EXCEPTION 'clarify: not available' USING ERRCODE = '42501';
  END IF;
  SELECT c.* INTO v_conv FROM public.chat_conversations c WHERE c.id = v_room.conversation_id;
  v_since := public._chat_access_since(v_room.conversation_id, v_uid);
  IF v_conv.id IS NULL OR v_since IS NULL THEN -- P1722: a Mirror room is allowed (its access check already limits it to its owner)
    RAISE EXCEPTION 'clarify: not available' USING ERRCODE = '42501';
  END IF;
  -- the read set, decided now
  IF v_conv.kind = 'event' THEN
    SELECT d.o_round_id, d.o_table_no INTO v_round, v_table
      FROM public._transcribe_decide_destination(p_room, v_seat) d WHERE d.o_kind = 'round';
    IF v_round IS NOT NULL AND v_table IS NOT NULL THEN
      v_kind := 'round';
    ELSE
      v_kind := 'own';
      v_round := NULL;
      v_table := NULL;
    END IF;
  ELSE
    v_kind := 'room';
  END IF;
  SELECT x.id INTO v_newest FROM public.transcribe_messages x
   WHERE x.room_id = p_room AND x.spoken_at <= v_until AND NULLIF(btrim(x.text), '') IS NOT NULL
     AND ((v_kind = 'round' AND x.dest_kind = 'round' AND x.dest_round_id = v_round AND x.dest_table_no = v_table)
          OR (v_kind = 'own' AND x.member_id = v_seat)
          OR v_kind = 'room')
   ORDER BY x.spoken_at DESC, x.id DESC LIMIT 1;
  IF v_newest IS NULL THEN
    RETURN jsonb_build_object('status', 'empty');
  END IF;
  -- the same person's thread for this recording, when it is still there
  SELECT t.* INTO v_thread FROM public.clarify_threads t
   WHERE t.owner_id = v_uid AND t.scope = 'recording' AND t.recording_room_id = p_room;
  IF FOUND THEN
    SELECT m.* INTO v_root FROM public.chat_messages m WHERE m.id = v_thread.root_id AND m.deleted_at IS NULL;
    IF FOUND THEN
      BEGIN
        INSERT INTO public.clarify_drafts (owner_id, mirror_conversation_id, thread_root_id, source_conversation_id, source_message_id, rec_kind, rec_round_id, rec_table_no, rec_until)
        VALUES (v_uid, v_root.conversation_id, v_root.id, v_room.conversation_id, v_newest, v_kind, v_round, v_table, v_until)
        RETURNING id INTO v_id;
      EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('status', 'busy');
      END;
      UPDATE public.chat_messages m SET forward_snapshot = jsonb_set(m.forward_snapshot, '{recording_until}', to_jsonb(v_until)) WHERE m.id = v_root.id; -- P1631 recording fixes: the root shows this press's cutoff, not the first press's
      RETURN jsonb_build_object('status', 'started', 'reused', true, 'draft_id', v_id, 'thread_root_id', v_root.id,
                                'mirror_conversation_id', v_root.conversation_id, 'scope', 'recording');
    END IF;
    -- its root was deleted: the thread row stays but no longer names the room, so a fresh one can
    UPDATE public.clarify_threads t SET recording_room_id = NULL WHERE t.root_id = v_thread.root_id;
  END IF;
  -- the title as the presser sees the chat (the same reading as clarify_chat_message)
  IF v_conv.kind = 'dm' THEN
    SELECT COALESCE(p.name, 'Deleted user'),
           public._chat_author_ref(CASE WHEN v_conv.dm_user_a = v_uid THEN v_conv.dm_user_b ELSE v_conv.dm_user_a END)
      INTO v_title, v_ref
      FROM (SELECT 1) one
      LEFT JOIN public.profiles p ON p.id = CASE WHEN v_conv.dm_user_a = v_uid THEN v_conv.dm_user_b ELSE v_conv.dm_user_a END;
  ELSIF v_conv.kind = 'group' THEN
    SELECT o.name || ' · General' INTO v_title FROM public.organization o WHERE o.id = v_conv.org_id;
  ELSIF v_conv.kind = 'event' THEN
    SELECT e.title INTO v_title FROM public.events e WHERE e.id = v_conv.event_id;
  ELSE
    v_title := COALESCE(v_conv.title, 'Mirror');
  END IF;
  v_snap := jsonb_build_object('scope', 'recording', 'conversation_kind', v_conv.kind, 'conversation_title', v_title,
                               'recording_started_at', v_room.created_at, 'recording_until', v_until, 'created_at', clock_timestamp());
  IF v_ref IS NOT NULL THEN
    v_snap := v_snap || jsonb_build_object('conversation_title_ref', v_ref);
  END IF;
  BEGIN
    v_mirror := public._chat_ensure_mirror(v_uid);
    -- no body, author, thread or attachment, and no original: the copy shows the recording, not anybody's words
    INSERT INTO public.chat_messages (conversation_id, author_id, body, kind, forward_snapshot, forward_author_id, forwarded_from_message_id, created_at)
    VALUES (v_mirror, v_uid, NULL, 'clarify', v_snap, NULL, NULL, clock_timestamp())
    RETURNING * INTO v_row;
    UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = v_mirror;
    INSERT INTO public.clarify_threads (root_id, owner_id, scope, recording_room_id) VALUES (v_row.id, v_uid, 'recording', p_room);
    INSERT INTO public.clarify_drafts (owner_id, mirror_conversation_id, thread_root_id, source_conversation_id, source_message_id, rec_kind, rec_round_id, rec_table_no, rec_until)
    VALUES (v_uid, v_mirror, v_row.id, v_room.conversation_id, v_newest, v_kind, v_round, v_table, v_until)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- the copy above is rolled back with this block
    RETURN jsonb_build_object('status', 'busy');
  END;
  RETURN jsonb_build_object('status', 'started', 'reused', false, 'draft_id', v_id, 'thread_root_id', v_row.id,
                            'mirror_conversation_id', v_mirror, 'scope', 'recording');
END;
$function$
 ;


-- ---- assert_transcribe_chat_access
CREATE OR REPLACE FUNCTION public.assert_transcribe_chat_access(p_conversation_id uuid, p_uid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_conversation_id IS NULL THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chat_conversations c WHERE c.id = p_conversation_id) -- P1722: the Mirror is allowed; _chat_access_since is NULL for anyone but its owner
     OR public._chat_access_since(p_conversation_id, p_uid) IS NULL THEN
    -- one message for not-found and not-a-member: nothing is learned about the chat
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;
END;
$function$
 ;


-- ---- _transcribe_chat_name
CREATE OR REPLACE FUNCTION public._transcribe_chat_name(p_conversation uuid, p_event uuid, p_uid uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT COALESCE(
    (SELECT CASE c.kind
              WHEN 'dm' THEN (SELECT p.name FROM public.profiles p
                               WHERE p.id = CASE WHEN c.dm_user_a = p_uid THEN c.dm_user_b ELSE c.dm_user_a END)
              WHEN 'group' THEN (SELECT o.name FROM public.organization o WHERE o.id = c.org_id)
              WHEN 'event' THEN (SELECT e.title FROM public.events e WHERE e.id = c.event_id)
              WHEN 'mirror' THEN COALESCE(c.title, 'Mirror') -- P1722
            END
       FROM public.chat_conversations c WHERE c.id = p_conversation),
    (SELECT e.title FROM public.events e WHERE e.id = p_event));
$function$
 ;


-- ---- get_chat_live_transcription
CREATE OR REPLACE FUNCTION public.get_chat_live_transcription(p_conversation_id uuid)
 RETURNS TABLE(room_id uuid, room_code text, starter_name text, recording_count integer, i_am_recording boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT r.id, r.code,
         (SELECT m.display_name FROM public.transcribe_room_members m
           WHERE m.room_id = r.id AND m.capture_ended_at IS NULL ORDER BY m.joined_at, m.id LIMIT 1),
         (SELECT count(*)::integer FROM public.transcribe_room_members m
           WHERE m.room_id = r.id AND m.capture_ended_at IS NULL),
         EXISTS (SELECT 1 FROM public.transcribe_room_members m
                  WHERE m.room_id = r.id AND m.profile_id = auth.uid() AND m.capture_ended_at IS NULL)
    FROM public.chat_conversations c
    JOIN public.transcribe_rooms r
      ON r.ended_at IS NULL AND (r.conversation_id = c.id OR (c.event_id IS NOT NULL AND r.event_id = c.event_id))
   WHERE c.id = p_conversation_id -- P1722: the Mirror is no longer left out (the access check below limits it to its owner)
     AND auth.uid() IS NOT NULL
     AND public._chat_access_since(c.id, auth.uid()) IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.transcribe_room_members m WHERE m.room_id = r.id AND m.capture_ended_at IS NULL)
   ORDER BY r.created_at DESC
   LIMIT 1;
$function$
 ;


-- ---- get_chat_transcription_processing
CREATE OR REPLACE FUNCTION public.get_chat_transcription_processing(p_conversation_id uuid)
 RETURNS TABLE(room_id uuid, state text, ended_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH mine AS (
    SELECT r.id AS room_id, r.ended_at, public._transcribe_room_state(r.id, auth.uid()) AS state
      FROM public.transcribe_rooms r
      JOIN public.chat_conversations c ON c.id = p_conversation_id -- P1722: the Mirror is no longer left out (the access check below limits it to its owner)
     WHERE auth.uid() IS NOT NULL
       AND public._chat_access_since(c.id, auth.uid()) IS NOT NULL
       AND (r.conversation_id = c.id OR (c.event_id IS NOT NULL AND r.event_id = c.event_id))
       AND r.ended_at IS NOT NULL AND r.ended_at > now() - interval '24 hours'
       AND EXISTS (SELECT 1 FROM public.transcribe_room_members m WHERE m.room_id = r.id AND m.profile_id = auth.uid())
  )
  SELECT s.room_id, s.state, s.ended_at
    FROM mine s
   -- processing: always (the thread has not arrived). failed: only the NEWEST session's; an older failure behind a newer
   -- success is history, not news.
   WHERE s.state = 'processing'
      OR (s.state = 'failed' AND s.ended_at = (SELECT max(t.ended_at) FROM mine t))
   ORDER BY s.ended_at DESC;
$function$
 ;


-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- clarify_set_visibility: the owner's Private / Public switch on the latest card of a draft that was never published.
-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clarify_set_visibility(p_draft uuid, p_visibility text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_d   public.clarify_drafts;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_visibility IS NULL OR p_visibility NOT IN ('private', 'public') THEN
    RAISE EXCEPTION 'clarify: bad visibility' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1631:clarify:' || v_uid::text, 0));
  SELECT d.* INTO v_d FROM public.clarify_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clarify: draft not available' USING ERRCODE = '42501';
  END IF;
  IF v_d.state <> 'done' OR v_d.point_id IS NULL THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'no_point');
  END IF;
  -- ever published: the record on the draft itself, or a share row of its point (a card the owner deleted does not reopen the choice)
  IF v_d.first_published_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.point_chat_shares s WHERE s.point_id = v_d.point_id) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'published');
  END IF;
  -- only the latest card: the test clarify_publish uses for earlier_version
  IF EXISTS (SELECT 1 FROM public.clarify_drafts r
              WHERE r.owner_id = v_uid AND r.refine_target_id = v_d.id AND r.state = 'done' AND r.point_id IS NOT NULL) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'earlier_version');
  END IF;
  UPDATE public.clarify_drafts d SET visibility = p_visibility, updated_at = now() WHERE d.id = v_d.id;
  RETURN jsonb_build_object('status', 'ok', 'visibility', p_visibility, 'public_warning', v_d.public_warning_needed);
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_set_visibility(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_set_visibility(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- clarify_draft_edit: tags come only from text the owner typed. The old two-argument function is replaced by one with an optional third argument.
-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.clarify_draft_edit(uuid, text);
CREATE OR REPLACE FUNCTION public.clarify_draft_edit(p_draft uuid, p_statement text, p_tags text[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_d     public.clarify_drafts;
  v_p     public.points;
  v_stmt  text := btrim(COALESCE(p_statement, ''));
  v_found text[];
  v_tags  text[];
  v_same_stmt boolean;
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
  -- the #tags the saved text holds (the client's extractHashtags rule, P1660, without its link masking: this set can only be wider than the client's, and the client's list must be inside it)
  SELECT COALESCE(array_agg(DISTINCT lower(m[2])), '{}') INTO v_found
    FROM regexp_matches(v_stmt, '(^|[^\w#/])#(\w+)(?!\w|\.\w|[/#])', 'g') AS m
   WHERE lower(m[2]) !~ '^(st|v)[0-9]+$' AND lower(m[2]) NOT IN ('understanding', 'misunderstanding') AND lower(m[2]) !~ '^canvas[_:]';
  IF p_tags IS NULL THEN
    v_tags := v_found;
  ELSE
    SELECT COALESCE(array_agg(DISTINCT lower(btrim(t)) ORDER BY lower(btrim(t))), '{}') INTO v_tags FROM unnest(p_tags) t WHERE NULLIF(btrim(t), '') IS NOT NULL;
    IF cardinality(v_tags) > 20 OR EXISTS (SELECT 1 FROM unnest(v_tags) t WHERE NOT (t = ANY (v_found))) THEN
      RAISE EXCEPTION 'clarify: bad tags' USING ERRCODE = '22023';
    END IF;
  END IF;
  SELECT COALESCE(array_agg(t ORDER BY t), '{}') INTO v_tags FROM unnest(v_tags) t;
  IF v_d.state <> 'done' OR v_d.point_id IS NULL THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'no_point');
  END IF;
  SELECT p.* INTO v_p FROM public.points p WHERE p.id = v_d.point_id AND p.first_validator_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'no_point');
  END IF;
  IF v_d.first_published_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.point_chat_shares s WHERE s.point_id = v_p.id) THEN -- P1631 publish: published wording is frozen, even after the card is deleted; P1722: the record on the draft survives a hard delete
    RETURN jsonb_build_object('status', 'refused', 'code', 'published');
  END IF;
  IF EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = v_p.id AND pp.user_id <> v_uid) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'fixed');
  END IF;
  v_same_stmt := v_stmt = btrim(v_p.statement);
  IF v_same_stmt AND v_tags = COALESCE((SELECT array_agg(t ORDER BY t) FROM unnest(v_p.tags) t), '{}') THEN
    RETURN jsonb_build_object('status', 'ok', 'changed', false, 'point_id', v_p.id, 'tags', to_jsonb(v_tags));
  END IF;
  UPDATE public.points p SET statement = v_stmt, tags = v_tags WHERE p.id = v_p.id;
  IF NOT v_same_stmt THEN
    DELETE FROM public.point_positions pp WHERE pp.point_id = v_p.id AND pp.user_id = v_uid; -- P1631 r5: new words, so the owner's earlier position on the old words no longer stands
  END IF;
  RETURN jsonb_build_object('status', 'ok', 'changed', true, 'point_id', v_p.id, 'tags', to_jsonb(v_tags));
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_draft_edit(uuid, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_draft_edit(uuid, text, text[]) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- clarify_publish: the Public path, and the Mirror lifted.
-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clarify_publish(p_draft uuid, p_client_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_d      public.clarify_drafts;
  v_p      public.points;
  v_kind   text;
  v_thread uuid;
  v_live   public.chat_messages;
  v_mirror boolean := false;
  v_new    uuid;
  v_res    jsonb;
  v_code   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1631:clarify:' || v_uid::text, 0));
  SELECT d.* INTO v_d FROM public.clarify_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clarify: draft not available' USING ERRCODE = '42501';
  END IF;
  IF v_d.state <> 'done' OR v_d.point_id IS NULL THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'no_point');
  END IF;
  -- P1722: the draft's point is private until a Public publish replaces it, and public after (a retry, or a re-post of a deleted public card)
  SELECT p.* INTO v_p FROM public.points p
   WHERE p.id = v_d.point_id AND p.first_validator_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'no_point');
  END IF;
  IF EXISTS (SELECT 1 FROM public.clarify_drafts r
              WHERE r.owner_id = v_uid AND r.refine_target_id = v_d.id AND r.state = 'done' AND r.point_id IS NOT NULL) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'earlier_version');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = v_p.id AND pp.user_id = v_uid) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'no_position');
  END IF;
  SELECT c.kind INTO v_kind FROM public.chat_conversations c WHERE c.id = v_d.source_conversation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'needs_target');
  END IF;
  IF v_kind = 'mirror' THEN -- P1722: the card goes back into the same Mirror main chat; no picker is needed. Only the owner's own Mirror can be a source.
    IF v_d.source_conversation_id IS DISTINCT FROM v_d.mirror_conversation_id THEN
      RETURN jsonb_build_object('status', 'refused', 'code', 'needs_target');
    END IF;
    v_mirror := true;
  END IF;
  IF NOT v_mirror THEN
    -- a reply in a thread publishes into that thread, while the thread root is still there and readable; anything else goes to the main chat
    SELECT r.id INTO v_thread
      FROM public.chat_messages s
      JOIN public.chat_messages r ON r.id = s.thread_root_id
     WHERE s.id = v_d.source_message_id AND r.conversation_id = v_d.source_conversation_id AND r.deleted_at IS NULL
       AND s.deleted_at IS NULL -- P1631 publish fixes: a deleted reply goes to the main chat
       AND r.thread_root_id IS NULL
       AND r.created_at >= COALESCE(public._chat_access_since(r.conversation_id, v_uid), 'infinity'::timestamptz);
    IF v_thread IS NULL AND COALESCE((SELECT t.scope FROM public.clarify_threads t WHERE t.root_id = v_d.thread_root_id), 'message') = 'thread' THEN -- P1631 into thread: a point about the whole thread
      SELECT s.id INTO v_thread FROM public.chat_messages s -- P1631 into thread: the pressed first message is the thread root
       WHERE s.id = v_d.source_message_id AND s.conversation_id = v_d.source_conversation_id AND s.deleted_at IS NULL -- P1631 into thread
         AND s.thread_root_id IS NULL -- P1631 into thread
         AND s.created_at >= COALESCE(public._chat_access_since(s.conversation_id, v_uid), 'infinity'::timestamptz); -- P1631 into thread
    END IF; -- P1631 into thread
  END IF; -- P1722: a Mirror source never posts into a thread (the Mirror agent answers inside a message's thread, which would otherwise route the card there)
  SELECT m.* INTO v_live
    FROM public.point_chat_shares s JOIN public.chat_messages m ON m.id = s.message_id
   WHERE s.point_id = v_p.id AND s.conversation_id = v_d.source_conversation_id
     AND m.deleted_at IS NULL AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id
   ORDER BY s.created_at DESC LIMIT 1;
  IF FOUND THEN
    UPDATE public.clarify_drafts d SET first_published_at = COALESCE(d.first_published_at, now()) WHERE d.id = v_d.id;
    RETURN jsonb_build_object('status', 'already', 'message_id', v_live.id, 'conversation_id', v_live.conversation_id, 'thread_root_id', v_live.thread_root_id);
  END IF;

  IF v_d.visibility = 'public' AND v_p.visibility = 'private'::public.content_visibility THEN
    -- Public: a new public point replaces the private one, all inside one sub-block. A refusal at any step raises and the block rolls back, so a refused publish leaves the private
    -- point, the owner's position and the draft pointer exactly as they were (a returned 'refused' alone would not undo the writes before it).
    IF EXISTS (SELECT 1 FROM public.point_chat_shares x WHERE x.point_id = v_p.id)
       OR EXISTS (SELECT 1 FROM public.point_chat_stories x WHERE x.point_id = v_p.id)
       OR EXISTS (SELECT 1 FROM public.letter_point_responses x WHERE x.point_id = v_p.id)
       OR EXISTS (SELECT 1 FROM public.event_round_tables x WHERE x.topic_point_id = v_p.id)
       OR EXISTS (SELECT 1 FROM public.badge_points x WHERE x.point_id = v_p.id) THEN
      RETURN jsonb_build_object('status', 'refused', 'code', 'point_linked');
    END IF;
    BEGIN
      INSERT INTO public.points (statement, first_validator_id, visibility, tags, system_tags)
      VALUES (v_p.statement, v_uid, 'public'::public.content_visibility, COALESCE(v_p.tags, '{}'), '{}')
      RETURNING id INTO v_new;
      -- one fresh owner position; the private point's history and any other position go with it (the owner's changes of mind before publish never reach the public point)
      INSERT INTO public.point_positions (point_id, user_id, "position")
      SELECT v_new, pp.user_id, pp."position" FROM public.point_positions pp WHERE pp.point_id = v_p.id AND pp.user_id = v_uid;
      -- the owner's own links move to the public point (a private story may hold a public point; the reverse is what P586 forbids)
      UPDATE public.story_points sp SET point_id = v_new WHERE sp.point_id = v_p.id;
      UPDATE public.story_point_history h SET point_id = v_new WHERE h.point_id = v_p.id;
      UPDATE public.canvas_draft_points cp SET point_id = v_new WHERE cp.point_id = v_p.id;
      UPDATE public.canvas_added_stories cs SET point_id = v_new WHERE cs.point_id = v_p.id;
      UPDATE public.clarify_drafts d SET point_id = v_new, updated_at = now() WHERE d.point_id = v_p.id;
      DELETE FROM public.points p WHERE p.id = v_p.id;
      v_res := public._point_chat_publish(v_new, v_d.source_conversation_id, v_thread, p_client_id, v_d.id);
      IF v_res ->> 'status' IS DISTINCT FROM 'published' THEN
        RAISE EXCEPTION '%', COALESCE(v_res ->> 'code', 'not_available') USING ERRCODE = 'P1722';
      END IF;
    EXCEPTION WHEN SQLSTATE 'P1722' THEN
      GET STACKED DIAGNOSTICS v_code = MESSAGE_TEXT;
      RETURN jsonb_build_object('status', 'refused', 'code', v_code);
    END;
  ELSE
    v_res := public._point_chat_publish(v_p.id, v_d.source_conversation_id, v_thread, p_client_id, v_d.id);
  END IF;
  IF v_res ->> 'status' = 'published' THEN
    UPDATE public.clarify_drafts d SET first_published_at = COALESCE(d.first_published_at, now()) WHERE d.id = v_d.id;
  END IF;
  RETURN v_res;
END;
$function$;
REVOKE ALL ON FUNCTION public.clarify_publish(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_publish(uuid, uuid) TO authenticated;
