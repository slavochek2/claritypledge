-- P1543 (review fix, Opus adversary): the event close only ever offers a PUBLIC group.
--
-- client-safe: CREATE OR REPLACE of one internal function with the same signature and return type.
--   Callers (p1389_offered_asks / p1389_next_ask, join_community_from_close, get_event_community_slug)
--   already treat NULL as "no community for this event" and drop the step. No column, policy or
--   client contract changes.
-- new function: none (replaces public.p1389_community_org).
--
-- WHY. p1389_community_org fell back to the slug 'online' for any unaffiliated event outside
-- Chiang Mai, and never checked visibility. P1543 hides 'online' and makes online events
-- unaffiliated by default, so without this the close would keep offering "join the community"
-- for a group nobody can open, and join_community_from_close (SECURITY DEFINER) would add people
-- to it, recording a 'yes' that suppresses the community ask for them on every later evening.
-- Now: the event's own group if it is public, else 'cm' for an event in Chiang Mai, else nothing.
-- An event explicitly filed under a hidden group gets no community step either.

CREATE OR REPLACE FUNCTION public.p1389_community_org(p_event_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT o.id
    FROM public.events e
    JOIN public.organization o
      ON o.id = COALESCE(
           e.org_id,
           CASE WHEN e.location ILIKE '%chiang mai%'
                THEN (SELECT c.id FROM public.organization c WHERE c.slug = 'cm')
           END)
   WHERE e.id = p_event_id
     AND o.visibility = 'public';
$$;
REVOKE EXECUTE ON FUNCTION public.p1389_community_org(uuid) FROM PUBLIC, anon, authenticated;
