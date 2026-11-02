-- P1536 section 3c wording table: an update that changed nothing reads "Nothing changed on the canvas. I noted: ..." (the note part only when there is one).
-- It supersedes "No box changed." (section 2, J11, S1.13). The engine already says it; this is the database's own fallback, used only when a run
-- completes with an empty scope and no reply text.
--
-- diffed against: 20261030080000_p1536_v6_engine.sql (_canvas_draft_run_complete, the 10-argument function: its body, signature, locking order, every guard and every
--   answer key unchanged, with exactly one changed line: the fallback reply literal in step 6). No later migration redefines this function. The test
--   src/tests/p1536-s5-nothing-changed.test.ts compares the two bodies and fails on any other difference.
-- client-safe: no signature, grant, table or column changes, and no client calls this function (service role only, as before). The only visible effect is the text of
--   a thread reply that the engine's own reply normally replaces; a client reading replies as plain text is unaffected.
--
-- Second change in the same function (J9, decided 2026-11-03 by Gemini Argon and Codex, for the founder at UAT): a run with input_kind = 'file' may persist offers and
--   say the J9 line with an EMPTY scope; the offer merge (copied from step 5), the cap, the focus and the names filter (done by the engine before the call) apply.
--   No step, no point, question, link or focus change. Typed and spoken input keep S1.4's empty-scope rule. S1.4's premise changes for uploads only.
-- Undo: with no step there is nothing to Undo for this run, and the offer stays dismissable (canvas_draft_offer_dismiss); a later Undo of an EARLIER run does not
--   touch it. A noisy file can leave a misleading offer; the owner dismisses it.
--
-- Rollback: re-run the v6 definition of this function.

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

    -- 3. the per-box merge of questions, scoped boxes only
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
    END IF;

    -- 5. the offer merge: a group matching an existing offer or the focus is ignored; at most 3 open offers
    FOR v_el IN SELECT e FROM jsonb_array_elements(COALESCE(p_other_canvases, '[]'::jsonb)) e LOOP
      v_label := CASE jsonb_typeof(v_el)
                   WHEN 'string' THEN v_el #>> '{}'
                   WHEN 'object' THEN COALESCE(v_el ->> 'group_label', v_el ->> 'group', v_el ->> 'label')
                 END;
      v_why := CASE WHEN jsonb_typeof(v_el) = 'object' THEN NULLIF(left(btrim(COALESCE(v_el ->> 'why', '')), 400), '') END;
      v_label := NULLIF(left(btrim(COALESCE(v_label, '')), 120), '');
      CONTINUE WHEN v_label IS NULL;
      CONTINUE WHEN v_focus IS NOT NULL AND public._canvas_offer_key(v_label) = public._canvas_offer_key(v_focus);
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.canvas_draft_offers o
         WHERE o.draft_id = v_d.id AND public._canvas_offer_key(o.group_label) = public._canvas_offer_key(v_label));
      SELECT count(*) INTO v_open FROM public.canvas_draft_offers o WHERE o.draft_id = v_d.id AND o.state = 'offered';
      CONTINUE WHEN v_open >= 3;
      -- clock_timestamp(): offers made by one run keep the model's order
      INSERT INTO public.canvas_draft_offers (draft_id, group_label, why, state, created_run_id, created_at)
      VALUES (v_d.id, v_label, v_why, 'offered', v_run.id, clock_timestamp()) RETURNING id INTO v_oid;
      v_new_offers := v_new_offers || v_oid;
    END LOOP;

    UPDATE public.canvas_draft_steps s SET new_offer_ids = v_new_offers WHERE s.run_id = v_run.id;
    UPDATE public.canvas_drafts d SET pending_links = v_links, questions = v_q, focus = v_focus WHERE d.id = v_d.id;
  END IF;

  -- J9 (decided 2026-11-03 by Gemini Argon and Codex, for the founder at UAT): an UPLOAD may persist its offers even when the run's scope is empty. Typed and
  -- spoken input keep the empty-scope rule above (nothing changes, offers included). Offers ONLY: no step is made (so there is nothing to Undo, and the offer
  -- stays dismissable), and points, questions, links and the focus are not touched. The same merge rules, the same cap of 3 open offers and the same focus
  -- as step 5 (its loop, copied: the test compares the two). The reply's first line is built below from the offers actually inserted.
  IF cardinality(v_scope) = 0 AND v_run.kind = 'message' AND v_run.input_kind = 'file' THEN
    FOR v_el IN SELECT e FROM jsonb_array_elements(COALESCE(p_other_canvases, '[]'::jsonb)) e LOOP
      v_label := CASE jsonb_typeof(v_el)
                   WHEN 'string' THEN v_el #>> '{}'
                   WHEN 'object' THEN COALESCE(v_el ->> 'group_label', v_el ->> 'group', v_el ->> 'label')
                 END;
      v_why := CASE WHEN jsonb_typeof(v_el) = 'object' THEN NULLIF(left(btrim(COALESCE(v_el ->> 'why', '')), 400), '') END;
      v_label := NULLIF(left(btrim(COALESCE(v_label, '')), 120), '');
      CONTINUE WHEN v_label IS NULL;
      CONTINUE WHEN v_focus IS NOT NULL AND public._canvas_offer_key(v_label) = public._canvas_offer_key(v_focus);
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.canvas_draft_offers o
         WHERE o.draft_id = v_d.id AND public._canvas_offer_key(o.group_label) = public._canvas_offer_key(v_label));
      SELECT count(*) INTO v_open FROM public.canvas_draft_offers o WHERE o.draft_id = v_d.id AND o.state = 'offered';
      CONTINUE WHEN v_open >= 3;
      -- clock_timestamp(): offers made by one run keep the model's order
      INSERT INTO public.canvas_draft_offers (draft_id, group_label, why, state, created_run_id, created_at)
      VALUES (v_d.id, v_label, v_why, 'offered', v_run.id, clock_timestamp()) RETURNING id INTO v_oid;
      v_new_offers := v_new_offers || v_oid;
    END LOOP;
    IF cardinality(v_new_offers) > 0 THEN
      SELECT array_agg(o.group_label ORDER BY o.created_at, o.id) INTO v_j9_labels
        FROM public.canvas_draft_offers o WHERE o.id = ANY (v_new_offers);
    END IF;
  END IF;

  -- 6. the reply, carrying the run id
  v_reply := NULLIF(btrim(COALESCE(p_reply, '')), '');
  IF v_reply IS NULL AND cardinality(v_scope) = 0 THEN
    v_reply := 'Nothing changed on the canvas.' || COALESCE(' I noted: "' || NULLIF(left(btrim(COALESCE(p_note, '')), 160), '') || '"', '');
  END IF;
  -- J9's line, from the persisted offers and the current focus (so the reply matches durable state): "Your new file is also about A and B. This canvas stays about F."
  IF v_j9_labels IS NOT NULL THEN
    v_reply := 'Your new file is also about ' || CASE WHEN cardinality(v_j9_labels) = 1 THEN v_j9_labels[1]
                 ELSE array_to_string(v_j9_labels[1:cardinality(v_j9_labels) - 1], ', ') || ' and ' || v_j9_labels[cardinality(v_j9_labels)] END || '.'
               || COALESCE(' This canvas stays about ' || v_focus || '.', '') || E'\n' || v_reply;
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
    'status', 'ok', 'applied', cardinality(v_scope) > 0, 'scope', to_jsonb(v_scope), 'dropped', v_drop,
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
