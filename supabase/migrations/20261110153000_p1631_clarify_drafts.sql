-- client-safe: only new objects (one table, new functions, one trigger) and two restated bodies that keep their argument lists, return types, SECURITY DEFINER, search_path and grants;
--   the restated bodies only ADD a refusal for a message in a Clarify-draft thread, which no deployed client creates. No client calls the service-role functions and none reads the new table
--   except the owner's SELECT on columns that carry no spend or erasure bookkeeping.
-- new function: clarify_start
-- new function: clarify_another
-- new function: clarify_retry
-- new function: clarify_draft_edit
-- new function: clarify_draft_delete
-- new function: get_clarify_thread
-- new function: _clarify_row_text
-- new function: _clarify_cited_rows
-- new function: _clarify_sweep
-- new function: _clarify_begin
-- new function: _clarify_complete
-- new function: _clarify_fail
-- new function: _clarify_draft_drop_point
-- Migration: P1631 step 1 — Clarify on a chat message starts a private draft point in the owner's Mirror
-- Created: 2026-11-10
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md (Invariants, Solution "Drafts", "How the agent writes a point"); design contract tmp/p1631-step1-design.md D1-D8
-- Guaranteed by: src/tests/p1631-clarify-drafts-migration.test.ts (source contract), src/tests/integration/p1631-clarify-drafts.test.ts (behaviour on the test database)
--
-- diffed against:
--   mirror_request_reply(uuid)       20261029100000_p1536_canvas_draft_versions.sql (its newest definition): that body byte for byte, plus ONE block marked `-- P1631`.
--   _mirror_voice_start_reply()      20261029100000_p1536_canvas_draft_versions.sql (its newest definition): that body byte for byte, plus ONE block marked `-- P1631`.
--   clarify_chat_message             NOT redefined: clarify_start calls it (newest body 20261104150000_p1604_mirror_session_transcript.sql), so the access check and the copy are that function's own.
--   _mirror_begin_job                NOT redefined: no job is ever created for a Clarify-draft thread (both job entrances are guarded here), so it never sees one.
--   erase_chat_data_for              NOT redefined here: the follow-up 20261110160000_p1631_erase_cleanup_in_erase_fn.sql adds the Clarify-draft cleanup to it (no trigger on chat_messages).
--
-- Design (D1-D8 of the design contract):
--   D1  the draft marker is a side table (clarify_drafts.point_id), never a system tag.
--   D2  spend reuses the `canvas` bucket and its caps: _mirror_reserve(owner, 'canvas', canvas_max_usd). _mirror_limits() is untouched.
--   D4  _clarify_begin sends the pressed row, its thread and the main chat of the source conversation (as the presser could read it, up to the press), newest first within a
--       character budget; rows go as {id, text} with no author names; derived_refs record whose words were read, for erasure.
--   D6  _clarify_complete validates the model's output (cited ids must be ids that were sent; statement 1..300) and stores ONLY the statement, the cited ids and the suggestions.
--   D7  a draft point is a real points row (private, first_validator_id = the presser, no tags, no system tags) created only here. Every list of points was checked (see the report):
--       none can show it, because each is public-only, canvas-tag-bound or by id under the owner-only private policy.
--   D8  one queued or running draft per owner (partial unique index); a second press answers `busy`.

-- 1. the table -------------------------------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.clarify_drafts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mirror_conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  thread_root_id         uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  source_conversation_id uuid NOT NULL,
  source_message_id      uuid NOT NULL,
  point_id               uuid REFERENCES public.points(id) ON DELETE SET NULL,
  state                  text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'running', 'done', 'refused', 'failed', 'capped')),
  instruction            text CHECK (instruction IS NULL OR char_length(instruction) <= 500),
  suggestions            jsonb CHECK (suggestions IS NULL OR jsonb_typeof(suggestions) = 'array'),
  cited                  jsonb CHECK (cited IS NULL OR jsonb_typeof(cited) = 'object'),
  spend_id               uuid,
  error_code             text CHECK (error_code IS NULL OR char_length(error_code) <= 40),
  derived_refs           text[] NOT NULL DEFAULT '{}',
  sent_ids               uuid[] NOT NULL DEFAULT '{}',
  started_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS clarify_drafts_one_active ON public.clarify_drafts (owner_id) WHERE state IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS clarify_drafts_thread ON public.clarify_drafts (thread_root_id, created_at);
CREATE INDEX IF NOT EXISTS clarify_drafts_derived_refs ON public.clarify_drafts USING gin (derived_refs);

ALTER TABLE public.clarify_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clarify_drafts FROM PUBLIC, anon, authenticated;
-- the owner reads their own drafts; never the spend link, the erasure refs or the ids that were sent to the model
GRANT SELECT (id, owner_id, mirror_conversation_id, thread_root_id, source_conversation_id, source_message_id, point_id, state, instruction,
              suggestions, cited, error_code, started_at, created_at, updated_at)
  ON public.clarify_drafts TO authenticated;
DROP POLICY IF EXISTS clarify_drafts_select ON public.clarify_drafts;
CREATE POLICY clarify_drafts_select ON public.clarify_drafts FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- 2. cleanup triggers --------------------------------------------------------------------------------------------------------------------

-- search_path note: the three functions that write `points` (_clarify_draft_drop_point, clarify_draft_edit, _clarify_complete) use
-- `SET search_path = public, pg_temp`, not '': the triggers on points (the supersede invariants) read `points` unqualified, so under '' they fail with
-- 42P01 (the same rule canvas_draft_edit_point states). Every name in their bodies is still schema-qualified.

-- A draft's point goes with the draft (delete, the Mirror's deletion, the account's deletion), unless someone other than the owner has a position on it.
CREATE OR REPLACE FUNCTION public._clarify_draft_drop_point()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.point_id IS NOT NULL THEN
    DELETE FROM public.points p
     WHERE p.id = OLD.point_id
       AND p.visibility = 'private'::public.content_visibility
       AND NOT EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = p.id AND pp.user_id IS DISTINCT FROM OLD.owner_id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._clarify_draft_drop_point() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS clarify_drafts_drop_point ON public.clarify_drafts;
CREATE TRIGGER clarify_drafts_drop_point
  AFTER DELETE ON public.clarify_drafts
  FOR EACH ROW EXECUTE FUNCTION public._clarify_draft_drop_point();

-- Erasure of a person is NOT a trigger on chat_messages (it would make every chat_messages writer a `points` writer for the P1364 drift guard): see 20261110160000_p1631_erase_cleanup_in_erase_fn.sql.

-- 3. helpers -------------------------------------------------------------------------------------------------------------------------------

-- The words of one message as the model may read them: its text, or the transcript of a finished voice note. NULL when it has neither.
CREATE OR REPLACE FUNCTION public._clarify_row_text(x public.chat_messages)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(NULLIF(btrim(x.body), ''),
                  CASE WHEN x.audio_duration_ms IS NOT NULL AND x.transcript_status = 'done' THEN NULLIF(btrim(x.transcript), '') END);
$$;
REVOKE ALL ON FUNCTION public._clarify_row_text(public.chat_messages) FROM PUBLIC, anon, authenticated;

-- A run that has been running for more than 5 minutes is dead: failed `abandoned`, its reservation charged in full (it may have been billed).
-- A draft still queued after 5 minutes was never started (the tab closed): failed `abandoned`, nothing was reserved. Without this a lost
-- invoke would hold the owner's one active slot for ever.
CREATE OR REPLACE FUNCTION public._clarify_sweep(p_owner uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.mirror_ai_spend s
     SET actual_usd = s.reserved_usd, state = 'settled', settled_at = now()
   WHERE s.state = 'reserved'
     AND s.id IN (SELECT d.spend_id FROM public.clarify_drafts d
                   WHERE d.owner_id = p_owner AND d.state = 'running' AND d.started_at < now() - interval '5 minutes');
  UPDATE public.clarify_drafts d
     SET state = 'failed', error_code = 'abandoned', updated_at = now()
   WHERE d.owner_id = p_owner
     AND ((d.state = 'running' AND d.started_at < now() - interval '5 minutes')
       OR (d.state = 'queued' AND d.updated_at < now() - interval '5 minutes'));
END;
$$;
REVOKE ALL ON FUNCTION public._clarify_sweep(uuid) FROM PUBLIC, anon, authenticated;

-- 4. owner-facing functions ----------------------------------------------------------------------------------------------------------------

-- Press Clarify on a message: the same access check and copy as clarify_chat_message (the copy row becomes the thread root in the presser's Mirror),
-- then a queued draft. The client invokes the clarify-draft edge function with the returned draft_id. A second press while one is active answers busy.
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

-- Another point in the same thread, optionally on the owner's instruction (a tapped suggestion, or "another point about pricing").
CREATE OR REPLACE FUNCTION public.clarify_another(p_thread_root uuid, p_instruction text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_last  public.clarify_drafts;
  v_instr text := NULLIF(btrim(COALESCE(p_instruction, '')), '');
  v_id    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_instr IS NOT NULL AND char_length(v_instr) > 500 THEN
    RAISE EXCEPTION 'clarify: instruction too long' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1631:clarify:' || v_uid::text, 0));
  PERFORM public._clarify_sweep(v_uid);
  SELECT d.* INTO v_last FROM public.clarify_drafts d
   WHERE d.thread_root_id = p_thread_root AND d.owner_id = v_uid
   ORDER BY d.created_at DESC, d.id DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clarify: thread not available' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clarify_drafts d WHERE d.owner_id = v_uid AND d.state IN ('queued', 'running')) THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;
  BEGIN
    INSERT INTO public.clarify_drafts (owner_id, mirror_conversation_id, thread_root_id, source_conversation_id, source_message_id, instruction)
    VALUES (v_uid, v_last.mirror_conversation_id, v_last.thread_root_id, v_last.source_conversation_id, v_last.source_message_id, v_instr)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'busy');
  END;
  RETURN jsonb_build_object('status', 'started', 'draft_id', v_id, 'thread_root_id', v_last.thread_root_id, 'mirror_conversation_id', v_last.mirror_conversation_id);
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_another(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_another(uuid, text) TO authenticated;

-- Retry a draft that failed or hit a cap: back to queued (the client then invokes the edge function again).
CREATE OR REPLACE FUNCTION public.clarify_retry(p_draft uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_d   public.clarify_drafts;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1631:clarify:' || v_uid::text, 0));
  PERFORM public._clarify_sweep(v_uid);
  SELECT d.* INTO v_d FROM public.clarify_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clarify: draft not available' USING ERRCODE = '42501';
  END IF;
  IF v_d.state NOT IN ('failed', 'capped') THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'not_retryable', 'state', v_d.state);
  END IF;
  IF EXISTS (SELECT 1 FROM public.clarify_drafts d WHERE d.owner_id = v_uid AND d.state IN ('queued', 'running')) THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;
  BEGIN
    UPDATE public.clarify_drafts d
       SET state = 'queued', error_code = NULL, spend_id = NULL, started_at = NULL, suggestions = NULL, cited = NULL,
           derived_refs = '{}', sent_ids = '{}', updated_at = now()
     WHERE d.id = v_d.id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'busy');
  END;
  RETURN jsonb_build_object('status', 'started', 'draft_id', v_d.id, 'thread_root_id', v_d.thread_root_id, 'mirror_conversation_id', v_d.mirror_conversation_id);
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_retry(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_retry(uuid) TO authenticated;

-- The owner edits the text of a draft point. A point is fixed once someone else has a position on it. An unchanged text writes nothing.
CREATE OR REPLACE FUNCTION public.clarify_draft_edit(p_draft uuid, p_statement text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_d    public.clarify_drafts;
  v_p    public.points;
  v_stmt text := btrim(COALESCE(p_statement, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT d.* INTO v_d FROM public.clarify_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clarify: draft not available' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_stmt) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'clarify: bad statement' USING ERRCODE = '22023';
  END IF;
  IF v_d.state <> 'done' OR v_d.point_id IS NULL THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'no_point');
  END IF;
  SELECT p.* INTO v_p FROM public.points p WHERE p.id = v_d.point_id AND p.first_validator_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'no_point');
  END IF;
  IF EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = v_p.id AND pp.user_id <> v_uid) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'fixed');
  END IF;
  IF v_stmt = btrim(v_p.statement) THEN
    RETURN jsonb_build_object('status', 'ok', 'changed', false, 'point_id', v_p.id);
  END IF;
  UPDATE public.points p SET statement = v_stmt WHERE p.id = v_p.id;
  RETURN jsonb_build_object('status', 'ok', 'changed', true, 'point_id', v_p.id);
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_draft_edit(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_draft_edit(uuid, text) TO authenticated;

-- Delete a draft (the client confirms first). Refused while it is being made. Its point goes with it unless someone else has a position on it.
CREATE OR REPLACE FUNCTION public.clarify_draft_delete(p_draft uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_d   public.clarify_drafts;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM public._clarify_sweep(v_uid);
  SELECT d.* INTO v_d FROM public.clarify_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clarify: draft not available' USING ERRCODE = '42501';
  END IF;
  IF v_d.state IN ('queued', 'running') THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'busy');
  END IF;
  DELETE FROM public.clarify_drafts d WHERE d.id = v_d.id;
  RETURN jsonb_build_object('status', 'ok', 'point_kept', EXISTS (SELECT 1 FROM public.points p WHERE p.id = v_d.point_id));
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_draft_delete(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_draft_delete(uuid) TO authenticated;

-- Cited ids resolved to the lines themselves, now: only rows the reader can still read, with no author names. Ids were checked against the rows sent when the draft was stored.
CREATE OR REPLACE FUNCTION public._clarify_cited_rows(p_ids jsonb, p_uid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', m.id, 'text', left(public._clarify_row_text(m), 4000), 'at', m.created_at) ORDER BY i.o), '[]'::jsonb)
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_ids) = 'array' THEN p_ids ELSE '[]'::jsonb END) WITH ORDINALITY AS i(id, o)
    JOIN public.chat_messages m ON m.id = i.id::uuid
   WHERE m.deleted_at IS NULL AND public._clarify_row_text(m) IS NOT NULL
     AND m.created_at >= COALESCE(public._chat_access_since(m.conversation_id, p_uid), 'infinity'::timestamptz);
$$;
REVOKE ALL ON FUNCTION public._clarify_cited_rows(jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- One Clarify thread as its owner sees it: the drafts oldest first. Cited lines are read from chat_messages by id, now, with no author names, and only rows the
-- owner can still read; quote text never comes from the model. A run past 5 minutes reads as failed `abandoned` (the sweep writes it at the next press or retry).
CREATE OR REPLACE FUNCTION public.get_clarify_thread(p_thread_root uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'thread_root_id', p_thread_root,
    'drafts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id,
        'state', CASE WHEN (d.state = 'running' AND d.started_at < now() - interval '5 minutes')
                        OR (d.state = 'queued' AND d.updated_at < now() - interval '5 minutes') THEN 'failed' ELSE d.state END,
        'error_code', CASE WHEN (d.state = 'running' AND d.started_at < now() - interval '5 minutes')
                        OR (d.state = 'queued' AND d.updated_at < now() - interval '5 minutes') THEN 'abandoned' ELSE d.error_code END,
        'instruction', d.instruction,
        'created_at', d.created_at,
        'point', CASE WHEN p.id IS NOT NULL THEN jsonb_build_object(
                   'id', p.id, 'statement', p.statement,
                   'owner_position', (SELECT pp.position::text FROM public.point_positions pp WHERE pp.point_id = p.id AND pp.user_id = v_uid)) END,
        'suggestions', d.suggestions,
        'cited', CASE WHEN d.cited IS NULL THEN NULL ELSE jsonb_build_object(
          'a', public._clarify_cited_rows(d.cited -> 'a', v_uid),
          'b', public._clarify_cited_rows(d.cited -> 'b', v_uid)) END
      ) ORDER BY d.created_at, d.id)
      FROM public.clarify_drafts d
      LEFT JOIN public.points p ON p.id = d.point_id AND p.first_validator_id = v_uid
     WHERE d.thread_root_id = p_thread_root AND d.owner_id = v_uid), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.get_clarify_thread(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_clarify_thread(uuid) TO authenticated;

-- 5. service-role worker functions --------------------------------------------------------------------------------------------------------

-- Begin one draft's run: reads the bounded context (D4), reserves the spend (D2), marks it running. status: run | busy | capped | gone | done | refused | failed.
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
    RETURN jsonb_build_object('status', 'busy');
  END IF;
  v_thread_ids := ARRAY(SELECT u FROM unnest(v_thread_ids) u WHERE u = ANY (v_locked));
  v_chat_ids   := ARRAY(SELECT u FROM unnest(v_chat_ids) u WHERE u = ANY (v_locked));
  v_all := v_thread_ids || v_chat_ids || ARRAY[v_src.id];

  -- erasure takes this lock exclusively before it scrubs derived work; TRY, never wait (a wait while holding the rows above could close a cycle)
  IF NOT pg_try_advisory_xact_lock_shared(hashtext('p1520_mirror_context')) THEN
    RETURN jsonb_build_object('status', 'busy');
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

-- Complete a run. p_result is {decision: 'draft'|'refuse', statement, cited: {a:[ids], b:[ids]}, suggestions:[text]}: the model's free text never arrives here (D6).
-- Every cited id must be one that was sent; the statement is 1..300 characters. Anything else fails the draft `bad_output` and settles at the actual cost.
-- p_usd NULL charges the full reservation. A run that is no longer running (erased, abandoned) settles its spend and writes nothing.
CREATE OR REPLACE FUNCTION public._clarify_complete(p_draft uuid, p_result jsonb, p_usd numeric)
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
  SELECT s.reserved_usd INTO v_reserved FROM public.mirror_ai_spend s WHERE s.id = v_d.spend_id;
  v_charge := COALESCE(p_usd, v_reserved);
  IF v_d.state <> 'running' THEN
    IF v_d.spend_id IS NOT NULL THEN
      PERFORM public._mirror_settle(v_d.spend_id, v_charge);
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
        SELECT COALESCE(jsonb_agg(to_jsonb(s.t) ORDER BY s.o), '[]'::jsonb) INTO v_sugg FROM (
          SELECT btrim(e #>> '{}') AS t, o FROM jsonb_array_elements(p_result -> 'suggestions') WITH ORDINALITY AS x(e, o)
           WHERE jsonb_typeof(e) = 'string' AND char_length(btrim(e #>> '{}')) BETWEEN 1 AND 200
           ORDER BY o LIMIT 3) s;
      END IF;
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
REVOKE ALL ON FUNCTION public._clarify_complete(uuid, jsonb, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._clarify_complete(uuid, jsonb, numeric) TO service_role;

-- Fail a run. p_usd is the cost to charge; NULL means the model was never called, so the reservation is released.
CREATE OR REPLACE FUNCTION public._clarify_fail(p_draft uuid, p_code text, p_usd numeric)
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
  IF v_d.state <> 'running' THEN
    IF v_d.spend_id IS NOT NULL AND p_usd IS NOT NULL THEN
      PERFORM public._mirror_settle(v_d.spend_id, p_usd);
    END IF;
    RETURN false;
  END IF;
  UPDATE public.clarify_drafts d
     SET state = 'failed', error_code = left(COALESCE(NULLIF(btrim(p_code), ''), 'error'), 40), updated_at = now()
   WHERE d.id = v_d.id;
  PERFORM public._mirror_settle(v_d.spend_id, p_usd);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public._clarify_fail(uuid, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._clarify_fail(uuid, text, numeric) TO service_role;

-- 6. the generic Mirror reply stays silent in a Clarify-draft thread --------------------------------------------------------------------------

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

  -- P1631: the same quiet rule for a Clarify-draft thread (its root, or any reply in it): the drafts are made by clarify-draft, never by a generic reply.
  -- Placed AFTER the transcript wait so the P1536 edit above (the canvas rule directly before that wait) stays one contiguous text, which
  -- p1536-draft-versions-migration.test.ts pins in the newest definition; a voice note here is answered 'transcribing' until its transcript lands,
  -- and the server-side voice path below is quiet at once.
  IF EXISTS (SELECT 1 FROM public.clarify_drafts cd
              WHERE cd.thread_root_id = COALESCE(v_msg.thread_root_id, v_msg.id))
     AND NOT EXISTS (SELECT 1 FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id) THEN
    RETURN;
  END IF;

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
  -- P1631: the Mirror stays quiet in Clarify-draft threads too. Placed before the owner check so the P1536 edit below (the canvas rule directly after
  -- that check) stays one contiguous text, which p1536-draft-versions-migration.test.ts pins in the newest definition.
  IF EXISTS (SELECT 1 FROM public.clarify_drafts cd
              WHERE cd.thread_root_id = COALESCE(NEW.thread_root_id, NEW.id)) THEN
    RETURN NEW;
  END IF;
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
