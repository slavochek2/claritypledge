-- P1621 round 2: "Start over" on a clone's pending page discards the open draft and opens a fresh one from the same published version in ONE transaction
-- (canvas_draft_open_replacing).
--
-- diffed against: 20261102090100_p1536_b5_open_from_version.sql (canvas_draft_open: the verified check, per-owner advisory lock, one error for "no such version / not
--   yours / not published", canvas row lock, open-draft cap of 10, _canvas_draft_new construction, answer keys) and 20261030080000_p1536_v6_engine.sql
--   (canvas_workspace_send's replace branch and canvas_draft_discard: expire step, FOR UPDATE on the open draft, busy code, revision check, _canvas_draft_discard_inner).
-- client-safe: one NEW authenticated-only RPC; no existing function, table, column or grant changes. canvas_draft_open and canvas_draft_discard are untouched.
--
-- Why: the client did discardCanvasDraft, then openCanvasDraft, as two calls. If the open failed after the discard landed, the old draft was gone, and every retry
-- of the discard answered stale_view for good. Here the discard and the open commit or roll back together.
--
-- Contract: canvas_draft_open_replacing(p_from_version, p_replace_draft, p_replace_revision) -> jsonb, the answer keys of canvas_draft_open's 'opened' answer
--   (status, draft_id, conversation_id, thread_root_id, canvas_name, version_name, from_seq; `resumed: true` on a repeat). Refusals are returned, not raised, with
--   the same shape as every draft refusal (status 'refused', code, revision):
--   Order: verified caller (42501); owner lock; expire; the version is the caller's and published, else one error 42501; canvas row lock; then the canvas's open draft:
--     * it is the draft to replace: busy code (a run going) -> busy; revision differs -> stale_view; both refuse with NOTHING discarded. Else it is discarded
--       (_canvas_draft_discard_inner, exactly as the replace branch of canvas_workspace_send) and a fresh draft is opened from the version, after the open-draft cap.
--     * it is ANOTHER draft: a repeat after a lost answer when it was started from this version and the draft to replace is a discarded draft of this canvas
--       -> that open draft is returned (resumed), nothing written; anything else -> stale_view (the screen is behind).
--   no open draft on the canvas: when the draft to replace is a discarded draft of this canvas (the half-done state the old two-step flow could leave), a fresh draft
--     is opened; otherwise stale_view (it is gone some other way: published, or never this canvas's).

CREATE OR REPLACE FUNCTION public.canvas_draft_open_replacing(
  p_from_version uuid, p_replace_draft uuid, p_replace_revision integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_open CONSTANT integer := 10;
  v_uid    uuid := auth.uid();
  v_base   public.canvas_versions;
  v_canvas public.canvases;
  v_open   public.canvas_drafts;
  v_old    public.canvas_drafts;
  v_d      public.canvas_drafts;
  v_code   text;
  v_gone   boolean;
BEGIN
  PERFORM public._canvas_draft_require_verified(v_uid);
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));
  PERFORM public._canvas_draft_expire(v_uid);
  IF p_from_version IS NULL OR p_replace_draft IS NULL THEN
    RAISE EXCEPTION 'canvas draft: a version and a draft to replace are required' USING ERRCODE = '22023';
  END IF;

  -- one error for "no such version", "not yours" and "not published": ids cannot be probed
  SELECT v.* INTO v_base FROM public.canvas_versions v
   WHERE v.id = p_from_version AND v.owner_id = v_uid AND v.published_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  SELECT c.* INTO v_canvas FROM public.canvases c WHERE c.id = v_base.canvas_id FOR UPDATE;

  -- the draft to replace: the caller's, on this canvas (the same error as a missing one, so a foreign id is not told apart)
  SELECT d.* INTO v_old FROM public.canvas_drafts d WHERE d.id = p_replace_draft AND d.owner_id = v_uid AND d.canvas_id = v_canvas.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  v_gone := v_old.state = 'discarded';

  SELECT d.* INTO v_open FROM public.canvas_drafts d WHERE d.canvas_id = v_canvas.id AND d.state = 'open' FOR UPDATE;
  IF FOUND THEN
    IF v_open.id = p_replace_draft THEN
      v_code := public._canvas_draft_busy_code(v_uid, v_open.id, false);
      IF v_code IS NOT NULL THEN
        RETURN public._canvas_draft_refuse(v_code, v_open.id);
      END IF;
      IF p_replace_revision IS DISTINCT FROM v_open.revision THEN
        RETURN public._canvas_draft_refuse('stale_view', v_open.id);
      END IF;
      PERFORM public._canvas_draft_discard_inner(v_open.id);
    ELSIF v_gone AND v_open.base_version_id IS NOT DISTINCT FROM p_from_version THEN
      -- a repeat after a lost answer: the replacement already exists
      RETURN jsonb_build_object(
        'status', 'opened', 'resumed', true, 'draft_id', v_open.id, 'conversation_id', v_open.conversation_id,
        'thread_root_id', v_open.thread_root_id, 'canvas_name', v_canvas.name, 'version_name', v_open.version_name,
        'from_seq', v_base.published_seq);
    ELSE
      RETURN public._canvas_draft_refuse('stale_view', v_open.id);
    END IF;
  ELSIF NOT v_gone THEN
    RETURN public._canvas_draft_refuse('stale_view', NULL);
  END IF;

  IF (SELECT count(*) FROM public.canvas_drafts d WHERE d.owner_id = v_uid AND d.state = 'open') >= c_max_open THEN
    RAISE EXCEPTION 'too many open drafts' USING ERRCODE = '54000';
  END IF;
  v_d := public._canvas_draft_new(v_uid, v_canvas.id, p_from_version, NULL, NULL);
  RETURN jsonb_build_object(
    'status', 'opened', 'draft_id', v_d.id, 'conversation_id', v_d.conversation_id, 'thread_root_id', v_d.thread_root_id,
    'canvas_name', v_canvas.name, 'version_name', v_d.version_name, 'from_seq', v_base.published_seq);
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_open_replacing(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_open_replacing(uuid, uuid, integer) TO authenticated;
