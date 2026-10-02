-- new function
-- client-safe: P1347 is unshipped; no deployed client calls add_topic or get_open_topics yet.
-- diffed against: 20261001200000_p1347_community_topics.sql (add_topic), 20261001233000_p1347_public_order.sql (get_open_topics)
-- P1347 (founder, 2026-10-02): "should we show who added it … and a small check mark to be
-- anonymous"; "should the comments appear in the description". An attendee's comment becomes
-- the topic's public description; their name and face show unless they added it anonymously.
-- The link stays host-only (topic_suggestions).

ALTER TABLE public.topic_candidates
  ADD COLUMN author_public boolean NOT NULL DEFAULT true;

DROP FUNCTION public.add_topic(text, text, text);
CREATE FUNCTION public.add_topic(p_title text, p_note text DEFAULT NULL, p_link text DEFAULT NULL, p_anonymous boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_title text := btrim(COALESCE(p_title, ''));
  v_note  text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_link  text := NULLIF(btrim(COALESCE(p_link, '')), '');
  v_id    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_title) NOT BETWEEN 3 AND 140 THEN
    RAISE EXCEPTION 'invalid topic' USING ERRCODE = '22023';
  END IF;
  IF v_link IS NOT NULL AND (v_link !~ '^https://' OR char_length(v_link) > 500) THEN
    RAISE EXCEPTION 'invalid link' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 240 THEN  -- now the public description (why ≤ 240)
    RAISE EXCEPTION 'invalid note' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.topic_candidates
      WHERE created_by = v_uid AND created_at > now() - interval '1 day') >= 5 THEN
    RAISE EXCEPTION 'rate limit' USING ERRCODE = '54000';
  END IF;

  -- The comment is the topic's public description; the name shows unless anonymous.
  INSERT INTO public.topic_candidates (title, why, source, created_by, author_public, is_published)
  VALUES (v_title, v_note, 'community', v_uid, NOT COALESCE(p_anonymous, false), true)
  RETURNING id INTO v_id;

  -- The host also gets the comment and the link (the link is not shown publicly).
  IF v_note IS NOT NULL OR v_link IS NOT NULL THEN
    INSERT INTO public.topic_suggestions (user_id, topic_id, body, link)
    VALUES (v_uid, v_id, COALESCE(v_note, '(link only)'), v_link);
  END IF;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.add_topic(text, text, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_topic(text, text, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_topic(text, text, text, boolean) TO authenticated;

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
  voters        jsonb,     -- public voters; NULL unless the caller voted
  author        jsonb      -- who added a community topic; NULL for host topics or anonymous adds
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
    ) END,
    CASE WHEN t.source = 'community' AND t.author_public THEN (
      SELECT jsonb_build_object('name', a.name, 'slug', a.slug, 'avatarUrl', a.avatar_url,
               'avatarColor', a.avatar_color, 'hasPledged', COALESCE(a.has_pledged, false))
      FROM public.profiles a WHERE a.id = t.created_by
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
REVOKE EXECUTE ON FUNCTION public.get_open_topics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_open_topics() TO anon, authenticated;
