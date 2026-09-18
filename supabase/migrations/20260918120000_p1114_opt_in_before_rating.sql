-- P1114: the room answer is written on the tap, and the rating attaches afterwards.
--
-- diffed against: 20260907130000_p1256_event_grace_interval_12h.sql (the latest
--   CREATE of set_room_opt_in). Same signature, same auth check, same freeze boundary,
--   same advisory lock and cascade count. Two changes, both inside the body:
--     1. p_comprehension may be NULL. The answer is recorded with no rating yet.
--     2. The history row (event_room_answers) is written only when the ANSWER changes.
--        The follow-up call that brings the rating for an answer already recorded
--        updates the rating and writes no second history row.
--
-- WHY (founder, 2026-09-18): people must show as Opted in / Opted out on the roster the
-- moment they tap, not only after they submit the understanding number. Until now the
-- tap wrote nothing and the roster kept them Undecided through the rating step.
--
-- client-safe: the old client always sends a rating, and that call still behaves
-- exactly as before (answer changed -> history row + both columns written). The new
-- client sends NULL on the tap, then the same answer with the rating.
--
-- Grants are unchanged: CREATE OR REPLACE keeps them, and the signature is identical.

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
  IF now() >= v_event_datetime + public.event_grace_interval() THEN
    RAISE EXCEPTION 'this room is closed' USING ERRCODE = '42501';
  END IF;

  IF p_opted_in IS NULL THEN
    RAISE EXCEPTION 'an answer is required' USING ERRCODE = '23514';
  END IF;

  -- History records ANSWERS, not ratings: a call that only brings the rating for the
  -- answer already on the row writes no second row.
  IF v_member.opted_in IS DISTINCT FROM p_opted_in THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_member.event_id::text)::bigint);

    SELECT count(*) INTO v_cascade_count
      FROM public.event_room_members
     WHERE event_id = v_member.event_id AND opted_in = true;

    INSERT INTO public.event_room_answers (room_member_id, opted_in, cascade_count)
    VALUES (p_member_id, p_opted_in, v_cascade_count);
  END IF;

  -- A new answer with no rating clears any old rating: a number given for the previous
  -- answer must not be shown against this one.
  RETURN QUERY
  UPDATE public.event_room_members
     SET opted_in = p_opted_in,
         comprehension_rating = CASE
           WHEN p_comprehension IS NOT NULL THEN p_comprehension
           WHEN v_member.opted_in IS DISTINCT FROM p_opted_in THEN NULL
           ELSE comprehension_rating
         END
   WHERE id = p_member_id
  RETURNING *;
END;
$$;
