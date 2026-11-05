-- P1529 D24: the trigger message of "Make my next version" reads "Update my canvas from what was said in {round label}."
--
-- client-safe: same signature, same grants, same behaviour. The only change is the text of the one message the function
-- sends to the canvas engine (the ", in my own words" tail is gone, D23 no longer means it).
-- diffed against: 20261105220000_p1529_next_version_and_titles.sql (make_my_next_version, every other line identical).

BEGIN;

CREATE OR REPLACE FUNCTION public.make_my_next_version(p_round uuid)
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
  v_clock_end timestamptz;
  v_showcase boolean;
  v_started timestamptz;
  v_result jsonb;
  v_tap_draft uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;

  SELECT r.event_id, s.table_no, r.round_no, r.ended_at, COALESCE(r.showcase, false), r.started_at,
         r.started_at + make_interval(secs => r.seating_s + r.first_s + r.second_s + r.observer_s)
    INTO v_event, v_table, v_round_no, v_ended, v_showcase, v_started, v_clock_end
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

  -- §6's window, on the server: once this round's clock is over or it ended, until this person's next owning round.
  IF v_showcase THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'demo_round');
  END IF;
  IF v_ended IS NULL AND now() < v_clock_end THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'round_still_on');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.event_rounds r
      JOIN public.event_round_seats s ON s.round_id = r.id AND s.role = 'first'
      JOIN public.event_room_members m ON m.id = s.room_member_id AND m.profile_id = v_uid
     WHERE r.event_id = v_event AND r.round_no > v_round_no) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'next_owning_round_started');
  END IF;

  SELECT ec.canvas_id INTO v_canvas FROM public.event_canvases ec WHERE ec.event_id = v_event AND ec.profile_id = v_uid;
  SELECT v.id INTO v_from FROM public.canvas_versions v
   WHERE v.canvas_id = v_canvas AND v.published_at IS NOT NULL ORDER BY v.published_seq DESC NULLS LAST LIMIT 1;
  IF v_from IS NULL THEN
    RETURN jsonb_build_object('status', 'no_canvas');
  END IF;

  SELECT t.* INTO v_thread FROM public.chat_round_threads t WHERE t.round_id = p_round AND t.table_no = v_table;
  IF FOUND THEN
    v_since := COALESCE(_chat_access_since(v_thread.conversation_id, v_uid), 'infinity'::timestamptz);
    -- A thread whose root this person cannot read is unreadable as a whole (P1592): no lines, however late they are.
    IF NOT EXISTS (SELECT 1 FROM public.chat_messages root
                    WHERE root.id = v_thread.root_message_id AND root.deleted_at IS NULL AND root.created_at >= v_since) THEN
      RETURN jsonb_build_object('status', 'no_recording');
    END IF;
    SELECT count(*) INTO v_lines FROM public.chat_messages m
     WHERE m.conversation_id = v_thread.conversation_id AND m.thread_root_id = v_thread.root_message_id
       AND m.kind = 'message' AND m.deleted_at IS NULL AND m.created_at >= v_since AND m.body IS NOT NULL;
  END IF;
  -- A repeat tap, while the draft it started is still open: that run, nothing new.
  SELECT t.draft_id INTO v_tap_draft
    FROM public.event_next_version_taps t JOIN public.canvas_drafts d ON d.id = t.draft_id AND d.state = 'open'
   WHERE t.round_id = p_round AND t.profile_id = v_uid
   ORDER BY t.created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'started', 'repeat', true, 'draft_id', v_tap_draft);
  END IF;

  -- Lines arrive when the round's clean job finishes (P1596), so "no lines yet" may only mean "not yet".
  IF EXISTS (SELECT 1 FROM public.transcribe_round_clean_jobs j
              WHERE j.round_id = p_round AND j.table_no = v_table AND j.status IN ('pending', 'processing')) THEN
    RETURN jsonb_build_object('status', 'transcript_pending');
  END IF;
  IF COALESCE(v_lines, 0) = 0 THEN
    RETURN jsonb_build_object('status', 'no_recording');
  END IF;

  -- An open draft of this canvas is the owner's own work: it is never added to or replaced here. They finish it or discard it.
  IF EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.canvas_id = v_canvas AND d.state = 'open') THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'draft_already_open');
  END IF;

  -- One block: a refusal from the engine (cap, busy) must leave no draft and no copies behind.
  BEGIN
  v_open := canvas_draft_open(v_from);
  SELECT d.* INTO v_draft FROM public.canvas_drafts d WHERE d.id = (v_open ->> 'draft_id')::uuid AND d.owner_id = v_uid;
  IF NOT FOUND THEN
    v_result := jsonb_build_object('status', 'refused', 'code', COALESCE(v_open ->> 'code', v_open ->> 'status'));
    RAISE EXCEPTION 'p1529 refused' USING ERRCODE = 'PA529';
  END IF;

  -- Forward copies, in the same allowlist shape as forward_chat_message. The original author stays on the copy, so
  -- erasure still reaches it; the canvas engine never quotes or names them.
  FOR v_msg IN
    SELECT m.* FROM public.chat_messages m
     WHERE m.conversation_id = v_thread.conversation_id AND m.thread_root_id = v_thread.root_message_id
       AND m.kind = 'message' AND m.deleted_at IS NULL AND m.created_at >= v_since AND m.body IS NOT NULL
     ORDER BY m.created_at, m.id
       FOR SHARE SKIP LOCKED  -- as the engine does: a line being erased right now is simply not copied
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
  -- Wording: founder, 2026-11-05 (D24).
  v_result := canvas_workspace_send(
    v_draft.canvas_id, NULL, v_draft.id, v_draft.revision, false,
    'Update my canvas from what was said in ' || v_label || '.', _canvas_box_tags(), NULL,
    _p1529_derived_id(p_round, v_draft.id, 'run'));
  IF v_result ->> 'status' = 'refused' THEN
    RAISE EXCEPTION 'p1529 refused' USING ERRCODE = 'PA529';
  END IF;
  INSERT INTO public.event_next_version_taps (round_id, profile_id, draft_id) VALUES (p_round, v_uid, v_draft.id);
  EXCEPTION WHEN SQLSTATE 'PA529' THEN
    RETURN v_result;
  END;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.make_my_next_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.make_my_next_version(uuid) TO authenticated;

COMMIT;
