-- P1596 (review of 20261102180000): that migration rebuilt _transcribe_log_seat_change from 20261101160000 instead of the newer
-- 20261101170000, so a person seated after the first 5 s of a round no longer started that table's window. Restored here.
-- Also: seat state keeps following seats while every room is ended, so a later room compares against the real seat.
-- Created: 2026-11-02
-- Spec: features/p1596_event_transcripts_one_speaker_per_sentence.md
--
-- client-safe: trigger-internal (EXECUTE revoked from PUBLIC, anon and authenticated; checked at the end). No table or policy changes.
-- diffed against: _transcribe_log_seat_change 20261101170000_p1596_seat_adjust_newcomer.sql (same body; the change is skipped
--   as a move or adjustment while every room of the event is ended)

CREATE OR REPLACE FUNCTION public._transcribe_log_seat_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_round   uuid := COALESCE(NEW.round_id, OLD.round_id);
  v_member  uuid := COALESCE(NEW.room_member_id, OLD.room_member_id);
  v_started timestamptz;
  v_cur     integer;
  v_known   boolean;
  v_prev    integer;
BEGIN
  BEGIN
    SELECT er.started_at INTO v_started FROM public.event_rounds er WHERE er.id = v_round AND er.ended_at IS NULL;
    IF v_started IS NULL THEN
      RETURN NULL;                                   -- round closed or gone: nothing to record
    END IF;
    SELECT s.table_no INTO v_cur FROM public.event_round_seats s
     WHERE s.round_id = v_round AND s.room_member_id = v_member;     -- final, as of commit
    SELECT true, st.table_no INTO v_known, v_prev FROM public.transcribe_round_seat_state st
     WHERE st.round_id = v_round AND st.room_member_id = v_member;
    IF v_known IS NOT TRUE THEN
      v_prev := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.table_no END;
    END IF;
    -- with every room ended nobody is recording: tidying the list is no move, but the state still follows the seat
    IF v_prev IS DISTINCT FROM v_cur AND NOT public._transcribe_all_rooms_ended(
         (SELECT er.event_id FROM public.event_rounds er WHERE er.id = v_round)) THEN
      IF clock_timestamp() >= v_started + interval '60 seconds' THEN
        INSERT INTO public.transcribe_round_seat_moves (round_id, room_member_id, from_table, to_table)
        VALUES (v_round, v_member, v_prev, v_cur);
      -- 5 s: seats saved by host_start_round itself are the initial seating, not an adjustment; a newcomer later is one.
      ELSIF v_known IS TRUE OR clock_timestamp() >= v_started + interval '5 seconds' THEN
        INSERT INTO public.transcribe_round_seat_adjust (round_id, table_no, adjusted_at)
        SELECT v_round, t.n, clock_timestamp() FROM (VALUES (v_prev), (v_cur)) AS t(n) WHERE t.n IS NOT NULL
        ON CONFLICT (round_id, table_no) DO UPDATE SET adjusted_at = EXCLUDED.adjusted_at;
      END IF;
    END IF;
    INSERT INTO public.transcribe_round_seat_state (round_id, room_member_id, table_no)
    VALUES (v_round, v_member, v_cur)
    ON CONFLICT (round_id, room_member_id) DO UPDATE SET table_no = EXCLUDED.table_no;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_transcribe_log_seat_change: not logged (sqlstate %)', SQLSTATE;   -- never break the host's seating
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_log_seat_change() FROM PUBLIC, anon, authenticated;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public._transcribe_log_seat_change()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._transcribe_log_seat_change()', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1596: the seat log is client-reachable';
  END IF;
END
$check$;
