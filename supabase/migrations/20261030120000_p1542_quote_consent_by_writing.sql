-- P1542 follow-up (founder, 2026-10-30): on a series whose close hands quotes to the founder (Social Hike), writing the
-- recommendation IS the permission to quote it. There is no box any more: under the text box the close says "By
-- sharing, you agree we may publish your words with your name on the series page." An empty answer is no permission
-- and no review; clearing the words later withdraws it, and a review the founder already approved leaves public view.
-- diffed against: 20261029200200_p1542_answer_saves_only_lower.sql (save_event_feedback);
--                 20261022120000_p1542_series_review_handoff.sql (finish_event_close)
-- client-safe: same signatures and grants. The new close sends p_quote_ok = NULL and never calls set_event_quote_ok on a
--   hike; an older cached hike client still sends its box value, which is ignored on a hike (the words decide).
--   Clarity Night (no hand-off) keeps the box and the 20261029200200 rule exactly.
--
-- WHY (closes the Codex MEDIUM against 20261029200300): lowering quote_ok never reached series_reviews, so a quote the
-- founder had approved stayed public after the person withdrew. Now the only thing that grants the permission on a hike
-- is the text itself, and every answer save brings the person's review row in line with it:
--   * words cleared       → the review (pending or approved) becomes 'rejected': out of the public read
--                           ("Approved series reviews are public"), kept as a row so the close can never make a second.
--   * words changed       → the review takes the new words and goes back to 'pending': the founder approves every
--                           published wording; the old wording leaves public view at once.
--   * a 'rejected' review is never revived by a later save (the founder's no, or a withdrawal, stands).
--
-- quote_ok STAYS, derived on a hike (= the words are not empty). Kept rather than removed because three readers use it
-- unchanged — finish_event_close's hand-off, scripts/series-reviews.mjs's consent check, scripts/event-close-results.sh —
-- and Clarity Night still writes it with its box. Deriving it in this one function is the fewest moving parts: no
-- reader changes, no column change, no DROP.
--
-- The series list lives in ONE helper now; finish_event_close reads it too (it held its own copy).

CREATE OR REPLACE FUNCTION public.series_quotes_from_close(p_series text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- Series whose close hands a quote to the founder, with consent given by writing. Add a slug here for the next one.
  SELECT p_series = ANY (ARRAY['social-hike']);
$$;
REVOKE EXECUTE ON FUNCTION public.series_quotes_from_close(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.series_quotes_from_close(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_event_feedback(
  p_event_id uuid, p_score smallint, p_liked text, p_improve text, p_quote_ok boolean
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_liked text := NULLIF(btrim(p_liked), '');
  v_by_writing boolean;
BEGIN
  IF NOT public.p1389_is_attendee(p_event_id, v_user) THEN
    RAISE EXCEPTION 'not an attendee of this event' USING ERRCODE = '42501';
  END IF;
  SELECT public.series_quotes_from_close(e.series_slug) INTO v_by_writing FROM public.events e WHERE e.id = p_event_id;
  v_by_writing := COALESCE(v_by_writing, false);

  INSERT INTO public.event_feedback (event_id, user_id, score, liked, improve, quote_ok)
  VALUES (p_event_id, v_user, p_score, v_liked, NULLIF(btrim(p_improve), ''),
          CASE WHEN v_by_writing THEN v_liked IS NOT NULL ELSE COALESCE(p_quote_ok, true) END)
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET score = EXCLUDED.score, liked = EXCLUDED.liked, improve = EXCLUDED.improve,
        -- A hike: the words are the permission. Otherwise (20261029200200): an answer save may only lower it.
        quote_ok = CASE
          WHEN v_by_writing THEN v_liked IS NOT NULL
          WHEN p_quote_ok IS FALSE THEN false
          ELSE public.event_feedback.quote_ok
        END,
        updated_at = now();

  IF v_by_writing THEN
    IF v_liked IS NULL THEN
      -- Withdrawn: out of public view, kept so the close never makes a second review.
      UPDATE public.series_reviews r SET status = 'rejected'
        WHERE r.source_event_id = p_event_id AND r.author_profile_id = v_user AND r.status <> 'rejected';
    ELSE
      -- New words: the founder approves them before they are public (the hand-off stores the first 2000 characters).
      UPDATE public.series_reviews r SET quote = left(v_liked, 2000), status = 'pending'
        WHERE r.source_event_id = p_event_id AND r.author_profile_id = v_user AND r.status <> 'rejected'
          AND r.quote IS DISTINCT FROM left(v_liked, 2000);
    END IF;
  END IF;
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_event_feedback(uuid, smallint, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_event_feedback(uuid, smallint, text, text, boolean) TO authenticated;

-- Unchanged from 20261022120000 except that the series list is the helper's.
CREATE OR REPLACE FUNCTION public.finish_event_close(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_was_finished boolean;
  v_series text;
  v_liked text;
  v_quote_ok boolean;
  v_name text;
BEGIN
  IF NOT public.p1389_is_attendee(p_event_id, v_user) THEN
    RAISE EXCEPTION 'not an attendee of this event' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(bool_or(f.finished_at IS NOT NULL), false) INTO v_was_finished
    FROM public.event_feedback f WHERE f.event_id = p_event_id AND f.user_id = v_user;

  INSERT INTO public.event_feedback (event_id, user_id, finished_at)
  VALUES (p_event_id, v_user, now())
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET finished_at = COALESCE(public.event_feedback.finished_at, now());

  -- Only the first arrival at the thank-you; a repeat (or a close finished before this shipped) adds nothing.
  IF NOT v_was_finished THEN
    SELECT e.series_slug INTO v_series FROM public.events e WHERE e.id = p_event_id;
    IF public.series_quotes_from_close(v_series) THEN
      SELECT NULLIF(btrim(f.liked), ''), f.quote_ok INTO v_liked, v_quote_ok
        FROM public.event_feedback f WHERE f.event_id = p_event_id AND f.user_id = v_user;
      IF v_liked IS NOT NULL AND COALESCE(v_quote_ok, false) THEN
        SELECT COALESCE(NULLIF(btrim(left(p.name, 120)), ''), 'A hiker') INTO v_name
          FROM public.profiles p WHERE p.id = v_user;
        INSERT INTO public.series_reviews (series_slug, quote, author_name, author_profile_id, status, source_event_id)
        VALUES (v_series, left(v_liked, 2000), COALESCE(v_name, 'A hiker'), v_user, 'pending', p_event_id)
        ON CONFLICT (source_event_id, author_profile_id) WHERE source_event_id IS NOT NULL DO NOTHING;
      END IF;
    END IF;
  END IF;
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.finish_event_close(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_event_close(uuid) TO authenticated;

COMMENT ON COLUMN public.event_feedback.quote_ok IS
  'Permission to quote `liked` with the person''s name. On a series that hands quotes to the founder '
  '(series_quotes_from_close: Social Hike) it is derived: true exactly when `liked` is not empty, and clearing the '
  'words withdraws the review (P1542, 20261030120000). Elsewhere (Clarity Night) the person''s box writes it '
  '(set_event_quote_ok) and an answer save keeps or lowers it (20261029200200).';
