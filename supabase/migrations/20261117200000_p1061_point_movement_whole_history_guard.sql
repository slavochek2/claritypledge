-- Migration: P1061 -- get_point_movement_rows answers only for a point whose whole history the caller reads
-- Created: 2026-11-17
-- Spec: features/p1061_point_position_movement_analytics.md (Invariants)
-- Guaranteed by: scripts/test-p1061-movement-visibility.sh (probe point_guard_non_validator, P1061_CONTROL_UNGUARDED=1)
-- Diffed against: 20261117190000_p1061_movement_reads_whole_rows_only.sql (the latest definition of this function).
--   The only change is the WHERE on the pt step; every other line is copied unchanged.
-- client-safe: same signature and return shape; it returns a subset of what it returned before (for a point outside
--   the rule: point_id null and every list empty, which the client already maps to an empty Changes view).
--
-- WHY. The function is SECURITY INVOKER, so it never shows a row the caller cannot select. But a caller can select
--   SOME of a non-public point's history without all of it (their own rows; the shared rows of a chat-shared point),
--   and a Changes view built from part of the rows is a wrong number shown as fact. Until now only the point page
--   held this rule (readsAllHistory asks for the read only when the point is public or the caller validated it). The
--   founder approved the same rule in the function as a backup (decisions.md 2026-11-17 [technical], P1061 (4)):
--   a point that is not public and that the caller is not the first validator of returns no rows.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_point_movement_rows(p_point_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH pt AS (
    -- only a point whose history the caller reads whole: public, or they are its first validator
    SELECT p.id FROM public.points p
     WHERE p.id = p_point_id
       AND (p.visibility = 'public'::public.content_visibility OR p.first_validator_id = (SELECT auth.uid()))
  ),
  holders AS (
    SELECT pp.user_id, pp.position
      FROM public.point_positions pp
      JOIN pt ON pt.id = pp.point_id
  ),
  st AS (
    -- only stories whose explain-backs the caller reads whole: public, or their own
    SELECT DISTINCT s.id, s.author_id
      FROM public.story_points spt
      JOIN pt ON pt.id = spt.point_id
      JOIN public.stories s ON s.id = spt.story_id
     WHERE s.visibility = 'public'::public.content_visibility OR s.author_id = (SELECT auth.uid())
  ),
  v AS (
    SELECT sv.id, sv.story_id, sv.listener_id, sv.accuracy_achieved, sv.created_at
      FROM public.story_verifications sv
      JOIN st ON st.id = sv.story_id
     WHERE sv.source = 'live'
       AND sv.speaker_id = st.author_id
       AND sv.listener_id IS NOT NULL
       AND sv.listener_id <> st.author_id
  ),
  hist AS (
    SELECT h.id, h.user_id, h.position, h.changed_at
      FROM public.point_position_history h
      JOIN pt ON pt.id = h.point_id
  ),
  people AS (
    SELECT user_id AS id FROM holders
    UNION SELECT author_id FROM st
  )
  SELECT jsonb_build_object(
    'point_id', (SELECT id FROM pt),
    'stories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'author_id', author_id)) FROM st), '[]'::jsonb),
    'verifications', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', id, 'story_id', story_id, 'listener_id', listener_id,
               'accuracy_achieved', accuracy_achieved, 'created_at', created_at))
        FROM v
    ), '[]'::jsonb),
    'history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', id, 'point_id', p_point_id, 'user_id', user_id, 'position', position, 'changed_at', changed_at))
        FROM hist
    ), '[]'::jsonb),
    'current', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('point_id', p_point_id, 'user_id', user_id, 'position', position))
        FROM holders
    ), '[]'::jsonb),
    'agent_ids', COALESCE((
      SELECT jsonb_agg(a.profile_id) FROM public.agent_accounts a WHERE a.profile_id IN (SELECT id FROM people)
    ), '[]'::jsonb),
    'profiles', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', pr.id, 'name', pr.name, 'slug', pr.slug, 'avatar_url', pr.avatar_url,
               'avatar_color', pr.avatar_color, 'has_pledged', pr.has_pledged))
        FROM public.profiles pr
       WHERE pr.id IN (SELECT id FROM people)
    ), '[]'::jsonb),
    -- Events and groups the filter may offer: signed-in callers only, each with the holders in it. Readable here
    -- exactly when the caller can read the registrations or the roster today. Cancelled events are left out.
    'events', CASE WHEN auth.uid() IS NULL THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'datetime', e.datetime, 'member_ids', e.member_ids)
                       ORDER BY e.datetime DESC, e.id)
        FROM (
          SELECT ev.id, ev.title, ev.datetime, jsonb_agg(DISTINCT r.profile_id) AS member_ids
            FROM public.event_rsvps r
            JOIN public.events ev ON ev.id = r.event_id
           WHERE r.profile_id IN (SELECT user_id FROM holders)
             AND ev.status IS DISTINCT FROM 'cancelled'
           GROUP BY ev.id, ev.title, ev.datetime
        ) e
    ), '[]'::jsonb) END,
    'groups', CASE WHEN auth.uid() IS NULL THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'member_ids', g.member_ids) ORDER BY g.name, g.id)
        FROM (
          SELECT o.id, o.name, jsonb_agg(DISTINCT m.user_id) AS member_ids
            FROM public.membership m
            JOIN public.organization o ON o.id = m.org_id
           WHERE o.visibility = 'public'
             AND m.user_id IN (SELECT user_id FROM holders)
           GROUP BY o.id, o.name
        ) g
    ), '[]'::jsonb) END
  );
$$;

REVOKE ALL ON FUNCTION public.get_point_movement_rows(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_point_movement_rows(uuid) TO anon, authenticated;

COMMIT;
