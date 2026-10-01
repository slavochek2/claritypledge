-- diffed against: 20261001160000_p1336_room_prepared_callers.sql (the latest definition of
--   get_event_room_prepared).
-- P1386 (founder, 2026-10-01): who prepared is for the host only — "the preparation as well is only
-- for myself so we can hide it".
--
-- client-safe: same signature and return type. Clients from P1336 that still call it as a
-- registrant get an empty list, which they already treat as "nobody to mark". The current client
-- no longer calls it: the host's marks come from get_event_prep_host_view.
--
-- Kept (not dropped) so a client cached before this deploy does not error; a caller who is not the
-- event's host now gets an empty list.

CREATE OR REPLACE FUNCTION public.get_event_room_prepared(p_event_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(array_agg(DISTINCT m.profile_id), '{}'::uuid[])
    FROM public.event_room_members m
    JOIN public.event_preparations p ON p.event_id = m.event_id AND p.profile_id = m.profile_id
    JOIN public.event_rsvps r ON r.event_id = m.event_id AND r.profile_id = m.profile_id
   WHERE m.event_id = p_event_id
     AND m.profile_id IS NOT NULL
     AND p.completed_at IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event_id AND e.host_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.get_event_room_prepared(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_room_prepared(uuid) TO authenticated;
