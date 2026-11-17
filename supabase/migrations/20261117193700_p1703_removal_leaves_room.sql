-- P1703: a person the host removes from an event also leaves the event room.
-- Spec: features/p1703_removal_also_leaves_the_room.md
--
-- Before: remove_event_attendee recorded the removal and deleted the registration, but the person's room entry stayed
-- "here". The host still saw them under People, the next Start round could seat them, and the host had to press
-- "Mark out" by hand.
--
-- diffed against: 20261117172500_p1700_remove_returning.sql (remove_event_attendee). diff: one statement added after
-- the registration delete: an upsert into event_round_presence that sets left_at for the removed person's room member
-- row, the column the host's "Mark out" (host_set_round_presence, 20261002183700_p1337_event_rounds.sql) writes. Guards,
-- order, return type and grants unchanged.
--
-- DECISIONS
--   * INSERT ... SELECT from event_room_members, not a call to host_set_round_presence: a person who never entered the
--     room has no member row, the SELECT returns nothing and no presence row is written (host_set_round_presence would
--     raise 'not a member of this event room' and roll the whole removal back).
--   * left_at only. An existing left_at is kept (the first time they left stays the record), and an already-out row is
--     not touched at all (the DO UPDATE's WHERE), so a repeat removal writes nothing. sits_out_round is left as it is:
--     a person who has left is out of every pool whatever it says, and removal deletes nothing else (spec Non-Goals).
--   * The row itself is never deleted (P1114: the record of who was there is never deleted). Seated in an open round,
--     the existing presence trigger (_transcribe_log_presence_change, 20261101183700_p1596_final_fixes.sql) logs the
--     move off their table exactly as for a mark-out.
--   * The host can still press "Back in" for a removed person. That is the host's own explicit choice; the removal
--     record still governs registration and admission.
--
-- client-safe: same signature and return; the function's callers (canvas-service removeEventAttendee) are unchanged.

CREATE OR REPLACE FUNCTION public.remove_event_attendee(p_event uuid, p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ids jsonb;
  v_deleted boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF p_event IS NULL OR p_user IS NULL OR p_user = v_uid THEN
    RAISE EXCEPTION 'not authorized for this event' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event AND e.host_id = v_uid) THEN
    RAISE EXCEPTION 'not authorized for this event' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = p_user) THEN
    RAISE EXCEPTION 'unknown person' USING ERRCODE = '22023';
  END IF;

  -- The record first: from here on no admission check admits this person, whatever races.
  INSERT INTO public.event_removals (event_id, user_id, removed_by)
  VALUES (p_event, p_user, v_uid)
  ON CONFLICT (event_id, user_id) DO NOTHING;

  -- P1700: what the registration had scheduled, read by the statement that deletes it.
  DELETE FROM public.event_rsvps r WHERE r.event_id = p_event AND r.profile_id = p_user
  RETURNING r.mailgun_message_ids, true INTO v_ids, v_deleted;

  IF v_deleted THEN
    UPDATE public.event_removals x
       SET had_registration = true,
           scheduled_message_ids = v_ids
     WHERE x.event_id = p_event AND x.user_id = p_user;
  END IF;

  -- P1703: they also leave the room, as the host's "Mark out" would record it. No member row (never entered) = no write.
  INSERT INTO public.event_round_presence AS p (event_id, room_member_id, left_at)
  SELECT p_event, m.id, now()
    FROM public.event_room_members m
   WHERE m.event_id = p_event AND m.profile_id = p_user
  ON CONFLICT (event_id, room_member_id) DO UPDATE
    SET left_at = now(),
        updated_at = now()
    WHERE p.left_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.remove_event_attendee(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_event_attendee(uuid, uuid) TO authenticated;
