-- Migration: P1685 -- the Listening Game is its own preparation step ('game') and its own once-per-person part ('listening_game')
-- Created: 2026-11-16
-- Spec: features/p1685_listening_game_in_every_preparation.md (D1)
-- Guaranteed by: src/tests/p1685-plan-recipes.test.ts (the app's step and part lists), not by a DB test: the change is two widened CHECKs.
--
-- WHY. Both CHECKs came from 20261001120000_p1336_event_preparations.sql as unnamed inline constraints (Postgres names them
-- <table>_<column>_check). No later migration changed either. No function or trigger whitelists a step or a part (p1336_prep_guard
-- touches identity and opted_in only), so the two constraints are the whole database side.
--
-- event_preparations.current_step: every existing value kept, 'game' added. 'canvas' is deliberately still absent (P1529: it is
--   recorded in steps_done only; the app never saves it as the current step).
-- person_prep_parts.part: every existing value kept, 'listening_game' added.
-- client-safe: additive. A deployed client never writes the new values; the widened checks accept everything they accepted before.

BEGIN;

ALTER TABLE public.event_preparations DROP CONSTRAINT IF EXISTS event_preparations_current_step_check;
ALTER TABLE public.event_preparations ADD CONSTRAINT event_preparations_current_step_check
  CHECK (current_step IN ('plan', 'welcome', 'story', 'principle', 'game', 'cmp7', 'stake', 'research'));

ALTER TABLE public.person_prep_parts DROP CONSTRAINT IF EXISTS person_prep_parts_part_check;
ALTER TABLE public.person_prep_parts ADD CONSTRAINT person_prep_parts_part_check
  CHECK (part IN ('intro_video', 'cognitive_video', 'principle_intro', 'cmp7', 'listening_game'));

COMMIT;
