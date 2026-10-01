-- diffed against: 20261001120000_p1336_event_preparations.sql (same feature, same day; that
--   migration is the only prior definition of every function below).
-- P1336 code-review fixes (2026-10-01).
--
-- client-safe: no table, column or signature changes; trigger/function bodies and grants only.
--
-- 1. A prep answer reaching the room no longer writes event_room_answers. That table is the
--    room's own answer history, and its cascade_count means "who had opted in at the moment of
--    THIS tap" (P1114 Decision 6). An answer given in prep days earlier, recorded at room-join
--    time, would read as a cascade that never happened. The prep answer's own time is
--    event_preparations.opted_in_at. Seeding (on join) and the prep→room sync still set the
--    room row's current answer — one value — they just do not invent room history for it.
-- 2. prep→room respects the room's freeze boundary (event start + event_grace_interval()), like
--    every room RPC: after the room closes, editing the prep row cannot rewrite the frozen roster.
-- 3. prep→room takes the room row with SKIP LOCKED. The room RPC path locks room row → prep row;
--    this path locked prep row → room row. Opposite orders deadlock on two devices at once. If a
--    room write holds the row, that write already carries its answer back to prep.
-- 4. rsvp_id is always derived on insert (a client-supplied id is ignored).
-- 5. Social proof and places-left count only people still registered (a cancelled RSVP no longer
--    counts), and the "prepared" avatars show only people who also opted in — so the difference
--    between the two avatar lists can never name an opt-out.
-- 6. get_event_research_places_left: explicit REVOKE from anon (a role-direct grant survives a
--    PUBLIC-only revoke).

DROP TRIGGER IF EXISTS trg_p1336_record_seeded_room_answer ON public.event_room_members;
DROP FUNCTION IF EXISTS public.p1336_record_seeded_room_answer();

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
  IF TG_OP = 'INSERT' THEN
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

CREATE OR REPLACE FUNCTION public.p1336_prep_opt_in_to_room()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_member public.event_room_members;
  v_event_datetime timestamptz;
BEGIN
  IF NEW.opted_in IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT datetime INTO v_event_datetime FROM public.events WHERE id = NEW.event_id;
  IF v_event_datetime IS NULL OR now() >= v_event_datetime + public.event_grace_interval() THEN
    RETURN NULL; -- the room is frozen
  END IF;
  SELECT * INTO v_member FROM public.event_room_members
   WHERE event_id = NEW.event_id AND profile_id = NEW.profile_id
   FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_member.opted_in IS DISTINCT FROM NEW.opted_in THEN
    UPDATE public.event_room_members
       SET opted_in = NEW.opted_in, comprehension_rating = NEW.principle_rating
     WHERE id = v_member.id;
  ELSIF v_member.comprehension_rating IS DISTINCT FROM NEW.principle_rating THEN
    UPDATE public.event_room_members
       SET comprehension_rating = NEW.principle_rating
     WHERE id = v_member.id;
  END IF;
  RETURN NULL;
END;
$$;

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
      FROM public.event_preparations p
      JOIN public.event_rsvps r ON r.event_id = p.event_id AND r.profile_id = p.profile_id
      , ev
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
        -- Prepared avatars are drawn from people who also opted in: the two lists can never
        -- differ by an opt-out.
        SELECT 'prepared' AS kind, profile_id, max(completed_at) AS at
          FROM preps WHERE completed_at IS NOT NULL AND opted_in IS TRUE GROUP BY profile_id
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

CREATE OR REPLACE FUNCTION public.get_event_research_places_left(p_event_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT GREATEST(1, e.research_places - (
           SELECT count(*)::int FROM public.event_preparations p
             JOIN public.event_rsvps r ON r.event_id = p.event_id AND r.profile_id = p.profile_id
            WHERE p.event_id = e.id AND p.research_state = 'confirmed' AND p.profile_id <> e.host_id))
    FROM public.events e WHERE e.id = p_event_id;
$$;

REVOKE ALL ON FUNCTION public.get_event_research_places_left(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_research_places_left(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.p1336_prep_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.p1336_prep_opt_in_to_room() FROM PUBLIC, anon, authenticated;
