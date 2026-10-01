-- new function: get_event_room_prepared(uuid).
-- P1336 UAT fix (2026-10-01): the room roster shows who prepared.
--
-- client-safe: a new read-only function; nothing existing changes.
--
-- The founder's design: a small check beside "understood at 8/10" on each roster row of someone
-- who prepared, explained on hover / tap — instead of a separate "Prepared ✓" line floating
-- under the room's Back button. event_preparations is owner + host only (RLS), so the roster
-- needs one narrow read: the profile ids of THIS room's members whose preparation is complete
-- (and who are still registered). Nothing else — no step, answer, score or volunteer data, and
-- nobody who has not entered the room. Someone in the room is already on the public roster with
-- their answer (P1114, 2026-08-21); "prepared" adds no opt-in information to that.
-- Signed-in only, like the room page that reads it.

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
     AND p.completed_at IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_event_room_prepared(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_room_prepared(uuid) TO authenticated;
