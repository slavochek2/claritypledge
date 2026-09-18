-- P1114: the rating attaches through its own RPC, which can never change an answer.
-- new function: set_room_rating (no prior definition to diff against).
--
-- follows: 20260918120000_p1114_opt_in_before_rating.sql (the tap writes the answer with
--   no rating). That migration had the client attach the number by calling
--   set_room_opt_in AGAIN with the answer it last saw. Adversarial review (2026-09-18,
--   Codex + Opus) found the hole: a rating call is an ANSWER call, so a delayed or stale
--   one re-answers. Device A taps Opt in; device B then resets and chooses Opt out; A's
--   rating arrives carrying `true` — set_room_opt_in sees an answer change, flips the
--   person back to Opt in and inserts a history row for a change they never made.
--
-- set_room_rating is compare-and-set: it writes the number only while the row still holds
-- the answer the client rated AND has no number yet. Otherwise it refuses (P0001) and
-- changes nothing; the client re-reads and shows the current state. It never touches
-- opted_in and never writes event_room_answers.
--
-- set_room_opt_in is unchanged, so the pre-2026-09-18 client (answer + rating in one call)
-- keeps working during the deploy window.
--
-- RESEARCH-DATA DEFINITION CUTOFF (2026-09-18). From this migration on, an
-- event_room_answers row is written at the TAP, not at the rating Submit: its answered_at
-- is the tap time, its cascade_count counts people who have tapped Opt in (rated or not),
-- and a tapped-but-never-rated answer still has a history row (and may stay on the frozen
-- roster with comprehension_rating NULL). Rows before and after this date are not
-- directly comparable.
--
-- client-safe: new function, nothing calls it until the new frontend ships.

CREATE OR REPLACE FUNCTION public.set_room_rating(p_member_id uuid, p_expected_opted_in boolean, p_comprehension smallint)
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
  IF now() >= v_event_datetime + public.event_grace_interval() THEN
    RAISE EXCEPTION 'this room is closed' USING ERRCODE = '42501';
  END IF;

  IF p_expected_opted_in IS NULL OR p_comprehension IS NULL THEN
    RAISE EXCEPTION 'an answer and a rating are required' USING ERRCODE = '23514';
  END IF;

  -- Compare-and-set: the answer this number was given for must still be the answer on the
  -- row, and the row must not be rated yet.
  IF v_member.opted_in IS DISTINCT FROM p_expected_opted_in OR v_member.comprehension_rating IS NOT NULL THEN
    RAISE EXCEPTION 'your answer changed before the rating arrived' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  UPDATE public.event_room_members
     SET comprehension_rating = p_comprehension
   WHERE id = p_member_id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.set_room_rating(uuid, boolean, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_room_rating(uuid, boolean, smallint) TO authenticated;
