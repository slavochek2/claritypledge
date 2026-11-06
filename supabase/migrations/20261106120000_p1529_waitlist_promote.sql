-- P1529 D24 (founder UAT round 1, 2026-11-06): the host moves a person from the waiting list into the participants, and the
-- waiting list is shown just below the participant list to the host and to the registered attendees.
--
-- new function: host_add_from_waitlist, get_event_waitlist_public
-- client-safe: two new functions, no table or existing function changes. The confirmation email is sent by the client after the call
-- (send-event-emails, action 'rsvp' with the person's id, now accepted from the event's host), exactly as after a normal registration.
--
-- host_add_from_waitlist registers the person with the answers they stored when they joined the list, in one transaction: the same
-- event_registration_answers row register_for_event writes, the event_rsvps row, and the removal of their list entry. The limit
-- max_attendees is not checked: the host decides. A person the host removed earlier is still refused by the removal trigger
-- (p1515_refuse_removed_registration, 42501): adding someone from the list does not undo a removal.
--
-- get_event_waitlist_public returns the list to the host and to people holding a registration; everyone else gets an empty list.
-- It returns what the participant list shows for a person (name, slug, avatar) and the position. No email, no answers.
-- diffed against: 20261106010100_p1529_registration_where_to_prepare.sql (register_for_event; the answers upsert and the rsvp
--   insert are the same columns), 20261021100000_p1515_artifact_sharing.sql (remove_event_attendee; the host check is the same).

BEGIN;

-- Returns 'ok' (registered from the list) or 'already' (they already had a place; their list entry is cleared).
-- Raises 42501 for anyone but the event's host, 22023 when the person is neither registered nor on the list or the event is cancelled.
CREATE OR REPLACE FUNCTION public.host_add_from_waitlist(p_event uuid, p_user uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_entry public.event_waitlist%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF p_event IS NULL OR p_user IS NULL THEN
    RAISE EXCEPTION 'not authorized for this event' USING ERRCODE = '42501';
  END IF;
  -- The same row lock register_for_event and join_event_waitlist take: an add and a join cannot interleave.
  SELECT * INTO v_event FROM public.events e WHERE e.id = p_event AND e.host_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this event' USING ERRCODE = '42501';
  END IF;
  IF v_event.status = 'cancelled' THEN
    RAISE EXCEPTION 'this event is cancelled' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = p_event AND r.profile_id = p_user) THEN
    DELETE FROM public.event_waitlist w WHERE w.event_id = p_event AND w.profile_id = p_user;
    RETURN 'already';
  END IF;

  SELECT * INTO v_entry FROM public.event_waitlist w WHERE w.event_id = p_event AND w.profile_id = p_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'this person is not on the waiting list' USING ERRCODE = '22023';
  END IF;

  -- The answers first: the insert trigger on event_rsvps refuses a registration in this flow without them.
  INSERT INTO public.event_registration_answers AS a
    (event_id, profile_id, participation, observer_prep, phone, hope, recording_accepted_at)
  VALUES (p_event, p_user, v_entry.participation, v_entry.observer_prep, v_entry.phone, v_entry.hope, v_entry.recording_accepted_at)
  ON CONFLICT (event_id, profile_id) DO UPDATE
    SET participation = EXCLUDED.participation, observer_prep = EXCLUDED.observer_prep, phone = EXCLUDED.phone,
        hope = EXCLUDED.hope, recording_accepted_at = EXCLUDED.recording_accepted_at, updated_at = now();

  INSERT INTO public.event_rsvps (event_id, profile_id) VALUES (p_event, p_user);
  DELETE FROM public.event_waitlist w WHERE w.event_id = p_event AND w.profile_id = p_user;
  RETURN 'ok';
END;
$$;
REVOKE ALL ON FUNCTION public.host_add_from_waitlist(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_add_from_waitlist(uuid, uuid) TO authenticated;

-- The waiting list as the event page shows it: in the order people joined, position 1 first.
CREATE OR REPLACE FUNCTION public.get_event_waitlist_public(p_event uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_event IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  IF NOT (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event AND e.host_id = v_uid)
    OR EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = p_event AND r.profile_id = v_uid)
  ) THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'profile_id', q.profile_id,
             'name', COALESCE(q.name, 'Someone'),
             'slug', q.slug,
             'avatar_color', q.avatar_color,
             'avatar_url', q.avatar_url,
             'has_pledged', COALESCE(q.has_pledged, false),
             'position', q.position)
           ORDER BY q.position)
      FROM (
        SELECT w.profile_id, p.name, p.slug, p.avatar_color, p.avatar_url, p.has_pledged,
               row_number() OVER (ORDER BY w.joined_at, w.id) AS position
          FROM public.event_waitlist w
          LEFT JOIN public.profiles p ON p.id = w.profile_id
         WHERE w.event_id = p_event
      ) q
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.get_event_waitlist_public(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_waitlist_public(uuid) TO authenticated;

COMMIT;
