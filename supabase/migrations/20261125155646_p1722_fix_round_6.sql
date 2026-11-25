-- client-safe: clarify_publish gains a fifth parameter p_expected_statement (default NULL, so every existing caller is unchanged) and a refusal code `changed`; clarify_draft_edit refuses a statement that is only #tags across several lines.

-- diffed against: clarify_draft_edit: 20261125154131_p1722_fix_round_5.sql (its newest definition)
-- diffed against: clarify_publish: 20261125154131_p1722_fix_round_5.sql (its newest definition)

-- P1722 fix round 6.
--   Z1 clarify_publish takes p_expected_statement: the wording the screen showed. When given and different from the draft's point statement now (another tab edited it), the answer is refused/changed and nothing is published.
--   Z2 clarify_publish locks the owner's position row BEFORE the point row, the order the position path uses (log_position_change / position writes lock the position first, then touch the point), so the two cannot deadlock.
--      A missing position is still answered `no_position` at its old place in the check order.
--   Z3 the hashtag-only check removes all whitespace, not only spaces: "#alpha<newline>#beta" is bad statement.

DROP FUNCTION IF EXISTS public.clarify_publish(uuid, uuid, text, boolean);

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
  v_mask  text;
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
  -- links first, as the client does (a # inside a link is a fragment, not a tag); text that already holds the placeholder characters is left unmasked, as there
  v_mask := CASE WHEN v_stmt ~ ('[' || chr(57344) || chr(57345) || ']') THEN v_stmt
                 ELSE regexp_replace(v_stmt, '\y(https?://[^[:space:]<>"'']+|www\.[^[:space:]<>"'']+)|\]\([^)\n]*\)', chr(57344) || chr(57345), 'gi') END;
  -- X2: a statement that is only #tags says nothing once they are taken out (same tag rule as the parse below)
  -- Z3: whitespace of any kind (newline, tab) counts as empty, not only spaces
  IF regexp_replace(regexp_replace(v_mask, '(^|[^\w#/])#(\w+)(?!\w|\.\w|[/#])', '\1', 'g'), '[[:space:]]', '', 'g') = '' THEN
    RAISE EXCEPTION 'clarify: bad statement' USING ERRCODE = '22023';
  END IF;
  -- the #tags the masked text holds (the client's extractHashtags rule, P1660)
  SELECT COALESCE(array_agg(DISTINCT lower(m[2])), '{}') INTO v_found
    FROM regexp_matches(v_mask, '(^|[^\w#/])#(\w+)(?!\w|\.\w|[/#])', 'g') AS m
   WHERE lower(m[2]) !~ '^(st|v)[0-9]+$' AND lower(m[2]) NOT IN ('understanding', 'misunderstanding') AND lower(m[2]) !~ '^canvas[_:]';
  IF p_tags IS NULL THEN
    v_tags := v_found;
  ELSE
    SELECT COALESCE(array_agg(DISTINCT lower(btrim(t)) ORDER BY lower(btrim(t))), '{}') INTO v_tags FROM unnest(p_tags) t WHERE NULLIF(btrim(t), '') IS NOT NULL;
    IF EXISTS (SELECT 1 FROM unnest(v_tags) t WHERE NOT (t = ANY (v_found))) THEN
      RAISE EXCEPTION 'clarify: bad tags' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF cardinality(v_tags) > 20 THEN -- R2: the same limit whether the tags were supplied or derived from the text
    RAISE EXCEPTION 'clarify: bad tags' USING ERRCODE = '22023';
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

CREATE OR REPLACE FUNCTION public.clarify_publish(p_draft uuid, p_client_id uuid DEFAULT NULL::uuid, p_visibility text DEFAULT 'private', p_warning_ack boolean DEFAULT false, p_expected_statement text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' -- P1722 X3: the older trigger functions on points and story_points name `points` unqualified (see the header); every reference below is still schema-qualified
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_d      public.clarify_drafts;
  v_p      public.points;
  v_pos   public.point_positions."position"%TYPE;
  v_has_pos boolean;
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
  -- Z2: the owner's position row is locked first, as the position path does (it locks the position, then the point). R1: it is read and locked once; the public copy below is made from this value,
  -- so a withdrawal cannot slip in between the check and the copy. A missing position is answered `no_position` further down, in its old place in the order of checks.
  SELECT pp."position" INTO v_pos FROM public.point_positions pp
   WHERE pp.point_id = v_d.point_id AND pp.user_id = v_uid
   FOR UPDATE;
  v_has_pos := FOUND;
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
  -- Z1: the wording the screen showed is the wording published; another tab's edit answers `changed`
  IF p_expected_statement IS NOT NULL AND btrim(p_expected_statement) IS DISTINCT FROM btrim(v_p.statement) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'changed');
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
  IF NOT v_has_pos THEN
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
REVOKE ALL ON FUNCTION public.clarify_publish(uuid, uuid, text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_publish(uuid, uuid, text, boolean, text) TO authenticated;
