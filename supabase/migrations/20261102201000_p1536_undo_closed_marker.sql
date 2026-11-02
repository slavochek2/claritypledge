-- P1536 section 3c, D7 / J6 review: the "Undone" mark of an owner message survives the draft closing.
--
-- diffed against: 20261030080000_p1536_v6_engine.sql (get_canvas_draft_state: its body, every guard and every existing answer key unchanged, with one added answer
--   key `closed_undone` and the local variable that builds it). No other migration redefines this function.
-- client-safe: one added key in the jsonb answer of a function a client already calls; no signature, grant, table or column changes, and no existing key moves. A client that
--   does not read `closed_undone` is unaffected. The key holds only owner message ids of undone runs of the caller's own closed drafts, by draft id: no run, step or text.
--
-- Before: the state read listed runs for the OPEN draft only, so after Publish or Discard a client could not tell which owner messages were undone, and J6's mark ("the undone
-- message stays in the thread marked Undone") vanished with the draft. trigger_message_id is not a client column (the runs table grants clients a short column list), and this
-- migration adds no grant: the ids come through this owner-only read.
--
-- Cost: one more aggregate in a read the client already makes once per change of the draft; it touches only runs of this canvas's closed drafts that are `undone`
-- (indexed by draft_id), and is empty for a canvas that never used Undo.

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
