-- client-safe: clarify_threads.scope gains 'recording' and the table gains a nullable recording_room_id; clarify_drafts gains four nullable rec_* columns; clarify_start_recording is new and granted to authenticated like clarify_start_chat; _clarify_begin (service role, no client caller) keeps its argument list and grants and only dispatches a 'recording' thread to the new internal _clarify_begin_recording; get_clarify_thread keeps its signature, return shape and grants and only also resolves cited ids that name a live transcribed line
-- new function: clarify_start_recording
-- Migration: P1631 Clarify from the live recording banner (spec Open Question 6)
-- Created: 2026-11-13
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md
-- Guaranteed by: src/tests/p1631-recording-clarify-migration.test.ts (source contract), src/tests/integration/p1631-recording-clarify.test.ts
--
-- Earlier P1631 migrations are applied and are not edited. Each replaced function is the newest body copied byte for byte, then marked lines (`-- P1631 recording`).
--
-- diffed against:
--   _clarify_begin(uuid)         20261112250000_p1631_event_only_exclusion.sql (its newest definition): that body byte for byte plus the lines marked `-- P1631 recording` (three lines, one dispatch).
--   get_clarify_thread(uuid)     20261112150000_p1631_publish_to_chat.sql (its newest definition): that body byte for byte, except the two `'a'` / `'b'` cited lines, which are replaced in place by marked lines
--                                that append the cited transcribed lines (`_clarify_cited_recording_rows`) to the cited chat rows.
--
-- What it does:
--   1. A live Clarify press (the Clarify button on the recording banner) reads transcribe_messages, because live lines are not chat messages (record_transcribe_slice writes only that table; the
--      chat copy is posted after a round or a room ends and only while a kill switch that ships off is on). One recording is one seat in one transcribe_rooms row; at an event one room holds every
--      table's seats, and every room member can read every room row, so the read set is decided ONCE, at press time, and stored on the draft:
--        rec_kind 'round'  the presser is seated in a running round: only that round's lines of that table (dest_kind = 'round', dest_round_id, dest_table_no);
--        rec_kind 'own'    at an event, anywhere else (outside a round, or the posting kill switch is off): only the presser's own seat's lines;
--        rec_kind 'room'   in a DM or a group: every line of this room (the recording IS the conversation, every member can read it).
--      rec_until is the press time: later lines are never read by this draft.
--   2. The Mirror root of a recording thread is a clarify copy in the presser's Mirror with no body, author, thread or attachment, and no forwarded_from_message_id (there is no chat message it copies).
--      Its forward_snapshot holds only {scope 'recording', conversation_kind, conversation_title (+ _ref), recording_started_at, recording_until, created_at}.
--   3. A second press in the same room by the same person reuses the thread (one clarify_threads row per owner and room, enforced by a partial unique index) and queues a new draft on it.
--   4. A follow-up draft on the thread (clarify_another, clarify_message, a retry) is inserted by functions this migration does not touch, so it carries no rec_* columns: _clarify_begin_recording
--      then takes the read set and rec_until from the thread's oldest draft that has them, and writes them onto the draft it runs. A thread whose drafts were all deleted cannot restart that way
--      (clarify_message / clarify_another read the root's forwarded_from_message_id, which a recording root does not have, and answer 'thread not available'); a new press makes a new draft instead.
--   5. Cited lines: get_clarify_thread reads each cited id from chat_messages (as before) AND from transcribe_messages (the viewer must hold a seat in that room). Quote text always comes from the rows.

BEGIN;

-- 1. schema -------------------------------------------------------------------------------------------------------------------------------

ALTER TABLE public.clarify_threads DROP CONSTRAINT IF EXISTS clarify_threads_scope_check;
ALTER TABLE public.clarify_threads ADD CONSTRAINT clarify_threads_scope_check CHECK (scope IN ('message', 'thread', 'chat', 'recording'));
ALTER TABLE public.clarify_threads
  ADD COLUMN IF NOT EXISTS recording_room_id uuid REFERENCES public.transcribe_rooms(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS clarify_threads_one_recording_per_owner_room
  ON public.clarify_threads (owner_id, recording_room_id) WHERE scope = 'recording' AND recording_room_id IS NOT NULL;

ALTER TABLE public.clarify_drafts
  ADD COLUMN IF NOT EXISTS rec_kind     text CHECK (rec_kind IN ('round', 'own', 'room')),
  ADD COLUMN IF NOT EXISTS rec_round_id uuid,
  ADD COLUMN IF NOT EXISTS rec_table_no integer,
  ADD COLUMN IF NOT EXISTS rec_until    timestamptz;

-- 2. owner entrance: Clarify on the live recording ----------------------------------------------------------------------------------------

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

-- 3. the run: a recording thread reads transcribe_messages ----------------------------------------------------------------------------------

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
     ORDER BY f.created_at, f.id LIMIT 1;
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
          AND (NOT v_event OR m.thread_root_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.chat_messages rr WHERE rr.id = m.thread_root_id
                AND (rr.system_kind IS NOT NULL OR EXISTS (SELECT 1 FROM public.transcribe_session_threads sst WHERE sst.root_message_id = rr.id))))
          AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id AND m.created_at >= v_since)) r;
  SELECT array_remove(array_agg(DISTINCT r.ref), NULL) INTO v_refs FROM (
    SELECT unnest(COALESCE(v_refs, '{}')) AS ref
    UNION
    SELECT public._chat_author_ref(s.shared_by) AS ref FROM public.point_chat_shares s JOIN public.chat_messages m ON m.id = s.message_id
     WHERE s.conversation_id = v_d.source_conversation_id AND m.deleted_at IS NULL
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

-- 4. _clarify_begin: the newest body plus ONE dispatch ------------------------------------------------------------------------------------------

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
  v_owner_msgs  jsonb; -- P1631 r3
  v_latest      text; -- P1631 r3
  v_latest_id   uuid; -- P1631 r4
  v_scope       text; -- P1631 scope
  v_anchor      uuid; -- P1631 chat scope fixes
  v_event       boolean; -- P1631 event only
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
  IF v_d.updated_at < now() - interval '5 minutes' THEN -- P1631
    -- a draft nobody started within the abandon window is failed `abandoned`, as get_clarify_thread already reports it -- P1631
    PERFORM public._clarify_sweep(v_d.owner_id); -- P1631
    RETURN jsonb_build_object('status', 'failed'); -- P1631
  END IF; -- P1631
  IF COALESCE((SELECT t.scope FROM public.clarify_threads t WHERE t.root_id = v_d.thread_root_id), 'message') = 'recording' THEN -- P1631 recording
    RETURN public._clarify_begin_recording(p_draft); -- P1631 recording: a live recording reads transcribe_messages, never chat_messages
  END IF; -- P1631 recording

  v_since := public._chat_access_since(v_d.source_conversation_id, v_d.owner_id);
  IF v_since IS NULL THEN
    UPDATE public.clarify_drafts d SET state = 'failed', error_code = 'no_access', updated_at = now() WHERE d.id = p_draft AND d.state = 'queued';
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  -- the table-privacy exclusions below apply at an EVENT only: in a DM or a group a recording is the conversation -- P1631 event only
  SELECT COALESCE((SELECT c.kind = 'event' FROM public.chat_conversations c WHERE c.id = v_d.source_conversation_id), false) INTO v_event; -- P1631 event only
  -- a whole-chat thread outlives its anchor: when the anchor was deleted or its author erased, the run moves to the newest eligible top-level row (the same filter as clarify_start_chat's anchor) -- P1631 chat scope fixes
  IF COALESCE((SELECT t.scope FROM public.clarify_threads t WHERE t.root_id = v_d.thread_root_id), 'message') = 'chat' THEN -- P1631 chat scope fixes
    SELECT m.id INTO v_anchor FROM public.chat_messages m -- P1631 chat scope fixes
     WHERE m.conversation_id = v_d.source_conversation_id AND m.thread_root_id IS NULL AND m.kind = 'message' AND m.context_conversation_id IS NULL -- P1631 chat scope fixes
       AND m.system_kind IS NULL AND m.deleted_at IS NULL AND m.created_at >= v_since AND m.created_at <= v_d.created_at -- P1631 chat scope fixes
       AND (NOT v_event OR m.is_transcription = false) -- P1631 event only
       AND public._clarify_row_text(m) IS NOT NULL -- P1631 chat scope fixes
     ORDER BY m.created_at DESC, m.id DESC LIMIT 1; -- P1631 chat scope fixes
    IF v_anchor IS NOT NULL AND v_anchor IS DISTINCT FROM v_d.source_message_id THEN -- P1631 chat scope fixes
      UPDATE public.clarify_drafts d SET source_message_id = v_anchor WHERE d.id = p_draft AND d.state = 'queued'; -- P1631 chat scope fixes
      v_d.source_message_id := v_anchor; -- P1631 chat scope fixes
    END IF; -- P1631 chat scope fixes
  END IF; -- P1631 chat scope fixes
  SELECT m.* INTO v_src FROM public.chat_messages m
   WHERE m.id = v_d.source_message_id AND m.deleted_at IS NULL AND m.created_at >= v_since;
  IF NOT FOUND OR public._clarify_row_text(v_src) IS NULL THEN
    UPDATE public.clarify_drafts d SET state = 'failed', error_code = 'source_gone', updated_at = now() WHERE d.id = p_draft AND d.state = 'queued';
    RETURN jsonb_build_object('status', 'gone');
  END IF;

  SELECT COALESCE((SELECT t.scope FROM public.clarify_threads t WHERE t.root_id = v_d.thread_root_id), 'message') INTO v_scope; -- P1631 scope: read before the row selection, which depends on it

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
           AND NOT (v_scope = 'chat' AND v_event AND v_src.system_kind IS NOT NULL) -- P1631 event only: at an event a whole-chat run never reads the thread of a round or session root
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
         WHERE x.conversation_id = v_d.source_conversation_id
           AND (x.thread_root_id IS NULL -- P1631 scope
                OR (v_scope = 'chat' AND (NOT v_event OR NOT EXISTS (SELECT 1 FROM public.chat_messages r -- P1631 event only: a whole chat also reads ordinary thread replies; at an event never a round, outside-rounds or session thread
                      WHERE r.id = x.thread_root_id AND (r.system_kind IS NOT NULL -- P1631 scope
                            OR EXISTS (SELECT 1 FROM public.transcribe_session_threads st WHERE st.root_message_id = r.id)))))) -- P1631 event only
           AND (v_scope <> 'chat' OR NOT v_event OR x.system_kind IS NULL) -- P1631 event only: at an event a whole-chat run never sends a round-thread or session root row
           AND (NOT v_event OR x.is_transcription = false OR x.author_id = v_d.owner_id) -- P1631 event only: at an event surrounding chat is typed messages and the presser's own transcribed lines, in every scope
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
    RETURN jsonb_build_object('status', 'busy', 'reason', 'locked'); -- P1631
  END IF;
  v_thread_ids := ARRAY(SELECT u FROM unnest(v_thread_ids) u WHERE u = ANY (v_locked));
  v_chat_ids   := ARRAY(SELECT u FROM unnest(v_chat_ids) u WHERE u = ANY (v_locked));
  v_all := v_thread_ids || v_chat_ids || ARRAY[v_src.id];

  -- erasure takes this lock exclusively before it scrubs derived work; TRY, never wait (a wait while holding the rows above could close a cycle)
  IF NOT pg_try_advisory_xact_lock_shared(hashtext('p1520_mirror_context')) THEN
    RETURN jsonb_build_object('status', 'busy', 'reason', 'locked'); -- P1631
  END IF;

  -- the source row again, now that it is locked: an edit or an erase may have changed it
  SELECT m.* INTO v_src FROM public.chat_messages m WHERE m.id = v_src.id;
  v_text := public._clarify_row_text(v_src);
  IF v_src.deleted_at IS NOT NULL OR v_text IS NULL THEN
    UPDATE public.clarify_drafts d SET state = 'failed', error_code = 'source_gone', updated_at = now() WHERE d.id = p_draft AND d.state = 'queued';
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  v_source := jsonb_build_object('id', v_src.id, 'text', left(v_text, 4000), 'is_pressed', true,
                                 'pressed_author', CASE WHEN v_src.author_id = v_d.owner_id THEN 'owner' ELSE 'other' END); -- P1631 r3: who wrote the pressed row, never a name
  IF v_scope <> 'message' THEN -- P1631 scope
    v_source := v_source - 'pressed_author'; -- P1631 scope: a thread or a whole chat is the subject, so no one row's author is aimed at
  END IF; -- P1631 scope
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'text', left(public._clarify_row_text(t), 4000)) ORDER BY t.created_at, t.id), '[]'::jsonb)
    INTO v_thread FROM public.chat_messages t
   WHERE t.id = ANY (v_thread_ids) AND t.deleted_at IS NULL AND public._clarify_row_text(t) IS NOT NULL;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'text', left(public._clarify_row_text(t), 4000)) ORDER BY t.created_at, t.id), '[]'::jsonb)
    INTO v_chat FROM public.chat_messages t
   WHERE t.id = ANY (v_chat_ids) AND t.deleted_at IS NULL AND public._clarify_row_text(t) IS NOT NULL;

  -- whose words are in it, from exactly the rows read
  SELECT array_remove(array_agg(DISTINCT public._chat_author_ref(t.author_id)), NULL) INTO v_refs
    FROM public.chat_messages t WHERE t.id = ANY (v_all) AND t.deleted_at IS NULL AND t.author_id IS NOT NULL;

  -- the owner's newest draft, or the one a Mention in chat named: the statement a refine starts from -- P1631 r5 (moved above already_drafted, which leaves it out)
  SELECT p.statement, d3.id INTO v_latest, v_latest_id FROM public.clarify_drafts d3 JOIN public.points p ON p.id = d3.point_id -- P1631 r3
   WHERE d3.thread_root_id = v_d.thread_root_id AND d3.owner_id = v_d.owner_id AND d3.state = 'done' AND d3.id <> v_d.id -- P1631 r3
   ORDER BY (v_d.instruction IS NOT NULL AND d3.id IS NOT DISTINCT FROM v_d.refine_target_id) DESC, d3.created_at DESC, d3.id DESC LIMIT 1; -- P1631 r5: the named card first, then the newest

  -- the points this presser already made from this conversation: not to be repeated
  SELECT COALESCE(jsonb_agg(p.statement ORDER BY d2.created_at, d2.id), '[]'::jsonb) INTO v_already
    FROM public.clarify_drafts d2 JOIN public.points p ON p.id = d2.point_id
   WHERE d2.owner_id = v_d.owner_id AND d2.source_conversation_id = v_d.source_conversation_id AND d2.state = 'done'; -- P1631 r6: every done card, the refined one too (an instruction run may still answer `new`)
  -- points already published into this chat that the presser can read are not to be repeated either: live cards only, never from before the presser could read the chat -- P1631 scope
  SELECT v_already || COALESCE(jsonb_agg(q.statement ORDER BY q.created_at, q.point_id), '[]'::jsonb) INTO v_already FROM ( -- P1631 scope
    SELECT p.statement, s.created_at, s.point_id FROM public.point_chat_shares s -- P1631 scope
      JOIN public.chat_messages m ON m.id = s.message_id JOIN public.points p ON p.id = s.point_id -- P1631 scope
     WHERE s.conversation_id = v_d.source_conversation_id AND m.deleted_at IS NULL -- P1631 scope
       AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id AND m.created_at >= v_since -- P1631 scope
       AND (NOT v_event OR m.thread_root_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.chat_messages rr WHERE rr.id = m.thread_root_id -- P1631 event only: at an event not a card inside a round, outside-rounds or session thread
             AND (rr.system_kind IS NOT NULL OR EXISTS (SELECT 1 FROM public.transcribe_session_threads sst WHERE sst.root_message_id = rr.id)))) -- P1631 adversary fixes
       AND NOT EXISTS (SELECT 1 FROM public.clarify_drafts d4 WHERE d4.owner_id = v_d.owner_id AND d4.source_conversation_id = v_d.source_conversation_id -- P1631 scope
                        AND d4.state = 'done' AND d4.point_id = s.point_id)) q; -- P1631 scope: same point once

  -- what the owner typed in this thread (their own directions, newest 20, oldest first) -- P1631 r3
  SELECT COALESCE(jsonb_agg(left(o.body, 500) ORDER BY o.created_at, o.id), '[]'::jsonb) INTO v_owner_msgs FROM ( -- P1631 r3
    SELECT m.body, m.created_at, m.id FROM public.chat_messages m -- P1631 r3
     WHERE m.thread_root_id = v_d.thread_root_id AND m.author_id = v_d.owner_id AND m.kind = 'message' -- P1631 r3
       AND m.deleted_at IS NULL AND NULLIF(btrim(m.body), '') IS NOT NULL -- P1631 r3
       AND m.created_at <= v_d.created_at -- P1631 r4
     ORDER BY m.created_at DESC, m.id DESC LIMIT 20) o; -- P1631 r3

  -- the words behind those statements are in this run too: their authors' refs are this draft's refs (so erasing one of them reaches this draft) -- P1631
  SELECT array_remove(array_agg(DISTINCT r.ref), NULL) INTO v_refs FROM ( -- P1631
    SELECT unnest(COALESCE(v_refs, '{}')) AS ref -- P1631
    UNION -- P1631
    SELECT unnest(d2.derived_refs) AS ref -- P1631
      FROM public.clarify_drafts d2 JOIN public.points p ON p.id = d2.point_id -- P1631
     WHERE d2.owner_id = v_d.owner_id AND d2.source_conversation_id = v_d.source_conversation_id AND d2.state = 'done') r; -- P1631
  -- the same for the points published into this chat that are in already_drafted: the refs of the drafts that made them (same filter: live card, readable by the presser) -- P1631 review fixes
  SELECT array_remove(array_agg(DISTINCT r.ref), NULL) INTO v_refs FROM ( -- P1631 review fixes
    SELECT unnest(COALESCE(v_refs, '{}')) AS ref -- P1631 review fixes
    UNION -- P1631 review fixes
    SELECT unnest(d5.derived_refs) AS ref FROM public.clarify_drafts d5 -- P1631 review fixes
     WHERE d5.state = 'done' AND d5.point_id IN ( -- P1631 review fixes
       SELECT s.point_id FROM public.point_chat_shares s JOIN public.chat_messages m ON m.id = s.message_id -- P1631 review fixes
        WHERE s.conversation_id = v_d.source_conversation_id AND m.deleted_at IS NULL -- P1631 review fixes
          AND (NOT v_event OR m.thread_root_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.chat_messages rr WHERE rr.id = m.thread_root_id -- P1631 event only: the same set as already_drafted
                AND (rr.system_kind IS NOT NULL OR EXISTS (SELECT 1 FROM public.transcribe_session_threads sst WHERE sst.root_message_id = rr.id)))) -- P1631 adversary fixes
          AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id AND m.created_at >= v_since)) r; -- P1631 review fixes
  -- and the publisher's own ref for each published point shown: their words are the statement (so erasing the publisher reaches this draft) -- P1631 adversary fixes
  SELECT array_remove(array_agg(DISTINCT r.ref), NULL) INTO v_refs FROM ( -- P1631 adversary fixes
    SELECT unnest(COALESCE(v_refs, '{}')) AS ref -- P1631 adversary fixes
    UNION -- P1631 adversary fixes
    SELECT public._chat_author_ref(s.shared_by) AS ref FROM public.point_chat_shares s JOIN public.chat_messages m ON m.id = s.message_id -- P1631 adversary fixes
     WHERE s.conversation_id = v_d.source_conversation_id AND m.deleted_at IS NULL -- P1631 adversary fixes
       AND (NOT v_event OR m.thread_root_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.chat_messages rr WHERE rr.id = m.thread_root_id -- P1631 event only
             AND (rr.system_kind IS NOT NULL OR EXISTS (SELECT 1 FROM public.transcribe_session_threads sst WHERE sst.root_message_id = rr.id)))) -- P1631 adversary fixes
       AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id AND m.created_at >= v_since) r; -- P1631 adversary fixes

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
         derived_refs = COALESCE(v_refs, '{}'), sent_ids = v_all, updated_at = now(),
         refine_target_id = CASE WHEN v_d.instruction IS NOT NULL THEN v_latest_id ELSE NULL END -- P1631 r7: only a run with an instruction refines a card
   WHERE d.id = p_draft;

  RETURN jsonb_build_object(
    'status', 'run',
    'draft_id', p_draft,
    'run_token', v_spend, -- P1631
    'owner_id', v_d.owner_id,
    'reserved_usd', v_usd,
    'owner_instruction', v_d.instruction,
    'source_message', v_source,
    'thread', v_thread,
    'surrounding_chat', v_chat,
    'already_drafted', v_already,
    'owner_messages', v_owner_msgs, -- P1631 r3
    'latest_draft', v_latest, -- P1631 r3
    'scope', v_scope); -- P1631 scope
END;
$$;
REVOKE ALL ON FUNCTION public._clarify_begin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._clarify_begin(uuid) TO service_role;

-- 5. cited lines of a recording draft -------------------------------------------------------------------------------------------------------

-- The twin of _clarify_cited_rows for transcribed lines: each cited id that names a transcribe_messages row of a room the viewer holds a seat in, text read from the row, no names.
CREATE OR REPLACE FUNCTION public._clarify_cited_recording_rows(p_ids jsonb, p_uid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', m.id, 'text', left(m.text, 4000), 'at', m.spoken_at) ORDER BY i.o), '[]'::jsonb)
    FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_ids) = 'array' THEN p_ids ELSE '[]'::jsonb END) WITH ORDINALITY AS i(id, o)
    JOIN public.transcribe_messages m ON m.id = i.id::uuid
   WHERE NULLIF(btrim(m.text), '') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.transcribe_room_members s WHERE s.room_id = m.room_id AND s.profile_id = p_uid);
$$;
REVOKE ALL ON FUNCTION public._clarify_cited_recording_rows(jsonb, uuid) FROM PUBLIC, anon, authenticated;

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
        'refine_target_id', d.refine_target_id, -- P1631 r5: the card this card replaced, when it did
        'source_kind', (SELECT c.kind FROM public.chat_conversations c WHERE c.id = d.source_conversation_id), -- P1631 publish: a Mirror-sourced card has no chat to publish into
        'published', COALESCE((SELECT jsonb_agg(jsonb_build_object('conversation_id', s.conversation_id, 'message_id', s.message_id) ORDER BY s.created_at) -- P1631 publish
                                 FROM public.point_chat_shares s JOIN public.chat_messages m ON m.id = s.message_id -- P1631 publish
                                WHERE s.point_id = p.id AND m.deleted_at IS NULL AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id), '[]'::jsonb), -- P1631 publish
        'point', CASE WHEN p.id IS NOT NULL THEN jsonb_build_object(
                   'id', p.id, 'statement', p.statement,
                   'owner_position', (SELECT pp.position::text FROM public.point_positions pp WHERE pp.point_id = p.id AND pp.user_id = v_uid)) END,
        'suggestions', d.suggestions,
        'cited', CASE WHEN d.cited IS NULL THEN NULL ELSE jsonb_build_object(
          'a', public._clarify_cited_rows(d.cited -> 'a', v_uid) || public._clarify_cited_recording_rows(d.cited -> 'a', v_uid), -- P1631 recording
          'b', public._clarify_cited_rows(d.cited -> 'b', v_uid) || public._clarify_cited_recording_rows(d.cited -> 'b', v_uid)) END -- P1631 recording
      ) ORDER BY d.created_at, d.id)
      FROM public.clarify_drafts d
      LEFT JOIN public.points p ON p.id = d.point_id AND p.first_validator_id = v_uid
     WHERE d.thread_root_id = p_thread_root AND d.owner_id = v_uid), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.get_clarify_thread(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_clarify_thread(uuid) TO authenticated;

COMMIT;
