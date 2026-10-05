-- new function
-- client-safe: two new tables and new functions only; nothing a deployed client reads changes.
-- P1389: the evening close at /events/:slug/close — feedback, the position re-check, topics,
-- the next event, and at most ONE personal ask per person per event.
--
-- SHAPE. Same as P1347: both tables RLS-enabled with NO policies; every access is a
-- SECURITY DEFINER function, so what leaves the database is a RETURNS list, never a row.
--
--   event_feedback        — one row per (event, person): 0-10 recommend, what they liked
--                           and for whom, what to improve. Replaces the Tally form, which is
--                           kept running for one event (spec AC: rows exist before cut-over).
--   personal_ask_answers  — append-only taps on the four personal asks. Founder rule
--                           (2026-10-02): ONLY A TAP COUNTS — showing an ask records nothing.
--
-- INVARIANTS
--   * Which asks a person can get depends on how many evenings of this series they have come
--     to (founder, 2026-10-04): 1st evening community, 2nd the session gift, 3rd+ "can I help".
--     Counted from registrations (event_rsvps), the only attendance record that exists.
--   * One personal ask per person per event: once any ask is answered for an event, no
--     other ask is offered for that event (re-answering the same ask is allowed).
--   * A "yes" is never re-asked. A "no" is quiet for 90 days from the tap.
--   * Quoting: event_feedback.quote_ok, set with the words in one write (true only with text).
--     'quote' stays a valid historical value of personal_ask_answers.ask but is never offered.
--   * Only attendees (RSVP) and the host reach any of this.
--   * Feedback is founder-only to read: get_event_close_results() asserts admin.

-- ─── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE public.event_feedback (
  event_id    uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score       smallint CHECK (score IS NULL OR score BETWEEN 0 AND 10),
  liked       text CHECK (liked IS NULL OR char_length(liked) <= 2000),
  improve     text CHECK (improve IS NULL OR char_length(improve) <= 2000),
  -- Founder (2026-10-04): permission to quote `liked` to promote future events is a checkbox
  -- on the feedback itself, saved in the same write as the words, so it always covers exactly
  -- the text on record. Never true without liked text.
  quote_ok    boolean NOT NULL DEFAULT false,
  -- Set when the person reaches the thank-you (round-10b review): skipped text is NULL like
  -- unanswered text, so only this tells "finished" from "left half way".
  finished_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE public.personal_ask_answers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id     uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  -- 'connect' (round 10b) replaced 'intros' and 'need'; the old names stay valid for rows already written.
  ask          text NOT NULL CHECK (ask IN ('community', 'need', 'quote', 'intros', 'connect')),
  answer       text NOT NULL CHECK (answer IN ('yes', 'no')),
  -- 'need' yes: what they need (free text to the host, never shown to anyone else).
  detail       text CHECK (detail IS NULL OR char_length(detail) <= 1000),
  answered_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX personal_ask_answers_user_idx ON public.personal_ask_answers (user_id, ask, answered_at DESC);
CREATE INDEX personal_ask_answers_event_idx ON public.personal_ask_answers (event_id, user_id);

ALTER TABLE public.event_feedback       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_ask_answers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_feedback, public.personal_ask_answers FROM anon, authenticated;

-- ─── Helpers (not callable by clients) ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.p1389_is_attendee(p_event_id uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_user IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = p_event_id AND r.profile_id = p_user)
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event_id AND e.host_id = p_user)
  );
$$;

/** Evenings of this series the person registered for, up to and including this one: same host,
 *  same kind (a Clarity Night counts Clarity Nights), not after this event. */
CREATE OR REPLACE FUNCTION public.p1389_evenings(p_event_id uuid, p_user uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer
  FROM public.events cur
  JOIN public.events e ON e.host_id = cur.host_id
    AND (e.title ILIKE '%clarity night%') = (cur.title ILIKE '%clarity night%')
    AND e.datetime <= cur.datetime
    AND e.status IS DISTINCT FROM 'cancelled'
  JOIN public.event_rsvps r ON r.event_id = e.id AND r.profile_id = p_user
  WHERE cur.id = p_event_id;
$$;

/** The community a person is invited to from this event (founder, 2026-10-04: the real groups,
 *  not a chat link): the event's own group when it has one, else Chiang Mai by location, else
 *  the online group. NULL when that group does not exist. */
CREATE OR REPLACE FUNCTION public.p1389_community_org(p_event_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    e.org_id,
    (SELECT o.id FROM public.organization o
      WHERE o.slug = CASE WHEN e.location ILIKE '%chiang mai%' THEN 'cm' ELSE 'online' END))
  FROM public.events e WHERE e.id = p_event_id;
$$;

/** The ask to offer this person at this event, or NULL. Order: community → intros (the session
 *  gift) → need, each only from the evening it opens at. */
-- Founder (round 10b, one flow): every ask that still applies, in order — join the community,
-- then connect with the host on LinkedIn. Each is a step of its own; none waits for a later evening.
DROP FUNCTION IF EXISTS public.p1389_next_ask(uuid, uuid);
CREATE OR REPLACE FUNCTION public.p1389_offered_asks(p_event_id uuid, p_user uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ask text;
  v_has_chat boolean;
  v_org uuid;
  v_has_linkedin boolean;
  v_out text[] := ARRAY[]::text[];
BEGIN
  -- The host gives feedback too, but is never asked to join his own group or connect with himself.
  IF EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event_id AND e.host_id = p_user) THEN
    RETURN v_out;
  END IF;
  -- Community = joining the group (p1389_community_org); offered while the person is not a member.
  v_org := public.p1389_community_org(p_event_id);
  v_has_chat := v_org IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.membership m WHERE m.org_id = v_org AND m.user_id = p_user);
  -- Same visibility rule as get_profile_by_id (P877): a LinkedIn link is public only for a
  -- verified, pledged profile — never offer a link the attendee's page is not allowed to read.
  v_has_linkedin := EXISTS (
    SELECT 1 FROM public.events e JOIN public.profiles p ON p.id = e.host_id
    WHERE e.id = p_event_id AND NULLIF(btrim(p.linkedin_url), '') IS NOT NULL
      AND COALESCE(p.is_verified, false) AND COALESCE(p.has_pledged, false));
  FOREACH v_ask IN ARRAY ARRAY['community', 'connect'] LOOP
    CONTINUE WHEN v_ask = 'community' AND NOT COALESCE(v_has_chat, false);
    CONTINUE WHEN v_ask = 'connect' AND NOT v_has_linkedin;
    -- Answered this evening → done for tonight (a yes or a no).
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.personal_ask_answers a
      WHERE a.user_id = p_user AND a.event_id = p_event_id AND a.ask = v_ask);
    -- Ever said yes → never again.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.personal_ask_answers a
      WHERE a.user_id = p_user AND a.ask = v_ask AND a.answer = 'yes');
    -- Said no in the last 90 days → quiet.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.personal_ask_answers a
      WHERE a.user_id = p_user AND a.ask = v_ask AND a.answer = 'no'
        AND a.answered_at > now() - interval '90 days');
    v_out := v_out || v_ask;
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.p1389_is_attendee(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.p1389_offered_asks(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.p1389_evenings(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.p1389_community_org(uuid) FROM PUBLIC, anon, authenticated;

-- The group the community ask shows (its slug only; the group page is public).
CREATE OR REPLACE FUNCTION public.get_event_community_slug(p_event_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT o.slug FROM public.organization o WHERE o.id = public.p1389_community_org(p_event_id);
$$;

REVOKE EXECUTE ON FUNCTION public.get_event_community_slug(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_community_slug(uuid) TO authenticated;

-- ─── Next-event card: how many people came to this series before ────────────

CREATE OR REPLACE FUNCTION public.get_event_series_people(p_event_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- A count only, never who. Same series rule as p1389_evenings, events before this one.
  SELECT count(DISTINCT r.profile_id)::integer
  FROM public.events cur
  JOIN public.events e ON e.host_id = cur.host_id
    AND (e.title ILIKE '%clarity night%') = (cur.title ILIKE '%clarity night%')
    AND e.datetime < cur.datetime
    AND e.status IS DISTINCT FROM 'cancelled'
  JOIN public.event_rsvps r ON r.event_id = e.id
  WHERE cur.id = p_event_id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_event_series_people(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_series_people(uuid) TO authenticated;

-- ─── Attendee read: my close state ─────────────────────────────────────────

-- quote_ok joined the result (a returning visitor's refusal to be quoted must survive a re-save):
-- a changed RETURNS TABLE cannot be replaced in place.
DROP FUNCTION IF EXISTS public.get_event_close(uuid);
CREATE OR REPLACE FUNCTION public.get_event_close(p_event_id uuid)
RETURNS TABLE (
  is_attendee   boolean,
  score         smallint,
  liked         text,
  improve       text,
  quote_ok      boolean,
  asks          text[],
  finished      boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF NOT public.p1389_is_attendee(p_event_id, v_user) THEN
    RETURN QUERY SELECT false, NULL::smallint, NULL::text, NULL::text, NULL::boolean, ARRAY[]::text[], false;
    RETURN;
  END IF;
  RETURN QUERY
  SELECT
    true,
    f.score, f.liked, f.improve, f.quote_ok,
    public.p1389_offered_asks(p_event_id, v_user),
    f.finished_at IS NOT NULL
  FROM (SELECT 1) one
  LEFT JOIN public.event_feedback f ON f.event_id = p_event_id AND f.user_id = v_user;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_event_close(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_close(uuid) TO authenticated;

-- ─── Attendee writes ───────────────────────────────────────────────────────

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
          COALESCE(p_quote_ok, false) AND COALESCE(btrim(p_liked), '') <> '')
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET score = EXCLUDED.score, liked = EXCLUDED.liked, improve = EXCLUDED.improve,
        quote_ok = EXCLUDED.quote_ok, updated_at = now();
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_event_feedback(uuid, smallint, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_event_feedback(uuid, smallint, text, text, boolean) TO authenticated;

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

/** Join the community from the close (round-9 review): the yes and the membership in ONE
 *  transaction, so a failed join can never leave a recorded yes without a membership, and a
 *  membership can never exist without its answer. Accepting the terms IS the membership row
 *  (P1010); the server defaults stamp terms_version. Returns the group's id. */
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

-- The thank-you was reached: a return visit goes straight there (round-10b review).
CREATE OR REPLACE FUNCTION public.finish_event_close(p_event_id uuid)
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
  INSERT INTO public.event_feedback (event_id, user_id, finished_at)
  VALUES (p_event_id, v_user, now())
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET finished_at = COALESCE(public.event_feedback.finished_at, now());
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.finish_event_close(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_event_close(uuid) TO authenticated;

-- ─── Founder read (scripts/event-close-results.sh reads the tables directly) ──

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
  ORDER BY f.created_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_event_close_results(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_close_results(uuid) TO authenticated;
