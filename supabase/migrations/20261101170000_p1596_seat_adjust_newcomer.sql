-- P1596: someone newly seated in a round's first 60 s also trims that table's window.
-- client-safe: trigger function only.
-- diffed against: _transcribe_log_seat_change 20261101160000_p1596_seat_adjust_window.sql (one condition)

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
    IF v_prev IS DISTINCT FROM v_cur THEN
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

