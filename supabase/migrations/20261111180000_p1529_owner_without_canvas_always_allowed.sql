-- Migration: P1529 -- a Clarity Canvas owner needs no canvas, at any canvas count
-- Created: 2026-11-11
-- Spec: features/p1529_canvas_event_host_coordination.md ("UAT round 2026-11-11: founder decisions", decision (b); founder ruling 2026-11-11: "the host is never blocked")
-- Guaranteed by: e2e/integration/p1529-db-schema.spec.ts ("seat anyway")
--
-- WHY. 20261111170000 let an owner without a canvas be seated only while fewer than two canvases were shared. The founder ruled that a person
-- without a canvas can be the Clarity Canvas owner of a business idea at ANY canvas count, so the host's role swap must always work.
--
-- WHAT. _event_round_seats_owner_has_canvas no longer refuses anything: it returns the row. The trigger stays attached (dropping it is a
-- second change nobody asked for); the refusal 'a Clarity Canvas owner needs a canvas shared with this event' is intentionally gone.
-- The registration guard (a person must be registered to be seated) is a different function and is untouched.
--
-- diffed against: 20261111170000_p1529_reading_part_and_seat_anyway.sql (_event_round_seats_owner_has_canvas)
-- diff: the body is reduced to RETURN NEW; the signature, SECURITY DEFINER, search_path and the trigger are unchanged.
-- client-safe: only removes a refusal; a client that handles the refusal simply never sees it.

BEGIN;

CREATE OR REPLACE FUNCTION public._event_round_seats_owner_has_canvas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN NEW;
END;
$$;

COMMIT;
