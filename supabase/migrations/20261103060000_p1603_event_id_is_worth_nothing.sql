-- P1603 review round: an event id must be worth nothing for a hidden event.
-- Created: 2026-11-03
-- Spec: features/p1603_hidden_events_link_only.md
-- Follows: 20261103030000, 20261103040000, 20261103050000 (all P1603 migrations)
--
-- APPLY ORDER: all four P1603 migrations (030000, 040000, 050000, this one) must be applied together, migrations
--   first, BEFORE the client that sets is_hidden ships. The comment in 030000 about an open event_rsvps list describes
--   the state before 040000 and is superseded by it; nothing after this file is open.
--
-- client-safe: every statement is a no-op for an event that is not hidden (every existing event). Hidden events are
--   created only by the new client, which is not deployed before these migrations. Nothing is revoked from anon or
--   authenticated on any existing object; no signature changes. The two banner-listing policies are dropped: public
--   object URLs (/storage/v1/object/public/...) do not use storage.objects policies (both buckets are public), and no
--   code lists these buckets (grep src, supabase/functions, scripts, api: no .list( on storage). Verified on TEST.
--
-- diffed against: (newest definition of each, found by grepping every migration)
--   join_event_room(uuid,text)             20260907130000_p1256_event_grace_interval_12h.sql
--   can_see_event_rounds(uuid)             20261002183700_p1337_event_rounds.sql
--   get_event_research_places_left(uuid)   20261001130000_p1336_review_fixes.sql
--   get_event_community_slug(uuid)         20261002220000_p1389_event_close.sql
--   get_event_series_people(uuid)          20261002220000_p1389_event_close.sql
--   get_event_prep_social_proof(uuid)      20261103050000_p1603_social_proof_hidden_events.sql
--   event_practice_rooms_insert            20260221160452_p406_event_practice_rooms.sql
--   "Users can create sub-rooms as initiator"  20260213_fix_event_sub_rooms_schema.sql
--   storage policies "public can read banners" / "public can read event banners"  20260313141529_p504_banners_bucket.sql
--                                                                                 / 20260309000000_create_event_banners_bucket.sql
-- Each body below is the cited one plus ONLY the lines marked P1603 (long explanatory comments of the cited bodies trimmed).

-- 1. Anonymous listing of the banner buckets (folders are named by event id).
DROP POLICY IF EXISTS "public can read banners" ON storage.objects;
DROP POLICY IF EXISTS "public can read event banners" ON storage.objects;

-- 2. join_event_room: a hidden event is joined only by its host or someone registered through the link.
CREATE OR REPLACE FUNCTION public.join_event_room(p_event_id uuid, p_display_name text)
RETURNS SETOF public.event_room_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_datetime timestamptz;
  v_count integer;
  v_room_cap CONSTANT integer := 1000;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;

  SELECT datetime INTO v_event_datetime FROM public.events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  -- P1603: a hidden event the caller neither hosts nor is registered for answers exactly like an unknown id.
  IF NOT app_private.viewer_sees_event(p_event_id) THEN
    RAISE EXCEPTION 'cannot join this room' USING ERRCODE = '42501';
  END IF;

  IF now() >= v_event_datetime + public.event_grace_interval() THEN
    RAISE EXCEPTION 'this room is closed' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_count FROM public.event_room_members WHERE event_id = p_event_id;
  IF v_count >= v_room_cap THEN
    RAISE EXCEPTION 'this room is full' USING ERRCODE = '54000';
  END IF;

  RETURN QUERY
  INSERT INTO public.event_room_members (event_id, display_name, profile_id)
  VALUES (p_event_id, p_display_name, auth.uid())
  ON CONFLICT (event_id, profile_id) WHERE profile_id IS NOT NULL
    DO UPDATE SET display_name = EXCLUDED.display_name
  RETURNING *;
END;
$$;

-- 3. can_see_event_rounds: room membership alone no longer opens a hidden event's rounds (a removed or cancelled
--    person keeps an event_room_members row but loses the RSVP).
CREATE OR REPLACE FUNCTION public.can_see_event_rounds(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.events e
             WHERE e.id = p_event_id AND e.host_id = (SELECT auth.uid()))
    OR (EXISTS (SELECT 1 FROM public.event_room_members m
                WHERE m.event_id = p_event_id AND m.profile_id = (SELECT auth.uid()))
        AND app_private.viewer_sees_event(p_event_id))   -- P1603
  );
$$;

-- 4. event_practice_rooms / event_sub_rooms inserts: for a hidden event only the host or someone registered.
DROP POLICY IF EXISTS "event_practice_rooms_insert" ON public.event_practice_rooms;
CREATE POLICY "event_practice_rooms_insert"
  ON public.event_practice_rooms FOR INSERT
  WITH CHECK (auth.uid() = creator_id AND app_private.viewer_sees_event(event_id));   -- P1603

DROP POLICY IF EXISTS "Users can create sub-rooms as initiator" ON public.event_sub_rooms;
CREATE POLICY "Users can create sub-rooms as initiator"
  ON public.event_sub_rooms FOR INSERT
  WITH CHECK (auth.uid() = initiator_id AND app_private.viewer_sees_event(event_id));   -- P1603

-- 5. get_event_prep_social_proof: an unauthorised hidden event returns exactly what an unknown id returns (NULL).
--    (Replaces the empty-shape branch of 20261103050000. Clients already read NULL as "show nothing".)
CREATE OR REPLACE FUNCTION public.get_event_prep_social_proof(p_event_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ev AS (
    SELECT id, host_id, datetime, is_hidden, title ILIKE '%clarity night%' AS is_cn
      FROM public.events WHERE id = p_event_id
  ),
  gate AS (
    SELECT (NOT ev.is_hidden
            OR ev.host_id IS NOT DISTINCT FROM (SELECT auth.uid())
            OR app_private.viewer_has_rsvp(ev.id)) AS ok
      FROM ev
  ),
  series AS (
    SELECT e.id FROM public.events e, ev
     WHERE e.host_id = ev.host_id
       AND e.status IS DISTINCT FROM 'cancelled'
       AND e.datetime <= ev.datetime
       AND (e.id = ev.id OR (NOT e.is_hidden
            AND CASE WHEN ev.is_cn THEN e.title ILIKE '%clarity night%' ELSE e.preparation_enabled END))
  ),
  preps AS (
    SELECT p.event_id, p.profile_id, p.completed_at, p.opted_in, p.updated_at
      FROM public.event_preparations p
      JOIN public.event_rsvps r ON r.event_id = p.event_id AND r.profile_id = p.profile_id
      , ev
     WHERE p.event_id IN (SELECT id FROM series)
       AND p.profile_id <> ev.host_id
  ),
  opt_ins AS (
    SELECT event_id, profile_id, profile_id::text AS who, updated_at AS at
      FROM preps WHERE opted_in IS TRUE
    UNION ALL
    SELECT m.event_id, m.profile_id, COALESCE(m.profile_id::text, 'walk-in:' || m.id::text), m.joined_at
      FROM public.event_room_members m, ev
     WHERE m.event_id IN (SELECT id FROM series)
       AND m.opted_in IS TRUE
       AND m.profile_id IS DISTINCT FROM ev.host_id
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
        SELECT 'opted_in', profile_id, max(at)
          FROM opt_ins WHERE profile_id IS NOT NULL GROUP BY profile_id
      ) x
      JOIN public.profiles pr ON pr.id = x.profile_id
     GROUP BY kind
  )
  SELECT jsonb_build_object(
    'preparedThis',  (SELECT count(DISTINCT profile_id) FROM preps WHERE event_id = p_event_id AND completed_at IS NOT NULL),
    'preparedSeries',(SELECT count(DISTINCT profile_id) FROM preps WHERE completed_at IS NOT NULL),
    'optedInThis',   (SELECT count(DISTINCT who) FROM opt_ins WHERE event_id = p_event_id),
    'optedInSeries', (SELECT count(DISTINCT who) FROM opt_ins),
    'preparedPrevious', (SELECT count(DISTINCT profile_id) FROM preps WHERE event_id <> p_event_id AND completed_at IS NOT NULL),
    'optedInPrevious',  (SELECT count(DISTINCT who) FROM opt_ins WHERE event_id <> p_event_id),
    'preparedPeople', COALESCE((SELECT jsonb_path_query_array(people, '$[0 to 4]') FROM avatars WHERE kind = 'prepared'), '[]'::jsonb),
    'optedInPeople',  COALESCE((SELECT jsonb_path_query_array(people, '$[0 to 4]') FROM avatars WHERE kind = 'opted_in'), '[]'::jsonb)
  )
  WHERE EXISTS (SELECT 1 FROM ev) AND (SELECT ok FROM gate);   -- P1603: unauthorised hidden event: no row, NULL, like an unknown id
$$;

-- 6. get_event_research_places_left, get_event_community_slug: NULL for an unauthorised hidden event (like an unknown id).
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
    FROM public.events e WHERE e.id = p_event_id
     AND app_private.viewer_sees_event(e.id);   -- P1603
$$;

CREATE OR REPLACE FUNCTION public.get_event_community_slug(p_event_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT o.slug FROM public.organization o WHERE o.id = public.p1389_community_org(p_event_id)
     AND app_private.viewer_sees_event(p_event_id);   -- P1603
$$;

-- 7. get_event_series_people: never counts a hidden event's people, and counts nothing for an unauthorised hidden event
--    (0, the same as an unknown id: an aggregate over no rows).
CREATE OR REPLACE FUNCTION public.get_event_series_people(p_event_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- A count only, never who. Same series rule as p1389_evenings, events before this one.
  SELECT count(DISTINCT r.profile_id)::integer
  FROM public.events cur
  JOIN public.events e ON e.host_id = cur.host_id
    AND (e.title ILIKE '%clarity night%') = (cur.title ILIKE '%clarity night%')
    AND e.datetime < cur.datetime
    AND e.status IS DISTINCT FROM 'cancelled'
    AND NOT e.is_hidden   -- P1603
  JOIN public.event_rsvps r ON r.event_id = e.id
  WHERE cur.id = p_event_id
    AND app_private.viewer_sees_event(cur.id);   -- P1603
$$;

-- Grants are unchanged by CREATE OR REPLACE; restated so a reader of this file alone knows the surface.
REVOKE ALL ON FUNCTION public.get_event_prep_social_proof(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_prep_social_proof(uuid) TO anon, authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.join_event_room(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_event_series_people(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_event_community_slug(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_event_research_places_left(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.can_see_event_rounds(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1603: a function that was authenticated-only became anon-executable';
  END IF;
  IF NOT has_function_privilege('anon', 'public.get_event_prep_social_proof(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1603: get_event_prep_social_proof lost its anon grant';
  END IF;
END
$$;
