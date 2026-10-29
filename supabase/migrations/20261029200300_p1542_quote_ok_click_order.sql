-- P1542 review round 11: the quote box's writes are ordered by WHEN THE PERSON CLICKED, on the server.
-- diffed against: 20261029200100_p1542_quote_ok_only_by_box.sql (set_event_quote_ok, 2 arguments)
-- client-safe: no deployed client calls set_event_quote_ok — the 2-argument form was added by 20261029200100, which
--   is on TEST only (prod has never had it: checked read-only, prod's public functions of that name are none). It is
--   restated here (same signature and grants, nothing dropped) to refuse every call — "superseded", SQLSTATE 0A000 —
--   so no caller can write the box unordered; the client shipping with this change calls only the new
--   set_event_quote_ok(uuid, boolean, timestamptz), which has no defaults, so the two never make a call ambiguous.
--   Column add is additive.
--
-- WHY. Rounds 10–11 ordered the box's writes in the browser (a queue), and each fix opened another hole: a failed
-- write blocked every later Submit, the queue did not survive the close being drawn again, and a click made during a
-- Submit was missed. Ordering belongs where every tab, remount and device meet — the row. Each click carries the
-- time it was made (the person's own clock: one person's clicks are ordered on it); a write is applied only when its
-- click is newer than the one on record, so a stale or late write from anywhere can never overwrite a newer click.
-- The click time is clamped to now() + 1 minute, so a skewed or hand-made future time cannot freeze the box.
--
-- Answer saves are unchanged (20261029200200): they never raise the permission and do not touch quote_ok_at.

ALTER TABLE public.event_feedback ADD COLUMN IF NOT EXISTS quote_ok_at timestamptz;
COMMENT ON COLUMN public.event_feedback.quote_ok_at IS
  'When the person last clicked the quote box (their clock, clamped to now() + 1 minute). set_event_quote_ok applies a '
  'click only if it is newer than this (P1542, 20261029200300). NULL: never clicked.';

-- The unordered 2-argument form: kept (a DROP is a founder decision), but it writes nothing any more.
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
  RAISE EXCEPTION 'superseded: use set_event_quote_ok(uuid, boolean, timestamptz)' USING ERRCODE = '0A000';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_event_quote_ok(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_event_quote_ok(uuid, boolean) TO authenticated;

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
