-- Migration: P1604 (6/6) — code-review fixes: sweep closes an aged room nobody can roll, enter cannot race a roll,
--   history is the caller's own span, the roll honours chat access, the heartbeat writes nothing on an ended seat,
--   a retry cannot wipe the incomplete set
-- Created: 2026-11-04
-- Spec: features/p1604_transcription_belongs_to_a_chat.md (rules 3, 5, 8; Resolved Decisions 1, 7, 8)
-- Guaranteed by: e2e/integration/20261103090000_p1604_transcription_belongs_to_a_chat.spec.ts
--
-- diffed against (each body identical except the change named):
--   transcribe_room_sweep_tick     20261104090000_p1604_older_pass_jobs_for_swept_rooms.sql (an aged room whose roll returns NULL, because
--                                  everyone just ended or it has no members, is ENDED; before it stayed open forever)
--   _transcribe_roll_room          20261103090100_p1604_transcription_belongs_to_a_chat_rooms.sql (a seat that lost access to the chat is
--                                  not carried into Part 2; a Part 2 with nobody seated is ended at once)
--   enter_transcribe_room          20261103090100_p1604_transcription_belongs_to_a_chat_rooms.sql (after the row locks it peeks again, in
--                                  a loop, until the room found is the room locked: a roll that replaced it while this call waited can
--                                  no longer produce a second open room or a 23505)
--   touch_transcribe_room_capture  20261103090100_p1604_transcription_belongs_to_a_chat_rooms.sql (same signature; an ended seat is not
--                                  written; the next room's code is returned only to someone SEATED there)
--   get_my_clean_transcript        20261103100000_p1604_incomplete_mark.sql (same signature; only text inside the caller's own span:
--                                  first Continue to end of capture)
--   post_clean_round               20261103100000_p1604_incomplete_mark.sql (same signature; the incomplete set is a UNION with what an
--                                  earlier attempt stored)
-- new function: _transcribe_peek_open_room
--
-- client-safe: function bodies only; signatures, return types and grants are unchanged and restated.

-- The newest open room of a place: the event's room, or the chat's own. NULL for a plain start or when none is open.
CREATE OR REPLACE FUNCTION public._transcribe_peek_open_room(p_event uuid, p_conversation uuid)
RETURNS uuid
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id FROM public.transcribe_rooms r
   WHERE r.ended_at IS NULL
     AND ((p_event IS NOT NULL AND r.event_id = p_event)
          OR (p_conversation IS NOT NULL AND r.conversation_id = p_conversation))
   ORDER BY r.created_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public._transcribe_peek_open_room(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._transcribe_roll_room(p_room uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old   public.transcribe_rooms%ROWTYPE;
  v_new   public.transcribe_rooms%ROWTYPE;
  v_open  uuid[];
  v_m     public.transcribe_room_members%ROWTYPE;
  v_sess  uuid;
BEGIN
  SELECT r.* INTO v_old FROM public.transcribe_rooms r WHERE r.id = p_room AND r.ended_at IS NULL;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(array_agg(m.id), '{}') INTO v_open
    FROM public.transcribe_room_members m
   WHERE m.room_id = p_room AND m.capture_ended_at IS NULL AND m.consent_given_at IS NOT NULL;
  IF cardinality(v_open) = 0 THEN
    RETURN NULL;
  END IF;

  -- End the old room first: the one-open-room-per-chat index would refuse the next while it is open. Everyone who was
  -- recording stops here; their seat in the next room is created below from the saved ids.
  UPDATE public.transcribe_room_members m SET capture_ended_at = now()
   WHERE m.room_id = p_room AND m.capture_ended_at IS NULL;
  UPDATE public.transcribe_rooms r SET ended_at = now() WHERE r.id = p_room;

  INSERT INTO public.transcribe_rooms (code, event_id, conversation_id, part_no, continues_room_id)
  VALUES (public._transcribe_new_room_code(), v_old.event_id, v_old.conversation_id, v_old.part_no + 1, v_old.id)
  RETURNING * INTO v_new;

  FOR v_m IN SELECT m.* FROM public.transcribe_room_members m WHERE m.id = ANY (v_open) ORDER BY m.id LOOP
    -- a seat that lost access to the chat since it began is not carried into Part 2 (its seat in Part 1 ended above)
    IF v_old.conversation_id IS NOT NULL AND public._chat_access_since(v_old.conversation_id, v_m.profile_id) IS NULL THEN
      CONTINUE;
    END IF;
    -- a session of their own, so Part 2 has its own history entry (same columns createClaritySession writes)
    INSERT INTO public.clarity_sessions
      (creator_name, creator_profile_id, state, demo_status, partnership_status, is_private)
    VALUES (v_m.display_name, v_m.profile_id, '{}'::jsonb, 'waiting', 'pending', false)
    RETURNING id INTO v_sess;

    INSERT INTO public.transcribe_room_members
      (room_id, profile_id, display_name, session_id, consent_given_at, consent_carried_from_room_id,
       last_seen_at, paused_since)
    VALUES (v_new.id, v_m.profile_id, v_m.display_name, v_sess, v_m.consent_given_at, v_old.id,
            now(), v_m.paused_since);
  END LOOP;
  -- nobody could be carried over: Part 2 would be an empty room that nothing ever ends
  UPDATE public.transcribe_rooms r SET ended_at = now()
   WHERE r.id = v_new.id AND NOT EXISTS (SELECT 1 FROM public.transcribe_room_members m WHERE m.room_id = r.id);
  RETURN v_new.id;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_roll_room(uuid) FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.transcribe_room_sweep_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Rule 8: the ROOM'S clock. 176 < the cleaner's 3-hour limit (round_clean.MAX_WINDOW_S), so even with a 2-minute sweep the
  -- room ends before its window can exceed it. The slice and signed-URL functions refuse at 180 minutes as a backstop.
  c_roll  CONSTANT interval := interval '176 minutes';
  -- Rules 4 + 5 (founder: 10 minutes). The client's paused heartbeat (every 2 minutes) stays well inside it.
  c_stale CONSTANT interval := interval '10 minutes';
  -- Rule 4 of the Resolved Decisions: audio recorded before a Stop may upload for this long afterwards.
  c_late  CONSTANT interval := interval '2 minutes';
  v_room  uuid;
  -- rooms THIS tick closed because nobody was sending (silent or paused): no final upload can be in flight
  v_swept uuid[] := '{}';
BEGIN
  FOR v_room IN SELECT r.id FROM public.transcribe_rooms r WHERE r.ended_at IS NULL ORDER BY r.id LOOP
    -- the same lock enter, join and end take; skip a room another transaction closed while this tick waited
    PERFORM 1 FROM public.transcribe_rooms r WHERE r.id = v_room AND r.ended_at IS NULL FOR UPDATE;
    CONTINUE WHEN NOT FOUND;

    -- Rule 4: someone who vanished without Stop is waited for up to 10 minutes of silence from their device.
    UPDATE public.transcribe_room_members m SET capture_ended_at = now()
     WHERE m.room_id = v_room AND m.capture_ended_at IS NULL
       AND COALESCE(m.last_seen_at, m.joined_at) < now() - c_stale;

    -- Rule 5: everyone still recording is paused, and has been for 10 minutes: the session ends.
    IF EXISTS (SELECT 1 FROM public.transcribe_room_members m WHERE m.room_id = v_room AND m.capture_ended_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM public.transcribe_room_members m
                        WHERE m.room_id = v_room AND m.capture_ended_at IS NULL
                          AND (m.paused_since IS NULL OR m.paused_since >= now() - c_stale)) THEN
      UPDATE public.transcribe_room_members m SET capture_ended_at = now()
       WHERE m.room_id = v_room AND m.capture_ended_at IS NULL;
    END IF;

    -- Rule 8: a session running 3 hours is ended and carried on as Part 2.
    IF EXISTS (SELECT 1 FROM public.transcribe_rooms r WHERE r.id = v_room AND r.created_at + c_roll <= now()) THEN
      IF public._transcribe_roll_room(v_room) IS NULL THEN
        -- nobody is left to carry on (everyone just ended, or the room has no members): the room is over. Without this it
        -- stayed open forever, lost its text, and the next starter joined it. It waits the 2-minute upload window like a Stop.
        UPDATE public.transcribe_rooms r SET ended_at = now() WHERE r.id = v_room AND r.ended_at IS NULL;
      END IF;
    ELSIF public._transcribe_close_room_if_idle(v_room) THEN
      v_swept := v_swept || v_room;
    END IF;
  END LOOP;

  -- The older per-person pass: one job per member of every room that ended at least c_late ago (the final audio of a Stop
  -- may still be uploading before that). Bounded to the last day so a backlog of old rooms is never queued. Members with
  -- last_seen_at IS NULL are pre-P1307 seats with no archive layout to reassemble (see 20260914120300).
  INSERT INTO public.transcribe_room_transcription_jobs (room_id, member_id)
  SELECT m.room_id, m.id
    FROM public.transcribe_rooms r
    JOIN public.transcribe_room_members m ON m.room_id = r.id
   WHERE r.ended_at IS NOT NULL
     AND (r.id = ANY (v_swept)
          OR (r.ended_at <= now() - c_late AND r.ended_at > now() - interval '1 day'))
     AND m.last_seen_at IS NOT NULL
  ON CONFLICT (room_id, member_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.transcribe_room_sweep_tick() IS
  'P1307 Decision 2 + P1604: ends silent members (10 minutes) and rooms whose open members are all paused for 10 minutes, '
  'rolls a room at 176 minutes into Part 2, closes idle rooms, and creates the older pass'' jobs for rooms ended 2 minutes ago. '
  'A last Stop closes its room itself (end_transcribe_room_capture). Takes the room row lock. Idempotent.';


CREATE OR REPLACE FUNCTION public.enter_transcribe_room(
  p_display_name text,
  p_session_id uuid,
  p_consent boolean,
  p_new_code text,
  p_event_id uuid DEFAULT NULL,
  p_conversation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  room_id uuid,
  room_code text,
  room_event_id uuid,
  room_created_at timestamptz,
  room_ended_at timestamptz,
  member_id uuid,
  member_profile_id uuid,
  member_display_name text,
  member_session_id uuid,
  member_joined_at timestamptz,
  member_consent_given_at timestamptz,
  room_conversation_id uuid,
  room_part_no integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- use_column: ON CONFLICT's target list cannot take a qualified name and room_id is both an OUT variable and a
-- column (see 20260911151200). Safe: no OUT variable is ever read; values live in v_/p_/c_ names.
#variable_conflict use_column
DECLARE
  c_lock_key CONSTANT bigint := hashtext('p1236:enter_transcribe_room');
  v_uid     uuid := auth.uid();
  v_name    text := btrim(coalesce(p_display_name, ''));
  v_conv    public.chat_conversations%ROWTYPE;
  v_event   uuid := p_event_id;
  v_conv_id uuid := p_conversation_id;
  v_room    public.transcribe_rooms%ROWTYPE;
  v_peek    uuid;
  v_again   uuid;
  i         integer;
  v_others  uuid[];
  v_member  public.transcribe_room_members%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'consent is required to join a transcription room' USING ERRCODE = '42501';
  END IF;
  IF length(v_name) = 0 OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'display name must be between 1 and 100 characters' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clarity_sessions s
                  WHERE s.id = p_session_id AND s.creator_profile_id = v_uid) THEN
    RAISE EXCEPTION 'session does not belong to the caller' USING ERRCODE = '42501';
  END IF;

  -- Which room is this? A chat -> its event room (while the event may still be transcribed and is not a hike), else a
  -- room of the chat with no event. An event with no chat given -> its event room. Neither -> a plain room, new each start.
  IF v_conv_id IS NOT NULL THEN
    PERFORM public.assert_transcribe_chat_access(v_conv_id, v_uid);
    SELECT c.* INTO v_conv FROM public.chat_conversations c WHERE c.id = v_conv_id;
    IF v_event IS NOT NULL AND v_conv.event_id IS DISTINCT FROM v_event THEN
      RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
    END IF;
    IF v_conv.kind = 'event' AND public._transcribe_event_room_eligible(v_conv.event_id) THEN
      v_event := v_conv.event_id;
    ELSE
      v_event := NULL;
    END IF;
  ELSIF v_event IS NOT NULL THEN
    SELECT c.id INTO v_conv_id FROM public.chat_conversations c WHERE c.kind = 'event' AND c.event_id = v_event;
  END IF;

  PERFORM public.assert_transcribe_event_access(v_event, v_uid);

  PERFORM pg_advisory_xact_lock(c_lock_key);

  -- Peek, then lock {the room I would join} + {every other room I am recording in} in ONE ordered statement, and peek AGAIN:
  -- a roll or a last Stop may have replaced that room while this call waited for the lock. Repeat until the room found is
  -- the room locked, so an event never has two open rooms and a chat never trips the one-open-room index (23505).
  v_peek := public._transcribe_peek_open_room(v_event, p_conversation_id);
  FOR i IN 1 .. 5 LOOP
    v_others := public._transcribe_other_open_rooms(v_uid, v_peek);
    PERFORM public._transcribe_lock_rooms(v_others || CASE WHEN v_peek IS NULL THEN '{}'::uuid[] ELSE ARRAY[v_peek] END);
    v_again := public._transcribe_peek_open_room(v_event, p_conversation_id);
    EXIT WHEN v_again IS NOT DISTINCT FROM v_peek;
    v_peek := v_again;
  END LOOP;

  -- Re-read under the lock: it may have been closed by a last Stop while this call waited.
  v_room := NULL;
  IF v_peek IS NOT NULL THEN
    SELECT r.* INTO v_room FROM public.transcribe_rooms r WHERE r.id = v_peek AND r.ended_at IS NULL;
  END IF;

  -- Rule 7: stop my recording in any other room (the target, if it exists, is kept).
  PERFORM public._transcribe_end_captures_in(v_uid, public._transcribe_other_open_rooms(v_uid, v_room.id));

  IF v_room.id IS NULL THEN
    IF p_new_code IS NULL OR p_new_code !~ '^[A-HJ-NP-Z2-9]{6}$' THEN
      RAISE EXCEPTION 'room code must be 6 characters from the room-code alphabet' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.transcribe_rooms (code, event_id, conversation_id)
    VALUES (p_new_code,
            v_event,
            -- a plain room has no chat; an event room records its chat when it has one
            CASE WHEN p_conversation_id IS NOT NULL OR v_event IS NOT NULL THEN v_conv_id END)
    RETURNING * INTO v_room;
  END IF;

  INSERT INTO public.transcribe_room_members AS m
    (room_id, profile_id, display_name, session_id, consent_given_at, last_seen_at)
  VALUES (v_room.id, v_uid, v_name, p_session_id, now(), now())
  ON CONFLICT (room_id, profile_id) DO UPDATE
    SET consent_given_at = COALESCE(m.consent_given_at, now()),
        display_name     = EXCLUDED.display_name,
        capture_ended_at = NULL,
        paused_since     = NULL,
        last_seen_at     = now()
  RETURNING * INTO v_member;

  RETURN QUERY SELECT
    v_room.id, v_room.code, v_room.event_id, v_room.created_at, v_room.ended_at,
    v_member.id, v_member.profile_id, v_member.display_name, v_member.session_id,
    v_member.joined_at, v_member.consent_given_at,
    v_room.conversation_id, v_room.part_no;
END;
$$;

-- ── touch_transcribe_room_capture: no write on an ended seat; the next room only for someone seated there ──
CREATE OR REPLACE FUNCTION public.touch_transcribe_room_capture(p_room_id uuid)
RETURNS TABLE (room_ended boolean, moved_to_room_id uuid, moved_to_room_code text, moved_to_member_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_ended timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- An ended seat is never written: a late beat must not revive its presence or restart its pause clock.
  UPDATE public.transcribe_room_members AS m
     SET last_seen_at = now(), paused_since = COALESCE(m.paused_since, now())
   WHERE m.room_id = p_room_id AND m.profile_id = v_uid AND m.capture_ended_at IS NULL;
  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM public.transcribe_room_members m WHERE m.room_id = p_room_id AND m.profile_id = v_uid) THEN
    RAISE EXCEPTION 'not a member of this room' USING ERRCODE = '42501';
  END IF;

  SELECT r.ended_at INTO v_ended FROM public.transcribe_rooms r WHERE r.id = p_room_id;
  RETURN QUERY
  SELECT v_ended IS NOT NULL, x.room_id, x.code, x.member_id
    FROM (SELECT 1) one
    LEFT JOIN LATERAL (
      SELECT nr.id AS room_id, nr.code, nm.id AS member_id
        FROM public.transcribe_rooms nr
        JOIN public.transcribe_room_members nm ON nm.room_id = nr.id AND nm.profile_id = v_uid
       WHERE nr.continues_room_id = p_room_id
       LIMIT 1) x ON true;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_transcribe_room_capture(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_transcribe_room_capture(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.touch_transcribe_room_capture(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_clean_round(p_job_id uuid, p_attempt integer, p_items jsonb, p_partial boolean DEFAULT false,
  p_incomplete uuid[] DEFAULT '{}')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job    public.transcribe_round_clean_jobs;
  v_p      uuid;
  v_i      record;
  v_n      integer := 0;
  v_thread uuid;
BEGIN
  SELECT j.* INTO v_job FROM public.transcribe_round_clean_jobs j WHERE j.id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'processing' OR v_job.attempts IS DISTINCT FROM p_attempt THEN
    RAISE EXCEPTION 'clean post: stale or unclaimed job' USING ERRCODE = '22023';
  END IF;
  IF NOT public._transcribe_clean_enabled() THEN
    RAISE EXCEPTION 'clean post: posting is switched off' USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'clean post: items must be an array' USING ERRCODE = '22023';
  END IF;

  -- all speaker locks first, in profile-id order (see LOCK ORDER in 20261101140000)
  FOR v_p IN
    SELECT DISTINCT m.profile_id
      FROM jsonb_array_elements(p_items) it
      JOIN public.transcribe_room_members m ON m.id = (it ->> 'member_id')::uuid
     WHERE m.profile_id IS NOT NULL
     ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('p1592:speaker:' || v_p::text, 0));
  END LOOP;

  -- P1604 decision 4: named before any line is posted, so a session root made below carries the mark.
  -- A UNION with what an earlier attempt stored: a retry that names nobody must not wipe the set.
  UPDATE public.transcribe_round_clean_jobs j
     SET incomplete_member_ids = COALESCE((SELECT array_agg(DISTINCT x ORDER BY x)
                                             FROM unnest(j.incomplete_member_ids || COALESCE(p_incomplete, '{}')) x), '{}')
   WHERE j.id = p_job_id
  RETURNING j.incomplete_member_ids INTO v_job.incomplete_member_ids;

  -- P1604 Decision 7: the cleaned text is kept per job for session history, whether or not a line reaches a chat. Only
  -- speakers in the job's seat snapshot; idempotent per (job, speaker, chunk) like the posts.
  INSERT INTO public.transcribe_clean_texts (job_id, member_id, chunk_ms, text)
  SELECT p_job_id, (it ->> 'member_id')::uuid, (it ->> 'chunk_ms')::bigint, btrim(it ->> 'text')
    FROM jsonb_array_elements(p_items) it
   WHERE btrim(COALESCE(it ->> 'text', '')) <> ''
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_job.seats) s WHERE s ->> 'member_id' = it ->> 'member_id')
  ON CONFLICT (job_id, member_id, chunk_ms) DO NOTHING;

  FOR v_i IN
    SELECT (it ->> 'member_id')::uuid AS member_id, (it ->> 'chunk_ms')::bigint AS chunk_ms, it ->> 'text' AS txt
      FROM jsonb_array_elements(p_items) it
     ORDER BY (it ->> 'chunk_ms')::bigint, (it ->> 'member_id')
  LOOP
    IF public._post_clean_round_item(p_job_id, v_i.member_id, v_i.chunk_ms, v_i.txt) IS NOT NULL THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;

  -- A retry names someone the first attempt did not: the session root made then gets the mark too.
  IF cardinality(v_job.incomplete_member_ids) > 0 AND v_job.room_id IS NOT NULL THEN
    UPDATE public.chat_messages m SET body = m.body || '|i'
     WHERE m.id = (SELECT t.root_message_id FROM public.transcribe_session_threads t WHERE t.room_id = v_job.room_id)
       AND m.body LIKE 'session|%' AND m.body NOT LIKE '%|i';
  END IF;

  -- The note commits with the text. A retry that posts nothing new still lands here.
  IF p_partial AND v_job.kind = 'round' THEN
    SELECT t.id INTO v_thread FROM public.chat_round_threads t
     WHERE t.round_id = v_job.round_id AND t.table_no = v_job.table_no;
    IF v_thread IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('p1592:thread:' || v_job.round_id::text || ':' || v_job.table_no::text, 0));
      UPDATE public.chat_round_threads SET audio_missing = true WHERE id = v_thread;
      PERFORM public._transcribe_retitle_thread(v_thread);
    END IF;
  END IF;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.post_clean_round(uuid, integer, jsonb, boolean, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_clean_round(uuid, integer, jsonb, boolean, uuid[]) TO service_role;



CREATE OR REPLACE FUNCTION public.get_my_clean_transcript(p_room_id uuid)
RETURNS TABLE (job_id uuid, member_id uuid, display_name text, chunk_ms bigint, text text, incomplete boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT t.job_id, t.member_id, tm.display_name, t.chunk_ms, t.text, t.member_id = ANY (j.incomplete_member_ids)
    FROM public.transcribe_room_members me
    JOIN public.transcribe_round_clean_jobs j
      ON EXISTS (SELECT 1 FROM jsonb_array_elements(j.seats) s WHERE s ->> 'member_id' = me.id::text)
    JOIN public.transcribe_clean_texts t ON t.job_id = j.id
    JOIN public.transcribe_room_members tm ON tm.id = t.member_id
   WHERE me.room_id = p_room_id AND me.profile_id = auth.uid() AND auth.uid() IS NOT NULL
     -- only the caller's OWN span in the room (first Continue to end of capture): a chunk is 60 s long, so it counts from the
     -- moment its end passes the join. A late joiner never gets the text from before they were there.
     AND t.chunk_ms + 60000 > (extract(epoch FROM me.joined_at) * 1000)::bigint
     AND t.chunk_ms < (extract(epoch FROM COALESCE(me.capture_ended_at, now())) * 1000)::bigint
   ORDER BY t.chunk_ms, t.member_id;
$$;

COMMENT ON FUNCTION public.get_my_clean_transcript(uuid) IS
  'P1604 Decision 7: the cleaned text of every clean job the CALLER was a seat of in this room, inside the caller''s own span (first '
  'Continue to end of capture). Never another table''s words, never text from before the caller was there. incomplete: that speaker''s '
  'audio did not all arrive (decision 4).';
REVOKE ALL ON FUNCTION public.get_my_clean_transcript(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_clean_transcript(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.post_clean_round(uuid, integer, jsonb, boolean, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_clean_round(uuid, integer, jsonb, boolean, uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.enter_transcribe_room(text, uuid, boolean, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enter_transcribe_room(text, uuid, boolean, text, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.enter_transcribe_room(text, uuid, boolean, text, uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public._transcribe_roll_room(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transcribe_room_sweep_tick() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transcribe_room_sweep_tick() FROM anon;
REVOKE ALL ON FUNCTION public.transcribe_room_sweep_tick() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transcribe_room_sweep_tick() TO service_role;

DO $check$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public._transcribe_peek_open_room(uuid, uuid)', 'public._transcribe_roll_room(uuid)',
                               'public.transcribe_room_sweep_tick()', 'public.post_clean_round(uuid, integer, jsonb, boolean, uuid[])']
  LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1604: % is client-callable', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY['public.enter_transcribe_room(text, uuid, boolean, text, uuid, uuid)',
                               'public.touch_transcribe_room_capture(uuid)', 'public.get_my_clean_transcript(uuid)']
  LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1604: client grants on % are wrong', v_fn;
    END IF;
  END LOOP;
END
$check$;
