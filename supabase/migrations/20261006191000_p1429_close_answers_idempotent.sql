-- P1429 A5 (review round, Codex + Opus): a close answer whose response was lost is retried, and the
-- retry must succeed for the SAME answer and fail for anything else.
-- diffed against: 20261002220000_p1389_event_close.sql (answer_personal_ask, join_community_from_close)
-- client-safe: same signatures and grants; each body gains an early "already done" return.
--
-- The retry used to be refused with 22023 "this ask is not offered" (an ask answered tonight leaves
-- the offered list). The first client fix inferred success from the ask being gone after a re-read,
-- which also reported "You've joined" when a "Not now" in another tab had ended the ask and no
-- membership existed. The server now answers the question itself: the same answer already stored
-- (and for Join, the membership present) returns success; everything else keeps its error.

CREATE OR REPLACE FUNCTION public.answer_personal_ask(
  p_event_id uuid, p_ask text, p_answer text, p_detail text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_detail text;
BEGIN
  IF NOT public.p1389_is_attendee(p_event_id, v_user) THEN
    RAISE EXCEPTION 'not an attendee of this event' USING ERRCODE = '42501';
  END IF;
  -- Only the ask the server would offer right now can be answered: this is what holds
  -- "one per event" and "a yes is never re-asked" against a hand-made call.
  -- Two taps (or two hand-made calls) for one person and event run one at a time, so the
  -- "offered" check below cannot pass twice and leave contradictory rows.
  PERFORM pg_advisory_xact_lock(hashtext('p1389:' || v_user::text || ':' || p_event_id::text));
  -- P1429 A5: the same answer again is the retry of a write whose response was lost — it already
  -- holds, so it succeeds instead of failing (a community yes is never recorded here; see below).
  IF NOT (p_ask = 'community' AND p_answer = 'yes') AND EXISTS (
    SELECT 1 FROM public.personal_ask_answers a
     WHERE a.user_id = v_user AND a.event_id = p_event_id AND a.ask = p_ask AND a.answer = p_answer) THEN
    RETURN true;
  END IF;
  -- p1389_offered_asks leaves out an ask already answered tonight, so this also holds "one answer
  -- per ask per evening" (Back and a second tap never add a row).
  IF NOT (p_ask = ANY (public.p1389_offered_asks(p_event_id, v_user))) THEN
    RAISE EXCEPTION 'this ask is not offered' USING ERRCODE = '22023';
  END IF;
  -- A community yes IS a membership: it is recorded only by join_community_from_close, in the same
  -- transaction as the membership row, never here (a yes without membership would end the ask).
  IF p_ask = 'community' AND p_answer = 'yes' THEN
    RAISE EXCEPTION 'join through join_community_from_close' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.personal_ask_answers a WHERE a.user_id = v_user AND a.event_id = p_event_id AND a.ask = p_ask) THEN
    RAISE EXCEPTION 'already answered for this event' USING ERRCODE = '23505';
  END IF;
  -- No ask carries free text any more (round 10b): a yes or a no is the whole answer.
  v_detail := NULL;
  INSERT INTO public.personal_ask_answers (user_id, event_id, ask, answer, detail)
  VALUES (v_user, p_event_id, p_ask, p_answer, v_detail);
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.answer_personal_ask(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.answer_personal_ask(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_community_from_close(p_event_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_org uuid;
BEGIN
  IF NOT public.p1389_is_attendee(p_event_id, v_user) THEN
    RAISE EXCEPTION 'not an attendee of this event' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('p1389:' || v_user::text || ':' || p_event_id::text));
  -- P1429 A5: a Join retried after it landed succeeds — but only when the join really happened
  -- tonight: the yes is recorded AND the membership exists. A "Not now" given elsewhere still fails.
  v_org := public.p1389_community_org(p_event_id);
  IF v_org IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.personal_ask_answers a
                  WHERE a.user_id = v_user AND a.event_id = p_event_id AND a.ask = 'community' AND a.answer = 'yes')
     AND EXISTS (SELECT 1 FROM public.membership m WHERE m.org_id = v_org AND m.user_id = v_user) THEN
    RETURN v_org;
  END IF;
  IF NOT ('community' = ANY (public.p1389_offered_asks(p_event_id, v_user))) THEN
    RAISE EXCEPTION 'this ask is not offered' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.personal_ask_answers a WHERE a.user_id = v_user AND a.event_id = p_event_id AND a.ask = 'community') THEN
    RAISE EXCEPTION 'already answered for this event' USING ERRCODE = '23505';
  END IF;
  v_org := public.p1389_community_org(p_event_id);
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'no community for this event' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.membership (org_id, user_id) VALUES (v_org, v_user)
  ON CONFLICT (org_id, user_id) DO NOTHING;
  INSERT INTO public.personal_ask_answers (user_id, event_id, ask, answer)
  VALUES (v_user, p_event_id, 'community', 'yes');
  RETURN v_org;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_community_from_close(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_community_from_close(uuid) TO authenticated;
