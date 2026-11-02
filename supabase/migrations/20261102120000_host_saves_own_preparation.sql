-- diffed against: 20261001120000_p1336_event_preparations.sql (the only definition of this policy).
-- Founder 2026-11-02: a hike's host sees "Learn the principle" in the room, so they can show people
-- where to click. A host has no RSVP, so their saves were refused. The host may now create their OWN
-- row for their OWN event; anyone else still needs an RSVP.
--
-- client-safe: widens one INSERT policy; no table, column or signature changes.
-- Counts stay host-free: get_event_prep_social_proof, get_event_research_places_left and
-- get_event_prep_host_view all exclude the host explicitly.

DROP POLICY IF EXISTS "Registrant creates own preparation" ON public.event_preparations;
CREATE POLICY "Registrant or host creates own preparation"
  ON public.event_preparations FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = (SELECT auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM public.event_rsvps r
         WHERE r.event_id = event_preparations.event_id AND r.profile_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM public.events e
         WHERE e.id = event_preparations.event_id AND e.host_id = (SELECT auth.uid())
      )
    )
  );
