-- P1614 review fixes: a hand edit keeps its card in place, and typing the original words back returns to the original point.
--
-- diffed against: 20261105143000_p1614_canvas_draft_edit_point.sql (canvas_draft_edit_point: its body, signature, grants, every refusal and every answer key unchanged,
--   with two additions: (1) the new point carries the old point's created_at and takes an id that sorts next to the old id, (2) the "typed the original words back"
--   branch that precedes the INSERT). The reword branch it follows by hand is still 20261103010000_p1536_server_review_fixes.sql, _canvas_draft_run_complete:
--   a change to that branch must be checked against this function (docs/technical/database.md, "canvas_draft_edit_point").
-- client-safe: CREATE OR REPLACE of one authenticated-only RPC with the same signature and the same answer keys; one added key, `restored` (true only on the new branch).
--
-- (1) get_canvas draws a box by (created_at, id). A new point took created_at = now(), so an edited card moved to the end of its box and, with one card shown, the
--   grid showed another point. The new point now carries the old point's created_at. Points written by ONE engine run share a created_at (the transaction's now()), so
--   their order is by id: the new point's id is the old id with its last 12 hex digits drawn fresh, which sorts beside the old id among any other ids (a 12-byte-prefix
--   collision is the only way to disturb it).
--   Read by created_at for canvas points: get_canvas (the owner and reader read) and the drafting engine's prompt context (ORDER BY p.created_at, p.id), both want the
--   stable order; the owner's own point lists (points-service-real) order by created_at too, where an edited point now sits where its predecessor did.
-- (2) A -> B -> back to A's words made a third point and a supersede link with identical words, stranding readers' positions and stories on the old point. When the
--   new text equals the chain's old point (the point this draft's pending link supersedes) and that point is still a private head, the draft returns to it: its tag
--   comes back, the link goes (the final filter drops a link whose new point left the draft), and the intermediate point stays untagged in the ledger for Publish or
--   Discard to clean, exactly as the engine leaves a reworded draft point. No new point is written, the owner's stance and stories on the original are untouched, and the
--   box then matches the base again (Publish says no_changes when nothing else differs).

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
      PERFORM set_config('p1536.keep_updated_at', 'on', true);
      UPDATE public.points p SET system_tags = array_remove(p.system_tags, v_tag) WHERE p.id = v_op.id;
      UPDATE public.points p SET system_tags = array_append(p.system_tags, v_tag) WHERE p.id = v_back.id;
      PERFORM set_config('p1536.keep_updated_at', 'off', true);
      SELECT COALESCE(jsonb_agg(l), '[]'::jsonb) INTO v_links
        FROM jsonb_array_elements(v_d.pending_links) l
       WHERE (l ->> 'new')::uuid = ANY (public._canvas_draft_point_ids(v_d.id));
      DELETE FROM public.canvas_draft_steps s WHERE s.draft_id = v_d.id;
      UPDATE public.canvas_drafts d SET pending_links = v_links, revision = d.revision + 1
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

  UPDATE public.canvas_drafts d SET pending_links = v_links, revision = d.revision + 1
   WHERE d.id = v_d.id RETURNING d.revision INTO v_rev;
  RETURN jsonb_build_object('status', 'ok', 'changed', true, 'point_id', v_pid, 'revision', v_rev);
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_edit_point(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_edit_point(uuid, uuid, text, integer) TO authenticated;
