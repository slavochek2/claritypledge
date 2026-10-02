-- new functions: none. Replaces host_set_round_seats from 20261002183700_p1337_event_rounds.sql;
--   the only change is the DELETE on event_round_tables after validation (diff against that file).
--
-- P1337 (code review): a swap or regroup kept a table's "we're talking about this one" mark
-- although the people at that table changed — two people who never chose a statement would see
-- "Your table chose …", and a recording would be linked to it. A table whose member set changes
-- now loses its mark; a table whose people only changed roles keeps it.
--
-- client-safe: same signature, same grants; behaviour change is limited to clearing stale marks.

CREATE OR REPLACE FUNCTION public.host_set_round_seats(p_round_id uuid, p_seats jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event uuid;
  v_host uuid;
  v_round_no int;
  v_last int;
BEGIN
  SELECT r.event_id, r.round_no, e.host_id INTO v_event, v_round_no, v_host
    FROM public.event_rounds r JOIN public.events e ON e.id = r.event_id
   WHERE r.id = p_round_id;
  IF v_host IS NULL OR v_host IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'only the host can change seats' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || v_event::text, 0));

  SELECT max(r.round_no) INTO v_last FROM public.event_rounds r WHERE r.event_id = v_event;
  IF v_round_no IS DISTINCT FROM v_last THEN
    RAISE EXCEPTION 'only the current round can be changed' USING ERRCODE = '22023';
  END IF;

  PERFORM public.p1337_assert_valid_seats(v_event, p_seats);

  -- A table whose people changed loses its marked statement: nobody now at that table chose
  -- it, and the mark is what links a recording to a statement. Compared BEFORE the seats move.
  DELETE FROM public.event_round_tables tt
   WHERE tt.round_id = p_round_id
     AND (SELECT array_agg(s.room_member_id ORDER BY s.room_member_id)
            FROM public.event_round_seats s
           WHERE s.round_id = p_round_id AND s.table_no = tt.table_no)
         IS DISTINCT FROM
         (SELECT array_agg(x.m ORDER BY x.m)
            FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text)
           WHERE x.t = tt.table_no);

  DELETE FROM public.event_round_seats s
   WHERE s.round_id = p_round_id
     AND s.room_member_id NOT IN (SELECT x.m FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text));

  INSERT INTO public.event_round_seats AS s (round_id, room_member_id, table_no, role)
  SELECT p_round_id, x.m, x.t, x.r FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text)
  ON CONFLICT (round_id, room_member_id) DO UPDATE
    SET role = EXCLUDED.role,
        confirmed_at = CASE WHEN s.table_no = EXCLUDED.table_no THEN s.confirmed_at END,
        position_moved = CASE WHEN s.table_no = EXCLUDED.table_no THEN s.position_moved END,
        table_no = EXCLUDED.table_no;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.host_set_round_seats(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_set_round_seats(uuid, jsonb) TO authenticated;
