-- Migration: P1529 -- the reading part of a round, and seating when fewer than two Clarity Canvases are shared
-- Created: 2026-11-11
-- Spec: features/p1529_canvas_event_host_coordination.md ("UAT round 2026-11-11: founder decisions", items 1, 4 and decision (b))
-- Guaranteed by: e2e/integration/p1337-event-rounds-db.spec.ts ("reading part", "seat anyway"), e2e/integration/p1529-db-schema.spec.ts
--
-- WHY. (1) Every mastermind round now opens with a timed silent reading part, settable by the host, 0 = none. (2) The host can always
-- seat and start a round: with fewer than two canvases shared, a table's owner may have no canvas ("a business idea that has no canvas yet").
--
-- WHAT. (1) event_rounds.reading_s (0..3600, default 0 = no reading part: every other flow and every earlier round is unchanged). The round's
-- parts are now seating, reading, talk (first, second), observer. host_start_round gains an 11-argument overload with p_reading_s (the 10-,
-- 8-, 7- and 4-argument ones stay valid and write 0). host_extend_round takes 'reading' as a part, and its arithmetic counts reading_s;
-- extending while the reading runs extends the reading. host_shorten_round likewise. (2) _event_round_seats_owner_has_canvas refuses an owner
-- without a canvas only while two or more canvases are shared with the event; below that the host seats anyway.
--
-- diffed against: 20261110153500 (host_extend_round), 20261005183000 (host_start_round 10-arg, host_shorten_round),
--   20261105210000 (_event_round_seats_owner_has_canvas).
-- diff: host_extend_round: the phase whitelist gains 'reading'; every elapsed threshold after seating adds reading_s; a 'reading' branch in the
--   part chain, in the at-maximum check and in the LEAST updates. host_shorten_round: the same thresholds plus a 'reading' branch. Every
--   RAISE EXCEPTION message, the lock, the guards and the grants are unchanged. host_start_round (11-arg): the 10-arg body plus the column.
--   _event_round_seats_owner_has_canvas: one early RETURN NEW when fewer than two canvases are shared with the event; the refusal and its
--   wording are unchanged.
-- client-safe: additive column with a default; a new overload; the three replaced functions keep their signatures and error codes.

BEGIN;

ALTER TABLE public.event_rounds
  ADD COLUMN IF NOT EXISTS reading_s INTEGER NOT NULL DEFAULT 0 CHECK (reading_s BETWEEN 0 AND 3600);
COMMENT ON COLUMN public.event_rounds.reading_s IS
  'P1529: seconds of silent reading at the start of the round (after seating, before the talk). 0 = no reading part.';

CREATE OR REPLACE FUNCTION public.host_start_round(
  p_event_id uuid,
  p_round_no int,
  p_group_size int,
  p_seats jsonb,
  p_seating_s int,
  p_speaker_s int,
  p_observer_s int,
  p_split_speakers boolean,
  p_match_tag text,
  p_showcase boolean,
  p_reading_s int
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host uuid;
  v_last int;
  v_round uuid;
BEGIN
  SELECT e.host_id INTO v_host FROM public.events e WHERE e.id = p_event_id;
  IF v_host IS NULL OR v_host IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'only the host can run rounds' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || p_event_id::text, 0));

  SELECT COALESCE(max(r.round_no), 0) INTO v_last FROM public.event_rounds r WHERE r.event_id = p_event_id;
  IF p_round_no IS DISTINCT FROM v_last + 1 THEN
    RAISE EXCEPTION 'round % is not next (last started: %)', p_round_no, v_last USING ERRCODE = '22023';
  END IF;

  PERFORM public.p1337_assert_valid_seats(p_event_id, p_seats);

  UPDATE public.event_rounds SET ended_at = now()
   WHERE event_id = p_event_id AND ended_at IS NULL;

  INSERT INTO public.event_rounds
    (event_id, round_no, group_size, seating_s, first_s, second_s, observer_s, split_speakers, match_tag, showcase, reading_s)
  VALUES
    (p_event_id, p_round_no, p_group_size, p_seating_s, p_speaker_s, p_speaker_s, p_observer_s,
     COALESCE(p_split_speakers, true), NULLIF(p_match_tag, ''), COALESCE(p_showcase, false), COALESCE(p_reading_s, 0))
  RETURNING id INTO v_round;

  INSERT INTO public.event_round_seats (round_id, room_member_id, table_no, role)
  SELECT v_round, x.m, x.t, x.r FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text);

  RETURN v_round;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.host_start_round(uuid, int, int, jsonb, int, int, int, boolean, text, boolean, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_start_round(uuid, int, int, jsonb, int, int, int, boolean, text, boolean, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.host_extend_round(p_round_id uuid, p_phase text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event uuid;
  v_host uuid;
  v_round public.event_rounds%ROWTYPE;
  v_elapsed numeric;
  v_has_observer boolean;
  v_part text;
  v_over boolean := false;
  v_new int;
  v_talk_start numeric;
BEGIN
  IF p_phase IS NULL OR p_phase NOT IN ('seating', 'reading', 'first', 'second', 'observer') THEN
    RAISE EXCEPTION 'unknown part of the round: %', p_phase USING ERRCODE = '22023';
  END IF;

  SELECT r.event_id, e.host_id INTO v_event, v_host
    FROM public.event_rounds r JOIN public.events e ON e.id = r.event_id
   WHERE r.id = p_round_id;
  IF v_host IS NULL OR v_host IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'only the host can change the round''s minutes' USING ERRCODE = '42501';
  END IF;

  -- Same lock as Next round, taken BEFORE the round is read: a round closed while we waited is seen.
  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || v_event::text, 0));

  SELECT * INTO v_round FROM public.event_rounds WHERE id = p_round_id;
  IF v_round.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'this round is over' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.event_round_seats s WHERE s.round_id = p_round_id AND s.role = 'observer')
    INTO v_has_observer;
  v_elapsed := extract(epoch FROM (now() - v_round.started_at));
  -- Where the talking begins: after seating and the reading part.
  v_talk_start := v_round.seating_s + v_round.reading_s;

  -- The part running now — the same arithmetic as src/lib/round-clock.ts.
  IF v_elapsed < v_round.seating_s THEN
    v_part := 'seating';
  ELSIF v_elapsed < v_talk_start THEN
    v_part := 'reading';
  ELSIF v_round.split_speakers AND v_elapsed < v_talk_start + v_round.first_s THEN
    v_part := 'first';
  ELSIF v_elapsed < v_talk_start + v_round.first_s + v_round.second_s THEN
    -- Split off: one shared talking part; its extra minute goes on the end (second_s).
    v_part := 'second';
  ELSIF v_has_observer AND v_elapsed < v_talk_start + v_round.first_s + v_round.second_s + v_round.observer_s THEN
    v_part := 'observer';
  ELSE
    -- The clock has run out but the round is still open (ended_at IS NULL, checked above under the lock): the host may give more time.
    -- The round's last part is extended: the observer's when an observer is seated AND the observer part has minutes, else the end of the
    -- talking part (second_s, which also ends the shared part when the split is off). It is set so ONE MINUTE REMAINS from now.
    v_over := true;
    v_part := CASE WHEN v_has_observer AND v_round.observer_s > 0 THEN 'observer' ELSE 'second' END;
  END IF;

  IF v_over THEN
    IF v_part = 'observer' THEN
      v_new := v_round.observer_s + ceil(v_elapsed - (v_talk_start + v_round.first_s + v_round.second_s + v_round.observer_s))::int + 60;
    ELSE
      v_new := v_round.second_s + ceil(v_elapsed - (v_talk_start + v_round.first_s + v_round.second_s))::int + 60;
    END IF;
    IF v_new > 3600 THEN
      RAISE EXCEPTION 'this round cannot be extended further' USING ERRCODE = '54000';
    END IF;
    IF v_part = 'observer' THEN
      UPDATE public.event_rounds SET observer_s = v_new WHERE id = p_round_id;
    ELSE
      UPDATE public.event_rounds SET second_s = v_new WHERE id = p_round_id;
    END IF;
    RETURN;
  END IF;

  -- A running part already at its column maximum cannot grow: the same distinct refusal.
  IF (v_part = 'seating' AND v_round.seating_s >= 1800) OR (v_part = 'reading' AND v_round.reading_s >= 3600)
     OR (v_part = 'first' AND v_round.first_s >= 3600)
     OR (v_part = 'second' AND v_round.second_s >= 3600) OR (v_part = 'observer' AND v_round.observer_s >= 3600) THEN
    RAISE EXCEPTION 'this round cannot be extended further' USING ERRCODE = '54000';
  END IF;

  -- LEAST keeps the column CHECK when fewer than 60 s of room are left.
  IF v_part = 'seating' THEN
    UPDATE public.event_rounds SET seating_s = LEAST(seating_s + 60, 1800) WHERE id = p_round_id;
  ELSIF v_part = 'reading' THEN
    UPDATE public.event_rounds SET reading_s = LEAST(reading_s + 60, 3600) WHERE id = p_round_id;
  ELSIF v_part = 'first' THEN
    UPDATE public.event_rounds SET first_s = LEAST(first_s + 60, 3600) WHERE id = p_round_id;
  ELSIF v_part = 'second' THEN
    UPDATE public.event_rounds SET second_s = LEAST(second_s + 60, 3600) WHERE id = p_round_id;
  ELSE
    UPDATE public.event_rounds SET observer_s = LEAST(observer_s + 60, 3600) WHERE id = p_round_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.host_extend_round(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_extend_round(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.host_shorten_round(p_round_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event uuid;
  v_host uuid;
  v_round public.event_rounds%ROWTYPE;
  v_elapsed numeric;
  v_has_observer boolean;
  v_part text;
  v_into numeric;
  v_talk_start numeric;
BEGIN
  SELECT r.event_id, e.host_id INTO v_event, v_host
    FROM public.event_rounds r JOIN public.events e ON e.id = r.event_id
   WHERE r.id = p_round_id;
  IF v_host IS NULL OR v_host IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'only the host can change the round''s minutes' USING ERRCODE = '42501';
  END IF;

  -- Same lock as Next round and "+1 min", taken BEFORE the round is read.
  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || v_event::text, 0));

  SELECT * INTO v_round FROM public.event_rounds WHERE id = p_round_id;
  IF v_round.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'this round is over' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.event_round_seats s WHERE s.round_id = p_round_id AND s.role = 'observer')
    INTO v_has_observer;
  v_elapsed := extract(epoch FROM (now() - v_round.started_at));
  v_talk_start := v_round.seating_s + v_round.reading_s;

  -- The part running now, and how far into it we are — the arithmetic of src/lib/round-clock.ts.
  IF v_elapsed < v_round.seating_s THEN
    v_part := 'seating';
    v_into := v_elapsed;
  ELSIF v_elapsed < v_talk_start THEN
    v_part := 'reading';
    v_into := v_elapsed - v_round.seating_s;
  ELSIF v_round.split_speakers AND v_elapsed < v_talk_start + v_round.first_s THEN
    v_part := 'first';
    v_into := v_elapsed - v_talk_start;
  ELSIF v_elapsed < v_talk_start + v_round.first_s + v_round.second_s THEN
    -- Split off: one shared talking part; its minute comes off the end (second_s).
    v_part := 'second';
    v_into := v_elapsed - v_talk_start - v_round.first_s;
  ELSIF v_has_observer AND v_elapsed < v_talk_start + v_round.first_s + v_round.second_s + v_round.observer_s THEN
    v_part := 'observer';
    v_into := v_elapsed - v_talk_start - v_round.first_s - v_round.second_s;
  ELSE
    RAISE EXCEPTION 'time is up for this round' USING ERRCODE = '22023';
  END IF;

  -- A minute less, never less than what has already passed in this part (it ends now at most),
  -- and never under the column's floor.
  IF v_part = 'seating' THEN
    UPDATE public.event_rounds SET seating_s = GREATEST(seating_s - 60, ceil(v_into)::int, 0) WHERE id = p_round_id;
  ELSIF v_part = 'reading' THEN
    UPDATE public.event_rounds SET reading_s = GREATEST(reading_s - 60, ceil(v_into)::int, 0) WHERE id = p_round_id;
  ELSIF v_part = 'first' THEN
    UPDATE public.event_rounds SET first_s = LEAST(GREATEST(first_s - 60, ceil(v_into)::int, 60), first_s) WHERE id = p_round_id;
  ELSIF v_part = 'second' THEN
    UPDATE public.event_rounds
       SET second_s = LEAST(GREATEST(second_s - 60, ceil(v_into)::int, 60), second_s)
     WHERE id = p_round_id;
  ELSE
    UPDATE public.event_rounds SET observer_s = GREATEST(observer_s - 60, ceil(v_into)::int, 0) WHERE id = p_round_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.host_shorten_round(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_shorten_round(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public._event_round_seats_owner_has_canvas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event uuid;
  v_showcase boolean;
  v_profile uuid;
  v_name text;
  v_shared int;
BEGIN
  IF NEW.role <> 'first' THEN
    RETURN NEW;
  END IF;
  SELECT r.event_id, COALESCE(r.showcase, false) INTO v_event, v_showcase
    FROM public.event_rounds r WHERE r.id = NEW.round_id;
  IF v_showcase OR public._event_flow(v_event) <> 'sales-mastermind' THEN
    RETURN NEW;
  END IF;
  -- Already the owner this round: moving someone else must not fail because this owner later stopped sharing.
  IF EXISTS (SELECT 1 FROM public.event_round_seats s
              WHERE s.round_id = NEW.round_id AND s.room_member_id = NEW.room_member_id AND s.role = 'first') THEN
    RETURN NEW;
  END IF;
  -- Seat anyway: with fewer than two canvases shared there is nothing to choose from, so an owner may have no canvas yet.
  SELECT count(*) INTO v_shared
    FROM public.event_room_members m
   WHERE m.event_id = v_event AND m.profile_id IS NOT NULL AND public._event_canvas_shared(v_event, m.profile_id);
  IF v_shared < 2 THEN
    RETURN NEW;
  END IF;
  SELECT m.profile_id, m.display_name INTO v_profile, v_name FROM public.event_room_members m WHERE m.id = NEW.room_member_id;
  IF v_profile IS NULL OR NOT public._event_canvas_shared(v_event, v_profile) THEN
    RAISE EXCEPTION 'a Clarity Canvas owner needs a canvas shared with this event'
      USING ERRCODE = '22023', DETAIL = COALESCE(v_name, '');
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
