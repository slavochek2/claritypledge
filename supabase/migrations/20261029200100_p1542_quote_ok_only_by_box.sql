-- P1542 review round 9: the quote permission is written ONLY by the person's own action on the visible box.
-- diffed against: 20261029200000_p1542_quote_refusal_kept.sql (save_event_feedback); set_event_quote_ok is new
-- client-safe: same save_event_feedback signature and grants; a NULL p_quote_ok (new) keeps the stored value, and an
--   older client that still sends true/false is stored exactly as in 20261029200000; set_event_quote_ok is additive
--
-- WHY. Every refusal-to-true path the reviews found (rounds 4–9) came from consent held in browser state and re-sent
-- by screens that do not show the box (the score, the improvement, a stale tab). The fewer-states model:
--   1. Ticking or unticking the box saves at once, through set_event_quote_ok — the refusal is on the server from the
--      moment of the click, whatever the tab, the device or the person's storage does next.
--   2. Every other save (score, improvement, the words) sends p_quote_ok = NULL, and the stored value is kept. On the
--      first INSERT a NULL stores the founder default, true (founder 2026-10-05: ticked from the start). That is
--      harmless on its own: every reader that publishes a quote also requires the words (series review hand-off,
--      20261022120000; scripts/series-reviews.mjs), and an untick overwrites it at once.
--   3. The close shows the stored value (true when there is no row) and keeps no consent in the browser.
-- A row created only by finish_event_close keeps the column default (false): that person reopens unticked (fails safe).
-- SUPERSEDES the column comment in 20261002220000 ("saved in the same write as the words … Never true without liked
-- text"; a comment only, no CHECK constraint): quote_ok is now its own write and may be true with no words.

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
        -- NULL: not this save's business — the box's own write (set_event_quote_ok) is the only source.
        quote_ok = COALESCE(p_quote_ok, public.event_feedback.quote_ok),
        updated_at = now();
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.save_event_feedback(uuid, smallint, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_event_feedback(uuid, smallint, text, text, boolean) TO authenticated;

-- The box's own write: the person ticked or unticked "you may quote me". Creates the row if there is none yet (the
-- untick can come before any other answer), never touching the answers.
CREATE OR REPLACE FUNCTION public.set_event_quote_ok(p_event_id uuid, p_quote_ok boolean)
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
  IF p_quote_ok IS NULL THEN
    RAISE EXCEPTION 'quote permission must be true or false' USING ERRCODE = '22004';
  END IF;
  INSERT INTO public.event_feedback (event_id, user_id, quote_ok)
  VALUES (p_event_id, v_user, p_quote_ok)
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET quote_ok = EXCLUDED.quote_ok, updated_at = now();
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_event_quote_ok(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_event_quote_ok(uuid, boolean) TO authenticated;
