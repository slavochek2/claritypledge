-- P1699 review fixes (/finish, 2026-11-17): the reset leaves no path for test-round speech or a racing reply to reach the
-- event chat. Spec: features/p1699_host_reset_rounds.md
--
-- 1. event_round_resets: one row per event, the time of the host's last reset. RLS on, no policies, no client grants:
--    only the SECURITY DEFINER functions below read or write it.
-- 2. host_reset_rounds: (a) locks the collected thread roots FOR UPDATE before deleting anything, so a reply racing the
--    reset either commits before the lock (and is deleted with the replies) or blocks on its FK check and fails once the
--    root is gone. It can no longer land between the two DELETEs and survive as a loose event-chat message, because
--    chat_messages.thread_root_id is ON DELETE SET NULL (Gemini and Codex review findings). (b) stamps
--    event_round_resets.reset_at.
-- 3. _transcribe_round_one_start_job: the "before" window starts at the later of the room's creation and the last reset.
--    Before this, a round 1 started after a reset rebuilt the window from the room's creation, so the test rounds' speech
--    was posted to the event-wide "Before round 1" thread (Codex review finding, confirmed at
--    20261102133000_p1596_threads_in_time_order.sql:228).
-- 4. _transcribe_room_end_segments: same clip for the room's end job. With the test rounds deleted they no longer carve
--    their time out of the "after"/"conversation" segments, so without the clip that speech would post there too.
--
-- diffed against:
--   host_reset_rounds              20261117170000_p1699_host_reset_rounds.sql (adds the root lock and the stamp; the rest
--                                  of the body is unchanged)
--   _transcribe_round_one_start_job 20261102133000_p1596_threads_in_time_order.sql (window start and the room filter use
--                                  the reset; LEFT JOIN event_round_resets, GROUP BY gains x.reset_at; nothing else)
--   _transcribe_room_end_segments  20261102170000_p1596_open_round_at_room_end.sql (v_start replaces v_room.created_at
--                                  in all four places, plus the early return when the reset is after the room ended)
-- client-safe: one new table no client can reach; signatures and return types unchanged.

CREATE TABLE IF NOT EXISTS public.event_round_resets (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  reset_at timestamptz NOT NULL
);
ALTER TABLE public.event_round_resets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_round_resets FROM PUBLIC, anon, authenticated;

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
  -- the roots first: a reply racing the reset blocks on its FK check here instead of slipping between the two DELETEs
  PERFORM 1 FROM public.chat_messages m WHERE m.id = ANY (v_roots) ORDER BY m.id FOR UPDATE;
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

  -- 4b. the boundary the transcript windows start from (event_round_resets, header item 3 and 4)
  INSERT INTO public.event_round_resets (event_id, reset_at) VALUES (p_event_id, clock_timestamp())
  ON CONFLICT (event_id) DO UPDATE SET reset_at = EXCLUDED.reset_at;

  -- 5. who sits out which round
  UPDATE public.event_round_presence p SET sits_out_round = NULL, updated_at = now()
   WHERE p.event_id = p_event_id AND p.sits_out_round IS NOT NULL;

  RETURN v_rounds;
END;
$$;
REVOKE ALL ON FUNCTION public.host_reset_rounds(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_reset_rounds(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public._transcribe_round_one_start_job()
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
    -- Each room of this event that is open and began before round 1: everything it heard up to this moment, from the
    -- consenting people in it. The worker waits for the uploads past the window end exactly as for a round job.
    INSERT INTO public.transcribe_round_clean_jobs
      (kind, place, event_id, room_id, seats, window_start, window_end, segments, not_before)
    SELECT 'room', 'before', NEW.event_id, r.id,
           jsonb_agg(jsonb_build_object('member_id', m.id, 'room_id', m.room_id) ORDER BY m.id),
           greatest(r.created_at, coalesce(x.reset_at, r.created_at)), NEW.started_at,
           jsonb_build_array(jsonb_build_object('start', greatest(r.created_at, coalesce(x.reset_at, r.created_at)), 'end', NEW.started_at,
             'member_ids', jsonb_agg(m.id ORDER BY m.id), 'compare_ids', jsonb_agg(m.id ORDER BY m.id))),
           NEW.started_at + interval '40 seconds'
      FROM public.transcribe_rooms r
      JOIN public.transcribe_room_members m ON m.room_id = r.id AND m.consent_given_at IS NOT NULL AND m.profile_id IS NOT NULL
      -- P1699: after a reset of the rounds, "before round 1" starts at that reset, not at the room's creation
      LEFT JOIN public.event_round_resets x ON x.event_id = NEW.event_id
     WHERE r.event_id = NEW.event_id AND r.ended_at IS NULL
       AND greatest(r.created_at, coalesce(x.reset_at, r.created_at)) < NEW.started_at
     GROUP BY r.id, r.created_at, x.reset_at
    ON CONFLICT (room_id, place) WHERE kind = 'room' DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- starting round 1 must never fail because cleaning could not be scheduled
    RAISE WARNING '_transcribe_round_one_start_job: no job created (sqlstate %)', SQLSTATE;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_round_one_start_job() FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public._transcribe_room_end_segments(p_room uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_room  public.transcribe_rooms;
  v_all   uuid[];
  v_bound timestamptz[];
  v_out   jsonb := '[]'::jsonb;
  v_a     timestamptz;
  v_b     timestamptz;
  v_seat  uuid[];
  v_ids   uuid[];
  v_r     record;
  v_floor timestamptz;
  v_start timestamptz;
  i       integer;
BEGIN
  SELECT r.* INTO v_room FROM public.transcribe_rooms r WHERE r.id = p_room;
  IF NOT FOUND OR v_room.event_id IS NULL OR v_room.ended_at IS NULL THEN
    RETURN v_out;
  END IF;
  -- P1699: speech from before the host's last reset of the rounds belongs to rounds that no longer exist; it is never
  -- posted to the event chat. The room's start is clipped to that reset.
  SELECT greatest(v_room.created_at, coalesce(max(x.reset_at), v_room.created_at)) INTO v_start
    FROM public.event_round_resets x WHERE x.event_id = v_room.event_id;
  IF v_start >= v_room.ended_at THEN
    RETURN v_out;
  END IF;
  SELECT COALESCE(array_agg(m.id ORDER BY m.id), '{}') INTO v_all
    FROM public.transcribe_room_members m
   WHERE m.room_id = p_room AND m.consent_given_at IS NOT NULL AND m.profile_id IS NOT NULL;
  IF cardinality(v_all) = 0 THEN
    RETURN v_out;
  END IF;

  SELECT array_agg(DISTINCT t ORDER BY t) INTO v_bound FROM (
    SELECT v_start AS t
    UNION SELECT v_room.ended_at
    UNION SELECT greatest(er.started_at, v_start) FROM public.event_rounds er
           WHERE er.event_id = v_room.event_id
             AND er.started_at < v_room.ended_at AND coalesce(er.ended_at, v_room.ended_at) > v_start
    UNION SELECT least(coalesce(er.ended_at, v_room.ended_at), v_room.ended_at) FROM public.event_rounds er
           WHERE er.event_id = v_room.event_id
             AND er.started_at < v_room.ended_at AND coalesce(er.ended_at, v_room.ended_at) > v_start
  ) b;

  -- a "before" job for this room already owns everything up to its window end (round 1's start)
  SELECT j.window_end INTO v_floor FROM public.transcribe_round_clean_jobs j
   WHERE j.kind = 'room' AND j.place = 'before' AND j.room_id = p_room;

  FOR i IN 1 .. COALESCE(cardinality(v_bound), 0) - 1 LOOP
    v_a := v_bound[i];
    v_b := v_bound[i + 1];
    IF v_floor IS NOT NULL THEN
      IF v_b <= v_floor THEN
        CONTINUE;
      END IF;
      v_a := greatest(v_a, v_floor);
    END IF;
    v_seat := '{}';
    FOR v_r IN
      SELECT er.id FROM public.event_rounds er
       WHERE er.event_id = v_room.event_id
         AND er.started_at <= v_a AND coalesce(er.ended_at, v_room.ended_at) >= v_b
    LOOP
      -- a round still open when the room ended runs, for this room, to the room's end (the cut that closes it later keeps
      -- this room: _transcribe_round_cut_seats), so its seated people's words stay with that round, not "after"
      IF EXISTS (SELECT 1 FROM public.transcribe_round_clean_jobs j WHERE j.kind = 'round' AND j.round_id = v_r.id) THEN
        -- immutable: who the round job for this round snapshotted at the cut (whatever happened to it since)
        v_seat := v_seat || COALESCE((
          SELECT array_agg((s ->> 'member_id')::uuid)
            FROM public.transcribe_round_clean_jobs j
            CROSS JOIN LATERAL jsonb_array_elements(j.seats) s
           WHERE j.kind = 'round' AND j.round_id = v_r.id AND (s ->> 'room_id')::uuid = p_room), '{}');
      ELSE
        v_seat := v_seat || COALESCE((SELECT array_agg(c.member_id) FROM public._transcribe_round_cut_seats(v_r.id) c
                                       WHERE c.room_id = p_room), '{}');
      END IF;
      -- P1596: anyone the seat log names for this round (moved, arrived, left, sat out, or whose seat row was
      -- deleted mid-round) is excluded here too: their speech at a table is never "outside rounds".
      v_seat := v_seat || COALESCE((
        SELECT array_agg(tm.id)
          FROM public.transcribe_round_seat_moves mv
          JOIN public.event_room_members rm ON rm.id = mv.room_member_id
          JOIN public.transcribe_room_members tm ON tm.profile_id = rm.profile_id AND tm.room_id = p_room
         WHERE mv.round_id = v_r.id), '{}');
    END LOOP;
    SELECT COALESCE(array_agg(x ORDER BY x), '{}') INTO v_ids
      FROM unnest(v_all) x WHERE NOT (x = ANY (v_seat));
    IF cardinality(v_ids) > 0 THEN
      -- member_ids: whose words are posted. compare_ids: every mic in the room, so a seated person's loud mic
      -- still takes its seconds from a quiet unseated one and nobody is handed a tablemate's words.
      v_out := v_out || jsonb_build_array(jsonb_build_object('start', v_a, 'end', v_b,
                 'member_ids', to_jsonb(v_ids), 'compare_ids', to_jsonb(v_all)));
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_room_end_segments(uuid) FROM PUBLIC, anon, authenticated;

