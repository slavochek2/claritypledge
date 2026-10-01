-- new function
-- client-safe: P1347 is unshipped; no deployed client calls these functions yet.
-- P1347 (founder, 2026-10-01): "it should be only possible to vote for people … we don't
-- count anonymous votes", and give voters the choice to show their face or not.
--
--   * A vote is keyed on auth.uid(). Device-token rows from the earlier anonymous design
--     are left in place but no longer counted anywhere (user_id IS NULL).
--   * is_public: the voter's photo shows beside that topic, or the vote counts silently.
--   * A topic's average and voters are returned ONLY to someone who voted on it
--     (founder: "I should only see the average rating of the thing I voted for"). Enforced
--     here, not in the client, so the crowd's number never anchors a first vote.

ALTER TABLE public.topic_ratings
  ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN is_public boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX topic_ratings_topic_user_uidx ON public.topic_ratings (topic_id, user_id) WHERE user_id IS NOT NULL;
-- voter_token stays the PK column for old rows; signed-in rows reuse it as a random id.

-- Old anonymous write path: retired (diffed against: 20261001180000).
DROP FUNCTION public.rate_topic(uuid, uuid, smallint);

CREATE FUNCTION public.rate_topic(p_topic_id uuid, p_rating smallint, p_is_public boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF p_topic_id IS NULL OR p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'invalid rating' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.topic_candidates WHERE id = p_topic_id AND is_published) THEN
    RAISE EXCEPTION 'topic not open' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.topic_ratings (topic_id, voter_token, user_id, rating, is_public)
  VALUES (p_topic_id, gen_random_uuid(), v_uid, p_rating, COALESCE(p_is_public, true))
  ON CONFLICT (topic_id, user_id) WHERE user_id IS NOT NULL
  DO UPDATE SET rating = EXCLUDED.rating, is_public = EXCLUDED.is_public, updated_at = now();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.rate_topic(uuid, smallint, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rate_topic(uuid, smallint, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.rate_topic(uuid, smallint, boolean) TO authenticated;

-- One switch for all of my votes ("show my photo on my votes").
CREATE FUNCTION public.set_my_topic_votes_public(p_is_public boolean)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.topic_ratings SET is_public = COALESCE(p_is_public, true), updated_at = now()
   WHERE user_id = auth.uid();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_my_topic_votes_public(boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_my_topic_votes_public(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_my_topic_votes_public(boolean) TO authenticated;

-- Only signed-in votes count, in the public list and the founder view alike.
DROP FUNCTION public.get_open_topics(uuid);
CREATE FUNCTION public.get_open_topics()
RETURNS TABLE (
  id            uuid,
  title         text,
  source        text,
  my_rating     smallint,
  my_is_public  boolean,
  rating_avg    numeric,   -- NULL unless the caller voted on this topic
  rating_count  integer,   -- NULL unless the caller voted on this topic
  voters        jsonb      -- public voters (name, slug, avatar); NULL unless the caller voted
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    t.id, t.title, t.source,
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

CREATE OR REPLACE FUNCTION public.admin_list_topics()
RETURNS TABLE (
  id               uuid,
  title            text,
  source           text,
  author_name      text,
  why              text,
  video_url        text,
  thinker_name     text,
  is_published     boolean,
  sort_order       integer,
  rating_avg       numeric,
  rating_count     integer,
  keen_share       numeric,
  score            numeric,
  suggestion_count integer,
  created_at       timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT
    t.id, t.title, t.source, p.name, t.why, t.video_url, t.thinker_name, t.is_published, t.sort_order,
    round(agg.avg_rating, 2),
    COALESCE(agg.n, 0)::integer,
    round(agg.keen_share, 2),
    round(public.topic_score(agg.avg_rating, agg.keen_share), 2),
    (SELECT count(*) FROM public.topic_suggestions s WHERE s.topic_id = t.id)::integer,
    t.created_at
  FROM public.topic_candidates t
  LEFT JOIN public.profiles p ON p.id = t.created_by
  LEFT JOIN LATERAL (
    SELECT avg(r.rating)::numeric AS avg_rating, count(*) AS n,
           (count(*) FILTER (WHERE r.rating >= 3))::numeric / NULLIF(count(*), 0) AS keen_share
    FROM public.topic_ratings r WHERE r.topic_id = t.id AND r.user_id IS NOT NULL
  ) agg ON true
  ORDER BY t.is_published DESC, (t.source = 'community') DESC, t.sort_order, t.created_at;
END;
$$;
