-- P1429 A1 (review round 3, Gemini): two gaps in the photo choice.
-- diffed against: 20261006190000_p1429_topic_photo_lock.sql (rate_topic, set_my_topic_votes_public)
-- client-safe: same signatures and grants; the client always sends a boolean for p_is_public.
--
-- 1. With no stored choice, a hidden first vote stayed the only record of it: a later vote sent with
--    the default "show" (another tab, an older page) re-exposed the voter. The first vote now stores
--    the choice, under the same per-user lock.
-- 2. set_my_topic_votes_public read a missing value as "show" (COALESCE(..., true)) and exposed every
--    vote. A privacy switch now refuses it.

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

  -- One person's vote and photo choice run one at a time (shared lock with
  -- set_my_topic_votes_public), so a vote can never write a choice that Hide replaced mid-flight.
  PERFORM pg_advisory_xact_lock(hashtext('p1429:topic_photo:' || v_uid::text));
  -- The stored choice wins; the page's flag counts only before any choice was made — and then the
  -- first vote stores it, so a later vote sent with the default "show" cannot undo a hidden one.
  SELECT show_photo INTO v_public FROM public.topic_vote_prefs WHERE user_id = v_uid;
  IF v_public IS NULL THEN
    v_public := COALESCE(p_is_public, true);
    INSERT INTO public.topic_vote_prefs (user_id, show_photo) VALUES (v_uid, v_public)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

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
  -- A privacy switch never reads a missing value as "show".
  IF p_is_public IS NULL THEN
    RAISE EXCEPTION 'show or hide required' USING ERRCODE = '22023';
  END IF;
  -- Shared with rate_topic: a vote in flight finishes before this runs, or starts after it.
  PERFORM pg_advisory_xact_lock(hashtext('p1429:topic_photo:' || auth.uid()::text));
  -- Stored first, so a vote landing after this call reads the new choice.
  INSERT INTO public.topic_vote_prefs (user_id, show_photo)
  VALUES (auth.uid(), p_is_public)
  ON CONFLICT (user_id) DO UPDATE SET show_photo = EXCLUDED.show_photo, updated_at = now();
  UPDATE public.topic_ratings SET is_public = p_is_public, updated_at = now()
   WHERE user_id = auth.uid();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_my_topic_votes_public(boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_my_topic_votes_public(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_my_topic_votes_public(boolean) TO authenticated;
