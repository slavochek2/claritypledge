-- new function
-- client-safe: P1347 is unshipped; no deployed client calls get_open_topics or add_topic yet.
-- P1347 redesign (founder, 2026-10-01): a plain list with stars, no videos, and
-- "Add your own" at the top. Attendee topics go public at once and always rank
-- above the host's. Only the TITLE is public; a comment or link goes to the host
-- as a private suggestion. Adding needs sign-in so every public line has an owner;
-- the host can unpublish any topic from /admin/topics.

ALTER TABLE public.topic_candidates
  ADD COLUMN source text NOT NULL DEFAULT 'host' CHECK (source IN ('host', 'community')),
  ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ALTER COLUMN why DROP NOT NULL,
  ALTER COLUMN video_url DROP NOT NULL,
  ALTER COLUMN thinker_name DROP NOT NULL;
CREATE INDEX topic_candidates_created_by_idx ON public.topic_candidates (created_by, created_at);

-- Return shape changes, so the old function is dropped first (diffed against: 20261001180000).
DROP FUNCTION public.get_open_topics(uuid);
CREATE FUNCTION public.get_open_topics(p_voter_token uuid DEFAULT NULL)
RETURNS TABLE (
  id            uuid,
  title         text,
  source        text,
  rating_avg    numeric,
  rating_count  integer,
  score         numeric,
  my_rating     smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    t.id, t.title, t.source,
    round(agg.avg_rating, 1),
    COALESCE(agg.n, 0)::integer,
    round(public.topic_score(agg.avg_rating, agg.keen_share), 2),
    mine.rating
  FROM public.topic_candidates t
  LEFT JOIN LATERAL (
    SELECT avg(r.rating)::numeric AS avg_rating,
           count(*)               AS n,
           (count(*) FILTER (WHERE r.rating >= 3))::numeric / NULLIF(count(*), 0) AS keen_share
    FROM public.topic_ratings r WHERE r.topic_id = t.id
  ) agg ON true
  LEFT JOIN public.topic_ratings mine
    ON mine.topic_id = t.id AND p_voter_token IS NOT NULL AND mine.voter_token = p_voter_token
  WHERE t.is_published
  -- Attendee topics above the host's (founder rule), then most wanted first.
  ORDER BY (t.source = 'community') DESC,
           public.topic_score(agg.avg_rating, agg.keen_share) DESC,
           COALESCE(agg.n, 0) DESC, t.sort_order, t.created_at;
$$;
REVOKE EXECUTE ON FUNCTION public.get_open_topics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_open_topics(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.add_topic(p_title text, p_note text DEFAULT NULL, p_link text DEFAULT NULL)
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
  IF v_note IS NOT NULL AND char_length(v_note) > 1000 THEN
    RAISE EXCEPTION 'invalid note' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.topic_candidates
      WHERE created_by = v_uid AND created_at > now() - interval '1 day') >= 5 THEN
    RAISE EXCEPTION 'rate limit' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.topic_candidates (title, source, created_by, is_published)
  VALUES (v_title, 'community', v_uid, true)
  RETURNING id INTO v_id;

  -- The comment and link are for the host only.
  IF v_note IS NOT NULL OR v_link IS NOT NULL THEN
    INSERT INTO public.topic_suggestions (user_id, topic_id, body, link)
    VALUES (v_uid, v_id, COALESCE(v_note, '(link only)'), v_link);
  END IF;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.add_topic(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_topic(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_topic(text, text, text) TO authenticated;

-- suggest_topic required a topic to be published-by-host; it stays for future use but the
-- page no longer calls it. admin_list_topics needs the new columns.
DROP FUNCTION public.admin_list_topics();
CREATE FUNCTION public.admin_list_topics()
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
    SELECT avg(r.rating)::numeric AS avg_rating,
           count(*)               AS n,
           (count(*) FILTER (WHERE r.rating >= 3))::numeric / NULLIF(count(*), 0) AS keen_share
    FROM public.topic_ratings r WHERE r.topic_id = t.id
  ) agg ON true
  ORDER BY t.is_published DESC, (t.source = 'community') DESC, t.sort_order, t.created_at;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_topics() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_topics() FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_topics() TO authenticated;
