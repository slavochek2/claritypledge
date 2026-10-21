-- diffed against: 20261021230000_p1515_link_write_snapshot.sql (get_canvas, canvas_set_position, canvas_add_story) and
--   20261021210000_p1515_canvas_read_per_user.sql (canvas_remove_position), their only live bodies. Each body below is
--   byte-for-byte its source except where this header says otherwise.
-- P1515 phase 5: one canvas, many versions; sharing covers every version.
--
-- client-safe: the canvas feature is unreleased (prod holds none of these functions or tables). get_canvas gains an
--   optional 4th argument (the 3-argument function is dropped: an overload would make PostgREST calls ambiguous);
--   a caller that sends the old three named arguments is answered as before. Every other signature is unchanged.
--   Every grant is restated.
--
-- WHAT CHANGES
--   1. canvas_versions(canvas_id, owner_id, name, created_at): the versions of a canvas. A version is a set of points
--      (the canvas_<name> tag). The canvas row keeps the audience, the general access and the link, so one share
--      reaches every version, past and future. A name is a version of ONE canvas per owner (UNIQUE (owner_id, name)).
--      Closed to clients; versions are added by the service role (the seed script, later the mirror agent).
--   2. Every canvas has its own name as its first version: backfilled for the canvases that exist, and an AFTER INSERT
--      trigger on canvases for every new one, so each insert path (share, general access, fixtures) keeps working and a
--      canvas with one version behaves exactly as before. The address of a canvas stays its first version's name.
--   3. _canvas_resolve(owner, name) finds the canvas by ANY of its version names; _canvas_point_in_canvas(canvas,
--      owner, name, point) is true when the point is on some version of that canvas (a canvas with no record has only
--      its own name).
--   4. get_canvas(p_owner, p_name, p_link_token, p_version): the canvas is found by any version name; p_version NULL
--      is the NEWEST version, a named one is that version, and a version that is not this canvas's gives the SAME
--      empty answer as an unreadable canvas. The points, stories and positions are those of the version shown (they hang
--      off its tag, so they are per version). access gains version and versions (name, created_at; newest first), for
--      the owner and every admitted reader.
--   5. canvas_set_position, canvas_remove_position and canvas_add_story find the canvas through _canvas_resolve and
--      check the point against the canvas's versions, so one admission check covers every version.

BEGIN;

CREATE TABLE IF NOT EXISTS public.canvas_versions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id  uuid NOT NULL REFERENCES public.canvases(id) ON DELETE CASCADE,
  owner_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (name ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name),
  UNIQUE (canvas_id, name)
);
CREATE INDEX IF NOT EXISTS canvas_versions_canvas ON public.canvas_versions (canvas_id, created_at DESC);
ALTER TABLE public.canvas_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.canvas_versions FROM PUBLIC, anon, authenticated;

-- Every existing canvas is a canvas whose single version is itself.
INSERT INTO public.canvas_versions (canvas_id, owner_id, name, created_at)
SELECT c.id, c.owner_id, c.name, c.created_at FROM public.canvases c
ON CONFLICT (owner_id, name) DO NOTHING;

CREATE OR REPLACE FUNCTION public._canvas_first_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.canvas_versions (canvas_id, owner_id, name, created_at)
  VALUES (NEW.id, NEW.owner_id, NEW.name, NEW.created_at);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_first_version() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS canvases_first_version ON public.canvases;
CREATE TRIGGER canvases_first_version AFTER INSERT ON public.canvases
  FOR EACH ROW EXECUTE FUNCTION public._canvas_first_version();

CREATE OR REPLACE FUNCTION public._canvas_resolve(p_owner uuid, p_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT v.canvas_id FROM public.canvas_versions v WHERE v.owner_id = p_owner AND v.name = lower(COALESCE(p_name, ''))
$$;
REVOKE ALL ON FUNCTION public._canvas_resolve(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._canvas_point_in_canvas(p_canvas uuid, p_owner uuid, p_name text, p_point uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_canvas IS NULL THEN public._canvas_point_in(p_owner, p_name, p_point)
    ELSE COALESCE((SELECT bool_or(public._canvas_point_in(p_owner, v.name, p_point))
                     FROM public.canvas_versions v WHERE v.canvas_id = p_canvas), false)
  END
$$;
REVOKE ALL ON FUNCTION public._canvas_point_in_canvas(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- get_canvas gains an argument: the 3-argument function goes, the 4-argument one replaces it.
DROP FUNCTION IF EXISTS public.get_canvas(uuid, text, text);
CREATE OR REPLACE FUNCTION public.get_canvas(p_owner uuid, p_name text, p_link_token text DEFAULT NULL, p_version text DEFAULT NULL)
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
  v_ver      text;
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
     WHERE c.id = public._canvas_resolve(p_owner, v_name);
    IF v_canvas IS NOT NULL AND NOT v_is_owner THEN
      v_via := public._canvas_admitted_via(v_canvas, v_uid);
    END IF;
    v_admitted := v_is_owner OR v_via IS NOT NULL OR COALESCE(v_tok_ok, false);
    -- The version to read: the one asked for, else the newest. One that is not a version of THIS canvas gives the
    -- same empty answer as a canvas the caller cannot read. A canvas with no record (private, never shared) has only its
    -- own name as its version.
    IF COALESCE(v_admitted, false) THEN
      IF v_canvas IS NULL THEN
        v_ver := CASE WHEN p_version IS NULL OR lower(p_version) = v_name THEN v_name END;
      ELSE
        SELECT v.name INTO v_ver
          FROM public.canvas_versions v
         WHERE v.canvas_id = v_canvas AND (p_version IS NULL OR v.name = lower(p_version))
         ORDER BY v.created_at DESC, v.name DESC
         LIMIT 1;
      END IF;
      IF v_ver IS NULL THEN v_admitted := false; END IF;
    END IF;
  END IF;

  -- Not found: the owner, admitted readers and, while the canvas is open to anyone with the link,
  -- holders of the CURRENT token are the only audience. Same shape, nothing in it,
  -- and no flag that distinguishes "no such canvas" from "not for you".
  IF NOT COALESCE(v_admitted, false) THEN
    RETURN jsonb_build_object(
      'points', '[]'::jsonb, 'stories', '[]'::jsonb, 'positions', '[]'::jsonb,
      'visibility', NULL,
      'access', jsonb_build_object('is_owner', false, 'admitted', false, 'via', NULL)
    );
  END IF;

  v_tag := 'canvas_' || v_ver;

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
      -- the OWNER only: a canvas record exists (an open link or audience entries) even with no current points,
      -- so the page can still give the owner the share control instead of not-found
      'canvas_exists', (v_is_owner AND v_canvas IS NOT NULL),
      -- the version shown, and every version of the canvas, newest first (admitted readers only: a stranger never gets here)
      'version', v_ver,
      'versions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('name', v.name, 'created_at', v.created_at) ORDER BY v.created_at DESC, v.name DESC)
          FROM public.canvas_versions v WHERE v.canvas_id = v_canvas
      ), jsonb_build_array(jsonb_build_object('name', v_name, 'created_at', NULL))),
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

REVOKE ALL ON FUNCTION public.get_canvas(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_canvas(uuid, text, text, text) TO anon, authenticated;

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
  v_generation integer;
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

  -- Lock the canvas row for the length of this write: the token check, the generation we record and the
  -- owner's close/reopen (set_canvas_general_access takes FOR UPDATE) all see one snapshot.
  SELECT c.id, c.link_generation INTO v_canvas, v_generation
    FROM public.canvases c WHERE c.id = public._canvas_resolve(p_owner, v_name) FOR SHARE;
  IF NOT (v_uid = p_owner OR public._canvas_can_write(v_canvas, v_uid, p_link_token))
     OR NOT public._canvas_point_in_canvas(v_canvas, p_owner, v_name, p_point) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;

  PERFORM public._canvas_note_link_contributor(v_canvas, v_uid, v_generation);
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
  v_generation integer;
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

  -- Lock the canvas row for the length of this write: the token check, the generation we record and the
  -- owner's close/reopen (set_canvas_general_access takes FOR UPDATE) all see one snapshot.
  SELECT c.id, c.link_generation INTO v_canvas, v_generation
    FROM public.canvases c WHERE c.id = public._canvas_resolve(p_owner, v_name) FOR SHARE;
  IF v_canvas IS NULL
     OR NOT public._canvas_can_write(v_canvas, v_uid, p_link_token)
     OR NOT public._canvas_point_in_canvas(v_canvas, p_owner, v_name, p_point) THEN
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

  PERFORM public._canvas_note_link_contributor(v_canvas, v_uid, v_generation);
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

CREATE OR REPLACE FUNCTION public.canvas_remove_position(p_owner uuid, p_name text, p_point uuid, p_link_token text DEFAULT NULL)
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
  IF p_owner IS NULL OR p_point IS NULL THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;

  SELECT c.id INTO v_canvas FROM public.canvases c WHERE c.id = public._canvas_resolve(p_owner, v_name);
  IF NOT (v_uid = p_owner OR public._canvas_can_write(v_canvas, v_uid, p_link_token))
     OR NOT public._canvas_point_in_canvas(v_canvas, p_owner, v_name, p_point) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.point_positions pp WHERE pp.point_id = p_point AND pp.user_id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.canvas_remove_position(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_remove_position(uuid, text, uuid, text) TO authenticated;

COMMIT;
