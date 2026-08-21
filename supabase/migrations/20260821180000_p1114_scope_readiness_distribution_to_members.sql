-- P1114 follow-up: scope the readiness distribution to people actually in the room.
--
-- diffed against: 20260821170000_p1114_room_readiness_distribution.sql (redefines
-- get_room_readiness_distribution, adding a membership guard; no other object changes)
--
-- client-safe: nothing has shipped to prod (feature/p1114-event-room is unmerged), and the
-- signature is unchanged, so the existing caller (getRoomReadinessDistribution in
-- event-room-service.ts) needs no edit. A NEW file rather than an edit to 20260821170000
-- because that version is already recorded in the shared test DB's schema_migrations, and
-- migrate.sh tracks by version, not content — editing it in place is a silent no-op.
--
-- WHY (adversarial code review, 2026-08-21): the previous definition granted EXECUTE to
-- `authenticated` with no check on WHO is asking, so any signed-in account — never
-- registered, never in the room, anywhere in the world — could read any event's readiness
-- distribution by guessing or scraping an event id. The distribution carries no names, so
-- this is not an identity leak on its own; it is an unscoped read of one room's aggregate
-- by people who were never in that room, which is not what "event-scoped" was supposed to
-- mean.
--
-- The same review raised a sharper attack that this guard narrows but does not close: the
-- roster's SELECT policy is USING (true) and display_name is granted, so a room member can
-- subscribe to postgres_changes, see WHICH member row just changed, poll this function, and
-- diff the returned multiset to attribute the new value to that name. ORDER BY random() does
-- nothing against it — the defence is against reading the set, not against differencing it
-- over time.
--
-- KNOWN AND NOT CLOSED HERE, deliberately: closing it properly means either coarse bucketing
-- (which changes what the founder asked to see — the general /ready shows individual marks)
-- or removing display_name from the realtime payload (which breaks the live roster that is
-- the whole point of the 2026-08-21 reversal). Both are product decisions, not fixes an
-- agent should pick unilaterally. This migration restricts the attack to people already in
-- the room, who can already see every name and every comprehension rating on the wall.
-- Do not read the 20260821170000 header as exhaustive: it predates this finding.

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
   ORDER BY random();
$$;

REVOKE ALL ON FUNCTION public.get_room_readiness_distribution(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_readiness_distribution(uuid) TO authenticated;
