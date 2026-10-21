-- diffed against: 20261021200000_p1515_people_and_link.sql (_canvas_can_read, its only live body) and
--   20261021210000_p1515_canvas_read_per_user.sql (get_canvas, canvas_set_position, canvas_add_story, their
--   latest bodies). Each body below is byte-for-byte its source except where this header says otherwise.
--   set_canvas_general_access is re-created whole (new return type), see 4.
-- P1515 phase 3d: who counts as a reader of an open link canvas (review round on phase 3).
--
-- client-safe: the canvas feature is unreleased (prod holds none of these tables or functions). Every
--   argument list is unchanged except set_canvas_general_access, whose return type changes text to jsonb
--   (it is dropped and re-created; the one coupled client is this branch). New table and column are closed
--   to clients; every grant is restated.
--
-- WHAT CHANGES
--   1. _canvas_can_read no longer says "yes" for EVERYONE while the canvas is open to anyone with the
--      link. That clause made every user id a reader, so a removed person's rows, the rows of someone who
--      held an old link, and a direct REST write by anyone all came back for every link reader. Admission
--      of a CALLER stays token-based (get_canvas, _canvas_can_write); this function is only asked about
--      OTHER people's rows and now means: the owner, or an entry that admits them.
--   2. canvas_link_contributors(canvas_id, user_id, generation): written by the token-checked writes
--      (canvas_set_position, canvas_add_story) for a caller admitted ONLY by the link. canvases.link_generation
--      counts how many times the link was issued; a contributor's rows are shown only while the canvas is
--      open AND their recorded generation is the current one. Closing or reopening the link therefore hides
--      the old link's contributors, consistent with "leaves with the author"; a direct write never shows.
--   3. get_canvas: the `readers` CTE counts a person as a reader if _canvas_can_read OR a current link
--      contributor. Nothing else changes.
--   4. set_canvas_general_access returns {general_access, link_token} (to the owner), and an owner can
--      always CLOSE the link: the "has a current point" and "no public point" checks now apply only to
--      OPENING.

BEGIN;

-- 0. Link generation and the contributors table (closed to clients; read and written by definer functions).
ALTER TABLE public.canvases ADD COLUMN IF NOT EXISTS link_generation integer NOT NULL DEFAULT 0;
UPDATE public.canvases SET link_generation = 1 WHERE general_access = 'link' AND link_generation = 0;

CREATE TABLE IF NOT EXISTS public.canvas_link_contributors (
  canvas_id  uuid NOT NULL REFERENCES public.canvases(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  generation integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (canvas_id, user_id)
);
ALTER TABLE public.canvas_link_contributors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.canvas_link_contributors FROM PUBLIC, anon, authenticated;

-- Is this person a contributor of the CURRENT link? The canvas is open and their recorded generation is the
-- generation now in force. Internal: takes any uid.
CREATE OR REPLACE FUNCTION public._canvas_link_contributor_current(p_canvas uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(EXISTS (
    SELECT 1
      FROM public.canvas_link_contributors lc
      JOIN public.canvases c ON c.id = lc.canvas_id
     WHERE lc.canvas_id = p_canvas
       AND lc.user_id = p_uid
       AND c.general_access = 'link'
       AND c.link_token IS NOT NULL
       AND c.link_generation = lc.generation
  ), false)
$$;
REVOKE ALL ON FUNCTION public._canvas_link_contributor_current(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Record that this person wrote through the link. Only for someone the link alone admits (not the owner,
-- not anyone an entry admits) and only while the canvas is open; otherwise nothing. Internal.
CREATE OR REPLACE FUNCTION public._canvas_note_link_contributor(p_canvas uuid, p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.canvas_link_contributors (canvas_id, user_id, generation)
  SELECT c.id, p_uid, c.link_generation
    FROM public.canvases c
   WHERE c.id = p_canvas
     AND p_uid IS NOT NULL
     AND c.general_access = 'link'
     AND c.link_token IS NOT NULL
     AND c.owner_id <> p_uid
     AND public._canvas_admitted_via(c.id, p_uid) IS NULL
  ON CONFLICT (canvas_id, user_id) DO UPDATE SET generation = EXCLUDED.generation;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_note_link_contributor(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- General access: 'restricted' or 'link'. Owner only. Returns {general_access, link_token}. Opening issues a
-- fresh token and a new generation (asking to open an already open canvas keeps both); closing clears the
-- token. An owner can always CLOSE, even a canvas with no current points; OPENING needs a canvas of the
-- owner's with at least one current point and none of them public.
DROP FUNCTION IF EXISTS public.set_canvas_general_access(text, text);
CREATE OR REPLACE FUNCTION public.set_canvas_general_access(p_name text, p_access text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_name text := lower(COALESCE(p_name, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF v_name !~ '^[a-z0-9_]{1,64}$' OR p_access IS NULL OR p_access NOT IN ('restricted', 'link') THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;

  IF p_access = 'restricted' THEN
    UPDATE public.canvases c
       SET general_access = 'restricted', link_token = NULL
     WHERE c.owner_id = v_uid AND c.name = v_name;
    RETURN jsonb_build_object('general_access', 'restricted', 'link_token', NULL);
  END IF;

  -- Opening: the caller must actually own a canvas of this name (at least one current point on it) ...
  IF NOT EXISTS (
    SELECT 1 FROM public.points p
     WHERE p.first_validator_id = v_uid
       AND p.superseded_by IS NULL
       AND p.system_tags @> ARRAY['canvas_' || v_name]::text[]
       AND p.system_tags && public._canvas_box_tags()
  ) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  -- ... and it must hold no PUBLIC point (a legacy seed), exactly as sharing it requires.
  IF EXISTS (
    SELECT 1 FROM public.points p
     WHERE p.first_validator_id = v_uid
       AND p.superseded_by IS NULL
       AND p.visibility = 'public'::public.content_visibility
       AND p.system_tags @> ARRAY['canvas_' || v_name]::text[]
  ) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.canvases (owner_id, name, general_access, link_token, link_generation)
  VALUES (v_uid, v_name, 'link', encode(extensions.gen_random_bytes(16), 'hex'), 1)
  ON CONFLICT (owner_id, name) DO UPDATE SET
    general_access = 'link',
    link_token = CASE WHEN public.canvases.general_access = 'link' AND public.canvases.link_token IS NOT NULL
                      THEN public.canvases.link_token ELSE EXCLUDED.link_token END,
    link_generation = CASE WHEN public.canvases.general_access = 'link' AND public.canvases.link_token IS NOT NULL
                           THEN public.canvases.link_generation ELSE public.canvases.link_generation + 1 END;
  RETURN jsonb_build_object(
    'general_access', 'link',
    'link_token', (SELECT c.link_token FROM public.canvases c WHERE c.owner_id = v_uid AND c.name = v_name));
END;
$$;
REVOKE ALL ON FUNCTION public.set_canvas_general_access(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_canvas_general_access(text, text) TO authenticated;

-- May this person's rows (a position, an added story) show to OTHER readers of this canvas? The owner, or
-- someone an entry admits. It says NOTHING about "anyone with the link": a link holder is admitted as a CALLER
-- by get_canvas and _canvas_can_write (token check) and counts as a reader of the canvas only as a current
-- link contributor (_canvas_link_contributor_current). An earlier version of this function (20261021200000)
-- answered "yes" for every user id while the link was open; that is what this migration removes.
CREATE OR REPLACE FUNCTION public._canvas_can_read(p_canvas uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT p_uid IS NOT NULL
       AND (c.owner_id = p_uid
            OR public._canvas_admitted_via(c.id, p_uid) IS NOT NULL)
      FROM public.canvases c
     WHERE c.id = p_canvas
  ), false)
$$;

REVOKE ALL ON FUNCTION public._canvas_can_read(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.canvas_set_position(
  p_owner uuid, p_name text, p_point uuid, p_position public.position_type, p_reasoning text DEFAULT NULL,
  p_link_token text DEFAULT NULL
)
RETURNS void
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
  IF p_owner IS NULL OR p_point IS NULL OR p_position IS NULL THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = v_uid AND pr.is_verified = true) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;

  SELECT c.id INTO v_canvas FROM public.canvases c WHERE c.owner_id = p_owner AND c.name = v_name;
  IF NOT (v_uid = p_owner OR public._canvas_can_write(v_canvas, v_uid, p_link_token))
     OR NOT public._canvas_point_in(p_owner, v_name, p_point) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;

  PERFORM public._canvas_note_link_contributor(v_canvas, v_uid);
  INSERT INTO public.point_positions (point_id, user_id, position, reasoning)
  VALUES (p_point, v_uid, p_position, p_reasoning)
  ON CONFLICT (point_id, user_id)
  DO UPDATE SET position = EXCLUDED.position, reasoning = EXCLUDED.reasoning;
END;
$$;

REVOKE ALL ON FUNCTION public.canvas_set_position(uuid, text, uuid, public.position_type, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_set_position(uuid, text, uuid, public.position_type, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.canvas_add_story(p_owner uuid, p_name text, p_point uuid, p_content text, p_link_token text DEFAULT NULL)
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
     OR NOT public._canvas_can_write(v_canvas, v_uid, p_link_token)
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

  PERFORM public._canvas_note_link_contributor(v_canvas, v_uid);
  INSERT INTO public.stories (author_id, content, visibility)
  VALUES (v_uid, v_content, 'private'::public.content_visibility)
  RETURNING id INTO v_story;

  INSERT INTO public.canvas_added_stories (canvas_id, point_id, story_id, author_id)
  VALUES (v_canvas, p_point, v_story, v_uid);

  RETURN v_story;
END;
$$;

REVOKE ALL ON FUNCTION public.canvas_add_story(uuid, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_add_story(uuid, text, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_canvas(p_owner uuid, p_name text, p_link_token text DEFAULT NULL)
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
  v_open     boolean;
  v_tok_ok   boolean;
  v_result   jsonb;
BEGIN
  IF p_owner IS NOT NULL AND v_name ~ '^[a-z0-9_]{1,64}$' THEN
    v_is_owner := v_uid IS NOT NULL AND v_uid = p_owner;
    -- v_open: the owner opened the canvas to anyone with the link. v_tok_ok: this caller holds the CURRENT
    -- token. Only the token admits; being open alone admits nobody (the link is not guessable).
    SELECT c.id,
           c.general_access = 'link',
           (c.general_access = 'link' AND c.link_token IS NOT NULL AND p_link_token IS NOT NULL
             AND c.link_token = p_link_token)
      INTO v_canvas, v_open, v_tok_ok
      FROM public.canvases c
     WHERE c.owner_id = p_owner AND c.name = v_name;
    IF v_canvas IS NOT NULL AND NOT v_is_owner THEN
      v_via := public._canvas_admitted_via(v_canvas, v_uid);
    END IF;
    v_admitted := v_is_owner OR v_via IS NOT NULL OR COALESCE(v_tok_ok, false);
  END IF;

  -- Not found: the owner, admitted readers and, while the canvas is open to anyone with the link,
  -- everyone are the only audience. Same shape, nothing in it,
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
  readers AS MATERIALIZED (
    -- Can this person read the canvas? Asked ONCE per distinct person who took a position or added a
    -- story on these points, instead of once per row (the answer walks every audience entry).
    SELECT u.uid, (public._canvas_can_read(v_canvas, u.uid) OR public._canvas_link_contributor_current(v_canvas, u.uid)) AS ok
      FROM (
        SELECT pp.user_id AS uid
          FROM public.point_positions pp
         WHERE pp.point_id IN (SELECT cp.id FROM cp)
        UNION
        SELECT cas.author_id
          FROM public.canvas_added_stories cas
         WHERE v_canvas IS NOT NULL
           AND cas.canvas_id = v_canvas
           AND cas.point_id IN (SELECT cp.id FROM cp)
      ) u
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
         OR EXISTS (SELECT 1 FROM readers r WHERE r.uid = cas.author_id AND r.ok)
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
        OR EXISTS (SELECT 1 FROM readers r WHERE r.uid = pp.user_id AND r.ok)
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
    -- An open link, or a person entry (the owner is always admitted to their own), counts as shared.
    'visibility', CASE
      WHEN COALESCE(v_open, false) OR EXISTS (
        SELECT 1 FROM public.canvas_audience a
         WHERE a.canvas_id = v_canvas
           AND (a.kind = 'person'
                OR public._canvas_target_admits(a.kind, a.event_id, a.org_id, p_owner))
      ) THEN 'shared' ELSE 'private' END,
    'access', jsonb_build_object(
      'is_owner', v_is_owner,
      'admitted', true,
      'general_access', CASE WHEN COALESCE(v_open, false) THEN 'link' ELSE 'restricted' END,
      -- for a person entry the reader line names the OWNER ("Shared with you by <owner>")
      'via', (
        SELECT jsonb_build_object(
                 'kind', a.kind,
                 'id', COALESCE(a.event_id, a.org_id, a.profile_id),
                 'name', CASE WHEN a.kind = 'person' THEN ow.name ELSE COALESCE(e.title, o.name) END,
                 'slug', CASE WHEN a.kind = 'person' THEN ow.slug ELSE COALESCE(e.slug, o.slug) END)
          FROM public.canvas_audience a
          LEFT JOIN public.events e ON e.id = a.event_id
          LEFT JOIN public.organization o ON o.id = a.org_id
          LEFT JOIN public.profiles ow ON ow.id = p_owner
         WHERE a.id = v_via
      )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_canvas(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_canvas(uuid, text, text) TO anon, authenticated;

COMMIT;
