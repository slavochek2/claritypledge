-- P1542: a finished hike close with "what was good" and "you may quote me" becomes a PENDING series
-- review that the founder approves or rejects. Nothing pending is ever public.
-- diffed against: 20261002220000_p1389_event_close.sql (finish_event_close),
--                 20261004093000_p1403_social_hike_series.sql (series_reviews + its public policy)
-- client-safe: additive columns with defaults that keep every existing row approved; same
-- finish_event_close signature and grants; the one narrowed policy only HIDES rows that did not
-- exist before this migration (status defaults to 'approved', so today's three reviews stay visible).
--
-- Shape decisions:
--
-- * status text DEFAULT 'approved'. Every row written before this migration, and every row the
--   service role inserts by hand as before, stays public. Only the hand-off below writes 'pending'.
--   'rejected' rows are kept (not deleted) so the same close can never produce a second row.
--
-- * source_event_id + unique (source_event_id, author_profile_id): exactly one review per person per
--   closed event, held by the database, not by the client. The hand-off inserts ON CONFLICT DO NOTHING.
--
-- * Only a close that FINISHES after this ships can create one: the insert runs when finish_event_close
--   sets finished_at for the first time. A close already finished stays finished (no backfill).
--
-- * Which series hand off is a list inside the function (hikes only). Clarity Night closes keep
--   writing event_feedback exactly as before and create no review rows.

ALTER TABLE public.series_reviews
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS source_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

ALTER TABLE public.series_reviews DROP CONSTRAINT IF EXISTS series_reviews_status_check;
ALTER TABLE public.series_reviews
  ADD CONSTRAINT series_reviews_status_check CHECK (status IN ('pending', 'approved', 'rejected'));

CREATE UNIQUE INDEX IF NOT EXISTS series_reviews_one_per_close
  ON public.series_reviews (source_event_id, author_profile_id)
  WHERE source_event_id IS NOT NULL;

-- The public read now means "approved". RLS applies to anon and authenticated alike; the founder
-- script reads and writes with the service role, which bypasses it.
DROP POLICY IF EXISTS "Series reviews are public" ON public.series_reviews;
DROP POLICY IF EXISTS "Approved series reviews are public" ON public.series_reviews;
CREATE POLICY "Approved series reviews are public"
  ON public.series_reviews FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

-- The thank-you was reached: a return visit goes straight there (P1389), and the first arrival
-- hands a quotable review to the founder (P1542).
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
  -- Series whose close hands a quote to the founder. Add a slug here for the next series.
  v_review_series constant text[] := ARRAY['social-hike'];
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
    IF v_series = ANY (v_review_series) THEN
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
