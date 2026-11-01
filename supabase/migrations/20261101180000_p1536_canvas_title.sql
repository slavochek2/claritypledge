-- P1536 W8: a canvas has a display title the owner can rename. The address tag (canvases.name, canvas_N) and the version names never
-- change; the title is shown wherever the client showed canvasTitle(name) before, falling back to it while title is NULL.
--
-- client-safe: one new nullable column (canvases is closed to every client role, so no client reads it directly), one new owner-only
--   function (canvas_rename), and six read functions that return ONE MORE field each (title; get_canvas also canvas_id for the owner).
--   Nothing is removed from any result. list_my_artifacts_canvases and list_canvases_shared_with_me return TABLEs, whose row type
--   cannot change under CREATE OR REPLACE: each is dropped and created again inside this transaction, and its grants are restated
--   exactly as before (REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO authenticated). Every other replaced function keeps its
--   signature, SECURITY DEFINER, search_path and grants.
--
-- diffed against (the newest definition of each, each copied byte for byte except the lines marked "-- P1536 W8"):
--   get_canvas                        20261030080000_p1536_v6_engine.sql
--   list_my_artifacts_canvases        20261029100000_p1536_canvas_draft_versions.sql
--   list_canvases_shared_with_me      20261029100000_p1536_canvas_draft_versions.sql
--   get_chat_artifact_attachment      20261029100000_p1536_canvas_draft_versions.sql
--   list_my_canvas_versions           20261029100000_p1536_canvas_draft_versions.sql
--   list_canvases_shared_with_event   20261029100000_p1536_canvas_draft_versions.sql
-- new function: canvas_rename (grepped: no earlier body).

BEGIN;

-- 1. The column. NULL = never renamed: the client shows canvasTitle(name). A non-NULL title is trimmed and 1 to 60 characters.
ALTER TABLE public.canvases ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.canvases DROP CONSTRAINT IF EXISTS canvases_title_check;
ALTER TABLE public.canvases ADD CONSTRAINT canvases_title_check
  CHECK (title IS NULL OR (title = btrim(title) AND char_length(title) BETWEEN 1 AND 60));

-- 2. Rename: the owner only. Trims; refuses an empty or longer-than-60 title and anyone who is not the owner (the refusal every
-- neighbouring canvas function gives: 42501 "not authorized for this canvas", the same for "no such canvas"). Never touches name or a version name.
CREATE OR REPLACE FUNCTION public.canvas_rename(p_canvas uuid, p_title text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_title text := btrim(COALESCE(p_title, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.canvases c WHERE c.id = p_canvas AND c.owner_id = v_uid) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_title) < 1 OR char_length(v_title) > 60 THEN
    RAISE EXCEPTION 'a canvas title is 1 to 60 characters' USING ERRCODE = '22023';
  END IF;
  UPDATE public.canvases c SET title = v_title WHERE c.id = p_canvas AND c.owner_id = v_uid;
  RETURN v_title;
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_rename(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.canvas_rename(uuid, text) TO authenticated;

-- 3. get_canvas: the v6 body plus the access.title and, for the owner, access.canvas_id.
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
  v_pub_none boolean := false;
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
        -- P1536: a reader sees only PUBLISHED versions; the owner also sees the one open draft. No version named
        -- (the address): the newest published, else (owner only) the open draft.
        SELECT v.name INTO v_ver
          FROM public.canvas_versions v
         WHERE v.canvas_id = v_canvas AND (p_version IS NULL OR v.name = lower(p_version))
           AND (v.published_at IS NOT NULL
                OR (v_is_owner AND EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.version_id = v.id AND d.state = 'open')))
         ORDER BY (v.published_at IS NULL), v.published_seq DESC NULLS LAST, v.created_at DESC, v.name DESC
         LIMIT 1;
        v_pub_none := NOT EXISTS (SELECT 1 FROM public.canvas_versions v WHERE v.canvas_id = v_canvas AND v.published_at IS NOT NULL);
      END IF;
      -- Nothing to show on the canvas's own address (nothing published, and no draft for the owner): the admitted
      -- caller still gets an answer, with published_none set. A version that is not for this caller is the empty shape.
      IF v_ver IS NULL AND NOT (v_canvas IS NOT NULL AND p_version IS NULL) THEN v_admitted := false; END IF;
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
       AND v_ver IS NOT NULL
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
               to_jsonb(cp)
               -- P1536: a kept point carries the tag of every version it is in, an unpublished draft's too. Anyone but
               -- the owner gets only the canvas_ tags of PUBLISHED versions of this canvas (box tags and others stay),
               -- so a reader never learns a draft's internal name or which points it keeps.
               || CASE WHEN v_is_owner THEN '{}'::jsonb ELSE jsonb_build_object('system_tags', (
                    SELECT COALESCE(jsonb_agg(t.tag ORDER BY t.n), '[]'::jsonb)
                      FROM unnest(cp.system_tags) WITH ORDINALITY AS t(tag, n)
                     WHERE t.tag NOT LIKE 'canvas\_%'
                        OR EXISTS (SELECT 1 FROM public.canvas_versions pv
                                    WHERE pv.canvas_id = v_canvas AND pv.published_at IS NOT NULL
                                      AND 'canvas_' || pv.name = t.tag))) END
               || jsonb_build_object('creator', (
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
      'versions', CASE
        WHEN v_canvas IS NULL THEN jsonb_build_array(jsonb_build_object('name', v_name, 'seq', 1, 'published_at', NULL, 'created_at', NULL))
        ELSE COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object('name', v.name, 'seq', v.published_seq, 'published_at', v.published_at, 'created_at', v.created_at,
                                      'from_seq', v.from_seq)
                   || CASE WHEN v.published_at IS NULL THEN jsonb_build_object('draft', true) ELSE '{}'::jsonb END
                   ORDER BY (v.published_at IS NULL) DESC, v.published_seq DESC NULLS LAST, v.created_at DESC, v.name DESC)
            FROM public.canvas_versions v
           WHERE v.canvas_id = v_canvas
             AND (v.published_at IS NOT NULL
                  OR (v_is_owner AND EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.version_id = v.id AND d.state = 'open')))
        ), '[]'::jsonb) END,
      'published_none', v_pub_none,
      -- P1536 W8: the canvas's display title (NULL: never renamed), and for the OWNER its id (what canvas_rename takes)
      'title', (SELECT c.title FROM public.canvases c WHERE c.id = v_canvas),
      'canvas_id', CASE WHEN v_is_owner THEN v_canvas END,
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
    ) || CASE WHEN v_is_owner THEN jsonb_build_object('draft', (
        SELECT jsonb_build_object(
                 'id', d.id, 'version', dv.name, 'questions', d.questions, 'thread_root_id', d.thread_root_id,
                 'conversation_id', d.conversation_id, 'base_seq', bv.published_seq,
                 'run_count', d.run_count, 'tension_count', d.tension_count,
                 'revision', d.revision, 'focus', d.focus,
                 'changed_boxes', to_jsonb(public._canvas_draft_changed_boxes(d.id)))
          FROM public.canvas_drafts d
          JOIN public.canvas_versions dv ON dv.id = d.version_id
          LEFT JOIN public.canvas_versions bv ON bv.id = d.base_version_id
         WHERE d.canvas_id = v_canvas AND d.state = 'open'))
      ELSE '{}'::jsonb END
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_canvas(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_canvas(uuid, text, text, text) TO anon, authenticated;

-- 4. list_my_artifacts_canvases: TABLE row type changes (one more column), so drop and create.
DROP FUNCTION IF EXISTS public.list_my_artifacts_canvases();
CREATE OR REPLACE FUNCTION public.list_my_artifacts_canvases()
RETURNS TABLE (
  canvas_id      uuid,
  name           text,
  general_access text,
  has_audience   boolean,
  last_edit      timestamptz,
  title          text -- P1536 W8
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH tagged AS (
    SELECT COALESCE(vc.name, substr(t.tag, 8)) AS cname, max(p.updated_at) AS edited
      FROM public.points p
     CROSS JOIN LATERAL unnest(p.system_tags) AS t(tag)
      LEFT JOIN public.canvas_versions v ON v.owner_id = v_uid AND v.name = substr(t.tag, 8)
      LEFT JOIN public.canvases vc ON vc.id = v.canvas_id
     WHERE p.first_validator_id = v_uid
       AND p.superseded_by IS NULL
       AND p.system_tags && public._canvas_box_tags()
       AND t.tag LIKE 'canvas\_%'
       AND substr(t.tag, 8) ~ '^[a-z0-9_]{1,64}$'
       AND (v.id IS NULL OR v.published_at IS NOT NULL
            OR EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.version_id = v.id AND d.state = 'open'))
     GROUP BY 1
  )
  SELECT c.id,
         COALESCE(c.name, tg.cname),
         COALESCE(c.general_access, 'restricted'),
         COALESCE(EXISTS (SELECT 1 FROM public.canvas_audience a WHERE a.canvas_id = c.id), false),
         COALESCE(tg.edited, c.created_at),
         c.title -- P1536 W8
    FROM tagged tg
    FULL JOIN (SELECT * FROM public.canvases cc WHERE cc.owner_id = v_uid) c ON c.name = tg.cname
   WHERE tg.cname IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.canvas_versions x
                  WHERE x.canvas_id = c.id
                    AND (x.published_at IS NOT NULL
                         OR EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.version_id = x.id AND d.state = 'open')))
   ORDER BY COALESCE(tg.edited, c.created_at) DESC NULLS LAST, COALESCE(c.name, tg.cname);
END;
$$;
REVOKE ALL ON FUNCTION public.list_my_artifacts_canvases() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_artifacts_canvases() TO authenticated;

-- 5. list_canvases_shared_with_me: TABLE row type changes (one more column), so drop and create.
DROP FUNCTION IF EXISTS public.list_canvases_shared_with_me();
CREATE OR REPLACE FUNCTION public.list_canvases_shared_with_me()
RETURNS TABLE (
  canvas_id          uuid,
  name               text,
  owner_id           uuid,
  owner_name         text,
  owner_slug         text,
  owner_avatar_url   text,
  owner_avatar_color text,
  via                text,
  via_name           text,
  shared_at          timestamptz,
  unread             boolean,
  title              text -- P1536 W8
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT c.id,
         c.name,
         c.owner_id,
         op.name,
         op.slug,
         op.avatar_url,
         op.avatar_color,
         a.kind,
         CASE a.kind WHEN 'group' THEN org.name WHEN 'event' THEN ev.title END,
         a.created_at,
         (r.read_at IS NULL OR r.read_at < a.created_at),
         c.title -- P1536 W8
    FROM public.canvases c
    CROSS JOIN LATERAL (SELECT public._canvas_admitted_via(c.id, v_uid) AS aid) v
    JOIN public.canvas_audience a ON a.id = v.aid
    LEFT JOIN public.profiles op ON op.id = c.owner_id
    LEFT JOIN public.organization org ON org.id = a.org_id
    LEFT JOIN public.events ev ON ev.id = a.event_id
    LEFT JOIN public.canvas_reads r ON r.canvas_id = c.id AND r.user_id = v_uid
   WHERE c.owner_id <> v_uid
     AND v.aid IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.canvas_versions x WHERE x.canvas_id = c.id AND x.published_at IS NOT NULL)
   ORDER BY a.created_at DESC, c.id;
END;
$$;
REVOKE ALL ON FUNCTION public.list_canvases_shared_with_me() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_canvases_shared_with_me() TO authenticated;

-- 6. get_chat_artifact_attachment: the canvas card also carries title.
CREATE OR REPLACE FUNCTION public.get_chat_artifact_attachment(p_kind text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_canvas public.canvases;
  v_letter public.clarity_letters;
  v_title  text;
  v_owner  public.profiles;
  v_delivery uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'canvas' THEN
    SELECT * INTO v_canvas FROM public.canvases c WHERE c.id = p_id;
    IF FOUND AND (v_canvas.owner_id = v_uid
                  OR (public._canvas_admitted_via(v_canvas.id, v_uid) IS NOT NULL
                      AND EXISTS (SELECT 1 FROM public.canvas_versions x
                                   WHERE x.canvas_id = v_canvas.id AND x.published_at IS NOT NULL))) THEN
      SELECT * INTO v_owner FROM public.profiles p WHERE p.id = v_canvas.owner_id;
      RETURN jsonb_build_object(
        'available', true, 'kind', 'canvas', 'id', v_canvas.id, 'name', v_canvas.name,
        'owner_id', v_canvas.owner_id, 'owner_name', v_owner.name, 'owner_slug', v_owner.slug,
        'is_owner', v_canvas.owner_id = v_uid, 'title', v_canvas.title); -- P1536 W8
    END IF;
  ELSIF p_kind = 'letter' THEN
    SELECT * INTO v_letter FROM public.clarity_letters l WHERE l.id = p_id;
    IF FOUND AND v_letter.status = 'sealed'
       AND (v_letter.sender_id = v_uid
            OR EXISTS (SELECT 1 FROM public.letter_deliveries d
                        WHERE d.letter_id = v_letter.id AND d.receiver_profile_id = v_uid)) THEN
      SELECT d.title INTO v_title FROM public.clarity_docs d WHERE d.id = v_letter.source_doc_id;
      SELECT * INTO v_owner FROM public.profiles p WHERE p.id = v_letter.sender_id;
      -- The recipient's page is /letter/<delivery id>, not the letter id (a letter with several
      -- recipients has one delivery each). NULL for the sender who is not also a recipient.
      SELECT d.id INTO v_delivery FROM public.letter_deliveries d
       WHERE d.letter_id = v_letter.id AND d.receiver_profile_id = v_uid
       ORDER BY d.created_at, d.id LIMIT 1;
      RETURN jsonb_build_object(
        'available', true, 'kind', 'letter', 'id', v_letter.id, 'title', v_title,
        'sender_id', v_letter.sender_id, 'sender_name', v_owner.name, 'sender_slug', v_owner.slug,
        'is_sender', v_letter.sender_id = v_uid, 'delivery_id', v_delivery);
    END IF;
  END IF;
  RETURN jsonb_build_object('available', false, 'kind', p_kind, 'id', p_id);
END;
$$;
REVOKE ALL ON FUNCTION public.get_chat_artifact_attachment(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_artifact_attachment(text, uuid) TO authenticated;

-- 7. list_my_canvas_versions: each row also carries canvas_title.
CREATE OR REPLACE FUNCTION public.list_my_canvas_versions()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object(
               'id', v.id, 'canvas_id', c.id, 'canvas_name', c.name, 'canvas_title', c.title, 'name', v.name, -- P1536 W8
               'seq', v.published_seq, 'published_at', v.published_at,
               'has_open_draft', EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.canvas_id = c.id AND d.state = 'open'))
             ORDER BY v.published_at DESC, v.id)
      FROM public.canvas_versions v
      JOIN public.canvases c ON c.id = v.canvas_id
     WHERE v.owner_id = v_uid AND v.published_at IS NOT NULL
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.list_my_canvas_versions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_canvas_versions() TO authenticated;

-- 8. list_canvases_shared_with_event: each canvas also carries title.
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
               'owner_id', c.owner_id, 'owner_name', pr.name, 'owner_slug', pr.slug, 'name', c.name, 'title', c.title) -- P1536 W8
             ORDER BY c.created_at, c.id)
      FROM public.canvas_audience a
      JOIN public.canvases c ON c.id = a.canvas_id
      JOIN public.profiles pr ON pr.id = c.owner_id
     WHERE a.kind = 'event'
       AND a.event_id = p_event
       AND (c.owner_id = v_uid
            OR (public._canvas_entry_admits(a.id, v_uid)
                AND EXISTS (SELECT 1 FROM public.canvas_versions x WHERE x.canvas_id = c.id AND x.published_at IS NOT NULL)))
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.list_canvases_shared_with_event(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_canvases_shared_with_event(uuid) TO authenticated;

COMMIT;
