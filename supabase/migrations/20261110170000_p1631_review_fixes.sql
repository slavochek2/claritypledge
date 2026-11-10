-- client-safe: the new table is closed to every client role; the two service-role workers change signature (a run token argument) and no client calls them; mirror_request_reply and _mirror_voice_start_reply keep their argument lists, return types, SECURITY DEFINER, search_path and grants and only change which rows the quiet rule reads; clarify_start keeps its signature and answer.
-- new function: _clarify_complete
-- new function: _clarify_fail
-- Migration: P1631 step 1 review fixes (hostile review rounds 1: Opus H1 H2 M1 M2 L1, Codex 2 3 9, Gemini 7)
-- Created: 2026-11-10
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md
-- Guaranteed by: src/tests/p1631-clarify-drafts-migration.test.ts (source contract), src/tests/integration/p1631-clarify-drafts.test.ts (behaviour on the test database)
--
-- diffed against:
--   mirror_request_reply(uuid)       20261110153000_p1631_clarify_drafts.sql (its newest definition): that body byte for byte, except the P1631 quiet-rule block, which now reads clarify_threads (lines marked `-- P1631`).
--   _mirror_voice_start_reply()      20261110153000_p1631_clarify_drafts.sql (its newest definition): that body byte for byte, except the P1631 quiet-rule block, which now reads clarify_threads (lines marked `-- P1631`).
--   clarify_start(uuid)              20261110153000_p1631_clarify_drafts.sql (its newest definition): that body byte for byte plus ONE statement marked `-- P1631` (the thread marker).
--   _clarify_begin(uuid)             20261110153000_p1631_clarify_drafts.sql (its newest definition): that body byte for byte plus the lines marked `-- P1631`.
--   _clarify_complete, _clarify_fail 20261110153000_p1631_clarify_drafts.sql (their newest definitions): old signatures dropped; bodies plus the run token and the lines marked `-- P1631`.
--   _clarify_erase_person(uuid)      20261110160000_p1631_erase_cleanup_in_erase_fn.sql (its newest definition): that body byte for byte plus the lines marked `-- P1631`.
--
-- Fixes (each pinned by an integration scenario):
--   H1  a draft's derived_refs include the derived_refs of the earlier drafts whose statements it receives as already_drafted.
--   H2  the quiet rule reads clarify_threads (one row per Clarify thread root, written by clarify_start), not the draft rows, so deleting the last draft cannot turn the generic Mirror reply on.
--   M1/M2  _clarify_begin returns run_token (the run's spend id); _clarify_complete and _clarify_fail require it to be the draft's CURRENT spend, else they touch only the stale run's own spend.
--   L1  _clarify_begin does not start a queued draft older than 5 minutes: it fails it `abandoned` (as get_clarify_thread already reports it).
--   (Codex 3)  contention in _clarify_begin answers busy with reason 'locked', so the handler can tell it from a run that is genuinely in progress and retry.
--   (Codex 9)  a provider cap (code 'cap') is stored as state 'capped', not 'failed'.
--   (Gemini 7)  _clarify_erase_person keeps a private point another user holds a position on, as _clarify_draft_drop_point does.

-- 1. the thread marker (H2) ----------------------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.clarify_threads (
  root_id    uuid PRIMARY KEY REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  owner_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clarify_threads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clarify_threads FROM PUBLIC, anon, authenticated;

INSERT INTO public.clarify_threads (root_id, owner_id)
SELECT DISTINCT d.thread_root_id, d.owner_id FROM public.clarify_drafts d
ON CONFLICT (root_id) DO NOTHING;

-- 2. owner entrance: mark the thread root ---------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clarify_start(p_source uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_row      public.chat_messages;
  v_src_conv uuid;
  v_id       uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1631:clarify:' || v_uid::text, 0));
  PERFORM public._clarify_sweep(v_uid);
  IF EXISTS (SELECT 1 FROM public.clarify_drafts d WHERE d.owner_id = v_uid AND d.state IN ('queued', 'running')) THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;
  BEGIN
    v_row := public.clarify_chat_message(p_source, NULL);
    SELECT m.conversation_id INTO v_src_conv FROM public.chat_messages m WHERE m.id = v_row.forwarded_from_message_id;
    INSERT INTO public.clarify_threads (root_id, owner_id) VALUES (v_row.id, v_uid) ON CONFLICT (root_id) DO NOTHING; -- P1631
    INSERT INTO public.clarify_drafts (owner_id, mirror_conversation_id, thread_root_id, source_conversation_id, source_message_id)
    VALUES (v_uid, v_row.conversation_id, v_row.id, v_src_conv, v_row.forwarded_from_message_id)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- the copy above is rolled back with this block
    RETURN jsonb_build_object('status', 'busy');
  END;
  RETURN jsonb_build_object('status', 'started', 'draft_id', v_id, 'thread_root_id', v_row.id, 'mirror_conversation_id', v_row.conversation_id);
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_start(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_start(uuid) TO authenticated;

-- 3. workers: run token (M1/M2), stale queued (L1), erased words through already_drafted (H1), contention reason, cap state ------------------------

DROP FUNCTION IF EXISTS public._clarify_complete(uuid, jsonb, numeric);
DROP FUNCTION IF EXISTS public._clarify_fail(uuid, text, numeric);

CREATE OR REPLACE FUNCTION public._clarify_begin(p_draft uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- 100,000 characters of conversation at about 3 per token is about 33,000 tokens; with the 23,000 of the bundled prompt the call stays inside the
  -- 63,000 input tokens that canvas_max_usd reserves for. The handler trims again by its own estimate before it calls the model.
  c_chars       constant integer := 100000;
  c_rows        constant integer := 2000;
  v_d           public.clarify_drafts;
  v_since       timestamptz;
  v_src         public.chat_messages;
  v_root        uuid;
  v_outside     boolean;
  v_session     boolean;
  v_thread_ids  uuid[];
  v_chat_ids    uuid[];
  v_locked      uuid[];
  v_all         uuid[];
  v_thread_chars integer;
  v_refs        text[];
  v_spend       uuid;
  v_usd         numeric;
  v_source      jsonb;
  v_thread      jsonb;
  v_chat        jsonb;
  v_already     jsonb;
  v_text        text;
BEGIN
  SELECT d.* INTO v_d FROM public.clarify_drafts d WHERE d.id = p_draft;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  IF v_d.state IN ('done', 'refused', 'failed', 'capped') THEN
    RETURN jsonb_build_object('status', v_d.state);
  END IF;
  IF v_d.state = 'running' THEN
    IF v_d.started_at > now() - interval '5 minutes' THEN
      RETURN jsonb_build_object('status', 'busy');
    END IF;
    -- a dead run: charged in full, failed
    PERFORM public._clarify_sweep(v_d.owner_id);
    RETURN jsonb_build_object('status', 'failed');
  END IF;
  IF v_d.updated_at < now() - interval '5 minutes' THEN -- P1631
    -- a draft nobody started within the abandon window is failed `abandoned`, as get_clarify_thread already reports it -- P1631
    PERFORM public._clarify_sweep(v_d.owner_id); -- P1631
    RETURN jsonb_build_object('status', 'failed'); -- P1631
  END IF; -- P1631

  v_since := public._chat_access_since(v_d.source_conversation_id, v_d.owner_id);
  IF v_since IS NULL THEN
    UPDATE public.clarify_drafts d SET state = 'failed', error_code = 'no_access', updated_at = now() WHERE d.id = p_draft AND d.state = 'queued';
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  SELECT m.* INTO v_src FROM public.chat_messages m
   WHERE m.id = v_d.source_message_id AND m.deleted_at IS NULL AND m.created_at >= v_since;
  IF NOT FOUND OR public._clarify_row_text(v_src) IS NULL THEN
    UPDATE public.clarify_drafts d SET state = 'failed', error_code = 'source_gone', updated_at = now() WHERE d.id = p_draft AND d.state = 'queued';
    RETURN jsonb_build_object('status', 'gone');
  END IF;

  -- the pressed message's thread, as clarify_chat_message copies it: an outside-rounds root carries its message alone; a session thread is wider
  v_root := COALESCE(v_src.thread_root_id, v_src.id);
  SELECT r.system_kind = 'outside_rounds', EXISTS (SELECT 1 FROM public.transcribe_session_threads st WHERE st.root_message_id = r.id)
    INTO v_outside, v_session FROM public.chat_messages r WHERE r.id = v_root;
  v_session := COALESCE(v_session, false);
  v_outside := COALESCE(v_outside, false) AND NOT v_session;

  v_thread_ids := ARRAY(
      SELECT s.id FROM (
        SELECT x.id, sum(public._mirror_ask_row_chars(x)) OVER (ORDER BY x.created_at DESC, x.id DESC
                 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
          FROM public.chat_messages x
         WHERE NOT v_outside AND (x.id = v_root OR x.thread_root_id = v_root) AND x.id <> v_src.id
           AND x.conversation_id = v_d.source_conversation_id
           AND x.kind = 'message' AND x.context_conversation_id IS NULL
           AND x.deleted_at IS NULL AND x.created_at >= v_since AND x.created_at <= v_d.created_at
         ORDER BY x.created_at DESC, x.id DESC
         LIMIT CASE WHEN v_session THEN 720 ELSE 100 END) s
       WHERE COALESCE(s.before, 0) < c_chars / 2);
  SELECT COALESCE(sum(public._mirror_ask_row_chars(x)), 0) INTO v_thread_chars
    FROM public.chat_messages x WHERE x.id = ANY (v_thread_ids || ARRAY[v_src.id]);

  -- the main chat of the source conversation up to the press, newest first within what is left of the budget
  v_chat_ids := ARRAY(
      SELECT s.id FROM (
        SELECT x.id, sum(public._mirror_ask_row_chars(x)) OVER (ORDER BY x.created_at DESC, x.id DESC
                 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
          FROM public.chat_messages x
         WHERE x.conversation_id = v_d.source_conversation_id AND x.thread_root_id IS NULL
           AND x.kind = 'message' AND x.context_conversation_id IS NULL
           AND x.id <> v_src.id AND NOT (x.id = ANY (v_thread_ids))
           AND x.deleted_at IS NULL AND x.created_at >= v_since AND x.created_at <= v_d.created_at
         ORDER BY x.created_at DESC, x.id DESC LIMIT c_rows) s
       WHERE COALESCE(s.before, 0) < GREATEST(c_chars - v_thread_chars, 0));

  -- ONE lock pass over every row read, FOR SHARE SKIP LOCKED (see _mirror_begin_job): a row an erase or an edit holds is never read, never sent, and
  -- absent from derived_refs, which are computed from exactly the rows locked and read below.
  SELECT COALESCE(array_agg(q.id), '{}') INTO v_locked FROM (
    SELECT m.id FROM public.chat_messages m
     WHERE m.id = ANY (v_thread_ids || v_chat_ids || ARRAY[v_src.id])
     ORDER BY m.created_at, m.id FOR SHARE SKIP LOCKED) q;
  IF NOT (v_src.id = ANY (v_locked)) THEN
    RETURN jsonb_build_object('status', 'busy', 'reason', 'locked'); -- P1631
  END IF;
  v_thread_ids := ARRAY(SELECT u FROM unnest(v_thread_ids) u WHERE u = ANY (v_locked));
  v_chat_ids   := ARRAY(SELECT u FROM unnest(v_chat_ids) u WHERE u = ANY (v_locked));
  v_all := v_thread_ids || v_chat_ids || ARRAY[v_src.id];

  -- erasure takes this lock exclusively before it scrubs derived work; TRY, never wait (a wait while holding the rows above could close a cycle)
  IF NOT pg_try_advisory_xact_lock_shared(hashtext('p1520_mirror_context')) THEN
    RETURN jsonb_build_object('status', 'busy', 'reason', 'locked'); -- P1631
  END IF;

  -- the source row again, now that it is locked: an edit or an erase may have changed it
  SELECT m.* INTO v_src FROM public.chat_messages m WHERE m.id = v_src.id;
  v_text := public._clarify_row_text(v_src);
  IF v_src.deleted_at IS NOT NULL OR v_text IS NULL THEN
    UPDATE public.clarify_drafts d SET state = 'failed', error_code = 'source_gone', updated_at = now() WHERE d.id = p_draft AND d.state = 'queued';
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  v_source := jsonb_build_object('id', v_src.id, 'text', left(v_text, 4000), 'is_pressed', true);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'text', left(public._clarify_row_text(t), 4000)) ORDER BY t.created_at, t.id), '[]'::jsonb)
    INTO v_thread FROM public.chat_messages t
   WHERE t.id = ANY (v_thread_ids) AND t.deleted_at IS NULL AND public._clarify_row_text(t) IS NOT NULL;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'text', left(public._clarify_row_text(t), 4000)) ORDER BY t.created_at, t.id), '[]'::jsonb)
    INTO v_chat FROM public.chat_messages t
   WHERE t.id = ANY (v_chat_ids) AND t.deleted_at IS NULL AND public._clarify_row_text(t) IS NOT NULL;

  -- whose words are in it, from exactly the rows read
  SELECT array_remove(array_agg(DISTINCT public._chat_author_ref(t.author_id)), NULL) INTO v_refs
    FROM public.chat_messages t WHERE t.id = ANY (v_all) AND t.deleted_at IS NULL AND t.author_id IS NOT NULL;

  -- the points this presser already made from this conversation: not to be repeated
  SELECT COALESCE(jsonb_agg(p.statement ORDER BY d2.created_at, d2.id), '[]'::jsonb) INTO v_already
    FROM public.clarify_drafts d2 JOIN public.points p ON p.id = d2.point_id
   WHERE d2.owner_id = v_d.owner_id AND d2.source_conversation_id = v_d.source_conversation_id AND d2.state = 'done';

  -- the words behind those statements are in this run too: their authors' refs are this draft's refs (so erasing one of them reaches this draft) -- P1631
  SELECT array_remove(array_agg(DISTINCT r.ref), NULL) INTO v_refs FROM ( -- P1631
    SELECT unnest(COALESCE(v_refs, '{}')) AS ref -- P1631
    UNION -- P1631
    SELECT unnest(d2.derived_refs) AS ref -- P1631
      FROM public.clarify_drafts d2 JOIN public.points p ON p.id = d2.point_id -- P1631
     WHERE d2.owner_id = v_d.owner_id AND d2.source_conversation_id = v_d.source_conversation_id AND d2.state = 'done') r; -- P1631

  -- the draft row, and its state again: another start may have run while this one waited
  SELECT d.* INTO v_d FROM public.clarify_drafts d WHERE d.id = p_draft FOR UPDATE;
  IF v_d.state <> 'queued' THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;

  v_usd := (public._mirror_limits() ->> 'canvas_max_usd')::numeric;
  v_spend := public._mirror_reserve(v_d.owner_id, 'canvas', v_usd);
  IF v_spend IS NULL THEN
    UPDATE public.clarify_drafts d SET state = 'capped', error_code = 'cap', updated_at = now() WHERE d.id = p_draft;
    RETURN jsonb_build_object('status', 'capped');
  END IF;

  UPDATE public.clarify_drafts d
     SET state = 'running', started_at = now(), spend_id = v_spend, error_code = NULL,
         derived_refs = COALESCE(v_refs, '{}'), sent_ids = v_all, updated_at = now()
   WHERE d.id = p_draft;

  RETURN jsonb_build_object(
    'status', 'run',
    'draft_id', p_draft,
    'run_token', v_spend, -- P1631
    'owner_id', v_d.owner_id,
    'reserved_usd', v_usd,
    'owner_instruction', v_d.instruction,
    'source_message', v_source,
    'thread', v_thread,
    'surrounding_chat', v_chat,
    'already_drafted', v_already);
END;
$$;
REVOKE ALL ON FUNCTION public._clarify_begin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._clarify_begin(uuid) TO service_role;

-- Complete a run. p_run is the run_token _clarify_begin returned: a completion whose token is not the draft's CURRENT spend is a stale run and
-- writes nothing (it settles only its own spend). Result shape and validation are unchanged (D6).
CREATE OR REPLACE FUNCTION public._clarify_complete(p_draft uuid, p_result jsonb, p_usd numeric, p_run uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_d        public.clarify_drafts;
  v_reserved numeric;
  v_charge   numeric;
  v_decision text;
  v_stmt     text;
  v_a        jsonb := '[]'::jsonb;
  v_b        jsonb := '[]'::jsonb;
  v_sugg     jsonb := '[]'::jsonb;
  v_el       jsonb;
  v_pid      uuid;
  v_bad      boolean := false;
BEGIN
  SELECT d.* INTO v_d FROM public.clarify_drafts d WHERE d.id = p_draft FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  SELECT s.reserved_usd INTO v_reserved FROM public.mirror_ai_spend s WHERE s.id = p_run; -- P1631
  v_charge := COALESCE(p_usd, v_reserved);
  IF v_d.state <> 'running' OR v_d.spend_id IS DISTINCT FROM p_run THEN -- P1631
    IF p_run IS NOT NULL THEN -- P1631
      PERFORM public._mirror_settle(p_run, v_charge); -- P1631
    END IF;
    RETURN jsonb_build_object('status', 'gone');
  END IF;

  IF p_result IS NULL OR jsonb_typeof(p_result) <> 'object' THEN
    v_bad := true;
  ELSE
    v_decision := p_result ->> 'decision';
    IF v_decision = 'draft' THEN
      v_stmt := btrim(COALESCE(p_result ->> 'statement', ''));
      IF char_length(v_stmt) NOT BETWEEN 1 AND 300 THEN
        v_bad := true;
      END IF;
      IF NOT v_bad AND p_result -> 'cited' IS NOT NULL AND jsonb_typeof(p_result -> 'cited') = 'object' THEN
        v_a := COALESCE(p_result -> 'cited' -> 'a', '[]'::jsonb);
        v_b := COALESCE(p_result -> 'cited' -> 'b', '[]'::jsonb);
      ELSIF NOT v_bad AND p_result -> 'cited' IS NOT NULL AND jsonb_typeof(p_result -> 'cited') <> 'null' THEN
        v_bad := true;
      END IF;
      IF NOT v_bad AND (jsonb_typeof(v_a) <> 'array' OR jsonb_typeof(v_b) <> 'array'
                        OR jsonb_array_length(v_a) > 20 OR jsonb_array_length(v_b) > 20) THEN
        v_bad := true;
      END IF;
      IF NOT v_bad THEN
        FOR v_el IN SELECT e FROM jsonb_array_elements(v_a || v_b) e LOOP
          -- one test per IF branch: the cast to uuid must only run on text that has the shape of one
          IF jsonb_typeof(v_el) <> 'string' THEN
            v_bad := true;
          ELSIF (v_el #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            v_bad := true;
          ELSIF NOT ((v_el #>> '{}')::uuid = ANY (v_d.sent_ids)) THEN
            v_bad := true;
          END IF;
        END LOOP;
      END IF;
    ELSIF v_decision = 'refuse' THEN
      -- an explicit instruction always drafts: a refusal answering one is not an answer
      IF v_d.instruction IS NOT NULL THEN
        v_bad := true;
      ELSIF jsonb_typeof(p_result -> 'suggestions') = 'array' THEN
        -- P1631: distinct strings only (the client keys its chips by text), first occurrence wins, at most 3
        SELECT COALESCE(jsonb_agg(to_jsonb(s.t) ORDER BY s.o), '[]'::jsonb) INTO v_sugg FROM ( -- P1631
          SELECT q.t, q.o FROM (SELECT btrim(e #>> '{}') AS t, min(o) AS o FROM jsonb_array_elements(p_result -> 'suggestions') WITH ORDINALITY AS x(e, o) -- P1631
           WHERE jsonb_typeof(e) = 'string' AND char_length(btrim(e #>> '{}')) BETWEEN 1 AND 200 GROUP BY btrim(e #>> '{}')) q -- P1631
           ORDER BY q.o LIMIT 3) s; -- P1631
      END IF;
      -- P1631: a refusal with nothing to offer after filtering is not an answer: bad_output (settled at the actual cost below)
      IF NOT v_bad AND jsonb_array_length(v_sugg) = 0 THEN -- P1631
        v_bad := true; -- P1631
      END IF; -- P1631
    ELSE
      v_bad := true;
    END IF;
  END IF;

  IF v_bad THEN
    UPDATE public.clarify_drafts d SET state = 'failed', error_code = 'bad_output', updated_at = now() WHERE d.id = v_d.id;
    PERFORM public._mirror_settle(v_d.spend_id, v_charge);
    RETURN jsonb_build_object('status', 'failed', 'code', 'bad_output');
  END IF;

  IF v_decision = 'draft' THEN
    INSERT INTO public.points (statement, first_validator_id, visibility, tags, system_tags)
    VALUES (v_stmt, v_d.owner_id, 'private'::public.content_visibility, '{}', '{}')
    RETURNING id INTO v_pid;
    UPDATE public.clarify_drafts d
       SET state = 'done', point_id = v_pid, cited = jsonb_build_object('a', v_a, 'b', v_b), suggestions = NULL, error_code = NULL, updated_at = now()
     WHERE d.id = v_d.id;
    PERFORM public._mirror_settle(v_d.spend_id, v_charge);
    RETURN jsonb_build_object('status', 'done', 'point_id', v_pid);
  END IF;

  UPDATE public.clarify_drafts d
     SET state = 'refused', suggestions = v_sugg, cited = NULL, error_code = NULL, updated_at = now()
   WHERE d.id = v_d.id;
  PERFORM public._mirror_settle(v_d.spend_id, v_charge);
  RETURN jsonb_build_object('status', 'refused');
END;
$$;
REVOKE ALL ON FUNCTION public._clarify_complete(uuid, jsonb, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._clarify_complete(uuid, jsonb, numeric, uuid) TO service_role;

-- Fail a run. p_usd is the cost to charge; NULL means the model was never called, so the reservation is released. p_run is the run token (see above).
-- p_code 'cap' (the provider's quota or key cap) is stored as state `capped`, anything else as `failed`.
CREATE OR REPLACE FUNCTION public._clarify_fail(p_draft uuid, p_code text, p_usd numeric, p_run uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_d public.clarify_drafts;
BEGIN
  SELECT d.* INTO v_d FROM public.clarify_drafts d WHERE d.id = p_draft FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF v_d.state <> 'running' OR v_d.spend_id IS DISTINCT FROM p_run THEN -- P1631
    IF p_run IS NOT NULL AND p_usd IS NOT NULL THEN -- P1631
      PERFORM public._mirror_settle(p_run, p_usd); -- P1631
    END IF;
    RETURN false;
  END IF;
  UPDATE public.clarify_drafts d
     SET state = CASE WHEN p_code = 'cap' THEN 'capped' ELSE 'failed' END, -- P1631
         error_code = left(COALESCE(NULLIF(btrim(p_code), ''), 'error'), 40), updated_at = now()
   WHERE d.id = v_d.id;
  PERFORM public._mirror_settle(v_d.spend_id, p_usd);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public._clarify_fail(uuid, text, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._clarify_fail(uuid, text, numeric, uuid) TO service_role;

-- 4. erasure keeps a point another user holds a position on (Gemini 7) -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._clarify_erase_person(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ref    text := public._chat_author_ref(p_uid);
  v_points uuid[];
BEGIN
  PERFORM 1 FROM public.clarify_drafts d WHERE d.derived_refs @> ARRAY[v_ref] ORDER BY d.id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT COALESCE(array_agg(d.point_id), '{}') INTO v_points
    FROM public.clarify_drafts d WHERE d.derived_refs @> ARRAY[v_ref] AND d.point_id IS NOT NULL;
  -- a run in flight is dead: its reservation is charged in full (the model may have been called), as the sweep does; the run's late completion settles nothing twice -- P1631
  UPDATE public.mirror_ai_spend s SET actual_usd = s.reserved_usd, state = 'settled', settled_at = now() -- P1631
   WHERE s.state = 'reserved' AND s.id IN (SELECT d.spend_id FROM public.clarify_drafts d -- P1631
                                           WHERE d.derived_refs @> ARRAY[v_ref] AND d.state = 'running' AND d.spend_id IS NOT NULL); -- P1631
  UPDATE public.clarify_drafts d
     SET state = 'failed', error_code = 'erased', point_id = NULL, suggestions = NULL, cited = NULL,
         derived_refs = '{}', sent_ids = '{}', updated_at = now()
   WHERE d.derived_refs @> ARRAY[v_ref];
  DELETE FROM public.points p WHERE p.id = ANY (v_points) AND p.visibility = 'private'::public.content_visibility
     AND NOT EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = p.id AND pp.user_id IS DISTINCT FROM p.first_validator_id); -- P1631
END;
$$;
REVOKE ALL ON FUNCTION public._clarify_erase_person(uuid) FROM PUBLIC, anon, authenticated;

-- 5. the generic Mirror reply stays silent in a Clarify-draft thread: now keyed on the thread marker, so deleting the last draft cannot turn it on (H2) ----

CREATE OR REPLACE FUNCTION public.mirror_request_reply(p_message uuid)
RETURNS TABLE (job_id uuid, state text, reply_message_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_msg public.chat_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT m.* INTO v_msg
    FROM public.chat_messages m
    JOIN public.chat_conversations c ON c.id = m.conversation_id
   WHERE m.id = p_message AND c.kind = 'mirror' AND c.owner_id = v_uid AND m.author_id = v_uid;
  IF NOT FOUND OR v_msg.deleted_at IS NOT NULL OR v_msg.kind NOT IN ('message', 'clarify') THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;

  -- P1536 (founder 2026-10-27: the mirror stays quiet in canvas threads): no job for any message in a thread rooted
  -- at a canvas draft, or for the root itself, whatever the draft's state (open, published or discarded). The canvas
  -- engine posts its own replies; in a published thread the client asks "Start a new version?". A job that already
  -- exists is still returned, as for a quiet share. Ordinary mirror threads are unchanged.
  -- Placed BEFORE P1576's transcript wait: a voice note in a canvas thread is quiet at once, never 'transcribing'
  -- (that state promises a Mirror reply once the transcript lands, and none will come here).
  IF EXISTS (SELECT 1 FROM public.canvas_drafts d
              WHERE d.thread_root_id = COALESCE(v_msg.thread_root_id, v_msg.id))
     AND NOT EXISTS (SELECT 1 FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id) THEN
    RETURN;
  END IF;

  -- P1576: a voice note is answered only once its transcript exists. No job until then; the client asks again.
  -- A transcript that is done but blank (a silent note) is treated as failed: nothing to answer.
  IF v_msg.audio_duration_ms IS NOT NULL
     AND (v_msg.transcript_status IS DISTINCT FROM 'done' OR btrim(COALESCE(v_msg.transcript, '')) = '') THEN
    RETURN QUERY SELECT NULL::uuid, CASE WHEN v_msg.transcript_status = 'pending'
                                         THEN 'transcribing' ELSE 'transcript_failed' END, NULL::uuid;
    RETURN;
  END IF;

  -- P1631: the same quiet rule for a Clarify-draft thread (its root, or any reply in it), keyed on the thread MARKER clarify_start writes, never on draft rows: deleting the last draft must not turn the generic reply on.
  -- Placed AFTER the transcript wait so the P1536 edit above (the canvas rule directly before that wait) stays one contiguous text, which
  -- p1536-draft-versions-migration.test.ts pins in the newest definition; a voice note here is answered 'transcribing' until its transcript lands,
  -- and the server-side voice path below is quiet at once.
  IF EXISTS (SELECT 1 FROM public.clarify_threads ct -- P1631
              WHERE ct.root_id = COALESCE(v_msg.thread_root_id, v_msg.id)) -- P1631
     AND NOT EXISTS (SELECT 1 FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id) THEN -- P1631
    RETURN; -- P1631
  END IF; -- P1631

  -- A share (a plain message with an attachment and no text) is filed quietly: no new job, no reply.
  IF v_msg.kind = 'message' AND v_msg.attachment_id IS NOT NULL AND btrim(coalesce(v_msg.body, '')) = ''
     AND NOT EXISTS (SELECT 1 FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id) THEN
    RETURN;
  END IF;

  INSERT INTO public.mirror_jobs (owner_id, kind, trigger_message_id, context_conversation_id)
  VALUES (v_uid, CASE WHEN v_msg.context_conversation_id IS NULL THEN 'reply' ELSE 'ask' END,
          v_msg.id, v_msg.context_conversation_id)
  ON CONFLICT (trigger_message_id) WHERE trigger_message_id IS NOT NULL DO NOTHING;

  RETURN QUERY
    SELECT j.id, j.state, j.reply_message_id FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id;
END;
$$;
REVOKE ALL ON FUNCTION public.mirror_request_reply(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_request_reply(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public._mirror_voice_start_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner  uuid;
  v_job    uuid;
  v_url    text;
  v_secret text;
  v_jwt    text;
BEGIN
  SELECT c.owner_id INTO v_owner
    FROM public.chat_conversations c
   WHERE c.id = NEW.conversation_id AND c.kind = 'mirror';
  -- P1631: the Mirror stays quiet in Clarify-draft threads too (the thread marker, see mirror_request_reply). Placed before the owner check so the P1536 edit below (the canvas rule directly after
  -- that check) stays one contiguous text, which p1536-draft-versions-migration.test.ts pins in the newest definition.
  IF EXISTS (SELECT 1 FROM public.clarify_threads ct -- P1631
              WHERE ct.root_id = COALESCE(NEW.thread_root_id, NEW.id)) THEN -- P1631
    RETURN NEW; -- P1631
  END IF; -- P1631
  IF v_owner IS NULL OR NEW.author_id IS DISTINCT FROM v_owner
     OR NEW.context_conversation_id IS NOT NULL OR NEW.deleted_at IS NOT NULL
     OR btrim(COALESCE(NEW.transcript, '')) = '' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.canvas_drafts d
              WHERE d.thread_root_id = COALESCE(NEW.thread_root_id, NEW.id)) THEN
    RETURN NEW; -- P1536: the mirror stays quiet in canvas threads
  END IF;

  BEGIN
    INSERT INTO public.mirror_jobs (owner_id, kind, trigger_message_id, context_conversation_id)
    VALUES (v_owner, 'reply', NEW.id, NULL)
    ON CONFLICT (trigger_message_id) WHERE trigger_message_id IS NOT NULL DO NOTHING;
    SELECT j.id INTO v_job FROM public.mirror_jobs j
     WHERE j.trigger_message_id = NEW.id AND j.state = 'queued';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_mirror_voice_start_reply: job not created (sqlstate %), transcript write kept', SQLSTATE;
    RETURN NEW;
  END;
  IF v_job IS NULL THEN
    RETURN NEW; -- already running, done, failed or cancelled: nothing to start
  END IF;

  -- A SEPARATE block: a failed dispatch must not roll back the queued job above. A queued job that never
  -- runs is still visible to the owner (the client's job check turns it into "failed, Try again").
  BEGIN
    SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'mirror_reply_url';
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'mirror_internal_secret';
    SELECT decrypted_secret INTO v_jwt    FROM vault.decrypted_secrets WHERE name = 'chat_voice_anon_key';
    IF v_url IS NULL OR v_secret IS NULL OR v_jwt IS NULL THEN
      RAISE WARNING '_mirror_voice_start_reply: vault config missing (url: %, secret: %, jwt: %), job left queued',
        (v_url IS NOT NULL), (v_secret IS NOT NULL), (v_jwt IS NOT NULL);
      RETURN NEW;
    END IF;
    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
                   'Content-Type',      'application/json',
                   'Authorization',     'Bearer ' || v_jwt,
                   'x-mirror-internal', v_secret),
      body    := jsonb_build_object('job_id', v_job),
      timeout_milliseconds := 60000);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_mirror_voice_start_reply: dispatch failed (sqlstate %), job left queued', SQLSTATE;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._mirror_voice_start_reply() FROM PUBLIC, anon, authenticated;
