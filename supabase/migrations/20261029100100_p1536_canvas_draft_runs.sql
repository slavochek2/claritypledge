-- P1536 WP1 (2 of 2): the draft engine's database side. Runs, material, the canvas spend bucket and the
-- service-role functions the canvas-draft edge function calls. Needs 20261029100000 (the tables; renamed from 20261027100000).
--
-- client-safe: the canvas drafting feature is unreleased (prod holds none of this). _mirror_limits and
--   _mirror_reserve keep their signatures and return shapes and only GAIN: new keys, one more allowed bucket, a
--   higher global_total_daily_usd (no client reads _mirror_limits; it is closed to every client role). The
--   mirror_ai_spend bucket check is widened by one value. Every function below is closed to anon and authenticated
--   and executable by service_role only; no client function is added or changed here.
--
-- diffed against:
--   20261023120000_p1547_mirror_token_budget.sql  (_mirror_limits, its only live body; the blueprint named
--     20261023140000, which does not define it)
--   20261020213000_p1520_mirror_v2.sql            (_mirror_reserve, erase_chat_data_for; their latest bodies)
-- new function: _canvas_draft_post, _canvas_draft_run_begin, _canvas_draft_add_material,
--   _canvas_draft_extract_complete, _canvas_draft_tensions_complete, _canvas_draft_run_complete,
--   _canvas_draft_run_fail (all new, grepped: no earlier body).
--
-- WHAT CHANGES
--   1. SPEND. mirror_ai_spend.bucket and _mirror_reserve accept 'canvas'. _mirror_limits gains canvas_max_usd,
--      extract_max_usd, person_canvas_daily_usd / _count and global_canvas_daily_usd. global_total_daily_usd rises
--      from 10 to 50 (founder decision 2026-10-27: $50/day across all mirror and canvas AI).
--   2. RUNS. One active run per owner (the unique index of 20261029100000). _canvas_draft_run_begin reserves the
--      spend, reads the draft's thread (owner messages and copies, never agent rows) under the same locks and with
--      the same erasure provenance (derived_refs) as _mirror_begin_job, and returns what the engine needs. A run
--      still marked running after 5 minutes is dead: it is failed, its reservation is charged in full, and a new
--      run may start. Revisions per draft: 5 draft runs and 5 tension runs.
--   3. WRITES. _canvas_draft_run_complete is one transaction: it deletes the points this draft created (and their
--      orphaned private stories), takes the draft's tag off reused points, applies the actions (keep, reword, move,
--      new), records the pending supersede links (only for an old point that is a head, never written onto a point
--      until Publish), posts the agent reply in the thread and settles the spend. Every point it writes is private,
--      carries a canvas: box tag and the draft version's canvas_ tag, has no user tag, and gets the owner's agree
--      position. Only the service role writes canvas: tags.
--   4. MATERIAL. At most 10 items per draft, at most 200,000 characters each; deleted by Publish or Discard.
--   5. ERASURE. erase_chat_data_for gains step 7, after the shared context lock of step 6: a queued or running canvas
--      run whose derived_refs include the erased person is CANCELLED, and the tensions and decided notes of every
--      draft with such a run are cleared. A completion of a cancelled run writes and posts nothing; it still settles
--      what its model call cost. The same rows a mirror job would be: begin refuses to start while an erase holds the lock.
--      The tensions a tension run stored keep that run's refs (canvas_drafts.tension_refs); a later draft run, which reads
--      those tensions, unions them into its own refs, so a copy deleted between the two runs does not hide the person
--      from erasure. Erasure clears tension_refs with the tensions.
--   6. A reused base point that is not private (a legacy public seed) cannot take the draft's tag (the P1515 trigger
--      refuses it): a keep becomes a private copy with no link, and a reword or move of one records no link.
--
-- BOUNDARY (stated, not hidden): a point written from a copy of another person's words is not reachable by
--   erase_chat_data_for (the agent reply, the stored tensions and the decided notes are, through derived_refs). The
--   engine's rules (quotes only from the owner's own text, a statement that must share words with its quote, numbers
--   only from the owner's material, other people's names filtered) are the control; see decisions.md.

BEGIN;

-- ============================================================================
-- 1. Spend
-- ============================================================================
ALTER TABLE public.mirror_ai_spend DROP CONSTRAINT IF EXISTS mirror_ai_spend_bucket_check;
ALTER TABLE public.mirror_ai_spend ADD CONSTRAINT mirror_ai_spend_bucket_check
  CHECK (bucket IN ('reply', 'portrait', 'canvas'));

CREATE OR REPLACE FUNCTION public._mirror_limits()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'reply_max_usd',             0.105,   -- (50000 in x $1.50 + 1200 out x $7.50) / 1e6 x 1.25; mirror-agent.ts BUDGET_TOKENS/MAX_OUT_TOKENS
    'portrait_max_usd',          0.70,    -- 2 generations x (primary + fallback image) + 2 vision checks, x 1.25
    'person_reply_daily_usd',    0.60,
    'person_reply_daily_count',  30,
    'person_portrait_daily_usd', 2.10,
    'person_portrait_daily_count', 3,
    'global_reply_daily_usd',    5.00,
    'global_portrait_daily_usd', 6.00,
    -- P1536 canvas drafts. canvas_max_usd = (63,000 in x $1.50 + 16,000 out x $7.50) / 1e6 x 1.25 (the mirror's
    -- reservation prices, not the registry's lower ones). extract_max_usd: one extraction call of a file.
    'canvas_max_usd',            0.27,
    'extract_max_usd',           0.35,
    'person_canvas_daily_usd',   3.00,
    'person_canvas_daily_count', 20,
    'global_canvas_daily_usd',   15.00,
    -- Founder 2026-10-27: $50/day across all mirror and canvas AI
    'global_total_daily_usd',    50.00
  );
$$;
REVOKE ALL ON FUNCTION public._mirror_limits() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._mirror_reserve(p_owner uuid, p_bucket text, p_max_usd numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lim      jsonb := public._mirror_limits();
  v_day      timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_person   numeric;
  v_person_n integer;
  v_bucket   numeric;
  v_total    numeric;
  v_id       uuid;
BEGIN
  IF p_bucket NOT IN ('reply', 'portrait', 'canvas') OR p_max_usd IS NULL OR p_max_usd <= 0 THEN
    RAISE EXCEPTION '_mirror_reserve: bad arguments' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('p1520_mirror_spend'));

  SELECT COALESCE(sum(COALESCE(s.actual_usd, s.reserved_usd)), 0), count(*)
    INTO v_person, v_person_n
    FROM public.mirror_ai_spend s
   WHERE s.owner_id = p_owner AND s.bucket = p_bucket AND s.created_at >= v_day AND s.state <> 'released';
  SELECT COALESCE(sum(COALESCE(s.actual_usd, s.reserved_usd)) FILTER (WHERE s.bucket = p_bucket), 0),
         COALESCE(sum(COALESCE(s.actual_usd, s.reserved_usd)), 0)
    INTO v_bucket, v_total
    FROM public.mirror_ai_spend s
   WHERE s.created_at >= v_day AND s.state <> 'released';

  IF v_person + p_max_usd > (v_lim ->> ('person_' || p_bucket || '_daily_usd'))::numeric
     OR v_person_n >= (v_lim ->> ('person_' || p_bucket || '_daily_count'))::integer
     OR v_bucket + p_max_usd > (v_lim ->> ('global_' || p_bucket || '_daily_usd'))::numeric
     OR v_total + p_max_usd > (v_lim ->> 'global_total_daily_usd')::numeric THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.mirror_ai_spend (owner_id, bucket, reserved_usd) VALUES (p_owner, p_bucket, p_max_usd)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public._mirror_reserve(uuid, text, numeric) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 1b. Erasure (erase_chat_data_for plus step 7)
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
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'erase_chat_data_for: no subject' USING ERRCODE = '22023';
  END IF;

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
  UPDATE public.mirror_jobs j
     SET state = 'cancelled', error_code = 'erased', finished_at = now()
   WHERE j.state IN ('queued', 'running') AND j.derived_refs @> ARRAY[v_ref];
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('mirror_jobs_cancelled', n);
  UPDATE public.chat_messages m
     SET body = NULL, deleted_at = COALESCE(m.deleted_at, now()), derived_refs = NULL
   WHERE m.kind = 'agent' AND m.derived_refs @> ARRAY[v_ref];
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('mirror_replies_erased', n);

  -- 7. (P1536) canvas draft runs that read their words. Same lock as step 6 (still held), so no run can record refs this
  -- step does not see. A cancelled run's completion writes and posts nothing. The tensions and decided notes of a
  -- draft are model output that can paraphrase what its runs read, and they are fed to its next run: cleared.
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
-- 2. The agent reply in a draft thread (internal)
-- ============================================================================
-- Same row shape as _mirror_complete_job's answer: no author, kind 'agent', inside the thread, carrying the refs of
-- everyone whose words it was derived from, so erasing one of them erases the reply.
CREATE OR REPLACE FUNCTION public._canvas_draft_post(p_conversation uuid, p_thread_root uuid, p_body text, p_refs text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NULLIF(btrim(COALESCE(p_body, '')), '') IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.chat_messages (conversation_id, author_id, body, kind, thread_root_id, derived_refs, created_at)
  VALUES (p_conversation, NULL, left(btrim(p_body), 4000), 'agent', p_thread_root, COALESCE(p_refs, '{}'), clock_timestamp());
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_post(uuid, uuid, text, text[]) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. Begin a run
-- ============================================================================
-- Returns {status: run|busy|capped|cap_reached|denied, ...}. 'run' carries what the engine reads: run_id,
-- reserved_usd, canvas_path (the app path of the draft), base_label ('v<seq>' or null on a first canvas),
-- base_points [{id, box, statement, story, is_head, other_positions}], material [{id, kind, label, text}],
-- tensions (as stored), other_names (text[]), thread [{kind:'owner_message', text} | {kind:'clarify_copy', label,
-- lines:[{by:'owner'|'other', text}]}] (agent rows and private asks excluded) and, for information, draft_points
-- (what the draft holds now: id, box, statement, story, reused), owner_first_name, owner_name, canvas_name,
-- version_name, run_count, tension_count.
-- kind 'extract' reserves the extraction price and reads nothing.
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
-- 4. Material
-- ============================================================================
-- {status: ok | limit | denied}. At most 10 items per draft; the text is cut at 200,000 characters.
CREATE OR REPLACE FUNCTION public._canvas_draft_add_material(p_owner uuid, p_draft uuid, p_kind text, p_label text, p_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max CONSTANT integer := 10;
  v_d    public.canvas_drafts;
  v_text text := left(COALESCE(p_text, ''), 200000);
  v_id   uuid;
BEGIN
  IF p_owner IS NULL OR p_draft IS NULL OR p_kind IS NULL OR p_kind NOT IN ('file', 'link') OR v_text = '' THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || p_owner::text, 0));
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft AND d.owner_id = p_owner FOR UPDATE;
  IF NOT FOUND OR v_d.state <> 'open' THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  IF (SELECT count(*) FROM public.canvas_draft_material m WHERE m.draft_id = p_draft) >= c_max THEN
    RETURN jsonb_build_object('status', 'limit');
  END IF;
  INSERT INTO public.canvas_draft_material (draft_id, owner_id, kind, label, text, chars)
  VALUES (p_draft, p_owner, p_kind, left(COALESCE(NULLIF(btrim(p_label), ''), p_kind), 200), v_text, char_length(v_text))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('status', 'ok', 'id', v_id, 'chars', char_length(v_text), 'truncated', char_length(COALESCE(p_text, '')) > 200000);
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_add_material(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_add_material(uuid, uuid, text, text, text) TO service_role;

-- An extract run's success: the material row, the run done, the spend settled, in one transaction.
-- {status: ok | limit | denied}. 'limit' still settles the call (it was made) and fails the run.
CREATE OR REPLACE FUNCTION public._canvas_draft_extract_complete(
  p_run uuid, p_owner uuid, p_draft uuid, p_label text, p_text text, p_usd numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_d    public.canvas_drafts;
  v_run  public.canvas_draft_runs;
  v_text text := left(COALESCE(p_text, ''), 200000);
  v_full numeric;
BEGIN
  IF p_run IS NULL OR p_owner IS NULL OR p_draft IS NULL THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || p_owner::text, 0));
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft AND d.owner_id = p_owner FOR UPDATE;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r
   WHERE r.id = p_run AND r.draft_id = p_draft AND r.owner_id = p_owner AND r.kind = 'extract' FOR UPDATE;
  IF v_run.id IS NOT NULL AND v_run.state = 'cancelled' THEN
    SELECT s.reserved_usd INTO v_full FROM public.mirror_ai_spend s WHERE s.id = v_run.spend_id;
    PERFORM public._mirror_settle(v_run.spend_id, COALESCE(p_usd, v_full));   -- erased: the call was made, nothing is kept
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  IF v_run.id IS NULL OR v_run.state <> 'running' THEN
    RETURN jsonb_build_object('status', 'denied');   -- a late answer of a dead run touches nothing
  END IF;
  SELECT s.reserved_usd INTO v_full FROM public.mirror_ai_spend s WHERE s.id = v_run.spend_id;
  PERFORM public._mirror_settle(v_run.spend_id, COALESCE(p_usd, v_full));

  IF v_d.id IS NULL OR v_d.state <> 'open' OR v_text = '' THEN
    UPDATE public.canvas_draft_runs r SET state = 'failed', error_code = 'draft_closed', finished_at = now() WHERE r.id = p_run;
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  IF (SELECT count(*) FROM public.canvas_draft_material m WHERE m.draft_id = p_draft) >= 10 THEN
    UPDATE public.canvas_draft_runs r SET state = 'failed', error_code = 'limit', finished_at = now() WHERE r.id = p_run;
    RETURN jsonb_build_object('status', 'limit');
  END IF;
  INSERT INTO public.canvas_draft_material (draft_id, owner_id, kind, label, text, chars)
  VALUES (p_draft, p_owner, 'file', left(COALESCE(NULLIF(btrim(p_label), ''), 'file'), 200), v_text, char_length(v_text));
  UPDATE public.canvas_draft_runs r SET state = 'done', finished_at = now() WHERE r.id = p_run;
  RETURN jsonb_build_object('status', 'ok', 'chars', char_length(v_text));
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_extract_complete(uuid, uuid, uuid, text, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_extract_complete(uuid, uuid, uuid, text, text, numeric) TO service_role;

-- ============================================================================
-- 5. Finish a run
-- ============================================================================
-- Slow speed with a current version: the tension options are stored on the draft and posted, and the run ends.
-- p_tensions is an array (the engine's [{id, point_id, summary, options, pick, why}]). Returns NULL for a late answer.
CREATE OR REPLACE FUNCTION public._canvas_draft_tensions_complete(p_run uuid, p_tensions jsonb, p_reply text, p_usd numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run  public.canvas_draft_runs;
  v_d    public.canvas_drafts;
  v_full numeric;
BEGIN
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_run.owner_id::text, 0));
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = v_run.draft_id FOR UPDATE;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run AND r.kind = 'tensions' FOR UPDATE;
  IF v_run.id IS NOT NULL AND v_run.state = 'cancelled' THEN
    SELECT s.reserved_usd INTO v_full FROM public.mirror_ai_spend s WHERE s.id = v_run.spend_id;
    PERFORM public._mirror_settle(v_run.spend_id, COALESCE(p_usd, v_full));   -- erased: the call was made, nothing is kept
    RETURN NULL;
  END IF;
  IF v_run.id IS NULL OR v_run.state <> 'running' THEN
    RETURN NULL;
  END IF;
  IF p_tensions IS NULL OR jsonb_typeof(p_tensions) <> 'array' OR jsonb_array_length(p_tensions) > 50 THEN
    RAISE EXCEPTION 'canvas draft: tensions must be an array of at most 50' USING ERRCODE = '22023';
  END IF;
  SELECT s.reserved_usd INTO v_full FROM public.mirror_ai_spend s WHERE s.id = v_run.spend_id;
  PERFORM public._mirror_settle(v_run.spend_id, COALESCE(p_usd, v_full));
  IF v_d.state <> 'open' THEN
    UPDATE public.canvas_draft_runs r SET state = 'failed', error_code = 'draft_closed', finished_at = now() WHERE r.id = p_run;
    RETURN NULL;
  END IF;
  UPDATE public.canvas_drafts d SET tensions = p_tensions, tension_refs = COALESCE(v_run.derived_refs, '{}') WHERE d.id = v_d.id;
  PERFORM public._canvas_draft_post(v_d.conversation_id, v_d.thread_root_id, p_reply, v_run.derived_refs);
  UPDATE public.canvas_draft_runs r SET state = 'done', finished_at = now() WHERE r.id = p_run;
  RETURN jsonb_build_object('status', 'ok', 'tensions', jsonb_array_length(p_tensions));
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_tensions_complete(uuid, jsonb, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_tensions_complete(uuid, jsonb, text, numeric) TO service_role;

-- The draft call's result, in ONE transaction (any error rolls every write back and leaves the run running, for
-- _canvas_draft_run_fail). Returns NULL for a late answer.
--   p_actions    [{action|type: keep, point_id} | {action|type: reword|move, old_point_id, box, statement, story}
--                | {action|type: new, box, statement, story}]; a point of the base version that no action names is
--                not carried (there is no drop action)
--   p_questions  {canvas box tag: question}, p_decided [{kind, text}]
-- A point is written only through this function: private, box tag + the draft version's canvas_ tag, NO user tag,
-- the owner's agree position, and the owner's private story when one is given. A pending supersede link (old, new)
-- is recorded for reword and move only when the old point is a head of the base version; it is written onto the
-- points by Publish, never here.
-- Not search_path = '': inserting points, stories, story_points and point_positions fires triggers that resolve
-- unqualified names (see _canvas_draft_clear_points). Every relation named here is schema-qualified.
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
    INSERT INTO public.point_positions (point_id, user_id, position) VALUES (v_pid, v_d.owner_id, 'agree');
    IF v_story <> '' THEN
      INSERT INTO public.stories (content, author_id, visibility)
      VALUES (v_story, v_d.owner_id, 'private'::public.content_visibility) RETURNING id INTO v_sid;
      INSERT INTO public.story_points (story_id, point_id, author_id) VALUES (v_sid, v_pid, v_d.owner_id);
      v_new_stories := v_new_stories || v_sid;   -- the engine wrote it: a revision or discard may delete it
    ELSIF v_type IN ('move', 'keep') THEN
      -- same words (another box, or a private copy of a public point): the owner's private stories of the old point
      -- follow it. They are the owner's, not the engine's: never recorded in created_story_ids.
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

-- A run that failed: the spend is settled at p_actual_usd (NULL means the call never started: released), the reply
-- (when given) is posted in the thread, and a draft or tension run that cost nothing (NULL or 0) does not count
-- against the draft's revisions. Returns false for a run that is not running.
CREATE OR REPLACE FUNCTION public._canvas_draft_run_fail(p_run uuid, p_code text, p_reply text, p_actual_usd numeric DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.canvas_draft_runs;
  v_d   public.canvas_drafts;
BEGIN
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_run.owner_id::text, 0));
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = v_run.draft_id FOR UPDATE;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run FOR UPDATE;
  IF v_run.state = 'cancelled' THEN
    PERFORM public._mirror_settle(v_run.spend_id, p_actual_usd);   -- erased: what the call cost is still counted
    RETURN false;
  END IF;
  IF v_run.state <> 'running' THEN
    RETURN false;
  END IF;
  IF v_run.spend_id IS NOT NULL THEN
    PERFORM public._mirror_settle(v_run.spend_id, p_actual_usd);
  END IF;
  IF COALESCE(p_actual_usd, 0) = 0 THEN
    UPDATE public.canvas_drafts d
       SET run_count     = GREATEST(d.run_count - CASE WHEN v_run.kind = 'draft' THEN 1 ELSE 0 END, 0),
           tension_count = GREATEST(d.tension_count - CASE WHEN v_run.kind = 'tensions' THEN 1 ELSE 0 END, 0)
     WHERE d.id = v_d.id;
  END IF;
  UPDATE public.canvas_draft_runs r
     SET state = 'failed', error_code = left(COALESCE(NULLIF(p_code, ''), 'error'), 40), finished_at = now()
   WHERE r.id = p_run;
  IF p_reply IS NOT NULL AND v_d.state = 'open' THEN
    PERFORM public._canvas_draft_post(v_d.conversation_id, v_d.thread_root_id, p_reply, v_run.derived_refs);
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_run_fail(uuid, text, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_run_fail(uuid, text, text, numeric) TO service_role;

COMMIT;
