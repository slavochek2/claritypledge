-- Migration: P1061 -- the movement reads count only where every row behind a count is readable; no cancelled events
-- Created: 2026-11-17
-- Spec: features/p1061_point_position_movement_analytics.md (Definitions, Invariants)
-- Guaranteed by: scripts/test-p1061-movement-visibility.sh (TEST probes) and src/tests/p1061-*.test.ts(x).
-- Diffed against: 20261117160000_p1061_position_movement_reads.sql (the only earlier definition of both functions).
-- client-safe: same signatures and return shape; each function returns a subset of what it returned before.
--
-- WHY. Both functions stay SECURITY INVOKER, so they still show nothing a caller cannot select. But a caller can
--   read SOME of the rows behind a count without reading all of them, and a count built from part of its rows is a
--   wrong number shown as fact (review of P1061):
--   * a private story read through a chat share: the caller reads the story, its point and that point's history,
--     but only their own explain-back row (story_verifications admits other people's rows only for a public story or
--     its author). Its "N moved" would be 0 or 1 instead of the real number.
--   * a non-public point the caller is not the first validator of: they read only their own history rows (and, for a
--     chat-shared point, the shared history). Its arrows would count part of its people.
--   So a story is counted only when public or the caller's own, and a story's point only when public or the caller is
--   its first validator: exactly where today's policies give the caller every row. The point page already asks for
--   its read only there (readsAllHistory); the story-pill arrows it computes get the same story rule.
-- * Cancelled events are not offered in the Changes filter, as the other event surfaces (P1336, P1603) leave them out.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_story_movement_rows(p_story_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH ids AS (
    -- a page of stories, never an unbounded list
    SELECT DISTINCT x AS id FROM unnest(p_story_ids[1:200]) AS x WHERE x IS NOT NULL
  ),
  st AS (
    -- only stories whose explain-backs the caller reads whole: public, or their own
    SELECT s.id, s.author_id
      FROM public.stories s
      JOIN ids ON ids.id = s.id
     WHERE s.visibility = 'public'::public.content_visibility OR s.author_id = (SELECT auth.uid())
  ),
  sp AS (
    -- only points whose history the caller reads whole: public, or they are its first validator
    SELECT DISTINCT spt.story_id, spt.point_id
      FROM public.story_points spt
      JOIN st ON st.id = spt.story_id
      JOIN public.points p ON p.id = spt.point_id
     WHERE p.superseded_by IS NULL
       AND (p.visibility = 'public'::public.content_visibility OR p.first_validator_id = (SELECT auth.uid()))
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
  pairs AS (
    SELECT DISTINCT sp.point_id, v.listener_id AS user_id
      FROM sp JOIN v ON v.story_id = sp.story_id
  )
  SELECT jsonb_build_object(
    'stories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'author_id', author_id)) FROM st), '[]'::jsonb),
    'story_points', COALESCE((SELECT jsonb_agg(jsonb_build_object('story_id', story_id, 'point_id', point_id)) FROM sp), '[]'::jsonb),
    'verifications', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', id, 'story_id', story_id, 'listener_id', listener_id,
               'accuracy_achieved', accuracy_achieved, 'created_at', created_at))
        FROM v
    ), '[]'::jsonb),
    'history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', h.id, 'point_id', h.point_id, 'user_id', h.user_id,
               'position', h.position, 'changed_at', h.changed_at))
        FROM public.point_position_history h
        JOIN pairs ON pairs.point_id = h.point_id AND pairs.user_id = h.user_id
    ), '[]'::jsonb),
    'current', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('point_id', pp.point_id, 'user_id', pp.user_id, 'position', pp.position))
        FROM public.point_positions pp
        JOIN pairs ON pairs.point_id = pp.point_id AND pairs.user_id = pp.user_id
    ), '[]'::jsonb),
    'agent_ids', COALESCE((
      SELECT jsonb_agg(a.profile_id)
        FROM public.agent_accounts a
       WHERE a.profile_id IN (SELECT author_id FROM st UNION SELECT listener_id FROM v)
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_story_movement_rows(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_story_movement_rows(uuid[]) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.get_point_movement_rows(p_point_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH pt AS (
    SELECT p.id FROM public.points p WHERE p.id = p_point_id
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
