-- P1515: share a canvas with events and groups; everything inside follows (database layer).
--
-- new function: every function below is new, none exists in an earlier migration (grepped), so there
--   is no prior body to diff against. The only existing objects touched are the event_rsvps triggers.
--
-- client-safe: purely additive. Four new tables nobody reads or writes directly, new functions no
--   deployed client calls, and two additive BEFORE triggers on event_rsvps. The REVOKE
--   statements below act only on objects this same file creates (tables and functions), which is
--   what makes them client-safe. NOTHING existing changes meaning: no read policy on points,
--   stories, story_points, point_positions, versions, histories or verifications is touched, and
--   no point's or story's own visibility changes. A person who registers for an event today
--   registers exactly as before unless a host has removed them from that event (a record that
--   exists only after this migration).
--
-- DESIGN (features/p1515_artifact_sharing_events_and_groups.md):
--   * One checked entry point. A canvas is read through get_canvas(), which decides on every call,
--     from the live registration / membership rows, what the caller may see. Access is COMPUTED,
--     never copied onto rows, so leaving a group, being removed from an event, deleting the event
--     or unsharing ends access on the very next request.
--   * Base access is unchanged. An attendee admitted to a canvas still reads nothing of the owner's
--     private points, stories, links or positions through REST, point pages or story pages: the
--     admission lives only in the SECURITY DEFINER functions below (same pattern as P1512).
--   * Writes by the audience (a position on a canvas point, an added story) go through checked
--     functions too. A definer function bypasses RLS together with EVERY predicate inside the
--     policies it replaces (P1053), so each one is accounted for: the position and story INSERT
--     policies require profiles.is_verified (kept), the position is always the caller's own, and
--     the story is always authored by the caller and always private.
--   * Both directions (P1181 lesson): an entry admits readers only while the OWNER is still
--     admitted to it (hosts or registered for the event, member of the group).
--   * Fails closed: an unknown entry kind, a missing event / organization / canvas, a NULL
--     registration time or a failed lookup admits nobody.
--
-- DECISION D-A (founder, pending; spec "Reconciliation with shipped P1508"): public stories by
--   anyone else, linked to public canvas points, stay visible on the canvas. It is isolated in ONE
--   clearly marked CTE in get_canvas() (d_a_public_stories_by_others): flip c_include_public_by_others
--   to false to drop them. Private letter replies and other people's ordinary private story links
--   are never returned either way.
--
-- Mirrors EVENT_GRACE_HOURS (src/app/data/events-service-real.ts) through public.event_grace_interval()
--   (P1256); the canvas box tags below mirror CANVAS_BOX_TAGS (src/lib/canvas-boxes.ts), pinned by
--   src/tests/p1515-canvas-box-tags-sync.test.ts.

BEGIN;

-- ============================================================================
-- 1. Tables. No client role holds any privilege on them; every read and write goes through the
--    SECURITY DEFINER functions in sections 3 and 4 (service_role keeps its default grants).
-- ============================================================================

-- One record per (owner, canvas name). The name is the part after `canvas_` in the reserved
-- system tag, lowercase. No record, or a record with no entries, means Private.
CREATE TABLE IF NOT EXISTS public.canvases (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (name ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);

-- The audience: a list of entries, each an event or a group (organization). Deleting the event, the
-- organization or the canvas deletes its entries, which only ever narrows access.
CREATE TABLE IF NOT EXISTS public.canvas_audience (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id  uuid NOT NULL REFERENCES public.canvases(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('event', 'group')),
  event_id   uuid REFERENCES public.events(id) ON DELETE CASCADE,
  org_id     uuid REFERENCES public.organization(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'event' AND event_id IS NOT NULL AND org_id IS NULL)
    OR (kind = 'group' AND org_id IS NOT NULL AND event_id IS NULL)
  ),
  UNIQUE (canvas_id, event_id),
  UNIQUE (canvas_id, org_id)
);
CREATE INDEX IF NOT EXISTS canvas_audience_event ON public.canvas_audience (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS canvas_audience_org   ON public.canvas_audience (org_id)   WHERE org_id IS NOT NULL;

-- Stories other people added through a canvas: a NEW private story authored by the reader plus this
-- record. Not a story_points link, so the story never appears under the point anywhere else and
-- letters never copy it. Written only by canvas_add_story().
CREATE TABLE IF NOT EXISTS public.canvas_added_stories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id  uuid NOT NULL REFERENCES public.canvases(id) ON DELETE CASCADE,
  point_id   uuid NOT NULL REFERENCES public.points(id) ON DELETE CASCADE,
  story_id   uuid NOT NULL UNIQUE REFERENCES public.stories(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS canvas_added_stories_canvas_point ON public.canvas_added_stories (canvas_id, point_id);
CREATE INDEX IF NOT EXISTS canvas_added_stories_author       ON public.canvas_added_stories (author_id);

-- A host removed this person from this event. Authoritative: every event admission check consults
-- it, and registering is refused once it exists (trigger in section 5). Removing a person deletes
-- their registration; a registration that races the removal still admits no one.
CREATE TABLE IF NOT EXISTS public.event_removals (
  event_id   uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  removed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  removed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

ALTER TABLE public.canvases              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_audience       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_added_stories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_removals        ENABLE ROW LEVEL SECURITY;

-- No policies on purpose: with RLS on and no policy, a client role reads and writes nothing even if
-- a grant is ever added by mistake. The REVOKEs make it a missing privilege as well.
REVOKE ALL ON TABLE public.canvases             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.canvas_audience      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.canvas_added_stories FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.event_removals       FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. Internal access functions. Take ANY uid, so no client role may execute them.
-- ============================================================================

-- The eleven Clarity Canvas box tags (mirrors CANVAS_BOX_TAGS; a drift test pins the two).
CREATE OR REPLACE FUNCTION public._canvas_box_tags()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY[
    'canvas:love', 'canvas:good-at', 'canvas:world-needs',
    'canvas:segments', 'canvas:problem', 'canvas:solution',
    'canvas:advantage', 'canvas:channels', 'canvas:metrics',
    'canvas:revenue', 'canvas:cost'
  ]::text[]
$$;
REVOKE ALL ON FUNCTION public._canvas_box_tags() FROM PUBLIC, anon, authenticated;

-- Event entry: the host, or someone registered no later than 12 hours after the event starts (the
-- P1256 window, reused by P1512), and in either case not removed by the host. NULL anywhere
-- (host, uid, registration time) denies.
CREATE OR REPLACE FUNCTION public._canvas_event_admits(p_event uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT p_uid IS NOT NULL
       AND (
         e.host_id = p_uid
         OR EXISTS (
           SELECT 1 FROM public.event_rsvps r
            WHERE r.event_id = e.id
              AND r.profile_id = p_uid
              AND r.rsvped_at <= e.datetime + public.event_grace_interval()
         )
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.event_removals x
          WHERE x.event_id = e.id AND x.user_id = p_uid
       )
      FROM public.events e
     WHERE e.id = p_event
  ), false)
$$;
REVOKE ALL ON FUNCTION public._canvas_event_admits(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Group entry: a current member of the organization.
CREATE OR REPLACE FUNCTION public._canvas_group_admits(p_org uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(p_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.membership m WHERE m.org_id = p_org AND m.user_id = p_uid
  ), false)
$$;
REVOKE ALL ON FUNCTION public._canvas_group_admits(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- One entry's target, for one person. An unknown kind admits nobody.
CREATE OR REPLACE FUNCTION public._canvas_target_admits(p_kind text, p_event uuid, p_org uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(CASE p_kind
    WHEN 'event' THEN public._canvas_event_admits(p_event, p_uid)
    WHEN 'group' THEN public._canvas_group_admits(p_org, p_uid)
    ELSE false
  END, false)
$$;
REVOKE ALL ON FUNCTION public._canvas_target_admits(text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Does this entry admit this reader RIGHT NOW? Both directions: the reader is admitted to the
-- target AND the owner still is (an entry the owner has left, or a registration they made too late,
-- admits no one).
CREATE OR REPLACE FUNCTION public._canvas_entry_admits(p_entry uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT public._canvas_target_admits(a.kind, a.event_id, a.org_id, c.owner_id)
       AND public._canvas_target_admits(a.kind, a.event_id, a.org_id, p_uid)
      FROM public.canvas_audience a
      JOIN public.canvases c ON c.id = a.canvas_id
     WHERE a.id = p_entry
  ), false)
$$;
REVOKE ALL ON FUNCTION public._canvas_entry_admits(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- The first entry that admits this reader, events before groups (then oldest first); NULL if none.
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
   ORDER BY (a.kind <> 'event'), a.created_at, a.id
   LIMIT 1
$$;
REVOKE ALL ON FUNCTION public._canvas_admitted_via(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- May this person read this canvas's private content? The owner always; anyone else only through an
-- entry that admits them. A missing canvas admits nobody.
CREATE OR REPLACE FUNCTION public._canvas_can_read(p_canvas uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT p_uid IS NOT NULL
       AND (c.owner_id = p_uid OR public._canvas_admitted_via(c.id, p_uid) IS NOT NULL)
      FROM public.canvases c
     WHERE c.id = p_canvas
  ), false)
$$;
REVOKE ALL ON FUNCTION public._canvas_can_read(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Is this point one of the owner's current-version points on canvas `p_name` (reserved system tag
-- canvas_<name> plus a box tag, P1508)? Any visibility: callers decide who may see it.
CREATE OR REPLACE FUNCTION public._canvas_point_in(p_owner uuid, p_name text, p_point uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(EXISTS (
    SELECT 1 FROM public.points p
     WHERE p.id = p_point
       AND p.first_validator_id = p_owner
       AND p.superseded_by IS NULL
       AND p.system_tags @> ARRAY['canvas_' || lower(p_name)]::text[]
       AND p.system_tags && public._canvas_box_tags()
  ), false)
$$;
REVOKE ALL ON FUNCTION public._canvas_point_in(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. The read: one checked entry point for everyone, owner included.
-- ============================================================================

-- Returns jsonb:
--   points     the owner's current-version canvas points (row + creator), oldest first
--   stories    [{point_id, story_id, added, story:{...,author:{...}}}] (same shape P1508's
--              getStoriesForPoints reads, plus `added`)
--   positions  [{...point_positions row, user:{...}}]
--   access     {is_owner, admitted, via:{kind,id,name,slug}|null, shared:bool|null}
--              `shared` is the owner's Private/Shared flag and is NULL for everyone else (no hint).
-- Private content is returned only to the owner and to people an entry admits. Everyone else gets
-- the public points exactly as today. Callable signed out.
CREATE OR REPLACE FUNCTION public.get_canvas(p_owner uuid, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- D-A (founder, pending): keep public stories by anyone else on public canvas points. Set to
  -- false to drop them; nothing else changes.
  c_include_public_by_others CONSTANT boolean := true;

  v_uid      uuid := auth.uid();
  v_name     text := lower(COALESCE(p_name, ''));
  v_tag      text;
  v_canvas   uuid;
  v_is_owner boolean;
  v_via      uuid;
  v_admitted boolean;
  v_result   jsonb;
BEGIN
  IF p_owner IS NULL OR v_name !~ '^[a-z0-9_]{1,64}$' THEN
    RETURN jsonb_build_object(
      'points', '[]'::jsonb, 'stories', '[]'::jsonb, 'positions', '[]'::jsonb,
      'access', jsonb_build_object('is_owner', false, 'admitted', false, 'via', NULL, 'shared', NULL)
    );
  END IF;

  v_tag      := 'canvas_' || v_name;
  v_is_owner := v_uid IS NOT NULL AND v_uid = p_owner;

  SELECT c.id INTO v_canvas
    FROM public.canvases c
   WHERE c.owner_id = p_owner AND c.name = v_name;

  IF v_canvas IS NOT NULL AND NOT v_is_owner THEN
    v_via := public._canvas_admitted_via(v_canvas, v_uid);
  END IF;
  v_admitted := v_is_owner OR v_via IS NOT NULL;

  WITH cp AS (
    -- (1) the owner's current-version points on this canvas. Private ones only if admitted.
    SELECT p.*
      FROM public.points p
     WHERE p.first_validator_id = p_owner
       AND p.superseded_by IS NULL
       AND p.system_tags @> ARRAY[v_tag]::text[]
       AND p.system_tags && public._canvas_box_tags()
       AND (v_admitted OR p.visibility = 'public'::public.content_visibility)
  ),
  owner_stories AS (
    -- (2) the owner's own stories linked to those points. Private ones only if admitted.
    SELECT sp.point_id, sp.story_id, false AS added
      FROM public.story_points sp
      JOIN public.stories s ON s.id = sp.story_id
     WHERE sp.point_id IN (SELECT cp.id FROM cp)
       AND s.author_id = p_owner
       AND (v_admitted OR s.visibility = 'public'::public.content_visibility)
  ),
  added_stories AS (
    -- (3) stories others added through this canvas. The owner reads all of them; an author reads
    -- their own; other admitted readers read one only while its author can still read the canvas.
    SELECT cas.point_id, cas.story_id, true AS added
      FROM public.canvas_added_stories cas
     WHERE v_canvas IS NOT NULL
       AND cas.canvas_id = v_canvas
       AND cas.point_id IN (SELECT cp.id FROM cp)
       AND (
         v_is_owner
         OR cas.author_id = v_uid
         OR (v_admitted AND public._canvas_can_read(v_canvas, cas.author_id))
       )
  ),
  d_a_public_stories_by_others AS (
    -- (4) DECISION D-A, the one place to change it (see c_include_public_by_others above): public
    -- stories by anyone else linked to PUBLIC canvas points, which anyone can already read through
    -- ordinary access. Private stories (letter replies, ordinary private links) are never here.
    SELECT sp.point_id, sp.story_id, false AS added
      FROM public.story_points sp
      JOIN public.stories s ON s.id = sp.story_id
     WHERE c_include_public_by_others
       AND sp.point_id IN (SELECT cp.id FROM cp WHERE cp.visibility = 'public'::public.content_visibility)
       AND s.visibility = 'public'::public.content_visibility
       AND s.author_id <> p_owner
  ),
  sr AS (
    SELECT * FROM owner_stories
    UNION ALL SELECT * FROM added_stories
    UNION ALL SELECT * FROM d_a_public_stories_by_others
  ),
  pos AS (
    -- (5) positions. On a public point: everyone's, exactly what ordinary access already shows.
    -- On a private point (only returned to an admitted caller): the owner's and those of people who
    -- can currently read the canvas, so a removed person's direct write shows nowhere.
    SELECT pp.*
      FROM public.point_positions pp
      JOIN cp ON cp.id = pp.point_id
     WHERE cp.visibility = 'public'::public.content_visibility
        OR pp.user_id = p_owner
        OR (v_admitted AND public._canvas_can_read(v_canvas, pp.user_id))
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
    'access', jsonb_build_object(
      'is_owner', v_is_owner,
      'admitted', v_admitted,
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
      ),
      'shared', CASE WHEN v_is_owner
                     THEN EXISTS (SELECT 1 FROM public.canvas_audience a WHERE a.canvas_id = v_canvas)
                     ELSE NULL END
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_canvas(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_canvas(uuid, text) TO anon, authenticated;

-- ============================================================================
-- 4. The writes. Each re-checks access afresh and derives the actor from auth.uid() only.
-- ============================================================================

-- A position on a canvas point, by an owner or an admitted reader. Keeps the predicates of the
-- ordinary position policies it replaces: the caller is verified (INSERT policy) and the row is the
-- caller's own.
CREATE OR REPLACE FUNCTION public.canvas_set_position(
  p_owner uuid, p_name text, p_point uuid, p_position public.position_type, p_reasoning text DEFAULT NULL
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
  IF NOT (v_uid = p_owner OR public._canvas_can_read(v_canvas, v_uid))
     OR NOT public._canvas_point_in(p_owner, v_name, p_point) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.point_positions (point_id, user_id, position, reasoning)
  VALUES (p_point, v_uid, p_position, p_reasoning)
  ON CONFLICT (point_id, user_id)
  DO UPDATE SET position = EXCLUDED.position, reasoning = EXCLUDED.reasoning;
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_set_position(uuid, text, uuid, public.position_type, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_set_position(uuid, text, uuid, public.position_type, text) TO authenticated;

-- Withdraw the caller's own position on a canvas point.
CREATE OR REPLACE FUNCTION public.canvas_remove_position(p_owner uuid, p_name text, p_point uuid)
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
  IF NOT (v_uid = p_owner OR public._canvas_can_read(v_canvas, v_uid))
     OR NOT public._canvas_point_in(p_owner, v_name, p_point) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.point_positions pp WHERE pp.point_id = p_point AND pp.user_id = v_uid;
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_remove_position(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_remove_position(uuid, text, uuid) TO authenticated;

-- Add a story to someone else's canvas point. Creates a NEW PRIVATE story authored by the caller
-- and records it against this canvas point; it is never attached to the point as an ordinary story
-- link. Keeps the ordinary story INSERT predicates (verified author, author is the caller). The
-- owner uses the ordinary path, so the owner is refused here. Returns the new story id.
CREATE OR REPLACE FUNCTION public.canvas_add_story(p_owner uuid, p_name text, p_point uuid, p_content text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
-- NOT the empty search_path of the rest of this file, on purpose: the INSERT into stories fires
-- sync_story_st_tags_to_points (an invoker trigger function with no search_path of its own and
-- unqualified table names), which resolves its tables through the CALLER's search_path. Every
-- relation this body names is schema-qualified, so `public` here serves that trigger only.
SET search_path = public
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
REVOKE ALL ON FUNCTION public.canvas_add_story(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_add_story(uuid, text, uuid, text) TO authenticated;

-- Take one's own added story off the canvas. Author only. The story itself stays in the author's own
-- story list, as any private story of theirs; only its place on this canvas is removed.
CREATE OR REPLACE FUNCTION public.canvas_remove_added_story(p_story uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.canvas_added_stories cas WHERE cas.story_id = p_story AND cas.author_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this story' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_remove_added_story(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_remove_added_story(uuid) TO authenticated;

-- Share a canvas with an event or a group. Owner only, and only an event the owner hosts or is
-- admitted to, or a group the owner belongs to. Creates the canvas record on the first share.
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
REVOKE ALL ON FUNCTION public.share_canvas(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.share_canvas(text, text, uuid) TO authenticated;

-- Stop sharing with one entry. Owner only. Returns whether an entry was removed.
CREATE OR REPLACE FUNCTION public.unshare_canvas(p_name text, p_kind text, p_target uuid)
RETURNS boolean
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

  DELETE FROM public.canvas_audience a
   USING public.canvases c
   WHERE c.id = a.canvas_id
     AND c.owner_id = v_uid
     AND c.name = v_name
     AND a.kind = p_kind
     AND ((a.kind = 'event' AND a.event_id = p_target) OR (a.kind = 'group' AND a.org_id = p_target));
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.unshare_canvas(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unshare_canvas(text, text, uuid) TO authenticated;

-- The owner's view of who a canvas is shared with. Per entry: name, how many people it admits
-- besides the owner, and their names for events (registration lists are public by design, P1226) and
-- public groups; a private group shows its count only (members cannot see each other there,
-- membership_select / P1010). An entry the owner is no longer admitted to admits no one (count 0).
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
    RETURN jsonb_build_object('entries', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object('entries', COALESCE((
    SELECT jsonb_agg(q.entry ORDER BY q.is_group, q.created_at, q.id)
      FROM (
        SELECT a.id, a.created_at, (a.kind <> 'event') AS is_group,
               jsonb_build_object(
                 'kind', a.kind,
                 'id', COALESCE(a.event_id, a.org_id),
                 'name', COALESCE(e.title, o.name),
                 'slug', COALESCE(e.slug, o.slug),
                 'public', (a.kind = 'event' OR o.visibility = 'public'),
                 'owner_admitted', t.owner_in,
                 'count', COALESCE(ppl.n, 0),
                 'names', CASE WHEN a.kind = 'event' OR o.visibility = 'public'
                               THEN COALESCE(ppl.names, '[]'::jsonb)
                               ELSE NULL END
               ) AS entry
          FROM public.canvas_audience a
          LEFT JOIN public.events e ON e.id = a.event_id
          LEFT JOIN public.organization o ON o.id = a.org_id
          CROSS JOIN LATERAL (
            SELECT public._canvas_target_admits(a.kind, a.event_id, a.org_id, v_uid) AS owner_in
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

-- Host removes a person from an event: deletes their registration and records the removal so they
-- cannot register again. Every event admission check consults the record.
CREATE OR REPLACE FUNCTION public.remove_event_attendee(p_event uuid, p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF p_event IS NULL OR p_user IS NULL OR p_user = v_uid THEN
    RAISE EXCEPTION 'not authorized for this event' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event AND e.host_id = v_uid) THEN
    RAISE EXCEPTION 'not authorized for this event' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = p_user) THEN
    RAISE EXCEPTION 'unknown person' USING ERRCODE = '22023';
  END IF;

  -- The record first: from here on no admission check admits this person, whatever races.
  INSERT INTO public.event_removals (event_id, user_id, removed_by)
  VALUES (p_event, p_user, v_uid)
  ON CONFLICT (event_id, user_id) DO NOTHING;

  DELETE FROM public.event_rsvps r WHERE r.event_id = p_event AND r.profile_id = p_user;
END;
$$;
REVOKE ALL ON FUNCTION public.remove_event_attendee(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_event_attendee(uuid, uuid) TO authenticated;

-- The canvases shared with an event, for the event page. Returned only to people that event entry
-- admits (and to a canvas's own owner); everyone else gets an empty list.
CREATE OR REPLACE FUNCTION public.list_canvases_shared_with_event(p_event uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_event IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object(
               'owner_id', c.owner_id, 'owner_name', pr.name, 'owner_slug', pr.slug, 'name', c.name)
             ORDER BY c.created_at, c.id)
      FROM public.canvas_audience a
      JOIN public.canvases c ON c.id = a.canvas_id
      JOIN public.profiles pr ON pr.id = c.owner_id
     WHERE a.kind = 'event'
       AND a.event_id = p_event
       AND (c.owner_id = v_uid OR public._canvas_entry_admits(a.id, v_uid))
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.list_canvases_shared_with_event(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_canvases_shared_with_event(uuid) TO authenticated;

-- ============================================================================
-- 5. Registration triggers
-- ============================================================================

-- Registering is refused once a host has removed the person. Definer: event_removals is closed to
-- clients, and the check must hold for a client insert and for a service-role one alike.
CREATE OR REPLACE FUNCTION public.p1515_refuse_removed_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.event_removals x
     WHERE x.event_id = NEW.event_id AND x.user_id = NEW.profile_id
  ) THEN
    RAISE EXCEPTION 'registration is closed for you on this event' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.p1515_refuse_removed_registration() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS p1515_refuse_removed_registration ON public.event_rsvps;
CREATE TRIGGER p1515_refuse_removed_registration
  BEFORE INSERT OR UPDATE OF event_id, profile_id ON public.event_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.p1515_refuse_removed_registration();

-- The 12-hour window reads event_rsvps.rsvped_at, which a client insert could otherwise set to any
-- past time and so enter the window late. The server decides when a client registered. Same rule as
-- P1512's chat_stamp_rsvp_time (identical effect where both exist, so shipping order does not
-- matter); service_role (tests, backfills) and role-less contexts (migrations) are untouched. An
-- invoker function on purpose: auth.role() reads the request's role, which a definer would hide.
CREATE OR REPLACE FUNCTION public.p1515_stamp_rsvp_time()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.role(), '') IN ('anon', 'authenticated') THEN
    NEW.rsvped_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.p1515_stamp_rsvp_time() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS p1515_stamp_rsvp_time ON public.event_rsvps;
CREATE TRIGGER p1515_stamp_rsvp_time
  BEFORE INSERT ON public.event_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.p1515_stamp_rsvp_time();

COMMIT;
