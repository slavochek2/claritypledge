-- Migration: P1529 -- the Sales Mastermind's round threads are named "Discussion round N · ..." (founder, 2026-11-13)
-- Created: 2026-11-14
-- Spec: features/p1529_canvas_event_host_coordination.md (G2: "Round thread titles ... say 'Discussion round N'")
-- Guaranteed by: e2e/integration/p1529-db-schema.spec.ts (the round-1 thread title after its words are posted)
--
-- client-safe: no signature, grant or result shape changes; only the text of a mastermind round thread's title. Clarity Night and
--   Social Hike titles come from _transcribe_round_title, which this migration does not touch.
-- diffed against: 20261105220000_p1529_next_version_and_titles.sql (_p1529_mastermind_title).
-- diff: one line, the round label 'Round ' becomes 'Discussion round '. 'Demo' (a showcase round), the owner/partner wording, the
--   STABLE SECURITY DEFINER attributes, search_path and the REVOKE are unchanged.
-- Existing mastermind threads are retitled once through _transcribe_retitle_thread (the one writer of a thread title, which also keeps
--   the "(some of this table's audio is missing)" suffix). It writes only a root whose body differs. It recomputes the WHOLE title, so a
--   mastermind thread whose title had drifted for another reason (a member's display name changed since) is brought up to date too;
--   that is the title the next member join would have written anyway.
-- Applied to self-hosted TEST on 2026-11-14 in a first version whose loop took no thread lock (external review found it); this file
--   adds the lock, which changes no result, only who waits. TEST's retitle had already run; prod runs this version.

BEGIN;

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
  v_label := CASE WHEN v_showcase THEN 'Demo' ELSE 'Discussion round ' || v_counted END;
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

-- Each thread's lock first, as _transcribe_retitle_thread's contract requires (20261029180000: "The caller holds the thread lock"),
-- in erasure's order (round_id, table_no), so a concurrent erasure cannot have an erased name written back, and the two cannot deadlock.
DO $$
DECLARE
  v_th record;
BEGIN
  FOR v_th IN
    SELECT t.id, t.round_id, t.table_no FROM public.chat_round_threads t
     WHERE public._event_flow(t.event_id) = 'sales-mastermind'
     ORDER BY t.round_id, t.table_no
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('p1592:thread:' || v_th.round_id::text || ':' || v_th.table_no::text, 0));
    PERFORM public._transcribe_retitle_thread(v_th.id);
  END LOOP;
END
$$;

COMMIT;
