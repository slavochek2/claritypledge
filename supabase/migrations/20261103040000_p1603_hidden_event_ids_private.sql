-- P1603 (design change from spec review): an event id must not become access to a hidden event.
-- Created: 2026-11-03
-- Spec: features/p1603_hidden_events_link_only.md
-- Follows: 20261103030000_p1603_hidden_events.sql (column, first SELECT policy, get_event_by_slug)
--
-- client-safe: the policies replaced here change nothing for an event that is not hidden (every existing event): the
--   same rows stay readable to the same roles, and the same RSVP insert stays allowed. They only withdraw rows of an event
--   whose is_hidden is true, and no such event exists before the app that sets it ships. No grant is revoked from anon or
--   authenticated on any existing object. One new function is additive (rsvp_to_event_by_slug).
-- new function: rsvp_to_event_by_slug
-- new function: app_private.viewer_has_rsvp
-- new function: app_private.event_is_hidden
-- new function: app_private.viewer_sees_event
--
-- THE HOLE THIS CLOSES
--   event_rsvps was readable by everyone and any signed-in user could INSERT their own row for ANY event id. The first
--   policy let "has an RSVP" see a hidden event, so anyone who read an event_id from event_rsvps could insert themselves and
--   thereby read the event. An id was access. Now:
--     1. a direct INSERT into event_rsvps is refused for a hidden event;
--     2. a hidden event is joined only through rsvp_to_event_by_slug(slug) -- the link is the proof;
--     3. event_rsvps, event_practice_rooms and event_room_members no longer return rows of a hidden event to anyone but the
--        host, the people themselves, and people already registered.
--
-- WHY A PRIVATE SCHEMA FOR THE HELPERS
--   The policies call these functions as the querying role, so anon and authenticated need EXECUTE. In `public` that makes
--   each one a PostgREST RPC anyone can call; event_is_hidden(id) would then be an oracle for "is this id a hidden event".
--   app_private is not in the API's exposed schemas (supabase/config.toml: public, graphql_public), so the helpers run
--   inside policies and cannot be called from the browser. They also stay out of the public-function grant checks.
--
-- NO RECURSION
--   The helpers are SECURITY DEFINER (they read events / event_rsvps as their owner, not through those tables' policies),
--   so events -> event_rsvps -> events cannot loop. Verified on TEST by reading every table through each role.
--
-- PERFORMANCE
--   events: only a HIDDEN row reaches the helper (NOT is_hidden short-circuits the OR).
--   event_rsvps / event_room_members / event_practice_rooms: a row of the viewer's own, or of a visible event, costs one
--   primary-key lookup on events per row returned.

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO anon, authenticated, service_role;

-- Does the caller hold an RSVP for the event? (about the caller only)
CREATE OR REPLACE FUNCTION app_private.viewer_has_rsvp(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_rsvps r
     WHERE r.event_id = p_event_id
       AND r.profile_id = (SELECT auth.uid())
  );
$$;

-- Is the event hidden? (false for an id that does not exist)
CREATE OR REPLACE FUNCTION app_private.event_is_hidden(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((SELECT e.is_hidden FROM public.events e WHERE e.id = p_event_id), false);
$$;

-- May the caller see rows that belong to this event? Yes unless the event is hidden and the caller is neither its host
-- nor registered for it. Unknown caller (NULL uid) and unknown event follow the same rule: hidden => no.
CREATE OR REPLACE FUNCTION app_private.viewer_sees_event(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.events e
     WHERE e.id = p_event_id
       AND e.is_hidden
       AND e.host_id IS DISTINCT FROM (SELECT auth.uid())
       AND NOT EXISTS (
         SELECT 1 FROM public.event_rsvps r
          WHERE r.event_id = e.id AND r.profile_id = (SELECT auth.uid())
       )
  );
$$;

REVOKE ALL ON FUNCTION app_private.viewer_has_rsvp(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.event_is_hidden(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.viewer_sees_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.viewer_has_rsvp(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.event_is_hidden(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.viewer_sees_event(uuid) TO anon, authenticated, service_role;

-- events: replace the first P1603 policy (it read event_rsvps directly) with the helper form.
DROP POLICY IF EXISTS "Events are viewable unless hidden" ON public.events;
CREATE POLICY "Events are viewable unless hidden"
  ON public.events FOR SELECT
  USING (
    NOT is_hidden
    OR host_id = (SELECT auth.uid())
    OR app_private.viewer_has_rsvp(id)
  );

-- event_rsvps: SELECT no longer public for a hidden event; INSERT refused for a hidden event.
DROP POLICY IF EXISTS "RSVPs are viewable by everyone" ON public.event_rsvps;
DROP POLICY IF EXISTS "RSVPs of a hidden event are private to its host and the registered" ON public.event_rsvps;
CREATE POLICY "RSVPs of a hidden event are private to its host and the registered"
  ON public.event_rsvps FOR SELECT
  USING (
    profile_id = (SELECT auth.uid())
    OR app_private.viewer_sees_event(event_id)
  );

DROP POLICY IF EXISTS "Authenticated users can RSVP" ON public.event_rsvps;
CREATE POLICY "Authenticated users can RSVP"
  ON public.event_rsvps FOR INSERT
  WITH CHECK (
    auth.uid() = profile_id
    AND NOT app_private.event_is_hidden(event_id)
  );

-- event_practice_rooms / event_room_members: the same rule (both were USING (true) and carry the event id, plus the
-- creator / the member's name and profile).
DROP POLICY IF EXISTS "event_practice_rooms_select" ON public.event_practice_rooms;
CREATE POLICY "event_practice_rooms_select"
  ON public.event_practice_rooms FOR SELECT
  USING (
    creator_id = (SELECT auth.uid())
    OR app_private.viewer_sees_event(event_id)
  );

DROP POLICY IF EXISTS "all room members are visible" ON public.event_room_members;
DROP POLICY IF EXISTS "room members of a hidden event are private to its host and the registered" ON public.event_room_members;
CREATE POLICY "room members of a hidden event are private to its host and the registered"
  ON public.event_room_members FOR SELECT
  USING (
    profile_id = (SELECT auth.uid())
    OR app_private.viewer_sees_event(event_id)
  );

-- The only way to register for a hidden event: the exact slug (the link) proves the caller holds it. Keeps every check the
-- direct path has: signed in, not cancelled, capacity, the removed-registration trigger and the rsvped_at stamp (both are
-- row triggers on event_rsvps and fire on this insert; the stamp reads the caller's JWT role, which a SECURITY DEFINER
-- function does not change).
-- Returns one of: 'ok', 'already', 'full', 'cancelled', 'not_found'. Anonymous callers: 42501.
-- The events row is locked FOR UPDATE so two people taking the last seat cannot both pass the capacity test.
CREATE OR REPLACE FUNCTION public.rsvp_to_event_by_slug(p_slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event public.events%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in to register' USING ERRCODE = '42501';
  END IF;
  IF p_slug IS NULL THEN
    RETURN 'not_found';
  END IF;

  SELECT * INTO v_event FROM public.events e WHERE e.slug = p_slug FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_event.status = 'cancelled' THEN
    RETURN 'cancelled';
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = v_event.id AND r.profile_id = v_uid) THEN
    RETURN 'already';
  END IF;
  IF v_event.max_attendees IS NOT NULL
     AND (SELECT count(*) FROM public.event_rsvps r WHERE r.event_id = v_event.id) >= v_event.max_attendees THEN
    RETURN 'full';
  END IF;

  INSERT INTO public.event_rsvps (event_id, profile_id) VALUES (v_event.id, v_uid);
  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.rsvp_to_event_by_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rsvp_to_event_by_slug(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rsvp_to_event_by_slug(text) TO authenticated, service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.rsvp_to_event_by_slug(text)', 'EXECUTE')
     OR has_function_privilege('public', 'public.rsvp_to_event_by_slug(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1603: rsvp_to_event_by_slug must be executable by signed-in users only';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rsvp_to_event_by_slug(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1603: rsvp_to_event_by_slug must be executable by authenticated';
  END IF;
  IF NOT has_function_privilege('anon', 'app_private.viewer_sees_event(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'app_private.event_is_hidden(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1603: the policy helpers must be executable by the querying roles';
  END IF;
END
$$;
