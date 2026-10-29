-- P1536 WP1 (1 of 2): draft versions. A version has a published state; a canvas read shows exactly the points
-- tagged with the version asked for; an owner opens, revises (the engine, migration 2), publishes and discards
-- DRAFT versions; the paperclip can attach a canvas version.
--
-- Renamed from 20261027100000 (2026-10-29): P1576's migrations (20261027120000..20261027120700) reached prod first
--   and sorted after this file; it now runs after every main migration, so each body it replaces starts from the
--   LATEST main body (see "diffed against").
--
-- client-safe: the canvas drafting feature is unreleased (prod holds none of canvas_versions, the P1515 phase 5
--   functions or anything below). Every replaced function keeps its signature, its return shape (get_canvas only
--   GAINS keys; the old keys stay) and its grants, all restated. Two internal trigger functions are dropped
--   (_canvas_point_one_version, _canvas_version_keeps_points_single): no client can execute either. The chat
--   attachment kind check is widened by one value. list_my_artifacts_canvases, list_canvases_shared_with_me,
--   get_chat_artifact_attachment (P1545) and list_canvases_shared_with_event (P1515) keep their signatures, return
--   shapes and grants (restated); the owner's list folds version tags onto their canvas (one row per canvas, as the
--   client already shows it) and readers' rows hide a canvas with nothing published. get_canvas gives a reader fewer
--   entries in a point's system_tags (never an unpublished version's tag); the key and its type are unchanged. Every new client function is granted to authenticated only;
--   every _canvas_* helper is closed to every client role.
--
-- diffed against (each replaced body below is byte-for-byte its source except where this header says otherwise;
--   each edit is pinned by src/tests/p1536-draft-versions-migration.test.ts):
--   20261022170000_p1515_canvas_versions.sql
--     get_canvas, _canvas_resolve, _canvas_first_version, _canvas_point_in_canvas (their only live bodies)
--   20261021100000_p1515_artifact_sharing.sql
--     _canvas_point_in (its only live body)
--   20261023100000_p1545_artifacts_data.sql
--     share_canvas, send_chat_message, _chat_can_attach (their latest bodies; P1545 replaced all three after P1536 was
--     first diffed, and dropped the 3-argument _chat_can_attach, which this file does not re-create). Every P1545
--     behaviour stays: the 'canvas' and 'letter' kinds and their audience rules, the conversation passed to
--     _chat_can_attach, and share_canvas posting one chat message on a NEW grant (RETURNING id INTO v_entry).
--     Also list_my_artifacts_canvases and list_canvases_shared_with_me (their only live bodies).
--   20261023110000_p1545_chat_letter_delivery_id.sql
--     get_chat_artifact_attachment (its latest body)
--   20261021100000_p1515_artifact_sharing.sql
--     list_canvases_shared_with_event (its only live body)
--   20261021230000_p1515_link_write_snapshot.sql
--     set_canvas_general_access (its only live body)
--   20261022190000_p1515_canvas_versions_race.sql
--     _canvas_version_immutable
--   20261019203000_p1512_clarity_chat.sql
--     forward_chat_message (its only live body)
--   20261027120600_p1576_mirror_voice_and_waveform.sql
--     mirror_request_reply (its latest body: P1576's transcript wait, on 20261023170000_p1554_review_fixes.sql's
--     body). P1536's canvas-thread quiet rule is the one edit, placed before the transcript wait.
--   20261027120700_p1576_mirror_voice_server_trigger.sql
--     _mirror_voice_start_reply (its only live body): the same canvas-thread quiet rule, after its owner check.
--     The trigger that calls it is not touched.
-- new function: _canvas_next_version_seq, _canvas_version_default_publish, _canvas_owner_has_points,
--   _canvas_has_public_point, _canvas_draft_clear_points, _canvas_draft_material_retention, canvas_draft_open,
--   canvas_draft_discard, canvas_draft_publish, list_my_canvas_versions (all new, grepped: no earlier body).
--
-- WHAT CHANGES
--   1. canvas_versions gains published_at and published_seq (both null, or both set; unique per canvas). Every
--      existing version is backfilled as published, numbered by created_at. A version INSERTED without them is
--      published at once with the next number (a BEFORE INSERT trigger), so every existing writer (the seed script,
--      the service role, the share paths) keeps meaning "a version readers can read". Only canvas_draft_open opts
--      out, with the transaction-local setting p1536.first_version_draft. A published version never changes back.
--   2. REUSE OVERTURNS the P1515 single-version rule: an unchanged point carries the tag of every version it is in,
--      so its positions and stories carry over. The two integrity triggers and their functions are dropped.
--   3. A version shows exactly the points tagged with it, superseded or not. The superseded_by filter is removed from
--      every live canvas body that had one: get_canvas (:165 of 20261022170000), _canvas_point_in (:266 of
--      20261021100000), share_canvas (:412 and :424 of 20261023100000) and set_canvas_general_access (:196 and
--      :206 of 20261021230000). The last two now ask _canvas_owner_has_points / _canvas_has_public_point, which look
--      at the points of every version of the canvas (published ones, for the ownership question).
--   4. get_canvas: a reader (anyone but the owner) resolves only PUBLISHED versions; a draft asked for by name gives
--      the same empty answer as a canvas that cannot be read. The owner gets the newest published version, else the
--      open draft. access gains seq and published_at on every version, draft:true on the owner's draft, published_none
--      and, for the owner only, access.draft. With nothing published an admitted reader gets an answer with
--      published_none set, not the not-found shape. A kept point carries every version's tag, an unpublished draft's
--      too: anyone but the owner gets each point's system_tags with every canvas_ tag that is not a PUBLISHED version of
--      this canvas removed, so a reader never learns a draft's internal name or which points it keeps.
--   5. _canvas_point_in_canvas: a caller who is not the owner may write only on a point of a PUBLISHED version.
--   6. _canvas_resolve also finds a canvas by its own name, because a canvas opened by a draft has no version that
--      carries its name. _canvas_first_version skips its insert in that case.
--   7. canvas_drafts, canvas_draft_runs, canvas_draft_material: the draft, its runs and its extracted text. Closed to
--      clients except an owner SELECT through a column grant (never the pending links, the spend link, the derived
--      refs or the extracted text itself).
--   8. canvas_draft_open / canvas_draft_discard / canvas_draft_publish / list_my_canvas_versions.
--   9. Chat: attachment_kind accepts 'canvas_version' (a canvas_versions.id) beside P1545's 'canvas' and 'letter';
--      _chat_can_attach (the 4-argument one, which receives the conversation) admits it only for its owner and only
--      into the owner's own mirror; mirror_request_reply gives no job for any message in a canvas draft's thread (or
--      its root), whatever the draft's state (founder 2026-10-27: the mirror stays quiet in canvas threads), and
--      neither does P1576's server path for a voice note (_mirror_voice_start_reply);
--      forward_chat_message refuses to copy a canvas_version attachment out of the mirror.
--  10. Review fixes: canvas_drafts.created_story_ids (the stories the engine made: only those are ever deleted);
--      canvas_draft_runs.state accepts 'cancelled' (erasure) and spend_id references mirror_ai_spend;
--      canvas_draft_open continues an untouched new-canvas draft instead of starting another;
--      canvas_drafts.canvas_name / version_name (the draft's address) are in the owner's column grant.
--  11. The Artifacts lists (P1545). list_my_artifacts_canvases folds every canvas_<version> tag onto the canvas that
--      version belongs to, so a draft version (<canvas>_d<hex>) is never a canvas of its own; a discarded draft's version
--      lends nothing; a canvas whose only version is an open draft is listed for its owner. list_canvases_shared_with_me,
--      get_chat_artifact_attachment and (P1515) list_canvases_shared_with_event show a reader only a canvas with a
--      published version. The other P1545 canvas
--      functions take a canvases.id or a canvas name, never a tag, and need no fold (_chat_post_canvas_share,
--      mark_canvas_read; _chat_can_attach and share_canvas are rebuilt above).

BEGIN;

-- ============================================================================
-- 1. canvas_versions: the published state
-- ============================================================================
DO $p1536_versions$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'canvas_versions' AND column_name = 'published_at') THEN
    ALTER TABLE public.canvas_versions ADD COLUMN published_at timestamptz, ADD COLUMN published_seq integer;
    -- Every version that exists today is a version readers can read: published, numbered by age.
    UPDATE public.canvas_versions v
       SET published_at = v.created_at, published_seq = r.rn
      FROM (SELECT x.id, row_number() OVER (PARTITION BY x.canvas_id ORDER BY x.created_at, x.name) AS rn
              FROM public.canvas_versions x) r
     WHERE v.id = r.id;
  END IF;
END
$p1536_versions$;

ALTER TABLE public.canvas_versions DROP CONSTRAINT IF EXISTS canvas_versions_published_pair;
ALTER TABLE public.canvas_versions ADD CONSTRAINT canvas_versions_published_pair
  CHECK ((published_at IS NULL) = (published_seq IS NULL) AND (published_seq IS NULL OR published_seq >= 1));
ALTER TABLE public.canvas_versions DROP CONSTRAINT IF EXISTS canvas_versions_canvas_seq_key;
ALTER TABLE public.canvas_versions ADD CONSTRAINT canvas_versions_canvas_seq_key UNIQUE (canvas_id, published_seq);

-- The next number of a canvas, under one lock per canvas: a second writer waits for the first to COMMIT and then
-- (READ COMMITTED: a fresh snapshot per statement) sees its number. The unique key above is the backstop.
CREATE OR REPLACE FUNCTION public._canvas_next_version_seq(p_canvas uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('p1536:canvas_seq:' || p_canvas::text, 0));
  RETURN COALESCE((SELECT max(v.published_seq) FROM public.canvas_versions v WHERE v.canvas_id = p_canvas), 0) + 1;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_next_version_seq(uuid) FROM PUBLIC, anon, authenticated;

-- A version inserted with no published state is published now, unless the writer opted out for this transaction.
CREATE OR REPLACE FUNCTION public._canvas_version_default_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.published_at IS NULL AND NEW.published_seq IS NULL
     AND COALESCE(current_setting('p1536.first_version_draft', true), '') <> 'on' THEN
    NEW.published_seq := public._canvas_next_version_seq(NEW.canvas_id);
    NEW.published_at  := NEW.created_at;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_version_default_publish() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_p1536_version_default_publish ON public.canvas_versions;
CREATE TRIGGER trg_p1536_version_default_publish
  BEFORE INSERT ON public.canvas_versions
  FOR EACH ROW EXECUTE FUNCTION public._canvas_version_default_publish();

-- A published version is published for good: the fields go NULL to a value once, never back and never to another.
CREATE OR REPLACE FUNCTION public._canvas_version_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.canvas_id IS DISTINCT FROM OLD.canvas_id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.name IS DISTINCT FROM OLD.name THEN
    RAISE EXCEPTION 'a canvas version cannot be renamed or moved' USING ERRCODE = '23514';
  END IF;
  -- P1536: a published version stays published, with the same number.
  IF OLD.published_at IS NOT NULL
     AND (NEW.published_at IS DISTINCT FROM OLD.published_at OR NEW.published_seq IS DISTINCT FROM OLD.published_seq) THEN
    RAISE EXCEPTION 'a published canvas version cannot change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_version_immutable() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. Reuse: a point may be on several versions of one canvas (P1515 phase 5 integrity, reversed)
-- ============================================================================
DROP TRIGGER IF EXISTS trg_p1515_point_one_version ON public.points;
DROP TRIGGER IF EXISTS trg_p1515_version_points_single ON public.canvas_versions;
DROP FUNCTION IF EXISTS public._canvas_point_one_version();
DROP FUNCTION IF EXISTS public._canvas_version_keeps_points_single();

-- ============================================================================
-- 3. The draft, its runs and its material
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.canvas_drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id      uuid NOT NULL UNIQUE REFERENCES public.canvas_versions(id) ON DELETE CASCADE,
  canvas_id       uuid NOT NULL REFERENCES public.canvases(id) ON DELETE CASCADE,
  owner_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  base_version_id uuid REFERENCES public.canvas_versions(id) ON DELETE SET NULL,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  thread_root_id  uuid NOT NULL UNIQUE REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  -- the app address of the draft: /p/<slug>/canvas/<canvas_name>?v=<version_name>. Both names are immutable (a
  -- version cannot be renamed); read by the owner with the rest of the row, so no one else can read them.
  canvas_name     text NOT NULL,
  version_name    text NOT NULL,
  state           text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'published', 'discarded')),
  run_count       integer NOT NULL DEFAULT 0 CHECK (run_count >= 0),
  tension_count   integer NOT NULL DEFAULT 0 CHECK (tension_count >= 0),
  -- [{old, new, why}]: written by the engine, applied at Publish, never shown to a client
  pending_links   jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(pending_links) = 'array'),
  -- links Publish had to skip (the old point was no longer a head): [{old, new, why}]
  skipped_links   jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(skipped_links) = 'array'),
  -- {canvas box tag: question}: the boxes the material said nothing about, shown to the owner only
  questions       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(questions) = 'object'),
  -- "What I decided on my own" and the tension options of the slow speed
  decided         jsonb NOT NULL DEFAULT '[]'::jsonb,
  tensions        jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- whose words the stored tensions were derived from (the tension run's derived_refs): every later draft run that
  -- reads the tensions carries these refs too, so erasing one of those people cancels it. Cleared with the tensions.
  -- Never granted to a client.
  tension_refs    text[] NOT NULL DEFAULT '{}',
  -- the private stories the ENGINE wrote for this draft's points: a revision or a discard deletes these (when no
  -- point links them any more) and never a story the owner wrote or attached by hand. Never granted to a client.
  created_story_ids uuid[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz,
  CONSTRAINT canvas_drafts_closed_iff_not_open CHECK ((state = 'open') = (closed_at IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS canvas_drafts_one_open ON public.canvas_drafts (canvas_id) WHERE state = 'open';
CREATE INDEX IF NOT EXISTS canvas_drafts_owner ON public.canvas_drafts (owner_id, state);
CREATE INDEX IF NOT EXISTS canvas_drafts_tension_refs ON public.canvas_drafts USING gin (tension_refs)
  WHERE tension_refs <> '{}';
ALTER TABLE public.canvas_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.canvas_drafts FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, version_id, canvas_id, owner_id, base_version_id, conversation_id, thread_root_id, canvas_name, version_name, state,
              run_count, tension_count, skipped_links, questions, decided, tensions, created_at, closed_at)
  ON public.canvas_drafts TO authenticated;
DROP POLICY IF EXISTS canvas_drafts_select ON public.canvas_drafts;
CREATE POLICY canvas_drafts_select ON public.canvas_drafts FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- One model call of a draft: a durable row, so a reload loses nothing and a second press cannot start a second run.
CREATE TABLE IF NOT EXISTS public.canvas_draft_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id     uuid NOT NULL REFERENCES public.canvas_drafts(id) ON DELETE CASCADE,
  owner_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('tensions', 'draft', 'extract')),
  speed        text NOT NULL CHECK (speed IN ('fast', 'slow')),
  -- 'cancelled': erase_chat_data_for cancelled a run that read the erased person's words; its completion writes nothing
  state        text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'running', 'done', 'failed', 'capped', 'cancelled')),
  attempts     integer NOT NULL DEFAULT 0,
  spend_id     uuid REFERENCES public.mirror_ai_spend(id) ON DELETE SET NULL,
  derived_refs text[],
  error_code   text CHECK (error_code IS NULL OR char_length(error_code) <= 40),
  created_at   timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz,
  finished_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS canvas_draft_runs_one_active ON public.canvas_draft_runs (owner_id)
  WHERE state IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS canvas_draft_runs_draft ON public.canvas_draft_runs (draft_id, created_at);
CREATE INDEX IF NOT EXISTS canvas_draft_runs_derived_refs ON public.canvas_draft_runs USING gin (derived_refs)
  WHERE derived_refs IS NOT NULL;
ALTER TABLE public.canvas_draft_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.canvas_draft_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, draft_id, owner_id, kind, speed, state, error_code, created_at, started_at, finished_at)
  ON public.canvas_draft_runs TO authenticated;
DROP POLICY IF EXISTS canvas_draft_runs_select ON public.canvas_draft_runs;
CREATE POLICY canvas_draft_runs_select ON public.canvas_draft_runs FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- The text of an upload or a link, kept with the draft until it is published or discarded. The original file is
-- never stored. The owner may list what was read (label, size) but never the text itself.
CREATE TABLE IF NOT EXISTS public.canvas_draft_material (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id   uuid NOT NULL REFERENCES public.canvas_drafts(id) ON DELETE CASCADE,
  owner_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('file', 'link')),
  label      text NOT NULL CHECK (char_length(label) <= 200),
  text       text NOT NULL CHECK (char_length(text) <= 200000),
  chars      integer NOT NULL CHECK (chars >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canvas_draft_material_chars CHECK (chars = char_length(text))
);
CREATE INDEX IF NOT EXISTS canvas_draft_material_draft ON public.canvas_draft_material (draft_id, created_at);
ALTER TABLE public.canvas_draft_material ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.canvas_draft_material FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, draft_id, owner_id, kind, label, chars, created_at) ON public.canvas_draft_material TO authenticated;
DROP POLICY IF EXISTS canvas_draft_material_select ON public.canvas_draft_material;
CREATE POLICY canvas_draft_material_select ON public.canvas_draft_material FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- ============================================================================
-- 4. Helpers (internal: no client role may execute any of them)
-- ============================================================================
CREATE OR REPLACE FUNCTION public._canvas_first_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- P1536: a canvas opened by a draft has no first version of its own name; its draft is its first version.
  IF current_setting('p1536.first_version_draft', true) = 'on' THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.canvas_versions (canvas_id, owner_id, name, created_at)
  VALUES (NEW.id, NEW.owner_id, NEW.name, NEW.created_at);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_first_version() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._canvas_resolve(p_owner uuid, p_name text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  -- P1536: also by the canvas's own name: a canvas opened by a draft has no version that carries it.
  SELECT COALESCE(
    (SELECT v.canvas_id FROM public.canvas_versions v WHERE v.owner_id = p_owner AND v.name = lower(COALESCE(p_name, ''))),
    (SELECT c.id FROM public.canvases c WHERE c.owner_id = p_owner AND c.name = lower(COALESCE(p_name, ''))))
$$;
REVOKE ALL ON FUNCTION public._canvas_resolve(uuid, text) FROM PUBLIC, anon, authenticated;

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
       AND p.system_tags @> ARRAY['canvas_' || lower(p_name)]::text[]
       AND p.system_tags && public._canvas_box_tags()
  ), false)
$$;
REVOKE ALL ON FUNCTION public._canvas_point_in(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

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
                     FROM public.canvas_versions v
                    WHERE v.canvas_id = p_canvas AND (v.published_at IS NOT NULL OR auth.uid() = p_owner)), false)
  END
$$;
REVOKE ALL ON FUNCTION public._canvas_point_in_canvas(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- Does this owner have a canvas of this name with at least one point to share? A canvas with a record: a point on a
-- PUBLISHED version of it. A canvas with no record (private, never shared): a point tagged with its own name.
CREATE OR REPLACE FUNCTION public._canvas_owner_has_points(p_owner uuid, p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN public._canvas_resolve(p_owner, p_name) IS NULL THEN EXISTS (
      SELECT 1 FROM public.points p
       WHERE p.first_validator_id = p_owner
         AND p.system_tags @> ARRAY['canvas_' || lower(p_name)]::text[]
         AND p.system_tags && public._canvas_box_tags())
    ELSE EXISTS (
      SELECT 1
        FROM public.canvas_versions v
        JOIN public.points p ON p.first_validator_id = v.owner_id
                            AND p.system_tags @> ARRAY['canvas_' || v.name]::text[]
                            AND p.system_tags && public._canvas_box_tags()
       WHERE v.canvas_id = public._canvas_resolve(p_owner, p_name)
         AND v.owner_id = p_owner
         AND v.published_at IS NOT NULL)
  END
$$;
REVOKE ALL ON FUNCTION public._canvas_owner_has_points(uuid, text) FROM PUBLIC, anon, authenticated;

-- Does any version of this canvas hold a PUBLIC point (a legacy seed)? Sharing refuses it.
CREATE OR REPLACE FUNCTION public._canvas_has_public_point(p_owner uuid, p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.points p
     WHERE p.first_validator_id = p_owner
       AND p.visibility = 'public'::public.content_visibility
       AND p.system_tags && COALESCE(
             (SELECT array_agg('canvas_' || v.name) FROM public.canvas_versions v
               WHERE v.canvas_id = public._canvas_resolve(p_owner, p_name)),
             ARRAY['canvas_' || lower(p_name)]::text[]))
$$;
REVOKE ALL ON FUNCTION public._canvas_has_public_point(uuid, text) FROM PUBLIC, anon, authenticated;

-- Deletes the points a draft CREATED (those that carry no other version's tag), then the private stories the engine
-- wrote for the draft (canvas_drafts.created_story_ids) that no point links any more, and takes the draft's tag off the
-- points it REUSED. Never deletes a reused point, nor a story the owner wrote or attached by hand.
-- Not search_path = '': the cascades and triggers on points, stories, story_points and point_positions resolve
-- unqualified table names through the caller's search_path (precedent: canvas_add_story, 20261022170000).
-- Every relation named here is schema-qualified.
CREATE OR REPLACE FUNCTION public._canvas_draft_clear_points(p_draft uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_d       public.canvas_drafts;
  v_tag     text;
  v_created uuid[];
BEGIN
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  SELECT 'canvas_' || v.name INTO v_tag FROM public.canvas_versions v WHERE v.id = v_d.version_id;

  SELECT COALESCE(array_agg(p.id), '{}') INTO v_created
    FROM public.points p
   WHERE p.first_validator_id = v_d.owner_id
     AND p.visibility = 'private'::public.content_visibility
     AND p.system_tags @> ARRAY[v_tag]::text[]
     AND NOT EXISTS (SELECT 1 FROM unnest(p.system_tags) t WHERE t LIKE 'canvas\_%' AND t <> v_tag);
  IF cardinality(v_created) > 0 THEN
    DELETE FROM public.points p WHERE p.id = ANY (v_created);
  END IF;
  -- Only the stories the ENGINE wrote for this draft, and only when no point links them any more. A story the
  -- owner wrote or attached by hand to a draft point was never recorded here, so it is never deleted.
  DELETE FROM public.stories s
   WHERE s.id = ANY (v_d.created_story_ids) AND s.author_id = v_d.owner_id AND s.visibility = 'private'::public.content_visibility
     AND NOT EXISTS (SELECT 1 FROM public.story_points sp WHERE sp.story_id = s.id);
  UPDATE public.canvas_drafts d SET created_story_ids = '{}' WHERE d.id = v_d.id;

  -- what remains with the draft's tag is reused: the tag leaves, the point stays
  UPDATE public.points p
     SET system_tags = array_remove(p.system_tags, v_tag)
   WHERE p.first_validator_id = v_d.owner_id AND p.system_tags @> ARRAY[v_tag]::text[];
  RETURN cardinality(v_created);
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_clear_points(uuid) FROM PUBLIC, anon, authenticated;

-- The extracted text is deleted when the draft is published or discarded.
-- [FOUNDER DECISION: Open Question 1 — keep extracted text after Publish? Today: delete.]
CREATE OR REPLACE FUNCTION public._canvas_draft_material_retention(p_draft uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM public.canvas_draft_material m WHERE m.draft_id = p_draft;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_material_retention(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 5. The read
-- ============================================================================
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
                   jsonb_build_object('name', v.name, 'seq', v.published_seq, 'published_at', v.published_at, 'created_at', v.created_at)
                   || CASE WHEN v.published_at IS NULL THEN jsonb_build_object('draft', true) ELSE '{}'::jsonb END
                   ORDER BY (v.published_at IS NULL) DESC, v.published_seq DESC NULLS LAST, v.created_at DESC, v.name DESC)
            FROM public.canvas_versions v
           WHERE v.canvas_id = v_canvas
             AND (v.published_at IS NOT NULL
                  OR (v_is_owner AND EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.version_id = v.id AND d.state = 'open')))
        ), '[]'::jsonb) END,
      'published_none', v_pub_none,
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
                 'run_count', d.run_count, 'tension_count', d.tension_count)
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

-- ============================================================================
-- 6. Sharing asks the versions, not one name
-- ============================================================================
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
  v_entry  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF v_name !~ '^[a-z0-9_]{1,64}$' OR p_kind IS NULL OR p_kind NOT IN ('event', 'group', 'person') OR p_target IS NULL THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  -- The caller must actually own a canvas of this name with at least one point on a PUBLISHED version (P1536:
  -- an unpublished canvas is shared only after Publish).
  IF NOT public._canvas_owner_has_points(v_uid, v_name) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  -- Everything inside a canvas follows the canvas, so a canvas must hold no PUBLIC point. The trigger
  -- below keeps new ones out; this refuses a legacy canvas that still has one (its visibility cannot
  -- change, p586), with the same message as every other refusal.
  IF public._canvas_has_public_point(v_uid, v_name) THEN
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
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_entry;

  -- P1545: a NEW grant posts one attachment message in the matching chat; a re-share (the entry
  -- already existed) posts nothing. Sharing must never fail because of chat, so a failure to post is a
  -- warning, not an error (the canvas still shows in Shared with you).
  IF v_entry IS NOT NULL THEN
    BEGIN
      PERFORM public._chat_post_canvas_share(v_uid, v_canvas, p_kind, p_target);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'share_canvas: chat message not posted (%)', SQLERRM;
    END;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.share_canvas(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.share_canvas(text, text, uuid) TO authenticated;

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

  -- Serialise with the token-checked writes (they hold FOR SHARE on this row): a close or reopen waits for a
  -- write in flight, and a write that starts after it sees the new token and generation.
  PERFORM 1 FROM public.canvases c WHERE c.owner_id = v_uid AND c.name = v_name FOR UPDATE;

  IF p_access = 'restricted' THEN
    UPDATE public.canvases c
       SET general_access = 'restricted', link_token = NULL
     WHERE c.owner_id = v_uid AND c.name = v_name;
    RETURN jsonb_build_object('general_access', 'restricted', 'link_token', NULL);
  END IF;

  -- Opening: the caller must actually own a canvas of this name with a point on a PUBLISHED version (P1536) ...
  IF NOT public._canvas_owner_has_points(v_uid, v_name) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  -- ... and it must hold no PUBLIC point (a legacy seed), exactly as sharing it requires.
  IF public._canvas_has_public_point(v_uid, v_name) THEN
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

-- ============================================================================
-- 7. Client functions: open, discard, publish, list
-- ============================================================================
-- Opens a draft: a new canvas (p_from_version NULL) or a new version of one of the caller's canvases, started from
-- one of its PUBLISHED versions. Creates the draft version (internal name <canvas>_d<6 hex>, never shown), the thread
-- root in the caller's mirror (an owner message with no text whose attachment is the version the draft starts from, or
-- for a new canvas the draft itself, so the mirror answers nothing) and the draft row. A second open draft of the
-- same canvas is never started: the open one is returned ('open_elsewhere') so the client can ask. A new canvas
-- while an untouched new-canvas draft is open returns that draft ('opened', resumed: true).
CREATE OR REPLACE FUNCTION public.canvas_draft_open(p_from_version uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_open CONSTANT integer := 10;
  v_uid    uuid := auth.uid();
  v_base   public.canvas_versions;
  v_canvas public.canvases;
  v_open   public.canvas_drafts;
  v_name   text := 'canvas';
  v_n      integer := 1;
  v_vname  text;
  v_ver    uuid;
  v_conv   uuid;
  v_root   uuid;
  v_at     timestamptz;
  v_draft  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = v_uid AND pr.is_verified = true) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));

  IF p_from_version IS NOT NULL THEN
    -- one error for "no such version", "not yours" and "not published": ids cannot be probed
    SELECT v.* INTO v_base FROM public.canvas_versions v
     WHERE v.id = p_from_version AND v.owner_id = v_uid AND v.published_at IS NOT NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
    END IF;
    SELECT c.* INTO v_canvas FROM public.canvases c WHERE c.id = v_base.canvas_id FOR UPDATE;
    SELECT d.* INTO v_open FROM public.canvas_drafts d WHERE d.canvas_id = v_canvas.id AND d.state = 'open';
    IF FOUND THEN
      RETURN jsonb_build_object(
        'status', 'open_elsewhere', 'draft_id', v_open.id, 'conversation_id', v_open.conversation_id,
        'thread_root_id', v_open.thread_root_id, 'canvas_name', v_canvas.name,
        'from_seq', (SELECT b.published_seq FROM public.canvas_versions b WHERE b.id = v_open.base_version_id));
    END IF;
  END IF;

  -- A new canvas while an UNTOUCHED new-canvas draft is open (no run, no material, no message in its thread, root
  -- still there): that draft is continued, not a second one started. It does not count against the cap.
  IF p_from_version IS NULL THEN
    SELECT d.* INTO v_open FROM public.canvas_drafts d
     WHERE d.owner_id = v_uid AND d.state = 'open' AND d.base_version_id IS NULL AND d.run_count = 0 AND d.tension_count = 0
       AND NOT EXISTS (SELECT 1 FROM public.canvas_draft_runs r WHERE r.draft_id = d.id)
       AND NOT EXISTS (SELECT 1 FROM public.canvas_draft_material m WHERE m.draft_id = d.id)
       AND NOT EXISTS (SELECT 1 FROM public.chat_messages t WHERE t.thread_root_id = d.thread_root_id AND t.deleted_at IS NULL)
       AND EXISTS (SELECT 1 FROM public.chat_messages t WHERE t.id = d.thread_root_id AND t.deleted_at IS NULL)
     ORDER BY d.created_at DESC LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'status', 'opened', 'resumed', true, 'draft_id', v_open.id, 'conversation_id', v_open.conversation_id,
        'thread_root_id', v_open.thread_root_id,
        'canvas_name', (SELECT c.name FROM public.canvases c WHERE c.id = v_open.canvas_id),
        'version_name', (SELECT v.name FROM public.canvas_versions v WHERE v.id = v_open.version_id),
        'from_seq', NULL);
    END IF;
  END IF;

  IF (SELECT count(*) FROM public.canvas_drafts d WHERE d.owner_id = v_uid AND d.state = 'open') >= c_max_open THEN
    RAISE EXCEPTION 'too many open drafts' USING ERRCODE = '54000';
  END IF;

  IF p_from_version IS NULL THEN
    -- A new canvas, with an automatic address: canvas, canvas_2, ... a name no canvas, version or point tag of the
    -- owner uses yet. It has no first version of its own name: its draft is its first version.
    WHILE EXISTS (SELECT 1 FROM public.canvases c WHERE c.owner_id = v_uid AND c.name = v_name)
       OR EXISTS (SELECT 1 FROM public.canvas_versions v WHERE v.owner_id = v_uid AND v.name = v_name)
       OR EXISTS (SELECT 1 FROM public.points p WHERE p.first_validator_id = v_uid
                    AND p.system_tags @> ARRAY['canvas_' || v_name]::text[]) LOOP
      v_n := v_n + 1;
      v_name := 'canvas_' || v_n;
    END LOOP;
    PERFORM set_config('p1536.first_version_draft', 'on', true);
    INSERT INTO public.canvases (owner_id, name) VALUES (v_uid, v_name) RETURNING * INTO v_canvas;
  END IF;

  LOOP
    v_vname := left(v_canvas.name, 56) || '_d' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.canvas_versions v WHERE v.owner_id = v_uid AND v.name = v_vname);
  END LOOP;
  PERFORM set_config('p1536.first_version_draft', 'on', true);
  INSERT INTO public.canvas_versions (canvas_id, owner_id, name) VALUES (v_canvas.id, v_uid, v_vname)
  RETURNING id INTO v_ver;
  PERFORM set_config('p1536.first_version_draft', 'off', true);

  v_conv := public._chat_ensure_mirror(v_uid);
  INSERT INTO public.chat_messages (conversation_id, author_id, body, kind, attachment_kind, attachment_id, created_at)
  VALUES (v_conv, v_uid, NULL, 'message', 'canvas_version', COALESCE(p_from_version, v_ver), clock_timestamp())
  RETURNING id, created_at INTO v_root, v_at;
  UPDATE public.chat_conversations c SET last_message_at = v_at WHERE c.id = v_conv;
  INSERT INTO public.chat_member_state (conversation_id, profile_id, last_read_at, manual_unread)
  VALUES (v_conv, v_uid, v_at, false)
  ON CONFLICT (conversation_id, profile_id) DO UPDATE
    SET last_read_at  = GREATEST(COALESCE(public.chat_member_state.last_read_at, '-infinity'::timestamptz), EXCLUDED.last_read_at),
        manual_unread = false;

  INSERT INTO public.canvas_drafts (version_id, canvas_id, owner_id, base_version_id, conversation_id, thread_root_id, canvas_name, version_name)
  VALUES (v_ver, v_canvas.id, v_uid, p_from_version, v_conv, v_root, v_canvas.name, v_vname)
  RETURNING id INTO v_draft;

  RETURN jsonb_build_object(
    'status', 'opened', 'draft_id', v_draft, 'conversation_id', v_conv, 'thread_root_id', v_root,
    'canvas_name', v_canvas.name, 'version_name', v_vname,
    'from_seq', (SELECT b.published_seq FROM public.canvas_versions b WHERE b.id = p_from_version));
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_open(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_open(uuid) TO authenticated;

-- Discards an open draft: its created points and stories go, the tag leaves the points it reused, the extracted text
-- goes. The version row stays (it holds no number and no point, and is hidden because its draft is not open), so a
-- discard leaves no gap in the numbering. Refused while a run is active (a run that finished later would write into a
-- closed draft). Returns false for a draft that is already closed.
-- Not search_path = '': deleting points and stories fires triggers that resolve unqualified names (see
-- _canvas_draft_clear_points).
CREATE OR REPLACE FUNCTION public.canvas_draft_discard(p_draft uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_d   public.canvas_drafts;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  IF v_d.state <> 'open' THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.canvas_draft_runs r
              WHERE r.draft_id = v_d.id AND r.state IN ('queued', 'running')
                AND COALESCE(r.started_at, r.created_at) > now() - interval '5 minutes') THEN
    RAISE EXCEPTION 'a draft run is active' USING ERRCODE = '55006';
  END IF;
  PERFORM public._canvas_draft_clear_points(v_d.id);
  UPDATE public.canvas_drafts d SET state = 'discarded', closed_at = now() WHERE d.id = v_d.id;
  PERFORM public._canvas_draft_material_retention(v_d.id);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_discard(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_discard(uuid) TO authenticated;

-- Publishes an open draft: needs at least one point and no active run. Under the per-owner lock it applies each
-- pending supersede link only if the old point is still a head and still the owner's point on a version of this
-- canvas (the link is skipped, and recorded in skipped_links, otherwise), then gives the version the next number.
-- Not search_path = '': the supersede trigger on points reads `points` unqualified.
CREATE OR REPLACE FUNCTION public.canvas_draft_publish(p_draft uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_d       public.canvas_drafts;
  v_tag     text;
  v_link    jsonb;
  v_old     uuid;
  v_new     uuid;
  v_why     text;
  v_skipped jsonb := '[]'::jsonb;
  v_seq     integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  IF v_d.state <> 'open' THEN
    RAISE EXCEPTION 'this draft is closed' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.canvas_draft_runs r
              WHERE r.draft_id = v_d.id AND r.state IN ('queued', 'running')
                AND COALESCE(r.started_at, r.created_at) > now() - interval '5 minutes') THEN
    RAISE EXCEPTION 'a draft run is active' USING ERRCODE = '55006';
  END IF;
  SELECT 'canvas_' || v.name INTO v_tag FROM public.canvas_versions v WHERE v.id = v_d.version_id;
  IF NOT EXISTS (SELECT 1 FROM public.points p
                  WHERE p.first_validator_id = v_uid AND p.system_tags @> ARRAY[v_tag]::text[]
                    AND p.system_tags && public._canvas_box_tags()) THEN
    RAISE EXCEPTION 'nothing to publish' USING ERRCODE = '55000';
  END IF;

  FOR v_link IN SELECT e FROM jsonb_array_elements(v_d.pending_links) e LOOP
    v_old := (v_link ->> 'old')::uuid;
    v_new := (v_link ->> 'new')::uuid;
    v_why := left(COALESCE(v_link ->> 'why', ''), 200);
    BEGIN
      IF v_old IS NULL OR v_new IS NULL OR v_old = v_new THEN
        RAISE EXCEPTION 'bad link' USING ERRCODE = 'check_violation';
      END IF;
      -- the new point is this draft's own; the old one is the owner's point on some version of this canvas AND a head
      IF NOT EXISTS (SELECT 1 FROM public.points n
                      WHERE n.id = v_new AND n.first_validator_id = v_uid AND n.superseded_by IS NULL
                        AND n.system_tags @> ARRAY[v_tag]::text[]) THEN
        RAISE EXCEPTION 'new point is not this draft''s' USING ERRCODE = 'check_violation';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.points o
                      WHERE o.id = v_old AND o.first_validator_id = v_uid AND o.superseded_by IS NULL
                        AND EXISTS (SELECT 1 FROM public.canvas_versions cv
                                     WHERE cv.canvas_id = v_d.canvas_id AND o.system_tags @> ARRAY['canvas_' || cv.name]::text[])) THEN
        RAISE EXCEPTION 'old point is not a head of this canvas' USING ERRCODE = 'check_violation';
      END IF;
      UPDATE public.points o SET superseded_by = v_new WHERE o.id = v_old;
    EXCEPTION WHEN check_violation OR foreign_key_violation THEN
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('old', v_old, 'new', v_new, 'why', v_why));
    END;
  END LOOP;

  v_seq := public._canvas_next_version_seq(v_d.canvas_id);
  UPDATE public.canvas_versions v SET published_at = now(), published_seq = v_seq WHERE v.id = v_d.version_id;
  UPDATE public.canvas_drafts d SET state = 'published', closed_at = now(), skipped_links = v_skipped WHERE d.id = v_d.id;
  PERFORM public._canvas_draft_material_retention(v_d.id);
  RETURN jsonb_build_object('seq', v_seq, 'skipped_links', jsonb_array_length(v_skipped));
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_publish(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_publish(uuid) TO authenticated;

-- The caller's published canvas versions, newest first: what the paperclip lists.
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
               'id', v.id, 'canvas_id', c.id, 'canvas_name', c.name, 'name', v.name,
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

-- ============================================================================
-- 8. Chat: a canvas version can be attached, by its owner, in the owner's own mirror
-- ============================================================================
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_attachment_kind_check;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_attachment_kind_check
  CHECK (attachment_kind IS NULL OR attachment_kind IN ('point', 'story', 'canvas', 'letter', 'canvas_version'));

CREATE OR REPLACE FUNCTION public._chat_can_attach(p_kind text, p_id uuid, p_uid uuid, p_conversation uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conv   public.chat_conversations;
  v_canvas public.canvases;
  v_other  uuid;
BEGIN
  IF p_kind = 'point' THEN
    RETURN EXISTS (SELECT 1 FROM public.points x
                    WHERE x.id = p_id AND (x.visibility = 'public' OR x.first_validator_id = p_uid));
  ELSIF p_kind = 'story' THEN
    RETURN EXISTS (SELECT 1 FROM public.stories x
                    WHERE x.id = p_id AND (x.visibility = 'public' OR x.author_id = p_uid));
  ELSIF p_kind NOT IN ('canvas', 'letter', 'canvas_version') THEN
    RETURN false;
  END IF;

  IF p_uid IS NULL OR p_id IS NULL OR p_conversation IS NULL THEN
    RETURN false;
  END IF;
  SELECT * INTO v_conv FROM public.chat_conversations c WHERE c.id = p_conversation;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- P1536: a canvas version, by its owner, and only inside the owner's OWN mirror (the owner starts a draft thread
  -- from it). Everywhere else it is "not available", the same answer as an id that does not exist.
  IF p_kind = 'canvas_version' THEN
    RETURN v_conv.kind = 'mirror' AND v_conv.owner_id = p_uid
       AND EXISTS (SELECT 1 FROM public.canvas_versions x WHERE x.id = p_id AND x.owner_id = p_uid);
  END IF;

  IF p_kind = 'canvas' THEN
    SELECT * INTO v_canvas FROM public.canvases c WHERE c.id = p_id;
    IF NOT FOUND THEN
      RETURN false;
    END IF;
    -- the sender must be able to read it themselves
    IF NOT (v_canvas.owner_id = p_uid
            OR v_canvas.general_access = 'link'
            OR public._canvas_admitted_via(v_canvas.id, p_uid) IS NOT NULL) THEN
      RETURN false;
    END IF;
    IF v_conv.kind = 'dm' THEN
      v_other := CASE WHEN v_conv.dm_user_a = p_uid THEN v_conv.dm_user_b ELSE v_conv.dm_user_a END;
      IF v_other IS NULL THEN
        RETURN false;
      END IF;
      RETURN v_canvas.owner_id = v_other
          OR v_canvas.general_access = 'link'
          OR EXISTS (SELECT 1 FROM public.canvas_audience a
                      WHERE a.canvas_id = v_canvas.id AND a.kind = 'person' AND a.profile_id = v_other);
    ELSIF v_conv.kind = 'group' THEN
      RETURN EXISTS (SELECT 1 FROM public.canvas_audience a
                      WHERE a.canvas_id = v_canvas.id AND a.kind = 'group' AND a.org_id = v_conv.org_id);
    ELSIF v_conv.kind = 'event' THEN
      RETURN EXISTS (SELECT 1 FROM public.canvas_audience a
                      WHERE a.canvas_id = v_canvas.id AND a.kind = 'event' AND a.event_id = v_conv.event_id);
    END IF;
    RETURN false;
  END IF;

  -- letter: a private letter is never attached to a channel
  IF v_conv.kind <> 'dm' THEN
    RETURN false;
  END IF;
  v_other := CASE WHEN v_conv.dm_user_a = p_uid THEN v_conv.dm_user_b ELSE v_conv.dm_user_a END;
  IF v_other IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.clarity_letters l
                  WHERE l.id = p_id AND l.sender_id = p_uid AND l.status = 'sealed' AND l.mode = 'one-to-one'
                    AND EXISTS (SELECT 1 FROM public.letter_deliveries d
                                 WHERE d.letter_id = l.id AND d.receiver_profile_id = v_other));
END;
$$;
REVOKE ALL ON FUNCTION public._chat_can_attach(text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_conversation    uuid,
  p_body            text,
  p_reply_to        uuid DEFAULT NULL,
  p_thread_root     uuid DEFAULT NULL,
  p_attachment_kind text DEFAULT NULL,
  p_attachment_id   uuid DEFAULT NULL,
  p_client_id       uuid DEFAULT NULL
)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_conv  public.chat_conversations;
  v_since timestamptz;
  v_body  text;
  v_row   public.chat_messages;
BEGIN
  v_conv  := public._chat_assert_can_post(p_conversation, v_uid);
  v_since := public._chat_access_since(p_conversation, v_uid);

  -- Idempotent retry: this author already sent with this client id, so return THAT row. Reusing the
  -- id for a different conversation is an error, never a cross-post.
  IF p_client_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = v_uid AND m.client_id = p_client_id;
    IF FOUND THEN
      IF v_row.conversation_id <> p_conversation THEN
        RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
      END IF;
      -- A replay is a READ of the stored row, so it follows today's visibility: a message from a
      -- membership that has since ended (left and rejoined) is not handed back.
      IF v_row.created_at < v_since THEN
        RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
      END IF;
      RETURN v_row;
    END IF;
  END IF;

  v_body := NULLIF(btrim(COALESCE(p_body, '')), '');
  IF (p_attachment_kind IS NULL) <> (p_attachment_id IS NULL) THEN
    RAISE EXCEPTION 'chat: an attachment needs a kind and an id' USING ERRCODE = '22023';
  END IF;
  IF p_attachment_kind IS NOT NULL AND p_attachment_kind NOT IN ('point', 'story', 'canvas', 'letter', 'canvas_version') THEN
    RAISE EXCEPTION 'chat: unknown attachment kind' USING ERRCODE = '22023';
  END IF;
  IF v_body IS NULL AND p_attachment_id IS NULL THEN
    RAISE EXCEPTION 'chat: empty message' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'chat: message too long' USING ERRCODE = '22023';
  END IF;
  -- One error for "does not exist" and "exists but you cannot see it", so ids cannot be probed.
  IF p_attachment_id IS NOT NULL AND NOT public._chat_can_attach(p_attachment_kind, p_attachment_id, v_uid, p_conversation) THEN
    RAISE EXCEPTION 'chat: attachment not available' USING ERRCODE = '22023';
  END IF;

  -- P1546: every conversation kind has threads (a 1:1 and the mirror too); who may read a reply is
  -- whoever may read its conversation, so the RLS on chat_messages needs no change.
  IF p_thread_root IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.chat_messages t
                    WHERE t.id = p_thread_root AND t.conversation_id = p_conversation
                      AND t.deleted_at IS NULL AND t.thread_root_id IS NULL AND t.created_at >= v_since) THEN
      RAISE EXCEPTION 'chat: thread not available' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_reply_to IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.chat_messages t
                    WHERE t.id = p_reply_to AND t.conversation_id = p_conversation
                      AND t.deleted_at IS NULL AND t.created_at >= v_since) THEN
      RAISE EXCEPTION 'chat: reply target not available' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- clock_timestamp(), not now(): now() is the START of this transaction, which can be earlier than
  -- another device's read marker written while this call was running (unread would miscount).
  INSERT INTO public.chat_messages
    (conversation_id, author_id, body, reply_to_id, thread_root_id, kind, attachment_kind, attachment_id,
     client_id, created_at)
  VALUES
    (p_conversation, v_uid, v_body, p_reply_to, p_thread_root, 'message', p_attachment_kind, p_attachment_id,
     p_client_id, clock_timestamp())
  ON CONFLICT (author_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    -- a concurrent call with the same client id committed first: return its row
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = v_uid AND m.client_id = p_client_id;
    IF v_row.conversation_id <> p_conversation THEN
      RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
    END IF;
    IF v_row.created_at < v_since THEN
      RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
    END IF;
    RETURN v_row;
  END IF;

  IF p_thread_root IS NULL THEN
    UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = p_conversation;
    -- Writing in a chat means you are in it: your own send clears a manual "unread" mark and moves
    -- your read marker to the new message. (Thread replies do not: the thread is not the channel.)
    INSERT INTO public.chat_member_state (conversation_id, profile_id, last_read_at, manual_unread)
    VALUES (p_conversation, v_uid, v_row.created_at, false)
    ON CONFLICT (conversation_id, profile_id) DO UPDATE
      SET last_read_at  = GREATEST(COALESCE(public.chat_member_state.last_read_at, '-infinity'::timestamptz),
                                   EXCLUDED.last_read_at),
          manual_unread = false;
  END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.send_chat_message(uuid, text, uuid, uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_chat_message(uuid, text, uuid, uuid, text, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.forward_chat_message(
  p_source              uuid,
  p_target_conversation uuid,
  p_note                text DEFAULT NULL,
  p_client_id           uuid DEFAULT NULL
)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_src       public.chat_messages;
  v_author    text;
  v_note      text;
  v_snapshot  jsonb;
  v_orig_id   uuid;
  v_since     timestamptz;
  v_row       public.chat_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM public._chat_assert_can_post(p_target_conversation, v_uid);
  v_since := public._chat_access_since(p_target_conversation, v_uid);

  -- Idempotent retry (see send_chat_message): same author + client id returns the earlier forward.
  -- This runs BEFORE the source checks on purpose: a retry whose source was deleted (or erased) in
  -- the meantime must hand back the forward that was already stored, not "message not available".
  -- Permission to post in the target was just checked, and the stored row must still be visible.
  IF p_client_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = v_uid AND m.client_id = p_client_id;
    IF FOUND THEN
      IF v_row.conversation_id <> p_target_conversation THEN
        RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
      END IF;
      IF v_row.created_at < v_since THEN
        RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
      END IF;
      RETURN v_row;
    END IF;
  END IF;

  -- The forwarder must be able to READ the source right now. FOR SHARE takes a row lock that
  -- conflicts with erase_chat_data_for's UPDATE of the same row: an in-flight erase finishes first
  -- (and the deleted_at test below then refuses), or this transaction commits first and the erase
  -- that was waiting scrubs the copy we are about to make.
  SELECT m.* INTO v_src FROM public.chat_messages m
   WHERE m.id = p_source
     AND m.created_at >= COALESCE(public._chat_access_since(m.conversation_id, v_uid), 'infinity'::timestamptz)
     FOR SHARE;
  IF NOT FOUND OR v_src.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;

  -- P1536: a canvas version is attached only in its owner's own mirror; a forward would copy it into a chat other
  -- people read (the card would say "not available", and the id would still travel). Same error as send_chat_message.
  IF v_src.attachment_kind = 'canvas_version' THEN
    RAISE EXCEPTION 'chat: attachment not available' USING ERRCODE = '22023';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF char_length(v_note) > 4000 THEN
    RAISE EXCEPTION 'chat: message too long' USING ERRCODE = '22023';
  END IF;

  IF v_src.kind = 'message' THEN
    SELECT COALESCE(p.name, 'Deleted user') INTO v_author
      FROM (SELECT 1) one LEFT JOIN public.profiles p ON p.id = v_src.author_id;
    -- D5: a forward reveals nothing about the source chat. The snapshot is built from an explicit
    -- allowlist (author_name, body, created_at), never by copying whatever a source snapshot holds.
    v_snapshot := jsonb_build_object(
      'author_name', v_author,
      'body', v_src.body,
      'created_at', v_src.created_at);
    v_orig_id := v_src.author_id;
  ELSE
    -- forwarding a forward / clarify keeps pointing at the original author; the source chat's
    -- title, kind, refs and any thread are NOT carried (allowlist again)
    v_snapshot := public._chat_forward_snapshot(v_src.forward_snapshot);
    v_orig_id := v_src.forward_author_id;
  END IF;

  INSERT INTO public.chat_messages
    (conversation_id, author_id, body, kind, forward_snapshot, forward_author_id,
     forwarded_from_message_id, attachment_kind, attachment_id, client_id, created_at)
  VALUES
    (p_target_conversation, v_uid, v_note, 'forward', v_snapshot, v_orig_id,
     v_src.id, v_src.attachment_kind, v_src.attachment_id, p_client_id, clock_timestamp())
  ON CONFLICT (author_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = v_uid AND m.client_id = p_client_id;
    IF v_row.conversation_id <> p_target_conversation THEN
      RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
    END IF;
    IF v_row.created_at < v_since THEN
      RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
    END IF;
    RETURN v_row;
  END IF;

  UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = p_target_conversation;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.forward_chat_message(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.forward_chat_message(uuid, uuid, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mirror_request_reply(p_message uuid)
RETURNS TABLE (job_id uuid, state text, reply_message_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_msg public.chat_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT m.* INTO v_msg
    FROM public.chat_messages m
    JOIN public.chat_conversations c ON c.id = m.conversation_id
   WHERE m.id = p_message AND c.kind = 'mirror' AND c.owner_id = v_uid AND m.author_id = v_uid;
  IF NOT FOUND OR v_msg.deleted_at IS NOT NULL OR v_msg.kind NOT IN ('message', 'clarify') THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;

  -- P1536 (founder 2026-10-27: the mirror stays quiet in canvas threads): no job for any message in a thread rooted
  -- at a canvas draft, or for the root itself, whatever the draft's state (open, published or discarded). The canvas
  -- engine posts its own replies; in a published thread the client asks "Start a new version?". A job that already
  -- exists is still returned, as for a quiet share. Ordinary mirror threads are unchanged.
  -- Placed BEFORE P1576's transcript wait: a voice note in a canvas thread is quiet at once, never 'transcribing'
  -- (that state promises a Mirror reply once the transcript lands, and none will come here).
  IF EXISTS (SELECT 1 FROM public.canvas_drafts d
              WHERE d.thread_root_id = COALESCE(v_msg.thread_root_id, v_msg.id))
     AND NOT EXISTS (SELECT 1 FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id) THEN
    RETURN;
  END IF;

  -- P1576: a voice note is answered only once its transcript exists. No job until then; the client asks again.
  -- A transcript that is done but blank (a silent note) is treated as failed: nothing to answer.
  IF v_msg.audio_duration_ms IS NOT NULL
     AND (v_msg.transcript_status IS DISTINCT FROM 'done' OR btrim(COALESCE(v_msg.transcript, '')) = '') THEN
    RETURN QUERY SELECT NULL::uuid, CASE WHEN v_msg.transcript_status = 'pending'
                                         THEN 'transcribing' ELSE 'transcript_failed' END, NULL::uuid;
    RETURN;
  END IF;

  -- A share (a plain message with an attachment and no text) is filed quietly: no new job, no reply.
  IF v_msg.kind = 'message' AND v_msg.attachment_id IS NOT NULL AND btrim(coalesce(v_msg.body, '')) = ''
     AND NOT EXISTS (SELECT 1 FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id) THEN
    RETURN;
  END IF;

  INSERT INTO public.mirror_jobs (owner_id, kind, trigger_message_id, context_conversation_id)
  VALUES (v_uid, CASE WHEN v_msg.context_conversation_id IS NULL THEN 'reply' ELSE 'ask' END,
          v_msg.id, v_msg.context_conversation_id)
  ON CONFLICT (trigger_message_id) WHERE trigger_message_id IS NOT NULL DO NOTHING;

  RETURN QUERY
    SELECT j.id, j.state, j.reply_message_id FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id;
END;
$$;
REVOKE ALL ON FUNCTION public.mirror_request_reply(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_request_reply(uuid) TO authenticated;

-- P1576's server path (20261027120700) inserts the Mirror's job for a voice note itself, when its transcript lands,
-- without going through mirror_request_reply. The same canvas-thread quiet rule applies there: a voice note in a
-- canvas draft's thread gets no Mirror job and no dispatch. Otherwise byte-for-byte the 20261027120700 body; the
-- trigger (chat_messages_mirror_voice_reply) is unchanged and keeps calling this function.
CREATE OR REPLACE FUNCTION public._mirror_voice_start_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner  uuid;
  v_job    uuid;
  v_url    text;
  v_secret text;
  v_jwt    text;
BEGIN
  SELECT c.owner_id INTO v_owner
    FROM public.chat_conversations c
   WHERE c.id = NEW.conversation_id AND c.kind = 'mirror';
  IF v_owner IS NULL OR NEW.author_id IS DISTINCT FROM v_owner
     OR NEW.context_conversation_id IS NOT NULL OR NEW.deleted_at IS NOT NULL
     OR btrim(COALESCE(NEW.transcript, '')) = '' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.canvas_drafts d
              WHERE d.thread_root_id = COALESCE(NEW.thread_root_id, NEW.id)) THEN
    RETURN NEW; -- P1536: the mirror stays quiet in canvas threads
  END IF;

  BEGIN
    INSERT INTO public.mirror_jobs (owner_id, kind, trigger_message_id, context_conversation_id)
    VALUES (v_owner, 'reply', NEW.id, NULL)
    ON CONFLICT (trigger_message_id) WHERE trigger_message_id IS NOT NULL DO NOTHING;
    SELECT j.id INTO v_job FROM public.mirror_jobs j
     WHERE j.trigger_message_id = NEW.id AND j.state = 'queued';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_mirror_voice_start_reply: job not created (sqlstate %), transcript write kept', SQLSTATE;
    RETURN NEW;
  END;
  IF v_job IS NULL THEN
    RETURN NEW; -- already running, done, failed or cancelled: nothing to start
  END IF;

  -- A SEPARATE block: a failed dispatch must not roll back the queued job above. A queued job that never
  -- runs is still visible to the owner (the client's job check turns it into "failed, Try again").
  BEGIN
    SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'mirror_reply_url';
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'mirror_internal_secret';
    SELECT decrypted_secret INTO v_jwt    FROM vault.decrypted_secrets WHERE name = 'chat_voice_anon_key';
    IF v_url IS NULL OR v_secret IS NULL OR v_jwt IS NULL THEN
      RAISE WARNING '_mirror_voice_start_reply: vault config missing (url: %, secret: %, jwt: %), job left queued',
        (v_url IS NOT NULL), (v_secret IS NOT NULL), (v_jwt IS NOT NULL);
      RETURN NEW;
    END IF;
    PERFORM net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
                   'Content-Type',      'application/json',
                   'Authorization',     'Bearer ' || v_jwt,
                   'x-mirror-internal', v_secret),
      body    := jsonb_build_object('job_id', v_job),
      timeout_milliseconds := 60000);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_mirror_voice_start_reply: dispatch failed (sqlstate %), job left queued', SQLSTATE;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._mirror_voice_start_reply() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 9. The Artifacts lists: one row per canvas, drafts for the owner only
-- ============================================================================
-- The caller's canvases. A point's canvas_<name> tag names a VERSION; it is folded onto the canvas that version
-- belongs to (canvas_versions is unique per owner and name), so a draft version (<canvas>_d<hex>) and every other
-- version count towards their canvas and are never a row of their own. A tag with no version row is a canvas with no
-- record (private, never shared): its own name. A version that is neither published nor an open draft (a discarded
-- draft) lends nothing. A canvases row with no current point is listed only while it has a published version or an
-- open draft, so a canvas whose only version is an open draft is listed for its owner.
CREATE OR REPLACE FUNCTION public.list_my_artifacts_canvases()
RETURNS TABLE (
  canvas_id      uuid,
  name           text,
  general_access text,
  has_audience   boolean,
  last_edit      timestamptz
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
         COALESCE(tg.edited, c.created_at)
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

-- Canvases other people shared with the caller: as P1545, and never a canvas with nothing published (a reader never
-- learns that a draft-only canvas exists, even under an audience row forced in by hand).
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
  unread             boolean
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
         (r.read_at IS NULL OR r.read_at < a.created_at)
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

-- The chat card for a canvas attachment: as P1545, and for anyone but the owner only once something is published.
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
        'is_owner', v_canvas.owner_id = v_uid);
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

-- The event page's canvases (P1515): as before, and a reader never sees a canvas with nothing published.
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
       AND (c.owner_id = v_uid
            OR (public._canvas_entry_admits(a.id, v_uid)
                AND EXISTS (SELECT 1 FROM public.canvas_versions x WHERE x.canvas_id = c.id AND x.published_at IS NOT NULL)))
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.list_canvases_shared_with_event(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_canvases_shared_with_event(uuid) TO authenticated;

COMMIT;
