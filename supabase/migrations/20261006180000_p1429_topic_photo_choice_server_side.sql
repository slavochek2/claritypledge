-- P1429 A1: a voter who hides their photo stays hidden, whatever the client sends.
-- diffed against: 20261001220000_p1347_signed_in_votes.sql (rate_topic, set_my_topic_votes_public)
-- client-safe: new table + same function signatures; no grant, policy or column is removed.
--
-- rate_topic wrote the client's p_is_public on every vote. A vote sent before "Hide my photo"
-- and landing after it, a second tab still holding "show", or the guest-votes flush after
-- sign-in each re-exposed the voter. The choice now lives in the database, one row per person,
-- written only by set_my_topic_votes_public; rate_topic reads it and uses the client's flag
-- only when the person has never made a choice.

CREATE TABLE IF NOT EXISTS public.topic_vote_prefs (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  show_photo boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- No policies: reached only through the two definer functions below.
ALTER TABLE public.topic_vote_prefs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.topic_vote_prefs FROM PUBLIC, anon, authenticated;

-- Backfill from existing votes: hidden if ANY of the person's votes is hidden. "Latest vote"
-- would be wrong here, because the race this fixes leaves the latest vote public.
INSERT INTO public.topic_vote_prefs (user_id, show_photo)
SELECT r.user_id, bool_and(r.is_public)
FROM public.topic_ratings r
WHERE r.user_id IS NOT NULL
GROUP BY r.user_id
ON CONFLICT (user_id) DO NOTHING;

-- Repair anyone the race already re-exposed: a hidden choice covers all of their votes.
UPDATE public.topic_ratings r
   SET is_public = false, updated_at = now()
  FROM public.topic_vote_prefs p
 WHERE p.user_id = r.user_id AND NOT p.show_photo AND r.is_public;

CREATE OR REPLACE FUNCTION public.rate_topic(p_topic_id uuid, p_rating smallint, p_is_public boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_public boolean;
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

  -- The stored choice wins; the page's flag counts only before any choice was made.
  SELECT show_photo INTO v_public FROM public.topic_vote_prefs WHERE user_id = v_uid;
  v_public := COALESCE(v_public, p_is_public, true);

  INSERT INTO public.topic_ratings (topic_id, voter_token, user_id, rating, is_public)
  VALUES (p_topic_id, gen_random_uuid(), v_uid, p_rating, v_public)
  ON CONFLICT (topic_id, user_id) WHERE user_id IS NOT NULL
  DO UPDATE SET rating = EXCLUDED.rating, is_public = EXCLUDED.is_public, updated_at = now();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.rate_topic(uuid, smallint, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rate_topic(uuid, smallint, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.rate_topic(uuid, smallint, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_my_topic_votes_public(p_is_public boolean)
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
  -- Stored first, so a vote landing after this call reads the new choice.
  INSERT INTO public.topic_vote_prefs (user_id, show_photo)
  VALUES (auth.uid(), COALESCE(p_is_public, true))
  ON CONFLICT (user_id) DO UPDATE SET show_photo = EXCLUDED.show_photo, updated_at = now();
  UPDATE public.topic_ratings SET is_public = COALESCE(p_is_public, true), updated_at = now()
   WHERE user_id = auth.uid();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_my_topic_votes_public(boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_my_topic_votes_public(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_my_topic_votes_public(boolean) TO authenticated;
