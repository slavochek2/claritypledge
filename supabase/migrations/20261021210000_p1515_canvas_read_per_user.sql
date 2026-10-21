-- diffed against: 20261021200000_p1515_people_and_link.sql (get_canvas, set_canvas_general_access,
--   get_canvas_audience: their only live bodies), 20261021100000_p1515_artifact_sharing.sql
--   (_canvas_admitted_via, canvas_set_position, canvas_remove_position) and
--   20261021170000_p1515_review_fixes.sql (canvas_add_story, its latest body). Each body below is
--   byte-for-byte its source except where this header says otherwise.
-- P1515 phase 3b: get_canvas asks "can this person read the canvas" once per person, not once per row; a
--   direct person entry wins the reader line; and "anyone with the link" is an UNGUESSABLE link.
--
-- client-safe: the canvas feature is unreleased (prod holds none of these functions), so dropping the old
--   signatures of get_canvas, canvas_set_position, canvas_remove_position and canvas_add_story breaks no
--   deployed caller; the same coupled client (this branch) passes the new optional argument. The new
--   column is nullable, and every grant is restated on the new signature (get_canvas anon + authenticated,
--   the writes authenticated only).
--
-- WHAT CHANGES
--   1. get_canvas: a MATERIALIZED CTE `readers` evaluates _canvas_can_read ONCE per DISTINCT person who took a
--      position, or added a story, on the canvas's points; the position filter and the added-story filter
--      join to it. The old body called _canvas_can_read once per row, and each call walks every audience
--      entry. The rows returned are the same.
--   2. _canvas_admitted_via: a direct PERSON entry is preferred, then events, then groups (each oldest
--      first). Who is admitted does not change, only which entry is named.
--   3. THE LINK IS A TOKEN. canvases.link_token (NULL unless general_access = 'link') holds 32 hex
--      characters from the database CSPRNG (extensions.gen_random_bytes). set_canvas_general_access('link')
--      issues it; 'restricted' clears it; reopening therefore always makes a NEW token and every older link
--      is dead. get_canvas, canvas_set_position, canvas_remove_position and canvas_add_story take
--      p_link_token (default NULL). A caller with no entry is admitted only while the canvas is 'link' AND
--      the token they send equals the current one; the writes additionally need a signed-in caller (anon
--      can only read). A wrong, missing or stale token gets the same not-found shape as any stranger, and
--      that shape no longer carries general_access, so it does not reveal that the canvas is open.
--      get_canvas_audience returns link_token to the OWNER only (for "Copy link"). The token is never
--      logged or raised in a message.

BEGIN;

-- 0. The link token. A closed table (no policy, no grant); read and written only by the definer functions.
ALTER TABLE public.canvases ADD COLUMN IF NOT EXISTS link_token text;
-- Canvases already open when this applies get a token now; closed ones carry none.
UPDATE public.canvases SET link_token = encode(extensions.gen_random_bytes(16), 'hex')
 WHERE general_access = 'link' AND link_token IS NULL;
UPDATE public.canvases SET link_token = NULL WHERE general_access <> 'link' AND link_token IS NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'canvases_link_token_check' AND conrelid = 'public.canvases'::regclass
  ) THEN
    ALTER TABLE public.canvases
      ADD CONSTRAINT canvases_link_token_check CHECK ((general_access = 'link') = (link_token IS NOT NULL));
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public._canvas_admitted_via(p_canvas uuid, p_uid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT a.id
    FROM public.canvas_audience a
   WHERE p_uid IS NOT NULL
     AND a.canvas_id = p_canvas
     AND public._canvas_entry_admits(a.id, p_uid)
   ORDER BY (a.kind <> 'person'), (a.kind <> 'event'), a.created_at, a.id
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public._canvas_admitted_via(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- May this person WRITE to this canvas (a position, an added story)? The owner, an entry that admits
-- them, or a signed-in caller holding the current link token. Internal: takes any uid.
CREATE OR REPLACE FUNCTION public._canvas_can_write(p_canvas uuid, p_uid uuid, p_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT p_uid IS NOT NULL
       AND (c.owner_id = p_uid
            OR public._canvas_admitted_via(c.id, p_uid) IS NOT NULL
            OR (c.general_access = 'link' AND c.link_token IS NOT NULL
                AND p_token IS NOT NULL AND c.link_token = p_token))
      FROM public.canvases c
     WHERE c.id = p_canvas
  ), false)
$$;
REVOKE ALL ON FUNCTION public._canvas_can_write(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- Drop the old signatures first: a function with a new argument list is a NEW overload, and a
-- tokenless get_canvas or write left behind would be an anon-callable way around the token.
DROP FUNCTION IF EXISTS public.get_canvas(uuid, text);
DROP FUNCTION IF EXISTS public.canvas_set_position(uuid, text, uuid, public.position_type, text);
DROP FUNCTION IF EXISTS public.canvas_remove_position(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.canvas_add_story(uuid, text, uuid, text);

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
    SELECT u.uid, public._canvas_can_read(v_canvas, u.uid) AS ok
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

  INSERT INTO public.point_positions (point_id, user_id, position, reasoning)
  VALUES (p_point, v_uid, p_position, p_reasoning)
  ON CONFLICT (point_id, user_id)
  DO UPDATE SET position = EXCLUDED.position, reasoning = EXCLUDED.reasoning;
END;
$$;

REVOKE ALL ON FUNCTION public.canvas_set_position(uuid, text, uuid, public.position_type, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_set_position(uuid, text, uuid, public.position_type, text, text) TO authenticated;

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

  SELECT c.id INTO v_canvas FROM public.canvases c WHERE c.owner_id = p_owner AND c.name = v_name;
  IF NOT (v_uid = p_owner OR public._canvas_can_write(v_canvas, v_uid, p_link_token))
     OR NOT public._canvas_point_in(p_owner, v_name, p_point) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.point_positions pp WHERE pp.point_id = p_point AND pp.user_id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.canvas_remove_position(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_remove_position(uuid, text, uuid, text) TO authenticated;

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

CREATE OR REPLACE FUNCTION public.set_canvas_general_access(p_name text, p_access text)
RETURNS text
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
  -- Opening a canvas to anyone is refused while it still holds a PUBLIC point (a legacy seed), exactly
  -- as sharing it is; switching back to restricted is always allowed.
  IF p_access = 'link' AND EXISTS (
    SELECT 1 FROM public.points p
     WHERE p.first_validator_id = v_uid
       AND p.superseded_by IS NULL
       AND p.visibility = 'public'::public.content_visibility
       AND p.system_tags @> ARRAY['canvas_' || v_name]::text[]
  ) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;

  -- Opening issues a fresh unguessable token (the link carries it). Closing clears it, so reopening
  -- always gives a NEW link and every older one is dead. Asking to open an already-open canvas keeps
  -- its token (a double click must not break a link that was just shared).
  INSERT INTO public.canvases (owner_id, name, general_access, link_token)
  VALUES (v_uid, v_name, p_access,
          CASE WHEN p_access = 'link' THEN encode(extensions.gen_random_bytes(16), 'hex') END)
  ON CONFLICT (owner_id, name) DO UPDATE SET
    general_access = EXCLUDED.general_access,
    link_token = CASE
      WHEN EXCLUDED.general_access <> 'link' THEN NULL
      WHEN public.canvases.general_access = 'link' AND public.canvases.link_token IS NOT NULL THEN public.canvases.link_token
      ELSE EXCLUDED.link_token END;
  RETURN p_access;
END;
$$;

REVOKE ALL ON FUNCTION public.set_canvas_general_access(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_canvas_general_access(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_canvas_audience(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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

  SELECT c.id INTO v_canvas FROM public.canvases c WHERE c.owner_id = v_uid AND c.name = v_name;
  IF v_canvas IS NULL THEN
    RETURN jsonb_build_object('entries', '[]'::jsonb, 'general_access', 'restricted', 'link_token', NULL);
  END IF;

  RETURN jsonb_build_object('general_access', (SELECT c.general_access FROM public.canvases c WHERE c.id = v_canvas), 'link_token', (SELECT c.link_token FROM public.canvases c WHERE c.id = v_canvas), 'entries', COALESCE((
    SELECT jsonb_agg(q.entry ORDER BY q.rank, q.created_at, q.id)
      FROM (
        SELECT a.id, a.created_at,
               CASE a.kind WHEN 'person' THEN 0 WHEN 'event' THEN 1 ELSE 2 END AS rank,
               jsonb_build_object(
                 'kind', a.kind,
                 'id', COALESCE(a.event_id, a.org_id, a.profile_id),
                 'name', COALESCE(e.title, o.name, pe.name),
                 'slug', COALESCE(e.slug, o.slug, pe.slug),
                 'public', (a.kind IN ('event', 'person') OR o.visibility = 'public'),
                 'owner_admitted', t.owner_in,
                 'count', CASE WHEN a.kind = 'person' THEN 1 ELSE COALESCE(ppl.n, 0) END,
                 'names', CASE WHEN a.kind = 'person'
                               THEN jsonb_build_array(jsonb_build_object('id', pe.id, 'name', pe.name, 'slug', pe.slug))
                               WHEN a.kind = 'event' OR o.visibility = 'public'
                               THEN COALESCE(ppl.names, '[]'::jsonb)
                               ELSE NULL END
               ) AS entry
          FROM public.canvas_audience a
          LEFT JOIN public.events e ON e.id = a.event_id
          LEFT JOIN public.organization o ON o.id = a.org_id
          LEFT JOIN public.profiles pe ON pe.id = a.profile_id
          CROSS JOIN LATERAL (
            SELECT (a.kind = 'person' OR public._canvas_target_admits(a.kind, a.event_id, a.org_id, v_uid)) AS owner_in
          ) t
          LEFT JOIN LATERAL (
            SELECT count(*) AS n,
                   jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name, 'slug', pr.slug)
                             ORDER BY pr.name, pr.id) AS names
              FROM (
                SELECT e2.host_id AS uid FROM public.events e2
                 WHERE a.kind = 'event' AND e2.id = a.event_id AND e2.host_id IS NOT NULL
                UNION
                SELECT r.profile_id FROM public.event_rsvps r
                 WHERE a.kind = 'event' AND r.event_id = a.event_id
                UNION
                SELECT m.user_id FROM public.membership m
                 WHERE a.kind = 'group' AND m.org_id = a.org_id
              ) cand
              JOIN public.profiles pr ON pr.id = cand.uid
             WHERE t.owner_in
               AND cand.uid <> v_uid
               AND public._canvas_target_admits(a.kind, a.event_id, a.org_id, cand.uid)
          ) ppl ON true
         WHERE a.canvas_id = v_canvas
      ) q
  ), '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.get_canvas_audience(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_canvas_audience(text) TO authenticated;

COMMIT;
