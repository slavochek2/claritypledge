-- P1114 follow-up: public roster reversal + comprehension-rating reinstatement.
--
-- diffed against: 20260819170000_p1114_event_room_rpcs.sql (set_room_opt_in redefinition
-- below — dropped and recreated with an added p_comprehension parameter; reset_room_answer
-- is a new function, not a redefinition)
--
-- client-safe: 20260819160000/20260819170000 (the P1114 base) have never shipped to prod
-- — feature/p1114-event-room is unmerged — so there is no deployed client relying on the
-- old `opted_in = true` SELECT policy or the 2-arg set_room_opt_in signature this migration
-- changes. They HAVE been applied to the shared TEST database already (migrate.sh tracks
-- by filename/version, not content, so editing those two files in place would silently be
-- a no-op there) — this is a genuinely new, forward migration for that reason, not a
-- decision to abandon the "edit in place while unshipped" convention those files still
-- document for anyone reading them from scratch.
--
-- Two decisions, both founder-confirmed in chat 2026-08-21 (recorded in decisions.md same
-- date), landing together because the second is what makes the first meaningful:
--
--   1. PUBLIC ROSTER REVERSAL — every room member is now visible by name regardless of
--      answer (opted-in / opted-out / undecided), reversing the original Decision 2. The
--      founder's use case is a facilitator running a live, in-person, projected room —
--      "who's still undecided" is deliberately meant to be visible to everyone present, as
--      a facilitation device ("guys, move yourself from undecided to opt in or opt out").
--      That is a materially different context than the original policy guarded against (an
--      anonymous crowd where a non-answer becomes unwanted public pressure) — everyone here
--      is already physically in the room. This also fixes "the roster doesn't update
--      without a refresh" as a side effect: that symptom was the SAME RLS filter blocking
--      Realtime delivery for any transition INTO a hidden state, not a separate bug.
--
--   2. COMPREHENSION RATING REINSTATED — the room build originally cut the "how much do you
--      understand" 0-10 rating from the general /meet flow (spec revision 2: designed for a
--      two-person phone handoff, doesn't apply to a room). The founder now wants it back,
--      required before EITHER opt-in or opt-out (not just opt-in), shown publicly next to
--      each name on the roster. Plus an explicit "change my choice" action that clears both
--      the answer and the rating back to undecided, rather than only ever overwriting one
--      answer with another.
--
-- Do not revert either decision without the same reasoning being re-litigated — see the
-- pointer comments left in the two superseded files for where the old reasoning lived.

-- ============================================================================
-- 1. comprehension_rating column
-- ============================================================================
ALTER TABLE public.event_room_members
  ADD COLUMN IF NOT EXISTS comprehension_rating SMALLINT
  CHECK (comprehension_rating IS NULL OR comprehension_rating BETWEEN 0 AND 10);
-- NULL = not yet given one. Required (NOT NULL at the moment of answering) by the revised
-- set_room_opt_in below, for both opt-in and opt-out — this CHECK only bounds the range,
-- same split readiness_value already uses (range on the column, "required now" in the RPC).

-- ============================================================================
-- 2. Column-level grant — re-issued to include the new column
-- ============================================================================
-- Same belt-and-suspenders REVOKE-then-GRANT idiom as the base migration. client_secret
-- stays excluded — this migration widens which ROWS are visible (below), never which
-- COLUMNS are.
REVOKE SELECT ON public.event_room_members FROM PUBLIC;
REVOKE SELECT ON public.event_room_members FROM anon, authenticated;
GRANT SELECT (id, event_id, profile_id, display_name, opted_in, readiness_value, comprehension_rating, joined_at)
  ON public.event_room_members TO anon, authenticated;

-- ============================================================================
-- 3. SELECT policy — every room member visible, not just opted-in ones
-- ============================================================================
DROP POLICY IF EXISTS "opted-in room members are visible" ON public.event_room_members;
DROP POLICY IF EXISTS "all room members are visible" ON public.event_room_members;
CREATE POLICY "all room members are visible"
  ON public.event_room_members FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============================================================================
-- 4. set_room_opt_in — now requires a comprehension rating, for either answer
-- ============================================================================
DROP FUNCTION IF EXISTS public.set_room_opt_in(uuid, boolean);

CREATE OR REPLACE FUNCTION public.set_room_opt_in(p_member_id uuid, p_opted_in boolean, p_comprehension smallint)
RETURNS SETOF public.event_room_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member public.event_room_members;
  v_event_datetime timestamptz;
  v_cascade_count integer;
BEGIN
  SELECT * INTO v_member FROM public.event_room_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR v_member.profile_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not authorized to change this answer' USING ERRCODE = '42501';
  END IF;

  SELECT datetime INTO v_event_datetime FROM public.events WHERE id = v_member.event_id;
  IF now() >= v_event_datetime + interval '5 hours' THEN
    RAISE EXCEPTION 'this room is closed' USING ERRCODE = '42501';
  END IF;

  -- A rating is required to answer at all, opt-in or opt-out alike.
  IF p_comprehension IS NULL THEN
    RAISE EXCEPTION 'a comprehension rating is required to answer' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_member.event_id::text)::bigint);

  SELECT count(*) INTO v_cascade_count
    FROM public.event_room_members
   WHERE event_id = v_member.event_id AND opted_in = true;

  INSERT INTO public.event_room_answers (room_member_id, opted_in, cascade_count)
  VALUES (p_member_id, p_opted_in, v_cascade_count);

  RETURN QUERY
  UPDATE public.event_room_members
     SET opted_in = p_opted_in, comprehension_rating = p_comprehension
   WHERE id = p_member_id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.set_room_opt_in(uuid, boolean, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_room_opt_in(uuid, boolean, smallint) TO authenticated;

-- ============================================================================
-- 5. reset_room_answer — "change my choice": back to undecided, no history row
-- ============================================================================
-- No event_room_answers row here — that table's opted_in column is NOT NULL, so a
-- withdrawal isn't representable there without a schema change. This clears the prior
-- answer; it doesn't need to look like a new one. The prior answer's own history row
-- (already written by set_room_opt_in) is sufficient for the research question spec §7
-- names — it does not need to also know a later reset happened.
CREATE OR REPLACE FUNCTION public.reset_room_answer(p_member_id uuid)
RETURNS SETOF public.event_room_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member public.event_room_members;
  v_event_datetime timestamptz;
BEGIN
  SELECT * INTO v_member FROM public.event_room_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR v_member.profile_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not authorized to change this answer' USING ERRCODE = '42501';
  END IF;

  SELECT datetime INTO v_event_datetime FROM public.events WHERE id = v_member.event_id;
  IF now() >= v_event_datetime + interval '5 hours' THEN
    RAISE EXCEPTION 'this room is closed' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.event_room_members
     SET opted_in = NULL, comprehension_rating = NULL
   WHERE id = p_member_id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_room_answer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_room_answer(uuid) TO authenticated;
