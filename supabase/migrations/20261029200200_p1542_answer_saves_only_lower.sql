-- P1542 review round 10: an answer save can only LOWER the quote permission; only the box can raise it.
-- diffed against: 20261029200100_p1542_quote_ok_only_by_box.sql (save_event_feedback);
--   20261002220000_p1389_event_close.sql (get_event_close_results; the event_feedback.quote_ok column comment)
-- client-safe: same signatures and grants; the current client sends NULL (unchanged effect), an older cached client's
--   explicit true no longer raises a refusal, its explicit false still lowers; the results function only drops rows
--   that hold no answer
--
-- WHY. 20261029200100 kept the stored permission when p_quote_ok is NULL, but still STORED an explicit value — so an
-- older tab, cached before that change and still sending p_quote_ok = true with every answer save, overwrote a refusal
-- made with the box. Now, on an existing row, an answer save keeps the stored permission unless it explicitly sends
-- false; a first save with nothing stored keeps the founder default (true when NULL). set_event_quote_ok, the box's own
-- write, is the only way the permission goes up.
--
-- CORRECTS 20261029200100's header, whose client-safe line said an older client's true/false "is stored exactly as in
-- 20261029200000": a true over a stored false is not stored any more (this file).
--
-- ALSO: a row holding only the box (an untick before any answer: score, liked and improve all NULL) is not an answer,
-- so get_event_close_results leaves it out (it listed it as a blank respondent); and the column comment, which still
-- said "never true without liked text", now describes the permission as it is.

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
          COALESCE(p_quote_ok, true))
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET score = EXCLUDED.score, liked = EXCLUDED.liked, improve = EXCLUDED.improve,
        -- An answer save may only lower the permission (an explicit false); set_event_quote_ok alone raises it.
        quote_ok = CASE WHEN p_quote_ok IS FALSE THEN false ELSE public.event_feedback.quote_ok END,
        updated_at = now();
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_event_feedback(uuid, smallint, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_event_feedback(uuid, smallint, text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_event_close_results(p_event_id uuid)
RETURNS TABLE (
  name        text,
  score       smallint,
  liked       text,
  improve     text,
  asks        jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT p.name, f.score, f.liked, f.improve,
         (SELECT jsonb_agg(jsonb_build_object('ask', a.ask, 'answer', a.answer, 'detail', a.detail) ORDER BY a.answered_at)
            FROM public.personal_ask_answers a WHERE a.event_id = p_event_id AND a.user_id = f.user_id)
  FROM public.event_feedback f
  JOIN public.profiles p ON p.id = f.user_id
  WHERE f.event_id = p_event_id
    -- A row holding only the quote box is not an answer (P1542 round 10).
    AND (f.score IS NOT NULL OR f.liked IS NOT NULL OR f.improve IS NOT NULL)
  ORDER BY f.created_at;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_event_close_results(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_close_results(uuid) TO authenticated;

COMMENT ON COLUMN public.event_feedback.quote_ok IS
  'Permission to quote `liked` to promote future events (founder 2026-10-04). Written by the person''s own box '
  '(set_event_quote_ok), the only way it goes up; an answer save keeps it or lowers it (save_event_feedback). It may be '
  'true with no words: every reader that publishes a quote also requires `liked` (P1542, 20261029200200).';
