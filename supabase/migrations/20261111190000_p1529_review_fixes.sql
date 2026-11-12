-- Migration: P1529 -- review fixes: next version only between rounds and oldest first, locked, fail-safe default; reading part only in the mastermind; no seat changes on an ended mastermind round
-- Created: 2026-11-11
-- Spec: features/p1529_canvas_event_host_coordination.md ("UAT round 2026-11-11")
-- Guaranteed by: e2e/integration/p1529-db-schema.spec.ts, e2e/integration/p1337-event-rounds-db.spec.ts
--
-- WHAT. make_my_next_version: p_auto_publish defaults to false; the owner's advisory lock is taken before any check (so the open-draft check
-- is inside it) and a draft that is not freshly 'opened' is refused; refused while ANY round of the event runs; refused once a later owned
-- round has its run (older rounds never draft over newer work). get_my_next_version_offer: skips such older rounds; reports auto_publish
-- only when the draft starts from the owner's latest published version. host_start_round (11-arg): reading_s is 0 outside the sales
-- mastermind. host_set_round_seats: refuses an ended round in the sales mastermind.
--
-- get_my_round_canvas: also returns had_canvas (a canvas was chosen for the event), so the card can tell "no longer shared" from "no canvas yet".
--
-- diffed against: 20261105234000 (get_my_round_canvas), 20261111120000 (make_my_next_version, get_my_next_version_offer), 20261111170000 (host_start_round 11-arg),
--   20261029180000 (host_set_round_seats).
-- diff: each function is the cited body plus the changes named above; every RAISE EXCEPTION message and the grants are unchanged (one new
--   'this round is over' in host_set_round_seats, a message already used by host_extend_round).
-- client-safe: same signatures; new refusal codes (newer_round_used) fall to the client's generic note.

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

  -- The owner's lock FIRST (the one canvas_draft_open takes): every check below, the open-draft one included, runs inside it.
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
    -- A later owned round already has its run: this older round never drafts over it (nothing is shown for it).
    IF EXISTS (SELECT 1 FROM public.event_next_version_taps t2
                 JOIN public.event_rounds r2 ON r2.id = t2.round_id
                WHERE t2.profile_id = v_uid AND r2.event_id = p_event
                  AND r2.round_no > (SELECT r0.round_no FROM public.event_rounds r0 WHERE r0.id = r.id))
       AND NOT EXISTS (SELECT 1 FROM public.event_next_version_taps t3 WHERE t3.round_id = r.id AND t3.profile_id = v_uid) THEN
      CONTINUE;
    END IF;
    SELECT t.* INTO v_tap FROM public.event_next_version_taps t
     WHERE t.round_id = r.id AND t.profile_id = v_uid ORDER BY t.created_at DESC LIMIT 1;
    IF FOUND THEN
      SELECT d.* INTO v_draft FROM public.canvas_drafts d WHERE d.id = v_tap.draft_id;
      IF v_draft.state = 'open' THEN
        SELECT x.* INTO v_run FROM public.canvas_draft_runs x WHERE x.draft_id = v_draft.id ORDER BY x.created_at DESC, x.id DESC LIMIT 1;
        v_state := CASE WHEN v_run.state IN ('queued', 'running') THEN 'drafting' WHEN v_run.state = 'done' THEN 'ready' ELSE 'failed' END;
        -- One-tap publishes only a draft that starts from the owner's LATEST published version; an older base is left as a draft.
        RETURN jsonb_build_object('state', v_state, 'round_id', r.id, 'draft_id', v_draft.id, 'revision', v_draft.revision,
                                  'run_id', v_run.id,
                                  'auto_publish', v_tap.auto_publish AND v_draft.base_version_id IS NOT DISTINCT FROM
                                    (SELECT v.id FROM public.canvas_versions v
                                      WHERE v.canvas_id = v_draft.canvas_id AND v.published_at IS NOT NULL
                                      ORDER BY v.published_seq DESC NULLS LAST LIMIT 1));
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

CREATE OR REPLACE FUNCTION public.host_start_round(
  p_event_id uuid,
  p_round_no int,
  p_group_size int,
  p_seats jsonb,
  p_seating_s int,
  p_speaker_s int,
  p_observer_s int,
  p_split_speakers boolean,
  p_match_tag text,
  p_showcase boolean,
  p_reading_s int
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host uuid;
  v_last int;
  v_round uuid;
BEGIN
  SELECT e.host_id INTO v_host FROM public.events e WHERE e.id = p_event_id;
  IF v_host IS NULL OR v_host IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'only the host can run rounds' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || p_event_id::text, 0));

  SELECT COALESCE(max(r.round_no), 0) INTO v_last FROM public.event_rounds r WHERE r.event_id = p_event_id;
  IF p_round_no IS DISTINCT FROM v_last + 1 THEN
    RAISE EXCEPTION 'round % is not next (last started: %)', p_round_no, v_last USING ERRCODE = '22023';
  END IF;

  PERFORM public.p1337_assert_valid_seats(p_event_id, p_seats);

  UPDATE public.event_rounds SET ended_at = now()
   WHERE event_id = p_event_id AND ended_at IS NULL;

  INSERT INTO public.event_rounds
    (event_id, round_no, group_size, seating_s, first_s, second_s, observer_s, split_speakers, match_tag, showcase, reading_s)
  VALUES
    (p_event_id, p_round_no, p_group_size, p_seating_s, p_speaker_s, p_speaker_s, p_observer_s,
     COALESCE(p_split_speakers, true), NULLIF(p_match_tag, ''), COALESCE(p_showcase, false),
     CASE WHEN public._event_flow(p_event_id) = 'sales-mastermind' THEN COALESCE(p_reading_s, 0) ELSE 0 END)
  RETURNING id INTO v_round;

  INSERT INTO public.event_round_seats (round_id, room_member_id, table_no, role)
  SELECT v_round, x.m, x.t, x.r FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text);

  RETURN v_round;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.host_start_round(uuid, int, int, jsonb, int, int, int, boolean, text, boolean, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_start_round(uuid, int, int, jsonb, int, int, int, boolean, text, boolean, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.host_set_round_seats(p_round_id uuid, p_seats jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event uuid;
  v_host uuid;
  v_round_no int;
  v_last int;
BEGIN
  SELECT r.event_id, r.round_no, e.host_id INTO v_event, v_round_no, v_host
    FROM public.event_rounds r JOIN public.events e ON e.id = r.event_id
   WHERE r.id = p_round_id;
  IF v_host IS NULL OR v_host IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'only the host can change seats' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || v_event::text, 0));

  SELECT max(r.round_no) INTO v_last FROM public.event_rounds r WHERE r.event_id = v_event;
  IF v_round_no IS DISTINCT FROM v_last THEN
    RAISE EXCEPTION 'only the current round can be changed' USING ERRCODE = '22023';
  END IF;

  -- The sales mastermind: an ended round's tables are history (its owners drive the next versions). Seat changes need a running round.
  IF public._event_flow(v_event) = 'sales-mastermind'
     AND (SELECT r.ended_at FROM public.event_rounds r WHERE r.id = p_round_id) IS NOT NULL THEN
    RAISE EXCEPTION 'this round is over' USING ERRCODE = '22023';
  END IF;

  PERFORM public.p1337_assert_valid_seats(v_event, p_seats);

  -- A table whose people changed loses its marked statement: nobody now at that table chose
  -- it, and the mark is what links a recording to a statement. Compared BEFORE the seats move.
  DELETE FROM public.event_round_tables tt
   WHERE tt.round_id = p_round_id
     AND (SELECT array_agg(s.room_member_id ORDER BY s.room_member_id)
            FROM public.event_round_seats s
           WHERE s.round_id = p_round_id AND s.table_no = tt.table_no)
         IS DISTINCT FROM
         (SELECT array_agg(x.m ORDER BY x.m)
            FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text)
           WHERE x.t = tt.table_no);

  DELETE FROM public.event_round_seats s
   WHERE s.round_id = p_round_id
     AND s.room_member_id NOT IN (SELECT x.m FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text));

  INSERT INTO public.event_round_seats AS s (round_id, room_member_id, table_no, role)
  SELECT p_round_id, x.m, x.t, x.r FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text)
   ORDER BY x.t, x.m
  ON CONFLICT (round_id, room_member_id) DO UPDATE
    SET role = EXCLUDED.role,
        confirmed_at = CASE WHEN s.table_no = EXCLUDED.table_no THEN s.confirmed_at END,
        position_moved = CASE WHEN s.table_no = EXCLUDED.table_no THEN s.position_moved END,
        table_no = EXCLUDED.table_no;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.host_set_round_seats(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_set_round_seats(uuid, jsonb) TO authenticated;

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
    -- A canvas was chosen for this event (it may have been unshared since): "no longer shared" is not "no canvas yet".
    'had_canvas', EXISTS (SELECT 1 FROM public.event_canvases ec WHERE ec.event_id = v_event AND ec.profile_id = v_owner),
    'canvas_name', CASE WHEN v_shared THEN
      (SELECT c.name FROM public.event_canvases ec JOIN public.canvases c ON c.id = ec.canvas_id
        WHERE ec.event_id = v_event AND ec.profile_id = v_owner) END);
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_round_canvas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_round_canvas(uuid) TO authenticated;

COMMIT;
