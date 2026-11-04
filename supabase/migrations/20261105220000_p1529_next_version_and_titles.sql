-- P1529 §6 and §8: "Make my next version" from a round, its state for the owner and the host, the round thread title.
--
-- client-safe: two new functions, one read, and _transcribe_retitle_thread gains a branch for the mastermind flow only;
-- Clarity Night and Social Hike titles keep today's path byte for byte.
-- diffed against: 20261102100000_p1596_partial_flag_durable.sql (_transcribe_retitle_thread),
--   20261029100000_p1536_canvas_draft_versions.sql (forward_chat_message's snapshot allowlist),
--   20261030080000_p1536_v6_engine.sql (canvas_workspace_send, _canvas_draft_effective_input reads the owner-authored
--   forwards in the draft's own thread), 20261102090100_p1536_b5_open_from_version.sql (canvas_draft_open).
--
-- No new P1536 input path: a forward copy authored by the owner in the draft's thread is what the selector already reads.
-- Only lines the owner can read are copied (_chat_access_since). A tap while its draft is still open returns that run;
-- once that draft is gone (published, discarded), a tap starts again, with new copies in the new draft.
-- The run may change all nine boxes (p_box_refs): a message naming no box would otherwise scope to nothing.

BEGIN;

CREATE OR REPLACE FUNCTION public._p1529_derived_id(p_a uuid, p_b uuid, p_salt text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT md5(p_a::text || ':' || p_b::text || ':' || p_salt)::uuid;
$$;
REVOKE ALL ON FUNCTION public._p1529_derived_id(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- Which draft each tap started: what "this evening's draft" means, for the update state and for a repeat tap.
CREATE TABLE IF NOT EXISTS public.event_next_version_taps (
  round_id uuid NOT NULL REFERENCES public.event_rounds(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  draft_id uuid NOT NULL REFERENCES public.canvas_drafts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, profile_id, draft_id)
);
ALTER TABLE public.event_next_version_taps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_next_version_taps FROM PUBLIC, anon, authenticated;

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
  -- [FOUNDER DECISION: the wording of this one message.]
  v_result := canvas_workspace_send(
    v_draft.canvas_id, NULL, v_draft.id, v_draft.revision, false,
    'Update my canvas from what was said in ' || v_label || ', in my own words.', _canvas_box_tags(), NULL,
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

-- One owner's update state: not_tapped · drafting · ready · failed · published. Published means a version newer than
-- the moment their latest owning round started, so an old version never reads as this evening's.
CREATE OR REPLACE FUNCTION public._p1529_update_state(p_event uuid, p_profile uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_canvas uuid;
  v_from timestamptz;
  v_draft public.canvas_drafts;
  v_run public.canvas_draft_runs;
BEGIN
  SELECT ec.canvas_id INTO v_canvas FROM public.event_canvases ec WHERE ec.event_id = p_event AND ec.profile_id = p_profile;
  IF v_canvas IS NULL THEN
    RETURN jsonb_build_object('state', 'not_tapped');
  END IF;
  SELECT max(r.started_at) INTO v_from
    FROM public.event_rounds r
    JOIN public.event_round_seats s ON s.round_id = r.id AND s.role = 'first'
    JOIN public.event_room_members m ON m.id = s.room_member_id AND m.profile_id = p_profile
   WHERE r.event_id = p_event;

  -- Only a draft this evening's tap started counts; a draft from last week is the owner's own business.
  SELECT d.* INTO v_draft FROM public.canvas_drafts d
    JOIN public.event_next_version_taps t ON t.draft_id = d.id AND t.profile_id = p_profile
    JOIN public.event_rounds r ON r.id = t.round_id AND r.event_id = p_event
   WHERE d.canvas_id = v_canvas AND d.state = 'open'
   LIMIT 1;
  IF FOUND THEN
    SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.draft_id = v_draft.id ORDER BY r.created_at DESC, r.id DESC LIMIT 1;
    RETURN jsonb_build_object(
      'state', CASE WHEN v_run.state IN ('queued', 'running') THEN 'drafting'
                    WHEN v_run.state = 'done' THEN 'ready'
                    ELSE 'failed' END,
      'draft_id', v_draft.id, 'revision', v_draft.revision, 'run_id', v_run.id);
  END IF;
  IF v_from IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.canvas_versions v WHERE v.canvas_id = v_canvas AND v.published_at > v_from) THEN
    RETURN jsonb_build_object('state', 'published');
  END IF;
  RETURN jsonb_build_object('state', 'not_tapped');
END;
$$;
REVOKE ALL ON FUNCTION public._p1529_update_state(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_update_state(p_event uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN (SELECT auth.uid()) IS NULL THEN NULL
              ELSE public._p1529_update_state(p_event, (SELECT auth.uid())) END;
$$;
REVOKE ALL ON FUNCTION public.get_my_update_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_update_state(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_mastermind_update_states(p_event uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event AND e.host_id = (SELECT auth.uid())) THEN
    RAISE EXCEPTION 'host only' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_object_agg(ec.profile_id, public._p1529_update_state(p_event, ec.profile_id) ->> 'state')
      FROM public.event_canvases ec WHERE ec.event_id = p_event
  ), '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.get_mastermind_update_states(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_mastermind_update_states(uuid) TO authenticated;

-- §8. Only names of people who are still thread members, so erasure rebuilds the title as it does today.
CREATE OR REPLACE FUNCTION public._p1529_mastermind_title(p_thread uuid, p_round uuid, p_table integer, p_event uuid, p_round_no integer)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_counted integer;
  v_showcase boolean;
  v_label text;
  v_owner text;
  v_partner text;
BEGIN
  SELECT COALESCE(r.showcase, false) INTO v_showcase FROM public.event_rounds r WHERE r.id = p_round;
  SELECT count(*) INTO v_counted FROM public.event_rounds r
   WHERE r.event_id = p_event AND r.round_no <= p_round_no AND NOT COALESCE(r.showcase, false);
  v_label := CASE WHEN v_showcase THEN 'Demo' ELSE 'Round ' || v_counted END;
  SELECT tm.display_name INTO v_owner
    FROM public.event_round_seats s
    JOIN public.event_room_members m ON m.id = s.room_member_id
    JOIN public.chat_round_thread_members tm ON tm.thread_id = p_thread AND tm.profile_id = m.profile_id
   WHERE s.round_id = p_round AND s.table_no = p_table AND s.role = 'first' AND btrim(COALESCE(tm.display_name, '')) <> '';
  SELECT tm.display_name INTO v_partner
    FROM public.event_round_seats s
    JOIN public.event_room_members m ON m.id = s.room_member_id
    JOIN public.chat_round_thread_members tm ON tm.thread_id = p_thread AND tm.profile_id = m.profile_id
   WHERE s.round_id = p_round AND s.table_no = p_table AND s.role = 'second' AND btrim(COALESCE(tm.display_name, '')) <> '';
  IF v_owner IS NULL THEN
    RETURN v_label;
  END IF;
  RETURN v_label || ' · ' || v_owner || '''s canvas' || COALESCE(', with ' || v_partner, '');
END;
$$;
REVOKE ALL ON FUNCTION public._p1529_mastermind_title(uuid, uuid, integer, uuid, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._transcribe_retitle_thread(p_thread uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_root    uuid;
  v_no      integer;
  v_missing boolean;
  v_names   text[];
  v_title   text;
  v_round   uuid;
  v_table   integer;
  v_event   uuid;
BEGIN
  SELECT t.root_message_id, r.round_no, t.audio_missing, t.round_id, t.table_no, t.event_id
    INTO v_root, v_no, v_missing, v_round, v_table, v_event
    FROM public.chat_round_threads t JOIN public.event_rounds r ON r.id = t.round_id
   WHERE t.id = p_thread;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF public._event_flow(v_event) = 'sales-mastermind' THEN
    v_title := public._p1529_mastermind_title(p_thread, v_round, v_table, v_event, v_no);
  ELSE
    SELECT array_agg(tm.display_name ORDER BY lower(tm.display_name), tm.profile_id) INTO v_names
      FROM public.chat_round_thread_members tm
     WHERE tm.thread_id = p_thread AND btrim(COALESCE(tm.display_name, '')) <> '';
    v_title := public._transcribe_round_title(v_no, COALESCE(v_names, '{}'));
  END IF;
  IF v_missing THEN
    v_title := v_title || ' (some of this table''s audio is missing)';
  END IF;
  UPDATE public.chat_messages m
     SET body = v_title
   WHERE m.id = v_root AND m.deleted_at IS NULL
     AND m.body IS DISTINCT FROM v_title;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_retitle_thread(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
