-- diffed against: 20261001130000_p1336_review_fixes.sql (the only prior definition of
--   get_event_prep_social_proof besides 20261001120000, which it replaced).
-- P1336 UAT fix (2026-10-01): opt-ins given in past rooms count in the series.
--
-- client-safe: same signature and same jsonb keys; the function body only.
--
-- The series' first night (Clarity Night #1, 2026-09-18) ran the room before preparation existed:
-- every opt-in from it lives in event_room_members, none in event_preparations. Counting prep rows
-- only, step 3b's "{X} people opted in at Clarity Nights" read 0 at the very event it exists for.
--
-- 1. The series is the host's events of the same kind up to this one: for a Clarity Night, every
--    Clarity Night by title (the same /clarity night/i rule the client uses for the "Clarity Nights"
--    label and the create-form default), with or without preparation; for any other event, the
--    host's events with preparation on (unchanged).
-- 2. An opt-in is a prep answer (registered) OR a room answer. A walk-in (no profile) counts as one
--    person and never appears as an avatar. The host is excluded from both sources.
-- 3. Counts are distinct people, not rows: one person opting in at two nights, or in prep and then
--    in the room, is one of the "{X} people".
-- No new exposure: the room roster (with opted_in) is already public (P1114, 2026-08-21), and only
-- opted-in people are counted or shown. The prepared avatars keep the opted-in requirement.

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
        -- Prepared avatars are drawn from people who also opted in: the two lists can never
        -- differ by an opt-out.
        SELECT 'prepared' AS kind, profile_id, max(completed_at) AS at
          FROM preps WHERE completed_at IS NOT NULL AND opted_in IS TRUE GROUP BY profile_id
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
    'preparedPeople', COALESCE((SELECT jsonb_path_query_array(people, '$[0 to 4]') FROM avatars WHERE kind = 'prepared'), '[]'::jsonb),
    'optedInPeople',  COALESCE((SELECT jsonb_path_query_array(people, '$[0 to 4]') FROM avatars WHERE kind = 'opted_in'), '[]'::jsonb)
  )
  WHERE EXISTS (SELECT 1 FROM ev);
$$;
