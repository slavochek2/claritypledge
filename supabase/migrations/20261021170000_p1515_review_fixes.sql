-- diffed against: 20261021110000_p1515_audience_decides_everything_inside.sql (get_canvas, the latest and
--   only live body, copied whole with ONE CASE changed) and 20261021100000_p1515_artifact_sharing.sql
--   (canvas_add_story and share_canvas, their latest bodies; canvas_add_story as applied, with the
--   search_path edit made after the first apply). Each body below is byte-for-byte its source except
--   where this header says otherwise.
-- P1515, review-driven fixes (verified by the lead).
--
-- client-safe: nothing here removes a function, column or policy a deployed client uses. The canvas
--   page is unreleased: prod holds none of these functions yet, so revoking anon from get_canvas
--   breaks no caller. The new constraint and trigger only refuse writes the founder ruling forbids
--   (a second added story per person per point; a public point carrying a canvas_ tag).
--
-- WHAT CHANGES
--   1. canvas_added_stories UNIQUE (canvas_id, point_id, author_id): one added story per person per
--      point, as P465 does for ordinary links. canvas_add_story refuses a second with 23505 before it
--      inserts anything.
--   2. get_canvas 'visibility' is 'shared' only while an entry exists that admits the OWNER right now
--      (an entry the owner has left admits no one), else 'private'. Nothing else in the body changed.
--   3. INVARIANT (founder ruling: points inside a canvas follow the canvas). A point carrying any
--      system tag that starts canvas_ must be private: a BEFORE INSERT OR UPDATE OF system_tags,
--      visibility trigger refuses public + canvas_ for EVERY role, the service role included. Rows
--      that are already public (legacy seeds) are not rewritten; visibility is immutable (p586), so
--      they stay, stay updatable for everything else (an st tag synced from a story), and
--      share_canvas refuses them (4). Only a write that makes a point NEWLY public and canvas-tagged
--      is refused: an insert, or an update that changes its visibility or its canvas_ tags.
--   4. share_canvas refuses a canvas that still holds a current PUBLIC point, and a cancelled event as
--      a target, with the same 42501 message as its other refusals.
--   5. canvas_add_story: search_path = public, pg_temp (it inserts into stories, which fires an
--      invoker trigger function that needs public on the path; pg_temp is listed last, explicitly).
--   6. get_canvas is no longer executable by anon: a signed-out visitor was only ever going to get
--      the empty not-found shape, and the page now shows that directly without calling it.
--
-- CORRECTION TO 20261021100100_p1515_seal_letter_skips_foreign_private_points.sql (that file is not
--   edited; its header says "no legitimate flow produces" a link from a sender's story to a private
--   point of someone else). That is not quite true: the people a letter is sent to write REPLY
--   stories, and a reply story DOES link to the sender's private points. So a reply letter sent back
--   to the point's owner now drops that point from its snapshot, because the point is private and the
--   replier does not own it. This is ACCEPTED: the same filter is what closes the leak to third
--   parties, and the owner already has the point. It is recorded as a known limitation in the spec.

BEGIN;

-- 1. one added story per person per point
ALTER TABLE public.canvas_added_stories
  ADD CONSTRAINT canvas_added_stories_one_per_person_per_point UNIQUE (canvas_id, point_id, author_id);

-- 3. points inside a canvas follow the canvas: private only, for every role
CREATE OR REPLACE FUNCTION public.p1515_canvas_points_are_private()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_new text[];
  v_old text[];
BEGIN
  IF NEW.visibility IS DISTINCT FROM 'public'::public.content_visibility THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(array_agg(lower(t) ORDER BY lower(t)), '{}') INTO v_new
    FROM unnest(NEW.system_tags) t WHERE lower(t) LIKE 'canvas\_%';
  IF cardinality(v_new) = 0 THEN
    RETURN NEW;
  END IF;
  -- A legacy row that is already public and canvas-tagged keeps being updatable for everything ELSE
  -- (an st tag synced from a story, say): only a write that makes it newly public + canvas-tagged is
  -- refused, i.e. an insert, or an update that changes its visibility or its canvas_ tags.
  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(array_agg(lower(t) ORDER BY lower(t)), '{}') INTO v_old
      FROM unnest(OLD.system_tags) t WHERE lower(t) LIKE 'canvas\_%';
    IF OLD.visibility IS NOT DISTINCT FROM NEW.visibility AND v_old = v_new THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'a point on a canvas is private: the canvas decides who reads it'
    USING ERRCODE = '23514';
END;
$$;
REVOKE ALL ON FUNCTION public.p1515_canvas_points_are_private() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_p1515_canvas_points_are_private ON public.points;
CREATE TRIGGER trg_p1515_canvas_points_are_private
  BEFORE INSERT OR UPDATE OF system_tags, visibility ON public.points
  FOR EACH ROW EXECUTE FUNCTION public.p1515_canvas_points_are_private();

-- 2 + 6. get_canvas: the visibility CASE, then no anon
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
    -- (4) 'shared' only while an entry exists that admits the OWNER right now (an entry the owner has
    -- left admits no one, so the canvas is private again); else 'private'. Only the admitted ever see it.
    'visibility', CASE
      WHEN EXISTS (
        SELECT 1 FROM public.canvas_audience a
         WHERE a.canvas_id = v_canvas
           AND public._canvas_target_admits(a.kind, a.event_id, a.org_id, p_owner)
      ) THEN 'shared' ELSE 'private' END,
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

REVOKE ALL ON FUNCTION public.get_canvas(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_canvas(uuid, text) TO authenticated;

-- 1 + 5. canvas_add_story
CREATE OR REPLACE FUNCTION public.canvas_add_story(p_owner uuid, p_name text, p_point uuid, p_content text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
-- NOT the empty search_path of the rest of this file, on purpose: the INSERT into stories fires
-- sync_story_st_tags_to_points (an invoker trigger function with no search_path of its own and
-- unqualified table names), which resolves its tables through the CALLER's search_path. Every
-- relation this body names is schema-qualified, so `public` here serves that trigger only.
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Defensive bound on one reader's additions to one canvas (spec silent; a reader flooding a
  -- canvas the owner cannot moderate is the only abuse this path has).
  c_max_per_author CONSTANT integer := 200;

  v_uid     uuid := auth.uid();
  v_name    text := lower(COALESCE(p_name, ''));
  v_canvas  uuid;
  v_content text := btrim(COALESCE(p_content, ''));
  v_story   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF p_owner IS NULL OR p_point IS NULL OR v_uid = p_owner THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = v_uid AND pr.is_verified = true) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;

  SELECT c.id INTO v_canvas FROM public.canvases c WHERE c.owner_id = p_owner AND c.name = v_name;
  IF v_canvas IS NULL
     OR NOT public._canvas_can_read(v_canvas, v_uid)
     OR NOT public._canvas_point_in(p_owner, v_name, p_point) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;

  IF v_content = '' THEN
    RAISE EXCEPTION 'a story needs some text' USING ERRCODE = '22023';
  END IF;
  -- One added story per person per point, as P465 does for ordinary links (the table's unique key
  -- is the real guard; this gives the caller a plain refusal and no stray story row).
  IF EXISTS (SELECT 1 FROM public.canvas_added_stories cas
              WHERE cas.canvas_id = v_canvas AND cas.point_id = p_point AND cas.author_id = v_uid) THEN
    RAISE EXCEPTION 'you already added a story to this point' USING ERRCODE = '23505';
  END IF;
  IF (SELECT count(*) FROM public.canvas_added_stories cas
       WHERE cas.canvas_id = v_canvas AND cas.author_id = v_uid) >= c_max_per_author THEN
    RAISE EXCEPTION 'too many stories added to this canvas' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.stories (author_id, content, visibility)
  VALUES (v_uid, v_content, 'private'::public.content_visibility)
  RETURNING id INTO v_story;

  INSERT INTO public.canvas_added_stories (canvas_id, point_id, story_id, author_id)
  VALUES (v_canvas, p_point, v_story, v_uid);

  RETURN v_story;
END;
$$;

-- 4. share_canvas
CREATE OR REPLACE FUNCTION public.share_canvas(p_name text, p_kind text, p_target uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_name   text := lower(COALESCE(p_name, ''));
  v_canvas uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF v_name !~ '^[a-z0-9_]{1,64}$' OR p_kind IS NULL OR p_kind NOT IN ('event', 'group') OR p_target IS NULL THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  -- The caller must actually own a canvas of this name (at least one current point on it).
  IF NOT EXISTS (
    SELECT 1 FROM public.points p
     WHERE p.first_validator_id = v_uid
       AND p.superseded_by IS NULL
       AND p.system_tags @> ARRAY['canvas_' || v_name]::text[]
       AND p.system_tags && public._canvas_box_tags()
  ) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  -- Everything inside a canvas follows the canvas, so a canvas must hold no PUBLIC point. The trigger
  -- below keeps new ones out; this refuses a legacy canvas that still has one (its visibility cannot
  -- change, p586), with the same message as every other refusal.
  IF EXISTS (
    SELECT 1 FROM public.points p
     WHERE p.first_validator_id = v_uid
       AND p.superseded_by IS NULL
       AND p.visibility = 'public'::public.content_visibility
       AND p.system_tags @> ARRAY['canvas_' || v_name]::text[]
  ) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  -- A cancelled event is not a place to share with.
  IF p_kind = 'event' AND EXISTS (
    SELECT 1 FROM public.events e WHERE e.id = p_target AND e.status = 'cancelled'
  ) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  IF NOT public._canvas_target_admits(
       p_kind,
       CASE WHEN p_kind = 'event' THEN p_target END,
       CASE WHEN p_kind = 'group' THEN p_target END,
       v_uid) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.canvases (owner_id, name) VALUES (v_uid, v_name)
  ON CONFLICT (owner_id, name) DO NOTHING;
  SELECT c.id INTO v_canvas FROM public.canvases c WHERE c.owner_id = v_uid AND c.name = v_name;

  INSERT INTO public.canvas_audience (canvas_id, kind, event_id, org_id)
  VALUES (
    v_canvas, p_kind,
    CASE WHEN p_kind = 'event' THEN p_target END,
    CASE WHEN p_kind = 'group' THEN p_target END
  )
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$$;

COMMIT;
