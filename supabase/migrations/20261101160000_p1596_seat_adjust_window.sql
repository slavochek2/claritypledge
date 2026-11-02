-- P1596 seat adjust window: a seat change ignored in the first 60 s of a round (a "seating adjustment") still
-- means the moved person's audio before that moment belongs to the old table. Record when the last such
-- adjustment happened per round and table, and start the cut's job window for those tables there, so pre-move
-- audio never reaches the new table's thread.
-- Created: 2026-11-01
-- Spec: features/p1596_event_transcripts_one_speaker_per_sentence.md (Redesign, Build Plan)
--
-- client-safe: no client-callable function is created or changed. The new table is service-role only (RLS on, no
--   client grants); the two replaced functions are trigger-internal, EXECUTE revoked from PUBLIC, anon and
--   authenticated.
--
-- diffed against:
--   _transcribe_log_seat_change   20261101150000_p1596_seat_history.sql (same body; adds the adjustment upsert)
--   _transcribe_round_cut         20261101150000_p1596_seat_history.sql (same body; window_start joins the adjustments)
--
-- DECISIONS
--   * An adjustment is recorded only for a member the state table already knows (v_known): the initial seating at
--     host_start_round has no state yet and must not push every table's window forward.
--   * Both the table left and the table joined are marked (non-null ends only).
--   * window_start = GREATEST(round start, last adjustment), capped at the round end so the window never inverts.

CREATE TABLE IF NOT EXISTS public.transcribe_round_seat_adjust (
  round_id    uuid NOT NULL REFERENCES public.event_rounds(id) ON DELETE CASCADE,
  table_no    integer NOT NULL,
  adjusted_at timestamptz NOT NULL,
  PRIMARY KEY (round_id, table_no)
);
ALTER TABLE public.transcribe_round_seat_adjust ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.transcribe_round_seat_adjust FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.transcribe_round_seat_adjust TO service_role;

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
REVOKE ALL ON FUNCTION public._transcribe_log_seat_change() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._transcribe_round_cut()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public._transcribe_clean_enabled() THEN
    RETURN NEW;
  END IF;
  BEGIN
    WITH cs AS (SELECT * FROM public._transcribe_round_cut_seats(NEW.id)),
         info AS (SELECT * FROM public._transcribe_round_cut_table_info(NEW.id)),
         mv AS (SELECT m.from_table AS t FROM public.transcribe_round_seat_moves m WHERE m.round_id = NEW.id AND m.from_table IS NOT NULL
                UNION SELECT m.to_table FROM public.transcribe_round_seat_moves m WHERE m.round_id = NEW.id AND m.to_table IS NOT NULL),
         tb AS (SELECT cs.table_no FROM cs UNION SELECT mv.t FROM mv)
    INSERT INTO public.transcribe_round_clean_jobs
      (kind, event_id, round_id, table_no, seats, seated_count, roster, window_start, window_end, not_before,
       status, error, completed_at)
    SELECT 'round', NEW.event_id, NEW.id, tb.table_no,
           COALESCE((SELECT jsonb_agg(jsonb_build_object('member_id', c.member_id, 'room_id', c.room_id,
                       'person', (SELECT rm.id::text FROM public.transcribe_room_members tm
                                    JOIN public.event_room_members rm ON rm.profile_id = tm.profile_id AND rm.event_id = NEW.event_id
                                   WHERE tm.id = c.member_id LIMIT 1))
                       ORDER BY c.member_id)
                       FROM cs c WHERE c.table_no = tb.table_no), '[]'::jsonb),
           COALESCE(i.seated, 0), COALESCE(i.roster, '[]'::jsonb),
           LEAST(GREATEST(NEW.started_at, COALESCE(adj.adjusted_at, NEW.started_at)), COALESCE(NEW.ended_at, NEW.started_at)),
           NEW.ended_at, NEW.ended_at + interval '40 seconds',
           CASE WHEN EXISTS (SELECT 1 FROM mv WHERE mv.t = tb.table_no) THEN 'completed' ELSE 'pending' END,
           CASE WHEN EXISTS (SELECT 1 FROM mv WHERE mv.t = tb.table_no) THEN 'seat_moved' END,
           CASE WHEN EXISTS (SELECT 1 FROM mv WHERE mv.t = tb.table_no) THEN now() END
      FROM tb LEFT JOIN info i ON i.table_no = tb.table_no
              LEFT JOIN public.transcribe_round_seat_adjust adj ON adj.round_id = NEW.id AND adj.table_no = tb.table_no
    ON CONFLICT (round_id, table_no) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- starting the next round must never fail because cleaning could not be scheduled
    RAISE WARNING '_transcribe_round_cut: no clean jobs created (sqlstate %)', SQLSTATE;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_round_cut() FROM PUBLIC, anon, authenticated;

DO $check$
BEGIN
  IF has_table_privilege('authenticated', 'public.transcribe_round_seat_adjust', 'SELECT, INSERT, UPDATE, DELETE')
     OR has_function_privilege('authenticated', 'public._transcribe_log_seat_change()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._transcribe_round_cut()', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1596: seat-adjust window is client-reachable';
  END IF;
END
$check$;
