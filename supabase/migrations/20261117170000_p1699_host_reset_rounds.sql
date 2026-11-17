-- P1699 (founder, 2026-11-17): the host resets an event's rounds and can start again from round 1.
-- Spec: features/p1699_host_reset_rounds.md
--
-- host_reset_rounds(p_event_id): host only (42501 otherwise, same guard as host_end_rounds), serialised on the p1337_round lock
-- that host_start_round, host_end_round and host_end_rounds take, so a start from another host device cannot interleave.
-- One transaction, in this order:
--   0. Lock the event's clean-transcript jobs (FOR UPDATE) before touching anything they post into, so a poster running at the
--      same moment waits for the reset instead of deadlocking with it.
--   1. Round chat: replies of every round thread, then the roots. chat_messages.thread_root_id is ON DELETE SET NULL
--      (20261019203000_p1512_clarity_chat.sql:112), so a root deleted first would turn its replies into loose event-chat
--      messages. Same for the "Before round 1" / "After the last round" threads (chat_outside_round_threads places
--      'before' and 'after'). The 'conversation' place (an event transcribed with no rounds) is not round state and stays.
--   2. Round transcript lines: transcribe_messages whose dest_round_id is one of the event's rounds (the FK is SET NULL, so
--      they would survive the round otherwise). Room-level clean jobs (kind 'room', places 'before'/'end'): starting round 1
--      creates the 'before' one with no round link, and the unique (room_id, place) index
--      (20261102133000_p1596_threads_in_time_order.sql:41-43) would stop the real evening making its own.
--   3. event_rounds. Cascades, from grep "REFERENCES public.event_rounds" on 2026-11-17: event_round_seats,
--      event_round_tables, chat_round_threads (-> chat_round_thread_members), transcribe_round_seat_moves,
--      transcribe_round_seat_state, transcribe_round_seat_adjust, transcribe_round_clean_jobs (-> transcribe_round_clean_posts,
--      transcribe_clean_texts), event_next_version_taps, event_canvas_opens. SET NULL (handled above or below):
--      transcribe_messages.dest_round_id, event_canvas_update_steps.after_round_id.
--   4. event_evening_ends and event_canvas_update_steps rows for the event. event_canvas_setups is kept: the canvas setup
--      runs before rounds and is not round state.
--   5. event_round_presence.sits_out_round cleared (left_at kept: who is in the room is not round state).
-- Tables holding a round number with no FK, checked: event_round_presence.sits_out_round (step 5). No other column found
-- (grep "round_no|sits_out_round" over the migrations: the rest are function parameters and locals).
-- Other references to chat_messages, checked: every one is ON DELETE CASCADE or SET NULL (reactions, forwards' source,
-- drafts, canvas choices, clean posts), and no table has a DELETE trigger on the rows removed here.
-- Returns the number of rounds deleted.
--
-- new function: host_reset_rounds (no prior definition).
-- client-safe: additive (one new function). No existing function or table changes.

CREATE OR REPLACE FUNCTION public.host_reset_rounds(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host uuid;
  v_rounds integer;
  v_roots uuid[];
BEGIN
  SELECT e.host_id INTO v_host FROM public.events e WHERE e.id = p_event_id;
  IF v_host IS NULL OR v_host IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'only the host can reset rounds' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || p_event_id::text, 0));

  -- 0. the jobs a poster would read, locked first
  PERFORM 1 FROM public.transcribe_round_clean_jobs j WHERE j.event_id = p_event_id FOR UPDATE;

  -- 1. round threads and the before/after threads: replies first, then roots
  SELECT COALESCE(array_agg(x.id), '{}') INTO v_roots FROM (
    SELECT t.root_message_id AS id FROM public.chat_round_threads t
      JOIN public.event_rounds r ON r.id = t.round_id
     WHERE r.event_id = p_event_id
    UNION
    SELECT o.root_message_id FROM public.chat_outside_round_threads o
      JOIN public.chat_conversations c ON c.id = o.conversation_id
     WHERE c.kind = 'event' AND c.event_id = p_event_id AND o.place IN ('before', 'after')
  ) x;
  DELETE FROM public.chat_messages m WHERE m.thread_root_id = ANY (v_roots);
  DELETE FROM public.chat_messages m WHERE m.id = ANY (v_roots);

  -- 2. round transcript lines and the room-level jobs
  DELETE FROM public.transcribe_messages tm
   WHERE tm.dest_round_id IN (SELECT r.id FROM public.event_rounds r WHERE r.event_id = p_event_id);
  DELETE FROM public.transcribe_round_clean_jobs j
   WHERE j.event_id = p_event_id AND j.kind = 'room' AND j.place IN ('before', 'end');

  -- 3. the rounds (cascades listed in the header)
  DELETE FROM public.event_rounds r WHERE r.event_id = p_event_id;
  GET DIAGNOSTICS v_rounds = ROW_COUNT;

  -- 4. the evening's end and the after-round canvas step
  DELETE FROM public.event_evening_ends x WHERE x.event_id = p_event_id;
  DELETE FROM public.event_canvas_update_steps s WHERE s.event_id = p_event_id;

  -- 5. who sits out which round
  UPDATE public.event_round_presence p SET sits_out_round = NULL, updated_at = now()
   WHERE p.event_id = p_event_id AND p.sits_out_round IS NOT NULL;

  RETURN v_rounds;
END;
$$;
REVOKE ALL ON FUNCTION public.host_reset_rounds(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_reset_rounds(uuid) TO authenticated;
