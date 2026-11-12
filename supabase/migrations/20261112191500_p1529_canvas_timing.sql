-- Migration: P1529 -- events.canvas_timing: the Clarity Canvas is made before the event or at the event
-- Created: 2026-11-12
-- Spec: features/p1529_canvas_event_host_coordination.md ("UAT round 2026-11-12 (b)", E1)
-- Guaranteed by: src/tests/p1529-canvas-timing.test.ts
--
-- client-safe (P887): adds a NOT NULL column with a default, so every existing row and every deployed client that inserts or
--   selects without the column keeps working. Nothing is revoked; table and column grants on events are unchanged, and the host
--   changes it through the existing "Hosts can update their own events" policy like preparation_enabled. No function changes: the
--   registration RPC already stores the person's role and where they prepare, which is all the new question needs.
--
-- WHY. The founder guides the canvas at the event, so a sales mastermind's preparation is the communication part only.
--   'at_event' (default) = that; 'before' = today's flow (canvas as a preparation step). Only a flow that reads it is affected.

BEGIN;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS canvas_timing text NOT NULL DEFAULT 'at_event'
    CHECK (canvas_timing IN ('before', 'at_event'));

COMMENT ON COLUMN public.events.canvas_timing IS
  'P1529 E1: where the Clarity Canvas is made. before = as a preparation step at home; at_event = together at the event (default). Read by the sales mastermind flow only.';

COMMIT;
