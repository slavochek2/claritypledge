-- new function (every function below is new: no prior definition to diff against)
-- P1336: registration carries the preparation, the opt-in and the R&D survey.
--
-- new tables: event_preparations, person_prep_parts. new columns on events:
--   preparation_enabled, statement_tag, research_places. new functions:
--   get_event_prep_social_proof, get_event_research_places_left, get_event_prep_host_view,
--   and three trigger functions that keep the opt-in answer ONE value across prep and room.
--
-- client-safe: every change is additive. The three events columns have defaults, so every
--   existing `select('*')` keeps working and every existing insert/update keeps succeeding.
--   event_room_members gains triggers only; no room RPC body or signature changes.
--
-- WHY A NEW TABLE AND NOT COLUMNS ON event_rsvps: event_rsvps is `SELECT USING (true)`
-- (20260118_create_events.sql:70-71), so any column added there is world-readable. Prep
-- answers include opt-outs, a 0-10 score and research consent — none may ever be public.
--
-- ONE OPT-IN VALUE (spec Data: "canonical owner = the prep row"):
--   * room row INSERT (join_event_room) is seeded from the prep row       (trg_seed_room_from_prep)
--   * room row opt-in change writes back to the prep row, new timestamp   (trg_room_opt_in_to_prep)
--   * prep row opt-in change reaches an EXISTING room row                 (trg_prep_opt_in_to_room)
-- Each sync writes only when the target value IS DISTINCT, so the pair of update triggers
-- terminates after one hop. Walk-ins (profile_id NULL) and people without a prep row are
-- untouched: the room's existing flow.

-- ============================================================================
-- 1. Per-event setup on events (public, non-sensitive)
-- ============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS preparation_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS statement_tag TEXT
    CHECK (statement_tag IS NULL OR statement_tag ~ '^[a-z0-9][a-z0-9_-]{0,49}$'),
  ADD COLUMN IF NOT EXISTS research_places INTEGER NOT NULL DEFAULT 6
    CHECK (research_places >= 0);

COMMENT ON COLUMN public.events.preparation_enabled IS
  'P1336: show the post-RSVP preparation flow and the room gate. Defaulted by series on create (Clarity Night on, hikes off).';
COMMENT ON COLUMN public.events.statement_tag IS
  'P1336: the point tag the positions step reads. NULL = no positions step.';
COMMENT ON COLUMN public.events.research_places IS
  'P1336: recording-volunteer places shown as "{left} of {n}". Changed via SQL only (no UI).';

-- Upcoming Clarity Nights get preparation; the series default the create form applies.
UPDATE public.events
   SET preparation_enabled = true
 WHERE title ILIKE '%clarity night%'
   AND status = 'upcoming'
   AND datetime > now();

-- ============================================================================
-- 2. event_preparations — one row per (profile, event)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_preparations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rsvp_id UUID REFERENCES public.event_rsvps(id) ON DELETE SET NULL,

  prep_choice TEXT CHECK (prep_choice IN ('now', 'remind')),

  -- Resume point (replaces the prototype's localStorage) and the steps finished.
  current_step TEXT CHECK (current_step IN ('plan', 'welcome', 'story', 'principle', 'cmp7', 'stake', 'research')),
  steps_done TEXT[] NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  opted_in BOOLEAN,
  opted_in_at TIMESTAMPTZ,
  principle_rating SMALLINT CHECK (principle_rating IS NULL OR principle_rating BETWEEN 0 AND 10),

  -- eligible = said Yes, mic not answered yet; confirmed = mic usbc/own; declined = No, or mic none.
  research_state TEXT CHECK (research_state IN ('eligible', 'confirmed', 'declined')),
  mic_setup TEXT CHECK (mic_setup IN ('usbc', 'own', 'none')),
  research_consented_at TIMESTAMPTZ,
  research_policy_version TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, profile_id),
  -- Consent is written with the Yes, never without its version.
  CHECK ((research_consented_at IS NULL) = (research_policy_version IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_event_preparations_event ON public.event_preparations(event_id);

COMMENT ON TABLE public.event_preparations IS
  'P1336: per-registration preparation. Private: owner + event host only. Public counts come from get_event_prep_social_proof, which never returns opt-outs, scores or volunteer data.';

ALTER TABLE public.event_preparations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_preparations FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.event_preparations TO authenticated;

CREATE POLICY "Owner reads own preparation"
  ON public.event_preparations FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()));

CREATE POLICY "Host reads preparations of their event"
  ON public.event_preparations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events e
     WHERE e.id = event_preparations.event_id AND e.host_id = (SELECT auth.uid())
  ));

-- Insert only for an event the caller is registered for.
CREATE POLICY "Registrant creates own preparation"
  ON public.event_preparations FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.event_rsvps r
       WHERE r.event_id = event_preparations.event_id AND r.profile_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Owner updates own preparation"
  ON public.event_preparations FOR UPDATE TO authenticated
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));

-- event_id / profile_id / rsvp_id are identity, not answers: never re-pointed by an update.
CREATE OR REPLACE FUNCTION public.p1336_prep_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.event_id IS DISTINCT FROM OLD.event_id OR NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
      RAISE EXCEPTION 'a preparation cannot move to another event or person' USING ERRCODE = '42501';
    END IF;
    NEW.created_at := OLD.created_at;
    NEW.rsvp_id := OLD.rsvp_id;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.rsvp_id IS NULL THEN
    SELECT r.id INTO NEW.rsvp_id FROM public.event_rsvps r
     WHERE r.event_id = NEW.event_id AND r.profile_id = NEW.profile_id;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.opted_in IS DISTINCT FROM OLD.opted_in THEN
    NEW.opted_in_at := CASE WHEN NEW.opted_in IS NULL THEN NULL ELSE now() END;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_p1336_prep_guard ON public.event_preparations;
CREATE TRIGGER trg_p1336_prep_guard
  BEFORE INSERT OR UPDATE ON public.event_preparations
  FOR EACH ROW EXECUTE FUNCTION public.p1336_prep_guard();

-- ============================================================================
-- 3. person_prep_parts — once-per-person parts, versioned
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.person_prep_parts (
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  part TEXT NOT NULL CHECK (part IN ('intro_video', 'cognitive_video', 'principle_intro', 'cmp7')),
  -- The content version completed_at refers to. Bumping the version in code re-shows the part.
  content_version INTEGER NOT NULL CHECK (content_version >= 1),
  completed_at TIMESTAMPTZ,
  -- Skipped is recorded separately and is NOT completed.
  skipped_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, part)
);

ALTER TABLE public.person_prep_parts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.person_prep_parts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.person_prep_parts TO authenticated;

CREATE POLICY "Owner reads own prep parts"
  ON public.person_prep_parts FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()));
CREATE POLICY "Owner creates own prep parts"
  ON public.person_prep_parts FOR INSERT TO authenticated
  WITH CHECK (profile_id = (SELECT auth.uid()));
CREATE POLICY "Owner updates own prep parts"
  ON public.person_prep_parts FOR UPDATE TO authenticated
  USING (profile_id = (SELECT auth.uid()))
  WITH CHECK (profile_id = (SELECT auth.uid()));

-- ============================================================================
-- 4. Public social proof — counts + avatars of PREPARED / OPTED-IN people only
-- ============================================================================
-- Series = this host's preparation events up to and including this one (not cancelled).
-- The host is excluded from every count (decisions.md 2026-09-21).
-- Returns no opt-out, no score, no volunteer data — by construction: those columns are
-- never selected.

CREATE OR REPLACE FUNCTION public.get_event_prep_social_proof(p_event_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ev AS (
    SELECT id, host_id, datetime FROM public.events WHERE id = p_event_id
  ),
  series AS (
    SELECT e.id FROM public.events e, ev
     WHERE e.host_id = ev.host_id
       AND e.preparation_enabled
       AND e.status IS DISTINCT FROM 'cancelled'
       AND e.datetime <= ev.datetime
  ),
  preps AS (
    SELECT p.event_id, p.profile_id, p.completed_at, p.opted_in, p.updated_at
      FROM public.event_preparations p, ev
     WHERE p.event_id IN (SELECT id FROM series)
       AND p.profile_id <> ev.host_id
  ),
  avatars AS (
    SELECT kind, jsonb_agg(jsonb_build_object(
             'profileId', pr.id, 'name', pr.name, 'slug', pr.slug,
             'avatarColor', pr.avatar_color, 'avatarUrl', pr.avatar_url,
             'hasPledged', COALESCE(pr.has_pledged, false)
           ) ORDER BY x.at DESC) AS people
      FROM (
        SELECT 'prepared' AS kind, profile_id, max(completed_at) AS at
          FROM preps WHERE completed_at IS NOT NULL GROUP BY profile_id
        UNION ALL
        SELECT 'opted_in', profile_id, max(updated_at)
          FROM preps WHERE opted_in IS TRUE GROUP BY profile_id
      ) x
      JOIN public.profiles pr ON pr.id = x.profile_id
     GROUP BY kind
  )
  SELECT jsonb_build_object(
    'preparedThis',  (SELECT count(*) FROM preps WHERE event_id = p_event_id AND completed_at IS NOT NULL),
    'preparedSeries',(SELECT count(*) FROM preps WHERE completed_at IS NOT NULL),
    'optedInThis',   (SELECT count(*) FROM preps WHERE event_id = p_event_id AND opted_in IS TRUE),
    'optedInSeries', (SELECT count(*) FROM preps WHERE opted_in IS TRUE),
    'preparedPeople', COALESCE((SELECT jsonb_path_query_array(people, '$[0 to 4]') FROM avatars WHERE kind = 'prepared'), '[]'::jsonb),
    'optedInPeople',  COALESCE((SELECT jsonb_path_query_array(people, '$[0 to 4]') FROM avatars WHERE kind = 'opted_in'), '[]'::jsonb)
  )
  WHERE EXISTS (SELECT 1 FROM ev);
$$;

REVOKE ALL ON FUNCTION public.get_event_prep_social_proof(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_prep_social_proof(uuid) TO anon, authenticated;

-- Places left, floored at 1: overbooking is accepted (founder 2026-10-01), so the number
-- never reads 0 and "Yes, sure" always stays available. A single derived number, no rows.
CREATE OR REPLACE FUNCTION public.get_event_research_places_left(p_event_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT GREATEST(1, e.research_places - (
           SELECT count(*)::int FROM public.event_preparations p
            WHERE p.event_id = e.id AND p.research_state = 'confirmed' AND p.profile_id <> e.host_id))
    FROM public.events e WHERE e.id = p_event_id;
$$;

REVOKE ALL ON FUNCTION public.get_event_research_places_left(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_research_places_left(uuid) TO authenticated;

-- ============================================================================
-- 5. Host view — one row per registrant (host excluded), host-only
-- ============================================================================
-- positions_done counts the registrant's positions on the event's statement_tag points.
-- SECURITY DEFINER because point_positions of other people are not the host's to read
-- row by row; the function returns only the count, and only to the host.

CREATE OR REPLACE FUNCTION public.get_event_prep_host_view(p_event_id uuid)
RETURNS TABLE (
  profile_id uuid,
  name text,
  slug text,
  avatar_color text,
  avatar_url text,
  has_pledged boolean,
  prep_choice text,
  steps_done text[],
  started_at timestamptz,
  completed_at timestamptz,
  opted_in boolean,
  principle_rating smallint,
  research_state text,
  mic_setup text,
  positions_done integer,
  positions_total integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host uuid;
  v_tag text;
BEGIN
  SELECT e.host_id, e.statement_tag INTO v_host, v_tag FROM public.events e WHERE e.id = p_event_id;
  IF v_host IS NULL OR v_host IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'only the host can see preparations' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH tag_points AS (
    SELECT pt.id FROM public.points pt
     WHERE v_tag IS NOT NULL AND (v_tag = ANY (pt.tags) OR v_tag = ANY (pt.system_tags))
  )
  SELECT r.profile_id, pr.name, pr.slug, pr.avatar_color, pr.avatar_url,
         COALESCE(pr.has_pledged, false),
         p.prep_choice, COALESCE(p.steps_done, '{}'), p.started_at, p.completed_at,
         p.opted_in, p.principle_rating, p.research_state, p.mic_setup,
         (SELECT count(*)::int FROM public.point_positions pp
           WHERE pp.user_id = r.profile_id AND pp.point_id IN (SELECT id FROM tag_points)),
         (SELECT count(*)::int FROM tag_points)
    FROM public.event_rsvps r
    JOIN public.profiles pr ON pr.id = r.profile_id
    LEFT JOIN public.event_preparations p ON p.event_id = r.event_id AND p.profile_id = r.profile_id
   WHERE r.event_id = p_event_id
     AND r.profile_id <> v_host
   ORDER BY r.rsvped_at;
END;
$$;

REVOKE ALL ON FUNCTION public.get_event_prep_host_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_prep_host_view(uuid) TO authenticated;

-- ============================================================================
-- 6. One opt-in value across prep and room
-- ============================================================================

-- Room row created (join_event_room): seed the answer — and the 0-10 given for it — from
-- the prep row, and record the seeded answer in the room's append-only history exactly as
-- a tap would (cascade_count computed here, never from a client).
CREATE OR REPLACE FUNCTION public.p1336_seed_room_from_prep()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prep public.event_preparations;
BEGIN
  IF NEW.profile_id IS NULL OR NEW.opted_in IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_prep FROM public.event_preparations
   WHERE event_id = NEW.event_id AND profile_id = NEW.profile_id;
  IF FOUND AND v_prep.opted_in IS NOT NULL THEN
    NEW.opted_in := v_prep.opted_in;
    NEW.comprehension_rating := v_prep.principle_rating;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.p1336_record_seeded_room_answer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cascade integer;
BEGIN
  IF NEW.opted_in IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.event_id::text)::bigint);
  SELECT count(*) INTO v_cascade FROM public.event_room_members
   WHERE event_id = NEW.event_id AND opted_in = true AND id <> NEW.id;
  INSERT INTO public.event_room_answers (room_member_id, opted_in, cascade_count)
  VALUES (NEW.id, NEW.opted_in, v_cascade);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_p1336_seed_room_from_prep ON public.event_room_members;
CREATE TRIGGER trg_p1336_seed_room_from_prep
  BEFORE INSERT ON public.event_room_members
  FOR EACH ROW EXECUTE FUNCTION public.p1336_seed_room_from_prep();

DROP TRIGGER IF EXISTS trg_p1336_record_seeded_room_answer ON public.event_room_members;
CREATE TRIGGER trg_p1336_record_seeded_room_answer
  AFTER INSERT ON public.event_room_members
  FOR EACH ROW EXECUTE FUNCTION public.p1336_record_seeded_room_answer();

-- Room answer or its rating changed (set_room_opt_in / set_room_rating / reset_room_answer):
-- write back to the prep row.
-- opted_in_at is restamped by p1336_prep_guard.
CREATE OR REPLACE FUNCTION public.p1336_room_opt_in_to_prep()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- The rating arrives after the tap (set_room_rating), so it is synced too.
  IF NEW.profile_id IS NOT NULL
     AND (NEW.opted_in IS DISTINCT FROM OLD.opted_in
          OR NEW.comprehension_rating IS DISTINCT FROM OLD.comprehension_rating) THEN
    UPDATE public.event_preparations
       SET opted_in = NEW.opted_in,
           principle_rating = NEW.comprehension_rating
     WHERE event_id = NEW.event_id AND profile_id = NEW.profile_id
       AND (opted_in IS DISTINCT FROM NEW.opted_in
            OR principle_rating IS DISTINCT FROM NEW.comprehension_rating);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_p1336_room_opt_in_to_prep ON public.event_room_members;
CREATE TRIGGER trg_p1336_room_opt_in_to_prep
  AFTER UPDATE OF opted_in, comprehension_rating ON public.event_room_members
  FOR EACH ROW EXECUTE FUNCTION public.p1336_room_opt_in_to_prep();

-- Prep answer changed while a room row already exists (bypassed the gate, prepared later):
-- reach the room row, with the same history row a room tap writes.
CREATE OR REPLACE FUNCTION public.p1336_prep_opt_in_to_room()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member public.event_room_members;
  v_cascade integer;
BEGIN
  IF NEW.opted_in IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_member FROM public.event_room_members
   WHERE event_id = NEW.event_id AND profile_id = NEW.profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_member.opted_in IS DISTINCT FROM NEW.opted_in THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.event_id::text)::bigint);
    SELECT count(*) INTO v_cascade FROM public.event_room_members
     WHERE event_id = NEW.event_id AND opted_in = true;
    INSERT INTO public.event_room_answers (room_member_id, opted_in, cascade_count)
    VALUES (v_member.id, NEW.opted_in, v_cascade);
    UPDATE public.event_room_members
       SET opted_in = NEW.opted_in, comprehension_rating = NEW.principle_rating
     WHERE id = v_member.id;
  ELSIF v_member.comprehension_rating IS DISTINCT FROM NEW.principle_rating THEN
    -- Same answer, the 0-10 given in prep arrived after the tap.
    UPDATE public.event_room_members
       SET comprehension_rating = NEW.principle_rating
     WHERE id = v_member.id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_p1336_prep_opt_in_to_room ON public.event_preparations;
CREATE TRIGGER trg_p1336_prep_opt_in_to_room
  AFTER INSERT OR UPDATE OF opted_in, principle_rating ON public.event_preparations
  FOR EACH ROW EXECUTE FUNCTION public.p1336_prep_opt_in_to_room();

-- Trigger functions are not client-callable.
REVOKE ALL ON FUNCTION public.p1336_prep_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.p1336_seed_room_from_prep() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.p1336_record_seeded_room_answer() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.p1336_room_opt_in_to_prep() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.p1336_prep_opt_in_to_room() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 7. Clips bucket — public read, written by the operator (service role) only
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('p1336-clips', 'p1336-clips', true)
ON CONFLICT (id) DO NOTHING;
