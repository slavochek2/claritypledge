-- P1596 (adversarial review of 20261102170000): since the room-end job leaves a still-open round's seated people out, the
-- round's own cut is now their only way to chat. Two ways that cut could lose them are closed here.
-- Created: 2026-11-02
-- Spec: features/p1596_event_transcripts_one_speaker_per_sentence.md
--
-- client-safe: all functions here are trigger or cron internals (EXECUTE revoked from PUBLIC, anon and authenticated;
--   checked at the end). No table or policy changes. The tick can set event_rounds.ended_at, the same write the host's
--   End does, and only on a round whose event has had no running room for 2 h.
--
-- diffed against:
--   _transcribe_log_seat_change      20261101160000_p1596_seat_adjust_window.sql (same body; one early return)
--   _transcribe_log_presence_change  20261101183700_p1596_final_fixes.sql (same body; one early return)
--   transcribe_round_clean_tick      20261101120000_p1596_clean_round_transcripts.sql (same body; closes abandoned rounds)
--
-- 1. The host never closes the round: nothing ever cut it, so the table's words were lost. The tick now closes it 2 h after
--    every room of the event ended, at the last room's end. A new room opened in that time keeps the round open.
-- 2. The host tidies the people list after the room ended: more than 60 s in, that logged a seat move, which makes the
--    table's job post nothing. With every room ended nobody is recording, so such a change is no longer a move.
-- LIMIT: a change made while another room of the event still runs is still a move. A host's End during the 2 h closes at
--    End, and the worker cleans up to the audio that exists.

CREATE OR REPLACE FUNCTION public._transcribe_all_rooms_ended(p_event uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.transcribe_rooms tr WHERE tr.event_id = p_event)
     AND NOT EXISTS (SELECT 1 FROM public.transcribe_rooms tr WHERE tr.event_id = p_event AND tr.ended_at IS NULL)
$$;
REVOKE ALL ON FUNCTION public._transcribe_all_rooms_ended(uuid) FROM PUBLIC, anon, authenticated;

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
    IF public._transcribe_all_rooms_ended((SELECT er.event_id FROM public.event_rounds er WHERE er.id = v_round)) THEN
      RETURN NULL;                                   -- nobody is recording: tidying the list is not a move at a table
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
      ELSIF v_known IS TRUE THEN
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

CREATE OR REPLACE FUNCTION public._transcribe_log_presence_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_round   public.event_rounds;
  v_was     boolean := false;
  v_now     boolean;
  v_prev    integer;
BEGIN
  BEGIN
    SELECT er.* INTO v_round FROM public.event_rounds er
     WHERE er.event_id = NEW.event_id AND er.ended_at IS NULL ORDER BY er.round_no DESC LIMIT 1;
    IF NOT FOUND THEN
      RETURN NULL;                                   -- no open round: nothing to record
    END IF;
    IF public._transcribe_all_rooms_ended(NEW.event_id) THEN
      RETURN NULL;                                   -- nobody is recording: tidying the list is not a move at a table
    END IF;
    v_now := NEW.left_at IS NOT NULL OR NEW.sits_out_round IS NOT DISTINCT FROM v_round.round_no;
    IF TG_OP = 'UPDATE' THEN
      v_was := OLD.left_at IS NOT NULL OR OLD.sits_out_round IS NOT DISTINCT FROM v_round.round_no;
    END IF;
    IF NOT v_now OR v_was THEN
      RETURN NULL;                                   -- only the change INTO "not here" counts
    END IF;
    SELECT st.table_no INTO v_prev FROM public.transcribe_round_seat_state st
     WHERE st.round_id = v_round.id AND st.room_member_id = NEW.room_member_id;
    IF NOT FOUND THEN
      SELECT s.table_no INTO v_prev FROM public.event_round_seats s
       WHERE s.round_id = v_round.id AND s.room_member_id = NEW.room_member_id;
    END IF;
    IF v_prev IS NULL THEN
      RETURN NULL;                                   -- they had no table in this round
    END IF;
    IF clock_timestamp() >= v_round.started_at + interval '60 seconds' THEN
      INSERT INTO public.transcribe_round_seat_moves (round_id, room_member_id, from_table, to_table)
      VALUES (v_round.id, NEW.room_member_id, v_prev, NULL);
    ELSIF clock_timestamp() >= v_round.started_at + interval '5 seconds' THEN
      INSERT INTO public.transcribe_round_seat_adjust (round_id, table_no, adjusted_at)
      VALUES (v_round.id, v_prev, clock_timestamp())
      ON CONFLICT (round_id, table_no) DO UPDATE SET adjusted_at = EXCLUDED.adjusted_at;
    END IF;
    INSERT INTO public.transcribe_round_seat_state (round_id, room_member_id, table_no)
    VALUES (v_round.id, NEW.room_member_id, NULL)
    ON CONFLICT (round_id, room_member_id) DO UPDATE SET table_no = NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_transcribe_log_presence_change: not logged (sqlstate %)', SQLSTATE;   -- never break the host's tidy-up
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.transcribe_round_clean_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public._transcribe_clean_enabled() THEN
    RETURN;
  END IF;
  -- A round left open after every room of its event ended 2 h ago is closed where the audio ended, so its table's words
  -- are cut (the room-end job left them to this round). The update fires the normal cut trigger.
  UPDATE public.event_rounds er
     SET ended_at = last_room.ended_at
    FROM (SELECT tr.event_id, max(tr.ended_at) AS ended_at
            FROM public.transcribe_rooms tr
           WHERE tr.event_id IS NOT NULL
           GROUP BY tr.event_id
          HAVING bool_and(tr.ended_at IS NOT NULL) AND max(tr.ended_at) < now() - interval '2 hours') last_room
   WHERE er.event_id = last_room.event_id AND er.ended_at IS NULL AND er.started_at < last_room.ended_at;
  FOR v_id IN
    SELECT j.id FROM public.transcribe_round_clean_jobs j
     WHERE j.status = 'pending' AND j.dispatched_at IS NULL AND j.not_before <= now()
     ORDER BY j.not_before LIMIT 50
  LOOP
    UPDATE public.transcribe_round_clean_jobs SET dispatched_at = now() WHERE id = v_id AND dispatched_at IS NULL;
    IF FOUND THEN
      PERFORM public._transcribe_round_clean_dispatch(v_id);
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public._transcribe_log_seat_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._transcribe_log_presence_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transcribe_round_clean_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transcribe_round_clean_tick() TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public._transcribe_all_rooms_ended(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._transcribe_all_rooms_ended(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.transcribe_round_clean_tick()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.transcribe_round_clean_tick()', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1596: an abandoned-round function is client-reachable';
  END IF;
END
$check$;
