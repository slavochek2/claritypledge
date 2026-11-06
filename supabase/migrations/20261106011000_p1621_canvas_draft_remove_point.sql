-- P1621 round 2: the owner removes one point from their open draft (canvas_draft_remove_point), no confirmation, no model call, no run.
--
-- diffed against: 20261106000000_p1621_canvas_draft_add_point.sql (canvas_draft_add_point): the same verified check, per-owner advisory lock, expire step, owner check
--   FOR UPDATE, state check, busy code, revision check, Undo-step delete, revision bump, grants. _canvas_draft_refuse takes any code text, so the new code not_found
--   needs no change to it.
-- client-safe: one NEW authenticated-only RPC. No table, column, existing function, grant or answer key changes.
--
-- What "remove" means: it does exactly what the agent's omission does (20261030080000_p1536_v6_engine.sql, the UPDATE of public.points that array_removes the
--   draft's tag, "every point of a scoped box that no keep named leaves the draft"): the draft's own tag `canvas_<version>` leaves the point, nothing else.
--   * A point of a published version keeps that version's tag and stays there.
--   * A point only this draft made loses its last canvas tag; its ledger row stays, and _canvas_draft_cleanup_ledger (run at Publish and at Discard) deletes every
--     ledger point with no canvas_ tag left. No new rule: no points row is deleted here.
--   * The owner's private stories linked to the point (story_points) and the owner's stance rows are not touched: a story stays stored with no link to the card.
--   * The draft's Undo steps are deleted as add_point does: an undo would restore a snapshot from before this removal.
--
-- Contract: canvas_draft_remove_point(draft, point, expected_revision) -> jsonb.
--   Order: verified caller, owner lock, expire, owner check (42501); state open else stale_view; busy; revision mismatch -> stale_view; the point is not on this draft
--   -> code not_found (nothing written). Then the tag leaves the point, Undo steps deleted, revision + 1 -> {status: ok, revision}.
--   Repeat after a lost answer: the point is already gone, so it answers not_found (or stale_view when the revision moved); the client re-reads and treats "point
--   absent" as done.

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
  -- the agent's own omission: only the draft's tag leaves the point (keep_updated_at as the engine sets it, so the point's date does not move)
  PERFORM set_config('p1536.keep_updated_at', 'on', true);
  UPDATE public.points p SET system_tags = array_remove(p.system_tags, v_tag) WHERE p.id = p_point;
  PERFORM set_config('p1536.keep_updated_at', 'off', true);

  -- an undo restores a snapshot from before this removal: close it for every earlier run
  DELETE FROM public.canvas_draft_steps s WHERE s.draft_id = v_d.id;

  UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id RETURNING d.revision INTO v_rev;
  RETURN jsonb_build_object('status', 'ok', 'revision', v_rev);
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_remove_point(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_remove_point(uuid, uuid, integer) TO authenticated;
