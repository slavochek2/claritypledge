-- P1529 §5 and §6: the two reads a seated person's round screen needs and no existing function gives.
--
-- client-safe: two new read-only functions (no table, no write, no existing function changed).
-- diffed against: 20261105220000_p1529_next_version_and_titles.sql (make_my_next_version: this mirrors its window, its order of
--   checks and its transcript rules, without any of its writes),
--   20261105200000_p1529_review_fixes_2.sql (record_event_canvas_open: the same "seated at the owner's table" test),
--   20261105090000_p1529_mastermind_flow_registration.sql (event_canvases is revoked from clients, so a partner or an observer has
--   no read of the owner's canvas name today; get_my_event_canvas answers only for the caller's own row).
--
-- get_my_round_canvas: for someone seated at a table in a Sales Mastermind round, the Clarity Canvas owner of that table and
--   the owner's canvas, but the canvas name only while it is still shared with the event (Sharing never widens, P1515).
-- get_my_next_version_offer: whether "Make my next version" should be shown to the caller before a tap: the caller's latest
--   owning round, and what a tap would answer (none, round_on, offer, transcript_pending, no_recording, no_canvas,
--   started, draft_open). The card never has to learn "no recording" by tapping.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_round_canvas(p_round uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_event uuid;
  v_table integer;
  v_owner uuid;
  v_shared boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT r.event_id, me.table_no INTO v_event, v_table
    FROM public.event_rounds r
    JOIN public.event_round_seats me ON me.round_id = r.id
    JOIN public.event_room_members mm ON mm.id = me.room_member_id AND mm.profile_id = v_uid
   WHERE r.id = p_round
   LIMIT 1;
  IF NOT FOUND OR public._event_flow(v_event) <> 'sales-mastermind' THEN
    RETURN NULL;
  END IF;
  SELECT om.profile_id INTO v_owner
    FROM public.event_round_seats os
    JOIN public.event_room_members om ON om.id = os.room_member_id
   WHERE os.round_id = p_round AND os.table_no = v_table AND os.role = 'first' AND om.profile_id IS NOT NULL
   LIMIT 1;
  IF v_owner IS NULL THEN
    RETURN NULL;
  END IF;
  v_shared := public._event_canvas_shared(v_event, v_owner);
  RETURN jsonb_build_object(
    'owner_profile_id', v_owner,
    'owner_slug', (SELECT p.slug FROM public.profiles p WHERE p.id = v_owner),
    'shared', v_shared,
    'canvas_name', CASE WHEN v_shared THEN
      (SELECT c.name FROM public.event_canvases ec JOIN public.canvases c ON c.id = ec.canvas_id
        WHERE ec.event_id = v_event AND ec.profile_id = v_owner) END);
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_round_canvas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_round_canvas(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_next_version_offer(p_event uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_round uuid;
  v_table integer;
  v_showcase boolean;
  v_ended timestamptz;
  v_clock_end timestamptz;
  v_canvas uuid;
  v_from uuid;
  v_thread public.chat_round_threads;
  v_since timestamptz;
  v_lines integer;
  v_tap_draft uuid;
BEGIN
  IF v_uid IS NULL OR public._event_flow(p_event) <> 'sales-mastermind' THEN
    RETURN jsonb_build_object('state', 'none');
  END IF;

  -- The window is this person's LATEST owning round: once a later one starts, an earlier round's window is closed.
  SELECT r.id, s.table_no, COALESCE(r.showcase, false), r.ended_at,
         r.started_at + make_interval(secs => r.seating_s + r.first_s + r.second_s + r.observer_s)
    INTO v_round, v_table, v_showcase, v_ended, v_clock_end
    FROM public.event_rounds r
    JOIN public.event_round_seats s ON s.round_id = r.id AND s.role = 'first'
    JOIN public.event_room_members m ON m.id = s.room_member_id AND m.profile_id = v_uid
   WHERE r.event_id = p_event
   ORDER BY r.round_no DESC
   LIMIT 1;
  IF NOT FOUND OR v_showcase THEN
    RETURN jsonb_build_object('state', 'none');
  END IF;
  IF v_ended IS NULL AND now() < v_clock_end THEN
    RETURN jsonb_build_object('state', 'round_on', 'round_id', v_round);
  END IF;

  SELECT ec.canvas_id INTO v_canvas FROM public.event_canvases ec WHERE ec.event_id = p_event AND ec.profile_id = v_uid;
  SELECT v.id INTO v_from FROM public.canvas_versions v
   WHERE v.canvas_id = v_canvas AND v.published_at IS NOT NULL ORDER BY v.published_seq DESC NULLS LAST LIMIT 1;
  IF v_from IS NULL THEN
    RETURN jsonb_build_object('state', 'no_canvas', 'round_id', v_round);
  END IF;

  SELECT t.* INTO v_thread FROM public.chat_round_threads t WHERE t.round_id = v_round AND t.table_no = v_table;
  IF FOUND THEN
    v_since := COALESCE(public._chat_access_since(v_thread.conversation_id, v_uid), 'infinity'::timestamptz);
    IF NOT EXISTS (SELECT 1 FROM public.chat_messages root
                    WHERE root.id = v_thread.root_message_id AND root.deleted_at IS NULL AND root.created_at >= v_since) THEN
      RETURN jsonb_build_object('state', 'no_recording', 'round_id', v_round);
    END IF;
    SELECT count(*) INTO v_lines FROM public.chat_messages m
     WHERE m.conversation_id = v_thread.conversation_id AND m.thread_root_id = v_thread.root_message_id
       AND m.kind = 'message' AND m.deleted_at IS NULL AND m.created_at >= v_since AND m.body IS NOT NULL;
  END IF;

  SELECT t.draft_id INTO v_tap_draft
    FROM public.event_next_version_taps t JOIN public.canvas_drafts d ON d.id = t.draft_id AND d.state = 'open'
   WHERE t.round_id = v_round AND t.profile_id = v_uid
   ORDER BY t.created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('state', 'started', 'round_id', v_round, 'draft_id', v_tap_draft);
  END IF;

  IF EXISTS (SELECT 1 FROM public.transcribe_round_clean_jobs j
              WHERE j.round_id = v_round AND j.table_no = v_table AND j.status IN ('pending', 'processing')) THEN
    RETURN jsonb_build_object('state', 'transcript_pending', 'round_id', v_round);
  END IF;
  IF COALESCE(v_lines, 0) = 0 THEN
    RETURN jsonb_build_object('state', 'no_recording', 'round_id', v_round);
  END IF;
  IF EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.canvas_id = v_canvas AND d.state = 'open') THEN
    RETURN jsonb_build_object('state', 'draft_open', 'round_id', v_round);
  END IF;
  RETURN jsonb_build_object('state', 'offer', 'round_id', v_round);
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_next_version_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_next_version_offer(uuid) TO authenticated;

COMMIT;
