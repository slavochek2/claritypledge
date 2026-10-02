-- client-safe: P1347 is unshipped; same signature and columns, only the row order changes.
-- diffed against: 20261001230000_p1347_topic_details.sql
-- P1347 (founder, 2026-10-01): show a top selection first ("should we limit top selection").
-- The public order becomes attendee topics, then the host's backlog order. The vote score
-- stays in admin_list_topics, where the founder decides.

CREATE OR REPLACE FUNCTION public.get_open_topics()
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
  -- Attendee topics first (newest first), then the host's in backlog order. NOT by votes:
  -- the page shows a short list first, and ranking by votes would anchor it.
  ORDER BY (t.source = 'community') DESC,
           CASE WHEN t.source = 'community' THEN t.created_at END DESC,
           t.sort_order, t.created_at;
$$;
