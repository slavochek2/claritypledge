-- client-safe: clarify_start_recording and _clarify_begin_recording keep their signatures, return types, SECURITY DEFINER, search_path and grants; behaviour only: a reused recording thread's root shows the new cutoff, a follow-up draft reads the NEWEST press's read set, and the points-already-published lists stop at the run's cutoff
-- Migration: P1631 recording Clarify review fixes
-- Created: 2026-11-13
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md
-- Guaranteed by: src/tests/p1631-recording-clarify-fixes-migration.test.ts (source contract), src/tests/integration/p1631-recording-clarify.test.ts
--
-- 20261113100000 is applied and is not edited. Each replaced function is its newest body (that file) copied byte for byte, then marked lines (`-- P1631 recording fixes`).
-- One replaced line (marked, same position): _clarify_begin_recording's first-draft lookup `ORDER BY f.created_at, f.id LIMIT 1` becomes the newest-first form.
--
-- diffed against:
--   clarify_start_recording(uuid)   20261113100000_p1631_recording_clarify.sql (its only definition)
--   _clarify_begin_recording(uuid)  20261113100000_p1631_recording_clarify.sql (its only definition)
--
-- 1. Stale cutoff. A second press in the same room reuses the thread and its Mirror root, which still read "Recording · up to <first press>". The reuse branch now also sets the root's
--    forward_snapshot.recording_until to the new rec_until (the root holds no words, so only that key moves).
-- 2. F8. A follow-up draft (clarify_another, clarify_message, a retry) is inserted without rec_*; the run took the read set of the thread's OLDEST draft that had one, so a follow-up after a second
--    press read what the FIRST press read. It now takes the NEWEST draft that has one (f.created_at DESC).
-- 3. F7. already_drafted, the draft-refs subselect and the publisher-ref select count the cards published into the chat with no upper bound; a card published after the cutoff changed what an old run
--    excluded. Each now also requires m.created_at <= v_until (the run's rec_until).

BEGIN;

CREATE OR REPLACE FUNCTION public.clarify_start_recording(p_room uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_room    public.transcribe_rooms;
  v_seat    uuid;
  v_conv    public.chat_conversations;
  v_since   timestamptz;
  v_kind    text;
  v_round   uuid;
  v_table   integer;
  v_until   timestamptz := clock_timestamp();
  v_newest  uuid;
  v_thread  public.clarify_threads;
  v_root    public.chat_messages;
  v_mirror  uuid;
  v_title   text;
  v_ref     text;
  v_snap    jsonb;
  v_row     public.chat_messages;
  v_id      uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1631:clarify:' || v_uid::text, 0));
  PERFORM public._clarify_sweep(v_uid);
  IF EXISTS (SELECT 1 FROM public.clarify_drafts d WHERE d.owner_id = v_uid AND d.state IN ('queued', 'running')) THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;
  -- the presser holds a seat in this room, and the room belongs to a chat they can read (never a Mirror)
  SELECT r.* INTO v_room FROM public.transcribe_rooms r WHERE r.id = p_room;
  SELECT m.id INTO v_seat FROM public.transcribe_room_members m WHERE m.room_id = p_room AND m.profile_id = v_uid;
  IF v_room.id IS NULL OR v_seat IS NULL OR v_room.conversation_id IS NULL THEN
    RAISE EXCEPTION 'clarify: not available' USING ERRCODE = '42501';
  END IF;
  SELECT c.* INTO v_conv FROM public.chat_conversations c WHERE c.id = v_room.conversation_id;
  v_since := public._chat_access_since(v_room.conversation_id, v_uid);
  IF v_conv.id IS NULL OR v_conv.kind = 'mirror' OR v_since IS NULL THEN
    RAISE EXCEPTION 'clarify: not available' USING ERRCODE = '42501';
  END IF;
  -- the read set, decided now
  IF v_conv.kind = 'event' THEN
    SELECT d.o_round_id, d.o_table_no INTO v_round, v_table
      FROM public._transcribe_decide_destination(p_room, v_seat) d WHERE d.o_kind = 'round';
    IF v_round IS NOT NULL AND v_table IS NOT NULL THEN
      v_kind := 'round';
    ELSE
      v_kind := 'own';
      v_round := NULL;
      v_table := NULL;
    END IF;
  ELSE
    v_kind := 'room';
  END IF;
  SELECT x.id INTO v_newest FROM public.transcribe_messages x
   WHERE x.room_id = p_room AND x.spoken_at <= v_until AND NULLIF(btrim(x.text), '') IS NOT NULL
     AND ((v_kind = 'round' AND x.dest_kind = 'round' AND x.dest_round_id = v_round AND x.dest_table_no = v_table)
          OR (v_kind = 'own' AND x.member_id = v_seat)
          OR v_kind = 'room')
   ORDER BY x.spoken_at DESC, x.id DESC LIMIT 1;
  IF v_newest IS NULL THEN
    RETURN jsonb_build_object('status', 'empty');
  END IF;
  -- the same person's thread for this recording, when it is still there
  SELECT t.* INTO v_thread FROM public.clarify_threads t
   WHERE t.owner_id = v_uid AND t.scope = 'recording' AND t.recording_room_id = p_room;
  IF FOUND THEN
    SELECT m.* INTO v_root FROM public.chat_messages m WHERE m.id = v_thread.root_id AND m.deleted_at IS NULL;
    IF FOUND THEN
      BEGIN
        INSERT INTO public.clarify_drafts (owner_id, mirror_conversation_id, thread_root_id, source_conversation_id, source_message_id, rec_kind, rec_round_id, rec_table_no, rec_until)
        VALUES (v_uid, v_root.conversation_id, v_root.id, v_room.conversation_id, v_newest, v_kind, v_round, v_table, v_until)
        RETURNING id INTO v_id;
      EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('status', 'busy');
      END;
      UPDATE public.chat_messages m SET forward_snapshot = jsonb_set(m.forward_snapshot, '{recording_until}', to_jsonb(v_until)) WHERE m.id = v_root.id; -- P1631 recording fixes: the root shows this press's cutoff, not the first press's
      RETURN jsonb_build_object('status', 'started', 'reused', true, 'draft_id', v_id, 'thread_root_id', v_root.id,
                                'mirror_conversation_id', v_root.conversation_id, 'scope', 'recording');
    END IF;
    -- its root was deleted: the thread row stays but no longer names the room, so a fresh one can
    UPDATE public.clarify_threads t SET recording_room_id = NULL WHERE t.root_id = v_thread.root_id;
  END IF;
  -- the title as the presser sees the chat (the same reading as clarify_chat_message)
  IF v_conv.kind = 'dm' THEN
    SELECT COALESCE(p.name, 'Deleted user'),
           public._chat_author_ref(CASE WHEN v_conv.dm_user_a = v_uid THEN v_conv.dm_user_b ELSE v_conv.dm_user_a END)
      INTO v_title, v_ref
      FROM (SELECT 1) one
      LEFT JOIN public.profiles p ON p.id = CASE WHEN v_conv.dm_user_a = v_uid THEN v_conv.dm_user_b ELSE v_conv.dm_user_a END;
  ELSIF v_conv.kind = 'group' THEN
    SELECT o.name || ' · General' INTO v_title FROM public.organization o WHERE o.id = v_conv.org_id;
  ELSIF v_conv.kind = 'event' THEN
    SELECT e.title INTO v_title FROM public.events e WHERE e.id = v_conv.event_id;
  ELSE
    v_title := COALESCE(v_conv.title, 'Mirror');
  END IF;
  v_snap := jsonb_build_object('scope', 'recording', 'conversation_kind', v_conv.kind, 'conversation_title', v_title,
                               'recording_started_at', v_room.created_at, 'recording_until', v_until, 'created_at', clock_timestamp());
  IF v_ref IS NOT NULL THEN
    v_snap := v_snap || jsonb_build_object('conversation_title_ref', v_ref);
  END IF;
  BEGIN
    v_mirror := public._chat_ensure_mirror(v_uid);
    -- no body, author, thread or attachment, and no original: the copy shows the recording, not anybody's words
    INSERT INTO public.chat_messages (conversation_id, author_id, body, kind, forward_snapshot, forward_author_id, forwarded_from_message_id, created_at)
    VALUES (v_mirror, v_uid, NULL, 'clarify', v_snap, NULL, NULL, clock_timestamp())
    RETURNING * INTO v_row;
    UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = v_mirror;
    INSERT INTO public.clarify_threads (root_id, owner_id, scope, recording_room_id) VALUES (v_row.id, v_uid, 'recording', p_room);
    INSERT INTO public.clarify_drafts (owner_id, mirror_conversation_id, thread_root_id, source_conversation_id, source_message_id, rec_kind, rec_round_id, rec_table_no, rec_until)
    VALUES (v_uid, v_mirror, v_row.id, v_room.conversation_id, v_newest, v_kind, v_round, v_table, v_until)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- the copy above is rolled back with this block
    RETURN jsonb_build_object('status', 'busy');
  END;
  RETURN jsonb_build_object('status', 'started', 'reused', false, 'draft_id', v_id, 'thread_root_id', v_row.id,
                            'mirror_conversation_id', v_mirror, 'scope', 'recording');
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_start_recording(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_start_recording(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public._clarify_begin_recording(p_draft uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- the same budget as _clarify_begin: 100,000 characters of conversation, 2,000 rows
  c_chars       constant integer := 100000;
  c_rows        constant integer := 2000;
  v_d           public.clarify_drafts;
  v_f           public.clarify_drafts;
  v_room        uuid;
  v_kind        text;
  v_round       uuid;
  v_table       integer;
  v_until       timestamptz;
  v_since       timestamptz;
  v_seat        uuid;
  v_event       boolean;
  v_ids         uuid[];
  v_locked      uuid[];
  v_src_id      uuid;
  v_src_text    text;
  v_refs        text[];
  v_spend       uuid;
  v_usd         numeric;
  v_source      jsonb;
  v_chat        jsonb;
  v_already     jsonb;
  v_owner_msgs  jsonb;
  v_latest      text;
  v_latest_id   uuid;
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
    PERFORM public._clarify_sweep(v_d.owner_id);
    RETURN jsonb_build_object('status', 'failed');
  END IF;
  IF v_d.updated_at < now() - interval '5 minutes' THEN
    PERFORM public._clarify_sweep(v_d.owner_id);
    RETURN jsonb_build_object('status', 'failed');
  END IF;

  -- the recording and its read set: this draft's own, else the thread's oldest draft that has one (a follow-up draft is inserted without them)
  SELECT t.recording_room_id INTO v_room FROM public.clarify_threads t WHERE t.root_id = v_d.thread_root_id AND t.scope = 'recording';
  v_kind := v_d.rec_kind; v_round := v_d.rec_round_id; v_table := v_d.rec_table_no; v_until := v_d.rec_until;
  IF v_kind IS NULL THEN
    SELECT f.* INTO v_f FROM public.clarify_drafts f
     WHERE f.thread_root_id = v_d.thread_root_id AND f.owner_id = v_d.owner_id AND f.rec_kind IS NOT NULL AND f.rec_until IS NOT NULL
     ORDER BY f.created_at DESC, f.id DESC LIMIT 1; -- P1631 recording fixes: the NEWEST press's read set, not the first press's
    IF FOUND THEN
      v_kind := v_f.rec_kind; v_round := v_f.rec_round_id; v_table := v_f.rec_table_no; v_until := v_f.rec_until;
    END IF;
  END IF;
  IF v_room IS NULL OR v_kind IS NULL OR v_until IS NULL THEN
    UPDATE public.clarify_drafts d SET state = 'failed', error_code = 'source_gone', updated_at = now() WHERE d.id = p_draft AND d.state = 'queued';
    RETURN jsonb_build_object('status', 'gone');
  END IF;

  -- the owner still holds the seat and still reads the chat
  v_since := public._chat_access_since(v_d.source_conversation_id, v_d.owner_id);
  SELECT m.id INTO v_seat FROM public.transcribe_room_members m WHERE m.room_id = v_room AND m.profile_id = v_d.owner_id;
  IF v_since IS NULL OR v_seat IS NULL THEN
    UPDATE public.clarify_drafts d SET state = 'failed', error_code = 'no_access', updated_at = now() WHERE d.id = p_draft AND d.state = 'queued';
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  SELECT COALESCE((SELECT c.kind = 'event' FROM public.chat_conversations c WHERE c.id = v_d.source_conversation_id), false) INTO v_event;

  -- the lines: newest first within the budget; round: that table of that round; own: this seat's lines; room: every line of the room
  v_ids := ARRAY(
      SELECT s.id FROM (
        SELECT x.id, sum(least(char_length(x.text), 4000)) OVER (ORDER BY x.spoken_at DESC, x.id DESC
                 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
          FROM public.transcribe_messages x
         WHERE x.room_id = v_room AND x.spoken_at <= v_until AND NULLIF(btrim(x.text), '') IS NOT NULL
           AND ((v_kind = 'round' AND x.dest_kind = 'round' AND x.dest_round_id = v_round AND x.dest_table_no = v_table)
                OR (v_kind = 'own' AND x.member_id = v_seat)
                OR v_kind = 'room')
         ORDER BY x.spoken_at DESC, x.id DESC LIMIT c_rows) s
       WHERE COALESCE(s.before, 0) < c_chars);

  -- one lock pass, FOR SHARE SKIP LOCKED (see _clarify_begin): a row an erase holds is never read, never sent, and absent from derived_refs
  SELECT COALESCE(array_agg(q.id), '{}') INTO v_locked FROM (
    SELECT m.id FROM public.transcribe_messages m
     WHERE m.id = ANY (v_ids)
     ORDER BY m.spoken_at, m.id FOR SHARE SKIP LOCKED) q;
  IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN
    UPDATE public.clarify_drafts d SET state = 'failed', error_code = 'source_gone', updated_at = now() WHERE d.id = p_draft AND d.state = 'queued';
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  IF COALESCE(array_length(v_locked, 1), 0) = 0 THEN
    RETURN jsonb_build_object('status', 'busy', 'reason', 'locked');
  END IF;
  IF NOT pg_try_advisory_xact_lock_shared(hashtext('p1520_mirror_context')) THEN
    RETURN jsonb_build_object('status', 'busy', 'reason', 'locked');
  END IF;

  -- the newest line is the pressed row; the rest is the surrounding chat, oldest first. No names anywhere.
  SELECT x.id, x.text INTO v_src_id, v_src_text FROM public.transcribe_messages x
   WHERE x.id = ANY (v_locked) ORDER BY x.spoken_at DESC, x.id DESC LIMIT 1;
  v_source := jsonb_build_object('id', v_src_id, 'text', left(v_src_text, 4000), 'is_pressed', true);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'text', left(t.text, 4000)) ORDER BY t.spoken_at, t.id), '[]'::jsonb)
    INTO v_chat FROM public.transcribe_messages t WHERE t.id = ANY (v_locked) AND t.id <> v_src_id;

  -- whose words are in it: every distinct speaker of the rows read
  SELECT array_remove(array_agg(DISTINCT public._chat_author_ref(m.profile_id)), NULL) INTO v_refs
    FROM public.transcribe_room_members m
   WHERE m.id IN (SELECT t.member_id FROM public.transcribe_messages t WHERE t.id = ANY (v_locked));

  -- the owner's newest draft, or the one a Mention in chat named: the statement a refine starts from
  SELECT p.statement, d3.id INTO v_latest, v_latest_id FROM public.clarify_drafts d3 JOIN public.points p ON p.id = d3.point_id
   WHERE d3.thread_root_id = v_d.thread_root_id AND d3.owner_id = v_d.owner_id AND d3.state = 'done' AND d3.id <> v_d.id
   ORDER BY (v_d.instruction IS NOT NULL AND d3.id IS NOT DISTINCT FROM v_d.refine_target_id) DESC, d3.created_at DESC, d3.id DESC LIMIT 1;

  -- the points this presser already made from this conversation: not to be repeated
  SELECT COALESCE(jsonb_agg(p.statement ORDER BY d2.created_at, d2.id), '[]'::jsonb) INTO v_already
    FROM public.clarify_drafts d2 JOIN public.points p ON p.id = d2.point_id
   WHERE d2.owner_id = v_d.owner_id AND d2.source_conversation_id = v_d.source_conversation_id AND d2.state = 'done';
  -- points already published into this chat that the presser can read are not to be repeated either (the event-only filters of _clarify_begin)
  SELECT v_already || COALESCE(jsonb_agg(q.statement ORDER BY q.created_at, q.point_id), '[]'::jsonb) INTO v_already FROM (
    SELECT p.statement, s.created_at, s.point_id FROM public.point_chat_shares s
      JOIN public.chat_messages m ON m.id = s.message_id JOIN public.points p ON p.id = s.point_id
     WHERE s.conversation_id = v_d.source_conversation_id AND m.deleted_at IS NULL
       AND m.created_at <= v_until -- P1631 recording fixes: nothing published after the run's cutoff
       AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id AND m.created_at >= v_since
       AND (NOT v_event OR m.thread_root_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.chat_messages rr WHERE rr.id = m.thread_root_id
             AND (rr.system_kind IS NOT NULL OR EXISTS (SELECT 1 FROM public.transcribe_session_threads sst WHERE sst.root_message_id = rr.id))))
       AND NOT EXISTS (SELECT 1 FROM public.clarify_drafts d4 WHERE d4.owner_id = v_d.owner_id AND d4.source_conversation_id = v_d.source_conversation_id
                        AND d4.state = 'done' AND d4.point_id = s.point_id)) q;

  -- what the owner typed in this thread (their own directions, newest 20, oldest first)
  SELECT COALESCE(jsonb_agg(left(o.body, 500) ORDER BY o.created_at, o.id), '[]'::jsonb) INTO v_owner_msgs FROM (
    SELECT m.body, m.created_at, m.id FROM public.chat_messages m
     WHERE m.thread_root_id = v_d.thread_root_id AND m.author_id = v_d.owner_id AND m.kind = 'message'
       AND m.deleted_at IS NULL AND NULLIF(btrim(m.body), '') IS NOT NULL
       AND m.created_at <= v_d.created_at
     ORDER BY m.created_at DESC, m.id DESC LIMIT 20) o;

  -- the words behind the statements already made are in this run too: their authors' refs are this draft's refs
  SELECT array_remove(array_agg(DISTINCT r.ref), NULL) INTO v_refs FROM (
    SELECT unnest(COALESCE(v_refs, '{}')) AS ref
    UNION
    SELECT unnest(d2.derived_refs) AS ref
      FROM public.clarify_drafts d2 JOIN public.points p ON p.id = d2.point_id
     WHERE d2.owner_id = v_d.owner_id AND d2.source_conversation_id = v_d.source_conversation_id AND d2.state = 'done') r;
  SELECT array_remove(array_agg(DISTINCT r.ref), NULL) INTO v_refs FROM (
    SELECT unnest(COALESCE(v_refs, '{}')) AS ref
    UNION
    SELECT unnest(d5.derived_refs) AS ref FROM public.clarify_drafts d5
     WHERE d5.state = 'done' AND d5.point_id IN (
       SELECT s.point_id FROM public.point_chat_shares s JOIN public.chat_messages m ON m.id = s.message_id
        WHERE s.conversation_id = v_d.source_conversation_id AND m.deleted_at IS NULL
          AND m.created_at <= v_until -- P1631 recording fixes: the same set as already_drafted
          AND (NOT v_event OR m.thread_root_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.chat_messages rr WHERE rr.id = m.thread_root_id
                AND (rr.system_kind IS NOT NULL OR EXISTS (SELECT 1 FROM public.transcribe_session_threads sst WHERE sst.root_message_id = rr.id))))
          AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id AND m.created_at >= v_since)) r;
  SELECT array_remove(array_agg(DISTINCT r.ref), NULL) INTO v_refs FROM (
    SELECT unnest(COALESCE(v_refs, '{}')) AS ref
    UNION
    SELECT public._chat_author_ref(s.shared_by) AS ref FROM public.point_chat_shares s JOIN public.chat_messages m ON m.id = s.message_id
     WHERE s.conversation_id = v_d.source_conversation_id AND m.deleted_at IS NULL
       AND m.created_at <= v_until -- P1631 recording fixes: the same set as already_drafted
       AND (NOT v_event OR m.thread_root_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.chat_messages rr WHERE rr.id = m.thread_root_id
             AND (rr.system_kind IS NOT NULL OR EXISTS (SELECT 1 FROM public.transcribe_session_threads sst WHERE sst.root_message_id = rr.id))))
       AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id AND m.created_at >= v_since) r;

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
         derived_refs = COALESCE(v_refs, '{}'), sent_ids = v_locked, updated_at = now(),
         rec_kind = v_kind, rec_round_id = v_round, rec_table_no = v_table, rec_until = v_until,
         refine_target_id = CASE WHEN v_d.instruction IS NOT NULL THEN v_latest_id ELSE NULL END
   WHERE d.id = p_draft;

  RETURN jsonb_build_object(
    'status', 'run',
    'draft_id', p_draft,
    'run_token', v_spend,
    'owner_id', v_d.owner_id,
    'reserved_usd', v_usd,
    'owner_instruction', v_d.instruction,
    'source_message', v_source,
    'thread', '[]'::jsonb,
    'surrounding_chat', v_chat,
    'already_drafted', v_already,
    'owner_messages', v_owner_msgs,
    'latest_draft', v_latest,
    'scope', 'recording');
END;
$$;
REVOKE ALL ON FUNCTION public._clarify_begin_recording(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
