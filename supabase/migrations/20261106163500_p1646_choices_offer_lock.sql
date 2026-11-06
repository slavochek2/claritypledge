-- client-safe: no deployed client calls _canvas_draft_choice_latest or _canvas_draft_run_complete_choice (service role only, the
-- canvas-draft edge function is the only caller); both keep name and arguments; no table, policy or client-callable change.
-- diffed against: 20261106151500_p1646_choices_follow_message.sql
-- P1646 re-review.
--  S1 (privacy race): an offer reads its request message FOR SHARE (a concurrent delete or edit of that message waits until this
--     transaction commits, and the follow-message trigger then removes the choice), requires it live, and requires its CURRENT
--     text, cut and trimmed exactly as the stored request is (left(btrim(..), 2000)), to EQUAL p_choice.request. A message edited
--     or deleted after the run began makes the offer fail with 22023 and no choice row. The text of a voice message is its
--     transcript (its body is empty), so the comparison uses the body, else the transcript.
--  S2: _canvas_draft_choice_latest never returns a superseded choice, so deleting the newest choice's message cannot bring an older,
--     superseded one back.
-- Idempotent: CREATE OR REPLACE only.

CREATE OR REPLACE FUNCTION public._canvas_draft_choice_latest(p_run uuid, p_owner uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_run public.canvas_draft_runs;
  v_c   public.canvas_draft_choices;
BEGIN
  IF p_run IS NULL OR p_owner IS NULL THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run;
  IF NOT FOUND OR v_run.owner_id IS DISTINCT FROM p_owner THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  -- a superseded choice is never returned (S2); open first, then newest (picked or kept), offer_run_id for a deterministic tie
  SELECT c.* INTO v_c FROM public.canvas_draft_choices c
   WHERE c.draft_id = v_run.draft_id AND c.owner_id = p_owner AND c.state <> 'superseded'
   ORDER BY (c.state = 'open') DESC, c.created_at DESC, c.offer_run_id DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;
  RETURN jsonb_build_object(
    'status', 'ok',
    'stale', v_c.fingerprint IS DISTINCT FROM public._canvas_draft_point_ids(v_run.draft_id),
    'choice', jsonb_build_object('id', v_c.id, 'state', v_c.state, 'request', v_c.request,
                                 'request_message_id', v_c.request_message_id,
                                 'conflicts_with', to_jsonb(v_c.conflicts_with), 'options', v_c.options,
                                 'recommended', v_c.recommended, 'reason', v_c.reason));
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_choice_latest(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_choice_latest(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public._canvas_draft_run_complete_choice(
  p_run uuid, p_owner uuid, p_questions jsonb, p_note text, p_reply text, p_usd numeric, p_choice jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_run    public.canvas_draft_runs;
  v_d      public.canvas_drafts;
  v_trig   public.chat_messages;
  v_boxes  text[] := public._canvas_box_tags();
  v_pre    uuid[];
  v_mode   text;
  v_scope  text[];
  v_acts   jsonb;
  v_res    jsonb;
  v_c      public.canvas_draft_choices;
  v_opts   jsonb;
  v_o      jsonb;
  v_i      integer;
  v_n      integer;
  v_conf   uuid[];
  v_repl   uuid[];
  v_want   uuid[];
  v_rec    text;
  v_req    text;
  v_reason text;
  v_letter text;
  v_keepl  text;
  v_opt    jsonb;
  v_id     uuid;
  v_tagged boolean;
  v_boxset text[];
  v_reqmsg uuid;
  v_msgtxt text;
  v_msgfound boolean;
BEGIN
  IF p_run IS NULL OR p_owner IS NULL THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run;
  IF NOT FOUND OR v_run.owner_id IS DISTINCT FROM p_owner THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  IF p_choice IS NULL OR jsonb_typeof(p_choice) <> 'object' THEN
    RAISE EXCEPTION 'canvas choice: choice must be an object' USING ERRCODE = '22023';
  END IF;
  v_mode := p_choice ->> 'mode';
  IF v_mode IS NULL OR v_mode NOT IN ('offer', 'apply', 'hold') THEN
    RAISE EXCEPTION 'canvas choice: unknown mode' USING ERRCODE = '22023';
  END IF;
  -- only message runs have choices; with an empty scope a focus or fork run would drop every point
  IF v_run.kind <> 'message' THEN
    RAISE EXCEPTION 'canvas choice: only a message run can offer or apply a choice' USING ERRCODE = '22023';
  END IF;

  -- same lock order as the inner function: the owner lock, the expire step, then the draft row, then the run row
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || p_owner::text, 0));
  PERFORM public._canvas_draft_expire(p_owner);
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = v_run.draft_id FOR UPDATE;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run FOR UPDATE;

  -- a run that is not live on an open draft is the inner function's business (cancelled, gone, draft_closed)
  IF v_run.state <> 'running' OR v_d.state <> 'open' THEN
    RETURN public._canvas_draft_run_complete(p_run, p_owner, '[]'::jsonb, '{}'::jsonb, '{}'::text[], NULL, '[]'::jsonb,
                                             p_note, p_reply, p_usd);
  END IF;

  IF v_run.trigger_message_id IS NOT NULL THEN
    SELECT m.* INTO v_trig FROM public.chat_messages m WHERE m.id = v_run.trigger_message_id;
  END IF;
  v_tagged := v_trig.box_refs IS NOT NULL;
  v_pre := public._canvas_draft_point_ids(v_d.id);

  -- "nothing applied" actions: an untagged run has an empty scope, so no action is needed; a tagged run's scope is its tags,
  -- so every point of those boxes is kept (the inner run is then idle)
  IF v_tagged THEN
    v_boxset := ARRAY(SELECT DISTINCT b FROM unnest(v_trig.box_refs) b WHERE b = ANY (v_boxes));
    v_acts := COALESCE((SELECT jsonb_agg(jsonb_build_object('action', 'keep', 'point_id', q))
                          FROM unnest(v_pre) q
                          JOIN public.points p ON p.id = q
                         WHERE public._canvas_point_box(p.system_tags) = ANY (v_boxset)), '[]'::jsonb);
  ELSE
    v_boxset := '{}'::text[];
    v_acts := '[]'::jsonb;
  END IF;

  IF v_mode = 'hold' THEN
    RETURN public._canvas_draft_run_complete(p_run, p_owner, v_acts, '{}'::jsonb, '{}'::text[], NULL, '[]'::jsonb,
                                             p_note, p_reply, p_usd);
  END IF;

  IF v_mode = 'offer' THEN
    -- shape checks: a bad offer raises, the transaction rolls back and the caller fails the run
    v_req := left(btrim(COALESCE(p_choice ->> 'request', '')), 2000);
    IF v_req = '' THEN
      RAISE EXCEPTION 'canvas choice: request is empty' USING ERRCODE = '22023';
    END IF;
    -- the owner's request message: required, of this draft's conversation, read FOR SHARE so a concurrent delete or edit waits
    -- for this transaction, live, and its CURRENT text must equal the request being stored (S1)
    BEGIN
      v_reqmsg := (p_choice ->> 'request_message_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_reqmsg := NULL;
    END;
    v_msgfound := false;
    IF v_reqmsg IS NOT NULL THEN
      SELECT true, left(btrim(COALESCE(NULLIF(btrim(COALESCE(m.body, '')), ''), m.transcript, '')), 2000)
        INTO v_msgfound, v_msgtxt
        FROM public.chat_messages m
       WHERE m.id = v_reqmsg AND m.conversation_id = v_d.conversation_id AND m.deleted_at IS NULL
         FOR SHARE OF m;
    END IF;
    IF NOT COALESCE(v_msgfound, false) THEN
      RAISE EXCEPTION 'canvas choice: request_message_id must name a live message of this conversation' USING ERRCODE = '22023';
    END IF;
    IF v_msgtxt IS DISTINCT FROM v_req THEN
      RAISE EXCEPTION 'canvas choice: the request message changed, the request no longer matches it' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_choice -> 'conflicts_with') IS DISTINCT FROM 'array' OR jsonb_array_length(p_choice -> 'conflicts_with') = 0 THEN
      RAISE EXCEPTION 'canvas choice: conflicts_with must be a non-empty array' USING ERRCODE = '22023';
    END IF;
    BEGIN
      SELECT array_agg(DISTINCT e::uuid) INTO v_conf FROM jsonb_array_elements_text(p_choice -> 'conflicts_with') e;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'canvas choice: conflicts_with holds a bad id' USING ERRCODE = '22023';
    END;
    IF NOT (v_conf <@ v_pre) THEN
      RAISE EXCEPTION 'canvas choice: conflicts_with names a point that is not on the draft' USING ERRCODE = '22023';
    END IF;
    v_opts := p_choice -> 'options';
    IF jsonb_typeof(v_opts) IS DISTINCT FROM 'array' OR jsonb_array_length(v_opts) NOT BETWEEN 1 AND 2 THEN
      RAISE EXCEPTION 'canvas choice: options must be an array of 1 or 2' USING ERRCODE = '22023';
    END IF;
    v_n := jsonb_array_length(v_opts);
    FOR v_i IN 0 .. v_n - 1 LOOP
      v_o := v_opts -> v_i;
      IF jsonb_typeof(v_o) IS DISTINCT FROM 'object'
         OR (v_o ->> 'letter') IS DISTINCT FROM chr(65 + v_i)
         OR (v_o ->> 'kind') IS NULL OR (v_o ->> 'kind') NOT IN ('replace', 'add')
         OR (v_o ->> 'box') IS NULL OR NOT ((v_o ->> 'box') = ANY (v_boxes))
         OR jsonb_typeof(v_o -> 'statement') IS DISTINCT FROM 'string'
         OR char_length(btrim(v_o ->> 'statement')) NOT BETWEEN 1 AND 300
         OR jsonb_typeof(v_o -> 'quote') IS DISTINCT FROM 'string'
         OR char_length(btrim(v_o ->> 'quote')) NOT BETWEEN 1 AND 400
         OR char_length(COALESCE(v_o ->> 'means', '')) > 300
         OR jsonb_typeof(v_o -> 'also_revisit') IS DISTINCT FROM 'array'
         OR jsonb_typeof(v_o -> 'replaces') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'canvas choice: bad option %', v_i USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_o -> 'also_revisit') t
                  WHERE NOT (t = ANY (v_boxes)) OR t = (v_o ->> 'box')) THEN
        RAISE EXCEPTION 'canvas choice: bad also_revisit in option %', v_i USING ERRCODE = '22023';
      END IF;
      BEGIN
        SELECT COALESCE(array_agg(DISTINCT e::uuid), '{}'::uuid[]) INTO v_repl FROM jsonb_array_elements_text(v_o -> 'replaces') e;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'canvas choice: replaces holds a bad id in option %', v_i USING ERRCODE = '22023';
      END;
      IF (v_o ->> 'kind') = 'add' AND cardinality(v_repl) <> 0 THEN
        RAISE EXCEPTION 'canvas choice: an add option replaces nothing' USING ERRCODE = '22023';
      END IF;
      IF (v_o ->> 'kind') = 'replace' THEN
        -- EXACTLY the conflicting points of the option's own box: a subset would leave a contradicting point beside the new one
        SELECT COALESCE(array_agg(q), '{}'::uuid[]) INTO v_want
          FROM unnest(v_conf) q JOIN public.points p ON p.id = q
         WHERE public._canvas_point_box(p.system_tags) = (v_o ->> 'box');
        IF cardinality(v_want) = 0 OR cardinality(v_repl) = 0 OR NOT (v_repl <@ v_want) THEN
          RAISE EXCEPTION 'canvas choice: a replace option must replace conflicting points of its own box' USING ERRCODE = '22023';
        END IF;
        IF NOT (v_want <@ v_repl) THEN
          RAISE EXCEPTION 'canvas choice: a replace option must replace exactly the conflicting points of its own box' USING ERRCODE = '22023';
        END IF;
      END IF;
    END LOOP;
    v_rec := p_choice ->> 'recommended';
    IF v_rec IS NULL OR v_rec NOT IN ('A', 'B', 'keep') OR (v_rec = 'B' AND v_n < 2) THEN
      RAISE EXCEPTION 'canvas choice: bad recommended' USING ERRCODE = '22023';
    END IF;
    v_reason := NULLIF(left(btrim(COALESCE(p_choice ->> 'reason', '')), 400), '');

    -- the offer writes nothing to the canvas: the inner run applies nothing
    v_res := public._canvas_draft_run_complete(p_run, p_owner, v_acts, '{}'::jsonb, '{}'::text[], NULL, '[]'::jsonb,
                                               p_note, p_reply, p_usd);
    IF v_res ->> 'status' = 'ok' THEN
      UPDATE public.canvas_draft_choices c SET state = 'superseded', closed_at = now()
       WHERE c.draft_id = v_d.id AND c.state = 'open';
      INSERT INTO public.canvas_draft_choices (draft_id, owner_id, offer_run_id, request, request_message_id, conflicts_with,
                                               options, recommended, reason, fingerprint)
      VALUES (v_d.id, p_owner, p_run, v_req, v_reqmsg, v_conf, v_opts, v_rec, v_reason, v_pre)
      RETURNING id INTO v_id;
      RETURN v_res || jsonb_build_object('choice_id', v_id);
    END IF;
    RETURN v_res;
  END IF;

  -- v_mode = 'apply'
  BEGIN
    v_id := (p_choice ->> 'choice_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_id := NULL;
  END;
  v_letter := p_choice ->> 'letter';
  IF v_id IS NOT NULL THEN
    SELECT c.* INTO v_c FROM public.canvas_draft_choices c WHERE c.id = v_id AND c.draft_id = v_d.id FOR UPDATE;
  END IF;
  IF v_id IS NULL OR v_c.id IS NULL
     OR v_c.owner_id IS DISTINCT FROM p_owner OR v_c.state <> 'open'
     OR v_c.fingerprint IS DISTINCT FROM v_pre THEN
    RETURN jsonb_build_object('status', 'stale');
  END IF;
  v_n := jsonb_array_length(v_c.options);
  v_keepl := chr(65 + v_n);
  IF v_letter IS NULL OR NOT (v_letter = v_keepl OR v_letter = ANY (ARRAY(SELECT o ->> 'letter' FROM jsonb_array_elements(v_c.options) o))) THEN
    RETURN jsonb_build_object('status', 'stale');
  END IF;

  IF v_letter = v_keepl THEN
    -- nothing is written; a tagged run keeps every point of its tagged boxes (v_acts), an untagged run has an empty scope
    v_res := public._canvas_draft_run_complete(p_run, p_owner, v_acts, '{}'::jsonb, '{}'::text[], NULL, '[]'::jsonb,
                                               p_note, p_reply, p_usd);
    IF v_res ->> 'status' = 'ok' THEN
      UPDATE public.canvas_draft_choices c
         SET state = 'kept', picked_letter = v_letter, picked_run_id = p_run, closed_at = now() WHERE c.id = v_c.id;
    END IF;
    RETURN v_res;
  END IF;

  -- an option: the actions are built from the STORED option, never from the caller
  SELECT o INTO v_opt FROM jsonb_array_elements(v_c.options) o WHERE o ->> 'letter' = v_letter;
  -- a tagged message is exactly its tags: a pick whose box is not among them is refused (stale), never widened
  IF v_tagged AND NOT ((v_opt ->> 'box') = ANY (v_boxset)) THEN
    RETURN jsonb_build_object('status', 'stale');
  END IF;
  SELECT COALESCE(array_agg(e::uuid), '{}'::uuid[]) INTO v_repl FROM jsonb_array_elements_text(v_opt -> 'replaces') e;
  -- scope: untagged -> only the option's box (passed as p_scope); tagged -> the inner function takes it from the tags
  v_scope := ARRAY[v_opt ->> 'box'];
  v_acts := COALESCE((SELECT jsonb_agg(jsonb_build_object('action', 'keep', 'point_id', q))
                        FROM unnest(v_pre) q
                        JOIN public.points p ON p.id = q
                       WHERE NOT (q = ANY (v_repl))
                         AND CASE WHEN v_tagged THEN public._canvas_point_box(p.system_tags) = ANY (v_boxset)
                                  ELSE public._canvas_point_box(p.system_tags) = (v_opt ->> 'box') END), '[]'::jsonb)
            || jsonb_build_array(jsonb_build_object('action', 'new', 'box', v_opt ->> 'box',
                                                    'statement', btrim(v_opt ->> 'statement'), 'story', NULL));
  v_res := public._canvas_draft_run_complete(p_run, p_owner, v_acts, p_questions, v_scope, NULL, '[]'::jsonb,
                                             p_note, p_reply, p_usd);
  IF v_res ->> 'status' = 'ok' THEN
    UPDATE public.canvas_draft_choices c
       SET state = 'picked', picked_letter = v_letter, picked_run_id = p_run, closed_at = now() WHERE c.id = v_c.id;
  END IF;
  RETURN v_res;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_run_complete_choice(uuid, uuid, jsonb, text, text, numeric, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_run_complete_choice(uuid, uuid, jsonb, text, text, numeric, jsonb)
  TO service_role;
