-- P1536 3c B5: a draft opened from a published version starts as that version.
-- diffed against: 20261029100000_p1536_canvas_draft_versions.sql
-- client-safe: same signature and JSON response; deployed clients read the same keys, and a draft from a version now holds its points.
--
-- canvas_draft_open(p_from_version) is the opener the paperclip's Canvases tab (useStartCanvas) still reaches. Its body is the one
-- from 20261029100000: it built the draft inline and put NO base point into it, so a draft opened from a version with points held none
-- of them and read "Empty" and "Changed" in every box. The v6 engine's _canvas_draft_new (20261030080000) does start the draft as its
-- base (same point ids, legacy public points carried as private copies, the focus of the draft that published the base), and v6 did not
-- restate the opener, so the opener kept its own inline construction.
--
-- This replaces ONLY the opener's construction with _canvas_draft_new / _canvas_draft_new_canvas. Everything around it is the earlier
-- body unchanged: the verified-profile check, the per-owner advisory lock, the one error for "no such version", "not yours" and "not
-- published", the 'open_elsewhere' answer, the continued untouched new-canvas draft, the open-draft cap, the JSON response, the grants.
-- What changes for a caller: a draft from a version now holds the version's points (no box Changed), and carries the inherited focus.
-- A new canvas (p_from_version NULL) is still empty. It opens no run and writes no message into the thread, as before.
--
-- Pinned by src/tests/p1536-b5-open-from-version-migration.test.ts (source contract) and
-- src/tests/integration/p1536-b5-open-from-version.test.ts (behaviour, on the test database).

CREATE OR REPLACE FUNCTION public.canvas_draft_open(p_from_version uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_open CONSTANT integer := 10;
  v_uid    uuid := auth.uid();
  v_base   public.canvas_versions;
  v_canvas public.canvases;
  v_open   public.canvas_drafts;
  v_d      public.canvas_drafts;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = v_uid AND pr.is_verified = true) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));

  IF p_from_version IS NOT NULL THEN
    -- one error for "no such version", "not yours" and "not published": ids cannot be probed
    SELECT v.* INTO v_base FROM public.canvas_versions v
     WHERE v.id = p_from_version AND v.owner_id = v_uid AND v.published_at IS NOT NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
    END IF;
    SELECT c.* INTO v_canvas FROM public.canvases c WHERE c.id = v_base.canvas_id FOR UPDATE;
    SELECT d.* INTO v_open FROM public.canvas_drafts d WHERE d.canvas_id = v_canvas.id AND d.state = 'open';
    IF FOUND THEN
      RETURN jsonb_build_object(
        'status', 'open_elsewhere', 'draft_id', v_open.id, 'conversation_id', v_open.conversation_id,
        'thread_root_id', v_open.thread_root_id, 'canvas_name', v_canvas.name,
        'from_seq', (SELECT b.published_seq FROM public.canvas_versions b WHERE b.id = v_open.base_version_id));
    END IF;
  END IF;

  -- A new canvas while an UNTOUCHED new-canvas draft is open (no run, no material, no message in its thread, root
  -- still there): that draft is continued, not a second one started. It does not count against the cap.
  IF p_from_version IS NULL THEN
    SELECT d.* INTO v_open FROM public.canvas_drafts d
     WHERE d.owner_id = v_uid AND d.state = 'open' AND d.base_version_id IS NULL AND d.run_count = 0 AND d.tension_count = 0
       AND NOT EXISTS (SELECT 1 FROM public.canvas_draft_runs r WHERE r.draft_id = d.id)
       AND NOT EXISTS (SELECT 1 FROM public.canvas_draft_material m WHERE m.draft_id = d.id)
       AND NOT EXISTS (SELECT 1 FROM public.chat_messages t WHERE t.thread_root_id = d.thread_root_id AND t.deleted_at IS NULL)
       AND EXISTS (SELECT 1 FROM public.chat_messages t WHERE t.id = d.thread_root_id AND t.deleted_at IS NULL)
     ORDER BY d.created_at DESC LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'status', 'opened', 'resumed', true, 'draft_id', v_open.id, 'conversation_id', v_open.conversation_id,
        'thread_root_id', v_open.thread_root_id,
        'canvas_name', (SELECT c.name FROM public.canvases c WHERE c.id = v_open.canvas_id),
        'version_name', (SELECT v.name FROM public.canvas_versions v WHERE v.id = v_open.version_id),
        'from_seq', NULL);
    END IF;
  END IF;

  IF (SELECT count(*) FROM public.canvas_drafts d WHERE d.owner_id = v_uid AND d.state = 'open') >= c_max_open THEN
    RAISE EXCEPTION 'too many open drafts' USING ERRCODE = '54000';
  END IF;

  -- The construction is the engine's: a new canvas with an automatic address (canvas, canvas_2, ...), then the draft, which starts as
  -- its base (the base's private points take the draft's tag, same ids; a legacy public base point is carried as a private copy).
  IF p_from_version IS NULL THEN
    v_canvas := public._canvas_draft_new_canvas(v_uid);
  END IF;
  v_d := public._canvas_draft_new(v_uid, v_canvas.id, p_from_version, NULL, NULL);

  RETURN jsonb_build_object(
    'status', 'opened', 'draft_id', v_d.id, 'conversation_id', v_d.conversation_id, 'thread_root_id', v_d.thread_root_id,
    'canvas_name', v_canvas.name, 'version_name', v_d.version_name,
    'from_seq', (SELECT b.published_seq FROM public.canvas_versions b WHERE b.id = p_from_version));
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_open(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_open(uuid) TO authenticated;
