-- Migration: P1529 -- a next version after EVERY round the person owned (reverses D6's one version per evening)
-- Created: 2026-11-11
-- Spec: features/p1529_canvas_event_host_coordination.md ("UAT round 2026-11-11: founder decisions", items 2, 3, 7 and (c))
-- Guaranteed by: e2e/integration/p1529-db-schema.spec.ts
--
-- WHY. A published version this evening ended the task, and the offer only ever looked at the person's LATEST owning round. Now each
-- owned round offers one next version, drafted from the owner's latest published version, oldest unused round first.
--
-- WHAT. (1) event_next_version_taps gains auto_publish (the tap's intent: "Create next version" publishes when the run is done;
-- "Preview first" does not). (2) make_my_next_version(p_round, p_auto_publish): the same guards, minus the "next owning round started"
-- window; a round that already has a tap never gets a second run (its draft's state is returned); the round must be ENDED by the host,
-- never only past its clock. The one-argument form is dropped (the new second argument has a default, so a one-argument call still works).
-- (3) get_my_next_version_offer(p_event) returns the CURRENT item: the oldest owned round that can still move (offer, transcript_pending,
-- drafting, ready, failed, draft_open), with its draft and run when there is one; else, only for the break right after the person's own
-- round, an informational state (no_recording, transcript_missing after 10 minutes, no_canvas, published); else none.
--
-- diffed against: 20261106010200_p1529_trigger_message.sql (make_my_next_version, the latest definition; its trigger message text is kept),
--   20261105234000_p1529_round_screen_reads.sql (get_my_next_version_offer), 20261105220000 (_p1529_update_state, for the draft/run mapping).
-- diff: make_my_next_version: new parameter p_auto_publish; `v_ended IS NULL` alone now means round_still_on; the
--   next_owning_round_started refusal is removed; the repeat-tap read covers any tap of the round (open draft: started/repeat; published:
--   'published'; discarded: refused round_already_used); the tap row stores auto_publish. Every RAISE EXCEPTION message is unchanged.
--   get_my_next_version_offer: rewritten as a loop over the owned rounds. Grants and SECURITY settings unchanged.
-- client-safe: the offer's states grow (drafting, ready, failed, published, transcript_missing join the old ones) and carry draft ids; the
--   previous client reads get_my_update_state (unchanged, still present) and ignores unknown offer states as 'none'.

BEGIN;

ALTER TABLE public.event_next_version_taps ADD COLUMN IF NOT EXISTS auto_publish boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.make_my_next_version(uuid);

CREATE OR REPLACE FUNCTION public.make_my_next_version(p_round uuid, p_auto_publish boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event uuid;
  v_table integer;
  v_round_no integer;
  v_label text;
  v_thread public.chat_round_threads;
  v_canvas uuid;
  v_from uuid;
  v_since timestamptz;
  v_lines integer;
  v_open jsonb;
  v_draft public.canvas_drafts;
  v_msg public.chat_messages;
  v_author text;
  v_ended timestamptz;
  v_showcase boolean;
  v_result jsonb;
  v_tap public.event_next_version_taps;
  v_tap_state text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;

  SELECT r.event_id, s.table_no, r.round_no, r.ended_at, COALESCE(r.showcase, false)
    INTO v_event, v_table, v_round_no, v_ended, v_showcase
    FROM public.event_rounds r
    JOIN public.event_round_seats s ON s.round_id = r.id AND s.role = 'first'
    JOIN public.event_room_members m ON m.id = s.room_member_id AND m.profile_id = v_uid
   WHERE r.id = p_round;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'only this round''s Clarity Canvas owner can make the next version' USING ERRCODE = '42501';
  END IF;
  IF _event_flow(v_event) <> 'sales-mastermind' THEN
    RAISE EXCEPTION 'this event has no next version' USING ERRCODE = '22023';
  END IF;

  IF v_showcase THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'demo_round');
  END IF;
  -- Only between rounds: after the host ended this round. Never during a running round.
  IF v_ended IS NULL THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'round_still_on');
  END IF;

  -- At most one run per round: a tap that exists answers with its draft's state, never a second run.
  SELECT t.* INTO v_tap FROM public.event_next_version_taps t
   WHERE t.round_id = p_round AND t.profile_id = v_uid ORDER BY t.created_at DESC LIMIT 1;
  IF FOUND THEN
    SELECT d.state INTO v_tap_state FROM public.canvas_drafts d WHERE d.id = v_tap.draft_id;
    IF v_tap_state = 'open' THEN
      RETURN jsonb_build_object('status', 'started', 'repeat', true, 'draft_id', v_tap.draft_id);
    ELSIF v_tap_state = 'published' THEN
      RETURN jsonb_build_object('status', 'published', 'draft_id', v_tap.draft_id);
    END IF;
    RETURN jsonb_build_object('status', 'refused', 'code', 'round_already_used');
  END IF;

  SELECT ec.canvas_id INTO v_canvas FROM public.event_canvases ec WHERE ec.event_id = v_event AND ec.profile_id = v_uid;
  -- Each version is drafted from the owner's LATEST published version, so an older round never overwrites newer work.
  SELECT v.id INTO v_from FROM public.canvas_versions v
   WHERE v.canvas_id = v_canvas AND v.published_at IS NOT NULL ORDER BY v.published_seq DESC NULLS LAST LIMIT 1;
  IF v_from IS NULL THEN
    RETURN jsonb_build_object('status', 'no_canvas');
  END IF;

  SELECT t.* INTO v_thread FROM public.chat_round_threads t WHERE t.round_id = p_round AND t.table_no = v_table;
  IF FOUND THEN
    v_since := COALESCE(_chat_access_since(v_thread.conversation_id, v_uid), 'infinity'::timestamptz);
    IF NOT EXISTS (SELECT 1 FROM public.chat_messages root
                    WHERE root.id = v_thread.root_message_id AND root.deleted_at IS NULL AND root.created_at >= v_since) THEN
      RETURN jsonb_build_object('status', 'no_recording');
    END IF;
    SELECT count(*) INTO v_lines FROM public.chat_messages m
     WHERE m.conversation_id = v_thread.conversation_id AND m.thread_root_id = v_thread.root_message_id
       AND m.kind = 'message' AND m.deleted_at IS NULL AND m.created_at >= v_since AND m.body IS NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM public.transcribe_round_clean_jobs j
              WHERE j.round_id = p_round AND j.table_no = v_table AND j.status IN ('pending', 'processing')) THEN
    RETURN jsonb_build_object('status', 'transcript_pending');
  END IF;
  IF COALESCE(v_lines, 0) = 0 THEN
    RETURN jsonb_build_object('status', 'no_recording');
  END IF;

  IF EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.canvas_id = v_canvas AND d.state = 'open') THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'draft_already_open');
  END IF;

  BEGIN
  v_open := canvas_draft_open(v_from);
  SELECT d.* INTO v_draft FROM public.canvas_drafts d WHERE d.id = (v_open ->> 'draft_id')::uuid AND d.owner_id = v_uid;
  IF NOT FOUND THEN
    v_result := jsonb_build_object('status', 'refused', 'code', COALESCE(v_open ->> 'code', v_open ->> 'status'));
    RAISE EXCEPTION 'p1529 refused' USING ERRCODE = 'PA529';
  END IF;

  FOR v_msg IN
    SELECT m.* FROM public.chat_messages m
     WHERE m.conversation_id = v_thread.conversation_id AND m.thread_root_id = v_thread.root_message_id
       AND m.kind = 'message' AND m.deleted_at IS NULL AND m.created_at >= v_since AND m.body IS NOT NULL
     ORDER BY m.created_at, m.id
       FOR SHARE SKIP LOCKED
  LOOP
    SELECT COALESCE(p.name, 'Deleted user') INTO v_author FROM (SELECT 1) one LEFT JOIN public.profiles p ON p.id = v_msg.author_id;
    INSERT INTO public.chat_messages
      (conversation_id, thread_root_id, author_id, body, kind, forward_snapshot, forward_author_id,
       forwarded_from_message_id, client_id, created_at)
    VALUES
      (v_draft.conversation_id, v_draft.thread_root_id, v_uid, NULL, 'forward',
       jsonb_build_object('author_name', v_author, 'body', v_msg.body, 'created_at', v_msg.created_at,
                          'is_transcription', v_msg.is_transcription),
       v_msg.author_id, v_msg.id, _p1529_derived_id(v_draft.id, v_msg.id, 'copy'), clock_timestamp())
    ON CONFLICT (author_id, client_id) WHERE client_id IS NOT NULL DO NOTHING;
  END LOOP;

  v_label := 'Round ' || (SELECT count(*) FROM public.event_rounds r
                           WHERE r.event_id = v_event AND r.round_no <= v_round_no AND NOT COALESCE(r.showcase, false));
  -- [FOUNDER DECISION: the wording of this one message.]
  v_result := canvas_workspace_send(
    v_draft.canvas_id, NULL, v_draft.id, v_draft.revision, false,
    'Update my canvas from what was said in ' || v_label || '.', _canvas_box_tags(), NULL,
    _p1529_derived_id(p_round, v_draft.id, 'run'));
  IF v_result ->> 'status' = 'refused' THEN
    RAISE EXCEPTION 'p1529 refused' USING ERRCODE = 'PA529';
  END IF;
  INSERT INTO public.event_next_version_taps (round_id, profile_id, draft_id, auto_publish)
  VALUES (p_round, v_uid, v_draft.id, COALESCE(p_auto_publish, true));
  EXCEPTION WHEN SQLSTATE 'PA529' THEN
    RETURN v_result;
  END;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.make_my_next_version(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.make_my_next_version(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_next_version_offer(p_event uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  r record;
  v_canvas uuid;
  v_from uuid;
  v_thread public.chat_round_threads;
  v_since timestamptz;
  v_lines integer;
  v_tap public.event_next_version_taps;
  v_draft public.canvas_drafts;
  v_run public.canvas_draft_runs;
  v_state text;
  v_item jsonb;
  v_info jsonb := NULL;
  v_info_round uuid := NULL;
  v_newest_ended uuid;
BEGIN
  IF v_uid IS NULL OR public._event_flow(p_event) <> 'sales-mastermind' THEN
    RETURN jsonb_build_object('state', 'none');
  END IF;

  SELECT ec.canvas_id INTO v_canvas FROM public.event_canvases ec WHERE ec.event_id = p_event AND ec.profile_id = v_uid;

  FOR r IN
    SELECT rd.id, rd.ended_at, s.table_no
      FROM public.event_rounds rd
      JOIN public.event_round_seats s ON s.round_id = rd.id AND s.role = 'first'
      JOIN public.event_room_members m ON m.id = s.room_member_id AND m.profile_id = v_uid
     WHERE rd.event_id = p_event AND NOT COALESCE(rd.showcase, false) AND rd.ended_at IS NOT NULL
     ORDER BY rd.round_no ASC
  LOOP
    v_item := NULL;
    SELECT t.* INTO v_tap FROM public.event_next_version_taps t
     WHERE t.round_id = r.id AND t.profile_id = v_uid ORDER BY t.created_at DESC LIMIT 1;
    IF FOUND THEN
      SELECT d.* INTO v_draft FROM public.canvas_drafts d WHERE d.id = v_tap.draft_id;
      IF v_draft.state = 'open' THEN
        SELECT x.* INTO v_run FROM public.canvas_draft_runs x WHERE x.draft_id = v_draft.id ORDER BY x.created_at DESC, x.id DESC LIMIT 1;
        v_state := CASE WHEN v_run.state IN ('queued', 'running') THEN 'drafting' WHEN v_run.state = 'done' THEN 'ready' ELSE 'failed' END;
        RETURN jsonb_build_object('state', v_state, 'round_id', r.id, 'draft_id', v_draft.id, 'revision', v_draft.revision,
                                  'run_id', v_run.id, 'auto_publish', v_tap.auto_publish);
      ELSIF v_draft.state = 'published' THEN
        v_info := jsonb_build_object('state', 'published', 'round_id', r.id); v_info_round := r.id;
      ELSE
        v_info := NULL; v_info_round := NULL;
      END IF;
      CONTINUE;
    END IF;

    SELECT v.id INTO v_from FROM public.canvas_versions v
     WHERE v.canvas_id = v_canvas AND v.published_at IS NOT NULL ORDER BY v.published_seq DESC NULLS LAST LIMIT 1;
    IF v_from IS NULL THEN
      v_info := jsonb_build_object('state', 'no_canvas', 'round_id', r.id); v_info_round := r.id;
      CONTINUE;
    END IF;

    SELECT t.* INTO v_thread FROM public.chat_round_threads t WHERE t.round_id = r.id AND t.table_no = r.table_no;
    v_lines := NULL;
    IF FOUND THEN
      v_since := COALESCE(public._chat_access_since(v_thread.conversation_id, v_uid), 'infinity'::timestamptz);
      IF NOT EXISTS (SELECT 1 FROM public.chat_messages root
                      WHERE root.id = v_thread.root_message_id AND root.deleted_at IS NULL AND root.created_at >= v_since) THEN
        v_info := jsonb_build_object('state', 'no_recording', 'round_id', r.id); v_info_round := r.id;
        CONTINUE;
      END IF;
      SELECT count(*) INTO v_lines FROM public.chat_messages m
       WHERE m.conversation_id = v_thread.conversation_id AND m.thread_root_id = v_thread.root_message_id
         AND m.kind = 'message' AND m.deleted_at IS NULL AND m.created_at >= v_since AND m.body IS NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM public.transcribe_round_clean_jobs j
                WHERE j.round_id = r.id AND j.table_no = r.table_no AND j.status IN ('pending', 'processing')) THEN
      -- Not ready 10 minutes after the round ended: the terminal copy, no button. Never blocks a later round's offer.
      IF now() >= r.ended_at + interval '10 minutes' THEN
        v_info := jsonb_build_object('state', 'transcript_missing', 'round_id', r.id); v_info_round := r.id;
        CONTINUE;
      END IF;
      RETURN jsonb_build_object('state', 'transcript_pending', 'round_id', r.id);
    END IF;
    IF COALESCE(v_lines, 0) = 0 THEN
      v_info := jsonb_build_object('state', 'no_recording', 'round_id', r.id); v_info_round := r.id;
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.canvas_id = v_canvas AND d.state = 'open') THEN
      RETURN jsonb_build_object('state', 'draft_open', 'round_id', r.id);
    END IF;
    RETURN jsonb_build_object('state', 'offer', 'round_id', r.id);
  END LOOP;

  -- Nothing can move: an informational line only for the break right after the person's own newest round.
  SELECT rd.id INTO v_newest_ended FROM public.event_rounds rd
   WHERE rd.event_id = p_event AND rd.ended_at IS NOT NULL ORDER BY rd.round_no DESC LIMIT 1;
  IF v_info IS NOT NULL AND v_info_round = v_newest_ended THEN
    RETURN v_info;
  END IF;
  RETURN jsonb_build_object('state', 'none');
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_next_version_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_next_version_offer(uuid) TO authenticated;

COMMIT;
