-- P1700 review fix (/finish, 2026-11-17): remove_event_attendee reads the registration's scheduled-email ids in the same
-- statement that deletes it. Spec: features/p1700_removed_attendee_notice.md
--
-- Before: a SELECT of mailgun_message_ids, then a separate DELETE. A dispatcher writing a fresh reminder id onto that
-- registration between the two statements left the new id unread, so the 'removed' action could not cancel it and the
-- removed person still got the reminder (Gemini review finding). DELETE ... RETURNING reads the row it deletes.
--
-- diffed against: 20261117171000_p1700_removal_notice.sql (remove_event_attendee). diff: the SELECT + DELETE pair becomes
-- one DELETE ... RETURNING; v_deleted comes from whether a row came back. Guards, order and grants unchanged.
-- client-safe: same signature and return.

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
END;
$$;
REVOKE ALL ON FUNCTION public.remove_event_attendee(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_event_attendee(uuid, uuid) TO authenticated;
