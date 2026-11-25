-- client-safe: clarify_publish gains two optional arguments with defaults (an old two-argument call still resolves, and now means "published as Private": a draft switched to Public needs the caller to say so), and
-- gains the refusal codes answered, visibility_changed and needs_warning. clarify_set_visibility gains answered. get_clarify_thread's is_latest changes meaning (one card per thread). Nothing else in a result changes shape.
--
-- diffed against: clarify_set_visibility, clarify_draft_edit, clarify_publish, get_clarify_thread, clarify_start_chat: 20261125104835_p1722_solo_clarify_in_the_mirror.sql (their newest definitions)
-- diffed against: clarify_draft_delete: 20261112150000_p1631_publish_to_chat.sql (its newest definition)
-- diffed against: _clarify_erase_person: 20261113210000_p1631_erase_scoped_sweep.sql (its newest definition)
-- new function: _clarify_is_latest, _clarify_answered, _clarify_warning_taint (trigger function)
--
-- P1722 fix round 1 (review findings S1 to S12).
--   S1  a Public publish and the Public choice refuse `answered` when any account other than the owner has a position on the private point or a row in its history (a card posted before P1722
--       whose message was hard-deleted leaves no share row and no first_published_at, so the draft looked never-published; the point and those positions would have been deleted).
--   S2  clarify_publish looks for the already-posted card before any other check, so a retry answers `already` even after the draft became an earlier version or lost its position.
--   S3  clarify_start_chat in a Mirror accepts a transcribed line inside an outside-rounds thread (the stored recording layout) as the anchor.
--   S4  clarify_publish(p_draft, p_client_id, p_visibility, p_warning_ack): the visibility the user saw must equal the draft's (`visibility_changed`), and a Public publish of a draft that needs the warning needs
--       p_warning_ack (`needs_warning`). The defaults are 'private' and false.
--   S5  is_latest: the one card of a thread with no newer finished card (and no finished refinement). set_visibility and publish use the same test (`earlier_version`).
--   S6  clarify_draft_delete refuses a draft whose point is public (`published`): the draft row is what the letter guards read once the card message is gone.
--   S7  erasing a person whose words a public Clarify point came from fails the owner's draft `erased` (the point stays public, the draft keeps the pointer for the letter guards).
--   S8  the public point keeps the system tags of the private one, except canvas_ boxes (a public point may not carry them).
--   S9  a draft whose run was shown an earlier draft that needs the warning needs it too (a trigger on the move to running).
--   S10 clarify_draft_edit masks links before it reads #tags, as extractHashtags does.

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- The one card of a thread that carries Publish and the visibility switch: the newest finished card, and not one that a finished refinement replaced.
CREATE OR REPLACE FUNCTION public._clarify_is_latest(p_draft public.clarify_drafts)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.clarify_drafts r
                      WHERE r.owner_id = p_draft.owner_id AND r.id <> p_draft.id AND r.state = 'done' AND r.point_id IS NOT NULL
                        AND ((r.thread_root_id = p_draft.thread_root_id AND (r.created_at, r.id) > (p_draft.created_at, p_draft.id))
                             OR r.refine_target_id = p_draft.id));
$$;
REVOKE ALL ON FUNCTION public._clarify_is_latest(public.clarify_drafts) FROM PUBLIC, anon, authenticated;

-- Has any account other than the owner answered this point (a position now, or a row in the history of positions)?
CREATE OR REPLACE FUNCTION public._clarify_answered(p_point uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = p_point AND pp.user_id IS DISTINCT FROM p_uid)
      OR EXISTS (SELECT 1 FROM public.point_position_history h WHERE h.point_id = p_point AND h.user_id IS DISTINCT FROM p_uid);
$$;
REVOKE ALL ON FUNCTION public._clarify_answered(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- S9: when a run starts, the warning is also needed if the run was shown a draft that needs it. The run is shown the owner's finished drafts of the same chat and thread (latest_draft,
-- already_drafted) and the live point cards of the chat that are not the owner's own drafts (their words are someone's). Over-warning is the safe direction.
CREATE OR REPLACE FUNCTION public._clarify_warning_taint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.state = 'running' AND OLD.state IS DISTINCT FROM 'running' AND NOT NEW.public_warning_needed THEN
    IF EXISTS (SELECT 1 FROM public.clarify_drafts d2
                WHERE d2.owner_id = NEW.owner_id AND d2.id <> NEW.id AND d2.state = 'done' AND d2.point_id IS NOT NULL AND d2.public_warning_needed
                  AND (d2.source_conversation_id = NEW.source_conversation_id OR d2.thread_root_id = NEW.thread_root_id))
       OR EXISTS (SELECT 1 FROM public.point_chat_shares s JOIN public.chat_messages m ON m.id = s.message_id
                   WHERE s.conversation_id = NEW.source_conversation_id AND m.deleted_at IS NULL AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id
                     AND NOT EXISTS (SELECT 1 FROM public.clarify_drafts d4 WHERE d4.owner_id = NEW.owner_id AND d4.point_id = s.point_id AND d4.state = 'done'
                                        AND d4.source_conversation_id = NEW.source_conversation_id)) THEN
      NEW.public_warning_needed := true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._clarify_warning_taint() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS clarify_drafts_warning_taint ON public.clarify_drafts;
CREATE TRIGGER clarify_drafts_warning_taint BEFORE UPDATE OF state ON public.clarify_drafts FOR EACH ROW EXECUTE FUNCTION public._clarify_warning_taint();

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- clarify_set_visibility: S1 answered, S5 latest
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
  -- S1: a point another account has answered can never be replaced by a public one
  IF p_visibility = 'public' AND public._clarify_answered(v_d.point_id, v_uid) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'answered');
  END IF;
  UPDATE public.clarify_drafts d SET visibility = p_visibility, updated_at = now() WHERE d.id = v_d.id;
  RETURN jsonb_build_object('status', 'ok', 'visibility', p_visibility, 'public_warning', v_d.public_warning_needed);
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_set_visibility(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_set_visibility(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- clarify_draft_edit: S10, links are masked before a #tag is read (the client's rule, extractHashtags)
-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
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
  -- the #tags the masked text holds (the client's extractHashtags rule, P1660)
  SELECT COALESCE(array_agg(DISTINCT lower(m[2])), '{}') INTO v_found
    FROM regexp_matches(v_mask, '(^|[^\w#/])#(\w+)(?!\w|\.\w|[/#])', 'g') AS m
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
-- clarify_draft_delete: S6, a draft whose point is public stays (it is the record the letter guards read once the card message is gone)
-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clarify_draft_delete(p_draft uuid)
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
  PERFORM public._clarify_sweep(v_uid);
  SELECT d.* INTO v_d FROM public.clarify_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clarify: draft not available' USING ERRCODE = '42501';
  END IF;
  IF v_d.state IN ('queued', 'running') THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'busy');
  END IF;
  IF v_d.point_id IS NOT NULL AND public._point_has_live_share(v_d.point_id) THEN -- P1631 publish
    RETURN jsonb_build_object('status', 'refused', 'code', 'published'); -- P1631 publish
  END IF; -- P1631 publish
  IF v_d.point_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.points p WHERE p.id = v_d.point_id AND p.visibility = 'public'::public.content_visibility) THEN -- P1722 S6: a public Clarify point keeps its draft while its owner exists
    RETURN jsonb_build_object('status', 'refused', 'code', 'published'); -- P1722 S6
  END IF; -- P1722 S6
  DELETE FROM public.clarify_drafts d WHERE d.id = v_d.id;
  RETURN jsonb_build_object('status', 'ok', 'point_kept', EXISTS (SELECT 1 FROM public.points p WHERE p.id = v_d.point_id));
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_draft_delete(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_draft_delete(uuid) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- _clarify_erase_person: S7, a draft behind a public point is failed `erased` and keeps its pointer; the public point stays
-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._clarify_erase_person(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ref    text := public._chat_author_ref(p_uid);
  v_points uuid[];
BEGIN
  PERFORM 1 FROM public.clarify_drafts d WHERE d.derived_refs @> ARRAY[v_ref] ORDER BY d.id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  -- a refused draft's suggestions are model text made from the erased person's words: cleared on every draft that is not in flight (an in-flight draft is failed and cleared below) -- P1631 erase scoped
  UPDATE public.clarify_drafts d SET suggestions = NULL -- P1631 erase scoped
   WHERE d.derived_refs @> ARRAY[v_ref] AND d.suggestions IS NOT NULL AND d.state NOT IN ('queued', 'running'); -- P1631 erase scoped
  -- a draft that read the erased person's words keeps its state and point (the point is its author's sentence): only the ref leaves it, so the statements below see only drafts whose run is in flight -- P1631 erase keeps held points
  -- P1722 S7: except a draft behind a PUBLIC point. That point stays readable (public-point erasure rule), but anyone can read it, so the draft shows as erased and the ref stays for the statements below
  UPDATE public.clarify_drafts d SET derived_refs = array_remove(d.derived_refs, v_ref) -- P1631 erase keeps held points
   WHERE d.derived_refs @> ARRAY[v_ref] AND d.state NOT IN ('queued', 'running') -- P1631 erase keeps held points
     AND NOT EXISTS (SELECT 1 FROM public.points pu WHERE pu.id = d.point_id AND pu.visibility = 'public'::public.content_visibility); -- P1722 S7
  SELECT COALESCE(array_agg(d.point_id), '{}') INTO v_points
    FROM public.clarify_drafts d WHERE d.derived_refs @> ARRAY[v_ref] AND d.point_id IS NOT NULL;
  -- a run in flight is dead: its reservation is charged in full (the model may have been called), as the sweep does; the run's late completion settles nothing twice -- P1631
  UPDATE public.mirror_ai_spend s SET actual_usd = s.reserved_usd, state = 'settled', settled_at = now() -- P1631
   WHERE s.state = 'reserved' AND s.id IN (SELECT d.spend_id FROM public.clarify_drafts d -- P1631
                                           WHERE d.derived_refs @> ARRAY[v_ref] AND d.state = 'running' AND d.spend_id IS NOT NULL); -- P1631
  UPDATE public.clarify_drafts d
     SET state = 'failed', error_code = 'erased',
         point_id = CASE WHEN EXISTS (SELECT 1 FROM public.points pu WHERE pu.id = d.point_id AND pu.visibility = 'public'::public.content_visibility) THEN d.point_id END, -- P1722 S7: the pointer to a public point stays (the letter guards read it)
         suggestions = NULL, cited = NULL,
         derived_refs = '{}', sent_ids = '{}', updated_at = now()
   WHERE d.derived_refs @> ARRAY[v_ref];
  DELETE FROM public.points p WHERE p.id = ANY (v_points) AND p.visibility = 'private'::public.content_visibility; -- P1631 r2: whoever holds a position on it, it is derived from the erased words; positions go with it
END;
$$;
REVOKE ALL ON FUNCTION public._clarify_erase_person(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- get_clarify_thread: S5, is_latest is the shared test
-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
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
        'is_latest', public._clarify_is_latest(d), -- P1722 S5: the card Publish and the visibility switch belong to, the same test set_visibility and publish refuse earlier_version by
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

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- clarify_start_chat: S3, a transcribed line inside a recording thread is an anchor in a Mirror
-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
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
   WHERE m.conversation_id = p_conversation AND m.kind = 'message' AND m.context_conversation_id IS NULL
     AND (m.thread_root_id IS NULL
          OR (v_kind = 'mirror' AND m.is_transcription -- P1722 S3: a Mirror recording is stored as an outside-rounds root with the lines as its replies; a line there is the Mirror's own speech and can be pressed
              AND EXISTS (SELECT 1 FROM public.chat_messages r WHERE r.id = m.thread_root_id AND r.system_kind IS NOT NULL)))
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

-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- clarify_publish(p_draft, p_client_id, p_visibility, p_warning_ack): S1, S2, S4, S8
-- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.clarify_publish(uuid, uuid);
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
       OR EXISTS (SELECT 1 FROM public.badge_points x WHERE x.point_id = v_p.id) THEN
      RETURN jsonb_build_object('status', 'refused', 'code', 'point_linked');
    END IF;
    -- S8: the system tags the private point carries (the story st tags a link synced onto it) go to the public one; a canvas_ box tag cannot (a public point may not carry one)
    SELECT COALESCE(array_agg(t ORDER BY t), '{}') INTO v_tags FROM unnest(v_p.system_tags) t WHERE lower(t) NOT LIKE 'canvas\_%';
    BEGIN
      INSERT INTO public.points (statement, first_validator_id, visibility, tags, system_tags)
      VALUES (v_p.statement, v_uid, 'public'::public.content_visibility, COALESCE(v_p.tags, '{}'), v_tags)
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
REVOKE ALL ON FUNCTION public.clarify_publish(uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_publish(uuid, uuid, text, boolean) TO authenticated;
