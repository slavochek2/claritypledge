-- P1603 (Codex review): a person removed from a hidden event keeps a room row, and that row alone returned other members'
-- readiness values. Now it also needs host or RSVP on a hidden event. Public events unchanged.
-- Created: 2026-11-03
-- Spec: features/p1603_hidden_events_link_only.md
--
-- client-safe: same signature and grants; returns nothing for a viewer who cannot see a hidden event.
-- diffed against: get_room_readiness_distribution 20260821180000_p1114_scope_readiness_distribution_to_members.sql (same body; one condition)

CREATE OR REPLACE FUNCTION public.get_room_readiness_distribution(p_event_id uuid)
RETURNS SETOF smallint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
-- VOLATILE (the default), NOT STABLE as the first version declared. The body calls
-- random(), which is itself VOLATILE; labelling the wrapper STABLE told the planner it may
-- cache or collapse repeated calls within a statement, which is exactly wrong for a
-- function whose ordering is a privacy property.
AS $$
  SELECT m.readiness_value
    FROM public.event_room_members m
   WHERE m.event_id = p_event_id
     AND m.readiness_value IS NOT NULL
     AND m.profile_id IS DISTINCT FROM auth.uid()
     -- The caller must be in this room themselves. auth.uid() IS NULL can no longer
     -- short-circuit the exclusion above, either: with a null uid this EXISTS finds
     -- nothing, so the function returns the empty set rather than every row.
     AND EXISTS (
       SELECT 1
         FROM public.event_room_members caller
        WHERE caller.event_id = p_event_id
          AND caller.profile_id = auth.uid()
     )
     -- P1603: a room row left over after removal or cancellation opens nothing on a hidden event
     AND app_private.viewer_sees_event(p_event_id)
   ORDER BY random();
$$;

REVOKE ALL ON FUNCTION public.get_room_readiness_distribution(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_readiness_distribution(uuid) TO authenticated;
