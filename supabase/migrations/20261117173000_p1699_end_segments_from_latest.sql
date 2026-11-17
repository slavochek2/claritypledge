-- P1699 correction (/finish round 2, Codex): 20261117172000 rebuilt _transcribe_room_end_segments from an older body
-- (20261102170000) instead of the latest one, 20261103090200_p1604_transcription_belongs_to_a_chat_clean.sql. That dropped
-- P1604's branch for rooms with no event (a chat's room, a plain room), so ending such a room created no session clean job.
-- This file restores the latest body exactly and adds the P1699 reset clip AFTER the no-event branch, for event rooms only.
-- Spec: features/p1699_host_reset_rounds.md
--
-- diffed against: 20261103090200_p1604_transcription_belongs_to_a_chat_clean.sql (_transcribe_room_end_segments).
-- diff: one declared variable (v_start); the clip block after the no-event branch; v_start in place of v_room.created_at
-- in the event-room part only (4 places). The no-event branch is byte-identical to 20261103090200.
-- client-safe: same signature and return; no client calls this function.

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
  IF NOT FOUND OR v_room.ended_at IS NULL THEN
    RETURN v_out;
  END IF;
  SELECT COALESCE(array_agg(m.id ORDER BY m.id), '{}') INTO v_all
    FROM public.transcribe_room_members m
   WHERE m.room_id = p_room AND m.consent_given_at IS NOT NULL AND m.profile_id IS NOT NULL;
  IF cardinality(v_all) = 0 THEN
    RETURN v_out;
  END IF;
  -- P1604: a room with no event (a chat's room, a plain room) has no rounds: its whole stretch is one segment, every
  -- consenting mic compared and posted.
  IF v_room.event_id IS NULL THEN
    RETURN jsonb_build_array(jsonb_build_object('start', v_room.created_at, 'end', v_room.ended_at,
             'member_ids', to_jsonb(v_all), 'compare_ids', to_jsonb(v_all)));
  END IF;
  -- P1699: an event room's speech from before the host's last reset of the rounds belongs to rounds that no longer exist;
  -- it is never posted. The room's start is clipped to that reset (event rooms only; the branch above is untouched).
  SELECT greatest(v_room.created_at, coalesce(max(x.reset_at), v_room.created_at)) INTO v_start
    FROM public.event_round_resets x WHERE x.event_id = v_room.event_id;
  IF v_start >= v_room.ended_at THEN
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

