-- P1114 follow-up: event-scoped ANONYMOUS readiness distribution for the room's /ready.
--
-- diffed against: 20260821120000_p1114_public_roster_reversal.sql (re-issues that file's
-- column GRANT, minus readiness_value — see below; get_room_readiness_distribution is a
-- new function, not a redefinition)
--
-- client-safe: the P1114 base has never shipped to prod (feature/p1114-event-room is
-- unmerged), so no deployed client selects readiness_value from this table. The two
-- in-tree readers (EventRoomReady.tsx, EventRoomGate.tsx) both read it off `self`, which
-- comes from get_my_room_status — a SECURITY DEFINER RPC, unaffected by table-level
-- column grants. Verified by grep before writing this: no other caller selects it.
--
-- WHY (founder, 2026-08-21, screenshot annotation "i want the same functionality in the
-- event rooms!" pointing at /ready's slider): the general /ready renders every other
-- respondent's answer as faint marks resting on the caller's own track (SliderTrack's
-- `others` prop, P1083). The room's /ready omitted it. Reinstating it here, event-scoped.
--
-- The distinction this migration exists to enforce: in the room, the COMPREHENSION rating
-- is deliberately public BY NAME (that is the whole point of the 2026-08-21 roster
-- reversal — a facilitator reads it off a projected screen). READINESS is the opposite:
-- the founder settled it as an ANONYMOUS distribution. Those two contracts cannot both be
-- served by the same public roster row, which until now carried readiness_value directly
-- next to display_name — every client in the room could join name to readiness even though
-- no UI drew it. A guarantee that holds only because nobody wrote the query is not a
-- guarantee. So: readiness_value leaves the column grant, and the only remaining path to
-- it is this function, which returns bare values and no identifiers.
--
-- KNOWN AND ACCEPTED, not overlooked: in a room of two, "everyone else's answers" is one
-- number and belongs to the one other person. Small-n de-anonymisation is inherent to
-- showing a distribution at all, and the general /ready has the same property. Deliberately
-- NOT mitigated with a minimum-respondent threshold here — a threshold would blank the
-- marks in exactly the 2-3 person rooms the founder tests in, reading as "the feature is
-- broken" rather than as a privacy floor. Revisit with the founder if real rooms stay tiny.

-- ============================================================================
-- 1. Column grant — re-issued WITHOUT readiness_value
-- ============================================================================
-- Same belt-and-suspenders REVOKE-then-GRANT idiom as the two migrations before this one.
-- client_secret stays excluded for the same reason it always was; readiness_value now
-- joins it. Everything else on the row remains public — the roster reversal is unchanged.
REVOKE SELECT ON public.event_room_members FROM PUBLIC;
REVOKE SELECT ON public.event_room_members FROM anon, authenticated;
GRANT SELECT (id, event_id, profile_id, display_name, opted_in, comprehension_rating, joined_at)
  ON public.event_room_members TO anon, authenticated;

-- ============================================================================
-- 2. get_room_readiness_distribution — bare values, no identifiers
-- ============================================================================
-- SECURITY DEFINER so it can read the column the caller can no longer select directly.
--
-- Three things it deliberately does NOT return, each one a way the caller could re-link a
-- value to a person: no member id, no profile id, no display name, and no stable ordering.
-- ORDER BY random() is load-bearing, not decoration — joined_at order (the roster's own
-- order) would let a viewer line up the Nth value with the Nth row on screen and read the
-- whole room's readiness off a screenshot.
--
-- Excludes the caller's own row: the prop this feeds is literally SliderTrack's `others`,
-- and the caller's own value is already the thumb they are dragging.
CREATE OR REPLACE FUNCTION public.get_room_readiness_distribution(p_event_id uuid)
RETURNS SETOF smallint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT readiness_value
    FROM public.event_room_members
   WHERE event_id = p_event_id
     AND readiness_value IS NOT NULL
     AND (auth.uid() IS NULL OR profile_id IS DISTINCT FROM auth.uid())
   ORDER BY random();
$$;

REVOKE ALL ON FUNCTION public.get_room_readiness_distribution(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_room_readiness_distribution(uuid) TO authenticated;
