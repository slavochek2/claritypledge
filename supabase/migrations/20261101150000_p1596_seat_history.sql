-- P1596 seat history: a seat change counts only when the person's table truly changed or they left, judged after
-- the whole transaction, ignoring the first 60 s of the round; and "Open" learns whether a round is open.
-- Created: 2026-11-01
-- Spec: features/p1596_event_transcripts_one_speaker_per_sentence.md (Redesign, Build Plan)
--
-- client-safe: the only client-callable function is get_my_open_round_seat (authenticated). Its return type gains
--   two columns (round_open, latest_root_message_id) and it now returns a row whenever the caller can read the
--   event channel; it was added by 20261101140000 (not applied anywhere yet, no deployed client calls it), so it is
--   dropped and recreated here. The seat-change log, its state table and trigger are trigger-internal /
--   service-role only. Seats are unchanged: host_set_round_seats keeps working as is.
--
-- diffed against:
--   _transcribe_log_seat_move          20261101140000_p1596_review_fixes.sql (replaced by _transcribe_log_seat_change)
--   transcribe_seat_move_log trigger   same file (AFTER UPDATE OF table_no -> deferred, INSERT/UPDATE/DELETE)
--   transcribe_round_seat_moves        same file (from_table / to_table become nullable: arrived / left)
--   _transcribe_round_cut              same file (nulls skipped; each seat carries 'person', the event room member id)
--   get_my_open_round_seat             same file (also reports whether a round is open and my newest round thread)
--
-- DECISIONS
--   * host_set_round_seats UPSERTs listed people and DELETEs unlisted ones, but other paths may delete and
--     re-insert. So the trigger is a CONSTRAINT trigger, DEFERRABLE INITIALLY DEFERRED, row level on INSERT, UPDATE
--     OF table_no and DELETE: it runs at COMMIT, when the person's table is final. Delete-then-reinsert at the
--     same table in one transaction logs nothing; a real move, arrival or departure logs one row.
--   * The last known table per person lives in transcribe_round_seat_state. Changes inside the first 60 s of the
--     round (seating adjustments announced before anyone's cut) update that state silently. After 60 s every real
--     change is logged, so A->B->A later than 60 s still poisons both tables.
--   * The log keeps its meaning at the cut: every table named (from or to) gets a job born completed 'seat_moved'.

-- ============================================================================
-- 1. Nullable ends, and the last-known-table state
-- ============================================================================
ALTER TABLE public.transcribe_round_seat_moves ALTER COLUMN from_table DROP NOT NULL;
ALTER TABLE public.transcribe_round_seat_moves ALTER COLUMN to_table DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.transcribe_round_seat_state (
  round_id       uuid NOT NULL REFERENCES public.event_rounds(id) ON DELETE CASCADE,
  room_member_id uuid NOT NULL,
  table_no       integer,          -- NULL = not seated
  PRIMARY KEY (round_id, room_member_id)
);
ALTER TABLE public.transcribe_round_seat_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.transcribe_round_seat_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.transcribe_round_seat_state TO service_role;

-- ============================================================================
-- 2. The deferred trigger
-- ============================================================================
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
    IF v_prev IS DISTINCT FROM v_cur AND clock_timestamp() >= v_started + interval '60 seconds' THEN
      INSERT INTO public.transcribe_round_seat_moves (round_id, room_member_id, from_table, to_table)
      VALUES (v_round, v_member, v_prev, v_cur);
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

DROP TRIGGER IF EXISTS transcribe_seat_move_log ON public.event_round_seats;
DROP TRIGGER IF EXISTS transcribe_seat_change_log ON public.event_round_seats;
CREATE CONSTRAINT TRIGGER transcribe_seat_change_log
  AFTER INSERT OR UPDATE OF table_no OR DELETE ON public.event_round_seats
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public._transcribe_log_seat_change();
DROP FUNCTION IF EXISTS public._transcribe_log_seat_move();

-- ============================================================================
-- 3. The cut: skip null ends; each seat names its person
-- ============================================================================
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
           NEW.started_at, NEW.ended_at, NEW.ended_at + interval '40 seconds',
           CASE WHEN EXISTS (SELECT 1 FROM mv WHERE mv.t = tb.table_no) THEN 'completed' ELSE 'pending' END,
           CASE WHEN EXISTS (SELECT 1 FROM mv WHERE mv.t = tb.table_no) THEN 'seat_moved' END,
           CASE WHEN EXISTS (SELECT 1 FROM mv WHERE mv.t = tb.table_no) THEN now() END
      FROM tb LEFT JOIN info i ON i.table_no = tb.table_no
    ON CONFLICT (round_id, table_no) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- starting the next round must never fail because cleaning could not be scheduled
    RAISE WARNING '_transcribe_round_cut: no clean jobs created (sqlstate %)', SQLSTATE;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_round_cut() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 4. "Open": is a round open, and which is my newest round thread
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_my_open_round_seat(uuid);
-- One row whenever the caller can read the event channel. seated + root_message_id: the caller's seat in the
-- event's latest round while it is open (root NULL when its thread does not exist yet / is not theirs).
-- round_open: the latest round has not ended. latest_root_message_id: the caller's newest round thread they can
-- read (any round), used when no round is open.
CREATE OR REPLACE FUNCTION public.get_my_open_round_seat(p_conversation uuid)
RETURNS TABLE (seated boolean, root_message_id uuid, round_open boolean, latest_root_message_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid    uuid := auth.uid();
  v_since  timestamptz;
  v_event  uuid;
  v_round  public.event_rounds;
  v_open   boolean := false;
  v_table  integer;
  v_root   uuid;
  v_latest uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  v_since := public._chat_access_since(p_conversation, v_uid);
  IF v_since IS NULL THEN
    RETURN;
  END IF;
  SELECT c.event_id INTO v_event FROM public.chat_conversations c WHERE c.id = p_conversation AND c.kind = 'event';
  IF v_event IS NULL THEN
    RETURN;
  END IF;
  SELECT er.* INTO v_round FROM public.event_rounds er WHERE er.event_id = v_event ORDER BY er.round_no DESC LIMIT 1;
  v_open := FOUND AND v_round.ended_at IS NULL;

  SELECT t.root_message_id INTO v_latest
    FROM public.chat_round_threads t
    JOIN public.event_rounds er ON er.id = t.round_id
    JOIN public.chat_messages m ON m.id = t.root_message_id
   WHERE t.conversation_id = p_conversation AND er.event_id = v_event
     AND m.deleted_at IS NULL AND m.created_at >= v_since
     AND EXISTS (SELECT 1 FROM public.chat_round_thread_members tm WHERE tm.thread_id = t.id AND tm.profile_id = v_uid)
   ORDER BY er.round_no DESC, t.table_no
   LIMIT 1;

  IF v_open THEN
    SELECT s.table_no INTO v_table
      FROM public.event_round_seats s
      JOIN public.event_room_members rm ON rm.id = s.room_member_id
     WHERE s.round_id = v_round.id AND rm.profile_id = v_uid
       AND NOT EXISTS (SELECT 1 FROM public.event_round_presence p
                        WHERE p.event_id = v_event AND p.room_member_id = rm.id
                          AND (p.left_at IS NOT NULL OR p.sits_out_round IS NOT DISTINCT FROM v_round.round_no))
     LIMIT 1;
    IF v_table IS NOT NULL THEN
      SELECT t.root_message_id INTO v_root
        FROM public.chat_round_threads t
        JOIN public.chat_messages m ON m.id = t.root_message_id
       WHERE t.round_id = v_round.id AND t.table_no = v_table AND t.conversation_id = p_conversation
         AND m.deleted_at IS NULL AND m.created_at >= v_since
         AND EXISTS (SELECT 1 FROM public.chat_round_thread_members tm WHERE tm.thread_id = t.id AND tm.profile_id = v_uid);
    END IF;
  END IF;
  RETURN QUERY SELECT (v_open AND v_table IS NOT NULL), v_root, v_open, v_latest;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_open_round_seat(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_open_round_seat(uuid) TO authenticated;

-- ============================================================================
-- 5. Post-conditions
-- ============================================================================
DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.get_my_open_round_seat(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1596: get_my_open_round_seat is anon-callable';
  END IF;
  IF has_function_privilege('authenticated', 'public._transcribe_log_seat_change()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._transcribe_round_cut()', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1596: a seat-history function is client-callable';
  END IF;
  IF has_table_privilege('authenticated', 'public.transcribe_round_seat_state', 'SELECT, INSERT, UPDATE, DELETE')
     OR has_table_privilege('authenticated', 'public.transcribe_round_seat_moves', 'SELECT, INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION 'P1596: a client can reach the seat history';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transcribe_seat_change_log' AND tgdeferrable AND tginitdeferred) THEN
    RAISE EXCEPTION 'P1596: the seat-change trigger is not deferred';
  END IF;
END
$check$;
