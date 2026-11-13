-- client-safe: no client RPC changes name, signature, return type or grant. The three replaced functions are internal (no client grant). point_chat_shares.shared_by becomes nullable (ON DELETE SET NULL), so list_chat_points may now return shared_by = null for a point whose publisher erased their account; no other client-visible behaviour changes
-- Migration: P1631 account erasure keeps a private point other people hold a position on (spec Open Question 9, decided by the founder)
-- Created: 2026-11-13
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md
-- Guaranteed by: src/tests/p1631-erase-keeps-held-points-migration.test.ts (source contract), src/tests/integration/p1631-erase-keeps-held-points.test.ts
--
-- THE RULE. When person E erases their account, E is deleted (profile, E's own positions and position history, E's words as erasure already clears them). A private point on which at least one person
-- OTHER THAN E holds a position is KEPT, with nothing of E left on it (no owner link, no ref to E, no publisher). A private point nobody but E holds a position on is removed, exactly as before.
-- If E is only CITED (their words were read by someone else's draft), the point is its author's sentence and stays whatever the positions. PUBLIC points: NOT built here, see the report (a letter response
-- row references points(id) with no cascade; deleting an authored public point would abort the erasure). Every position test below is `user_id IS DISTINCT FROM E`, so it does not depend on whether E's own positions were deleted first
-- (erase_my_account deletes them before it calls erase_chat_data_for; a direct call to erase_chat_data_for does not).
--
-- Earlier P1631 migrations are applied and are not edited. Each replaced function is its newest body copied byte for byte, then marked lines (`-- P1631 erase keeps held points`).
-- Only erase_chat_data_for replaces two existing lines (the deleted_at and attachment lines of step 2, each replaced by one marked line); the unit test removes exactly those old lines and the marked ones.
--
-- diffed against:
--   _clarify_erase_person(uuid)       20261110180000_p1631_review_fixes_2.sql (its newest definition)
--   _point_chat_erase_author(uuid)    20261112150000_p1631_publish_to_chat.sql (its only definition)
--   erase_chat_data_for(uuid)         20261112150000_p1631_publish_to_chat.sql (its newest definition)
--
-- 1. point_chat_shares.shared_by is ON DELETE SET NULL (it was CASCADE, NOT NULL). With CASCADE the profile delete at the end of erase_my_account would remove the share row of a kept point and the
--    card would stop being readable. The constraint replaced is the inline one of 20261112150000, named by Postgres point_chat_shares_shared_by_fkey.
-- 2. (a, a CITED person is erased) _clarify_erase_person: a Clarify draft (another person's) that read E's words is never failed and its point is never deleted, because the point is its author's
--    sentence. Only E's ref leaves derived_refs; the citations of E's rows leave cited / sent_ids (erase_chat_data_for, below, because E's rows lose author_id in its step 2 and are no longer
--    identifiable afterwards). The marked statement runs first and removes the ref from every draft that is NOT queued or running, so the unchanged statements below see only drafts whose run is in
--    flight: those are still failed and their reservation settled as before (the run's late completion would otherwise write E's words back). Edge: an in-flight draft that already carries a point
--    (a refine) still loses that point, as before.
-- 3. _point_chat_erase_author: the share rows of kept points lose the publisher first (shared_by = null), so the unchanged delete (which finds points by shared_by) removes only the points nobody else holds.
-- 4. erase_chat_data_for: before step 2 (a) the ids of E's chat messages and transcribed lines are collected and removed from the cited / sent_ids of the drafts that read E (in-flight drafts excluded: they
--    are failed and cleared in step 6), and (b, the AUTHOR is erased) the E-authored card messages whose point another person holds a position on are collected; step 2 still clears their body and author (the author shows as a deleted user) but keeps
--    deleted_at and the point attachment on exactly those rows, which is what the reader's rule needs (_point_chat_readable_by_me / _my_chat_shared_point_ids: a live message whose attachment is the point).
--    Verified not to need shared_by: _point_chat_readable_by_me, _my_chat_shared_point_ids, _point_has_live_share, clarify_publish's 'already' check, list_chat_points (returns null), _clarify_begin
--    (`_chat_author_ref(null)` is null and is removed by its array_remove(..., NULL)).

BEGIN;

-- 1. the share row outlives its publisher ----------------------------------------------------------------------------------------------------

ALTER TABLE public.point_chat_shares DROP CONSTRAINT IF EXISTS point_chat_shares_shared_by_fkey;
ALTER TABLE public.point_chat_shares ALTER COLUMN shared_by DROP NOT NULL;
ALTER TABLE public.point_chat_shares ADD CONSTRAINT point_chat_shares_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. -------------------------------------------------------------------------------------------------------------------------------------------

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
  -- a draft that read the erased person's words keeps its state and point (the point is its author's sentence): only the ref leaves it, so the statements below see only drafts whose run is in flight -- P1631 erase keeps held points
  UPDATE public.clarify_drafts d SET derived_refs = array_remove(d.derived_refs, v_ref) -- P1631 erase keeps held points
   WHERE d.derived_refs @> ARRAY[v_ref] AND d.state NOT IN ('queued', 'running'); -- P1631 erase keeps held points
  SELECT COALESCE(array_agg(d.point_id), '{}') INTO v_points
    FROM public.clarify_drafts d WHERE d.derived_refs @> ARRAY[v_ref] AND d.point_id IS NOT NULL;
  -- a run in flight is dead: its reservation is charged in full (the model may have been called), as the sweep does; the run's late completion settles nothing twice -- P1631
  UPDATE public.mirror_ai_spend s SET actual_usd = s.reserved_usd, state = 'settled', settled_at = now() -- P1631
   WHERE s.state = 'reserved' AND s.id IN (SELECT d.spend_id FROM public.clarify_drafts d -- P1631
                                           WHERE d.derived_refs @> ARRAY[v_ref] AND d.state = 'running' AND d.spend_id IS NOT NULL); -- P1631
  UPDATE public.clarify_drafts d
     SET state = 'failed', error_code = 'erased', point_id = NULL, suggestions = NULL, cited = NULL,
         derived_refs = '{}', sent_ids = '{}', updated_at = now()
   WHERE d.derived_refs @> ARRAY[v_ref];
  DELETE FROM public.points p WHERE p.id = ANY (v_points) AND p.visibility = 'private'::public.content_visibility; -- P1631 r2: whoever holds a position on it, it is derived from the erased words; positions go with it
END;
$$;
REVOKE ALL ON FUNCTION public._clarify_erase_person(uuid) FROM PUBLIC, anon, authenticated;

-- 3. -------------------------------------------------------------------------------------------------------------------------------------------

-- Erasure of an author: the private points they published are deleted (first_validator_id is already nulled by erase_my_account, so the point cannot be found by owner).
-- The share rows go with the points (cascade). Called only from erase_chat_data_for. search_path is public, pg_temp: the triggers on points read `points` unqualified.
CREATE OR REPLACE FUNCTION public._point_chat_erase_author(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- a point another person holds a position on is kept: its share row loses the publisher, so the delete below does not find it -- P1631 erase keeps held points
  UPDATE public.point_chat_shares s SET shared_by = NULL -- P1631 erase keeps held points
   WHERE s.shared_by = p_uid -- P1631 erase keeps held points
     AND EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = s.point_id AND pp.user_id IS DISTINCT FROM p_uid); -- P1631 erase keeps held points
  DELETE FROM public.points p
   WHERE p.visibility = 'private'::public.content_visibility
     AND p.id IN (SELECT s.point_id FROM public.point_chat_shares s WHERE s.shared_by = p_uid);
END;
$$;
REVOKE ALL ON FUNCTION public._point_chat_erase_author(uuid) FROM PUBLIC, anon, authenticated;

-- 4. -------------------------------------------------------------------------------------------------------------------------------------------

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
  v_kept    uuid[]; -- P1631 erase keeps held points
  v_mine    text[]; -- P1631 erase keeps held points
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
  -- the citations of their rows leave the drafts that read them (they are unidentifiable once step 2 clears author_id); in-flight drafts are failed and cleared in step 6; the draft rows are locked in the order of the owner locks taken in step 0 -- P1631 erase keeps held points
  SELECT COALESCE(array_agg(x.id::text), '{}') INTO v_mine FROM ( -- P1631 erase keeps held points
    SELECT cm.id FROM public.chat_messages cm WHERE cm.author_id = p_uid -- P1631 erase keeps held points
    UNION ALL -- P1631 erase keeps held points
    SELECT tl.id FROM public.transcribe_messages tl JOIN public.transcribe_room_members trm ON trm.id = tl.member_id WHERE trm.profile_id = p_uid) x; -- P1631 erase keeps held points
  UPDATE public.clarify_drafts cd -- P1631 erase keeps held points
     SET sent_ids = ARRAY(SELECT s FROM unnest(cd.sent_ids) AS s WHERE s::text <> ALL (v_mine)), -- P1631 erase keeps held points
         cited = CASE WHEN cd.cited IS NULL THEN NULL ELSE jsonb_build_object( -- P1631 erase keeps held points
           'a', COALESCE((SELECT jsonb_agg(e) FROM jsonb_array_elements(COALESCE(cd.cited -> 'a', '[]'::jsonb)) AS e WHERE (e #>> '{}') <> ALL (v_mine)), '[]'::jsonb), -- P1631 erase keeps held points
           'b', COALESCE((SELECT jsonb_agg(e) FROM jsonb_array_elements(COALESCE(cd.cited -> 'b', '[]'::jsonb)) AS e WHERE (e #>> '{}') <> ALL (v_mine)), '[]'::jsonb)) END -- P1631 erase keeps held points
   WHERE cd.derived_refs @> ARRAY[v_ref] AND cd.state NOT IN ('queued', 'running'); -- P1631 erase keeps held points
  -- the cards of the points they published that another person holds a position on: kept live, so the chat still reads them -- P1631 erase keeps held points
  SELECT COALESCE(array_agg(s.message_id), '{}') INTO v_kept -- P1631 erase keeps held points
    FROM public.point_chat_shares s JOIN public.chat_messages km ON km.id = s.message_id -- P1631 erase keeps held points
   WHERE km.author_id = p_uid AND km.deleted_at IS NULL AND km.attachment_kind = 'point' AND km.attachment_id = s.point_id -- P1631 erase keeps held points
     AND EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = s.point_id AND pp.user_id IS DISTINCT FROM p_uid); -- P1631 erase keeps held points
  UPDATE public.chat_messages m
     SET body = NULL, deleted_at = CASE WHEN m.id = ANY (v_kept) THEN m.deleted_at ELSE COALESCE(m.deleted_at, now()) END, -- P1631 erase keeps held points
         attachment_kind = CASE WHEN m.id = ANY (v_kept) THEN m.attachment_kind END, attachment_id = CASE WHEN m.id = ANY (v_kept) THEN m.attachment_id END, -- P1631 erase keeps held points
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
  PERFORM public._point_chat_erase_author(p_uid);  -- P1631 publish: the private points they published go, with their share rows

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

COMMIT;
