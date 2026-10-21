-- diffed against: 20261021100000_p1515_artifact_sharing.sql (_canvas_event_admits, _canvas_entry_admits,
--   _canvas_can_read, unshare_canvas, get_canvas_audience: their only live bodies) and
--   20261021170000_p1515_review_fixes.sql (get_canvas and share_canvas, the latest bodies). Each body
--   below is byte-for-byte its source except where the edits listed here say otherwise.
-- P1515 phase 3: share with one person, and "anyone with the link" (founder input, 2026-10-21).
--
-- client-safe: purely additive for every deployed client. The whole canvas feature is unreleased
--   (prod holds none of these tables or functions), so re-granting anon EXECUTE on get_canvas and
--   widening the audience kinds break no caller. The new column has a default, the replaced functions
--   keep their signatures, and get_canvas / get_canvas_audience only gain keys. Every REVOKE here acts
--   on a function this same feature created.
--
-- WHAT CHANGES
--   1. canvas_audience gains a third kind, 'person' (profile_id): that one person reads and writes
--      while the entry exists; removing it ends access on their next request. share_canvas and
--      unshare_canvas accept it. A person is accepted only if search_profiles would return them to the
--      owner (same rule: never the owner; the owner or the person is the admin, or the person is in
--      p878_relationship_scope(owner)), so the invite field cannot be used to enumerate users.
--   2. canvases.general_access ('restricted' default | 'link'), set by set_canvas_general_access
--      (owner only; refuses a canvas that still holds a public point, like share_canvas). While 'link':
--      get_canvas admits EVERYONE, signed in or not, and the writes (position, added story) admit any
--      signed-in caller through _canvas_can_read, never anon. get_canvas is executable by anon again;
--      anon still gets the empty not-found shape unless the canvas is 'link'. A 'link' canvas appears
--      in no list: list_canvases_shared_with_event and get_canvas_share_targets are unchanged.
--   3. _canvas_event_admits stops admitting for a cancelled event (review r3, Opus LOW 4).
--   4. get_canvas: the 'access' object gains general_access; 'via' for a person entry carries the
--      OWNER's name and slug (the reader line is "Shared with you by <owner>"); 'visibility' is
--      'shared' while the link is open or a person entry exists. get_canvas_audience returns person
--      entries (people first, then events, then groups) and the canvas's general_access.
--   Rows never change visibility, and the private-points trigger stays: the content of a canvas is
--   served by get_canvas alone and appears in no list, feed, profile, point or story page.
--
-- widens-revoked-grant: 20261021100000 get_canvas is anon-executable again: a signed-out visitor now reads a canvas the owner opened to anyone with the link, and gets the empty not-found shape for every other canvas.
-- widens-revoked-grant: 20261021170000 the review round revoked anon because the page had nothing to ask for signed out; the link feature gives it one. The function decides on every call, so anon sees content only while general_access is 'link'.
BEGIN;

-- 1. Tables. Still closed to every client role (no policy, no grant); the new column and kind are read
--    and written only by the SECURITY DEFINER functions below.
ALTER TABLE public.canvases
  ADD COLUMN IF NOT EXISTS general_access text NOT NULL DEFAULT 'restricted';

ALTER TABLE public.canvas_audience
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Replace the table's CHECK constraints (the kind list and the one-target rule) with versions that
-- know 'person'. Dropping every CHECK on the table first makes a re-run a no-op.
DO $$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT con.conname FROM pg_constraint con
     WHERE con.conrelid = 'public.canvas_audience'::regclass AND con.contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.canvas_audience DROP CONSTRAINT %I', v_name);
  END LOOP;
  FOR v_name IN
    SELECT con.conname FROM pg_constraint con
     WHERE con.conrelid = 'public.canvases'::regclass AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) LIKE '%general_access%'
  LOOP
    EXECUTE format('ALTER TABLE public.canvases DROP CONSTRAINT %I', v_name);
  END LOOP;
END
$$;

ALTER TABLE public.canvas_audience
  ADD CONSTRAINT canvas_audience_kind_check CHECK (kind IN ('event', 'group', 'person')),
  ADD CONSTRAINT canvas_audience_one_target_check CHECK (
    (kind = 'event'  AND event_id IS NOT NULL AND org_id IS NULL AND profile_id IS NULL)
    OR (kind = 'group'  AND org_id IS NOT NULL AND event_id IS NULL AND profile_id IS NULL)
    OR (kind = 'person' AND profile_id IS NOT NULL AND event_id IS NULL AND org_id IS NULL)
  );
ALTER TABLE public.canvases
  ADD CONSTRAINT canvases_general_access_check CHECK (general_access IN ('restricted', 'link'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'canvas_audience_canvas_profile_key' AND conrelid = 'public.canvas_audience'::regclass
  ) THEN
    ALTER TABLE public.canvas_audience
      ADD CONSTRAINT canvas_audience_canvas_profile_key UNIQUE (canvas_id, profile_id);
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS canvas_audience_profile ON public.canvas_audience (profile_id) WHERE profile_id IS NOT NULL;

-- 2. New functions.

-- May the owner add this person? The rule search_profiles applies, minus the name match: never the
-- owner, the person exists, and the owner or the person is the admin or the person is in the owner's
-- relationship scope (letters, accepted agreements, witnesses). Internal: takes any uid.
CREATE OR REPLACE FUNCTION public._canvas_person_eligible(p_owner uuid, p_person uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    p_owner IS NOT NULL
    AND p_person IS NOT NULL
    AND p_owner <> p_person
    AND EXISTS (SELECT 1 FROM public.profiles t WHERE t.id = p_person)
    AND (
      COALESCE((SELECT o.is_admin FROM public.profiles o WHERE o.id = p_owner), false)
      OR COALESCE((SELECT t.is_admin FROM public.profiles t WHERE t.id = p_person), false)
      OR EXISTS (SELECT 1 FROM public.p878_relationship_scope(p_owner) s WHERE s = p_person)
    ),
    false)
$$;
REVOKE ALL ON FUNCTION public._canvas_person_eligible(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- General access: 'restricted' (only the owner and the entries) or 'link' (anyone with the link:
-- signed-in people read and write, signed-out visitors read). Owner only; returns the new value.
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

  INSERT INTO public.canvases (owner_id, name, general_access) VALUES (v_uid, v_name, p_access)
  ON CONFLICT (owner_id, name) DO UPDATE SET general_access = EXCLUDED.general_access;
  RETURN p_access;
END;
$$;
REVOKE ALL ON FUNCTION public.set_canvas_general_access(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_canvas_general_access(text, text) TO authenticated;

-- 3. Existing functions, each copied whole from its latest body with only the edits named in the header.

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
       AND e.status IS DISTINCT FROM 'cancelled'
      FROM public.events e
     WHERE e.id = p_event
  ), false)
$$;

REVOKE ALL ON FUNCTION public._canvas_event_admits(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._canvas_entry_admits(p_entry uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT CASE a.kind
             WHEN 'person' THEN p_uid IS NOT NULL AND a.profile_id = p_uid
             ELSE public._canvas_target_admits(a.kind, a.event_id, a.org_id, c.owner_id)
                  AND public._canvas_target_admits(a.kind, a.event_id, a.org_id, p_uid)
           END
      FROM public.canvas_audience a
      JOIN public.canvases c ON c.id = a.canvas_id
     WHERE a.id = p_entry
  ), false)
$$;

REVOKE ALL ON FUNCTION public._canvas_entry_admits(uuid, uuid) FROM PUBLIC, anon, authenticated;

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
            OR c.general_access = 'link'
            OR public._canvas_admitted_via(c.id, p_uid) IS NOT NULL)
      FROM public.canvases c
     WHERE c.id = p_canvas
  ), false)
$$;

REVOKE ALL ON FUNCTION public._canvas_can_read(uuid, uuid) FROM PUBLIC, anon, authenticated;

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
  v_link     boolean;
  v_result   jsonb;
BEGIN
  IF p_owner IS NOT NULL AND v_name ~ '^[a-z0-9_]{1,64}$' THEN
    v_is_owner := v_uid IS NOT NULL AND v_uid = p_owner;
    SELECT c.id, c.general_access = 'link' INTO v_canvas, v_link
      FROM public.canvases c
     WHERE c.owner_id = p_owner AND c.name = v_name;
    IF v_canvas IS NOT NULL AND NOT v_is_owner THEN
      v_via := public._canvas_admitted_via(v_canvas, v_uid);
    END IF;
    v_admitted := v_is_owner OR v_via IS NOT NULL OR COALESCE(v_link, false);
  END IF;

  -- Not found: the owner, admitted readers and, while the canvas is open to anyone with the link,
  -- everyone are the only audience. Same shape, nothing in it,
  -- and no flag that distinguishes "no such canvas" from "not for you".
  IF NOT COALESCE(v_admitted, false) THEN
    RETURN jsonb_build_object(
      'points', '[]'::jsonb, 'stories', '[]'::jsonb, 'positions', '[]'::jsonb,
      'visibility', NULL,
      'access', jsonb_build_object('is_owner', false, 'admitted', false, 'general_access', 'restricted', 'via', NULL)
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
    -- An open link, or a person entry (the owner is always admitted to their own), counts as shared.
    'visibility', CASE
      WHEN COALESCE(v_link, false) OR EXISTS (
        SELECT 1 FROM public.canvas_audience a
         WHERE a.canvas_id = v_canvas
           AND (a.kind = 'person'
                OR public._canvas_target_admits(a.kind, a.event_id, a.org_id, p_owner))
      ) THEN 'shared' ELSE 'private' END,
    'access', jsonb_build_object(
      'is_owner', v_is_owner,
      'admitted', true,
      'general_access', CASE WHEN COALESCE(v_link, false) THEN 'link' ELSE 'restricted' END,
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

REVOKE ALL ON FUNCTION public.get_canvas(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_canvas(uuid, text) TO anon, authenticated;

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
  IF v_name !~ '^[a-z0-9_]{1,64}$' OR p_kind IS NULL OR p_kind NOT IN ('event', 'group', 'person') OR p_target IS NULL THEN
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
  IF p_kind = 'person' THEN
    -- Only a person the owner could find in the invite field (search_profiles), never themselves.
    IF NOT public._canvas_person_eligible(v_uid, p_target) THEN
      RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public._canvas_target_admits(
       p_kind,
       CASE WHEN p_kind = 'event' THEN p_target END,
       CASE WHEN p_kind = 'group' THEN p_target END,
       v_uid) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.canvases (owner_id, name) VALUES (v_uid, v_name)
  ON CONFLICT (owner_id, name) DO NOTHING;
  SELECT c.id INTO v_canvas FROM public.canvases c WHERE c.owner_id = v_uid AND c.name = v_name;

  INSERT INTO public.canvas_audience (canvas_id, kind, event_id, org_id, profile_id)
  VALUES (
    v_canvas, p_kind,
    CASE WHEN p_kind = 'event' THEN p_target END,
    CASE WHEN p_kind = 'group' THEN p_target END,
    CASE WHEN p_kind = 'person' THEN p_target END
  )
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.share_canvas(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.share_canvas(text, text, uuid) TO authenticated;

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
     AND ((a.kind = 'event' AND a.event_id = p_target)
          OR (a.kind = 'group' AND a.org_id = p_target)
          OR (a.kind = 'person' AND a.profile_id = p_target));
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.unshare_canvas(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unshare_canvas(text, text, uuid) TO authenticated;

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
    RETURN jsonb_build_object('entries', '[]'::jsonb, 'general_access', 'restricted');
  END IF;

  RETURN jsonb_build_object('general_access', (SELECT c.general_access FROM public.canvases c WHERE c.id = v_canvas), 'entries', COALESCE((
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
