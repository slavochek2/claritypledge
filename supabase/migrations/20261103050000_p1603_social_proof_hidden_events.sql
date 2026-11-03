-- P1603: get_event_prep_social_proof must not leak a hidden event.
-- Created: 2026-11-03
-- Spec: features/p1603_hidden_events_link_only.md
-- Follows: 20261103040000_p1603_hidden_event_ids_private.sql (app_private.viewer_has_rsvp)
--
-- diffed against: 20261001170000_p1336_social_proof_previous_events.sql (the latest definition of
--   get_event_prep_social_proof; grants last set in 20261001120000_p1336_event_preparations.sql: anon, authenticated).
-- Changes vs that definition, and only these:
--   1. ev carries is_hidden; a new `gate` CTE is true when the event is not hidden, or the caller is its host, or the
--      caller holds an RSVP for it (app_private.viewer_has_rsvp). When it is false the function returns the same-shaped
--      object with zero counts and empty people lists, so it does not say whether the id is a hidden event.
--   2. `series` never includes ANOTHER hidden event (e.is_hidden is false, unless e.id is the requested event), so a
--      hidden event's people and counts are never added to a public event's series, nor to another hidden event's.
-- Everything else (keys, counts, avatar lists, SECURITY DEFINER, search_path) is carried over unchanged.
--
-- client-safe: same signature and same jsonb keys for every event that is not hidden (every existing event); only a
--   hidden event, which no deployed client can create yet, gets the empty shape for a viewer who is neither host nor
--   registered. The grant is restated unchanged (anon, authenticated).
--
-- Other anon-executable functions that take an event id (checked on TEST in pg_proc with has_function_privilege):
--   get_practice_room_codes(uuid): already returns nothing unless the caller is signed in AND host or RSVP'd (P1314); a
--   hidden event is joined only through rsvp_to_event_by_slug, so no change. The remaining anon functions with a uuid
--   parameter take session, letter, profile, agreement or canvas-owner ids, not an event id.

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
  SELECT CASE WHEN (SELECT ok FROM gate) THEN jsonb_build_object(
    'preparedThis',  (SELECT count(DISTINCT profile_id) FROM preps WHERE event_id = p_event_id AND completed_at IS NOT NULL),
    'preparedSeries',(SELECT count(DISTINCT profile_id) FROM preps WHERE completed_at IS NOT NULL),
    'optedInThis',   (SELECT count(DISTINCT who) FROM opt_ins WHERE event_id = p_event_id),
    'optedInSeries', (SELECT count(DISTINCT who) FROM opt_ins),
    'preparedPrevious', (SELECT count(DISTINCT profile_id) FROM preps WHERE event_id <> p_event_id AND completed_at IS NOT NULL),
    'optedInPrevious',  (SELECT count(DISTINCT who) FROM opt_ins WHERE event_id <> p_event_id),
    'preparedPeople', COALESCE((SELECT jsonb_path_query_array(people, '$[0 to 4]') FROM avatars WHERE kind = 'prepared'), '[]'::jsonb),
    'optedInPeople',  COALESCE((SELECT jsonb_path_query_array(people, '$[0 to 4]') FROM avatars WHERE kind = 'opted_in'), '[]'::jsonb)
  ) ELSE jsonb_build_object(
    'preparedThis', 0, 'preparedSeries', 0, 'optedInThis', 0, 'optedInSeries', 0,
    'preparedPrevious', 0, 'optedInPrevious', 0,
    'preparedPeople', '[]'::jsonb, 'optedInPeople', '[]'::jsonb
  ) END
  WHERE EXISTS (SELECT 1 FROM ev);
$$;

REVOKE ALL ON FUNCTION public.get_event_prep_social_proof(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_prep_social_proof(uuid) TO anon, authenticated;
