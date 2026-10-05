-- Migration: P1337 — a table's topic can be marked only while its round is running
-- Created: 2026-10-05
-- Spec: features/p1337_event_journey_on_screen_steps_rotation_and_ending.md §6 (founder walkthrough 6, item 7)
-- Guaranteed by: e2e/integration/p1337-event-rounds-db.spec.ts ("walkthrough 6")
--
-- WHY (Codex review of walkthrough 6): the compare page stops offering topic marks for a table you
-- no longer sit at, but the RPC still accepted them — anyone who sat at a round-1 table could
-- overwrite that table's recorded topic after round 2 started. The page can only hide; the server
-- must refuse.
--
-- WHAT. Same signature and grants. A round that has ended (ended_at set — Next round closes the
-- previous one, End closes the last) takes no topic mark.
-- diffed against: 20261002183700_p1337_event_rounds.sql (set_round_topic)
-- client-safe: same signature; only a mark on a finished round is newly refused.

CREATE OR REPLACE FUNCTION public.set_round_topic(p_round_id uuid, p_table_no int, p_point_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member uuid;
BEGIN
  SELECT s.room_member_id INTO v_member
    FROM public.event_round_seats s
    JOIN public.event_room_members m ON m.id = s.room_member_id
   WHERE s.round_id = p_round_id
     AND s.table_no = p_table_no
     AND m.profile_id = (SELECT auth.uid());
  IF v_member IS NULL THEN
    RAISE EXCEPTION 'only someone at this table can mark its statement' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.event_rounds r WHERE r.id = p_round_id AND r.ended_at IS NOT NULL) THEN
    RAISE EXCEPTION 'this round is over' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.event_round_tables AS t (round_id, table_no, topic_point_id, topic_set_by)
  VALUES (p_round_id, p_table_no, p_point_id, v_member)
  ON CONFLICT (round_id, table_no) DO UPDATE
    SET topic_point_id = EXCLUDED.topic_point_id,
        topic_set_by = EXCLUDED.topic_set_by,
        topic_set_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_round_topic(uuid, int, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_round_topic(uuid, int, uuid) TO authenticated;
