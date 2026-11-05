-- P1621: the owner adds a point to a box of their open draft by hand (canvas_draft_add_point), with no model call and no run.
--
-- diffed against: 20261105160000_p1614_restore_keeps_stories.sql (canvas_draft_edit_point): the same verified check, per-owner advisory lock, expire step, owner check
--   FOR UPDATE, busy code, revision check, grants and answer keys. _canvas_draft_refuse takes any code text, so the two new refusal codes need no change to it.
-- client-safe: one NEW authenticated-only RPC and one NULLABLE column (canvas_draft_points.client_id) with a partial unique index; no existing function, grant or
--   answer key changes. Every INSERT into canvas_draft_points names its columns (checked by grep), so the new column defaults to NULL for all of them; the ledger
--   cleanup at Publish and Discard and the erase path read the ledger by draft_id and point_id only. An old client that never calls the new RPC is unaffected.
--
-- Contract: canvas_draft_add_point(draft, box, statement, expected_revision, client_id) -> jsonb.
--   Order: verified caller, owner lock, expire, owner check (42501); client id required (22023); REPLAY (a ledger row of this draft with this client id answers
--   {ok, changed:false, point_id, revision: current} with no write, before the state, busy and revision checks); state open else stale_view; busy; revision mismatch
--   -> stale_view; box one of the nine (22023); text trimmed 1..300 (22023); three points already in the box -> code box_full; the same trimmed words already in the
--   box -> code duplicate. Then a PRIVATE point (owner as first validator, no tags, system tags [box, canvas_<version>]), no stance row, a ledger row with no run and
--   the client id, the draft's Undo steps deleted (an undo would restore a snapshot from before this card), revision + 1.
--   The box count and the duplicate test run under the per-owner lock and the draft row lock, so simultaneous saves serialize and cannot pass 3.

ALTER TABLE public.canvas_draft_points ADD COLUMN IF NOT EXISTS client_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS canvas_draft_points_client_id_uq
  ON public.canvas_draft_points (draft_id, client_id) WHERE client_id IS NOT NULL;

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
    RETURN jsonb_build_object('status', 'ok', 'changed', false, 'point_id', v_old, 'revision', v_d.revision);
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
