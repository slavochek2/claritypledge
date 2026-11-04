-- P1529: the sales mastermind's flow, registration questions, canvas for the event, observer overrides,
-- canvas opens, the update step and the host's recording status.
--
-- client-safe: additive. New columns are nullable, new tables are closed to direct client access except the
-- read policies below, and the two new triggers do nothing for an event whose flow is not sales-mastermind.
-- Clarity Night and Social Hike registration, seating and titles are unchanged.
-- diffed against: 20261103040000_p1603_hidden_event_ids_private.sql (rsvp_to_event_by_slug, its checks are
--   repeated in register_for_event), 20261021170000 / 20261029100000 (share_canvas, unshare_canvas are called,
--   not changed), 20261004120000_p1337_host_transcribing_now.sql (same recording-session test, plus words).

BEGIN;

-- ---------------------------------------------------------------------------------------------------------
-- 1. The flow belongs to the event (D8), defaulted from its series. Sessions link explicitly (§4).
-- ---------------------------------------------------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS flow text
    CHECK (flow IS NULL OR flow IN ('clarity-night', 'social-hike', 'sales-mastermind')),
  ADD COLUMN IF NOT EXISTS previous_session_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.events.flow IS
  'P1529 D8: the host''s per-event flow. NULL = the series decides. Fixed once the first counted round starts.';
COMMENT ON COLUMN public.events.previous_session_event_id IS
  'P1529 §4: the session this event continues. Never inferred from "the previous event of the series".';

CREATE OR REPLACE FUNCTION public._event_flow(p_event uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
           e.flow,
           CASE WHEN e.series_slug IN ('social-hike', 'sales-mastermind') THEN e.series_slug END,
           'clarity-night')
    FROM public.events e WHERE e.id = p_event;
$$;
REVOKE ALL ON FUNCTION public._event_flow(uuid) FROM PUBLIC, anon, authenticated;

-- "Round 1" means the first COUNTED round everywhere: a host's Demo is not counted (round-numbering.ts).
CREATE OR REPLACE FUNCTION public._event_counted_round_started(p_event uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_rounds r
     WHERE r.event_id = p_event AND NOT COALESCE(r.showcase, false));
$$;
REVOKE ALL ON FUNCTION public._event_counted_round_started(uuid) FROM PUBLIC, anon, authenticated;

-- The server refuses a flow change after round 1 on every path, including a host's direct UPDATE of events.
CREATE OR REPLACE FUNCTION public._events_flow_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.flow IS DISTINCT FROM OLD.flow AND public._event_counted_round_started(NEW.id) THEN
    RAISE EXCEPTION 'the event flow is fixed once round 1 has started' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._events_flow_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS events_flow_guard ON public.events;
CREATE TRIGGER events_flow_guard BEFORE UPDATE OF flow ON public.events
  FOR EACH ROW EXECUTE FUNCTION public._events_flow_guard();

CREATE OR REPLACE FUNCTION public.host_set_event_flow(p_event uuid, p_flow text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event AND e.host_id = (SELECT auth.uid())) THEN
    RAISE EXCEPTION 'only the host can change the event flow' USING ERRCODE = '42501';
  END IF;
  -- Serialised against round 1 starting (the same lock host_start_round takes).
  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || p_event::text, 0));
  UPDATE public.events SET flow = p_flow WHERE id = p_event;
END;
$$;
REVOKE ALL ON FUNCTION public.host_set_event_flow(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_set_event_flow(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 2. Registration asks before the seat (D16). The person and the host read; only the RPC writes.
-- ---------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_registration_answers (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participation text NOT NULL CHECK (participation IN ('canvas_before', 'canvas_at_doors', 'observer')),
  phone text NOT NULL CHECK (phone IN ('usbc', 'lightning', 'other')),
  hope text CHECK (hope IS NULL OR length(hope) <= 500),
  recording_accepted_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, profile_id)
);
ALTER TABLE public.event_registration_answers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_registration_answers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.event_registration_answers TO authenticated;
DROP POLICY IF EXISTS "own or host reads registration answers" ON public.event_registration_answers;
CREATE POLICY "own or host reads registration answers" ON public.event_registration_answers
  FOR SELECT TO authenticated
  USING (
    profile_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.host_id = (SELECT auth.uid()))
  );

-- Every path that creates a registration passes through here: the page, a sign-up return, the hidden-event
-- link and a direct insert. A flow with no questions is untouched.
CREATE OR REPLACE FUNCTION public._event_rsvps_need_answers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public._event_flow(NEW.event_id) = 'sales-mastermind'
     AND NOT EXISTS (
       SELECT 1 FROM public.event_registration_answers a
        WHERE a.event_id = NEW.event_id AND a.profile_id = NEW.profile_id) THEN
    RAISE EXCEPTION 'this event asks a few questions before registering' USING ERRCODE = 'P0001', HINT = 'answers_required';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._event_rsvps_need_answers() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS event_rsvps_need_answers ON public.event_rsvps;
CREATE TRIGGER event_rsvps_need_answers BEFORE INSERT ON public.event_rsvps
  FOR EACH ROW EXECUTE FUNCTION public._event_rsvps_need_answers();

-- Returns 'ok', 'already' (answers updated), 'full', 'cancelled' or 'not_found', like rsvp_to_event_by_slug;
-- a refused recording acceptance or a malformed answer raises 22023.
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
  IF v_event.status = 'cancelled' THEN
    RETURN 'cancelled';
  END IF;
  v_already := EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = v_event.id AND r.profile_id = v_uid);
  IF NOT v_already AND v_event.max_attendees IS NOT NULL
     AND (SELECT count(*) FROM public.event_rsvps r WHERE r.event_id = v_event.id) >= v_event.max_attendees THEN
    RETURN 'full';
  END IF;

  -- The CHECKs reject an unknown participation or phone (22023-class, nothing is saved).
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
REVOKE ALL ON FUNCTION public.register_for_event(text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_for_event(text, text, text, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 3. "Your Clarity Canvas for this event" (D9, D17). One per attendee per event.
-- ---------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_canvases (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  canvas_id uuid NOT NULL REFERENCES public.canvases(id) ON DELETE CASCADE,
  chosen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, profile_id)
);
ALTER TABLE public.event_canvases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_canvases FROM PUBLIC, anon, authenticated;

-- Is this person's chosen canvas still really shared with the event? (They may have unshared it, P1515.)
CREATE OR REPLACE FUNCTION public._event_canvas_shared(p_event uuid, p_profile uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_canvases ec
      JOIN public.canvas_audience ca ON ca.canvas_id = ec.canvas_id AND ca.kind = 'event' AND ca.event_id = ec.event_id
     WHERE ec.event_id = p_event AND ec.profile_id = p_profile);
$$;
REVOKE ALL ON FUNCTION public._event_canvas_shared(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- One transaction: unshare the old, share the new, set the selection. A FIRST canvas may arrive at any time
-- (D17); replacing one already chosen stops when round 1 starts, serialised against round 1 by the round lock.
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
  IF FOUND AND public._event_counted_round_started(p_event) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'fixed_after_round_1');
  END IF;

  IF v_old.id IS NOT NULL AND v_old.name <> lower(COALESCE(p_name, '')) THEN
    PERFORM public.unshare_canvas(v_old.name, 'event', p_event);
  END IF;
  -- share_canvas refuses an unpublished canvas, someone else's, or an event this person is not admitted to.
  PERFORM public.share_canvas(p_name, 'event', p_event);
  SELECT c.* INTO v_new FROM public.canvases c WHERE c.owner_id = v_uid AND c.name = lower(p_name);

  INSERT INTO public.event_canvases (event_id, profile_id, canvas_id)
  VALUES (p_event, v_uid, v_new.id)
  ON CONFLICT (event_id, profile_id) DO UPDATE SET canvas_id = EXCLUDED.canvas_id, chosen_at = now();
  RETURN jsonb_build_object('status', 'ok', 'name', v_new.name);
END;
$$;
REVOKE ALL ON FUNCTION public.set_event_canvas(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_event_canvas(uuid, text) TO authenticated;

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
   WHERE ec.event_id = p_event AND ec.profile_id = (SELECT auth.uid());
$$;
REVOKE ALL ON FUNCTION public.get_my_event_canvas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_event_canvas(uuid) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 4. Observers (D5): the default is "no canvas shared"; the host overrides per person. Selections and
--    overrides stay stored when the host switches flow away, and apply again on the way back.
-- ---------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_observer_overrides (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_observer boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, profile_id)
);
ALTER TABLE public.event_observer_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_observer_overrides FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.host_set_observer(p_event uuid, p_profile uuid, p_is_observer boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event AND e.host_id = (SELECT auth.uid())) THEN
    RAISE EXCEPTION 'only the host can set observers' USING ERRCODE = '42501';
  END IF;
  IF NOT p_is_observer AND NOT public._event_canvas_shared(p_event, p_profile) THEN
    RETURN jsonb_build_object('status', 'refused', 'code', 'no_shared_canvas');
  END IF;
  INSERT INTO public.event_observer_overrides (event_id, profile_id, is_observer)
  VALUES (p_event, p_profile, p_is_observer)
  ON CONFLICT (event_id, profile_id) DO UPDATE SET is_observer = EXCLUDED.is_observer, updated_at = now();
  RETURN jsonb_build_object('status', 'ok');
END;
$$;
REVOKE ALL ON FUNCTION public.host_set_observer(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_set_observer(uuid, uuid, boolean) TO authenticated;

-- Nobody is seated as owner without a published canvas shared with this event, on any seat-writing path.
-- A Demo round is exempt: it shows the format and is not about anyone's canvas.
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
BEGIN
  IF NEW.role <> 'first' THEN
    RETURN NEW;
  END IF;
  SELECT r.event_id, COALESCE(r.showcase, false) INTO v_event, v_showcase
    FROM public.event_rounds r WHERE r.id = NEW.round_id;
  IF v_showcase OR public._event_flow(v_event) <> 'sales-mastermind' THEN
    RETURN NEW;
  END IF;
  SELECT m.profile_id INTO v_profile FROM public.event_room_members m WHERE m.id = NEW.room_member_id;
  IF v_profile IS NULL OR NOT public._event_canvas_shared(v_event, v_profile) THEN
    RAISE EXCEPTION 'a Clarity Canvas owner needs a canvas shared with this event' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._event_round_seats_owner_has_canvas() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS event_round_seats_owner_has_canvas ON public.event_round_seats;
CREATE TRIGGER event_round_seats_owner_has_canvas BEFORE INSERT OR UPDATE OF role ON public.event_round_seats
  FOR EACH ROW EXECUTE FUNCTION public._event_round_seats_owner_has_canvas();

-- ---------------------------------------------------------------------------------------------------------
-- 5. Canvas opens are evidence, kept outside the seat rows host_set_round_seats rewrites.
-- ---------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_canvas_opens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.event_rounds(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reader_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  version_id uuid REFERENCES public.canvas_versions(id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_canvas_opens_event ON public.event_canvas_opens (event_id, round_id);
ALTER TABLE public.event_canvas_opens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_canvas_opens FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 6. The canvas-update step: its own state, so talk during it is not mistaken for the round before it.
-- ---------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_canvas_update_steps (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  after_round_id uuid REFERENCES public.event_rounds(id) ON DELETE SET NULL
);
ALTER TABLE public.event_canvas_update_steps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_canvas_update_steps FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.event_canvas_update_steps TO authenticated;
DROP POLICY IF EXISTS "visible with the event" ON public.event_canvas_update_steps;
CREATE POLICY "visible with the event" ON public.event_canvas_update_steps
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id));

-- Ends the current round (its transcript is cut here) and records the step. The next round ends the step
-- simply by starting: the step is "on" while its after_round is still the newest round.
CREATE OR REPLACE FUNCTION public.host_start_canvas_update(p_event uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_round uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event AND e.host_id = (SELECT auth.uid())) THEN
    RAISE EXCEPTION 'only the host can start the canvas update' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || p_event::text, 0));
  SELECT r.id INTO v_round FROM public.event_rounds r WHERE r.event_id = p_event ORDER BY r.round_no DESC LIMIT 1;
  UPDATE public.event_rounds SET ended_at = now() WHERE event_id = p_event AND ended_at IS NULL;
  INSERT INTO public.event_canvas_update_steps (event_id, after_round_id) VALUES (p_event, v_round)
  ON CONFLICT (event_id) DO UPDATE SET started_at = now(), after_round_id = EXCLUDED.after_round_id;
END;
$$;
REVOKE ALL ON FUNCTION public.host_start_canvas_update(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_start_canvas_update(uuid) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 7. What the host sees per person. `on` is today's "transcribing now" test; `last_words_at` is what proves
--    audio arrives: a dead mic has an open session and no words.
-- ---------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_mastermind_host_state(p_event uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event AND e.host_id = (SELECT auth.uid())) THEN
    RAISE EXCEPTION 'host only' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'profile_id', p.profile_id,
             'canvas_name', (SELECT c.name FROM public.event_canvases ec JOIN public.canvases c ON c.id = ec.canvas_id
                              WHERE ec.event_id = p_event AND ec.profile_id = p.profile_id),
             'canvas_shared', public._event_canvas_shared(p_event, p.profile_id),
             'observer_override', (SELECT o.is_observer FROM public.event_observer_overrides o
                                    WHERE o.event_id = p_event AND o.profile_id = p.profile_id),
             'participation', a.participation,
             'phone', a.phone,
             'recording_on', EXISTS (
               SELECT 1 FROM public.transcribe_room_members m JOIN public.transcribe_rooms r ON r.id = m.room_id
                WHERE r.event_id = p_event AND r.ended_at IS NULL AND m.profile_id = p.profile_id
                  AND m.consent_given_at IS NOT NULL AND m.capture_ended_at IS NULL
                  AND m.last_seen_at > now() - interval '10 minutes'),
             'last_words_at', (
               SELECT max(tm.created_at) FROM public.transcribe_messages tm
                 JOIN public.transcribe_room_members m ON m.id = tm.member_id
                 JOIN public.transcribe_rooms r ON r.id = tm.room_id
                WHERE r.event_id = p_event AND m.profile_id = p.profile_id)))
      FROM (
        SELECT r.profile_id FROM public.event_rsvps r WHERE r.event_id = p_event
        UNION
        SELECT m.profile_id FROM public.event_room_members m WHERE m.event_id = p_event AND m.profile_id IS NOT NULL
      ) p
      LEFT JOIN public.event_registration_answers a ON a.event_id = p_event AND a.profile_id = p.profile_id
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.get_mastermind_host_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_mastermind_host_state(uuid) TO authenticated;

-- Session 2 avoids session-1 partners: pairs by profile, because room members differ per event.
CREATE OR REPLACE FUNCTION public.get_previous_session_partners(p_event uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prev uuid;
BEGIN
  SELECT e.previous_session_event_id INTO v_prev FROM public.events e
   WHERE e.id = p_event AND e.host_id = (SELECT auth.uid());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'host only' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_array(ma.profile_id, mb.profile_id))
      FROM public.event_rounds r
      JOIN public.event_round_seats a ON a.round_id = r.id AND a.role = 'first'
      JOIN public.event_round_seats b ON b.round_id = r.id AND b.role = 'second' AND b.table_no = a.table_no
      JOIN public.event_room_members ma ON ma.id = a.room_member_id
      JOIN public.event_room_members mb ON mb.id = b.room_member_id
     WHERE r.event_id = v_prev AND NOT COALESCE(r.showcase, false)
       AND ma.profile_id IS NOT NULL AND mb.profile_id IS NOT NULL
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.get_previous_session_partners(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_previous_session_partners(uuid) TO authenticated;

COMMIT;
