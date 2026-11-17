-- P1700 (founder, 2026-11-17): a person the host removes from an event is told, by email and on the event page.
-- Spec: features/p1700_removed_attendee_notice.md
--
-- 1. event_removals gains three columns, read and written only by SECURITY DEFINER code and the service role (the table keeps
--    RLS on with no policies and no client grants, 20261021100000_p1515_artifact_sharing.sql:100-114):
--      had_registration    whether this removal actually deleted a registration (false: waitlisted only, or already gone)
--      scheduled_message_ids the removed registration's scheduled-email ids (reminder, feedback, starting_soon), so the
--                          send-event-emails 'removed' action can cancel them after the registration row is gone
--      notified_at         the one-time claim of the removal email; NULL until claimed, released again if the send fails
--    (Named scheduled_message_ids, not after the registration's column: P1425's guard reserves every assignment of
--    a column called mailgun_message_ids for set_rsvp_message_ids.)
-- 2. remove_event_attendee: same guards and order (the removal record first, then the delete). It now copies the
--    registration's mailgun_message_ids onto the removal row before the delete, and sets had_registration by UPDATE after
--    the delete. UPDATE, because the insert is ON CONFLICT DO NOTHING: a repeated removal must not lose the first one's
--    facts, and a later removal of someone who registered again (impossible today: the trigger refuses it) would still be
--    recorded truthfully.
-- 3. my_event_removed(p_event): the caller's OWN removal status only. Anonymous gets false. No argument names another user.
--
-- diffed against: remove_event_attendee 20261021100000_p1515_artifact_sharing.sql (the only definition).
-- client-safe: additive columns with defaults, one new function; remove_event_attendee keeps its signature and return.

ALTER TABLE public.event_removals
  ADD COLUMN IF NOT EXISTS had_registration boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scheduled_message_ids jsonb,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

CREATE OR REPLACE FUNCTION public.remove_event_attendee(p_event uuid, p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ids jsonb;
  v_deleted integer;
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

  -- P1700: what the registration had scheduled, read before the row goes.
  SELECT r.mailgun_message_ids INTO v_ids
    FROM public.event_rsvps r WHERE r.event_id = p_event AND r.profile_id = p_user;

  DELETE FROM public.event_rsvps r WHERE r.event_id = p_event AND r.profile_id = p_user;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted > 0 THEN
    UPDATE public.event_removals x
       SET had_registration = true,
           scheduled_message_ids = v_ids
     WHERE x.event_id = p_event AND x.user_id = p_user;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.remove_event_attendee(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_event_attendee(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_event_removed(p_event uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.event_removals x WHERE x.event_id = p_event AND x.user_id = (SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.my_event_removed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_event_removed(uuid) TO anon, authenticated;
