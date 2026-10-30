-- P1536 + P1592: one body each for erase_chat_data_for, erase_my_account and forward_chat_message that carries BOTH features' edits,
-- plus the helper _erase_lock_canvas_owners that both erasure functions call.
--
-- Why this file exists: P1536 (canvas draft versions, Design v6) and P1592 (event transcripts in round threads) each
-- restate these two functions from the same older body (20261020213000_p1520_mirror_v2.sql and
-- 20261019203000_p1512_clarity_chat.sql), on separate branches. Whichever migration applies last silently drops the other
-- feature's edits (the shared test database already showed it: P1592's 20261029180000 replaced the P1536 bodies and
-- five P1536 tests failed). This file sorts after both, so its two bodies are the newest definitions and keep every edit.
--
-- It can only be applied to a database that already has the P1592 objects (chat_round_threads, chat_round_thread_members,
-- _transcribe_retitle_thread, _transcribe_bare_root_title, the is_transcription and system_kind columns of chat_messages):
-- the bodies use them. Ship it with or after P1592, never before.
--
-- client-safe: one new function, _erase_lock_canvas_owners (closed to anon and authenticated, called only by the two erasure
--   functions). No signature, grant or security setting of an existing function changes. erase_chat_data_for is service-role only (it
--   gains no grant); erase_my_account keeps its grant to authenticated exactly as P1592 has it; forward_chat_message keeps its
--   signature, SECURITY DEFINER and search_path, and its grant to authenticated. What changes is only that each body now holds both
--   deltas below.
--
-- diffed against: the P1592 body (20261029180000_p1592_event_transcripts_round_threads.sql at w5 commit 9dff3211c) and the
--   P1536 body (erase: 20261030080000_p1536_v6_engine.sql; erase_my_account has no P1536 body, it gains one block here; forward: 20261029100000_p1536_canvas_draft_versions.sql), each
--   against its common base (erase 20261020213000_p1520_mirror_v2.sql, forward 20261019203000_p1512_clarity_chat.sql).
--   erase_chat_data_for
--     P1592 kept (its body at w5 commit 9dff3211c): step 0 (the exclusive 'p1592:erasing' marker, then the speaker lock, then the
--       thread locks of every round table the person is in or seated at, then the thread collection) and step 7 (drop the person from
--       each round thread's members and retitle through _transcribe_retitle_thread; the 'chat_round_threads_retitled' count).
--     P1536 kept: the engine's per-owner advisory locks (the erased user's and every affected owner's, one sorted set), the affected
--       draft rows locked right after the step-6 context lock, and (step 8) the revision bump per draft that had a v6 run
--       cancelled, the cancelled runs, and the cleared tensions and decided notes.
--     Lock order: global erasure lock, erasing marker, owner locks (sorted), speaker lock, thread locks, p1520 context lock, draft rows.
--       The global lock hashtextextended('p1536:erasure', 0) is taken first by erase_my_account and erase_chat_data_for and by nothing
--       else (grep of supabase/, src/ and both worktrees' migrations: no other hit), so erasures run one at a time. That is what makes
--       it safe that the owner set can GROW between erase_my_account's helper call and the one inside erase_chat_data_for (a draft
--       can start to carry the ref in between): the late call may lock an owner that sorts before one already held, and with two
--       erasures at once that would cross (A holds A and wants B, B holds B and wants A); with one erasure at a time no second
--       transaction is acquiring owner locks in the opposite order. The other holders of several owner locks are the engine's
--       only multi-owner function, _canvas_draft_material_expire (hourly cron), which used to take its owners' locks in a
--       loop; it is now one plain DELETE of rows that are already unreadable by time and takes no owner lock at all. Every other engine
--       function (grep of the v6 file and the earlier P1536 migrations: 29 definitions; apart from the cron loop and the erasure loop
--       that is now the helper, each has exactly ONE owner-lock call, on v_uid, p_owner or v_run.owner_id) takes a single owner lock
--       for the whole call and waits on no second owner, so erasure versus engine cannot cycle on owner locks.
--       Who takes what (grep of both trees): the erasing marker is taken exclusively only here; every other taker
--       (_transcribe_thread_roster_locked, _transcribe_seat_joins_thread) only TRIES it shared and skips on failure, so it is never
--       waited for. The speaker and thread locks are taken by _transcribe_post_line, _transcribe_seat_joins_thread and this function;
--       none of those takes a p1515 owner lock. The v6 engine functions that take the p1515 owner lock (18 definitions besides this one) take no p1592 lock, and the engine
--       only TRIES the p1520 lock. So no transaction holds an owner lock while waiting on a p1592 lock, nor the reverse, and two
--       erasures both go marker, then owner locks in sorted order, then the rest. Taking the marker first means this transaction
--       holds nothing while it waits for the posters that hold the marker's shared side (P1592's own rule), and the engine is not
--       blocked meanwhile. Owner locks first would also be acyclic; it would hold them across that wait for no gain.
--   _erase_lock_canvas_owners (new)
--     The owner-lock loop that used to sit inside erase_chat_data_for, unchanged: the erased user plus every owner whose drafts or runs
--     read that person's words, p1515 locks taken in owner order as one set.
--   erase_my_account
--     P1592 kept: its whole body at 9dff3211c (the erase_chat_data_for call above the room-member tombstone).
--     P1536 added: before the first mutation it takes the erasing marker and then calls _erase_lock_canvas_owners. Why: a running
--       _canvas_draft_run_complete holds the owner's p1515 lock and then waits on that person's point rows, while this function used
--       to update those rows first and reach the owner locks only inside erase_chat_data_for, so the two waited on each other. Both
--       erasure functions now take the same locks in the same order before any row (marker, owner locks); advisory locks are
--       re-entrant, so erase_chat_data_for taking them again is harmless. erase_chat_data_for is called only from here (grep of
--       supabase/migrations, supabase/functions, scripts and src), so no other path reaches the owner locks late.
--   forward_chat_message
--     P1592 kept: the snapshot allowlist gains is_transcription and system_kind, and a copied round-thread root carries
--       "Round {n}" without the names (_transcribe_bare_root_title).
--     P1536 kept: forwarding a canvas_version attachment is refused with 22023 'chat: attachment not available'.
--   Pinned by src/tests/p1536-v6-engine-migration.test.ts (each newest body equals P1592's plus the P1536 hunks, exactly).

BEGIN;

-- The p1515 owner-lock step of erasure, as its own function so that erase_my_account can take the SAME locks before its first
-- mutation (a running draft-engine call holds its owner lock and then waits on the person's point rows; erase_my_account used to
-- update those rows first and only reach the owner locks inside erase_chat_data_for, which deadlocks). The set is the erased
-- user plus every owner of a draft whose tension step or runs read that person's words, taken in owner order as ONE set.
CREATE OR REPLACE FUNCTION public._erase_lock_canvas_owners(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ref text := public._chat_author_ref(p_uid);
  v_o   record;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION '_erase_lock_canvas_owners: no subject' USING ERRCODE = '22023';
  END IF;
  -- (An owner who becomes affected only after this read is the one case not covered: its draft rows are still locked in
  -- erase_chat_data_for, after the p1520 lock.)
  FOR v_o IN
    SELECT x.owner_id FROM (
      SELECT p_uid AS owner_id
      UNION
      SELECT d.owner_id FROM public.canvas_drafts d
       WHERE d.tension_refs @> ARRAY[v_ref]
          OR d.id IN (SELECT r.draft_id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref])
    ) x
    ORDER BY x.owner_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_o.owner_id::text, 0));
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public._erase_lock_canvas_owners(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.erase_chat_data_for(p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  v_ref text := public._chat_author_ref(p_uid);
  n     integer;
  pass  integer;
  v_threads uuid[];
  v_th      public.chat_round_threads;
  v_key     record;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'erase_chat_data_for: no subject' USING ERRCODE = '22023';
  END IF;

  -- (P1536 + P1592 merged) ONE erasure at a time: this global lock is the very first lock, before the erasing marker. Erasures are
  -- rare. See the header of this file for why this makes the growth of the owner set between the two helper calls safe.
  PERFORM pg_advisory_xact_lock(hashtextextended('p1536:erasure', 0));

  -- 0. (P1592) LOCKS FIRST, before any message row is touched. Order: the ERASING MARKER (exclusive, see
  -- _transcribe_thread_roster_locked: posters and the seating trigger only try it shared and never wait, and
  -- a holder of the shared side is waited for HERE, before any thread lock is held), then speaker, thread,
  -- place, message rows. The speaker lock keeps the poster from committing this person's words after step 2
  -- scrubbed them. Then the thread lock of EVERY (round, table) this person is a member of or is seated at, whether or not a
  -- thread exists yet, taken in (round, table) order (host_set_round_seats seats in the same order). Only THEN
  -- are the threads collected, so a poster that holds a table's lock commits first and its thread is found
  -- here, and a poster that comes later waits and reads a roster without this person: the member list rows
  -- are deleted in step 7 and the seat is tombstoned (profile_id NULL, which the roster skips) in the same
  -- transaction, before any lock is released.
  -- The seat lookup joins event_room_members on profile_id, so erase_my_account must call this BEFORE it
  -- tombstones those rows (it does: redefined below). Locks are held to the end of the transaction, which
  -- includes the profile delete.
  PERFORM pg_advisory_xact_lock(hashtextextended('p1592:erasing:' || p_uid::text, 0));   -- exclusive marker, first
  -- (P1536 + P1592 merged) Lock order, outermost first: P1592's erasing marker (waits for the posters and the seating trigger that
  -- hold its shared side, while this transaction holds nothing), then the engine's owner locks (next block), then P1592's speaker
  -- and thread locks (step 0), then the p1520 context lock (step 6), then the draft rows. See the header of this file.
  -- The engine's per-owner advisory locks come FIRST, before any row is touched: the erased user's own, and those of every
  -- owner of a draft whose runs read their words, as ONE set taken in owner order. Every engine function takes its owner's
  -- lock before anything else, so an engine transaction in flight (it may hold a conversation or draft row) finishes first,
  -- and two concurrent erasures take the locks in the same global order and cannot cross. Waiting here cannot form a cycle:
  -- the engine only TRIES the p1520 lock (shared) and never waits for it. (An owner who becomes affected only between this
  -- read and the p1520 lock below is the one case not covered: its draft rows are still locked in step 6.)
  -- The step is the helper _erase_lock_canvas_owners (defined above); erase_my_account takes the same locks before its first
  -- mutation, so this call is a re-entrant no-op there (it only adds an owner that became affected in between).
  PERFORM public._erase_lock_canvas_owners(p_uid);

  PERFORM pg_advisory_xact_lock(hashtextextended('p1592:speaker:' || p_uid::text, 0));
  FOR v_key IN
    SELECT k.round_id, k.table_no FROM (
      SELECT t.round_id, t.table_no FROM public.chat_round_threads t
        JOIN public.chat_round_thread_members tm ON tm.thread_id = t.id WHERE tm.profile_id = p_uid
      UNION
      SELECT s.round_id, s.table_no FROM public.event_round_seats s
        JOIN public.event_room_members rm ON rm.id = s.room_member_id WHERE rm.profile_id = p_uid
    ) k ORDER BY k.round_id, k.table_no
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('p1592:thread:' || v_key.round_id::text || ':' || v_key.table_no::text, 0));
  END LOOP;
  SELECT COALESCE(array_agg(x.id ORDER BY x.round_id, x.table_no), '{}') INTO v_threads FROM (
    SELECT t.id, t.round_id, t.table_no FROM public.chat_round_threads t
      JOIN public.chat_round_thread_members tm ON tm.thread_id = t.id WHERE tm.profile_id = p_uid
    UNION
    SELECT t.id, t.round_id, t.table_no FROM public.chat_round_threads t
      JOIN public.event_round_seats s ON s.round_id = t.round_id AND s.table_no = t.table_no
      JOIN public.event_room_members rm ON rm.id = s.room_member_id WHERE rm.profile_id = p_uid
  ) x;

  -- ORDER MATTERS (race with forward_chat_message / clarify_chat_message). Those lock their source
  -- row FOR SHARE, so step 2's UPDATE of the erased user's own rows WAITS for any in-flight copy of
  -- them to commit. Under READ COMMITTED every statement takes a fresh snapshot, so the scrub in
  -- step 3 (a later statement) then SEES a copy that committed while step 2 waited and scrubs it.
  -- Scrubbing first would miss it. A copy that starts after step 2 commits finds the source deleted
  -- and is refused. Step 3 runs twice for the copy-of-a-copy case (a forward of a forward that
  -- committed while step 3's first pass waited).

  -- 1. their mirror and everything copied into it
  DELETE FROM public.chat_conversations c WHERE c.kind = 'mirror' AND c.owner_id = p_uid;
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_mirrors_deleted', n);

  -- 2. their messages in shared conversations
  UPDATE public.chat_messages m
     SET body = NULL, deleted_at = COALESCE(m.deleted_at, now()),
         attachment_kind = NULL, attachment_id = NULL,
         forward_snapshot = NULL, forward_author_id = NULL,
         author_id = NULL
   WHERE m.author_id = p_uid;
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_messages_erased', n);

  -- 3. copies made by OTHER people that carry their words. Erase means erase; D5 snapshot survival
  -- applies to ordinary deletes, not account erasure: the author becomes 'Deleted user', the body is
  -- removed (also from copied thread entries), the attachment and the back-reference are cleared.
  FOR pass IN 1..2 LOOP
    UPDATE public.chat_messages m
       SET forward_snapshot = jsonb_set(jsonb_set(m.forward_snapshot, '{author_name}', to_jsonb('Deleted user'::text)),
                                        '{body}', 'null'::jsonb),
           attachment_kind = NULL, attachment_id = NULL,
           forward_author_id = NULL
     WHERE m.forward_author_id = p_uid AND m.forward_snapshot IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_forwards_anonymised_' || pass, n);

    UPDATE public.chat_messages m
       SET forward_snapshot = jsonb_set(m.forward_snapshot, '{thread}', (
             SELECT COALESCE(jsonb_agg(
                      CASE WHEN t.e ->> 'author_ref' = v_ref
                           THEN (t.e - 'author_ref') || jsonb_build_object('author_name', 'Deleted user', 'body', NULL::text)
                           ELSE t.e END
                      ORDER BY t.ord), '[]'::jsonb)
               FROM jsonb_array_elements(m.forward_snapshot -> 'thread') WITH ORDINALITY AS t(e, ord)))
     WHERE m.forward_snapshot IS NOT NULL
       AND jsonb_path_exists(m.forward_snapshot, '$.thread[*] ? (@.author_ref == $ref)',
                             jsonb_build_object('ref', v_ref));
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_threads_anonymised_' || pass, n);

    -- a clarify made in a 1:1 with them carries their name as the chat title
    UPDATE public.chat_messages m
       SET forward_snapshot = jsonb_set(m.forward_snapshot - 'conversation_title_ref', '{conversation_title}',
                                        to_jsonb('Deleted user'::text))
     WHERE m.forward_snapshot ->> 'conversation_title_ref' = v_ref;
  END LOOP;

  -- 4. read state and blocks
  DELETE FROM public.chat_member_state s WHERE s.profile_id = p_uid;
  DELETE FROM public.chat_blocks b WHERE b.blocker_id = p_uid OR b.blocked_id = p_uid;

  -- 5. conversations that would be left with nobody
  DELETE FROM public.chat_conversations c
   WHERE c.kind = 'dm'
     AND ((c.dm_user_a = p_uid AND c.dm_user_b IS NULL) OR (c.dm_user_b = p_uid AND c.dm_user_a IS NULL));
  UPDATE public.chat_conversations c SET created_by = NULL WHERE c.created_by = p_uid;

  -- 6. (P1520) AI work derived from their words. The exclusive lock waits for every job still reading its
  -- context (_mirror_begin_job holds it shared) and keeps new ones out until this commits, so no job can
  -- record refs this step does not see. Jobs first: a completion that commits while this waits leaves a
  -- reply the next statement then scrubs.
  PERFORM pg_advisory_xact_lock(hashtext('p1520_mirror_context'));
  -- the draft rows the engine would lock, in id order, before any reply message or run row is touched (the owner locks are
  -- already held, see the top of this function)
  PERFORM 1 FROM public.canvas_drafts d
   WHERE d.tension_refs @> ARRAY[v_ref]
      OR d.id IN (SELECT r.draft_id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref])
   ORDER BY d.id FOR UPDATE;
  UPDATE public.mirror_jobs j
     SET state = 'cancelled', error_code = 'erased', finished_at = now()
   WHERE j.state IN ('queued', 'running') AND j.derived_refs @> ARRAY[v_ref];
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('mirror_jobs_cancelled', n);
  UPDATE public.chat_messages m
     SET body = NULL, deleted_at = COALESCE(m.deleted_at, now()), derived_refs = NULL
   WHERE m.kind = 'agent' AND m.derived_refs @> ARRAY[v_ref];
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('mirror_replies_erased', n);

  -- 7. (P1592) round-thread titles carry first names. The threads were collected and locked in step 0. Drop
  -- this person from each member list and rebuild the title through the same function the poster uses
  -- ("Round {n}" if nobody named remains). edited_at is never touched. Copies of a root (forward / clarify)
  -- carry "Round {n}" only, so there is nothing to scrub in them.
  FOR v_th IN SELECT t.* FROM public.chat_round_threads t WHERE t.id = ANY (v_threads) ORDER BY t.round_id, t.table_no LOOP
    DELETE FROM public.chat_round_thread_members tm WHERE tm.thread_id = v_th.id AND tm.profile_id = p_uid;
    PERFORM public._transcribe_retitle_thread(v_th.id);
  END LOOP;
  v_out := v_out || jsonb_build_object('chat_round_threads_retitled', COALESCE(array_length(v_threads, 1), 0));

  -- 8. (P1536) canvas draft runs that read their words. Same lock as step 6 (still held), so no run can record refs this
  -- step does not see. A cancelled run's completion writes and posts nothing. The tensions and decided notes of a
  -- draft are model output that can paraphrase what its runs read, and they are fed to its next run: cleared.
  -- a cancelled run changes what the owner sees (the spot stops saying "Updating..."), so the draft's revision moves, once
  -- per draft that had a v6 run cancelled; the draft rows are already locked above
  UPDATE public.canvas_drafts d SET revision = d.revision + 1
   WHERE d.id IN (SELECT r.draft_id FROM public.canvas_draft_runs r
                   WHERE r.state IN ('queued', 'running') AND r.derived_refs @> ARRAY[v_ref]
                     AND r.kind IN ('message', 'focus', 'fork_first'));
  UPDATE public.canvas_draft_runs r
     SET state = 'cancelled', error_code = 'erased', finished_at = now()
   WHERE r.state IN ('queued', 'running') AND r.derived_refs @> ARRAY[v_ref];
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('canvas_draft_runs_cancelled', n);
  UPDATE public.canvas_drafts d
     SET tensions = '[]'::jsonb, decided = '[]'::jsonb, tension_refs = '{}'
   WHERE d.tension_refs @> ARRAY[v_ref]
      OR EXISTS (SELECT 1 FROM public.canvas_draft_runs r WHERE r.draft_id = d.id AND r.derived_refs @> ARRAY[v_ref]);
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('canvas_drafts_scrubbed', n);

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.erase_chat_data_for(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.erase_my_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_name          text;
  v_email         text;
  v_slug          text;
  v_tomb          constant text := 'Deleted user';
  v_tomb_email    constant text := 'deleted-user@invalid';
  v_sessions      uuid[] := '{}';
  v_same_name     uuid[] := '{}';
  v_counterparts  uuid[];
  v_their_stories uuid[];
  v_out           jsonb := '{}'::jsonb;
  n               integer;
  s               record;
  v_my_name       text;
  v_other_name    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'erase_my_account: not authenticated' USING ERRCODE = '42501';
  END IF;

  -- (P1536 + P1592 merged) The erasure locks come BEFORE the first mutation, in the order erase_chat_data_for takes them: the
  -- global one-erasure-at-a-time lock, the erasing marker, then the draft engine's owner locks. Without them this function updates the person's rows first and a draft-engine
  -- call that holds its owner lock and waits on those rows deadlocks with the later owner-lock wait. They are re-entrant, so
  -- erase_chat_data_for taking them again below is harmless.
  PERFORM pg_advisory_xact_lock(hashtextextended('p1536:erasure', 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('p1592:erasing:' || v_uid::text, 0));
  PERFORM public._erase_lock_canvas_owners(v_uid);

  SELECT p.name, p.email, p.slug INTO v_name, v_email, v_slug FROM public.profiles p WHERE p.id = v_uid;

  IF v_name IS NOT NULL THEN

    -- ---- Lock my sessions first: in-flight live writers queue behind these row
    -- locks and re-evaluate their predicates after this commits (§ 4 of the round-1 header).
    PERFORM 1 FROM public.clarity_sessions
     WHERE creator_profile_id = v_uid OR joiner_profile_id = v_uid OR target_listener_id = v_uid
       FOR UPDATE;
    SELECT COALESCE(array_agg(id), '{}') INTO v_sessions
      FROM public.clarity_sessions
     WHERE creator_profile_id = v_uid OR joiner_profile_id = v_uid OR target_listener_id = v_uid;

    -- ---- Agreements (RESTRICT both sides) --------------------------------------
    UPDATE public.clarity_agreements
       SET status               = 'terminated',
           terminated_at        = COALESCE(terminated_at, now()),
           terminated_by        = NULL,
           partner_profile_id   = NULL,
           partner_email        = v_tomb_email,
           partner_display_name = v_tomb
     WHERE partner_profile_id = v_uid
        OR (partner_profile_id IS NULL AND lower(partner_email) = lower(v_email));
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('agreements_anonymised', n);

    DELETE FROM public.clarity_agreements WHERE creator_profile_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('agreements_deleted', n);

    -- ---- Story verifications (NO ACTION, NOT NULL both sides) --------------------
    SELECT array_agg(DISTINCT x) INTO v_counterparts
      FROM (SELECT speaker_id  AS x FROM public.story_verifications WHERE listener_id = v_uid
            UNION
            SELECT listener_id AS x FROM public.story_verifications WHERE speaker_id  = v_uid) q
     WHERE x <> v_uid;

    SELECT array_agg(DISTINCT sv.story_id) INTO v_their_stories
      FROM public.story_verifications sv
      JOIN public.stories st ON st.id = sv.story_id
     WHERE (sv.speaker_id = v_uid OR sv.listener_id = v_uid)
       AND st.author_id <> v_uid;

    DELETE FROM public.story_verifications WHERE speaker_id = v_uid OR listener_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('verifications_deleted', n);

    UPDATE public.profiles p
       SET ears_count = (SELECT count(DISTINCT sv.speaker_id) FROM public.story_verifications sv
                          WHERE sv.listener_id = p.id AND sv.accuracy_achieved),
           verification_session_count =
             (SELECT count(*) FROM public.story_verifications sv WHERE sv.listener_id = p.id)
           + (SELECT count(*) FROM public.story_verifications sv
               WHERE sv.speaker_id = p.id AND sv.speaker_id <> sv.listener_id)
     WHERE p.id = ANY(COALESCE(v_counterparts, '{}'::uuid[]));

    UPDATE public.stories st
       SET understood_count = (SELECT count(DISTINCT sv.listener_id) FROM public.story_verifications sv
                                WHERE sv.story_id = st.id AND sv.accuracy_achieved)
     WHERE st.id = ANY(COALESCE(v_their_stories, '{}'::uuid[]));

    -- ---- Letters I sent, docs I own (NO ACTION, NOT NULL) ------------------------
    UPDATE public.clarity_sessions SET source_letter_id = NULL
     WHERE source_letter_id IN (SELECT id FROM public.clarity_letters WHERE sender_id = v_uid);
    DELETE FROM public.story_explain_backs WHERE recorder_id = v_uid;
    DELETE FROM public.clarity_letters WHERE sender_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('letters_deleted', n);
    DELETE FROM public.clarity_docs WHERE owner_id = v_uid;

    -- ---- Letters delivered TO me by others --------------------------------------
    DELETE FROM public.letter_point_responses
     WHERE delivery_id IN (SELECT id FROM public.letter_deliveries WHERE receiver_profile_id = v_uid);
    UPDATE public.letter_deliveries
       SET receiver_profile_id = NULL, receiver_email = NULL, receiver_name = v_tomb
     WHERE receiver_profile_id = v_uid
        OR (receiver_email IS NOT NULL AND lower(receiver_email) = lower(v_email));
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('deliveries_anonymised', n);

    -- ---- Live sessions ------------------------------------------------------------
    -- A session nobody else ever joined is mine alone: delete it outright.
    DELETE FROM public.clarity_sessions
     WHERE id = ANY(v_sessions) AND creator_profile_id = v_uid
       AND joiner_profile_id IS NULL AND joiner_name IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('solo_sessions_deleted', n);

    -- Transcripts hold my verbatim speech — erased (spec [FOUNDER DECISION]).
    DELETE FROM public.session_transcripts WHERE session_id = ANY(v_sessions);
    DELETE FROM public.transcription_jobs  WHERE session_id = ANY(v_sessions);

    -- Per shared session: name-only tables use the SESSION-TIME name and only when the
    -- counterparty's name differs; live_state is scrubbed by key.
    FOR s IN
      SELECT id, code, creator_profile_id, joiner_profile_id, creator_name, joiner_name, live_state
        FROM public.clarity_sessions
       WHERE id = ANY(v_sessions)
    LOOP
      IF s.creator_profile_id = v_uid THEN
        v_my_name := s.creator_name;  v_other_name := s.joiner_name;
      ELSIF s.joiner_profile_id = v_uid THEN
        v_my_name := s.joiner_name;   v_other_name := s.creator_name;
      ELSE
        v_my_name := NULL;            v_other_name := NULL;   -- target_listener only: no name on the row
      END IF;

      IF v_my_name IS NOT NULL AND v_my_name IS NOT DISTINCT FROM v_other_name THEN
        v_same_name := v_same_name || s.id;
      ELSIF v_my_name IS NOT NULL THEN
        -- Rows that are MINE (author/actor) go; my name on the counterparty's rows is tombstoned.
        DELETE FROM public.clarity_verifications v
         USING public.clarity_chat_messages m
         WHERE v.message_id = m.id AND m.session_id = s.id AND v.verifier_name = v_my_name;
        DELETE FROM public.clarity_chat_messages WHERE session_id = s.id AND author_name = v_my_name;
        DELETE FROM public.clarity_ideas         WHERE session_id = s.id AND author_name = v_my_name;
        DELETE FROM public.clarity_live_turns    WHERE session_id = s.id AND actor_name  = v_my_name;
        UPDATE public.clarity_live_turns
           SET speaker_name  = CASE WHEN speaker_name  = v_my_name THEN v_tomb ELSE speaker_name  END,
               listener_name = CASE WHEN listener_name = v_my_name THEN v_tomb ELSE listener_name END
         WHERE session_id = s.id AND (speaker_name = v_my_name OR listener_name = v_my_name);
        UPDATE public.clarity_demo_rounds
           SET speaker_name  = CASE WHEN speaker_name  = v_my_name THEN v_tomb ELSE speaker_name  END,
               listener_name = CASE WHEN listener_name = v_my_name THEN v_tomb ELSE listener_name END
         WHERE session_id = s.id AND (speaker_name = v_my_name OR listener_name = v_my_name);
        DELETE FROM public.ml_training_sessions WHERE session_code = s.code AND user_name = v_my_name;
      END IF;

      UPDATE public.clarity_sessions
         SET live_state = public._p520_scrub_live_state(live_state, COALESCE(v_my_name, v_name), v_slug, v_tomb)
       WHERE id = s.id AND live_state IS NOT NULL;
    END LOOP;

    -- Identity columns: matched on the ID, never the name. Shared sessions are closed.
    UPDATE public.clarity_sessions
       SET creator_profile_id = CASE WHEN creator_profile_id = v_uid THEN NULL   ELSE creator_profile_id END,
           creator_name       = CASE WHEN creator_profile_id = v_uid THEN v_tomb ELSE creator_name       END,
           joiner_profile_id  = CASE WHEN joiner_profile_id  = v_uid THEN NULL   ELSE joiner_profile_id  END,
           joiner_name        = CASE WHEN joiner_profile_id  = v_uid THEN v_tomb ELSE joiner_name        END,
           target_listener_id = CASE WHEN target_listener_id = v_uid THEN NULL   ELSE target_listener_id END,
           status             = 'cancelled'
     WHERE id = ANY(v_sessions);
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('sessions_anonymised', n);

    UPDATE public.clarity_sessions SET source_story_id = NULL
     WHERE source_story_id IN (SELECT id FROM public.stories WHERE author_id = v_uid);

    -- ---- Positions, then their history (trigger order) ------------------------------
    DELETE FROM public.point_positions WHERE user_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('positions_deleted', n);
    DELETE FROM public.point_position_history WHERE user_id = v_uid;
    DELETE FROM public.story_point_history    WHERE user_id = v_uid;

    -- ---- My content ---------------------------------------------------------------------
    DELETE FROM public.stories WHERE author_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('stories_deleted', n);

    -- ---- Community data I created: orphan, never delete ---------------------------------
    UPDATE public.points SET first_validator_id = NULL WHERE first_validator_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('points_orphaned', n);
    UPDATE public.events SET host_id = NULL WHERE host_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('events_orphaned', n);

    -- ---- Endorsements I gave (matched on the id column) -----------------------------------
    UPDATE public.witnesses
       SET witness_profile_id = NULL, witness_name = v_tomb, witness_linkedin_url = NULL
     WHERE witness_profile_id = v_uid;

    -- ---- Clarity Chat (P1512): messages, mirror, read state, blocks ------------------------
    -- (P1592) MOVED ABOVE the room-member tombstone below, no other change to this function. The round-thread
    -- part of erase_chat_data_for finds the person's table seats through event_room_members.profile_id, which
    -- the tombstone clears; run after it, the seat lookup matched nothing.
    PERFORM public.erase_chat_data_for(v_uid);

    -- ---- Logs / room memberships that outlive me -------------------------------------------
    UPDATE public.email_send_log SET profile_id = NULL WHERE profile_id = v_uid;
    UPDATE public.event_room_members SET profile_id = NULL, display_name = v_tomb WHERE profile_id = v_uid;

    -- ---- PII tables with no FK at all ---------------------------------------------------------
    DELETE FROM public.terms_acceptances WHERE user_id = v_uid;
    DELETE FROM public.session_consents  WHERE user_id = v_uid;
  END IF;

  -- ---- Audit row, then the identity itself -------------------------------------------------
  INSERT INTO public.erased_subjects (user_id, same_name_sessions)
  VALUES (v_uid, v_same_name)
  ON CONFLICT (user_id) DO UPDATE SET erased_at = now(), same_name_sessions = EXCLUDED.same_name_sessions;

  -- The two GoTrue tables that do NOT cascade from auth.users (header § 8).
  -- refresh_tokens.user_id is varchar and carries no FK; flow_state.user_id carries none either.
  DELETE FROM auth.refresh_tokens WHERE user_id = v_uid::text;
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('auth_refresh_tokens_deleted', n);
  DELETE FROM auth.flow_state WHERE user_id = v_uid;
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('auth_flow_state_deleted', n);

  DELETE FROM auth.users WHERE id = v_uid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'erase_my_account: auth user % not found', v_uid USING ERRCODE = 'P0002';
  END IF;

  RETURN v_out || jsonb_build_object('auth_user_deleted', true,
                                     'same_name_sessions', to_jsonb(v_same_name));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.erase_my_account() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.erase_my_account() TO authenticated;

CREATE OR REPLACE FUNCTION public.forward_chat_message(
  p_source              uuid,
  p_target_conversation uuid,
  p_note                text DEFAULT NULL,
  p_client_id           uuid DEFAULT NULL
)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_src       public.chat_messages;
  v_author    text;
  v_note      text;
  v_snapshot  jsonb;
  v_orig_id   uuid;
  v_since     timestamptz;
  v_row       public.chat_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM public._chat_assert_can_post(p_target_conversation, v_uid);
  v_since := public._chat_access_since(p_target_conversation, v_uid);

  -- Idempotent retry (see send_chat_message): same author + client id returns the earlier forward.
  -- This runs BEFORE the source checks on purpose: a retry whose source was deleted (or erased) in
  -- the meantime must hand back the forward that was already stored, not "message not available".
  -- Permission to post in the target was just checked, and the stored row must still be visible.
  IF p_client_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = v_uid AND m.client_id = p_client_id;
    IF FOUND THEN
      IF v_row.conversation_id <> p_target_conversation THEN
        RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
      END IF;
      IF v_row.created_at < v_since THEN
        RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
      END IF;
      RETURN v_row;
    END IF;
  END IF;

  -- The forwarder must be able to READ the source right now. FOR SHARE takes a row lock that
  -- conflicts with erase_chat_data_for's UPDATE of the same row: an in-flight erase finishes first
  -- (and the deleted_at test below then refuses), or this transaction commits first and the erase
  -- that was waiting scrubs the copy we are about to make.
  SELECT m.* INTO v_src FROM public.chat_messages m
   WHERE m.id = p_source
     AND m.created_at >= COALESCE(public._chat_access_since(m.conversation_id, v_uid), 'infinity'::timestamptz)
     FOR SHARE;
  IF NOT FOUND OR v_src.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;

  -- P1536: a canvas version is attached only in its owner's own mirror; a forward would copy it into a chat other
  -- people read (the card would say "not available", and the id would still travel). Same error as send_chat_message.
  IF v_src.attachment_kind = 'canvas_version' THEN
    RAISE EXCEPTION 'chat: attachment not available' USING ERRCODE = '22023';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF char_length(v_note) > 4000 THEN
    RAISE EXCEPTION 'chat: message too long' USING ERRCODE = '22023';
  END IF;

  IF v_src.kind = 'message' THEN
    SELECT COALESCE(p.name, 'Deleted user') INTO v_author
      FROM (SELECT 1) one LEFT JOIN public.profiles p ON p.id = v_src.author_id;
    -- D5: a forward reveals nothing about the source chat. The snapshot is built from an explicit
    -- allowlist (author_name, body, created_at, is_transcription, system_kind), never by copying whatever a source snapshot holds.
    -- P1592: plus the two marks the reader needs to render the copy as it was (a transcription keeps its
    -- label; a system post keeps showing its title alone, never "Deleted user"). A copy of a round-thread
    -- root carries "Round {n}" WITHOUT the names: erasure cannot find a name inside a copied title.
    v_snapshot := jsonb_build_object(
      'author_name', v_author,
      'body', CASE WHEN v_src.system_kind = 'round_thread' THEN public._transcribe_bare_root_title(v_src.id) ELSE v_src.body END,
      'created_at', v_src.created_at,
      'is_transcription', v_src.is_transcription,
      'system_kind', v_src.system_kind);
    v_orig_id := v_src.author_id;
  ELSE
    -- forwarding a forward / clarify keeps pointing at the original author; the source chat's
    -- title, kind, refs and any thread are NOT carried (allowlist again)
    v_snapshot := public._chat_forward_snapshot(v_src.forward_snapshot);
    v_orig_id := v_src.forward_author_id;
  END IF;

  INSERT INTO public.chat_messages
    (conversation_id, author_id, body, kind, forward_snapshot, forward_author_id,
     forwarded_from_message_id, attachment_kind, attachment_id, client_id, created_at)
  VALUES
    (p_target_conversation, v_uid, v_note, 'forward', v_snapshot, v_orig_id,
     v_src.id, v_src.attachment_kind, v_src.attachment_id, p_client_id, clock_timestamp())
  ON CONFLICT (author_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = v_uid AND m.client_id = p_client_id;
    IF v_row.conversation_id <> p_target_conversation THEN
      RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
    END IF;
    IF v_row.created_at < v_since THEN
      RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
    END IF;
    RETURN v_row;
  END IF;

  UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = p_target_conversation;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.forward_chat_message(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.forward_chat_message(uuid, uuid, text, uuid) TO authenticated;

COMMIT;
