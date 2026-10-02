-- client-safe: P1347 is unshipped; no deployed client calls get_open_topics yet.
-- P1347 (founder, 2026-10-01): "should we have a way to expand a topic and read a bit more"
-- and "what about our conjecture topics". The public list now carries the one-line
-- `why` (a public blurb, never the backlog's internal note) and a `track`:
-- 'room' = the in-person Clarity Night, 'online' = the conjecture track.

ALTER TABLE public.topic_candidates
  ADD COLUMN track text NOT NULL DEFAULT 'room' CHECK (track IN ('room', 'online'));

-- Return shape changes (diffed against: 20261001220000).
DROP FUNCTION public.get_open_topics();
CREATE FUNCTION public.get_open_topics()
RETURNS TABLE (
  id            uuid,
  title         text,
  why           text,
  track         text,
  source        text,
  my_rating     smallint,
  my_is_public  boolean,
  rating_avg    numeric,   -- NULL unless the caller voted on this topic
  rating_count  integer,   -- NULL unless the caller voted on this topic
  voters        jsonb      -- public voters; NULL unless the caller voted
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    t.id, t.title, t.why, t.track, t.source,
    mine.rating, mine.is_public,
    CASE WHEN mine.rating IS NOT NULL THEN round(agg.avg_rating, 1) END,
    CASE WHEN mine.rating IS NOT NULL THEN COALESCE(agg.n, 0)::integer END,
    CASE WHEN mine.rating IS NOT NULL THEN (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'name', p.name, 'slug', p.slug, 'avatarUrl', p.avatar_url,
               'avatarColor', p.avatar_color, 'hasPledged', COALESCE(p.has_pledged, false))
             ORDER BY r.updated_at DESC), '[]'::jsonb)
      FROM public.topic_ratings r
      JOIN public.profiles p ON p.id = r.user_id
      WHERE r.topic_id = t.id AND r.user_id IS NOT NULL AND r.is_public
    ) END
  FROM public.topic_candidates t
  LEFT JOIN LATERAL (
    SELECT avg(r.rating)::numeric AS avg_rating, count(*) AS n,
           (count(*) FILTER (WHERE r.rating >= 3))::numeric / NULLIF(count(*), 0) AS keen_share
    FROM public.topic_ratings r WHERE r.topic_id = t.id AND r.user_id IS NOT NULL
  ) agg ON true
  LEFT JOIN public.topic_ratings mine
    ON mine.topic_id = t.id AND auth.uid() IS NOT NULL AND mine.user_id = auth.uid()
  WHERE t.is_published
  ORDER BY (t.source = 'community') DESC,
           public.topic_score(agg.avg_rating, agg.keen_share) DESC,
           COALESCE(agg.n, 0) DESC, t.sort_order, t.created_at;
$$;
REVOKE EXECUTE ON FUNCTION public.get_open_topics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_open_topics() TO anon, authenticated;
