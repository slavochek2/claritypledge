-- P1542 quote consent by writing, review fixes (Gemini + Opus on 20261030120000).
-- diffed against: 20261030120000_p1542_quote_consent_by_writing.sql (save_event_feedback, finish_event_close,
--                 series_quotes_from_close); 20261029200300_p1542_quote_ok_click_order.sql (set_event_quote_ok, 3 args)
-- client-safe: same signatures and grants; nothing dropped or deleted. The current close never calls set_event_quote_ok
--   on a hike; an older cached hike tab that still shows the box gets a refusal there (its "could not save" path shows
--   the server's value again). Clarity Night is unchanged.
--
-- 1. set_event_quote_ok REFUSES on a hike (SQLSTATE 0A000). Refused rather than read as a withdrawal: on a hike the
--    words are the one writer of the permission (20261030120000). A box false while the words stay would be a second,
--    contradicting writer — the next answer save would re-derive true from the same words. One writer, one meaning.
-- 2. Words added AFTER the close finished (finished with an empty answer, then went back) now reach moderation: an
--    answer save on a finished hike close with words and NO review row for (event, person) inserts a PENDING one, with
--    the hand-off's name rule. A 'rejected' row is never revived (the unique index makes ON CONFLICT DO NOTHING).
-- 3. One normalisation of the words, in one helper, used by every writer: leading and trailing whitespace including
--    tab, newline, carriage return, form feed, vertical tab and no-break space (U+00A0) is removed; nothing left = no
--    words. A review stores the first 2000 characters of that. scripts/series-reviews.mjs applies the same pattern and
--    the same 2000-character cut (by code point, as left() counts) when it compares.
-- Concurrency (Gemini, set aside): finish_event_close and save_event_feedback both upsert the person's event_feedback
-- row first, so that row's lock serialises them; neither reads the review state before holding it.

CREATE OR REPLACE FUNCTION public.p1542_quote_words(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- The same class as scripts/series-reviews.mjs's QUOTE_TRIM: space, \t \n \r \f \v and U+00A0.
  SELECT NULLIF(regexp_replace(p_text, '^[ \t\n\r\f\v ]+|[ \t\n\r\f\v ]+$', '', 'g'), '');
$$;
REVOKE EXECUTE ON FUNCTION public.p1542_quote_words(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.p1542_quote_words(text) TO authenticated;

-- The hand-off's author name, one rule for both inserts.
CREATE OR REPLACE FUNCTION public.p1542_review_author_name(p_user uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((SELECT NULLIF(btrim(left(p.name, 120)), '') FROM public.profiles p WHERE p.id = p_user), 'A hiker');
$$;
REVOKE EXECUTE ON FUNCTION public.p1542_review_author_name(uuid) FROM PUBLIC, anon, authenticated;

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
  v_liked text := public.p1542_quote_words(p_liked);
  v_by_writing boolean;
  v_series text;
  v_finished boolean;
BEGIN
  IF NOT public.p1389_is_attendee(p_event_id, v_user) THEN
    RAISE EXCEPTION 'not an attendee of this event' USING ERRCODE = '42501';
  END IF;
  SELECT e.series_slug INTO v_series FROM public.events e WHERE e.id = p_event_id;
  v_by_writing := COALESCE(public.series_quotes_from_close(v_series), false);

  -- First, the person's row (its lock serialises this save with finish_event_close).
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
        updated_at = now()
  RETURNING finished_at IS NOT NULL INTO v_finished;

  IF v_by_writing THEN
    IF v_liked IS NULL THEN
      -- Withdrawn: out of public view, kept so the close never makes a second review.
      UPDATE public.series_reviews r SET status = 'rejected'
        WHERE r.source_event_id = p_event_id AND r.author_profile_id = v_user AND r.status <> 'rejected';
    ELSE
      -- New words: the founder approves them before they are public.
      UPDATE public.series_reviews r SET quote = left(v_liked, 2000), status = 'pending'
        WHERE r.source_event_id = p_event_id AND r.author_profile_id = v_user AND r.status <> 'rejected'
          AND r.quote IS DISTINCT FROM left(v_liked, 2000);
      -- Words written after the close finished with none: the hand-off it missed. Never a second row (and so never
      -- over a 'rejected' one): the one-per-close index turns a conflict into nothing.
      IF v_finished THEN
        INSERT INTO public.series_reviews (series_slug, quote, author_name, author_profile_id, status, source_event_id)
        VALUES (v_series, left(v_liked, 2000), public.p1542_review_author_name(v_user), v_user, 'pending', p_event_id)
        ON CONFLICT (source_event_id, author_profile_id) WHERE source_event_id IS NOT NULL DO NOTHING;
      END IF;
    END IF;
  END IF;
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_event_feedback(uuid, smallint, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_event_feedback(uuid, smallint, text, text, boolean) TO authenticated;

-- Unchanged from 20261030120000 except the words' normalisation and the name rule come from the helpers.
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
BEGIN
  IF NOT public.p1389_is_attendee(p_event_id, v_user) THEN
    RAISE EXCEPTION 'not an attendee of this event' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(bool_or(f.finished_at IS NOT NULL), false) INTO v_was_finished
    FROM public.event_feedback f WHERE f.event_id = p_event_id AND f.user_id = v_user;

  -- First, the person's row (its lock serialises this finish with save_event_feedback).
  INSERT INTO public.event_feedback (event_id, user_id, finished_at)
  VALUES (p_event_id, v_user, now())
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET finished_at = COALESCE(public.event_feedback.finished_at, now());

  -- Only the first arrival at the thank-you; a repeat (or a close finished before this shipped) adds nothing.
  IF NOT v_was_finished THEN
    SELECT e.series_slug INTO v_series FROM public.events e WHERE e.id = p_event_id;
    IF public.series_quotes_from_close(v_series) THEN
      SELECT public.p1542_quote_words(f.liked), f.quote_ok INTO v_liked, v_quote_ok
        FROM public.event_feedback f WHERE f.event_id = p_event_id AND f.user_id = v_user;
      IF v_liked IS NOT NULL AND COALESCE(v_quote_ok, false) THEN
        INSERT INTO public.series_reviews (series_slug, quote, author_name, author_profile_id, status, source_event_id)
        VALUES (v_series, left(v_liked, 2000), public.p1542_review_author_name(v_user), v_user, 'pending', p_event_id)
        ON CONFLICT (source_event_id, author_profile_id) WHERE source_event_id IS NOT NULL DO NOTHING;
      END IF;
    END IF;
  END IF;
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.finish_event_close(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_event_close(uuid) TO authenticated;

-- The box's write: refused on a hike (fix 1), otherwise exactly 20261029200300.
CREATE OR REPLACE FUNCTION public.set_event_quote_ok(p_event_id uuid, p_quote_ok boolean, p_clicked_at timestamptz)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_at   timestamptz;
BEGIN
  IF NOT public.p1389_is_attendee(p_event_id, v_user) THEN
    RAISE EXCEPTION 'not an attendee of this event' USING ERRCODE = '42501';
  END IF;
  IF (SELECT public.series_quotes_from_close(e.series_slug) FROM public.events e WHERE e.id = p_event_id) THEN
    RAISE EXCEPTION 'on this series the words are the permission: save or clear them' USING ERRCODE = '0A000';
  END IF;
  IF p_quote_ok IS NULL THEN
    RAISE EXCEPTION 'quote permission must be true or false' USING ERRCODE = '22004';
  END IF;
  IF p_clicked_at IS NULL THEN
    RAISE EXCEPTION 'click time is required' USING ERRCODE = '22004';
  END IF;
  v_at := LEAST(p_clicked_at, now() + interval '1 minute');
  INSERT INTO public.event_feedback (event_id, user_id, quote_ok, quote_ok_at)
  VALUES (p_event_id, v_user, p_quote_ok, v_at)
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET quote_ok = EXCLUDED.quote_ok, quote_ok_at = EXCLUDED.quote_ok_at, updated_at = now()
    -- Only a newer click wins; an older or equal one (a stale tab, a late retry) changes nothing.
    WHERE public.event_feedback.quote_ok_at IS NULL OR EXCLUDED.quote_ok_at > public.event_feedback.quote_ok_at;
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_event_quote_ok(uuid, boolean, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_event_quote_ok(uuid, boolean, timestamptz) TO authenticated;
