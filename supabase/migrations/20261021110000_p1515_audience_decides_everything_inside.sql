-- diffed against: 20261021100000_p1515_artifact_sharing.sql (get_canvas; the latest and only
--   definition of it), read before writing this and equal to the live definition on test.
-- P1515, founder ruling 2026-10-21: A CANVAS'S AUDIENCE DECIDES EVERYTHING INSIDE IT.
--
-- client-safe: same signature, return type and grants as the function it replaces, and nothing
--   outside this repo's unreleased canvas page calls it (get_canvas shipped to no client). The
--   trigger change only narrows what a client may write.
--
-- WHAT CHANGES
--   get_canvas(owner, name)
--     1. Content goes ONLY to the owner and to people an entry admits right now. Anyone else, signed in
--        or not, on a canvas with no record or no entries or a record that admits them not, gets
--        "not found": empty points, stories and positions, even when some of the canvas's points are
--        public rows. A point's or story's own public/private flag no longer decides who reads it HERE
--        (that flag is immutable, p586, and is untouched).
--     2. Stories = the owner's stories linked to those points + stories others added through the
--        canvas. An added story is readable by an admitted reader only while its author can still
--        read the canvas; the owner and the author (while admitted) read it. NOTHING else: decision
--        D-A (public stories by anyone else) is dropped, with its CTE.
--     3. Positions = the owner's + those of people who can currently read the canvas.
--     4. New top-level `visibility`: 'private' (no entries) or 'shared' (one or more), for the owner
--        and for admitted readers, so the page can show a shared icon. NULL for everyone else (no hint
--        that anything exists). access.shared is replaced by it.
--   Base read policies on points, stories, links, positions, versions, histories and verifications
--   are NOT touched.
--
--   p1515_stamp_rsvp_time (hardening, security review): rsvped_at is an access gate (the 12-hour
--   window), so it must not move by UPDATE either. Now also BEFORE UPDATE OF rsvped_at, event_id,
--   profile_id for client roles: keeps OLD.rsvped_at while event_id and profile_id are unchanged,
--   otherwise now(). Not exploitable today (event_rsvps has no client UPDATE policy); this keeps it
--   that way if one is ever added.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_canvas(p_owner uuid, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_name     text := lower(COALESCE(p_name, ''));
  v_tag      text;
  v_canvas   uuid;
  v_is_owner boolean;
  v_via      uuid;
  v_admitted boolean;
  v_result   jsonb;
BEGIN
  IF p_owner IS NOT NULL AND v_name ~ '^[a-z0-9_]{1,64}$' THEN
    v_is_owner := v_uid IS NOT NULL AND v_uid = p_owner;
    SELECT c.id INTO v_canvas
      FROM public.canvases c
     WHERE c.owner_id = p_owner AND c.name = v_name;
    IF v_canvas IS NOT NULL AND NOT v_is_owner THEN
      v_via := public._canvas_admitted_via(v_canvas, v_uid);
    END IF;
    v_admitted := v_is_owner OR v_via IS NOT NULL;
  END IF;

  -- Not found: the owner and admitted readers are the only audience. Same shape, nothing in it,
  -- and no flag that distinguishes "no such canvas" from "not for you".
  IF NOT COALESCE(v_admitted, false) THEN
    RETURN jsonb_build_object(
      'points', '[]'::jsonb, 'stories', '[]'::jsonb, 'positions', '[]'::jsonb,
      'visibility', NULL,
      'access', jsonb_build_object('is_owner', false, 'admitted', false, 'via', NULL)
    );
  END IF;

  v_tag := 'canvas_' || v_name;

  WITH cp AS (
    -- (1) the owner's current-version points on this canvas, whatever their own flag says.
    SELECT p.*
      FROM public.points p
     WHERE p.first_validator_id = p_owner
       AND p.superseded_by IS NULL
       AND p.system_tags @> ARRAY[v_tag]::text[]
       AND p.system_tags && public._canvas_box_tags()
  ),
  owner_stories AS (
    -- (2a) the owner's own stories linked to those points.
    SELECT sp.point_id, sp.story_id, false AS added
      FROM public.story_points sp
      JOIN public.stories s ON s.id = sp.story_id
     WHERE sp.point_id IN (SELECT cp.id FROM cp)
       AND s.author_id = p_owner
  ),
  added_stories AS (
    -- (2b) stories others added through this canvas. The owner reads all of them; an author reads
    -- their own; other admitted readers read one only while its author can still read the canvas.
    SELECT cas.point_id, cas.story_id, true AS added
      FROM public.canvas_added_stories cas
     WHERE v_canvas IS NOT NULL
       AND cas.canvas_id = v_canvas
       AND cas.point_id IN (SELECT cp.id FROM cp)
       AND (
         v_is_owner
         OR cas.author_id = v_uid
         OR public._canvas_can_read(v_canvas, cas.author_id)
       )
  ),
  sr AS (
    SELECT * FROM owner_stories
    UNION ALL SELECT * FROM added_stories
  ),
  pos AS (
    -- (3) the owner's positions and those of people who can currently read the canvas. A removed
    -- person's direct write, or a lapsed reader's old one, shows nowhere.
    SELECT pp.*
      FROM public.point_positions pp
      JOIN cp ON cp.id = pp.point_id
     WHERE pp.user_id = p_owner
        OR public._canvas_can_read(v_canvas, pp.user_id)
  )
  SELECT jsonb_build_object(
    'points', COALESCE((
      SELECT jsonb_agg(
               to_jsonb(cp) || jsonb_build_object('creator', (
                 SELECT jsonb_build_object(
                          'id', pr.id, 'name', pr.name, 'slug', pr.slug,
                          'avatar_color', pr.avatar_color, 'avatar_url', pr.avatar_url)
                   FROM public.profiles pr WHERE pr.id = cp.first_validator_id))
               ORDER BY cp.created_at, cp.id)
        FROM cp
    ), '[]'::jsonb),
    'stories', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'point_id', sr.point_id,
                 'story_id', sr.story_id,
                 'added', sr.added,
                 'story', jsonb_build_object(
                   'id', s.id, 'author_id', s.author_id, 'content', s.content,
                   'visibility', s.visibility, 'current_version', s.current_version,
                   'understood_count', s.understood_count, 'created_at', s.created_at,
                   'updated_at', s.updated_at, 'tags', s.tags, 'system_tags', s.system_tags,
                   'image_url', s.image_url, 'video_url', s.video_url, 'video_quotes', s.video_quotes,
                   'author', jsonb_build_object(
                     'id', au.id, 'name', au.name, 'slug', au.slug, 'role', au.role,
                     'avatar_color', au.avatar_color, 'avatar_url', au.avatar_url,
                     'ears_count', au.ears_count, 'has_pledged', au.has_pledged)))
               ORDER BY s.created_at, s.id)
        FROM sr
        JOIN public.stories s ON s.id = sr.story_id
        JOIN public.profiles au ON au.id = s.author_id
    ), '[]'::jsonb),
    'positions', COALESCE((
      SELECT jsonb_agg(
               to_jsonb(pos) || jsonb_build_object('user', jsonb_build_object(
                 'id', u.id, 'name', u.name, 'slug', u.slug,
                 'avatar_color', u.avatar_color, 'avatar_url', u.avatar_url,
                 'ears_count', u.ears_count, 'has_pledged', u.has_pledged))
               ORDER BY pos.created_at, pos.id)
        FROM pos
        JOIN public.profiles u ON u.id = pos.user_id
    ), '[]'::jsonb),
    -- (4) 'private' = no entries, 'shared' = at least one. Only the admitted ever see it.
    'visibility', CASE
      WHEN EXISTS (SELECT 1 FROM public.canvas_audience a WHERE a.canvas_id = v_canvas)
      THEN 'shared' ELSE 'private' END,
    'access', jsonb_build_object(
      'is_owner', v_is_owner,
      'admitted', true,
      'via', (
        SELECT jsonb_build_object(
                 'kind', a.kind,
                 'id', COALESCE(a.event_id, a.org_id),
                 'name', COALESCE(e.title, o.name),
                 'slug', COALESCE(e.slug, o.slug))
          FROM public.canvas_audience a
          LEFT JOIN public.events e ON e.id = a.event_id
          LEFT JOIN public.organization o ON o.id = a.org_id
         WHERE a.id = v_via
      )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Hardening: rsvped_at cannot be moved by a client by UPDATE either.
CREATE OR REPLACE FUNCTION public.p1515_stamp_rsvp_time()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.role(), '') IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.rsvped_at := now();
    ELSIF NEW.event_id IS NOT DISTINCT FROM OLD.event_id
          AND NEW.profile_id IS NOT DISTINCT FROM OLD.profile_id THEN
      NEW.rsvped_at := OLD.rsvped_at;
    ELSE
      NEW.rsvped_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS p1515_stamp_rsvp_time ON public.event_rsvps;
CREATE TRIGGER p1515_stamp_rsvp_time
  BEFORE INSERT OR UPDATE OF rsvped_at, event_id, profile_id ON public.event_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.p1515_stamp_rsvp_time();

COMMIT;
