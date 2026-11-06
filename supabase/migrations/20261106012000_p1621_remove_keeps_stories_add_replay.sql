-- P1621 review round 1: (F1) a run-created story on a removed card stays stored; (F2) an add replay never reports a removed card as present.
--
-- diffed against: 20261106011000_p1621_canvas_draft_remove_point.sql (canvas_draft_remove_point) and 20261106000000_p1621_canvas_draft_add_point.sql
--   (canvas_draft_add_point): both bodies, signatures, grants, refusals and answer keys unchanged except for the one added statement in each, marked below.
-- client-safe: CREATE OR REPLACE of two authenticated-only RPCs with the same signatures and answer keys; add_point can now also answer the existing code not_found
--   (a code the client already types, added with remove). No table, column or grant changes.
--
-- F1. A point a RUN made can carry a private story the run wrote: its id sits in canvas_draft_points.story_ids, and _canvas_draft_cleanup_ledger (Publish and Discard)
--   deletes a ledger story that has no story_points left. Removing the card leaves that story linked only to a draft-only point; Publish or Discard then deleted the
--   point, story_points cascaded, and the cleanup deleted the story. Spec Founder Review item 6 (and P1614) says a private story on a removed card stays stored with no
--   link. P1614's restore branch moved the link onto a surviving point; a removal has none, so instead the story leaves the ledger: story_ids of the removed point's
--   ledger row is emptied, and the cleanup (which deletes only ledger stories) no longer names it. The story is the owner's own and private; it stays stored, unlinked.
--   Owner stance rows (point_positions) need no such treatment: the agent's omission does not keep them either, they cascade with the point row at Publish or Discard,
--   and nothing in P1614 or the spec promises a stance on a removed card (P1614 restore keeps the ORIGINAL point's own stance, which a removal does not touch).
--
-- F2. add_point's replay answered {ok, changed:false, point_id} for any ledger row with the client id, also after the owner removed that card. A late retry of the
--   original save would then report a card the owner removed as present (the editor shows it saved, the card is not on the draft). Chosen: when the ledger row's point
--   is no longer on the draft the replay answers the refusal not_found and writes nothing. Not "fall through to a normal add": that would bring back a card the owner
--   deliberately removed (and the unique (draft_id, client_id) index would refuse the insert anyway). The client keeps the typed text on a refusal.

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

  -- F1 (added): a story a run wrote for this card leaves the ledger, so Publish and Discard no longer delete it as "unlinked"
  UPDATE public.canvas_draft_points cp SET story_ids = '{}' WHERE cp.draft_id = v_d.id AND cp.point_id = p_point;

  -- an undo restores a snapshot from before this removal: close it for every earlier run
  DELETE FROM public.canvas_draft_steps s WHERE s.draft_id = v_d.id;

  UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id RETURNING d.revision INTO v_rev;
  RETURN jsonb_build_object('status', 'ok', 'revision', v_rev);
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_remove_point(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_remove_point(uuid, uuid, integer) TO authenticated;

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
    -- F2 (added): only while the card is still on the draft; a card the owner removed since is not reported as present
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

  UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id RETURNING d.revision INTO v_rev;
  RETURN jsonb_build_object('status', 'ok', 'changed', true, 'point_id', v_pid, 'revision', v_rev);
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_add_point(uuid, text, text, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_add_point(uuid, text, text, integer, uuid) TO authenticated;
