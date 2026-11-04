-- P1529 review fixes, round 2 (Opus adversary, each load-bearing claim checked against the code).
--
-- client-safe: replaces functions from the two earlier P1529 migrations, same signatures. The only effect outside the
-- mastermind flow is that account erasure keeps working for a host who linked a session.
-- diffed against: 20261105090000_p1529_mastermind_flow_registration.sql, 20261105190000_p1529_review_fixes.sql.
--
-- CORRECTION to 20261105190000's header: hosts do NOT effectively hold series_slug. They hold the column grant, but
-- p1403_guard_series_columns (20261004180000) refuses every writer but the service role. The effective-flow guard
-- stays because the service role and `flow` can still change it; the risk it was written for was overstated.
--
-- 1. HIGH: erase_my_account sets events.host_id NULL (20261030090000 line 484); the linked-session guard then raised
--    and the whole erasure aborted. A NULL host passes the guard.
-- 2. The owner-has-canvas trigger fires per row even when ON CONFLICT makes it an update, so one owner unsharing mid
--    evening made every later seat change fail. A member already seated as owner this round passes; the error names who.
-- 3. _event_canvas_shared ignored admission and publication: a removed person still read as shared while their partner
--    could not open the canvas.
-- 4. Opens record the newest PUBLISHED version, and an owner opening their own canvas is not evidence.
-- 5. The host's own RSVP no longer blocks a switch to the mastermind; update-step rows follow can_see_event_rounds;
--    a repeat of the same canvas after round 1 is ok; register_for_event only runs for a flow that asks;
--    a direct insert after cancelling cannot pass the limit; host_set_event_flow locks in the guard's order.

BEGIN;

CREATE OR REPLACE FUNCTION public._events_previous_session_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.host_id IS NULL OR NEW.previous_session_event_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events p
                  WHERE p.id = NEW.previous_session_event_id AND p.host_id = NEW.host_id AND p.id <> NEW.id) THEN
    RAISE EXCEPTION 'a linked session must be another event of the same host' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._event_canvas_shared(p_event uuid, p_profile uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public._canvas_target_admits('event', p_event, NULL, p_profile)
     AND EXISTS (
       SELECT 1 FROM public.event_canvases ec
         JOIN public.canvas_audience ca ON ca.canvas_id = ec.canvas_id AND ca.kind = 'event' AND ca.event_id = ec.event_id
         JOIN public.canvas_versions v ON v.canvas_id = ec.canvas_id AND v.published_seq IS NOT NULL
        WHERE ec.event_id = p_event AND ec.profile_id = p_profile);
$$;
REVOKE ALL ON FUNCTION public._event_canvas_shared(uuid, uuid) FROM PUBLIC, anon, authenticated;

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
  SELECT m.profile_id, m.display_name INTO v_profile, v_name FROM public.event_room_members m WHERE m.id = NEW.room_member_id;
  IF v_profile IS NULL OR NOT public._event_canvas_shared(v_event, v_profile) THEN
    RAISE EXCEPTION 'a Clarity Canvas owner needs a canvas shared with this event'
      USING ERRCODE = '22023', DETAIL = COALESCE(v_name, '');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_event_canvas_open(p_round uuid, p_owner uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event uuid;
  v_canvas uuid;
  v_version uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF v_uid = p_owner THEN
    RETURN;
  END IF;
  SELECT r.event_id INTO v_event
    FROM public.event_rounds r
    JOIN public.event_round_seats me ON me.round_id = r.id
    JOIN public.event_room_members mm ON mm.id = me.room_member_id AND mm.profile_id = v_uid
    JOIN public.event_round_seats os ON os.round_id = r.id AND os.table_no = me.table_no AND os.role = 'first'
    JOIN public.event_room_members om ON om.id = os.room_member_id AND om.profile_id = p_owner
   WHERE r.id = p_round;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not at this table' USING ERRCODE = '42501';
  END IF;
  SELECT ec.canvas_id INTO v_canvas FROM public.event_canvases ec WHERE ec.event_id = v_event AND ec.profile_id = p_owner;
  SELECT v.id INTO v_version FROM public.canvas_versions v
   WHERE v.canvas_id = v_canvas AND v.published_seq IS NOT NULL ORDER BY v.published_seq DESC LIMIT 1;
  INSERT INTO public.event_canvas_opens (event_id, round_id, owner_id, reader_id, version_id)
  VALUES (v_event, p_round, p_owner, v_uid, v_version);
END;
$$;

CREATE OR REPLACE FUNCTION public._events_flow_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new text := public._event_flow_of(NEW.flow, NEW.series_slug);
  v_unanswered integer;
BEGIN
  IF v_new = public._event_flow_of(OLD.flow, OLD.series_slug) THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || NEW.id::text, 0));
  IF public._event_counted_round_started(NEW.id) THEN
    RAISE EXCEPTION 'the event flow is fixed once round 1 has started' USING ERRCODE = '22023';
  END IF;
  IF v_new = 'sales-mastermind' THEN
    SELECT count(*) INTO v_unanswered
      FROM public.event_rsvps r
     WHERE r.event_id = NEW.id AND r.profile_id IS DISTINCT FROM NEW.host_id
       AND NOT EXISTS (SELECT 1 FROM public.event_registration_answers a
                        WHERE a.event_id = r.event_id AND a.profile_id = r.profile_id);
    IF v_unanswered > 0 THEN
      RAISE EXCEPTION '% registered people have not answered this flow''s questions or accepted recording', v_unanswered
        USING ERRCODE = '22023', HINT = 'unanswered_registrations';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Row first, then the round lock: the same order the guard takes on a direct update.
CREATE OR REPLACE FUNCTION public.host_set_event_flow(p_event uuid, p_flow text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public.events e WHERE e.id = p_event AND e.host_id = (SELECT auth.uid()) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'only the host can change the event flow' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || p_event::text, 0));
  UPDATE public.events SET flow = p_flow WHERE id = p_event;
END;
$$;

DROP POLICY IF EXISTS "visible with the event" ON public.event_canvas_update_steps;
CREATE POLICY "visible with the rounds" ON public.event_canvas_update_steps
  FOR SELECT TO authenticated USING (public.can_see_event_rounds(event_id));

CREATE OR REPLACE FUNCTION public.set_event_canvas(p_event uuid, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old public.canvases;
  v_new public.canvases;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || p_event::text, 0));

  SELECT c.* INTO v_old FROM public.event_canvases ec JOIN public.canvases c ON c.id = ec.canvas_id
   WHERE ec.event_id = p_event AND ec.profile_id = v_uid;
  IF FOUND AND v_old.name = lower(COALESCE(p_name, '')) AND public._event_canvas_shared(p_event, v_uid) THEN
    RETURN jsonb_build_object('status', 'ok', 'name', v_old.name);
  END IF;
  IF FOUND AND public._event_counted_round_started(p_event) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'fixed_after_round_1');
  END IF;

  IF v_old.id IS NOT NULL AND v_old.name <> lower(COALESCE(p_name, '')) THEN
    PERFORM public.unshare_canvas(v_old.name, 'event', p_event);
  END IF;
  PERFORM public.share_canvas(p_name, 'event', p_event);
  SELECT c.* INTO v_new FROM public.canvases c WHERE c.owner_id = v_uid AND c.name = lower(p_name);

  INSERT INTO public.event_canvases (event_id, profile_id, canvas_id)
  VALUES (p_event, v_uid, v_new.id)
  ON CONFLICT (event_id, profile_id) DO UPDATE SET canvas_id = EXCLUDED.canvas_id, chosen_at = now();
  RETURN jsonb_build_object('status', 'ok', 'name', v_new.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_event_canvas(p_event uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
           'name', c.name,
           'shared', public._event_canvas_shared(p_event, (SELECT auth.uid())),
           'fixed', public._event_counted_round_started(p_event))
    FROM public.event_canvases ec JOIN public.canvases c ON c.id = ec.canvas_id
   WHERE ec.event_id = p_event AND ec.profile_id = (SELECT auth.uid())
     AND app_private.viewer_sees_event(p_event);
$$;

-- This flow's limit holds on every insert path, including a direct insert after cancelling (answers already exist).
CREATE OR REPLACE FUNCTION public._event_rsvps_need_answers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_max integer;
  v_host uuid;
BEGIN
  IF public._event_flow(NEW.event_id) <> 'sales-mastermind' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.event_registration_answers a
                  WHERE a.event_id = NEW.event_id AND a.profile_id = NEW.profile_id) THEN
    RAISE EXCEPTION 'this event asks a few questions before registering' USING ERRCODE = 'P0001', HINT = 'answers_required';
  END IF;
  SELECT e.max_attendees, e.host_id INTO v_max, v_host FROM public.events e WHERE e.id = NEW.event_id FOR UPDATE;
  IF v_max IS NOT NULL AND NEW.profile_id IS DISTINCT FROM v_host
     AND (SELECT count(*) FROM public.event_rsvps r
           WHERE r.event_id = NEW.event_id AND r.profile_id IS DISTINCT FROM v_host) >= v_max THEN
    RAISE EXCEPTION 'this event is full' USING ERRCODE = 'P0001', HINT = 'full';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_for_event(
  p_slug text, p_participation text, p_phone text, p_hope text, p_recording_accepted boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_already boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in to register' USING ERRCODE = '42501';
  END IF;
  IF p_recording_accepted IS NOT TRUE THEN
    RAISE EXCEPTION 'accepting transcription is a condition of this event' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_event FROM public.events e WHERE e.slug = p_slug FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF public._event_flow(v_event.id) <> 'sales-mastermind' THEN
    RAISE EXCEPTION 'this event does not ask questions' USING ERRCODE = '22023';
  END IF;
  IF v_event.status = 'cancelled' THEN
    RETURN 'cancelled';
  END IF;
  v_already := EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = v_event.id AND r.profile_id = v_uid);
  IF NOT v_already AND v_event.max_attendees IS NOT NULL
     AND (SELECT count(*) FROM public.event_rsvps r
           WHERE r.event_id = v_event.id AND r.profile_id IS DISTINCT FROM v_event.host_id) >= v_event.max_attendees THEN
    RETURN 'full';
  END IF;

  INSERT INTO public.event_registration_answers AS a
    (event_id, profile_id, participation, phone, hope, recording_accepted_at)
  VALUES (v_event.id, v_uid, p_participation, p_phone, NULLIF(btrim(COALESCE(p_hope, '')), ''), now())
  ON CONFLICT (event_id, profile_id) DO UPDATE
    SET participation = EXCLUDED.participation, phone = EXCLUDED.phone, hope = EXCLUDED.hope,
        recording_accepted_at = EXCLUDED.recording_accepted_at, updated_at = now();

  IF v_already THEN
    RETURN 'already';
  END IF;
  INSERT INTO public.event_rsvps (event_id, profile_id) VALUES (v_event.id, v_uid);
  RETURN 'ok';
END;
$$;

COMMIT;
