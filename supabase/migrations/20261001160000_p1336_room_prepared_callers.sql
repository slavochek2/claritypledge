-- diffed against: 20261001150000_p1336_room_prepared.sql (same feature, same day; the only prior
--   definition of get_event_room_prepared).
-- P1336 review fix (2026-10-01): only people coming to the event, or its host, read who prepared.
--
-- client-safe: same signature and return type; the body adds a caller check.
--
-- The roster's check mark is for the people in the room. Before this, any signed-in account could
-- ask for any event's list. A caller who is neither registered for the event nor its host now gets
-- an empty list (not an error: the room page treats a failed read as "keep what is shown").

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
     AND (
       EXISTS (SELECT 1 FROM public.event_rsvps me WHERE me.event_id = p_event_id AND me.profile_id = auth.uid())
       OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event_id AND e.host_id = auth.uid())
     );
$$;

REVOKE ALL ON FUNCTION public.get_event_room_prepared(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_room_prepared(uuid) TO authenticated;
