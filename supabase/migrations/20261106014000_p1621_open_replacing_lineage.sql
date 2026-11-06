-- P1621 review round 3: canvas_draft_open_replacing resumes only the draft it opened (lineage), and its header says what it does.
--
-- diffed against: 20261106013000_p1621_canvas_draft_open_replacing.sql (canvas_draft_open_replacing: signature, grants, answer keys and every refusal unchanged except the
--   resume rule, the half-done rule and one added owner check, each marked below).
-- client-safe: one NULLABLE column canvas_drafts.replaced_draft_id (no default, not in the owner's column grant, so no client reads it; every existing function reads
--   canvas_drafts by named columns or `d.*` into a row variable, which a new column does not change) and CREATE OR REPLACE of one authenticated-only RPC with the same
--   signature and answer keys.
--
-- R1. The resume branch returned ANY open draft started from the same version once the replaced draft was discarded, so a stale call could hand back a draft some
--   other flow had opened (and worked in). Chosen: LINEAGE, not a timestamp or a revision test. open_replacing writes canvas_drafts.replaced_draft_id on the draft it
--   opens, and a repeat resumes only when the open draft's replaced_draft_id equals the draft being replaced. A timestamp test passes a draft opened elsewhere just
--   after the discard, and a revision test refuses the real resume once the owner has begun work in it; lineage is exact for both. Any other open draft -> stale_view.
--   The half-done state (the replaced draft discarded, nothing open) is tightened the same way: it opens a fresh draft only when no other draft of the canvas was created
--   after the replaced one; otherwise stale_view.
-- R3. The busy check is `_canvas_draft_busy_code(uid, draft, false)`, the argument canvas_draft_open and canvas_draft_discard use (this opens no run, so a run on another
--   canvas does not block it); canvas_workspace_send's replace branch uses `true` because it starts a run. The previous header said "exactly as" send: corrected here.
--   Version owner: every canvas_versions insert in the migrations takes the canvas owner (20261022170000:47,58; 20261029100000:305,960; 20261030080000:832), and a
--   canvas's owner cannot change (20261029100000:168). The function now also checks the canvas row's owner_id directly instead of relying on that.

ALTER TABLE public.canvas_drafts ADD COLUMN IF NOT EXISTS replaced_draft_id uuid REFERENCES public.canvas_drafts(id) ON DELETE SET NULL;

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
  SELECT c.* INTO v_canvas FROM public.canvases c WHERE c.id = v_base.canvas_id AND c.owner_id = v_uid FOR UPDATE;   -- R3: the canvas owner, checked directly
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;

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
    ELSIF v_gone AND v_open.replaced_draft_id IS NOT DISTINCT FROM p_replace_draft AND v_open.base_version_id IS NOT DISTINCT FROM p_from_version THEN
      -- R1: a repeat after a lost answer: the open draft IS the one this call's first run opened (lineage), not just any draft from this version
      RETURN jsonb_build_object(
        'status', 'opened', 'resumed', true, 'draft_id', v_open.id, 'conversation_id', v_open.conversation_id,
        'thread_root_id', v_open.thread_root_id, 'canvas_name', v_canvas.name, 'version_name', v_open.version_name,
        'from_seq', v_base.published_seq);
    ELSE
      RETURN public._canvas_draft_refuse('stale_view', v_open.id);
    END IF;
  ELSIF NOT v_gone THEN
    RETURN public._canvas_draft_refuse('stale_view', NULL);
  ELSIF EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.canvas_id = v_canvas.id AND d.id <> v_old.id AND d.created_at > v_old.created_at) THEN
    -- R1: nothing open, the replaced draft was discarded, but another draft was made on this canvas after it: this call is not the half-done flow
    RETURN public._canvas_draft_refuse('stale_view', NULL);
  END IF;

  IF (SELECT count(*) FROM public.canvas_drafts d WHERE d.owner_id = v_uid AND d.state = 'open') >= c_max_open THEN
    RAISE EXCEPTION 'too many open drafts' USING ERRCODE = '54000';
  END IF;
  v_d := public._canvas_draft_new(v_uid, v_canvas.id, p_from_version, NULL, NULL);
  UPDATE public.canvas_drafts d SET replaced_draft_id = p_replace_draft WHERE d.id = v_d.id;   -- R1: the lineage a repeat resumes by
  RETURN jsonb_build_object(
    'status', 'opened', 'draft_id', v_d.id, 'conversation_id', v_d.conversation_id, 'thread_root_id', v_d.thread_root_id,
    'canvas_name', v_canvas.name, 'version_name', v_d.version_name, 'from_seq', v_base.published_seq);
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_open_replacing(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_open_replacing(uuid, uuid, integer) TO authenticated;
