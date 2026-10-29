-- P1536: a reworded point keeps the owner's existing private stories (review of the points-only change).
-- The draft engine no longer asks the model for a story, so every action it sends now carries story null. A move and a
-- keep already take over the owner's private stories of the old point when they carry none; a reword did not, so a
-- reworded point lost the story its old point had. This replaces _canvas_draft_run_complete (latest body:
-- 20261029100100) with ONE change: that branch also covers 'reword'. No text is copied: the owner's existing story
-- rows are linked to the new point, so there is no duplicate story and nothing new for a revision or a discard to
-- delete (created_story_ids is untouched; _canvas_draft_clear_points deletes only stories recorded there, and the
-- cascade on story_points.point_id drops just the link when the reworded point goes).
--
-- client-safe: _canvas_draft_run_complete is executable by service_role only (REVOKE/GRANT repeated below, as in
--   20261029100100); same signature and return shape, no client function is added or changed.
--
-- diffed against: 20261029100100_p1536_canvas_draft_runs.sql (its only definition; nothing later replaces it).
-- Renamed from 20261028110000 with its two siblings (they were 20261027100000 and 20261027100100), so all three run
--   after P1576 (20261027120000..20261027120700), which reached prod first.
-- WHAT CHANGES: `ELSIF v_type IN ('move', 'keep')` becomes `ELSIF v_type IN ('move', 'keep', 'reword')`, and the
--   comments around it. A reword that DOES carry a story still creates its own story, as before.

BEGIN;

-- The draft call's result, in ONE transaction (any error rolls every write back and leaves the run running, for
-- _canvas_draft_run_fail). Returns NULL for a late answer.
--   p_actions    [{action|type: keep, point_id} | {action|type: reword|move, old_point_id, box, statement, story}
--                | {action|type: new, box, statement, story}]; a point of the base version that no action names is
--                not carried (there is no drop action)
--   p_questions  {canvas box tag: question}, p_decided [{kind, text}]
-- A point is written only through this function: private, box tag + the draft version's canvas_ tag, NO user tag,
-- the owner's agree position, and the owner's private story when one is given (a story is created only from a
-- non-empty one; a keep, a move and a reword with none take over the owner's private stories of the old point). A
-- pending supersede link (old, new)
-- is recorded for reword and move only when the old point is a head of the base version; it is written onto the
-- points by Publish, never here.
-- Not search_path = '': inserting points, stories, story_points and point_positions fires triggers that resolve
-- unqualified names (see _canvas_draft_clear_points). Every relation named here is schema-qualified.
CREATE OR REPLACE FUNCTION public._canvas_draft_run_complete(
  p_run uuid, p_actions jsonb, p_questions jsonb, p_decided jsonb, p_reply text, p_usd numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_actions CONSTANT integer := 45;
  v_run   public.canvas_draft_runs;
  v_d     public.canvas_drafts;
  v_boxes text[] := public._canvas_box_tags();
  v_dver  text;
  v_cname text;
  v_slug  text;
  v_tag   text;
  v_btag  text;
  v_a     jsonb;
  v_type  text;
  v_old   uuid;
  v_op    public.points;
  v_box   text;
  v_stmt  text;
  v_story text;
  v_pid   uuid;
  v_sid   uuid;
  v_new_stories uuid[] := '{}';
  v_seen  uuid[] := '{}';
  v_links jsonb := '[]'::jsonb;
  v_kept  integer := 0;
  v_made  integer := 0;
  v_k     text;
  v_q     jsonb := '{}'::jsonb;
  v_full  numeric;
BEGIN
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_run.owner_id::text, 0));
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = v_run.draft_id FOR UPDATE;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run AND r.kind = 'draft' FOR UPDATE;
  IF v_run.id IS NOT NULL AND v_run.state = 'cancelled' THEN
    SELECT s.reserved_usd INTO v_full FROM public.mirror_ai_spend s WHERE s.id = v_run.spend_id;
    PERFORM public._mirror_settle(v_run.spend_id, COALESCE(p_usd, v_full));   -- erased: the call was made, nothing is written
    RETURN NULL;
  END IF;
  IF v_run.id IS NULL OR v_run.state <> 'running' THEN
    RETURN NULL;
  END IF;

  IF p_actions IS NULL OR jsonb_typeof(p_actions) <> 'array' OR jsonb_array_length(p_actions) > c_max_actions THEN
    RAISE EXCEPTION 'canvas draft: actions must be an array of at most % items', c_max_actions USING ERRCODE = '22023';
  END IF;
  IF p_questions IS NOT NULL AND jsonb_typeof(p_questions) <> 'object' THEN
    RAISE EXCEPTION 'canvas draft: questions must be an object' USING ERRCODE = '22023';
  END IF;
  IF p_decided IS NOT NULL AND (jsonb_typeof(p_decided) <> 'array' OR jsonb_array_length(p_decided) > 60) THEN
    RAISE EXCEPTION 'canvas draft: decided must be an array of at most 60' USING ERRCODE = '22023';
  END IF;
  FOR v_k IN SELECT jsonb_object_keys(COALESCE(p_questions, '{}'::jsonb)) LOOP
    IF NOT (v_k = ANY (v_boxes)) OR jsonb_typeof(p_questions -> v_k) <> 'string' THEN
      RAISE EXCEPTION 'canvas draft: bad question' USING ERRCODE = '22023';
    END IF;
    v_q := v_q || jsonb_build_object(v_k, left(p_questions ->> v_k, 400));
  END LOOP;

  SELECT s.reserved_usd INTO v_full FROM public.mirror_ai_spend s WHERE s.id = v_run.spend_id;
  PERFORM public._mirror_settle(v_run.spend_id, COALESCE(p_usd, v_full));
  IF v_d.state <> 'open' THEN
    UPDATE public.canvas_draft_runs r SET state = 'failed', error_code = 'draft_closed', finished_at = now() WHERE r.id = p_run;
    RETURN NULL;
  END IF;

  SELECT v.name INTO v_dver FROM public.canvas_versions v WHERE v.id = v_d.version_id;
  SELECT c.name INTO v_cname FROM public.canvases c WHERE c.id = v_d.canvas_id;
  SELECT 'canvas_' || v.name INTO v_btag FROM public.canvas_versions v WHERE v.id = v_d.base_version_id;
  v_tag := 'canvas_' || v_dver;

  -- 1 + 2: a revision replaces the draft: its created points go, reused points lose the draft's tag
  PERFORM public._canvas_draft_clear_points(v_d.id);

  -- 3: the actions
  FOR v_a IN SELECT e FROM jsonb_array_elements(p_actions) e LOOP
    v_type := COALESCE(v_a ->> 'action', v_a ->> 'type');
    IF v_type IS NULL OR v_type NOT IN ('keep', 'reword', 'move', 'new') THEN
      RAISE EXCEPTION 'canvas draft: unknown action' USING ERRCODE = '22023';
    END IF;

    IF v_type IN ('keep', 'reword', 'move') THEN
      v_old := COALESCE(v_a ->> 'point_id', v_a ->> 'old_point_id')::uuid;
      IF v_btag IS NULL OR v_old IS NULL THEN
        RAISE EXCEPTION 'canvas draft: no base version to take a point from' USING ERRCODE = '22023';
      END IF;
      IF v_old = ANY (v_seen) THEN
        RAISE EXCEPTION 'canvas draft: a point is named twice' USING ERRCODE = '22023';
      END IF;
      v_seen := v_seen || v_old;
      -- the owner's own point on the BASE version: nothing else may be reused, reworded or moved
      SELECT p.* INTO v_op FROM public.points p
       WHERE p.id = v_old AND p.first_validator_id = v_d.owner_id
         AND p.system_tags @> ARRAY[v_btag]::text[] AND p.system_tags && v_boxes;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'canvas draft: point is not on the base version' USING ERRCODE = '22023';
      END IF;
    END IF;

    -- A keep carries the old point over by giving it the draft's tag. A point that is not private (a legacy public
    -- seed) cannot take it: p1515_canvas_points_are_private refuses a changed canvas_ tag on a public point. It is
    -- carried as a private copy instead (below), with no link.
    IF v_type = 'keep' AND v_op.visibility = 'private'::public.content_visibility THEN
      UPDATE public.points p SET system_tags = array_append(p.system_tags, v_tag)
       WHERE p.id = v_old AND NOT (p.system_tags @> ARRAY[v_tag]::text[]);
      v_kept := v_kept + 1;
      CONTINUE;
    END IF;

    v_box := CASE WHEN v_type = 'keep' THEN (SELECT t FROM unnest(v_op.system_tags) t WHERE t = ANY (v_boxes) LIMIT 1)
                  ELSE COALESCE(NULLIF(v_a ->> 'box', ''), CASE WHEN v_type <> 'new' THEN
                    (SELECT t FROM unnest(v_op.system_tags) t WHERE t = ANY (v_boxes) LIMIT 1) END) END;
    IF v_box IS NULL OR NOT (v_box = ANY (v_boxes)) THEN
      RAISE EXCEPTION 'canvas draft: unknown box' USING ERRCODE = '22023';
    END IF;
    v_stmt := btrim(COALESCE(NULLIF(btrim(v_a ->> 'statement'), ''), CASE WHEN v_type IN ('move', 'keep') THEN v_op.statement END, ''));
    IF char_length(v_stmt) NOT BETWEEN 1 AND 300 THEN
      RAISE EXCEPTION 'canvas draft: bad statement' USING ERRCODE = '22023';
    END IF;
    v_story := CASE WHEN v_type = 'keep' THEN '' ELSE btrim(COALESCE(v_a ->> 'story', '')) END;
    IF char_length(v_story) > 1500 THEN
      RAISE EXCEPTION 'canvas draft: story too long' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.points (statement, first_validator_id, visibility, tags, system_tags)
    VALUES (v_stmt, v_d.owner_id, 'private'::public.content_visibility, '{}', ARRAY[v_box, v_tag])
    RETURNING id INTO v_pid;
    INSERT INTO public.point_positions (point_id, user_id, position) VALUES (v_pid, v_d.owner_id, 'agree');
    IF v_story <> '' THEN
      INSERT INTO public.stories (content, author_id, visibility)
      VALUES (v_story, v_d.owner_id, 'private'::public.content_visibility) RETURNING id INTO v_sid;
      INSERT INTO public.story_points (story_id, point_id, author_id) VALUES (v_sid, v_pid, v_d.owner_id);
      v_new_stories := v_new_stories || v_sid;   -- the engine wrote it: a revision or discard may delete it
    ELSIF v_type IN ('move', 'keep', 'reword') THEN
      -- same words (another box, or a private copy of a public point), or a reword that carries no story of its own
      -- (a draft writes points only): the owner's private stories of the old point follow it. They are the owner's,
      -- not the engine's: never recorded in created_story_ids.
      INSERT INTO public.story_points (story_id, point_id, author_id)
      SELECT sp.story_id, v_pid, v_d.owner_id
        FROM public.story_points sp JOIN public.stories s ON s.id = sp.story_id
       WHERE sp.point_id = v_old AND s.author_id = v_d.owner_id AND s.visibility = 'private'::public.content_visibility;
    END IF;
    IF v_type = 'keep' THEN
      v_kept := v_kept + 1;
    ELSE
      v_made := v_made + 1;
    END IF;

    -- Link only to a HEAD (one successor per point), and only from a private point; anything else is a new point
    -- with no link.
    IF v_type IN ('reword', 'move') AND v_op.superseded_by IS NULL AND v_op.visibility = 'private'::public.content_visibility THEN
      v_links := v_links || jsonb_build_array(jsonb_build_object(
        'old', v_old, 'new', v_pid, 'relation', v_type,
        'why', COALESCE(NULLIF(left(v_a ->> 'why', 200), ''), CASE v_type WHEN 'reword' THEN 'reworded' ELSE 'moved' END)));
    END IF;
  END LOOP;

  -- 4: the draft's own record, then the reply, then the run
  UPDATE public.canvas_drafts d
     SET pending_links = v_links, questions = v_q, decided = COALESCE(p_decided, '[]'::jsonb),
         created_story_ids = v_new_stories
   WHERE d.id = v_d.id;
  PERFORM public._canvas_draft_post(v_d.conversation_id, v_d.thread_root_id, p_reply, v_run.derived_refs);
  UPDATE public.canvas_draft_runs r SET state = 'done', finished_at = now() WHERE r.id = p_run;
  SELECT pr.slug INTO v_slug FROM public.profiles pr WHERE pr.id = v_d.owner_id;
  RETURN jsonb_build_object(
    'status', 'ok', 'points', v_kept + v_made, 'kept', v_kept, 'created', v_made,
    'links', jsonb_array_length(v_links), 'version', v_dver,
    'canvas_path', '/p/' || COALESCE(v_slug, v_d.owner_id::text) || '/canvas/' || v_cname || '?v=' || v_dver);
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_run_complete(uuid, jsonb, jsonb, jsonb, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_run_complete(uuid, jsonb, jsonb, jsonb, text, numeric) TO service_role;

COMMIT;
