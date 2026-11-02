-- P1596 (adversarial review of the solo-test-2 build): a room that ends during an OPEN round.
-- Created: 2026-11-02
-- Spec: features/p1596_event_transcripts_one_speaker_per_sentence.md
--
-- client-safe: _transcribe_room_end_segments and _transcribe_round_cut_seats are trigger-internal (EXECUTE revoked from
--   PUBLIC, anon and authenticated; checked at the end). create_transcribe_room is client-callable and is made STRICTER
--   only: it now refuses any non-null p_event_id; the grants are re-stated unchanged (authenticated only, never anon).
--   No table or policy changes.
--
-- diffed against:
--   _transcribe_room_end_segments 20261102133000_p1596_threads_in_time_order.sql (same body; a round still open when the
--                                 room ended counts as running to the room's end, in the bounds and in the seat loop)
--   create_transcribe_room        20260914120200_p1307_transcribe_member_cap_source.sql (same body and grants; one refusal
--                                 added after the consent check: an event is entered through enter_transcribe_room)
--   _transcribe_round_cut_seats   20261101120000_p1596_clean_round_transcripts.sql (same body; the room filter keeps a
--                                 room that ended after the round began, not only one that ended after the round did)
--
-- WHAT WENT WRONG: every mic stops (or goes quiet for 10 minutes) during round N, the sweep ends the room, and the host
--   closes round N later. The room-end job ran with round N still open, so N was neither a boundary nor a seat
--   exclusion: the seated people's table speech was posted to "After the last round" and every mic in the room competed
--   for it. The later cut then dropped the room because it had ended before the round did, so round N's thread got
--   nothing from it.
-- NOW: the stretch inside an open round belongs to that round. The room-end job leaves the seated people out of it, and
--   the cut keeps the room (its audio simply ends where the room ended).
-- LIMIT: a round the host never closes (no later round, no "end rounds") is never cut, so its table speech after the
--   room ended is posted nowhere; before this change it went to "After the last round".
--
-- CORRECTION to 20261102143000_p1596_thread_roots_in_time_order.sql, DECISIONS, "Unread counts and last-message
--   previews ... unchanged": that is false for a root stamped earlier than a reader's last_read_at. get_my_chats counts
--   unread only from top-level rows created after last_read_at and previews the newest top-level row by created_at, so a
--   backdated root (and a thread posted under an older root) raises no unread count, no inbox preview and no bump for
--   someone who already read the chat. Behaviour is NOT changed here (founder rule P1592 D1 keeps replies out of
--   unread); it is a Known limitation in the spec. Also known: a late-RSVP speaker's words are dropped when a shared
--   root predates their access (P1592 D1); order can still invert through the RSVP floor when an RSVP lands between two
--   root posts; lines of two rooms in one shared thread sort by post time.

CREATE OR REPLACE FUNCTION public._transcribe_round_cut_seats(p_round uuid)
RETURNS TABLE (table_no integer, member_id uuid, room_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.table_no, tm.id, tm.room_id
    FROM public.event_rounds er
    JOIN public.event_round_seats s     ON s.round_id = er.id
    JOIN public.event_room_members rm   ON rm.id = s.room_member_id AND rm.profile_id IS NOT NULL
    JOIN public.transcribe_rooms tr     ON tr.event_id = er.event_id
    JOIN public.transcribe_room_members tm
                                        ON tm.room_id = tr.id AND tm.profile_id = rm.profile_id
   WHERE er.id = p_round
     AND tm.consent_given_at IS NOT NULL
     -- a room that ended before the round began has no audio in it; one that ended DURING the round is kept, so the
     -- stretch inside the round stays with the round
     AND (tr.ended_at IS NULL OR tr.ended_at > er.started_at)
     AND NOT EXISTS (SELECT 1 FROM public.event_round_presence p
                      WHERE p.event_id = er.event_id AND p.room_member_id = rm.id
                        AND (p.left_at IS NOT NULL OR p.sits_out_round IS NOT DISTINCT FROM er.round_no))
$$;
REVOKE ALL ON FUNCTION public._transcribe_round_cut_seats(uuid) FROM PUBLIC, anon, authenticated;

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
  i       integer;
BEGIN
  SELECT r.* INTO v_room FROM public.transcribe_rooms r WHERE r.id = p_room;
  IF NOT FOUND OR v_room.event_id IS NULL OR v_room.ended_at IS NULL THEN
    RETURN v_out;
  END IF;
  SELECT COALESCE(array_agg(m.id ORDER BY m.id), '{}') INTO v_all
    FROM public.transcribe_room_members m
   WHERE m.room_id = p_room AND m.consent_given_at IS NOT NULL AND m.profile_id IS NOT NULL;
  IF cardinality(v_all) = 0 THEN
    RETURN v_out;
  END IF;

  SELECT array_agg(DISTINCT t ORDER BY t) INTO v_bound FROM (
    SELECT v_room.created_at AS t
    UNION SELECT v_room.ended_at
    UNION SELECT greatest(er.started_at, v_room.created_at) FROM public.event_rounds er
           WHERE er.event_id = v_room.event_id
             AND er.started_at < v_room.ended_at AND coalesce(er.ended_at, v_room.ended_at) > v_room.created_at
    UNION SELECT least(coalesce(er.ended_at, v_room.ended_at), v_room.ended_at) FROM public.event_rounds er
           WHERE er.event_id = v_room.event_id
             AND er.started_at < v_room.ended_at AND coalesce(er.ended_at, v_room.ended_at) > v_room.created_at
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

-- ============================================================================
-- create_transcribe_room: ad-hoc rooms only
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_transcribe_room(
  p_code text,
  p_display_name text,
  p_session_id uuid,
  p_consent boolean,
  p_event_id uuid DEFAULT NULL
)
RETURNS TABLE (
  room_id uuid,
  room_code text,
  room_event_id uuid,
  room_created_at timestamptz,
  room_ended_at timestamptz,
  member_id uuid,
  member_profile_id uuid,
  member_display_name text,
  member_session_id uuid,
  member_joined_at timestamptz,
  member_consent_given_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- No `#variable_conflict use_column`, deliberately — see 20260909100000. There is no ON
-- CONFLICT here and every reference is qualified; the default (raise) is the fail-safe.
DECLARE
  v_uid     uuid := auth.uid();
  v_name    text := btrim(coalesce(p_display_name, ''));
  v_room    public.transcribe_rooms%ROWTYPE;
  v_member  public.transcribe_room_members%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_consent IS NOT TRUE THEN
    RAISE EXCEPTION 'consent is required to join a transcription room' USING ERRCODE = '42501';
  END IF;

  -- P1596: an event's room is the ONE shared room entered through enter_transcribe_room (which serialises the first
  -- arrivals); this function has no such lock, so for an event it could make a second room. The app never calls it with an
  -- event (createRoom() calls enter_transcribe_room), so refusing here changes nothing for a client.
  IF p_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'an event room is entered through enter_transcribe_room' USING ERRCODE = '42501';
  END IF;

  IF p_code IS NULL OR p_code !~ '^[A-HJ-NP-Z2-9]{6}$' THEN
    RAISE EXCEPTION 'room code must be 6 characters from the room-code alphabet'
      USING ERRCODE = '22023';
  END IF;

  IF length(v_name) = 0 OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'display name must be between 1 and 100 characters'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clarity_sessions s
    WHERE s.id = p_session_id AND s.creator_profile_id = v_uid
  ) THEN
    RAISE EXCEPTION 'session does not belong to the caller' USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_transcribe_event_access(p_event_id, v_uid);

  INSERT INTO public.transcribe_rooms (code, event_id)
  VALUES (p_code, p_event_id)
  RETURNING * INTO v_room;

  INSERT INTO public.transcribe_room_members
    (room_id, profile_id, display_name, session_id, consent_given_at, last_seen_at)
  VALUES (v_room.id, v_uid, v_name, p_session_id, now(), now())
  RETURNING * INTO v_member;

  RETURN QUERY SELECT
    v_room.id, v_room.code, v_room.event_id, v_room.created_at, v_room.ended_at,
    v_member.id, v_member.profile_id, v_member.display_name, v_member.session_id,
    v_member.joined_at,
    v_member.consent_given_at;
END;
$$;


REVOKE ALL ON FUNCTION public.create_transcribe_room(text, text, uuid, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_transcribe_room(text, text, uuid, boolean, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_transcribe_room(text, text, uuid, boolean, uuid) TO authenticated;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public._transcribe_room_end_segments(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._transcribe_room_end_segments(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public._transcribe_round_cut_seats(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._transcribe_round_cut_seats(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.create_transcribe_room(text, text, uuid, boolean, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1596: an open-round function is client-reachable';
  END IF;
END
$check$;
