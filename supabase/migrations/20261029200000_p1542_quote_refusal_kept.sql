-- P1542 review round 7: save_event_feedback keeps the person's quote choice as given, words or not.
-- diffed against: 20261002220000_p1389_event_close.sql (the only earlier definition)
-- client-safe: same signature and grants; an older client (which sends quoteOk && words) is stored exactly as before
--
-- WHY. The quote permission sits on the "What did you like" step, but the score and the improvement are saved first.
-- The old rule stored quote_ok = p_quote_ok AND <liked non-empty>, so every save without words stored false — a
-- score-only save, an improvement-only save, and a person who explicitly UNTICKED all looked the same. The refusal
-- therefore lived only in the browser, and was lost when another person used the tab, storage was cleared, or the
-- person came back on another device; their later words were then submitted as quotable.
--
-- NOW. quote_ok stores the checkbox as the client sent it. Readers that publish a quote already require words as well
-- (series review hand-off: v_liked IS NOT NULL AND quote_ok, 20261022120000; scripts/series-reviews.mjs), so
-- quote_ok = true with no words is never used as a quote. The close reads the saved row's quote_ok as the default
-- when a row exists, ticked when none does (founder 2026-10-05: ticked from the start).
--
-- Rows saved before this migration hold false for score-only saves; those people reopen unticked (fails safe).
--
-- SUPERSEDES a comment: 20261002220000_p1389_event_close.sql says quote_ok is "set with the words in one write (true
-- only with text)". That no longer holds — quote_ok may now be true with no words (the person's tick, kept). Every
-- reader that publishes a quote requires the words as well (see NOW, above).

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
BEGIN
  IF NOT public.p1389_is_attendee(p_event_id, v_user) THEN
    RAISE EXCEPTION 'not an attendee of this event' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.event_feedback (event_id, user_id, score, liked, improve, quote_ok)
  VALUES (p_event_id, v_user, p_score, NULLIF(btrim(p_liked), ''), NULLIF(btrim(p_improve), ''),
          COALESCE(p_quote_ok, false))
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET score = EXCLUDED.score, liked = EXCLUDED.liked, improve = EXCLUDED.improve,
        quote_ok = EXCLUDED.quote_ok, updated_at = now();
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_event_feedback(uuid, smallint, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_event_feedback(uuid, smallint, text, text, boolean) TO authenticated;
