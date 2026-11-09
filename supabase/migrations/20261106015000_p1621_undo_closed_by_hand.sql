-- P1621 round 3: the draft remembers that Undo was closed by the owner's own hand-write (canvas_drafts.undo_closed_by_hand), so the screen can say why Undo is gone.
--
-- diffed against: 20261102201000_p1536_undo_closed_marker.sql (get_canvas_draft_state: body unchanged, one added answer key `undo_closed_by_hand` in the draft object),
--   20261105160000_p1614_restore_keeps_stories.sql (canvas_draft_edit_point: body unchanged, the two Undo-step deletes now count their rows and the revision UPDATEs set the flag),
--   20261106012000_p1621_remove_keeps_stories_add_replay.sql (canvas_draft_remove_point and canvas_draft_add_point: same, one delete each). Signatures, grants, refusals and every other
--   answer key are unchanged.
-- client-safe: one NOT NULL DEFAULT false column (not in the owner's column grant), one added key in a jsonb answer, CREATE OR REPLACE of three RPCs with the same signatures and keys,
--   one AFTER INSERT trigger on canvas_draft_steps. A client that does not read the key is unaffected.
--
-- Meaning: true = the draft's Undo steps were deleted by an owner hand-write (edit, add, remove) that actually deleted at least one step. Set ONLY then (GET DIAGNOSTICS ROW_COUNT > 0),
--   so a hand-write on a draft whose runs made no step leaves it false, and a second hand-write that deletes nothing leaves it as it was.
-- Cleared: (1) when a drafting run completes with a step that still exists at commit (a step an idle run inserts and deletes again does not count; see 20261106016000, which replaces
--   this trigger with a deferred one), by a trigger on canvas_draft_steps (the only inserter is _canvas_draft_run_complete,
--   20261103010000:1165; a trigger instead of redefining that 1,000-line function, which this change must not touch); (2) on undo: Undo needs a step, a step only exists after the trigger
--   cleared the flag, and deleting an undone run's step cannot turn it true, so canvas_draft_undo needs no change and the flag is already false when an undo lands.
--   A run that completes with NO step leaves it as it was (the hand-closed earlier runs are still closed).

ALTER TABLE public.canvas_drafts ADD COLUMN IF NOT EXISTS undo_closed_by_hand boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public._canvas_draft_step_clears_hand_closed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.canvas_drafts d SET undo_closed_by_hand = false WHERE d.id = NEW.draft_id AND d.undo_closed_by_hand;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_step_clears_hand_closed() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS canvas_draft_steps_clear_hand_closed ON public.canvas_draft_steps;
CREATE TRIGGER canvas_draft_steps_clear_hand_closed AFTER INSERT ON public.canvas_draft_steps
  FOR EACH ROW EXECUTE FUNCTION public._canvas_draft_step_clears_hand_closed();

CREATE OR REPLACE FUNCTION public.get_canvas_draft_state(p_canvas uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_canvas public.canvases;
  v_d      public.canvas_drafts;
  v_c      public.canvas_drafts;
  v_draft  jsonb := NULL;
  v_closed jsonb := NULL;
  v_pts    uuid[];
  v_base   integer;
  v_closed_all jsonb;
  v_active public.canvas_draft_runs;
  v_undone jsonb;
BEGIN
  PERFORM public._canvas_draft_require_verified(v_uid);
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));
  SELECT c.* INTO v_canvas FROM public.canvases c WHERE c.id = p_canvas AND c.owner_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  PERFORM public._canvas_draft_expire(v_uid);

  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.canvas_id = v_canvas.id AND d.state = 'open';
  IF FOUND THEN
    v_pts := public._canvas_draft_point_ids(v_d.id);
    IF v_d.base_version_id IS NOT NULL THEN
      SELECT v.published_seq INTO v_base FROM public.canvas_versions v WHERE v.id = v_d.base_version_id;
    END IF;
    SELECT r.* INTO v_active FROM public.canvas_draft_runs r
     WHERE r.owner_id = v_uid AND r.draft_id = v_d.id AND r.state IN ('queued', 'running') LIMIT 1;
    v_draft := jsonb_build_object(
      'id', v_d.id, 'revision', v_d.revision, 'version_name', v_d.version_name, 'focus', v_d.focus,
      'base_version_id', v_d.base_version_id, 'base_seq', v_base,
      'thread_root_id', v_d.thread_root_id, 'conversation_id', v_d.conversation_id,
      'used_runs', public._canvas_draft_used_runs(v_d.id), 'cap', 30,
      'has_points', cardinality(v_pts) > 0,
      -- the same definition Publish enforces (no_changes): at least one box whose point set differs from the base's
      'differs_from_base', CASE WHEN v_d.base_version_id IS NULL THEN cardinality(v_pts) > 0
                                ELSE cardinality(public._canvas_draft_changed_boxes(v_d.id)) > 0 END,
      'changed_boxes', to_jsonb(public._canvas_draft_changed_boxes(v_d.id)),
      'questions', v_d.questions,
      'active_run', CASE WHEN v_active.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', v_active.id, 'kind', v_active.kind, 'state', v_active.state, 'input_kind', v_active.input_kind,
          'trigger_message_id', v_active.trigger_message_id, 'created_at', v_active.created_at, 'started_at', v_active.started_at) END,
      'active_elsewhere', v_active.id IS NULL AND EXISTS (
          SELECT 1 FROM public.canvas_draft_runs r WHERE r.owner_id = v_uid AND r.state IN ('queued', 'running')),
      'undo_run_id', (SELECT r.id FROM public.canvas_draft_runs r JOIN public.canvas_draft_steps s ON s.run_id = r.id
                       WHERE r.draft_id = v_d.id AND r.state = 'done'
                       ORDER BY r.finished_at DESC, r.created_at DESC, r.id DESC LIMIT 1),
      'undo_closed_by_hand', v_d.undo_closed_by_hand,
      'runs', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id', x.id, 'kind', x.kind, 'state', x.state, 'input_kind', x.input_kind, 'error_code', x.error_code,
                  'trigger_message_id', x.trigger_message_id, 'reply_message_id', x.reply_message_id, 'scope', to_jsonb(x.scope),
                  'target_offer_id', x.target_offer_id, 'created_at', x.created_at, 'finished_at', x.finished_at)
                  ORDER BY x.created_at, x.id)
                FROM (SELECT * FROM public.canvas_draft_runs r WHERE r.draft_id = v_d.id
                       ORDER BY r.created_at DESC, r.id DESC LIMIT 60) x), '[]'::jsonb),
      'offers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id', o.id, 'group_label', o.group_label, 'why', o.why, 'state', o.state, 'started_canvas_id', o.started_canvas_id)
                  ORDER BY o.created_at, o.id) FROM public.canvas_draft_offers o WHERE o.draft_id = v_d.id), '[]'::jsonb),
      'material', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id', m.id, 'message_id', m.message_id, 'origin', m.origin, 'kind', m.kind, 'label', m.label, 'chars', m.chars)
                  ORDER BY m.created_at, m.id) FROM public.canvas_draft_material m WHERE m.draft_id = v_d.id), '[]'::jsonb));
  END IF;

  SELECT d.* INTO v_c FROM public.canvas_drafts d
   WHERE d.canvas_id = v_canvas.id AND d.state = 'published' ORDER BY d.closed_at DESC, d.created_at DESC LIMIT 1;
  IF FOUND THEN
    v_closed := jsonb_build_object(
      'id', v_c.id, 'revision', v_c.revision, 'version_name', v_c.version_name,
      'published_seq', (SELECT v.published_seq FROM public.canvas_versions v WHERE v.id = v_c.version_id),
      'thread_root_id', v_c.thread_root_id, 'conversation_id', v_c.conversation_id,
      'material_until', v_c.material_until,
      'material_expired', public._canvas_draft_material_expired(v_c.id),
      'offers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id', o.id, 'group_label', o.group_label, 'why', o.why, 'state', o.state, 'started_canvas_id', o.started_canvas_id)
                  ORDER BY o.created_at, o.id) FROM public.canvas_draft_offers o WHERE o.draft_id = v_c.id), '[]'::jsonb));
  END IF;

  -- EVERY published draft of the canvas that still has an offered OR a started offer (not only the newest): an offered one
  -- can be started or dismissed, a started one keeps started_canvas_id so the client can show Open; material_expired says
  -- whether its kept material is gone
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', c.id, 'revision', c.revision, 'version_name', c.version_name,
           'published_seq', (SELECT v.published_seq FROM public.canvas_versions v WHERE v.id = c.version_id),
           'thread_root_id', c.thread_root_id, 'conversation_id', c.conversation_id, 'material_until', c.material_until,
           'material_expired', public._canvas_draft_material_expired(c.id),
           'offers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                       'id', o.id, 'group_label', o.group_label, 'why', o.why, 'state', o.state, 'started_canvas_id', o.started_canvas_id)
                       ORDER BY o.created_at, o.id) FROM public.canvas_draft_offers o WHERE o.draft_id = c.id), '[]'::jsonb))
           ORDER BY c.closed_at, c.id), '[]'::jsonb)
    INTO v_closed_all
    FROM public.canvas_drafts c
   WHERE c.canvas_id = v_canvas.id AND c.state = 'published'
     AND EXISTS (SELECT 1 FROM public.canvas_draft_offers o WHERE o.draft_id = c.id AND o.state IN ('offered', 'started'));

  -- J6: "the undone message stays in the thread, marked Undone", and it stays marked after the draft closes. Only the owner messages
  -- (trigger_message_id) of undone runs, by draft id, for every CLOSED draft of this canvas (published or discarded: a discarded draft is
  -- not closed_draft, which lists published ones). No run, no step, no text. The canvas was already proven the caller's above.
  SELECT COALESCE(jsonb_object_agg(g.draft_id, g.ids), '{}'::jsonb)
    INTO v_undone
    FROM (SELECT r.draft_id, to_jsonb(array_agg(r.trigger_message_id ORDER BY r.created_at, r.id)) AS ids
            FROM public.canvas_draft_runs r
            JOIN public.canvas_drafts c ON c.id = r.draft_id
           WHERE c.canvas_id = v_canvas.id AND c.owner_id = v_uid AND c.state IN ('published', 'discarded')
             AND r.owner_id = v_uid AND r.state = 'undone' AND r.trigger_message_id IS NOT NULL
           GROUP BY r.draft_id) g;

  RETURN jsonb_build_object('canvas_id', v_canvas.id, 'canvas_name', v_canvas.name, 'draft', v_draft,
                            'closed_draft', v_closed, 'closed_drafts', v_closed_all, 'closed_undone', v_undone);
END;
$$;
REVOKE ALL ON FUNCTION public.get_canvas_draft_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_canvas_draft_state(uuid) TO authenticated;

-- canvas_draft_edit_point: the latest body (20261105160000); the two Undo-step deletes count their rows (v_n) and the revision UPDATEs set the flag when a step was deleted
CREATE OR REPLACE FUNCTION public.canvas_draft_edit_point(
  p_draft uuid, p_point uuid, p_statement text, p_expected_revision integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_d     public.canvas_drafts;
  v_code  text;
  v_op    public.points;
  v_stmt  text;
  v_box   text;
  v_tag   text;
  v_pid   uuid;
  v_links jsonb;
  v_chain uuid;
  v_rev   integer;
  v_back  public.points;
  v_newid uuid;
  v_n     integer;
BEGIN
  PERFORM public._canvas_draft_require_verified(v_uid);
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));
  PERFORM public._canvas_draft_expire(v_uid);
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  IF v_d.state <> 'open' THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  v_code := public._canvas_draft_busy_code(v_uid, v_d.id, false);
  IF v_code IS NOT NULL THEN
    RETURN public._canvas_draft_refuse(v_code, v_d.id);
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_d.revision THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  -- the same bounds every engine path enforces on a point
  v_stmt := btrim(COALESCE(p_statement, ''));
  IF char_length(v_stmt) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'canvas draft: bad statement' USING ERRCODE = '22023';
  END IF;
  -- the point must be one of this draft's points as it stands now; otherwise the view is old
  IF p_point IS NULL OR NOT (p_point = ANY (public._canvas_draft_point_ids(v_d.id))) THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  SELECT p.* INTO v_op FROM public.points p WHERE p.id = p_point;
  v_box := public._canvas_point_box(v_op.system_tags);
  IF v_box IS NULL THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  -- an unchanged save writes nothing
  IF v_stmt = btrim(v_op.statement) THEN
    RETURN jsonb_build_object('status', 'ok', 'changed', false, 'point_id', v_op.id, 'revision', v_d.revision);
  END IF;

  v_tag := 'canvas_' || v_d.version_name;

  -- typing the original words back: the chain's old point, when it is still a private head with exactly these words, comes back into the draft
  SELECT (l ->> 'old')::uuid INTO v_chain FROM jsonb_array_elements(v_d.pending_links) l WHERE l ->> 'new' = v_op.id::text LIMIT 1;
  IF v_chain IS NOT NULL THEN
    SELECT p.* INTO v_back FROM public.points p WHERE p.id = v_chain;
    IF FOUND AND v_back.superseded_by IS NULL AND v_back.visibility = 'private'::public.content_visibility
       AND btrim(v_back.statement) = v_stmt AND public._canvas_point_box(v_back.system_tags) = v_box
       AND NOT (v_back.system_tags @> ARRAY[v_tag]::text[]) THEN
      -- the owner's private story links of the point being left follow onto the restored point (a story the original already has wins)
      INSERT INTO public.story_points (story_id, point_id, author_id)
      SELECT sp.story_id, v_back.id, v_d.owner_id
        FROM public.story_points sp JOIN public.stories s ON s.id = sp.story_id
       WHERE sp.point_id = v_op.id AND s.author_id = v_d.owner_id AND s.visibility = 'private'::public.content_visibility
      ON CONFLICT DO NOTHING;
      PERFORM set_config('p1536.keep_updated_at', 'on', true);
      UPDATE public.points p SET system_tags = array_remove(p.system_tags, v_tag) WHERE p.id = v_op.id;
      UPDATE public.points p SET system_tags = array_append(p.system_tags, v_tag) WHERE p.id = v_back.id;
      PERFORM set_config('p1536.keep_updated_at', 'off', true);
      SELECT COALESCE(jsonb_agg(l), '[]'::jsonb) INTO v_links
        FROM jsonb_array_elements(v_d.pending_links) l
       WHERE (l ->> 'new')::uuid = ANY (public._canvas_draft_point_ids(v_d.id));
      DELETE FROM public.canvas_draft_steps s WHERE s.draft_id = v_d.id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      UPDATE public.canvas_drafts d SET pending_links = v_links, revision = d.revision + 1, undo_closed_by_hand = d.undo_closed_by_hand OR v_n > 0
       WHERE d.id = v_d.id RETURNING d.revision INTO v_rev;
      RETURN jsonb_build_object('status', 'ok', 'changed', true, 'point_id', v_back.id, 'revision', v_rev, 'restored', true);
    END IF;
    v_chain := NULL;
  END IF;

  -- the new point keeps the old point's place in its box (created_at, then an id that sorts beside the old one)
  v_newid := (substr(v_op.id::text, 1, 24) || substr(gen_random_uuid()::text, 25))::uuid;
  INSERT INTO public.points (id, statement, first_validator_id, visibility, tags, system_tags, created_at)
  VALUES (v_newid, v_stmt, v_d.owner_id, 'private'::public.content_visibility, '{}', ARRAY[v_box, v_tag], v_op.created_at)
  RETURNING id INTO v_pid;
  -- the owner's own words keep the owner's stance (the one difference from a reword)
  INSERT INTO public.point_positions (point_id, user_id, position, reasoning)
  SELECT v_pid, v_d.owner_id, pp.position, pp.reasoning
    FROM public.point_positions pp WHERE pp.point_id = v_op.id AND pp.user_id = v_d.owner_id;
  -- the owner's private stories follow the point; they are the owner's, so never in the ledger
  INSERT INTO public.story_points (story_id, point_id, author_id)
  SELECT sp.story_id, v_pid, v_d.owner_id
    FROM public.story_points sp JOIN public.stories s ON s.id = sp.story_id
   WHERE sp.point_id = v_op.id AND s.author_id = v_d.owner_id AND s.visibility = 'private'::public.content_visibility;
  INSERT INTO public.canvas_draft_points (draft_id, point_id, run_id, story_ids)
  VALUES (v_d.id, v_pid, NULL, '{}');

  -- the pending supersede link, exactly as the engine's reword records it
  v_links := v_d.pending_links;
  SELECT (l ->> 'old')::uuid INTO v_chain FROM jsonb_array_elements(v_links) l WHERE l ->> 'new' = v_op.id::text LIMIT 1;
  IF v_chain IS NOT NULL THEN
    v_links := v_links || jsonb_build_array(jsonb_build_object(
      'old', v_chain, 'new', v_pid, 'relation', 'reword', 'why', 'edited by the owner'));
  ELSIF NOT EXISTS (SELECT 1 FROM public.canvas_draft_points cp WHERE cp.draft_id = v_d.id AND cp.point_id = v_op.id)
        AND v_op.superseded_by IS NULL AND v_op.visibility = 'private'::public.content_visibility THEN
    v_links := v_links || jsonb_build_array(jsonb_build_object(
      'old', v_op.id, 'new', v_pid, 'relation', 'reword', 'why', 'edited by the owner'));
  END IF;

  PERFORM set_config('p1536.keep_updated_at', 'on', true);
  UPDATE public.points p SET system_tags = array_remove(p.system_tags, v_tag) WHERE p.id = v_op.id;
  PERFORM set_config('p1536.keep_updated_at', 'off', true);

  -- links whose new point left the draft are dropped (editing twice leaves one link, to the newest text)
  SELECT COALESCE(jsonb_agg(l), '[]'::jsonb) INTO v_links
    FROM jsonb_array_elements(v_links) l
   WHERE (l ->> 'new')::uuid = ANY (public._canvas_draft_point_ids(v_d.id));

  -- an undo restores a snapshot from before this edit: close it for every earlier run
  DELETE FROM public.canvas_draft_steps s WHERE s.draft_id = v_d.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE public.canvas_drafts d SET pending_links = v_links, revision = d.revision + 1, undo_closed_by_hand = d.undo_closed_by_hand OR v_n > 0
   WHERE d.id = v_d.id RETURNING d.revision INTO v_rev;
  RETURN jsonb_build_object('status', 'ok', 'changed', true, 'point_id', v_pid, 'revision', v_rev);
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_edit_point(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_edit_point(uuid, uuid, text, integer) TO authenticated;

-- canvas_draft_remove_point: the latest body (20261106012000) with the step-delete count and the flag
CREATE OR REPLACE FUNCTION public.canvas_draft_remove_point(
  p_draft uuid, p_point uuid, p_expected_revision integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_d    public.canvas_drafts;
  v_code text;
  v_tag  text;
  v_rev  integer;
  v_n    integer;
BEGIN
  PERFORM public._canvas_draft_require_verified(v_uid);
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));
  PERFORM public._canvas_draft_expire(v_uid);
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  IF v_d.state <> 'open' THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  v_code := public._canvas_draft_busy_code(v_uid, v_d.id, false);
  IF v_code IS NOT NULL THEN
    RETURN public._canvas_draft_refuse(v_code, v_d.id);
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_d.revision THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  IF p_point IS NULL OR NOT (p_point = ANY (public._canvas_draft_point_ids(v_d.id))) THEN
    RETURN public._canvas_draft_refuse('not_found', v_d.id);
  END IF;

  SELECT 'canvas_' || v.name INTO v_tag FROM public.canvas_versions v WHERE v.id = v_d.version_id;
  PERFORM set_config('p1536.keep_updated_at', 'on', true);
  UPDATE public.points p SET system_tags = array_remove(p.system_tags, v_tag) WHERE p.id = p_point;
  PERFORM set_config('p1536.keep_updated_at', 'off', true);

  -- a story a run wrote for this card leaves the ledger, so Publish and Discard no longer delete it as "unlinked"
  UPDATE public.canvas_draft_points cp SET story_ids = '{}' WHERE cp.draft_id = v_d.id AND cp.point_id = p_point;

  -- an undo restores a snapshot from before this removal: close it for every earlier run
  DELETE FROM public.canvas_draft_steps s WHERE s.draft_id = v_d.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE public.canvas_drafts d SET revision = d.revision + 1, undo_closed_by_hand = d.undo_closed_by_hand OR v_n > 0
   WHERE d.id = v_d.id RETURNING d.revision INTO v_rev;
  RETURN jsonb_build_object('status', 'ok', 'revision', v_rev);
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_remove_point(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_remove_point(uuid, uuid, integer) TO authenticated;

-- canvas_draft_add_point: the latest body (20261106012000) with the step-delete count and the flag
CREATE OR REPLACE FUNCTION public.canvas_draft_add_point(
  p_draft uuid, p_box text, p_statement text, p_expected_revision integer, p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_d    public.canvas_drafts;
  v_code text;
  v_stmt text;
  v_tag  text;
  v_pid  uuid;
  v_rev  integer;
  v_old  uuid;
  v_n    integer;
BEGIN
  PERFORM public._canvas_draft_require_verified(v_uid);
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));
  PERFORM public._canvas_draft_expire(v_uid);
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'canvas draft: client id required' USING ERRCODE = '22023';
  END IF;
  -- a repeat of a save that already landed answers the first result, before any state, busy or revision check
  SELECT cp.point_id INTO v_old FROM public.canvas_draft_points cp WHERE cp.draft_id = v_d.id AND cp.client_id = p_client_id;
  IF FOUND THEN
    -- only while the card is still on the draft; a card the owner removed since is not reported as present
    IF v_old = ANY (public._canvas_draft_point_ids(v_d.id)) THEN
      RETURN jsonb_build_object('status', 'ok', 'changed', false, 'point_id', v_old, 'revision', v_d.revision);
    END IF;
    RETURN public._canvas_draft_refuse('not_found', v_d.id);
  END IF;
  IF v_d.state <> 'open' THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  v_code := public._canvas_draft_busy_code(v_uid, v_d.id, false);
  IF v_code IS NOT NULL THEN
    RETURN public._canvas_draft_refuse(v_code, v_d.id);
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_d.revision THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  IF p_box IS NULL OR NOT (p_box = ANY (public._canvas_box_tags())) THEN
    RAISE EXCEPTION 'canvas draft: bad box' USING ERRCODE = '22023';
  END IF;
  v_stmt := btrim(COALESCE(p_statement, ''));
  IF char_length(v_stmt) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'canvas draft: bad statement' USING ERRCODE = '22023';
  END IF;

  -- the limit the agent has (3 a box), counted under the locks above so simultaneous saves cannot pass it
  IF (SELECT count(*) FROM public.points p
       WHERE p.id = ANY (public._canvas_draft_point_ids(v_d.id)) AND p.system_tags @> ARRAY[p_box]::text[]) >= 3 THEN
    RETURN public._canvas_draft_refuse('box_full', v_d.id);
  END IF;
  IF EXISTS (SELECT 1 FROM public.points p
              WHERE p.id = ANY (public._canvas_draft_point_ids(v_d.id)) AND p.system_tags @> ARRAY[p_box]::text[]
                AND btrim(p.statement) = v_stmt) THEN
    RETURN public._canvas_draft_refuse('duplicate', v_d.id);
  END IF;

  v_tag := 'canvas_' || v_d.version_name;
  INSERT INTO public.points (statement, first_validator_id, visibility, tags, system_tags)
  VALUES (v_stmt, v_d.owner_id, 'private'::public.content_visibility, '{}', ARRAY[p_box, v_tag])
  RETURNING id INTO v_pid;
  INSERT INTO public.canvas_draft_points (draft_id, point_id, run_id, story_ids, client_id)
  VALUES (v_d.id, v_pid, NULL, '{}', p_client_id);

  -- an undo restores a snapshot from before this card: close it for every earlier run
  DELETE FROM public.canvas_draft_steps s WHERE s.draft_id = v_d.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE public.canvas_drafts d SET revision = d.revision + 1, undo_closed_by_hand = d.undo_closed_by_hand OR v_n > 0
   WHERE d.id = v_d.id RETURNING d.revision INTO v_rev;
  RETURN jsonb_build_object('status', 'ok', 'changed', true, 'point_id', v_pid, 'revision', v_rev);
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_add_point(uuid, text, text, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_add_point(uuid, text, text, integer, uuid) TO authenticated;
