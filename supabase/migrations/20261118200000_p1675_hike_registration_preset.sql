-- P1675 UAT round 3, R18: one "before the seat" setting per hike, replacing R6's two booleans. The preset says what a hike asks
-- before the seat: nothing (one tap, as before P1675), the when question only, when and how they are coming, or everything.
--
-- client-safe: adds one column with a default (every existing hike keeps asking everything unless its two booleans said
--   otherwise, backfilled below), replaces register_for_hike (same signature, same grants) and the seat trigger function, then
--   drops the two booleans. On TEST the client of the previous build still sends hike_asks_* on an Edit event save of a hike;
--   that write fails after the drop, so ship the client with this migration. On prod no P1675 migration has run yet, so the
--   two booleans are added (20261117210000) and dropped here in one deploy and no prod client ever sent them; the prod risk is
--   20261117120000's seat trigger, which refuses the old one-tap hike registration: apply the P1675 migrations together with
--   the client deploy (review fix, Opus).
--   The backfill touches only rows not already at the default and runs only while both booleans exist (re-run safe).
-- diffed against: 20261117210000_p1675_hike_questions_per_event.sql (register_for_hike; the new lines are the preset read, the
--   'optional' return and the three storage branches keyed on the preset instead of the two booleans),
--   20261117120000_p1675_hike_registration.sql (_event_rsvps_need_answers; only the hike branch changes, the mastermind lines
--   are identical).

-- 1. The preset: an ordinary public event setting, not personal data. Ignored for events that are not hikes.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS hike_registration text NOT NULL DEFAULT 'all'
  CHECK (hike_registration IN ('optional', 'when', 'when_transport', 'all'));
COMMENT ON COLUMN public.events.hike_registration IS
  'P1675 R18: what a hike asks before the seat. optional = one tap, no form and no answers row; when = the when question only; when_transport = when and how they are coming; all = every question (the default). Ignored for events that are not hikes.';

-- Backfill from R6's two booleans: both on -> all; transport only -> when_transport; neither -> when; help only -> all
-- (a TEST-only state: R6 never reached prod, and the preset has no "help without transport" choice).
-- Only while both booleans still exist (step 4 drops them), so a re-run neither fails nor overwrites a preset a host chose since;
-- dynamic SQL, because a static UPDATE naming a dropped column fails to parse even when the branch is skipped.
DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'events'
         AND column_name IN ('hike_asks_transport', 'hike_asks_help')) = 2 THEN
    EXECUTE $backfill$
UPDATE public.events SET hike_registration = CASE
  WHEN hike_asks_transport AND hike_asks_help THEN 'all'
  WHEN hike_asks_transport AND NOT hike_asks_help THEN 'when_transport'
  WHEN NOT hike_asks_transport AND NOT hike_asks_help THEN 'when'
  ELSE 'all'
END
WHERE NOT (hike_asks_transport AND hike_asks_help)
    $backfill$;
  END IF;
END $$;

-- 2. register_for_hike reads the event's preset instead of the two booleans.
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
  v_transport text;
  v_help text;
  v_seats integer;
  v_other text;
  v_asks_transport boolean;
  v_asks_help boolean;
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

  -- An optional hike registers in one tap and has no form: a form left open when the host switched to optional is refused with a
  -- distinct code, before any write (the client shows its generic retry toast).
  IF v_event.hike_registration = 'optional' THEN
    RETURN 'optional';
  END IF;
  v_asks_transport := v_event.hike_registration IN ('when_transport', 'all');
  v_asks_help := v_event.hike_registration = 'all';

  -- Already registered: nothing changes (answers are not editable after the seat), whatever was sent.
  IF EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = v_event.id AND r.profile_id = v_uid) THEN
    RETURN 'already';
  END IF;

  -- Explicit value checks, so a bad answer raises 22023 and nothing is saved (the table CHECKs are the second wall).
  IF p_when IS NULL OR p_when NOT IN ('now', 'later') THEN
    RAISE EXCEPTION 'choose when you will do the introduction' USING ERRCODE = '22023';
  END IF;

  -- Transport: asked = required as before; not asked = stored NULL (with its seats) whatever the client sent.
  IF v_asks_transport THEN
    IF p_transport IS NULL OR p_transport NOT IN ('car', 'motorbike', 'bike_or_foot', 'need_ride') THEN
      RAISE EXCEPTION 'choose how you are coming' USING ERRCODE = '22023';
    END IF;
    v_transport := p_transport;
    v_seats := CASE WHEN v_transport IN ('car', 'motorbike') THEN p_free_seats END;
    IF v_transport IN ('car', 'motorbike') AND (v_seats IS NULL OR v_seats < 0 OR v_seats > 20) THEN
      RAISE EXCEPTION 'free seats must be a whole number from 0 to 20' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_transport := NULL;
    v_seats := NULL;
  END IF;

  -- Help: asked = validated as before; not asked = help and Other stored NULL.
  IF v_asks_help THEN
    IF p_help IS NOT NULL AND p_help NOT IN ('lead', 'sweep', 'welcomer', 'transport_lead', 'other') THEN
      RAISE EXCEPTION 'unknown way to help' USING ERRCODE = '22023';
    END IF;
    v_help := p_help;
    -- Transport lead is for people who need a ride; with transport not asked there is no ride answer, so it is refused.
    IF v_help = 'transport_lead' AND v_transport IS DISTINCT FROM 'need_ride' THEN
      RAISE EXCEPTION 'transport lead is for people who need a ride' USING ERRCODE = '22023';
    END IF;
    v_other := CASE WHEN v_help = 'other' THEN NULLIF(btrim(COALESCE(p_help_other, '')), '') END;
    IF v_help = 'other' AND (v_other IS NULL OR length(v_other) > 280) THEN
      RAISE EXCEPTION 'say in a few words how you would like to help (up to 280 characters)' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_help := NULL;
    v_other := NULL;
  END IF;

  -- "Later" needs a reminder that will really be sent. The reminder is due at start minus 24 hours, and the dispatcher
  -- (cron every 30 minutes) only picks up a reminder whose time is still ahead, so "later" closes 30 minutes before that.
  -- Returned before any write.
  IF p_when = 'later' AND NOT (now() < v_event.datetime - interval '24 hours 30 minutes') THEN
    RETURN 'now_only';
  END IF;

  -- Hikes have no waiting list: at the limit the answer is 'full'. The host does not count.
  IF v_event.max_attendees IS NOT NULL
     AND (SELECT count(*) FROM public.event_rsvps r
           WHERE r.event_id = v_event.id AND r.profile_id IS DISTINCT FROM v_event.host_id) >= v_event.max_attendees THEN
    RETURN 'full';
  END IF;

  INSERT INTO public.event_hike_answers AS a
    (event_id, profile_id, when_choice, transport, free_seats, help, help_other, asked_help)
  VALUES (v_event.id, v_uid, p_when, v_transport, v_seats, v_help, v_other, v_asks_help)
  ON CONFLICT (event_id, profile_id) DO UPDATE
    SET when_choice = EXCLUDED.when_choice, transport = EXCLUDED.transport, free_seats = EXCLUDED.free_seats,
        help = EXCLUDED.help, help_other = EXCLUDED.help_other, asked_help = EXCLUDED.asked_help, created_at = now();
  INSERT INTO public.event_rsvps (event_id, profile_id) VALUES (v_event.id, v_uid);
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.register_for_hike(text, text, text, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_for_hike(text, text, text, integer, text, text) TO authenticated;

-- 3. The seat guard: an answers row is required before a hike seat only when the hike's preset is not 'optional'. The mastermind
--    lines are copied unchanged.
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
    IF (SELECT e.hike_registration FROM public.events e WHERE e.id = NEW.event_id) <> 'optional'
       AND NEW.profile_id IS DISTINCT FROM (SELECT e.host_id FROM public.events e WHERE e.id = NEW.event_id)
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

-- 4. Drop R6's two booleans: nothing reads them any more (the two functions above were the last server readers).
ALTER TABLE public.events
  DROP COLUMN IF EXISTS hike_asks_transport,
  DROP COLUMN IF EXISTS hike_asks_help;
COMMENT ON COLUMN public.event_hike_answers.asked_help IS
  'P1675 R6/R18: the event asked the help question when this person registered (true only when events.hike_registration was ''all'' at that moment, written by register_for_hike). help NULL with asked_help true = Participant; with asked_help false = not asked.';
