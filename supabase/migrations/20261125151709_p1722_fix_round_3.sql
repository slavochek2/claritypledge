-- client-safe: no signature, grant or result shape changes. clarify_set_visibility and clarify_publish gain one more cause for the existing `point_linked` refusal (a point in a supersede chain); _clarify_begin keeps the transcribed-line anchor that clarify_start_chat chose.
--
-- diffed against: clarify_set_visibility: 20261125144241_p1722_fix_round_1.sql (its newest definition)
-- diffed against: clarify_publish: 20261125150340_p1722_fix_round_2.sql (its newest definition)
-- diffed against: _clarify_begin: 20261125104835_p1722_solo_clarify_in_the_mirror.sql (its newest definition)
--
-- P1722 fix round 3.
--   T1 points.superseded_by: a Public choice or publish deletes the private point, which would SET NULL every incoming superseded_by link, and the replacement carries no outgoing link. So a point that is
--      superseded (superseded_by not null) or that supersedes another point (any point's superseded_by = it) is `point_linked`, in both clarify_set_visibility and clarify_publish.
--   T2 _clarify_begin re-anchors a whole-chat run on the newest eligible row. clarify_start_chat may anchor on a transcribed line inside an outside-rounds root (a recording stored in the Mirror), but the
--      re-anchor only searched top-level rows and swapped an older typed note in. It now uses the same anchor rule as clarify_start_chat in the Mirror.

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- clarify_set_visibility: T1
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
  -- only the latest card of the thread: the test the client draws Publish by, and clarify_publish uses for earlier_version
  IF NOT public._clarify_is_latest(v_d) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'earlier_version');
  END IF;
  IF p_visibility = 'public' THEN
    -- S1: a point another account has answered can never be replaced by a public one
    IF public._clarify_answered(v_d.point_id, v_uid) THEN
      RETURN jsonb_build_object('status', 'refused', 'code', 'answered');
    END IF;
    -- T1: a point in a supersede chain (either direction) cannot be replaced: deleting it would cut the chain
    IF EXISTS (SELECT 1 FROM public.points x WHERE x.id = v_d.point_id AND x.superseded_by IS NOT NULL)
       OR EXISTS (SELECT 1 FROM public.points x WHERE x.superseded_by = v_d.point_id) THEN
      RETURN jsonb_build_object('status', 'refused', 'code', 'point_linked');
    END IF;
  END IF;
  UPDATE public.clarify_drafts d SET visibility = p_visibility, updated_at = now() WHERE d.id = v_d.id;
  RETURN jsonb_build_object('status', 'ok', 'visibility', p_visibility, 'public_warning', v_d.public_warning_needed);
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_set_visibility(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_set_visibility(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- clarify_publish: T1 (everything else is the round 2 definition)
-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clarify_publish(p_draft uuid, p_client_id uuid DEFAULT NULL::uuid, p_visibility text DEFAULT 'private', p_warning_ack boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_d      public.clarify_drafts;
  v_p      public.points;
  v_pos    public.point_positions."position"%TYPE;
  v_kind   text;
  v_thread uuid;
  v_live   public.chat_messages;
  v_mirror boolean := false;
  v_new    uuid;
  v_res    jsonb;
  v_code   text;
  v_tags   text[];
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
  -- P1722: the draft's point is private until a Public publish replaces it, and public after (a retry, or a re-post of a deleted public card)
  SELECT p.* INTO v_p FROM public.points p
   WHERE p.id = v_d.point_id AND p.first_validator_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'no_point');
  END IF;
  -- S2: a card already posted for this point in the source chat is the answer to a retry, before any check that the draft's later life may have changed
  SELECT m.* INTO v_live
    FROM public.point_chat_shares s JOIN public.chat_messages m ON m.id = s.message_id
   WHERE s.point_id = v_p.id AND s.conversation_id = v_d.source_conversation_id
     AND m.deleted_at IS NULL AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id
   ORDER BY s.created_at DESC LIMIT 1;
  IF FOUND THEN
    UPDATE public.clarify_drafts d SET first_published_at = COALESCE(d.first_published_at, now()) WHERE d.id = v_d.id;
    RETURN jsonb_build_object('status', 'already', 'message_id', v_live.id, 'conversation_id', v_live.conversation_id, 'thread_root_id', v_live.thread_root_id);
  END IF;
  -- S4: what the user saw is what is published. A stale screen, or an old caller, never publishes something other than it showed.
  IF p_visibility IS DISTINCT FROM v_d.visibility THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'visibility_changed');
  END IF;
  IF v_d.visibility = 'public' AND v_p.visibility = 'private'::public.content_visibility AND v_d.public_warning_needed AND NOT COALESCE(p_warning_ack, false) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'needs_warning');
  END IF;
  IF NOT public._clarify_is_latest(v_d) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'earlier_version');
  END IF;
  -- R1: the owner's position is read and locked once; the public copy below is made from this value, so a withdrawal cannot slip in between the check and the copy
  SELECT pp."position" INTO v_pos FROM public.point_positions pp
   WHERE pp.point_id = v_p.id AND pp.user_id = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN
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

  IF v_d.visibility = 'public' AND v_p.visibility = 'private'::public.content_visibility THEN
    -- S1: a point another account has answered is never replaced (the replacement deletes the private point and, with it, their positions and history). A card posted before P1722 whose
    -- message was hard-deleted leaves no share row, so this test is on the point itself.
    IF public._clarify_answered(v_p.id, v_uid) THEN
      RETURN jsonb_build_object('status', 'refused', 'code', 'answered');
    END IF;
    -- Public: a new public point replaces the private one, all inside one sub-block. A refusal at any step raises and the block rolls back, so a refused publish leaves the private
    -- point, the owner's position and the draft pointer exactly as they were (a returned 'refused' alone would not undo the writes before it).
    IF EXISTS (SELECT 1 FROM public.point_chat_shares x WHERE x.point_id = v_p.id)
       OR EXISTS (SELECT 1 FROM public.point_chat_stories x WHERE x.point_id = v_p.id)
       OR EXISTS (SELECT 1 FROM public.letter_point_responses x WHERE x.point_id = v_p.id)
       OR EXISTS (SELECT 1 FROM public.event_round_tables x WHERE x.topic_point_id = v_p.id)
       OR EXISTS (SELECT 1 FROM public.badge_points x WHERE x.point_id = v_p.id)
       OR v_p.superseded_by IS NOT NULL -- T1: deleting the private point would cut a supersede chain (incoming links SET NULL; the replacement carries no outgoing one)
       OR EXISTS (SELECT 1 FROM public.points x WHERE x.superseded_by = v_p.id) THEN -- T1
      RETURN jsonb_build_object('status', 'refused', 'code', 'point_linked');
    END IF;
    -- S8: the system tags the private point carries (the story st tags a link synced onto it) go to the public one; a canvas_ box tag cannot (a public point may not carry one)
    SELECT COALESCE(array_agg(t ORDER BY t), '{}') INTO v_tags FROM unnest(v_p.system_tags) t WHERE lower(t) NOT LIKE 'canvas\_%';
    BEGIN
      INSERT INTO public.points (statement, first_validator_id, visibility, tags, system_tags)
      VALUES (v_p.statement, v_uid, 'public'::public.content_visibility, COALESCE(v_p.tags, '{}'), v_tags)
      RETURNING id INTO v_new;
      -- one fresh owner position, the value read and locked above (the private point's history and any other position go with it)
      INSERT INTO public.point_positions (point_id, user_id, "position")
      VALUES (v_new, v_uid, v_pos);
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
REVOKE ALL ON FUNCTION public.clarify_publish(uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_publish(uuid, uuid, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- _clarify_begin: T2 (the re-anchor rule; everything else is the P1722 definition)
-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
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
     WHERE m.conversation_id = v_d.source_conversation_id AND m.kind = 'message' AND m.context_conversation_id IS NULL -- P1631 chat scope fixes
       AND (m.thread_root_id IS NULL -- P1631 chat scope fixes
            OR (v_mirror AND m.is_transcription -- P1722 T2: the same rule as clarify_start_chat: in the Mirror a transcribed line inside an outside-rounds root (a stored recording) is an anchor
                AND EXISTS (SELECT 1 FROM public.chat_messages r WHERE r.id = m.thread_root_id AND r.system_kind IS NOT NULL)))
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
