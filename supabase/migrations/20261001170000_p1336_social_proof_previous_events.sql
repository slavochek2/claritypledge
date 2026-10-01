-- diffed against: 20261001140000_p1336_social_proof_room_history.sql (the latest definition of
--   get_event_prep_social_proof).
-- P1336 founder UAT round 3 (2026-10-01): "previous events" counts, and a face for every prepared person.
--
-- client-safe: the existing jsonb keys keep their meaning; two keys are added; the "prepared" avatar
-- list widens.
--
-- 1. preparedPrevious / optedInPrevious: distinct people at the series' EARLIER events only. The line
--    now reads "12 people opted in at previous Clarity Nights, and 1 for this event" — two scopes that
--    never overlap in wording, so nobody reads one number as part of the other.
-- 2. The "prepared" faces are every prepared person (registered, host excluded), not only those who
--    also opted in. "3 people prepared" beside one face read as a bug (founder, twice). The opt-in
--    filter existed so the two avatar lists could not hint at an opt-out; the founder has since decided
--    opt-outs are visible (in the room roster), so the hint protects nothing that is not shown anyway.

CREATE OR REPLACE FUNCTION public.get_event_prep_social_proof(p_event_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ev AS (
    SELECT id, host_id, datetime, title ILIKE '%clarity night%' AS is_cn
      FROM public.events WHERE id = p_event_id
  ),
  series AS (
    SELECT e.id FROM public.events e, ev
     WHERE e.host_id = ev.host_id
       AND e.status IS DISTINCT FROM 'cancelled'
       AND e.datetime <= ev.datetime
       AND (e.id = ev.id OR CASE WHEN ev.is_cn THEN e.title ILIKE '%clarity night%' ELSE e.preparation_enabled END)
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
        -- Every prepared person has a face (founder, 2026-10-01): opt-outs are visible in the room.
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
  WHERE EXISTS (SELECT 1 FROM ev);
$$;
