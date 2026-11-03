-- P1603 (second adversarial review): two more ways an event id or a hidden event reached the public.
-- Created: 2026-11-03
-- Spec: features/p1603_hidden_events_link_only.md
--
-- client-safe: both triggers are no-ops for every existing flow. No code moves a practice room to another event, and a
--   review from a public event is written as before. Trigger functions have EXECUTE revoked (checked at the end).
-- new function: _practice_room_event_id_fixed, _series_review_not_from_hidden
--
-- 1. A stranger made a practice room on a public event, then changed its event_id to a hidden one: the insert guard did
--    not apply, and the room's code went to the hidden event's registrants. A practice room can no longer change event.
-- 2. series_reviews is publicly readable with source_event_id, and writers ignore is_hidden: an approved quote from a
--    hidden event would publish its id, the quote and the author. A hidden event writes no public review.
-- LIMIT: an event switched to hidden after its reviews were written keeps them; removing a published quote is a founder call.

CREATE OR REPLACE FUNCTION public._practice_room_event_id_fixed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.event_id IS DISTINCT FROM OLD.event_id THEN
    RAISE EXCEPTION 'a practice room cannot move to another event' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._practice_room_event_id_fixed() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS practice_room_event_id_fixed ON public.event_practice_rooms;
CREATE TRIGGER practice_room_event_id_fixed
  BEFORE UPDATE OF event_id ON public.event_practice_rooms
  FOR EACH ROW EXECUTE FUNCTION public._practice_room_event_id_fixed();

CREATE OR REPLACE FUNCTION public._series_review_not_from_hidden()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.source_event_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = NEW.source_event_id AND e.is_hidden) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._series_review_not_from_hidden() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS series_review_not_from_hidden ON public.series_reviews;
CREATE TRIGGER series_review_not_from_hidden
  BEFORE INSERT OR UPDATE OF source_event_id ON public.series_reviews
  FOR EACH ROW EXECUTE FUNCTION public._series_review_not_from_hidden();

DO $check$
BEGIN
  IF has_function_privilege('authenticated', 'public._series_review_not_from_hidden()', 'EXECUTE')
     OR has_function_privilege('anon', 'public._series_review_not_from_hidden()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._practice_room_event_id_fixed()', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1603: a trigger function is client-reachable';
  END IF;
END
$check$;
