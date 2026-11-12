-- Migration: P1529 -- make_my_next_version takes the event's round lock before the owner's lock
-- Created: 2026-11-12
-- Spec: features/p1529_canvas_event_host_coordination.md ("UAT round 2026-11-11")
-- Guaranteed by: e2e/integration/p1529-db-schema.spec.ts (behaviour unchanged; the lock itself is not observable through PostgREST)
--
-- WHY. 20261111190000 refuses a tap while any round runs, but held only the owner's lock, while host_start_round holds the event's
-- ('p1337_round:' || event). A round could start between the check and the draft. Now the event lock is taken first (host_start_round
-- takes no owner lock, so event then owner cannot deadlock).
--
-- diffed against: 20261111190000_p1529_review_fixes.sql (make_my_next_version).
-- diff: the lock block at the top only (event lock, then the owner lock that was already there). Every RAISE EXCEPTION message, the
--   signature (uuid, boolean DEFAULT false), SECURITY DEFINER, search_path and the grants are unchanged.
-- client-safe: same signature and results.

BEGIN;

CREATE OR REPLACE FUNCTION public.make_my_next_version(p_round uuid, p_auto_publish boolean DEFAULT false)
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

  -- The event's round lock FIRST (the one host_start_round and host_end_round take), so "no round is running" cannot go stale while
  -- a round starts; then the owner's lock (the one canvas_draft_open takes). Same order everywhere: event lock, then owner lock.
  SELECT r0.event_id INTO v_event FROM public.event_rounds r0 WHERE r0.id = p_round;
  IF v_event IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || v_event::text, 0));
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));

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
  IF v_ended IS NULL OR EXISTS (SELECT 1 FROM public.event_rounds rr WHERE rr.event_id = v_event AND rr.ended_at IS NULL) THEN
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

  -- Oldest first: once a later round of this owner has its run, an older round never drafts over it.
  IF EXISTS (SELECT 1 FROM public.event_next_version_taps t2
               JOIN public.event_rounds r2 ON r2.id = t2.round_id
              WHERE t2.profile_id = v_uid AND r2.event_id = v_event AND r2.round_no > v_round_no) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'newer_round_used');
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
  IF v_open ->> 'status' IS DISTINCT FROM 'opened' THEN
    v_result := jsonb_build_object('status', 'refused', 'code', 'draft_already_open');
    RAISE EXCEPTION 'p1529 refused' USING ERRCODE = 'PA529';
  END IF;
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
  VALUES (p_round, v_uid, v_draft.id, COALESCE(p_auto_publish, false));
  EXCEPTION WHEN SQLSTATE 'PA529' THEN
    RETURN v_result;
  END;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.make_my_next_version(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.make_my_next_version(uuid, boolean) TO authenticated;


COMMIT;
