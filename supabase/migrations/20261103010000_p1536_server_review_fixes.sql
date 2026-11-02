-- P1536 server review batch (Opus, Gemini and Codex on 1af491639): the database half.
--
-- diffed against: 20261103000000_p1536_nothing_changed_wording.sql (_canvas_draft_run_complete, the 10-argument function) and 20261030080000_p1536_v6_engine.sql
--   (_canvas_draft_run_begin, the 4-argument form that starts a run by its id; canvas_draft_retry; canvas_draft_undo) and 20261030090000_p1536_p1592_merge_erase_forward.sql
--   (erase_chat_data_for). Each body is the earlier one with exactly the edits listed per function below; signature, SECURITY DEFINER, search_path, every guard and
--   every answer key are unchanged. Two helpers are new (-- new function): _canvas_draft_merge_offers and _canvas_draft_other_names.
--   src/tests/p1536-sr-migration.test.ts rebuilds each body from the earlier one with those edits and fails on any other difference.
-- client-safe: no table, column, signature or grant changes on a function a client calls (canvas_draft_retry and canvas_draft_undo keep their signatures and grants).
--   The two helpers and every worker function are closed to the client roles, as before. What a client can see change: a retried upload keeps its file line (a retry
--   now begins when the upload's text was kept), the J9 line also leads the reply of a SCOPED upload or message (it was written by the engine, now by the database
--   from the offers it inserted), a run that changed no point is no longer an Undo step, and an open offer that matches a first draft's focus becomes that focus
--   instead of staying beside it. A client that reads replies as plain text, and offers and steps through get_canvas_draft_state, is unaffected.
--
-- Supersedes two statements of 20261103000000, which stays as applied and was true when written: its header says the function has "exactly one changed line" and that "the
-- only visible effect is the text of a thread reply", and its rollback says to re-run the v6 definition. After this file the function also carries the J9 exception for
-- an empty scope, and the rollback is: re-run 20261103000000's definition of this function (and the v6 definitions of the other functions). Offers already written stay.
--
-- 1. _canvas_draft_run_complete
--    a. J9 on every path (Gemini 1): the J9 line is built here for EVERY non-first message run, scoped or not, from the offers actually inserted (after this function's
--       own merge, so "The Agencies" against an existing "Agencies" is never said) and the focus in force. The engine's reply no longer carries it. Words are the
--       engine's old ones: "Your new file | voice note | message is also about A and B. This canvas stays about F." A NULL reply text no longer makes the line NULL.
--    b. one merge (Gemini 6): step 5's loop and the upload exception's copy of it are one helper, _canvas_draft_merge_offers.
--    c. an idle run (Gemini 2): a later message whose scope is not empty but which added, reworded, moved or removed no point makes NO Undo step and moves no question
--       or link; its reply (when none is given) is "Nothing changed on the canvas." Its offers are still recorded, and are not tied to an Undo (there is none).
--       The first draft, a focus switch and a fork's first run are never idle.
--    d. the first draft's focus (Opus 2): an OFFERED row that matches the group a first draft takes as its focus becomes `focused`, so the same business is not shown as
--       an offer beside the canvas that is about it. Undo of that run gives the row back (canvas_draft_undo, below).
-- 2. _canvas_draft_run_begin(uuid, uuid, boolean, text)
--    a. a retried upload (Opus 1): input_kind 'file' with no bytes is ready when the upload's text was kept for the trigger message (the retry already requires it).
--    b. a fork's first run (Opus 5): other_names also holds the people named in the SOURCE draft's copies, read live, never stored in the fork and never sent to the model, so the
--       names filter still refuses them. After the person is erased the copies carry "Deleted user" and the name is no longer found.
-- 3. canvas_draft_retry (Opus 1): the retry keeps the original input_kind ('file' as well as 'voice').
-- 4. canvas_draft_undo (Opus 2): any `focused` offer that is not the focus the step restores goes back to `offered`.
-- 5. erase_chat_data_for (Opus 8, S5.8): the offers a run made while reading the erased person's words: an open offer is deleted, any other keeps its label and loses its
--    reason (the same class of model output as the tensions and decided notes, which step 8 already clears); each such draft's revision moves. A CLOSED draft whose last open
--    offer this deletes keeps its material until its own 30-day expiry (settlement is not run from here: it locks material rows, and erasure's lock order is not to be widened).
-- Not changed here, with the reason: the label's shape and the quoting of every stored label into the prompt are the engine's (canvas-extras.ts, canvas-prompt.ts): a label is data.

-- ============================================================================
-- Helpers (internal: no client role may execute either; the SECURITY DEFINER functions below call them as their owner)
-- ============================================================================
-- _canvas_draft_merge_offers: the ONE offer merge. A group matching the focus or any existing offer (in any state) is ignored, at most 3 offers stay open, and the
-- rows made by one run keep the model's order. Returns the ids of the rows inserted. Caller holds the owner lock and the draft row.
CREATE OR REPLACE FUNCTION public._canvas_draft_merge_offers(p_draft uuid, p_run uuid, p_focus text, p_offers jsonb)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_el     jsonb;
  v_label  text;
  v_why    text;
  v_open   integer;
  v_oid    uuid;
  v_new    uuid[] := '{}';
BEGIN
  FOR v_el IN SELECT e FROM jsonb_array_elements(COALESCE(p_offers, '[]'::jsonb)) e LOOP
    v_label := CASE jsonb_typeof(v_el)
                 WHEN 'string' THEN v_el #>> '{}'
                 WHEN 'object' THEN COALESCE(v_el ->> 'group_label', v_el ->> 'group', v_el ->> 'label')
               END;
    v_why := CASE WHEN jsonb_typeof(v_el) = 'object' THEN NULLIF(left(btrim(COALESCE(v_el ->> 'why', '')), 400), '') END;
    v_label := NULLIF(left(btrim(COALESCE(v_label, '')), 120), '');
    CONTINUE WHEN v_label IS NULL;
    CONTINUE WHEN p_focus IS NOT NULL AND public._canvas_offer_key(v_label) = public._canvas_offer_key(p_focus);
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.canvas_draft_offers o
       WHERE o.draft_id = p_draft AND public._canvas_offer_key(o.group_label) = public._canvas_offer_key(v_label));
    SELECT count(*) INTO v_open FROM public.canvas_draft_offers o WHERE o.draft_id = p_draft AND o.state = 'offered';
    CONTINUE WHEN v_open >= 3;
    -- clock_timestamp(): offers made by one run keep the model's order
    INSERT INTO public.canvas_draft_offers (draft_id, group_label, why, state, created_run_id, created_at)
    VALUES (p_draft, v_label, v_why, 'offered', p_run, clock_timestamp()) RETURNING id INTO v_oid;
    v_new := v_new || v_oid;
  END LOOP;
  RETURN v_new;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_merge_offers(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

-- _canvas_draft_other_names: the other people named in the given copies (forward / clarify messages): the author of each, the authors of the lines of a copied thread
-- and a copied conversation's title. A point, story or label that contains one is dropped by the engine. Exactly the query _canvas_draft_run_begin ran inline.
CREATE OR REPLACE FUNCTION public._canvas_draft_other_names(p_ids uuid[], p_owner uuid, p_ref text, p_full text)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_names text[] := '{}';
BEGIN
  SELECT COALESCE(array_agg(DISTINCT q.n), '{}') INTO v_names FROM (
    SELECT btrim(t.forward_snapshot ->> 'author_name') AS n
      FROM public.chat_messages t
     WHERE t.id = ANY (p_ids) AND t.deleted_at IS NULL AND t.forward_snapshot IS NOT NULL
       AND t.forward_author_id IS DISTINCT FROM p_owner
    UNION
    SELECT btrim(x.entry ->> 'author_name')
      FROM public.chat_messages t, jsonb_array_elements(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) AS x(entry)
     WHERE t.id = ANY (p_ids) AND t.deleted_at IS NULL AND (x.entry ->> 'author_ref') IS DISTINCT FROM p_ref
    UNION
    SELECT btrim(t.forward_snapshot ->> 'conversation_title')
      FROM public.chat_messages t
     WHERE t.id = ANY (p_ids) AND t.deleted_at IS NULL AND t.forward_snapshot ? 'conversation_title_ref'
  ) q
  WHERE q.n IS NOT NULL AND q.n <> '' AND lower(q.n) <> 'deleted user' AND lower(q.n) <> lower(p_full);
  RETURN v_names;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_other_names(uuid[], uuid, text, text) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. _canvas_draft_run_begin(uuid, uuid, boolean, text)
-- ============================================================================

CREATE OR REPLACE FUNCTION public._canvas_draft_run_begin(p_run uuid, p_owner uuid, p_has_file boolean DEFAULT false, p_cap_reply text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_chars CONSTANT integer := 150000;
  c_rows  CONSTANT integer := 500;
  v_run     public.canvas_draft_runs;
  v_d       public.canvas_drafts;
  v_canvas  public.canvases;
  v_base    public.canvas_versions;
  v_trig    public.chat_messages;
  v_lim     jsonb := public._mirror_limits();
  v_in      jsonb;
  v_max     numeric;
  v_spend   uuid;
  v_ids     uuid[];
  v_locked  uuid[];
  v_refs    text[];
  v_ref     text;
  v_boxes   text[] := public._canvas_box_tags();
  v_dtag    text;
  v_slug    text;
  v_first   text;
  v_full    text;
  v_names   text[] := '{}';
  v_thread  jsonb := '[]'::jsonb;
  v_material jsonb;
  v_points  jsonb;
  v_offers  jsonb;
  v_target  public.canvas_draft_offers;
  v_pre     uuid[];
BEGIN
  IF p_run IS NULL OR p_owner IS NULL THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run;
  IF NOT FOUND OR v_run.owner_id IS DISTINCT FROM p_owner THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_run.owner_id::text, 0));
  PERFORM public._canvas_draft_expire(v_run.owner_id);
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = v_run.draft_id FOR UPDATE;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run FOR UPDATE;

  IF v_run.state = 'running' THEN
    RETURN jsonb_build_object('status', 'running', 'run_id', v_run.id);
  END IF;
  IF v_run.state <> 'queued' OR v_run.kind NOT IN ('message', 'focus', 'fork_first') THEN
    RETURN jsonb_build_object('status', 'gone', 'state', v_run.state, 'error_code', v_run.error_code);
  END IF;
  IF v_d.state <> 'open' THEN
    UPDATE public.canvas_draft_runs r SET state = 'failed', error_code = 'draft_closed', finished_at = now() WHERE r.id = v_run.id;
    UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id;
    RETURN jsonb_build_object('status', 'gone', 'state', 'failed', 'error_code', 'draft_closed');
  END IF;

  IF v_run.trigger_message_id IS NOT NULL THEN
    SELECT m.* INTO v_trig FROM public.chat_messages m WHERE m.id = v_run.trigger_message_id;
  END IF;

  -- readiness
  IF v_run.input_kind = 'voice' THEN
    IF v_trig.id IS NULL OR v_trig.deleted_at IS NOT NULL OR v_trig.transcript_status = 'failed'
       OR (v_trig.transcript_status = 'done' AND btrim(COALESCE(v_trig.transcript, '')) = '') THEN
      UPDATE public.canvas_draft_runs r SET state = 'failed', error_code = 'transcript_failed', finished_at = now() WHERE r.id = v_run.id;
      UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id;
      RETURN jsonb_build_object('status', 'gone', 'state', 'failed', 'error_code', 'transcript_failed');
    END IF;
    IF v_trig.transcript_status IS DISTINCT FROM 'done' THEN
      RETURN jsonb_build_object('status', 'not_ready', 'run_id', v_run.id, 'reason', 'transcript_pending');
    END IF;
  -- (server review, Opus 1) a retried upload brings no bytes: it is ready when the upload's text was kept for the trigger message, as canvas_draft_retry requires
  ELSIF v_run.input_kind = 'file' AND NOT COALESCE(p_has_file, false)
        AND NOT EXISTS (SELECT 1 FROM public.canvas_draft_material x WHERE x.draft_id = v_d.id AND x.message_id = v_run.trigger_message_id) THEN
    RETURN jsonb_build_object('status', 'not_ready', 'run_id', v_run.id, 'reason', 'file_missing');
  END IF;
  IF v_run.kind = 'message' AND (v_trig.id IS NULL OR v_trig.deleted_at IS NOT NULL) THEN
    UPDATE public.canvas_draft_runs r SET state = 'failed', error_code = 'message_gone', finished_at = now() WHERE r.id = v_run.id;
    UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id;
    RETURN jsonb_build_object('status', 'gone', 'state', 'failed', 'error_code', 'message_gone');
  END IF;
  IF v_run.kind = 'focus' THEN
    SELECT o.* INTO v_target FROM public.canvas_draft_offers o WHERE o.id = v_run.target_offer_id AND o.draft_id = v_d.id;
  END IF;

  SELECT c.* INTO v_canvas FROM public.canvases c WHERE c.id = v_d.canvas_id;
  v_dtag := 'canvas_' || v_d.version_name;
  IF v_d.base_version_id IS NOT NULL THEN
    SELECT v.* INTO v_base FROM public.canvas_versions v WHERE v.id = v_d.base_version_id;
  END IF;
  SELECT pr.slug, split_part(COALESCE(pr.name, ''), ' ', 1), COALESCE(pr.name, '')
    INTO v_slug, v_first, v_full FROM public.profiles pr WHERE pr.id = v_run.owner_id;
  v_ref := public._chat_author_ref(v_run.owner_id);

  -- THE selector. Messages and copies are read newest first within the offer bound; the trigger message is always
  -- read (context fitting never drops it).
  v_in := public._canvas_draft_effective_input(v_d.id, v_run.id);
  v_ids := ARRAY(
    SELECT s.id FROM (
      SELECT x.id, sum(public._mirror_row_chars(x)) OVER (ORDER BY x.created_at DESC, x.id DESC
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
        FROM public.chat_messages x
       WHERE x.id IN (SELECT jsonb_array_elements_text(v_in -> 'message_ids')::uuid
                       UNION SELECT jsonb_array_elements_text(v_in -> 'copy_ids')::uuid)
         AND x.id IS DISTINCT FROM v_run.trigger_message_id
       ORDER BY x.created_at DESC, x.id DESC LIMIT c_rows) s
     WHERE COALESCE(s.before, 0) < c_chars);
  IF v_run.trigger_message_id IS NOT NULL THEN
    v_ids := v_ids || v_run.trigger_message_id;
  END IF;
  -- One lock pass, FOR SHARE SKIP LOCKED, then the context lock shared and only TRIED, exactly as _mirror_begin_job
  -- does (deadlock-free against erase_chat_data_for's phased locks).
  SELECT COALESCE(array_agg(q.id), '{}') INTO v_locked FROM (
    SELECT m.id FROM public.chat_messages m WHERE m.id = ANY (v_ids) ORDER BY m.created_at, m.id FOR SHARE SKIP LOCKED) q;
  IF v_run.trigger_message_id IS NOT NULL AND NOT (v_run.trigger_message_id = ANY (v_locked)) THEN
    RETURN jsonb_build_object('status', 'busy', 'run_id', v_run.id);
  END IF;
  v_ids := ARRAY(SELECT u FROM unnest(v_ids) u WHERE u = ANY (v_locked));
  IF NOT pg_try_advisory_xact_lock_shared(hashtext('p1520_mirror_context')) THEN
    RETURN jsonb_build_object('status', 'busy', 'run_id', v_run.id);
  END IF;

  SELECT COALESCE(jsonb_agg(it.item ORDER BY it.at, it.id, it.part), '[]'::jsonb) INTO v_thread FROM (
    SELECT t.id, t.created_at AS at, 0 AS part,
           jsonb_build_object('kind', 'owner_message', 'message_id', t.id,
                              'text', COALESCE(NULLIF(btrim(COALESCE(t.body, '')), ''), t.transcript),
                              'voice', t.audio_duration_ms IS NOT NULL,
                              'box_refs', to_jsonb(t.box_refs),
                              'is_trigger', t.id = v_run.trigger_message_id) AS item
      FROM public.chat_messages t
     WHERE t.id = ANY (v_ids) AND t.kind = 'message' AND t.deleted_at IS NULL
       AND NULLIF(btrim(COALESCE(NULLIF(btrim(COALESCE(t.body, '')), ''), t.transcript, '')), '') IS NOT NULL
    UNION ALL
    SELECT t.id, t.created_at, 1,
           jsonb_build_object(
             'kind', 'clarify_copy',
             'label', left(COALESCE(NULLIF(t.forward_snapshot ->> 'conversation_title', ''),
                                    NULLIF(t.forward_snapshot ->> 'author_name', ''), 'a copied chat'), 80),
             'lines', (
               SELECT COALESCE(jsonb_agg(l.line ORDER BY l.ord), '[]'::jsonb) FROM (
                 SELECT 0 AS ord,
                        jsonb_build_object('by', CASE WHEN t.forward_author_id = v_run.owner_id THEN 'owner' ELSE 'other' END,
                                           'text', t.forward_snapshot ->> 'body') AS line
                  WHERE NULLIF(btrim(COALESCE(t.forward_snapshot ->> 'body', '')), '') IS NOT NULL
                 UNION ALL
                 SELECT x.ord::integer,
                        jsonb_build_object('by', CASE WHEN x.entry ->> 'author_ref' = v_ref THEN 'owner' ELSE 'other' END,
                                           'text', x.entry ->> 'body')
                   FROM jsonb_array_elements(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) WITH ORDINALITY AS x(entry, ord)
                  WHERE NULLIF(btrim(COALESCE(x.entry ->> 'body', '')), '') IS NOT NULL
                    AND x.ord > jsonb_array_length(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) - 100
               ) l))
      FROM public.chat_messages t
     WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.kind IN ('forward', 'clarify') AND t.forward_snapshot IS NOT NULL
  ) it;

  -- the other people in those copies (a point, story or label that contains one of these names is dropped by the engine)
  v_names := public._canvas_draft_other_names(v_ids, v_run.owner_id, v_ref, v_full);
  -- (server review, Opus 5) a fork's first run has no copies in its own thread: the people named in the SOURCE draft's copies are still other people. Read live and
  -- never stored in the fork or sent to the model; once the person is erased the copy says "Deleted user" and the name is no longer found.
  IF v_run.kind = 'fork_first' AND v_d.source_draft_id IS NOT NULL THEN
    v_names := ARRAY(SELECT DISTINCT u FROM unnest(v_names || public._canvas_draft_other_names(
      ARRAY(SELECT jsonb_array_elements_text(public._canvas_draft_effective_input(v_d.source_draft_id, NULL) -> 'copy_ids')::uuid),
      v_run.owner_id, v_ref, v_full)) u);
  END IF;

  -- whose words are in it, from exactly the rows read (erasure provenance; see _mirror_begin_job)
  SELECT array_remove(array_agg(DISTINCT r.ref), NULL) INTO v_refs FROM (
    SELECT public._chat_author_ref(t.author_id) AS ref
      FROM public.chat_messages t WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.author_id IS NOT NULL
    UNION
    SELECT public._chat_author_ref(t.forward_author_id)
      FROM public.chat_messages t WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.forward_author_id IS NOT NULL
    UNION
    SELECT x.entry ->> 'author_ref'
      FROM public.chat_messages t, jsonb_array_elements(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) AS x(entry)
     WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL
    UNION
    SELECT t.forward_snapshot ->> 'conversation_title_ref'
      FROM public.chat_messages t
     WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.forward_snapshot ? 'conversation_title_ref'
  ) r;

  -- spend: the drafting price, plus the extraction price when this invocation carries the file
  v_max := (v_lim ->> 'canvas_max_usd')::numeric
           + CASE WHEN v_run.input_kind = 'file' AND COALESCE(p_has_file, false) THEN (v_lim ->> 'extract_max_usd')::numeric ELSE 0 END;
  v_spend := public._mirror_reserve(v_run.owner_id, 'canvas', v_max);
  IF v_spend IS NULL THEN
    UPDATE public.canvas_draft_runs r SET state = 'capped', error_code = 'cap', finished_at = now() WHERE r.id = v_run.id;
    UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id;
    IF NULLIF(btrim(COALESCE(p_cap_reply, '')), '') IS NOT NULL THEN
      PERFORM public._canvas_draft_post_reply(v_d.conversation_id, v_d.thread_root_id, p_cap_reply, '{}', v_run.id);
    END IF;
    RETURN jsonb_build_object('status', 'capped', 'run_id', v_run.id);
  END IF;

  UPDATE public.canvas_draft_runs r
     SET state = 'running', attempts = r.attempts + 1, spend_id = v_spend, derived_refs = COALESCE(v_refs, '{}'),
         started_at = now()
   WHERE r.id = v_run.id;
  UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id;

  v_pre := public._canvas_draft_point_ids(v_d.id);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'box', public._canvas_point_box(p.system_tags),
           'statement', p.statement,
           'story', (SELECT s.content FROM public.story_points sp JOIN public.stories s ON s.id = sp.story_id
                      WHERE sp.point_id = p.id AND s.author_id = v_run.owner_id ORDER BY s.created_at, s.id LIMIT 1),
           'other_positions', (SELECT count(*) FROM public.point_positions pp WHERE pp.point_id = p.id AND pp.user_id <> v_run.owner_id))
         ORDER BY p.created_at, p.id), '[]'::jsonb)
    INTO v_points FROM public.points p WHERE p.id = ANY (v_pre);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'label', m.label, 'text', m.text,
                                               'message_id', m.message_id, 'origin', m.origin)
                            ORDER BY m.created_at, m.id), '[]'::jsonb)
    INTO v_material FROM public.canvas_draft_material m
   WHERE m.id IN (SELECT jsonb_array_elements_text(v_in -> 'material_ids')::uuid);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', o.id, 'group_label', o.group_label, 'state', o.state)
                            ORDER BY o.created_at, o.id), '[]'::jsonb)
    INTO v_offers FROM public.canvas_draft_offers o WHERE o.draft_id = v_d.id;

  RETURN jsonb_build_object(
    'status', 'run', 'run_id', v_run.id, 'kind', v_run.kind, 'input_kind', v_run.input_kind,
    'reserved_usd', v_max,
    'canvas_path', '/p/' || COALESCE(v_slug, v_run.owner_id::text) || '/canvas/' || v_canvas.name || '?v=' || v_d.version_name,
    'base_label', CASE WHEN v_d.base_version_id IS NULL THEN NULL ELSE 'v' || v_base.published_seq END,
    -- the whole canvas is to be drafted: a fork's first run, or an untagged message on an empty draft with no focus yet
    'first_draft', (v_run.kind = 'fork_first'
                    OR (v_run.kind = 'message' AND cardinality(v_pre) = 0 AND v_d.base_version_id IS NULL
                        AND v_d.focus IS NULL AND v_trig.box_refs IS NULL)),
    'focus', v_d.focus,
    'target_group', v_target.group_label,
    'box_refs', to_jsonb(v_trig.box_refs),
    'trigger_message_id', v_run.trigger_message_id,
    'draft_points', v_points,
    'questions', v_d.questions,
    'offers', v_offers,
    'material', v_material,
    'thread', v_thread,
    'other_names', to_jsonb(v_names),
    'owner_first_name', NULLIF(v_first, ''), 'owner_name', NULLIF(v_full, ''),
    'canvas_name', v_canvas.name, 'version_name', v_d.version_name,
    'used_runs', public._canvas_draft_used_runs(v_d.id),
    'revision', v_d.revision + 1);
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_run_begin(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_run_begin(uuid, uuid, boolean, text) TO service_role;

-- LEGACY RESTATED, UNCHANGED: the 4-argument _canvas_draft_run_begin(owner, draft, kind, speed) (the pre-v6 form the v6 file restated with its one added guard) is repeated here
-- byte for byte, AFTER the run-id form above. Nothing about it changes. Why: src/tests/sd-guard-completeness.test.ts reads one definition per function NAME per file and keeps
-- the last, and the v6 file's last one was this overload; a file that holds only the run-id form would look like a redefinition that dropped the v6 guard, when no guard of
-- either overload is touched. Order matters for that reason.
-- _canvas_draft_run_begin(uuid, uuid, text, text): previous body (see the diffed-against list) plus the v6 guard
CREATE OR REPLACE FUNCTION public._canvas_draft_run_begin(p_owner uuid, p_draft uuid, p_kind text, p_speed text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_chars     CONSTANT integer := 150000;
  c_rows      CONSTANT integer := 500;
  c_dead      CONSTANT interval := interval '5 minutes';
  c_revisions CONSTANT integer := 5;
  v_d       public.canvas_drafts;
  v_canvas  public.canvases;
  v_dver    text;
  v_base    public.canvas_versions;
  v_lim     jsonb := public._mirror_limits();
  v_max     numeric;
  v_spend   uuid;
  v_run     uuid;
  v_ids     uuid[] := '{}';
  v_locked  uuid[];
  v_refs    text[];
  v_thread  jsonb := '[]'::jsonb;
  v_names   text[] := '{}';
  v_basepts jsonb := '[]'::jsonb;
  v_draftpts jsonb := '[]'::jsonb;
  v_material jsonb := '[]'::jsonb;
  v_first   text;
  v_full    text;
  v_slug    text;
  v_ref     text := public._chat_author_ref(p_owner);
  v_boxes   text[] := public._canvas_box_tags();
  v_dtag    text;
  v_btag    text;
BEGIN
  IF p_owner IS NULL OR p_draft IS NULL OR p_kind IS NULL OR p_kind NOT IN ('tensions', 'draft', 'extract')
     OR p_speed IS NULL OR p_speed NOT IN ('fast', 'slow') THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  -- LOCK ORDER everywhere in this file: the per-owner lock, then the draft row, then the run row.
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || p_owner::text, 0));
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft AND d.owner_id = p_owner FOR UPDATE;
  IF NOT FOUND OR v_d.state <> 'open' THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  IF public._canvas_draft_is_v6(v_d.id) THEN
    RAISE EXCEPTION 'canvas draft: this draft belongs to the v6 engine; use _canvas_draft_run_begin(run, owner)' USING ERRCODE = '55000';
  END IF;
  IF p_kind = 'tensions' AND v_d.base_version_id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied');   -- a first canvas has no current version to be in tension with
  END IF;

  -- A run that has been running longer than 5 minutes is dead: its reservation is charged in full (it may have
  -- been billed), then the run is failed, so the owner can start again.
  UPDATE public.mirror_ai_spend s SET actual_usd = s.reserved_usd, state = 'settled', settled_at = now()
    FROM public.canvas_draft_runs r
   WHERE r.spend_id = s.id AND r.owner_id = p_owner AND r.state IN ('queued', 'running')
     AND COALESCE(r.started_at, r.created_at) < now() - c_dead AND s.state = 'reserved';
  UPDATE public.canvas_draft_runs r SET state = 'failed', error_code = 'abandoned', finished_at = now()
   WHERE r.owner_id = p_owner AND r.state IN ('queued', 'running') AND COALESCE(r.started_at, r.created_at) < now() - c_dead;
  IF EXISTS (SELECT 1 FROM public.canvas_draft_runs r WHERE r.owner_id = p_owner AND r.state IN ('queued', 'running')) THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;
  IF (p_kind = 'draft' AND v_d.run_count >= c_revisions) OR (p_kind = 'tensions' AND v_d.tension_count >= c_revisions) THEN
    RETURN jsonb_build_object('status', 'cap_reached');
  END IF;

  v_max := CASE WHEN p_kind = 'extract' THEN (v_lim ->> 'extract_max_usd')::numeric ELSE (v_lim ->> 'canvas_max_usd')::numeric END;

  IF p_kind <> 'extract' THEN
    SELECT c.* INTO v_canvas FROM public.canvases c WHERE c.id = v_d.canvas_id;
    SELECT v.name INTO v_dver FROM public.canvas_versions v WHERE v.id = v_d.version_id;
    v_dtag := 'canvas_' || v_dver;
    IF v_d.base_version_id IS NOT NULL THEN
      SELECT v.* INTO v_base FROM public.canvas_versions v WHERE v.id = v_d.base_version_id;
      v_btag := 'canvas_' || v_base.name;
    END IF;
    SELECT pr.slug, split_part(COALESCE(pr.name, ''), ' ', 1), COALESCE(pr.name, '')
      INTO v_slug, v_first, v_full FROM public.profiles pr WHERE pr.id = p_owner;

    -- The draft's thread: the owner's own rows (messages and copies), newest first within the offer bound.
    v_ids := ARRAY(
      SELECT s.id FROM (
        SELECT x.id, sum(public._mirror_row_chars(x)) OVER (ORDER BY x.created_at DESC, x.id DESC
                 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
          FROM public.chat_messages x
         WHERE x.conversation_id = v_d.conversation_id
           AND (x.id = v_d.thread_root_id OR x.thread_root_id = v_d.thread_root_id)
           AND x.kind IN ('message', 'forward', 'clarify') AND x.author_id = p_owner
           AND x.context_conversation_id IS NULL AND x.deleted_at IS NULL
         ORDER BY x.created_at DESC, x.id DESC LIMIT c_rows) s
       WHERE COALESCE(s.before, 0) < c_chars);
    -- One lock pass, FOR SHARE SKIP LOCKED, then the context lock shared and only TRIED, exactly as
    -- _mirror_begin_job does (deadlock-free against erase_chat_data_for's phased locks): a row an erase or an edit
    -- holds is neither read nor part of derived_refs.
    SELECT COALESCE(array_agg(q.id), '{}') INTO v_locked FROM (
      SELECT m.id FROM public.chat_messages m WHERE m.id = ANY (v_ids) ORDER BY m.created_at, m.id FOR SHARE SKIP LOCKED) q;
    v_ids := ARRAY(SELECT u FROM unnest(v_ids) u WHERE u = ANY (v_locked));
    IF NOT pg_try_advisory_xact_lock_shared(hashtext('p1520_mirror_context')) THEN
      RETURN jsonb_build_object('status', 'busy');
    END IF;

    SELECT COALESCE(jsonb_agg(it.item ORDER BY it.at, it.id, it.part), '[]'::jsonb) INTO v_thread FROM (
      SELECT t.id, t.created_at AS at, 0 AS part,
             jsonb_build_object('kind', 'owner_message', 'text', t.body) AS item
        FROM public.chat_messages t
       WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND NULLIF(btrim(COALESCE(t.body, '')), '') IS NOT NULL
      UNION ALL
      SELECT t.id, t.created_at, 1,
             jsonb_build_object(
               'kind', 'clarify_copy',
               'label', left(COALESCE(NULLIF(t.forward_snapshot ->> 'conversation_title', ''),
                                      NULLIF(t.forward_snapshot ->> 'author_name', ''), 'a copied chat'), 80),
               'lines', (
                 SELECT COALESCE(jsonb_agg(l.line ORDER BY l.ord), '[]'::jsonb) FROM (
                   SELECT 0 AS ord,
                          jsonb_build_object('by', CASE WHEN t.forward_author_id = p_owner THEN 'owner' ELSE 'other' END,
                                             'text', t.forward_snapshot ->> 'body') AS line
                    WHERE NULLIF(btrim(COALESCE(t.forward_snapshot ->> 'body', '')), '') IS NOT NULL
                   UNION ALL
                   SELECT x.ord::integer,
                          jsonb_build_object('by', CASE WHEN x.entry ->> 'author_ref' = v_ref THEN 'owner' ELSE 'other' END,
                                             'text', x.entry ->> 'body')
                     FROM jsonb_array_elements(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) WITH ORDINALITY AS x(entry, ord)
                    WHERE NULLIF(btrim(COALESCE(x.entry ->> 'body', '')), '') IS NOT NULL
                      AND x.ord > jsonb_array_length(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) - 100
                 ) l))
        FROM public.chat_messages t
       WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.kind IN ('forward', 'clarify') AND t.forward_snapshot IS NOT NULL
    ) it;

    -- The other people in those copies (a point or story that contains one of these names is dropped by the engine).
    SELECT COALESCE(array_agg(DISTINCT q.n), '{}') INTO v_names FROM (
      SELECT btrim(t.forward_snapshot ->> 'author_name') AS n
        FROM public.chat_messages t
       WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.forward_snapshot IS NOT NULL
         AND t.forward_author_id IS DISTINCT FROM p_owner
      UNION
      SELECT btrim(x.entry ->> 'author_name')
        FROM public.chat_messages t, jsonb_array_elements(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) AS x(entry)
       WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND (x.entry ->> 'author_ref') IS DISTINCT FROM v_ref
      UNION
      SELECT btrim(t.forward_snapshot ->> 'conversation_title')
        FROM public.chat_messages t
       WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.forward_snapshot ? 'conversation_title_ref'
    ) q
    WHERE q.n IS NOT NULL AND q.n <> '' AND lower(q.n) <> 'deleted user' AND lower(q.n) <> lower(v_full);

    -- whose words are in it, from exactly the rows read (erasure provenance; see _mirror_begin_job)
    SELECT array_remove(array_agg(DISTINCT r.ref), NULL) INTO v_refs FROM (
      SELECT public._chat_author_ref(t.author_id) AS ref
        FROM public.chat_messages t WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.author_id IS NOT NULL
      UNION
      SELECT public._chat_author_ref(t.forward_author_id)
        FROM public.chat_messages t WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.forward_author_id IS NOT NULL
      UNION
      SELECT x.entry ->> 'author_ref'
        FROM public.chat_messages t, jsonb_array_elements(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) AS x(entry)
       WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL
      UNION
      SELECT t.forward_snapshot ->> 'conversation_title_ref'
        FROM public.chat_messages t
       WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.forward_snapshot ? 'conversation_title_ref'
    ) r;
  END IF;

  -- A draft run also reads the tensions an earlier run stored (they paraphrase that run's thread), so it carries the
  -- refs they were derived from, even when that thread row has since been deleted: erasing that person cancels it.
  IF p_kind = 'draft' AND cardinality(v_d.tension_refs) > 0 THEN
    SELECT array_remove(array_agg(DISTINCT u.ref), NULL) INTO v_refs
      FROM unnest(COALESCE(v_refs, '{}') || v_d.tension_refs) AS u(ref);
  END IF;

  v_spend := public._mirror_reserve(p_owner, 'canvas', v_max);
  IF v_spend IS NULL THEN
    INSERT INTO public.canvas_draft_runs (draft_id, owner_id, kind, speed, state, error_code, finished_at)
    VALUES (v_d.id, p_owner, p_kind, p_speed, 'capped', 'cap', now())
    RETURNING id INTO v_run;
    RETURN jsonb_build_object('status', 'capped', 'run_id', v_run);
  END IF;

  INSERT INTO public.canvas_draft_runs (draft_id, owner_id, kind, speed, state, attempts, spend_id, derived_refs, started_at)
  VALUES (v_d.id, p_owner, p_kind, p_speed, 'running', 1, v_spend, COALESCE(v_refs, '{}'), now())
  RETURNING id INTO v_run;
  UPDATE public.canvas_drafts d
     SET run_count     = d.run_count + CASE WHEN p_kind = 'draft' THEN 1 ELSE 0 END,
         tension_count = d.tension_count + CASE WHEN p_kind = 'tensions' THEN 1 ELSE 0 END
   WHERE d.id = v_d.id;

  IF p_kind = 'extract' THEN
    RETURN jsonb_build_object('status', 'run', 'run_id', v_run, 'kind', p_kind, 'reserved_usd', v_max);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'box', (SELECT t FROM unnest(p.system_tags) t WHERE t = ANY (v_boxes) LIMIT 1),
           'statement', p.statement,
           'story', (SELECT s.content FROM public.story_points sp JOIN public.stories s ON s.id = sp.story_id
                      WHERE sp.point_id = p.id AND s.author_id = p_owner ORDER BY s.created_at, s.id LIMIT 1),
           'is_head', p.superseded_by IS NULL,
           'other_positions', (SELECT count(*) FROM public.point_positions pp WHERE pp.point_id = p.id AND pp.user_id <> p_owner))
         ORDER BY p.created_at, p.id), '[]'::jsonb)
    INTO v_basepts
    FROM public.points p
   WHERE v_btag IS NOT NULL AND p.first_validator_id = p_owner
     AND p.system_tags @> ARRAY[v_btag]::text[] AND p.system_tags && v_boxes;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'box', (SELECT t FROM unnest(p.system_tags) t WHERE t = ANY (v_boxes) LIMIT 1),
           'statement', p.statement,
           'story', (SELECT s.content FROM public.story_points sp JOIN public.stories s ON s.id = sp.story_id
                      WHERE sp.point_id = p.id AND s.author_id = p_owner ORDER BY s.created_at, s.id LIMIT 1),
           'reused', EXISTS (SELECT 1 FROM unnest(p.system_tags) t WHERE t LIKE 'canvas\_%' AND t <> v_dtag),
           -- the base point a reword or move of an earlier run derives this point from (the recorded link), so a
           -- revision can say it again as a reword or move instead of losing the link
           'from_point_id', (SELECT l ->> 'old' FROM jsonb_array_elements(v_d.pending_links) l WHERE l ->> 'new' = p.id::text LIMIT 1),
           'relation', (SELECT l ->> 'relation' FROM jsonb_array_elements(v_d.pending_links) l WHERE l ->> 'new' = p.id::text LIMIT 1))
         ORDER BY p.created_at, p.id), '[]'::jsonb)
    INTO v_draftpts
    FROM public.points p
   WHERE p.first_validator_id = p_owner AND p.system_tags @> ARRAY[v_dtag]::text[] AND p.system_tags && v_boxes;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'label', m.label, 'text', m.text)
                            ORDER BY m.created_at, m.id), '[]'::jsonb)
    INTO v_material FROM public.canvas_draft_material m WHERE m.draft_id = v_d.id;

  RETURN jsonb_build_object(
    'status', 'run', 'run_id', v_run, 'kind', p_kind, 'speed', p_speed, 'reserved_usd', v_max,
    'canvas_path', '/p/' || COALESCE(v_slug, p_owner::text) || '/canvas/' || v_canvas.name || '?v=' || v_dver,
    'base_label', CASE WHEN v_d.base_version_id IS NULL THEN NULL ELSE 'v' || v_base.published_seq END,
    'base_points', v_basepts,
    'material', v_material,
    'tensions', v_d.tensions,
    'other_names', to_jsonb(v_names),
    'thread', v_thread,
    'draft_points', v_draftpts,
    'owner_first_name', NULLIF(v_first, ''), 'owner_name', NULLIF(v_full, ''),
    'canvas_name', v_canvas.name, 'version_name', v_dver,
    'run_count', v_d.run_count + CASE WHEN p_kind = 'draft' THEN 1 ELSE 0 END,
    'tension_count', v_d.tension_count + CASE WHEN p_kind = 'tensions' THEN 1 ELSE 0 END);
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_run_begin(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_run_begin(uuid, uuid, text, text) TO service_role;

-- ============================================================================
-- 3. canvas_draft_retry
-- ============================================================================
CREATE OR REPLACE FUNCTION public.canvas_draft_retry(p_draft uuid, p_failed_run uuid, p_expected_revision integer, p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_cap CONSTANT integer := 30;
  v_uid  uuid := auth.uid();
  v_d    public.canvas_drafts;
  v_old  public.canvas_draft_runs;
  v_prev uuid;
  v_code text;
  v_run  uuid;
  v_rev  integer;
  v_in   text;
BEGIN
  PERFORM public._canvas_draft_require_verified(v_uid);
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'canvas retry: a client id is required' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));
  PERFORM public._canvas_draft_expire(v_uid);
  -- a repeat: the first result (with the draft's CURRENT revision), nothing written
  SELECT r.id INTO v_prev FROM public.canvas_draft_runs r WHERE r.owner_id = v_uid AND r.client_id = p_client_id;
  IF FOUND THEN
    RETURN public._canvas_draft_run_result(v_prev, true);
  END IF;
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  IF v_d.state <> 'open' THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  v_code := public._canvas_draft_busy_code(v_uid, v_d.id, true);
  IF v_code IS NOT NULL THEN
    RETURN public._canvas_draft_refuse(v_code, v_d.id);
  END IF;
  IF public._canvas_draft_used_runs(v_d.id) >= c_cap THEN
    RETURN public._canvas_draft_refuse('cap_reached', v_d.id);
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_d.revision THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;

  SELECT r.* INTO v_old FROM public.canvas_draft_runs r WHERE r.id = p_failed_run AND r.draft_id = v_d.id FOR UPDATE;
  IF NOT FOUND OR v_old.state NOT IN ('failed', 'capped') OR v_old.kind NOT IN ('message', 'focus', 'fork_first')
     OR v_old.id IS DISTINCT FROM (SELECT r.id FROM public.canvas_draft_runs r WHERE r.draft_id = v_d.id
                                    ORDER BY r.created_at DESC, r.id DESC LIMIT 1) THEN
    RETURN public._canvas_draft_refuse('not_retryable', v_d.id);
  END IF;
  IF v_old.kind = 'message' THEN
    IF v_old.trigger_message_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id = v_old.trigger_message_id AND m.deleted_at IS NULL) THEN
      RETURN public._canvas_draft_refuse('not_retryable', v_d.id);
    END IF;
    -- a voice note whose transcript failed (or came back blank) has nothing to retry
    IF v_old.input_kind = 'voice' AND EXISTS (
         SELECT 1 FROM public.chat_messages m
          WHERE m.id = v_old.trigger_message_id
            AND (m.transcript_status = 'failed' OR (m.transcript_status = 'done' AND btrim(COALESCE(m.transcript, '')) = ''))) THEN
      RETURN public._canvas_draft_refuse('not_retryable', v_d.id);
    END IF;
    IF v_old.input_kind = 'file' AND NOT EXISTS (
         SELECT 1 FROM public.canvas_draft_material x WHERE x.draft_id = v_d.id AND x.message_id = v_old.trigger_message_id) THEN
      RETURN public._canvas_draft_refuse('not_retryable', v_d.id);
    END IF;
  ELSIF v_old.kind = 'focus' THEN
    IF NOT EXISTS (SELECT 1 FROM public.canvas_draft_offers o
                    WHERE o.id = v_old.target_offer_id AND o.draft_id = v_d.id AND o.state = 'offered') THEN
      RETURN public._canvas_draft_refuse('not_retryable', v_d.id);
    END IF;
  END IF;
  v_in := CASE WHEN v_old.input_kind IN ('voice', 'file') THEN v_old.input_kind ELSE 'text' END;   -- (server review, Opus 1) a retried upload stays an upload

  UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id RETURNING d.revision INTO v_rev;
  INSERT INTO public.canvas_draft_runs
    (draft_id, owner_id, kind, speed, state, trigger_message_id, scope, target_offer_id, client_id, input_kind, created_revision)
  VALUES (v_d.id, v_uid, v_old.kind, 'fast', 'queued', v_old.trigger_message_id, v_old.scope, v_old.target_offer_id,
          p_client_id, v_in, v_rev)
  RETURNING id INTO v_run;
  RETURN public._canvas_draft_run_result(v_run, false);
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_retry(uuid, uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_retry(uuid, uuid, integer, uuid) TO authenticated;

-- ============================================================================
-- 4. canvas_draft_undo
-- ============================================================================
CREATE OR REPLACE FUNCTION public.canvas_draft_undo(p_draft uuid, p_expected_run uuid, p_expected_revision integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_d    public.canvas_drafts;
  v_run  public.canvas_draft_runs;
  v_step public.canvas_draft_steps;
  v_tag  text;
  v_cur  uuid[];
  v_code text;
  v_rev  integer;
  v_next uuid;
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
  SELECT r.* INTO v_run
    FROM public.canvas_draft_runs r JOIN public.canvas_draft_steps s ON s.run_id = r.id
   WHERE r.draft_id = v_d.id AND r.state = 'done'
   ORDER BY r.finished_at DESC, r.created_at DESC, r.id DESC LIMIT 1
   FOR UPDATE OF r;
  IF NOT FOUND OR v_run.id IS DISTINCT FROM p_expected_run THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  SELECT s.* INTO v_step FROM public.canvas_draft_steps s WHERE s.run_id = v_run.id;

  v_tag := 'canvas_' || v_d.version_name;
  v_cur := public._canvas_draft_point_ids(v_d.id);
  PERFORM set_config('p1536.keep_updated_at', 'on', true);
  UPDATE public.points p SET system_tags = array_remove(p.system_tags, v_tag)
   WHERE p.id = ANY (v_cur) AND NOT (p.id = ANY (v_step.point_ids));
  UPDATE public.points p SET system_tags = array_append(p.system_tags, v_tag)
   WHERE p.id = ANY (v_step.point_ids) AND p.first_validator_id = v_d.owner_id
     AND NOT (p.system_tags @> ARRAY[v_tag]::text[]);
  PERFORM set_config('p1536.keep_updated_at', 'off', true);

  -- offers: this run's new offers go if still offered; a focus switch is reversed; started/dismissed never change
  DELETE FROM public.canvas_draft_offers o
   WHERE o.draft_id = v_d.id AND o.id = ANY (v_step.new_offer_ids) AND o.state = 'offered';
  IF v_run.kind = 'focus' THEN
    UPDATE public.canvas_draft_offers o SET state = 'offered' WHERE o.id = v_run.target_offer_id AND o.state = 'focused';
    IF v_step.focus IS NOT NULL THEN
      UPDATE public.canvas_draft_offers o SET state = 'focused'
       WHERE o.draft_id = v_d.id AND o.state = 'offered' AND o.id IS DISTINCT FROM v_run.target_offer_id
         AND public._canvas_offer_key(o.group_label) = public._canvas_offer_key(v_step.focus)
         AND NOT (o.id = ANY (v_step.new_offer_ids));
    END IF;
  END IF;

  -- (server review, Opus 2) a first draft may have taken an offered group as its focus (_canvas_draft_run_complete): any `focused` row that is not the focus this
  -- step restores goes back to `offered`. A focus switch's own rows are already right above, and a focused row that IS the restored focus is left alone.
  UPDATE public.canvas_draft_offers o SET state = 'offered'
   WHERE o.draft_id = v_d.id AND o.state = 'focused'
     AND (v_step.focus IS NULL OR public._canvas_offer_key(o.group_label) IS DISTINCT FROM public._canvas_offer_key(v_step.focus));

  UPDATE public.canvas_drafts d
     SET pending_links = v_step.pending_links, questions = v_step.questions, focus = v_step.focus,
         revision = d.revision + 1
   WHERE d.id = v_d.id RETURNING d.revision INTO v_rev;
  IF v_run.reply_message_id IS NOT NULL THEN
    UPDATE public.chat_messages m SET body = 'Undone.' WHERE m.id = v_run.reply_message_id AND m.deleted_at IS NULL;
  END IF;
  UPDATE public.canvas_draft_runs r SET state = 'undone' WHERE r.id = v_run.id;
  DELETE FROM public.canvas_draft_steps s WHERE s.run_id = v_run.id;

  SELECT r.id INTO v_next
    FROM public.canvas_draft_runs r JOIN public.canvas_draft_steps s ON s.run_id = r.id
   WHERE r.draft_id = v_d.id AND r.state = 'done'
   ORDER BY r.finished_at DESC, r.created_at DESC, r.id DESC LIMIT 1;
  RETURN jsonb_build_object('status', 'ok', 'revision', v_rev, 'undone_run_id', v_run.id, 'next_undo_run_id', v_next);
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_undo(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_undo(uuid, uuid, integer) TO authenticated;

-- ============================================================================
-- 5. erase_chat_data_for
-- ============================================================================
CREATE OR REPLACE FUNCTION public.erase_chat_data_for(p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  v_ref text := public._chat_author_ref(p_uid);
  n     integer;
  pass  integer;
  v_threads uuid[];
  v_th      public.chat_round_threads;
  v_key     record;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'erase_chat_data_for: no subject' USING ERRCODE = '22023';
  END IF;

  -- (P1536 + P1592 merged) ONE erasure at a time: this global lock is the very first lock, before the erasing marker. Erasures are
  -- rare. See the header of this file for why this makes the growth of the owner set between the two helper calls safe.
  PERFORM pg_advisory_xact_lock(hashtextextended('p1536:erasure', 0));

  -- 0. (P1592) LOCKS FIRST, before any message row is touched. Order: the ERASING MARKER (exclusive, see
  -- _transcribe_thread_roster_locked: posters and the seating trigger only try it shared and never wait, and
  -- a holder of the shared side is waited for HERE, before any thread lock is held), then speaker, thread,
  -- place, message rows. The speaker lock keeps the poster from committing this person's words after step 2
  -- scrubbed them. Then the thread lock of EVERY (round, table) this person is a member of or is seated at, whether or not a
  -- thread exists yet, taken in (round, table) order (host_set_round_seats seats in the same order). Only THEN
  -- are the threads collected, so a poster that holds a table's lock commits first and its thread is found
  -- here, and a poster that comes later waits and reads a roster without this person: the member list rows
  -- are deleted in step 7 and the seat is tombstoned (profile_id NULL, which the roster skips) in the same
  -- transaction, before any lock is released.
  -- The seat lookup joins event_room_members on profile_id, so erase_my_account must call this BEFORE it
  -- tombstones those rows (it does: redefined below). Locks are held to the end of the transaction, which
  -- includes the profile delete.
  PERFORM pg_advisory_xact_lock(hashtextextended('p1592:erasing:' || p_uid::text, 0));   -- exclusive marker, first
  -- (P1536 + P1592 merged) Lock order, outermost first: P1592's erasing marker (waits for the posters and the seating trigger that
  -- hold its shared side, while this transaction holds nothing), then the engine's owner locks (next block), then P1592's speaker
  -- and thread locks (step 0), then the p1520 context lock (step 6), then the draft rows. See the header of this file.
  -- The engine's per-owner advisory locks come FIRST, before any row is touched: the erased user's own, and those of every
  -- owner of a draft whose runs read their words, as ONE set taken in owner order. Every engine function takes its owner's
  -- lock before anything else, so an engine transaction in flight (it may hold a conversation or draft row) finishes first,
  -- and two concurrent erasures take the locks in the same global order and cannot cross. Waiting here cannot form a cycle:
  -- the engine only TRIES the p1520 lock (shared) and never waits for it. (An owner who becomes affected only between this
  -- read and the p1520 lock below is the one case not covered: its draft rows are still locked in step 6.)
  -- The step is the helper _erase_lock_canvas_owners (defined above); erase_my_account takes the same locks before its first
  -- mutation, so this call is a re-entrant no-op there (it only adds an owner that became affected in between).
  PERFORM public._erase_lock_canvas_owners(p_uid);

  PERFORM pg_advisory_xact_lock(hashtextextended('p1592:speaker:' || p_uid::text, 0));
  FOR v_key IN
    SELECT k.round_id, k.table_no FROM (
      SELECT t.round_id, t.table_no FROM public.chat_round_threads t
        JOIN public.chat_round_thread_members tm ON tm.thread_id = t.id WHERE tm.profile_id = p_uid
      UNION
      SELECT s.round_id, s.table_no FROM public.event_round_seats s
        JOIN public.event_room_members rm ON rm.id = s.room_member_id WHERE rm.profile_id = p_uid
    ) k ORDER BY k.round_id, k.table_no
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('p1592:thread:' || v_key.round_id::text || ':' || v_key.table_no::text, 0));
  END LOOP;
  SELECT COALESCE(array_agg(x.id ORDER BY x.round_id, x.table_no), '{}') INTO v_threads FROM (
    SELECT t.id, t.round_id, t.table_no FROM public.chat_round_threads t
      JOIN public.chat_round_thread_members tm ON tm.thread_id = t.id WHERE tm.profile_id = p_uid
    UNION
    SELECT t.id, t.round_id, t.table_no FROM public.chat_round_threads t
      JOIN public.event_round_seats s ON s.round_id = t.round_id AND s.table_no = t.table_no
      JOIN public.event_room_members rm ON rm.id = s.room_member_id WHERE rm.profile_id = p_uid
  ) x;

  -- ORDER MATTERS (race with forward_chat_message / clarify_chat_message). Those lock their source
  -- row FOR SHARE, so step 2's UPDATE of the erased user's own rows WAITS for any in-flight copy of
  -- them to commit. Under READ COMMITTED every statement takes a fresh snapshot, so the scrub in
  -- step 3 (a later statement) then SEES a copy that committed while step 2 waited and scrubs it.
  -- Scrubbing first would miss it. A copy that starts after step 2 commits finds the source deleted
  -- and is refused. Step 3 runs twice for the copy-of-a-copy case (a forward of a forward that
  -- committed while step 3's first pass waited).

  -- 1. their mirror and everything copied into it
  DELETE FROM public.chat_conversations c WHERE c.kind = 'mirror' AND c.owner_id = p_uid;
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_mirrors_deleted', n);

  -- 2. their messages in shared conversations
  UPDATE public.chat_messages m
     SET body = NULL, deleted_at = COALESCE(m.deleted_at, now()),
         attachment_kind = NULL, attachment_id = NULL,
         forward_snapshot = NULL, forward_author_id = NULL,
         author_id = NULL
   WHERE m.author_id = p_uid;
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_messages_erased', n);

  -- 3. copies made by OTHER people that carry their words. Erase means erase; D5 snapshot survival
  -- applies to ordinary deletes, not account erasure: the author becomes 'Deleted user', the body is
  -- removed (also from copied thread entries), the attachment and the back-reference are cleared.
  FOR pass IN 1..2 LOOP
    UPDATE public.chat_messages m
       SET forward_snapshot = jsonb_set(jsonb_set(m.forward_snapshot, '{author_name}', to_jsonb('Deleted user'::text)),
                                        '{body}', 'null'::jsonb),
           attachment_kind = NULL, attachment_id = NULL,
           forward_author_id = NULL
     WHERE m.forward_author_id = p_uid AND m.forward_snapshot IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_forwards_anonymised_' || pass, n);

    UPDATE public.chat_messages m
       SET forward_snapshot = jsonb_set(m.forward_snapshot, '{thread}', (
             SELECT COALESCE(jsonb_agg(
                      CASE WHEN t.e ->> 'author_ref' = v_ref
                           THEN (t.e - 'author_ref') || jsonb_build_object('author_name', 'Deleted user', 'body', NULL::text)
                           ELSE t.e END
                      ORDER BY t.ord), '[]'::jsonb)
               FROM jsonb_array_elements(m.forward_snapshot -> 'thread') WITH ORDINALITY AS t(e, ord)))
     WHERE m.forward_snapshot IS NOT NULL
       AND jsonb_path_exists(m.forward_snapshot, '$.thread[*] ? (@.author_ref == $ref)',
                             jsonb_build_object('ref', v_ref));
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_threads_anonymised_' || pass, n);

    -- a clarify made in a 1:1 with them carries their name as the chat title
    UPDATE public.chat_messages m
       SET forward_snapshot = jsonb_set(m.forward_snapshot - 'conversation_title_ref', '{conversation_title}',
                                        to_jsonb('Deleted user'::text))
     WHERE m.forward_snapshot ->> 'conversation_title_ref' = v_ref;
  END LOOP;

  -- 4. read state and blocks
  DELETE FROM public.chat_member_state s WHERE s.profile_id = p_uid;
  DELETE FROM public.chat_blocks b WHERE b.blocker_id = p_uid OR b.blocked_id = p_uid;

  -- 5. conversations that would be left with nobody
  DELETE FROM public.chat_conversations c
   WHERE c.kind = 'dm'
     AND ((c.dm_user_a = p_uid AND c.dm_user_b IS NULL) OR (c.dm_user_b = p_uid AND c.dm_user_a IS NULL));
  UPDATE public.chat_conversations c SET created_by = NULL WHERE c.created_by = p_uid;

  -- 6. (P1520) AI work derived from their words. The exclusive lock waits for every job still reading its
  -- context (_mirror_begin_job holds it shared) and keeps new ones out until this commits, so no job can
  -- record refs this step does not see. Jobs first: a completion that commits while this waits leaves a
  -- reply the next statement then scrubs.
  PERFORM pg_advisory_xact_lock(hashtext('p1520_mirror_context'));
  -- the draft rows the engine would lock, in id order, before any reply message or run row is touched (the owner locks are
  -- already held, see the top of this function)
  PERFORM 1 FROM public.canvas_drafts d
   WHERE d.tension_refs @> ARRAY[v_ref]
      OR d.id IN (SELECT r.draft_id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref])
   ORDER BY d.id FOR UPDATE;
  UPDATE public.mirror_jobs j
     SET state = 'cancelled', error_code = 'erased', finished_at = now()
   WHERE j.state IN ('queued', 'running') AND j.derived_refs @> ARRAY[v_ref];
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('mirror_jobs_cancelled', n);
  UPDATE public.chat_messages m
     SET body = NULL, deleted_at = COALESCE(m.deleted_at, now()), derived_refs = NULL
   WHERE m.kind = 'agent' AND m.derived_refs @> ARRAY[v_ref];
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('mirror_replies_erased', n);

  -- 7. (P1592) round-thread titles carry first names. The threads were collected and locked in step 0. Drop
  -- this person from each member list and rebuild the title through the same function the poster uses
  -- ("Round {n}" if nobody named remains). edited_at is never touched. Copies of a root (forward / clarify)
  -- carry "Round {n}" only, so there is nothing to scrub in them.
  FOR v_th IN SELECT t.* FROM public.chat_round_threads t WHERE t.id = ANY (v_threads) ORDER BY t.round_id, t.table_no LOOP
    DELETE FROM public.chat_round_thread_members tm WHERE tm.thread_id = v_th.id AND tm.profile_id = p_uid;
    PERFORM public._transcribe_retitle_thread(v_th.id);
  END LOOP;
  v_out := v_out || jsonb_build_object('chat_round_threads_retitled', COALESCE(array_length(v_threads, 1), 0));

  -- 7b. (P1536 server review, Opus 8) the offers a run made while it read their words. An offer's label and reason are model output of the same class as the tensions
  -- cleared in step 8: they can paraphrase what the run read, they are returned by the state read, and the label is fed to the next run and becomes a fork's focus. An open offer
  -- is deleted; an offer already focused, started or dismissed keeps its label (a canvas already carries it) and loses its reason. The draft rows are locked (step 6), and
  -- a draft whose offers change moves its revision so an open view refetches. A closed draft keeps its material until its own expiry: settlement is not run from here.
  -- It sits before step 8 so that step 8's statements stay one unbroken block, as the earlier migrations' tests pin them.
  UPDATE public.canvas_drafts d SET revision = d.revision + 1
   WHERE d.id IN (SELECT o.draft_id FROM public.canvas_draft_offers o
                   WHERE (o.state = 'offered' OR o.why IS NOT NULL)
                     AND o.created_run_id IN (SELECT r.id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref]));
  DELETE FROM public.canvas_draft_offers o
   WHERE o.state = 'offered'
     AND o.created_run_id IN (SELECT r.id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref]);
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('canvas_draft_offers_erased', n);
  UPDATE public.canvas_draft_offers o SET why = NULL
   WHERE o.why IS NOT NULL
     AND o.created_run_id IN (SELECT r.id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref]);
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('canvas_draft_offer_reasons_cleared', n);

  -- 8. (P1536) canvas draft runs that read their words. Same lock as step 6 (still held), so no run can record refs this
  -- step does not see. A cancelled run's completion writes and posts nothing. The tensions and decided notes of a
  -- draft are model output that can paraphrase what its runs read, and they are fed to its next run: cleared.
  -- a cancelled run changes what the owner sees (the spot stops saying "Updating..."), so the draft's revision moves, once
  -- per draft that had a v6 run cancelled; the draft rows are already locked above
  UPDATE public.canvas_drafts d SET revision = d.revision + 1
   WHERE d.id IN (SELECT r.draft_id FROM public.canvas_draft_runs r
                   WHERE r.state IN ('queued', 'running') AND r.derived_refs @> ARRAY[v_ref]
                     AND r.kind IN ('message', 'focus', 'fork_first'));
  UPDATE public.canvas_draft_runs r
     SET state = 'cancelled', error_code = 'erased', finished_at = now()
   WHERE r.state IN ('queued', 'running') AND r.derived_refs @> ARRAY[v_ref];
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('canvas_draft_runs_cancelled', n);
  UPDATE public.canvas_drafts d
     SET tensions = '[]'::jsonb, decided = '[]'::jsonb, tension_refs = '{}'
   WHERE d.tension_refs @> ARRAY[v_ref]
      OR EXISTS (SELECT 1 FROM public.canvas_draft_runs r WHERE r.draft_id = d.id AND r.derived_refs @> ARRAY[v_ref]);
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('canvas_drafts_scrubbed', n);

  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.erase_chat_data_for(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 1. _canvas_draft_run_complete (the 10-argument function)
-- ============================================================================
CREATE OR REPLACE FUNCTION public._canvas_draft_run_complete(
  p_run uuid, p_owner uuid, p_actions jsonb, p_questions jsonb, p_scope text[], p_focus text, p_other_canvases jsonb,
  p_note text, p_reply text, p_usd numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_actions CONSTANT integer := 45;
  v_run    public.canvas_draft_runs;
  v_d      public.canvas_drafts;
  v_trig   public.chat_messages;
  v_boxes  text[] := public._canvas_box_tags();
  v_cust   text[] := public._canvas_customer_box_tags();
  v_tag    text;
  v_pre    uuid[];
  v_scope  text[];
  v_first  boolean;
  v_a      jsonb;
  v_type   text;
  v_old    uuid;
  v_op     public.points;
  v_src    text;
  v_box    text;
  v_stmt   text;
  v_story  text;
  v_pid    uuid;
  v_sid    uuid;
  v_seen   uuid[] := '{}';
  v_keep   uuid[] := '{}';
  v_links  jsonb;
  v_chain  uuid;
  v_kept   integer := 0;
  v_made   integer := 0;
  v_drop   integer := 0;
  v_k      text;
  v_q      jsonb;
  v_full   numeric;
  v_offer  public.canvas_draft_offers;
  v_prev   text;
  v_row    public.canvas_draft_offers;
  v_new_offers uuid[] := '{}';
  v_oid    uuid;
  v_label  text;
  v_why    text;
  v_el     jsonb;
  v_open   integer;
  v_j9_labels text[];
  v_idle   boolean := false;
  v_removed boolean;
  v_reply  text;
  v_reply_id uuid;
  v_focus  text;
  v_boxes_filled integer;
BEGIN
  IF p_run IS NULL OR p_owner IS NULL THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run;
  IF NOT FOUND OR v_run.owner_id IS DISTINCT FROM p_owner THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_run.owner_id::text, 0));
  PERFORM public._canvas_draft_expire(v_run.owner_id);
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = v_run.draft_id FOR UPDATE;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run FOR UPDATE;
  IF v_run.state = 'cancelled' THEN
    SELECT s.reserved_usd INTO v_full FROM public.mirror_ai_spend s WHERE s.id = v_run.spend_id;
    PERFORM public._mirror_settle(v_run.spend_id, COALESCE(p_usd, v_full));   -- erased: the call was made, nothing is written
    RETURN jsonb_build_object('status', 'gone', 'state', 'cancelled');
  END IF;
  IF v_run.state <> 'running' OR v_run.kind NOT IN ('message', 'focus', 'fork_first') THEN
    RETURN jsonb_build_object('status', 'gone', 'state', v_run.state);
  END IF;

  -- shape checks: a malformed result raises, the transaction rolls back and the caller fails the run
  IF p_actions IS NULL OR jsonb_typeof(p_actions) <> 'array' OR jsonb_array_length(p_actions) > c_max_actions THEN
    RAISE EXCEPTION 'canvas draft: actions must be an array of at most % items', c_max_actions USING ERRCODE = '22023';
  END IF;
  IF p_questions IS NOT NULL AND jsonb_typeof(p_questions) <> 'object' THEN
    RAISE EXCEPTION 'canvas draft: questions must be an object' USING ERRCODE = '22023';
  END IF;
  IF p_other_canvases IS NOT NULL AND (jsonb_typeof(p_other_canvases) <> 'array' OR jsonb_array_length(p_other_canvases) > 20) THEN
    RAISE EXCEPTION 'canvas draft: other_canvases must be an array of at most 20' USING ERRCODE = '22023';
  END IF;
  FOR v_k IN SELECT jsonb_object_keys(COALESCE(p_questions, '{}'::jsonb)) LOOP
    IF NOT (v_k = ANY (v_boxes)) OR jsonb_typeof(p_questions -> v_k) <> 'string' THEN
      RAISE EXCEPTION 'canvas draft: bad question' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT s.reserved_usd INTO v_full FROM public.mirror_ai_spend s WHERE s.id = v_run.spend_id;
  PERFORM public._mirror_settle(v_run.spend_id, COALESCE(p_usd, v_full));
  IF v_d.state <> 'open' THEN
    UPDATE public.canvas_draft_runs r SET state = 'failed', error_code = 'draft_closed', finished_at = now() WHERE r.id = p_run;
    RETURN jsonb_build_object('status', 'gone', 'state', 'failed', 'error_code', 'draft_closed');
  END IF;

  -- a focus switch re-checks under the lock that its target is still offered; otherwise nothing changes
  IF v_run.kind = 'focus' THEN
    SELECT o.* INTO v_offer FROM public.canvas_draft_offers o
     WHERE o.id = v_run.target_offer_id AND o.draft_id = v_d.id FOR UPDATE;
    IF NOT FOUND OR v_offer.state <> 'offered' THEN
      UPDATE public.canvas_draft_runs r SET state = 'failed', error_code = 'not_offered', finished_at = now() WHERE r.id = p_run;
      UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id;
      RETURN jsonb_build_object('status', 'failed', 'code', 'not_offered');
    END IF;
  END IF;

  v_tag := 'canvas_' || v_d.version_name;
  IF v_run.trigger_message_id IS NOT NULL THEN
    SELECT m.* INTO v_trig FROM public.chat_messages m WHERE m.id = v_run.trigger_message_id;
  END IF;
  v_pre := public._canvas_draft_point_ids(v_d.id);
  -- the first draft: an UNTAGGED message on an empty draft with no base and no focus yet. A tagged message is always
  -- exactly its tags, and an emptied draft (it has a focus) never lets a message run change that focus.
  v_first := (v_run.kind = 'message' AND v_trig.box_refs IS NULL AND cardinality(v_pre) = 0
              AND v_d.base_version_id IS NULL AND v_d.focus IS NULL);

  -- the scope of this run
  IF v_run.kind IN ('focus', 'fork_first') THEN
    v_scope := v_boxes;
  ELSIF v_run.kind = 'message' AND v_trig.box_refs IS NOT NULL THEN
    v_scope := ARRAY(SELECT DISTINCT b FROM unnest(v_trig.box_refs) b WHERE b = ANY (v_boxes) ORDER BY b);
  ELSIF v_first THEN
    v_scope := v_boxes;
  ELSE
    v_scope := ARRAY(SELECT DISTINCT b FROM unnest(COALESCE(p_scope, '{}')) b WHERE b = ANY (v_boxes) ORDER BY b);
    v_drop := v_drop + (SELECT count(DISTINCT b) FROM unnest(COALESCE(p_scope, '{}')) b WHERE NOT (b = ANY (v_boxes)));
  END IF;

  IF cardinality(v_scope) = 0 THEN
    -- nothing is applied: every action and question the model supplied is dropped, and counted
    v_drop := v_drop + jsonb_array_length(p_actions) + (SELECT count(*) FROM jsonb_object_keys(COALESCE(p_questions, '{}'::jsonb)));
  END IF;

  v_links := v_d.pending_links;
  v_q := v_d.questions;
  v_focus := v_d.focus;

  IF cardinality(v_scope) > 0 THEN
    -- 1. the undo step: the draft as it is before this run changes anything
    INSERT INTO public.canvas_draft_steps (run_id, draft_id, point_ids, questions, pending_links, focus)
    VALUES (v_run.id, v_d.id, v_pre, v_d.questions, v_d.pending_links, v_d.focus);

    -- 2. the scoped apply
    FOR v_a IN SELECT e FROM jsonb_array_elements(p_actions) e LOOP
      v_type := COALESCE(v_a ->> 'action', v_a ->> 'type');
      IF v_type IS NULL OR v_type NOT IN ('keep', 'reword', 'move', 'new') THEN
        RAISE EXCEPTION 'canvas draft: unknown action' USING ERRCODE = '22023';
      END IF;
      v_op := NULL;
      v_old := NULL;
      v_src := NULL;

      IF v_type IN ('keep', 'reword', 'move') THEN
        v_old := COALESCE(v_a ->> 'point_id', v_a ->> 'old_point_id')::uuid;
        IF v_old IS NULL THEN
          RAISE EXCEPTION 'canvas draft: an action names no point' USING ERRCODE = '22023';
        END IF;
        -- v6 form of the earlier guards: a point may only be named once, and must be a point of THIS draft as it stood
        -- before the run (the draft starts as its base, so a base point is one until a run takes it out). Anything else is
        -- malformed model output: the run raises, rolls back and the caller fails it (Try again).
        IF v_old = ANY (v_seen) THEN
          RAISE EXCEPTION 'canvas draft: a point is named twice' USING ERRCODE = '22023';
        END IF;
        IF NOT (v_old = ANY (v_pre)) THEN
          RAISE EXCEPTION 'canvas draft: point is not a point of this draft' USING ERRCODE = '22023';
        END IF;
        v_seen := v_seen || v_old;
        SELECT p.* INTO v_op FROM public.points p WHERE p.id = v_old;
        v_src := public._canvas_point_box(v_op.system_tags);
        IF v_src IS NULL OR NOT (v_src = ANY (v_scope)) THEN
          v_drop := v_drop + 1;          -- the source box is out of scope
          CONTINUE;
        END IF;
      END IF;

      IF v_type = 'keep' THEN
        IF v_run.kind = 'focus' AND v_src = ANY (v_cust) THEN
          v_drop := v_drop + 1;          -- a focus switch rebuilds the customer-facing boxes: keep is refused there
          CONTINUE;
        END IF;
        v_keep := v_keep || v_old;
        v_kept := v_kept + 1;
        CONTINUE;
      END IF;

      v_box := COALESCE(NULLIF(v_a ->> 'box', ''), CASE WHEN v_type <> 'new' THEN v_src END);
      IF v_box IS NULL OR NOT (v_box = ANY (v_boxes)) THEN
        RAISE EXCEPTION 'canvas draft: unknown box' USING ERRCODE = '22023';
      END IF;
      IF NOT (v_box = ANY (v_scope)) THEN
        v_drop := v_drop + 1;            -- the destination box is out of scope: the refused action must not remove its source
        IF v_old IS NOT NULL THEN
          v_keep := v_keep || v_old;
        END IF;
        CONTINUE;
      END IF;
      IF v_run.kind = 'focus' AND v_type = 'move' AND v_box = ANY (v_cust) THEN
        v_drop := v_drop + 1;            -- a move would carry a point over unchanged into a rebuilt box: refused. Its source
        IF NOT (v_src = ANY (v_cust)) THEN   -- stays only if it is a founder-fit point; a customer-facing source is rebuilt
          v_keep := v_keep || v_old;
        END IF;
        CONTINUE;
      END IF;
      v_stmt := btrim(COALESCE(NULLIF(btrim(v_a ->> 'statement'), ''), CASE WHEN v_type = 'move' THEN v_op.statement END, ''));
      IF char_length(v_stmt) NOT BETWEEN 1 AND 300 THEN
        RAISE EXCEPTION 'canvas draft: bad statement' USING ERRCODE = '22023';
      END IF;
      v_story := btrim(COALESCE(v_a ->> 'story', ''));
      IF char_length(v_story) > 1500 THEN
        RAISE EXCEPTION 'canvas draft: story too long' USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.points (statement, first_validator_id, visibility, tags, system_tags)
      VALUES (v_stmt, v_d.owner_id, 'private'::public.content_visibility, '{}', ARRAY[v_box, v_tag])
      RETURNING id INTO v_pid;
      -- D20: a point the engine writes starts with NO stance of the owner (the owner marks it before Publish). A reword is a new
      -- point and starts without one; the stance stays on the old point. A move carries the SAME words into another box, so it
      -- keeps the stance the owner had on the point it copies; a move that arrives with NEW words is a reword and gets none.
      IF v_type = 'move' AND v_stmt = btrim(v_op.statement) THEN
        INSERT INTO public.point_positions (point_id, user_id, position, reasoning)
        SELECT v_pid, v_d.owner_id, pp.position, pp.reasoning FROM public.point_positions pp WHERE pp.point_id = v_op.id AND pp.user_id = v_d.owner_id;
      END IF;
      v_sid := NULL;
      IF v_story <> '' THEN
        INSERT INTO public.stories (content, author_id, visibility)
        VALUES (v_story, v_d.owner_id, 'private'::public.content_visibility) RETURNING id INTO v_sid;
        INSERT INTO public.story_points (story_id, point_id, author_id) VALUES (v_sid, v_pid, v_d.owner_id);
      ELSIF v_type IN ('move', 'reword') THEN
        -- same words (another box), or a reword that carries no story of its own (a draft writes points only): the
        -- owner's private stories of the old point follow it. They are the owner's, not the engine's: never in the ledger.
        INSERT INTO public.story_points (story_id, point_id, author_id)
        SELECT sp.story_id, v_pid, v_d.owner_id
          FROM public.story_points sp JOIN public.stories s ON s.id = sp.story_id
         WHERE sp.point_id = v_old AND s.author_id = v_d.owner_id AND s.visibility = 'private'::public.content_visibility;
      END IF;
      INSERT INTO public.canvas_draft_points (draft_id, point_id, run_id, story_ids)
      VALUES (v_d.id, v_pid, v_run.id, CASE WHEN v_sid IS NULL THEN '{}'::uuid[] ELSE ARRAY[v_sid] END);
      v_made := v_made + 1;

      -- a pending supersede link (old -> new) for a reword or move of a REUSED head point; a reword of a point this
      -- draft made takes over that point's link (the chain), anything else is a new point with no link
      -- (a focus run's reword into a customer-facing box is the rebuild's NEW content, not a revision of the old group's point)
      IF v_type IN ('reword', 'move') AND NOT (v_run.kind = 'focus' AND v_type = 'reword' AND v_box = ANY (v_cust)) THEN
        SELECT (l ->> 'old')::uuid INTO v_chain FROM jsonb_array_elements(v_links) l WHERE l ->> 'new' = v_old::text LIMIT 1;
        IF v_chain IS NOT NULL THEN
          v_links := v_links || jsonb_build_array(jsonb_build_object(
            'old', v_chain, 'new', v_pid, 'relation', v_type,
            'why', COALESCE(NULLIF(left(v_a ->> 'why', 200), ''), CASE v_type WHEN 'reword' THEN 'reworded' ELSE 'moved' END)));
        ELSIF NOT EXISTS (SELECT 1 FROM public.canvas_draft_points cp WHERE cp.draft_id = v_d.id AND cp.point_id = v_old)
              AND v_op.superseded_by IS NULL AND v_op.visibility = 'private'::public.content_visibility THEN
          v_links := v_links || jsonb_build_array(jsonb_build_object(
            'old', v_old, 'new', v_pid, 'relation', v_type,
            'why', COALESCE(NULLIF(left(v_a ->> 'why', 200), ''), CASE v_type WHEN 'reword' THEN 'reworded' ELSE 'moved' END)));
        END IF;
        v_chain := NULL;
      END IF;
    END LOOP;

    -- every point of a scoped box that no keep named leaves the draft (it stays on any version that holds it; a point
    -- only this draft made stays in the ledger until Publish or Discard)
    PERFORM set_config('p1536.keep_updated_at', 'on', true);
    UPDATE public.points p SET system_tags = array_remove(p.system_tags, v_tag)
     WHERE p.id = ANY (v_pre) AND public._canvas_point_box(p.system_tags) = ANY (v_scope) AND NOT (p.id = ANY (v_keep));
    PERFORM set_config('p1536.keep_updated_at', 'off', true);

    -- (server review, Gemini 2) a later message whose scope is not empty but which added, reworded, moved or removed no point changed nothing: its reply says so, so it
    -- is no Undo step and moves no question or link. The first draft, a focus switch and a fork's first run always apply.
    v_removed := EXISTS (SELECT 1 FROM unnest(v_pre) q WHERE NOT (q = ANY (public._canvas_draft_point_ids(v_d.id))));
    v_idle := v_run.kind = 'message' AND NOT v_first AND v_made = 0 AND NOT v_removed;
    IF v_idle THEN
      DELETE FROM public.canvas_draft_steps s WHERE s.run_id = v_run.id;
    END IF;

    -- 3. the per-box merge of questions, scoped boxes only
    IF NOT v_idle THEN
    FOREACH v_k IN ARRAY v_scope LOOP
      v_q := v_q - v_k;
    END LOOP;
    FOR v_k IN SELECT jsonb_object_keys(COALESCE(p_questions, '{}'::jsonb)) LOOP
      IF v_k = ANY (v_scope) THEN
        IF NULLIF(btrim(p_questions ->> v_k), '') IS NOT NULL THEN
          v_q := v_q || jsonb_build_object(v_k, left(btrim(p_questions ->> v_k), 400));
        END IF;
      ELSE
        v_drop := v_drop + 1;
      END IF;
    END LOOP;
    -- links whose new point left the draft are dropped (a later run rewrote or omitted it)
    SELECT COALESCE(jsonb_agg(l), '[]'::jsonb) INTO v_links
      FROM jsonb_array_elements(v_links) l
     WHERE (l ->> 'new')::uuid = ANY (public._canvas_draft_point_ids(v_d.id));
    END IF;

    -- 4. focus. A message run never changes it; a focus run takes the offer's group; the first draft takes the model's.
    v_prev := v_d.focus;
    IF v_run.kind = 'focus' THEN
      v_focus := v_offer.group_label;
      -- the previous focus becomes an offer, so the owner can switch back or start it
      IF v_prev IS NOT NULL THEN
        SELECT o.* INTO v_row FROM public.canvas_draft_offers o
         WHERE o.draft_id = v_d.id AND public._canvas_offer_key(o.group_label) = public._canvas_offer_key(v_prev);
        IF NOT FOUND THEN
          INSERT INTO public.canvas_draft_offers (draft_id, group_label, why, state, created_run_id, created_at)
          VALUES (v_d.id, v_prev, NULL, 'offered', v_run.id, clock_timestamp()) RETURNING id INTO v_oid;
          v_new_offers := v_new_offers || v_oid;
        ELSIF v_row.state = 'focused' THEN
          UPDATE public.canvas_draft_offers o SET state = 'offered' WHERE o.id = v_row.id;
        END IF;
      END IF;
      UPDATE public.canvas_draft_offers o SET state = 'focused' WHERE o.id = v_offer.id;
    ELSIF v_first THEN
      v_focus := COALESCE(NULLIF(left(btrim(COALESCE(p_focus, '')), 120), ''), v_d.focus);
      -- (server review, Opus 2) the group the first draft takes as its focus is no longer an offer: a matching offered row becomes the focus (Undo of this run gives it back)
      UPDATE public.canvas_draft_offers o SET state = 'focused'
       WHERE o.draft_id = v_d.id AND o.state = 'offered' AND v_focus IS NOT NULL
         AND public._canvas_offer_key(o.group_label) = public._canvas_offer_key(v_focus);
    END IF;

    -- 5. the offer merge: a group matching an existing offer or the focus is ignored; at most 3 open offers (the one helper, also used by an upload on an empty scope below)
    v_new_offers := v_new_offers || public._canvas_draft_merge_offers(v_d.id, v_run.id, v_focus, p_other_canvases);

    UPDATE public.canvas_draft_steps s SET new_offer_ids = v_new_offers WHERE s.run_id = v_run.id;
    UPDATE public.canvas_drafts d SET pending_links = v_links, questions = v_q, focus = v_focus WHERE d.id = v_d.id;
  END IF;

  -- J9 (decided 2026-11-03 by Gemini Argon and Codex, for the founder at UAT): an UPLOAD may persist its offers even when the run's scope is empty. Typed and
  -- spoken input keep the empty-scope rule above (nothing changes, offers included). Offers ONLY: no step is made (so there is nothing to Undo, and the offer
  -- stays dismissable), and points, questions, links and the focus are not touched. The same merge (one helper), the same cap of 3 open offers and the same focus as step 5.
  IF cardinality(v_scope) = 0 AND v_run.kind = 'message' AND v_run.input_kind = 'file' THEN
    v_new_offers := v_new_offers || public._canvas_draft_merge_offers(v_d.id, v_run.id, v_focus, p_other_canvases);
  END IF;
  -- J9's labels, from the offers this run actually inserted (scoped or not; the first draft says "I found ..." in the engine's own reply instead)
  IF v_run.kind = 'message' AND NOT v_first AND cardinality(v_new_offers) > 0 THEN
    SELECT array_agg(o.group_label ORDER BY o.created_at, o.id) INTO v_j9_labels
      FROM public.canvas_draft_offers o WHERE o.id = ANY (v_new_offers);
  END IF;

  -- 6. the reply, carrying the run id
  v_reply := NULLIF(btrim(COALESCE(p_reply, '')), '');
  IF v_reply IS NULL AND (cardinality(v_scope) = 0 OR v_idle) THEN
    v_reply := 'Nothing changed on the canvas.' || COALESCE(' I noted: "' || NULLIF(left(btrim(COALESCE(p_note, '')), 160), '') || '"', '');
  END IF;
  -- J9's line, from the persisted offers and the current focus (so the reply matches durable state): "Your new file is also about A and B. This canvas stays about F."
  IF v_j9_labels IS NOT NULL THEN
    v_reply := 'Your ' || CASE v_run.input_kind WHEN 'file' THEN 'new file' WHEN 'voice' THEN 'voice note' ELSE 'message' END || ' is also about ' || CASE WHEN cardinality(v_j9_labels) = 1 THEN v_j9_labels[1]
                 ELSE array_to_string(v_j9_labels[1:cardinality(v_j9_labels) - 1], ', ') || ' and ' || v_j9_labels[cardinality(v_j9_labels)] END || '.'
               || COALESCE(' This canvas stays about ' || v_focus || '.', '') || COALESCE(E'\n' || v_reply, '');
  END IF;
  v_reply_id := public._canvas_draft_post_reply(v_d.conversation_id, v_d.thread_root_id, v_reply, v_run.derived_refs, v_run.id);

  -- 7. the run and the revision
  UPDATE public.canvas_draft_runs r
     SET state = 'done', finished_at = now(), scope = v_scope, reply_message_id = v_reply_id
   WHERE r.id = v_run.id;
  UPDATE public.canvas_drafts d
     SET revision = d.revision + 1, run_count = d.run_count + 1
   WHERE d.id = v_d.id;
  SELECT count(DISTINCT public._canvas_point_box(p.system_tags)) INTO v_boxes_filled
    FROM public.points p WHERE p.id = ANY (public._canvas_draft_point_ids(v_d.id));
  RETURN jsonb_build_object(
    'status', 'ok', 'applied', cardinality(v_scope) > 0 AND NOT v_idle, 'scope', to_jsonb(v_scope), 'dropped', v_drop,
    'kept', v_kept, 'created', v_made, 'boxes_filled', v_boxes_filled, 'offers_added', cardinality(v_new_offers),
    'reply_message_id', v_reply_id, 'revision', (SELECT d.revision FROM public.canvas_drafts d WHERE d.id = v_d.id),
    'version', v_d.version_name);
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_run_complete(uuid, uuid, jsonb, jsonb, text[], text, jsonb, text, text, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_run_complete(uuid, uuid, jsonb, jsonb, text[], text, jsonb, text, text, numeric)
  TO service_role;

-- LEGACY RESTATED, UNCHANGED: the 6-argument _canvas_draft_run_complete (the pre-v6 form the v6 file restated with its one added guard) is repeated here
-- byte for byte, AFTER the 10-argument function. Nothing about it changes. Why: src/tests/sd-guard-completeness.test.ts reads one definition per
-- function NAME per file and keeps the last, and the v6 file's last one was this overload; a file that holds only the 10-argument form would look like a
-- redefinition that dropped the v6 guard, when no guard of either overload is touched. Order matters for that reason.
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
  IF public._canvas_draft_is_v6(v_d.id) THEN
    RAISE EXCEPTION 'canvas draft: this draft belongs to the v6 engine; use _canvas_draft_run_complete(run, owner, ...)' USING ERRCODE = '55000';
  END IF;
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
    -- D20: no stance for a new or reworded point; a move or a keep with the SAME words (a private copy) keeps the owner's stance; with new words it is a reword and gets none
    IF v_type IN ('move', 'keep') AND v_stmt = btrim(v_op.statement) THEN
      INSERT INTO public.point_positions (point_id, user_id, position, reasoning)
      SELECT v_pid, v_d.owner_id, pp.position, pp.reasoning FROM public.point_positions pp WHERE pp.point_id = v_op.id AND pp.user_id = v_d.owner_id;
    END IF;
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
