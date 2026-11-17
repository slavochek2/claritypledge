-- P1675: a hike asks before the seat. Hike answers (when the person does the short introduction, how they come, how they help)
-- get their own table, one RPC writes them with the seat, the seat trigger refuses a hike registration without them, and the
-- room gets one count RPC (people registered but not in the room, plus the host's merged In / Out / Undecided).
--
-- client-safe: additive. One new table (clients may only read their own row, or any row of an event they host), three new
-- functions, one new trigger. Clarity Night and sales-mastermind behaviour are unchanged: _event_rsvps_need_answers keeps its
-- signature and its sales-mastermind lines byte for byte, and returns NEW for every flow it does not name.
-- diffed against: 20261106140000_p1529_host_add_past_limit.sql (_event_rsvps_need_answers; the mastermind lines are identical,
--   the hike branch is added before them), 20261106010100_p1529_registration_where_to_prepare.sql (register_for_event; limit
--   counting excludes the host, answers are written before the seat), 20261105090000_p1529_mastermind_flow_registration.sql
--   (the answers table's read policy), 20261006181000_p1429_host_view_room_answer.sql (the room and preparation answer join),
--   20261103040000_p1603_hidden_event_ids_private.sql (a hidden event is joined only by its slug, and read only by the host,
--   the registered and the not-hidden rule in app_private.viewer_sees_event).

BEGIN;

-- ---------------------------------------------------------------------------------------------------------
-- 1. Hike answers. The person and the event's host read; only register_for_hike writes.
-- ---------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_hike_answers (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  when_choice text NOT NULL CHECK (when_choice IN ('now', 'later')),
  transport text NOT NULL CHECK (transport IN ('car', 'motorbike', 'bike_or_foot', 'need_ride')),
  free_seats smallint,
  help text CHECK (help IS NULL OR help IN ('lead', 'sweep', 'welcomer', 'transport_lead', 'other')),
  help_other text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, profile_id),
  CONSTRAINT event_hike_answers_free_seats_motor_only CHECK (
    (transport IN ('car', 'motorbike') AND free_seats IS NOT NULL AND free_seats BETWEEN 0 AND 20)
    OR (transport IN ('bike_or_foot', 'need_ride') AND free_seats IS NULL)),
  CONSTRAINT event_hike_answers_help_other_exactly_when_other CHECK (
    (help = 'other' AND help_other IS NOT NULL AND help_other = btrim(help_other) AND length(help_other) BETWEEN 1 AND 280)
    OR (help IS DISTINCT FROM 'other' AND help_other IS NULL)),
  CONSTRAINT event_hike_answers_transport_lead_needs_ride CHECK (
    help IS DISTINCT FROM 'transport_lead' OR transport = 'need_ride')
);
ALTER TABLE public.event_hike_answers ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.event_hike_answers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.event_hike_answers FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.event_hike_answers TO authenticated;
DROP POLICY IF EXISTS "own or host reads hike answers" ON public.event_hike_answers;
CREATE POLICY "own or host reads hike answers" ON public.event_hike_answers
  FOR SELECT TO authenticated
  USING (
    profile_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.host_id = (SELECT auth.uid()))
  );

-- ---------------------------------------------------------------------------------------------------------
-- 2. Registration for a hike. Returns 'ok', 'already' (answers kept as they were), 'full', 'cancelled', 'not_found' or
--    'now_only' (a "later" answer is valid only while now is strictly before the start minus 24 hours). Any other flow, or a
--    malformed answer, raises 22023.
-- ---------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_for_hike(
  p_slug text, p_when text, p_transport text, p_free_seats integer, p_help text, p_help_other text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_already boolean;
  v_seats integer;
  v_other text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in to register' USING ERRCODE = '42501';
  END IF;
  IF p_slug IS NULL THEN
    RETURN 'not_found';
  END IF;
  SELECT * INTO v_event FROM public.events e WHERE e.slug = p_slug FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF public._event_flow(v_event.id) <> 'social-hike' THEN
    RAISE EXCEPTION 'this event is not a hike' USING ERRCODE = '22023';
  END IF;
  IF v_event.status = 'cancelled' THEN
    RETURN 'cancelled';
  END IF;

  -- Explicit value checks, so a bad answer raises 22023 and nothing is saved (the table CHECKs are the second wall).
  IF p_when IS NULL OR p_when NOT IN ('now', 'later') THEN
    RAISE EXCEPTION 'choose when you will do the introduction' USING ERRCODE = '22023';
  END IF;
  IF p_transport IS NULL OR p_transport NOT IN ('car', 'motorbike', 'bike_or_foot', 'need_ride') THEN
    RAISE EXCEPTION 'choose how you are coming' USING ERRCODE = '22023';
  END IF;
  IF p_help IS NOT NULL AND p_help NOT IN ('lead', 'sweep', 'welcomer', 'transport_lead', 'other') THEN
    RAISE EXCEPTION 'unknown way to help' USING ERRCODE = '22023';
  END IF;
  IF p_help = 'transport_lead' AND p_transport <> 'need_ride' THEN
    RAISE EXCEPTION 'transport lead is for people who need a ride' USING ERRCODE = '22023';
  END IF;
  v_seats := CASE WHEN p_transport IN ('car', 'motorbike') THEN p_free_seats END;
  IF p_transport IN ('car', 'motorbike') AND (v_seats IS NULL OR v_seats < 0 OR v_seats > 20) THEN
    RAISE EXCEPTION 'free seats must be a whole number from 0 to 20' USING ERRCODE = '22023';
  END IF;
  v_other := CASE WHEN p_help = 'other' THEN NULLIF(btrim(COALESCE(p_help_other, '')), '') END;
  IF p_help = 'other' AND (v_other IS NULL OR length(v_other) > 280) THEN
    RAISE EXCEPTION 'say in a few words how you would like to help (up to 280 characters)' USING ERRCODE = '22023';
  END IF;

  -- "Later" needs a reminder that can still be sent: the same instant send-event-emails uses (start minus 24 hours).
  -- Returned before any write.
  IF p_when = 'later' AND NOT (now() < v_event.datetime - interval '24 hours') THEN
    RETURN 'now_only';
  END IF;

  v_already := EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = v_event.id AND r.profile_id = v_uid);
  IF v_already THEN
    RETURN 'already';
  END IF;
  -- Hikes have no waiting list: at the limit the answer is 'full'. The host does not count.
  IF v_event.max_attendees IS NOT NULL
     AND (SELECT count(*) FROM public.event_rsvps r
           WHERE r.event_id = v_event.id AND r.profile_id IS DISTINCT FROM v_event.host_id) >= v_event.max_attendees THEN
    RETURN 'full';
  END IF;

  INSERT INTO public.event_hike_answers AS a
    (event_id, profile_id, when_choice, transport, free_seats, help, help_other)
  VALUES (v_event.id, v_uid, p_when, p_transport, v_seats, p_help, v_other)
  ON CONFLICT (event_id, profile_id) DO UPDATE
    SET when_choice = EXCLUDED.when_choice, transport = EXCLUDED.transport, free_seats = EXCLUDED.free_seats,
        help = EXCLUDED.help, help_other = EXCLUDED.help_other, created_at = now();
  INSERT INTO public.event_rsvps (event_id, profile_id) VALUES (v_event.id, v_uid);
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.register_for_hike(text, text, text, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_for_hike(text, text, text, integer, text, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 3. The seat guard: every path that creates a registration passes here. The hike branch is added before the
--    sales-mastermind lines, which are copied unchanged.
-- ---------------------------------------------------------------------------------------------------------
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
  IF public._event_flow(NEW.event_id) = 'social-hike' THEN
    IF NEW.profile_id IS DISTINCT FROM (SELECT e.host_id FROM public.events e WHERE e.id = NEW.event_id)
       AND NOT EXISTS (SELECT 1 FROM public.event_hike_answers h
                        WHERE h.event_id = NEW.event_id AND h.profile_id = NEW.profile_id) THEN
      RAISE EXCEPTION 'this hike asks a few questions before registering' USING ERRCODE = 'P0001', HINT = 'answers_required';
    END IF;
    RETURN NEW;
  END IF;
  IF public._event_flow(NEW.event_id) <> 'sales-mastermind' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.event_registration_answers a
                  WHERE a.event_id = NEW.event_id AND a.profile_id = NEW.profile_id) THEN
    RAISE EXCEPTION 'this event asks a few questions before registering' USING ERRCODE = 'P0001', HINT = 'answers_required';
  END IF;
  SELECT e.max_attendees, e.host_id INTO v_max, v_host FROM public.events e WHERE e.id = NEW.event_id FOR UPDATE;
  -- The host may take the event past its limit (founder, UAT round 1: adding someone from the waiting list "may take the event
  -- past its limit: the host decides"). Only host_add_from_waitlist inserts another person's row as the host: the insert policy
  -- on event_rsvps allows only a person's own row, so a host's own direct insert is exempt already as the host.
  IF v_max IS NOT NULL AND NEW.profile_id IS DISTINCT FROM v_host
     AND (SELECT auth.uid()) IS DISTINCT FROM v_host
     AND (SELECT count(*) FROM public.event_rsvps r
           WHERE r.event_id = NEW.event_id AND r.profile_id IS DISTINCT FROM v_host) >= v_max THEN
    RAISE EXCEPTION 'this event is full' USING ERRCODE = 'P0001', HINT = 'full';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._event_rsvps_need_answers() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 4. Cancelling a registration deletes the person's hike answers, so registering again asks again.
-- ---------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._event_rsvps_clear_hike_answers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.event_hike_answers h WHERE h.event_id = OLD.event_id AND h.profile_id = OLD.profile_id;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._event_rsvps_clear_hike_answers() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS event_rsvps_clear_hike_answers ON public.event_rsvps;
CREATE TRIGGER event_rsvps_clear_hike_answers AFTER DELETE ON public.event_rsvps
  FOR EACH ROW EXECUTE FUNCTION public._event_rsvps_clear_hike_answers();

-- ---------------------------------------------------------------------------------------------------------
-- 5. Room counts. Everyone who can see the event gets `not_here` (registered people with no room member row, host excluded).
--    The host alone also gets in / out / undecided over registered people and room members, each counted once, host
--    excluded: the room answer wins, then the preparation answer, else undecided. Numbers only, never names or ids.
-- ---------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_event_room_counts(p_event uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_host uuid;
  v_hidden boolean;
  v_not_here integer;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in to see the room' USING ERRCODE = '42501';
  END IF;
  SELECT e.host_id, e.is_hidden INTO v_host, v_hidden FROM public.events e WHERE e.id = p_event;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event not visible' USING ERRCODE = '42501';
  END IF;
  IF v_hidden AND v_host IS DISTINCT FROM v_uid
     AND NOT EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = p_event AND r.profile_id = v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.event_room_members m WHERE m.event_id = p_event AND m.profile_id = v_uid) THEN
    RAISE EXCEPTION 'event not visible' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::int INTO v_not_here
    FROM public.event_rsvps r
   WHERE r.event_id = p_event AND r.profile_id IS DISTINCT FROM v_host
     AND NOT EXISTS (SELECT 1 FROM public.event_room_members m
                      WHERE m.event_id = p_event AND m.profile_id = r.profile_id);
  v_result := jsonb_build_object('not_here', v_not_here);

  IF v_host IS NOT DISTINCT FROM v_uid THEN
    v_result := v_result || (
      SELECT jsonb_build_object(
               'in', count(*) FILTER (WHERE s.state IS TRUE)::int,
               'out', count(*) FILTER (WHERE s.state IS FALSE)::int,
               'undecided', count(*) FILTER (WHERE s.state IS NULL)::int)
        FROM (
          -- registered people and room members with an account, each once
          SELECT COALESCE(
                   (SELECT m.opted_in FROM public.event_room_members m
                     WHERE m.event_id = p_event AND m.profile_id = p.profile_id AND m.opted_in IS NOT NULL
                     ORDER BY m.joined_at DESC LIMIT 1),
                   (SELECT pr.opted_in FROM public.event_preparations pr
                     WHERE pr.event_id = p_event AND pr.profile_id = p.profile_id)) AS state
            FROM (
              SELECT r.profile_id FROM public.event_rsvps r WHERE r.event_id = p_event
              UNION
              SELECT m.profile_id FROM public.event_room_members m
               WHERE m.event_id = p_event AND m.profile_id IS NOT NULL
            ) p
           WHERE p.profile_id IS DISTINCT FROM v_host
          UNION ALL
          -- walk-ins (no account) are people in the room too
          SELECT m.opted_in AS state FROM public.event_room_members m
           WHERE m.event_id = p_event AND m.profile_id IS NULL
        ) s);
  END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_event_room_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_room_counts(uuid) TO authenticated;

COMMIT;
