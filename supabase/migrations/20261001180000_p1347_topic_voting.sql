-- new function
-- client-safe: three new tables and new functions only; nothing a deployed client reads changes.
-- P1347: attendees rate upcoming Clarity Night topics at /topics.
--
-- SHAPE. Three tables, all RLS-enabled with NO policies: no client reads or writes
-- them directly. Every access goes through a SECURITY DEFINER function below, so
-- the set of columns that can leave the database is the RETURNS TABLE list of a
-- function, never a table's full row.
--
--   topic_candidates  — what the founder published. Exactly the four fields P1166
--                       allows out of .private/ (title, why, video_url, thinker_name)
--                       plus publish state and ordering. Nothing else from the
--                       private backlog has a column to land in.
--   topic_ratings     — 0..5 per (topic, voter_token). One device = one voter: the
--                       token is a random uuid the browser keeps. Founder call (c):
--                       rating is one tap with no sign-in, so counts are DEVICES,
--                       not people (decisions.md slido-reuse rejection (a)).
--   topic_suggestions — free text + optional link, signed-in only. One-way to the
--                       founder; no function ever returns them to a non-admin.
--
-- INVARIANTS
--   * Votes are advisory: nothing here selects a topic or starts a pipeline.
--   * Anonymous write path (rate_topic) carries an explicit rate limit (P1278 ruling):
--     a global cap on NEW voter rows per hour. A repeat rating by the same token is
--     an UPDATE and is not counted against it.
--   * Suggestions are data, never instructions. They are stored, shown to the
--     founder, and reach the pipeline only by hand.
--   * Admin functions follow the P1381 pattern: assert_admin() first, explicit
--     RETURNS TABLE, EXECUTE revoked from PUBLIC and anon by name.

-- ─── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE public.topic_candidates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 140),
  why           text NOT NULL CHECK (char_length(btrim(why)) BETWEEN 1 AND 240),
  video_url     text NOT NULL CHECK (video_url ~ '^https://' AND char_length(video_url) <= 500),
  thinker_name  text NOT NULL CHECK (char_length(btrim(thinker_name)) BETWEEN 1 AND 80),
  is_published  boolean NOT NULL DEFAULT false,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.topic_ratings (
  topic_id     uuid NOT NULL REFERENCES public.topic_candidates(id) ON DELETE CASCADE,
  voter_token  uuid NOT NULL,
  rating       smallint NOT NULL CHECK (rating BETWEEN 0 AND 5),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (topic_id, voter_token)
);
CREATE INDEX topic_ratings_created_at_idx ON public.topic_ratings (created_at);

CREATE TABLE public.topic_suggestions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NULL = a new topic or thinker; set = "how would this one be more interesting".
  topic_id    uuid REFERENCES public.topic_candidates(id) ON DELETE SET NULL,
  body        text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  link        text CHECK (link IS NULL OR (link ~ '^https://' AND char_length(link) <= 500)),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX topic_suggestions_user_created_idx ON public.topic_suggestions (user_id, created_at);
CREATE INDEX topic_suggestions_topic_idx ON public.topic_suggestions (topic_id);

ALTER TABLE public.topic_candidates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_ratings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_suggestions ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: default-deny for anon and authenticated. Belt and braces
-- against a future policy added by mistake: table privileges are revoked too.
REVOKE ALL ON public.topic_candidates, public.topic_ratings, public.topic_suggestions FROM anon, authenticated;

-- ─── Score (one definition, used by the public order and the founder view) ──
-- Founder score = mean rating × share of raters who gave 3 or more, so a topic
-- half the room loves beats one everyone mildly tolerates (spec §Choosing).

CREATE OR REPLACE FUNCTION public.topic_score(p_avg numeric, p_keen_share numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT COALESCE(p_avg, 0) * COALESCE(p_keen_share, 0) $$;

-- ─── Public read ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_open_topics(p_voter_token uuid DEFAULT NULL)
RETURNS TABLE (
  id            uuid,
  title         text,
  why           text,
  video_url     text,
  thinker_name  text,
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
    t.id, t.title, t.why, t.video_url, t.thinker_name,
    round(agg.avg_rating, 1)                                   AS rating_avg,
    COALESCE(agg.n, 0)::integer                                AS rating_count,
    round(public.topic_score(agg.avg_rating, agg.keen_share), 2) AS score,
    mine.rating                                                AS my_rating
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
  ORDER BY t.sort_order, t.created_at;
$$;

REVOKE EXECUTE ON FUNCTION public.get_open_topics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_open_topics(uuid) TO anon, authenticated;

-- ─── Anonymous write: rate one topic ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rate_topic(p_topic_id uuid, p_voter_token uuid, p_rating smallint)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Global cap on NEW raters per hour. A full room is ~30 people × 8 topics = 240;
  -- 600 leaves headroom for a busy week and stops a script minting tokens in a loop.
  c_new_per_hour CONSTANT integer := 600;
BEGIN
  IF p_voter_token IS NULL OR p_topic_id IS NULL OR p_rating IS NULL OR p_rating NOT BETWEEN 0 AND 5 THEN
    RAISE EXCEPTION 'invalid rating' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.topic_candidates WHERE id = p_topic_id AND is_published) THEN
    RAISE EXCEPTION 'topic not open' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.topic_ratings WHERE topic_id = p_topic_id AND voter_token = p_voter_token)
     AND (SELECT count(*) FROM public.topic_ratings WHERE created_at > now() - interval '1 hour') >= c_new_per_hour
  THEN
    RAISE EXCEPTION 'rate limit' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.topic_ratings (topic_id, voter_token, rating)
  VALUES (p_topic_id, p_voter_token, p_rating)
  ON CONFLICT (topic_id, voter_token)
  DO UPDATE SET rating = EXCLUDED.rating, updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rate_topic(uuid, uuid, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rate_topic(uuid, uuid, smallint) TO anon, authenticated;

-- ─── Signed-in write: suggest ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.suggest_topic(p_topic_id uuid, p_body text, p_link text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_link text := NULLIF(btrim(COALESCE(p_link, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'invalid suggestion' USING ERRCODE = '22023';
  END IF;
  IF v_link IS NOT NULL AND (v_link !~ '^https://' OR char_length(v_link) > 500) THEN
    RAISE EXCEPTION 'invalid link' USING ERRCODE = '22023';
  END IF;
  IF p_topic_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.topic_candidates WHERE id = p_topic_id AND is_published) THEN
    RAISE EXCEPTION 'topic not open' USING ERRCODE = 'P0002';
  END IF;
  IF (SELECT count(*) FROM public.topic_suggestions
      WHERE user_id = v_uid AND created_at > now() - interval '1 day') >= 20 THEN
    RAISE EXCEPTION 'rate limit' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.topic_suggestions (user_id, topic_id, body, link)
  VALUES (v_uid, p_topic_id, btrim(p_body), v_link);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.suggest_topic(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.suggest_topic(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.suggest_topic(uuid, text, text) TO authenticated;

-- ─── Admin (P1381 pattern) ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_list_topics()
RETURNS TABLE (
  id               uuid,
  title            text,
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
    t.id, t.title, t.why, t.video_url, t.thinker_name, t.is_published, t.sort_order,
    round(agg.avg_rating, 2),
    COALESCE(agg.n, 0)::integer,
    round(agg.keen_share, 2),
    round(public.topic_score(agg.avg_rating, agg.keen_share), 2),
    (SELECT count(*) FROM public.topic_suggestions s WHERE s.topic_id = t.id)::integer,
    t.created_at
  FROM public.topic_candidates t
  LEFT JOIN LATERAL (
    SELECT avg(r.rating)::numeric AS avg_rating,
           count(*)               AS n,
           (count(*) FILTER (WHERE r.rating >= 3))::numeric / NULLIF(count(*), 0) AS keen_share
    FROM public.topic_ratings r WHERE r.topic_id = t.id
  ) agg ON true
  ORDER BY t.is_published DESC, t.sort_order, t.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_topic(
  p_id uuid, p_title text, p_why text, p_video_url text, p_thinker_name text, p_sort_order integer
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.assert_admin();
  IF p_id IS NULL THEN
    INSERT INTO public.topic_candidates (title, why, video_url, thinker_name, sort_order)
    VALUES (btrim(p_title), btrim(p_why), btrim(p_video_url), btrim(p_thinker_name), COALESCE(p_sort_order, 0))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.topic_candidates
       SET title = btrim(p_title), why = btrim(p_why), video_url = btrim(p_video_url),
           thinker_name = btrim(p_thinker_name), sort_order = COALESCE(p_sort_order, sort_order),
           updated_at = now()
     WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_topic_published(p_id uuid, p_published boolean)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_admin();
  UPDATE public.topic_candidates SET is_published = p_published, updated_at = now() WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_topic_suggestions()
RETURNS TABLE (
  id          uuid,
  topic_id    uuid,
  topic_title text,
  body        text,
  link        text,
  author_name text,
  author_slug text,
  email       text,
  created_at  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT s.id, s.topic_id, t.title, s.body, s.link, p.name, p.slug, u.email::text, s.created_at
  FROM public.topic_suggestions s
  LEFT JOIN public.topic_candidates t ON t.id = s.topic_id
  LEFT JOIN public.profiles p ON p.id = s.user_id
  LEFT JOIN auth.users u ON u.id = s.user_id
  ORDER BY s.created_at DESC, s.id
  LIMIT 500;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_topics() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_topics() FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_topics() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_save_topic(uuid, text, text, text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_save_topic(uuid, text, text, text, text, integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_save_topic(uuid, text, text, text, text, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_topic_published(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_topic_published(uuid, boolean) FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_topic_published(uuid, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_topic_suggestions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_topic_suggestions() FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_topic_suggestions() TO authenticated;
