-- P1429 A2: the host's event page shows people who answered only in the room as Undecided.
-- diffed against: 20261001120000_p1336_event_preparations.sql (get_event_prep_host_view)
-- client-safe: same name, argument and grants; two columns added at the end. Deployed clients map
-- the columns they know by name and ignore the rest.
--
-- The room→prep trigger (p1336_room_opt_in_to_prep) only updates an existing preparation row, and
-- this view read preparation rows only, so a room-only answer never reached the host. The view now
-- also returns the room's own answer and its 0-10; the event page prefers it. The trigger is left
-- alone on purpose: inserting prep rows from the room would mark people "prepared" who never were.
-- Room members without a profile (walk-ins) still cannot be matched to a registrant.

DROP FUNCTION IF EXISTS public.get_event_prep_host_view(uuid);
CREATE FUNCTION public.get_event_prep_host_view(p_event_id uuid)
RETURNS TABLE (
  profile_id uuid,
  name text,
  slug text,
  avatar_color text,
  avatar_url text,
  has_pledged boolean,
  prep_choice text,
  steps_done text[],
  started_at timestamptz,
  completed_at timestamptz,
  opted_in boolean,
  principle_rating smallint,
  research_state text,
  mic_setup text,
  positions_done integer,
  positions_total integer,
  room_opted_in boolean,
  room_rating smallint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_host uuid;
  v_tag text;
BEGIN
  SELECT e.host_id, e.statement_tag INTO v_host, v_tag FROM public.events e WHERE e.id = p_event_id;
  IF v_host IS NULL OR v_host IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'only the host can see preparations' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH tag_points AS (
    SELECT pt.id FROM public.points pt
     WHERE v_tag IS NOT NULL AND (v_tag = ANY (pt.tags) OR v_tag = ANY (pt.system_tags))
  )
  SELECT r.profile_id, pr.name, pr.slug, pr.avatar_color, pr.avatar_url,
         COALESCE(pr.has_pledged, false),
         p.prep_choice, COALESCE(p.steps_done, '{}'), p.started_at, p.completed_at,
         p.opted_in, p.principle_rating, p.research_state, p.mic_setup,
         (SELECT count(*)::int FROM public.point_positions pp
           WHERE pp.user_id = r.profile_id AND pp.point_id IN (SELECT id FROM tag_points)),
         (SELECT count(*)::int FROM tag_points),
         m.opted_in, m.comprehension_rating
    FROM public.event_rsvps r
    JOIN public.profiles pr ON pr.id = r.profile_id
    LEFT JOIN public.event_preparations p ON p.event_id = r.event_id AND p.profile_id = r.profile_id
    LEFT JOIN public.event_room_members m ON m.event_id = r.event_id AND m.profile_id = r.profile_id
   WHERE r.event_id = p_event_id
     AND r.profile_id <> v_host
   ORDER BY r.rsvped_at;
END;
$$;
REVOKE ALL ON FUNCTION public.get_event_prep_host_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_prep_host_view(uuid) TO authenticated;
