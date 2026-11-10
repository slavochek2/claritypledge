-- client-safe: no client calls the new function (revoked from every client role) and erase_chat_data_for keeps its signature, return type, SECURITY DEFINER, search_path and grants; the only change to its body is one added call, marked `-- P1631`.
-- new function: _clarify_erase_person
-- Migration: P1631 step 1 follow-up — Clarify-draft cleanup on person erasure runs inside erase_chat_data_for, not as a trigger on chat_messages
-- Created: 2026-11-10
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md
-- Guaranteed by: src/tests/p1631-clarify-drafts-migration.test.ts (source contract), src/tests/integration/p1631-clarify-drafts.test.ts (behaviour on the test database)
--
-- Why: a trigger on chat_messages made every client call that writes chat_messages count as a writer of `points` for the P1364 cache-invalidation drift guard. The cleanup only matters when a person
-- is erased, which is erase_chat_data_for (step 2 nulls author_id), so it runs from there, once for the erased person.
--
-- diffed against:
--   erase_chat_data_for   20261103010000_p1536_server_review_fixes.sql (its newest definition): that body byte for byte, plus ONE call marked `-- P1631` after step 6's mirror-reply scrub.
--   The trigger chat_messages_clarify_on_erase and its function _clarify_on_message_erase (created by 20261110153000_p1631_clarify_drafts.sql on TEST before it was edited) are dropped.

DROP TRIGGER IF EXISTS chat_messages_clarify_on_erase ON public.chat_messages;
DROP FUNCTION IF EXISTS public._clarify_on_message_erase();

-- Erasure of a person: any draft whose model call read their words loses what it derived from them. A queued or running draft fails (`erased`); its point is deleted; suggestions and cited ids
-- are cleared. Called only from erase_chat_data_for step 6, after it took the p1520 context lock exclusively (as _clarify_begin holds it shared), so no draft can record refs this does not see.
-- search_path is public, pg_temp, not '': the triggers on points read `points` unqualified (see 20261110153000_p1631_clarify_drafts.sql).
CREATE OR REPLACE FUNCTION public._clarify_erase_person(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ref    text := public._chat_author_ref(p_uid);
  v_points uuid[];
BEGIN
  PERFORM 1 FROM public.clarify_drafts d WHERE d.derived_refs @> ARRAY[v_ref] ORDER BY d.id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT COALESCE(array_agg(d.point_id), '{}') INTO v_points
    FROM public.clarify_drafts d WHERE d.derived_refs @> ARRAY[v_ref] AND d.point_id IS NOT NULL;
  UPDATE public.clarify_drafts d
     SET state = 'failed', error_code = 'erased', point_id = NULL, suggestions = NULL, cited = NULL,
         derived_refs = '{}', sent_ids = '{}', updated_at = now()
   WHERE d.derived_refs @> ARRAY[v_ref];
  DELETE FROM public.points p WHERE p.id = ANY (v_points) AND p.visibility = 'private'::public.content_visibility;
END;
$$;
REVOKE ALL ON FUNCTION public._clarify_erase_person(uuid) FROM PUBLIC, anon, authenticated;

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
  -- P1631 Clarify drafts that read their words fail 'erased' and lose their private point. The p1520 lock above is held exclusively, so no _clarify_begin can record refs this does not see.
  PERFORM public._clarify_erase_person(p_uid);  -- P1631

  -- 7. (P1592) round-thread titles carry first names. The threads were collected and locked in step 0. Drop
  -- this person from each member list and rebuild the title through the same function the poster uses
  -- ("Round {n}" if nobody named remains). edited_at is never touched. Copies of a root (forward / clarify)
  -- carry "Round {n}" only, so there is nothing to scrub in them.
  FOR v_th IN SELECT t.* FROM public.chat_round_threads t WHERE t.id = ANY (v_threads) ORDER BY t.round_id, t.table_no LOOP
    DELETE FROM public.chat_round_thread_members tm WHERE tm.thread_id = v_th.id AND tm.profile_id = p_uid;
    PERFORM public._transcribe_retitle_thread(v_th.id);
  END LOOP;
  v_out := v_out || jsonb_build_object('chat_round_threads_retitled', COALESCE(array_length(v_threads, 1), 0));

  -- 7b. (P1536 server review, Opus 8) the offers a run made while it read their words. An offer's label and reason are model output of the same class as the tensions
  -- cleared in step 8: they can paraphrase what the run read, they are returned by the state read, and the label is fed to the next run and becomes a fork's focus. An open offer
  -- is deleted; an offer already focused, started or dismissed keeps its label (a canvas already carries it) and loses its reason. The draft rows are locked (step 6), and
  -- a draft whose offers change moves its revision so an open view refetches. A closed draft keeps its material until its own expiry: settlement is not run from here.
  -- It sits before step 8 so that step 8's statements stay one unbroken block, as the earlier migrations' tests pin them.
  UPDATE public.canvas_drafts d SET revision = d.revision + 1
   WHERE d.id IN (SELECT o.draft_id FROM public.canvas_draft_offers o
                   WHERE (o.state = 'offered' OR o.why IS NOT NULL)
                     AND o.created_run_id IN (SELECT r.id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref]));
  DELETE FROM public.canvas_draft_offers o
   WHERE o.state = 'offered'
     AND o.created_run_id IN (SELECT r.id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref]);
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('canvas_draft_offers_erased', n);
  UPDATE public.canvas_draft_offers o SET why = NULL
   WHERE o.why IS NOT NULL
     AND o.created_run_id IN (SELECT r.id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref]);
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('canvas_draft_offer_reasons_cleared', n);

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
