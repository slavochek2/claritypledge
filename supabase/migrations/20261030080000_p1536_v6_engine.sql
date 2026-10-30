-- P1536 Design v6, slice S1 + S5 (database half): the one-update-at-a-time engine.
--
-- Send updates the draft. Every owner message (text, a voice note, an upload) is applied by ONE queued run; a run changes
-- only the boxes the message is about; each applied run can be undone; the other businesses a run finds are a durable
-- relation (canvas_draft_offers) the owner can switch to, fork or dismiss; Publish cleans up by a ledger and keeps the
-- extracted text only while an offer is open (at most 30 days). Spec: features/p1536_canvas_first_draft_from_owner_material.md,
-- "Design v6", sections 2, 5 (S1, S5) and 6.
--
-- client-safe: the canvas drafting feature is unreleased (prod holds none of the P1536 tables or functions). Every
--   column added is nullable or defaulted; every CHECK it widens (run kind and state, material kind) only gains values;
--   chat_messages gains two nullable columns. The replaced bodies keep their signatures and grants (restated):
--   _mirror_limits (internal; only the three canvas caps change), get_canvas (only GAINS keys: from_seq on every
--   version entry, and revision / focus / changed_boxes in the owner's access.draft), erase_chat_data_for (it takes the
--   engine's locks first; service role only), and the earlier P1536 canvas_draft_publish(uuid), canvas_draft_discard(uuid),
--   _canvas_draft_run_begin(uuid, uuid, text, text) and the six-argument _canvas_draft_run_complete, each of which gains ONE
--   guard that refuses a draft that belongs to the v6 engine (a legacy draft keeps working through them). Every other
--   function here is NEW (an overload with a different argument list, or a new name): canvas_workspace_send,
--   canvas_draft_retry, canvas_draft_switch_focus, canvas_draft_fork, canvas_draft_offer_dismiss, canvas_draft_undo,
--   get_canvas_draft_state, canvas_draft_publish(uuid, integer), canvas_draft_discard(uuid, integer) are granted to
--   authenticated only; every _canvas_* helper and worker is closed to anon and authenticated. canvas_draft_open(uuid), the
--   tension and extract functions and the four-argument _canvas_draft_run_fail are NOT touched.
--
-- diffed against:
--   20261029100100_p1536_canvas_draft_runs.sql
--     _mirror_limits (its only live body; edits: person_canvas_daily_usd 3.00 -> 6.00, person_canvas_daily_count 20 -> 60,
--     global_canvas_daily_usd 15.00 -> 45.00, and the comment above global_total_daily_usd),
--     _canvas_draft_run_begin (its only live four-argument body; edit: the v6 guard before the tensions check),
--     erase_chat_data_for (its latest body in this tree; edits: before anything else it takes the engine's per-owner advisory
--     locks, the erased user's and every affected owner's as one sorted set, and right after the step-6 context lock it
--     locks the affected draft rows, so erasure and the draft engine never interleave; step 7 also bumps the revision of each
--     draft that had a v6 run cancelled; this section is marked
--     @@ERASE_BEGIN / @@ERASE_END)
--   20261029100200_p1536_reword_keeps_stories.sql
--     _canvas_draft_run_complete (its latest six-argument body; edit: the v6 guard before the cancelled-run check)
--   20261029100000_p1536_canvas_draft_versions.sql
--     get_canvas (its only live body; edits listed above the function),
--     canvas_draft_publish (its only live body; edit: the v6 guard before the closed check),
--     canvas_draft_discard (its only live body; edit: the v6 guard before the closed check).
--     All pinned by src/tests/p1536-v6-engine-migration.test.ts.
--   20260204_stories_points_calibration.sql
--     the trigger trg_points_updated_at (see "ALSO" below).
-- new function: _canvas_point_box, _canvas_customer_box_tags, _canvas_offer_key, _canvas_draft_tag, _canvas_draft_point_ids,
--   _canvas_draft_changed_boxes, _canvas_draft_used_runs, _canvas_draft_busy_code, _canvas_draft_refuse,
--   _canvas_draft_require_verified, _canvas_draft_is_v6, _canvas_draft_started_result, _canvas_draft_material_expired, _canvas_draft_run_result, _canvas_draft_expire,
--   _canvas_draft_post_reply, _canvas_draft_effective_input, _canvas_draft_offers_settled, _canvas_draft_cleanup_ledger,
--   _canvas_draft_discard_inner, _canvas_draft_new_canvas, _canvas_draft_new, _canvas_draft_run_begin(uuid, uuid, boolean,
--   text), _canvas_draft_add_material(uuid, uuid, text, text, text, uuid), _canvas_draft_run_complete (ten arguments),
--   _canvas_draft_run_fail (five arguments), _canvas_draft_material_expire, _canvas_draft_expire_all, and the nine client functions above (all new,
--   grepped: no earlier body).
-- NOT replaced, checked: mirror_request_reply / _mirror_voice_start_reply (the canvas-thread quiet rule of 20261029100000 still
--   holds: the new owner messages sit in the draft's thread) and forward_chat_message (rebuilt, with its P1536 refusal, by
--   20261029100000; a forward copies no box_refs because its INSERT lists its columns).
--
-- WHAT CHANGES (sections of this file)
--   1. Schema: canvas_drafts.revision / focus / material_until / source_draft_id; canvas_versions.from_seq;
--      canvas_draft_runs kinds message / focus / fork_first, state 'undone', trigger_message_id / scope / target_offer_id /
--      client_id / reply_message_id / input_kind / created_revision (the last two are additions to the spec's list: the
--      run must know what it waits for, and a Send records the revision it created);
--      canvas_draft_material.message_id / source_material_id / origin and kind 'messages'; chat_messages.box_refs
--      (validated) and canvas_run_id; canvas_draft_points.copied_from; new tables canvas_draft_steps, canvas_draft_points,
--      canvas_draft_offers, all closed to every client.
--   2. Helpers, the expire step, the one input selector, the ledger cleanup, the draft constructors.
--   3. Caps (D18) and get_canvas.
--   4-5. Workers: begin (by run id), add_material, complete (scoped), fail. Every worker takes the verified owner.
--   6-8. Client functions: Send, Try again, focus switch, fork, dismiss, Undo, Publish, Discard, the state read.
--   9. The hourly pg_cron job that deletes expired kept material.
--  10. The earlier functions listed above, made safe against a v6 draft; erase_chat_data_for.
-- ALSO (section 1): trg_points_updated_at gets a WHEN clause, the one change to an existing object outside the P1536 tables.
--   Diffed against 20260204_stories_points_calibration.sql (CREATE TRIGGER trg_points_updated_at BEFORE UPDATE ON points FOR
--   EACH ROW EXECUTE FUNCTION update_updated_at()): same event, same function, plus
--   WHEN (current_setting('p1536.keep_updated_at', true) is not 'on'). Only the draft functions set that transaction-local
--   setting, around their tag-only UPDATEs, so a base version reads byte-identical while a draft is open (S1.7) and putting
--   a point into a draft does not look like an edit in the Artifacts list; every other UPDATE of points fires as before.
-- REFUSALS: a refusal about the state of things is returned as {status:'refused', code, revision} with nothing written for
--   the request (busy, busy_elsewhere, cap_reached, stale_view, not_retryable, not_offered, expired, draft_empty,
--   no_changes); authorization failures raise 42501; malformed arguments raise 22023.

BEGIN;

-- ============================================================================
-- 1. Schema
-- ============================================================================
-- canvas_drafts: the revision every mutation bumps, the focus (the one business this canvas is about), the time the
-- kept material expires after Publish, and the draft a fork started from.
ALTER TABLE public.canvas_drafts
  ADD COLUMN IF NOT EXISTS revision        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS focus           text,
  ADD COLUMN IF NOT EXISTS material_until  timestamptz,
  ADD COLUMN IF NOT EXISTS source_draft_id uuid REFERENCES public.canvas_drafts(id) ON DELETE SET NULL;
ALTER TABLE public.canvas_drafts DROP CONSTRAINT IF EXISTS canvas_drafts_revision_check;
ALTER TABLE public.canvas_drafts ADD CONSTRAINT canvas_drafts_revision_check CHECK (revision >= 0);
ALTER TABLE public.canvas_drafts DROP CONSTRAINT IF EXISTS canvas_drafts_focus_check;
ALTER TABLE public.canvas_drafts ADD CONSTRAINT canvas_drafts_focus_check
  CHECK (focus IS NULL OR char_length(focus) BETWEEN 1 AND 120);
-- the owner reads the revision (every mutation takes it) and the focus; never material_until or source_draft_id
GRANT SELECT (revision, focus) ON public.canvas_drafts TO authenticated;

-- canvas_versions: which published version this one was drafted from (null for a first version). Read by everyone who
-- can read the version (get_canvas), set once, at Publish.
ALTER TABLE public.canvas_versions ADD COLUMN IF NOT EXISTS from_seq integer;
ALTER TABLE public.canvas_versions DROP CONSTRAINT IF EXISTS canvas_versions_from_seq_check;
ALTER TABLE public.canvas_versions ADD CONSTRAINT canvas_versions_from_seq_check CHECK (from_seq IS NULL OR from_seq >= 1);

-- canvas_draft_runs: the run is created queued by the RPC that the owner called; the worker (the edge function)
-- claims it by id. Old kinds (draft/tensions/extract) and states stay readable.
ALTER TABLE public.canvas_draft_runs DROP CONSTRAINT IF EXISTS canvas_draft_runs_kind_check;
ALTER TABLE public.canvas_draft_runs ADD CONSTRAINT canvas_draft_runs_kind_check
  CHECK (kind IN ('tensions', 'draft', 'extract', 'message', 'focus', 'fork_first'));
ALTER TABLE public.canvas_draft_runs DROP CONSTRAINT IF EXISTS canvas_draft_runs_state_check;
ALTER TABLE public.canvas_draft_runs ADD CONSTRAINT canvas_draft_runs_state_check
  CHECK (state IN ('queued', 'running', 'done', 'failed', 'capped', 'cancelled', 'undone'));
ALTER TABLE public.canvas_draft_runs
  ADD COLUMN IF NOT EXISTS trigger_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scope              text[],
  ADD COLUMN IF NOT EXISTS target_offer_id    uuid,
  ADD COLUMN IF NOT EXISTS client_id          uuid,
  ADD COLUMN IF NOT EXISTS reply_message_id   uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  -- what the run waits for before it may begin: text at once, a voice note's transcript, an upload's file
  ADD COLUMN IF NOT EXISTS input_kind         text NOT NULL DEFAULT 'text',
  -- the draft's revision right after the RPC that created the run: a repeat with the same client id returns it
  ADD COLUMN IF NOT EXISTS created_revision   integer;
ALTER TABLE public.canvas_draft_runs DROP CONSTRAINT IF EXISTS canvas_draft_runs_input_kind_check;
ALTER TABLE public.canvas_draft_runs ADD CONSTRAINT canvas_draft_runs_input_kind_check
  CHECK (input_kind IN ('text', 'file', 'voice'));
-- idempotency of Send / retry / focus / fork: unique per owner
CREATE UNIQUE INDEX IF NOT EXISTS canvas_draft_runs_owner_client ON public.canvas_draft_runs (owner_id, client_id)
  WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS canvas_draft_runs_trigger ON public.canvas_draft_runs (trigger_message_id)
  WHERE trigger_message_id IS NOT NULL;

-- canvas_draft_material: a row belongs to the message that brought it; a fork copies rows as seed rows.
ALTER TABLE public.canvas_draft_material
  ADD COLUMN IF NOT EXISTS message_id         uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_material_id uuid,
  ADD COLUMN IF NOT EXISTS origin             text NOT NULL DEFAULT 'message';
ALTER TABLE public.canvas_draft_material DROP CONSTRAINT IF EXISTS canvas_draft_material_origin_check;
ALTER TABLE public.canvas_draft_material ADD CONSTRAINT canvas_draft_material_origin_check
  CHECK (origin IN ('message', 'fork_seed'));
ALTER TABLE public.canvas_draft_material DROP CONSTRAINT IF EXISTS canvas_draft_material_kind_check;
ALTER TABLE public.canvas_draft_material ADD CONSTRAINT canvas_draft_material_kind_check
  CHECK (kind IN ('file', 'link', 'messages'));
CREATE INDEX IF NOT EXISTS canvas_draft_material_message ON public.canvas_draft_material (message_id)
  WHERE message_id IS NOT NULL;

-- chat_messages: the boxes the owner tagged a message with ("Add to chat"), and the run a canvas reply belongs to.
-- Written only by canvas_workspace_send / the canvas engine (SECURITY DEFINER); no client can insert into chat_messages.
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS box_refs      text[],
  ADD COLUMN IF NOT EXISTS canvas_run_id uuid REFERENCES public.canvas_draft_runs(id) ON DELETE SET NULL;
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_box_refs_shape;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_box_refs_shape CHECK (
  box_refs IS NULL
  OR (cardinality(box_refs) BETWEEN 1 AND 9 AND box_refs <@ public._canvas_box_tags())
);
CREATE INDEX IF NOT EXISTS chat_messages_canvas_run ON public.chat_messages (canvas_run_id)
  WHERE canvas_run_id IS NOT NULL;

-- The undo record of one applied run: the draft as it was before the run. Deleted at Publish and Discard.
CREATE TABLE IF NOT EXISTS public.canvas_draft_steps (
  run_id        uuid PRIMARY KEY REFERENCES public.canvas_draft_runs(id) ON DELETE CASCADE,
  draft_id      uuid NOT NULL REFERENCES public.canvas_drafts(id) ON DELETE CASCADE,
  point_ids     uuid[] NOT NULL DEFAULT '{}',
  questions     jsonb NOT NULL DEFAULT '{}'::jsonb,
  pending_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  focus         text,
  new_offer_ids uuid[] NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS canvas_draft_steps_draft ON public.canvas_draft_steps (draft_id, created_at);

-- Every point (and engine-written story) a draft created. Never deleted by Undo; cleaned at Publish and Discard.
-- run_id is null for the private copy of a legacy public base point made when the draft opens.
CREATE TABLE IF NOT EXISTS public.canvas_draft_points (
  draft_id   uuid NOT NULL REFERENCES public.canvas_drafts(id) ON DELETE CASCADE,
  point_id   uuid NOT NULL REFERENCES public.points(id) ON DELETE CASCADE,
  run_id     uuid REFERENCES public.canvas_draft_runs(id) ON DELETE SET NULL,
  story_ids  uuid[] NOT NULL DEFAULT '{}',
  -- the legacy PUBLIC base point this private copy stands for: the two count as the same point in Changed / no_changes
  copied_from uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (draft_id, point_id)
);
ALTER TABLE public.canvas_draft_points ADD COLUMN IF NOT EXISTS copied_from uuid;

-- The other businesses a run found in the material. A durable relation, never a snapshot of a reply.
CREATE TABLE IF NOT EXISTS public.canvas_draft_offers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id          uuid NOT NULL REFERENCES public.canvas_drafts(id) ON DELETE CASCADE,
  group_label       text NOT NULL CHECK (char_length(group_label) BETWEEN 1 AND 120),
  why               text CHECK (why IS NULL OR char_length(why) <= 400),
  state             text NOT NULL DEFAULT 'offered' CHECK (state IN ('offered', 'focused', 'started', 'dismissed')),
  started_canvas_id uuid REFERENCES public.canvases(id) ON DELETE SET NULL,
  created_run_id    uuid REFERENCES public.canvas_draft_runs(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
-- How a business name is compared: every run of whitespace (including the non-breaking and zero-width kinds) is one space,
-- lower-cased. The one definition for the unique index below and for every merge rule.
CREATE OR REPLACE FUNCTION public._canvas_offer_key(p_label text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(btrim(regexp_replace(COALESCE(p_label, ''), '[[:space:]\u00a0\u1680\u2000-\u200b\u202f\u205f\u3000\ufeff]+', ' ', 'g')))
$$;
REVOKE ALL ON FUNCTION public._canvas_offer_key(text) FROM PUBLIC, anon, authenticated;

-- one row per business per draft
DROP INDEX IF EXISTS public.canvas_draft_offers_label;
CREATE UNIQUE INDEX IF NOT EXISTS canvas_draft_offers_label
  ON public.canvas_draft_offers (draft_id, public._canvas_offer_key(group_label));
CREATE INDEX IF NOT EXISTS canvas_draft_offers_draft ON public.canvas_draft_offers (draft_id, state);

ALTER TABLE public.canvas_draft_runs DROP CONSTRAINT IF EXISTS canvas_draft_runs_target_offer_fk;
ALTER TABLE public.canvas_draft_runs ADD CONSTRAINT canvas_draft_runs_target_offer_fk
  FOREIGN KEY (target_offer_id) REFERENCES public.canvas_draft_offers(id) ON DELETE SET NULL;

-- points.updated_at moves on every UPDATE (trg_points_updated_at, 20260204_stories_points_calibration.sql). Putting a point
-- into or taking it out of a DRAFT is not an edit of the point, and a base version must read byte-identical while a
-- draft is open (S1.7), so the draft functions below switch the trigger off for exactly their tag-only UPDATEs by a
-- transaction-local setting (p1536.keep_updated_at). Everything else is unchanged: the same function, the same event,
-- and with the setting absent the trigger fires exactly as before.
CREATE OR REPLACE TRIGGER trg_points_updated_at
  BEFORE UPDATE ON public.points
  FOR EACH ROW
  WHEN (COALESCE(current_setting('p1536.keep_updated_at', true), '') <> 'on')
  EXECUTE FUNCTION public.update_updated_at();

-- Closed to every client: the owner reads them only through get_canvas_draft_state.
ALTER TABLE public.canvas_draft_steps  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_draft_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_draft_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.canvas_draft_steps  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.canvas_draft_points FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.canvas_draft_offers FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. Helpers (internal: no client role may execute any of them)
-- ============================================================================
-- Lock order in every function of this file: the per-owner advisory lock
-- ('p1515:canvas_versions:' || owner), then the canvases row (only where one is created or chosen), then the draft
-- row FOR UPDATE, then the run row. The expire step is the first thing under the owner lock.

CREATE OR REPLACE FUNCTION public._canvas_point_box(p_tags text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT t FROM unnest(p_tags) AS t WHERE t = ANY (public._canvas_box_tags()) LIMIT 1
$$;
REVOKE ALL ON FUNCTION public._canvas_point_box(text[]) FROM PUBLIC, anon, authenticated;

-- The six boxes about the customer and the sale. The other three (Guiding values, My current biggest challenge,
-- Hypotheses I've falsified) are the founder-fit boxes: they may hold business-wide points.
CREATE OR REPLACE FUNCTION public._canvas_customer_box_tags()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY['canvas:segments', 'canvas:problem', 'canvas:solution',
               'canvas:channels', 'canvas:revenue', 'canvas:metrics']::text[]
$$;
REVOKE ALL ON FUNCTION public._canvas_customer_box_tags() FROM PUBLIC, anon, authenticated;

-- The tag every point of a draft carries.
CREATE OR REPLACE FUNCTION public._canvas_draft_tag(p_draft uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 'canvas_' || v.name
    FROM public.canvas_drafts d
    JOIN public.canvas_versions v ON v.id = d.version_id
   WHERE d.id = p_draft
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_tag(uuid) FROM PUBLIC, anon, authenticated;

-- The ids of the points a draft holds now: the owner's points tagged with the draft's version and a box.
CREATE OR REPLACE FUNCTION public._canvas_draft_point_ids(p_draft uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(array_agg(p.id ORDER BY p.id), '{}'::uuid[])
    FROM public.canvas_drafts d
    JOIN public.canvas_versions v ON v.id = d.version_id
    JOIN public.points p ON p.first_validator_id = d.owner_id
                        AND p.system_tags @> ARRAY['canvas_' || v.name]::text[]
                        AND p.system_tags && public._canvas_box_tags()
   WHERE d.id = p_draft
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_point_ids(uuid) FROM PUBLIC, anon, authenticated;

-- D6 "Changed": the boxes whose point set differs from the base version's. Computed, never stored. No base: none.
CREATE OR REPLACE FUNCTION public._canvas_draft_changed_boxes(p_draft uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_d    public.canvas_drafts;
  v_dtag text;
  v_btag text;
  v_out  text[] := '{}';
  v_b    text;
BEGIN
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft;
  IF NOT FOUND OR v_d.base_version_id IS NULL THEN
    RETURN '{}';
  END IF;
  SELECT 'canvas_' || v.name INTO v_dtag FROM public.canvas_versions v WHERE v.id = v_d.version_id;
  SELECT 'canvas_' || v.name INTO v_btag FROM public.canvas_versions v WHERE v.id = v_d.base_version_id;
  IF v_dtag IS NULL OR v_btag IS NULL THEN
    RETURN '{}';
  END IF;
  FOREACH v_b IN ARRAY public._canvas_box_tags() LOOP
    -- a private copy of a legacy public base point stands for that point (ledger.copied_from)
    IF COALESCE((SELECT array_agg(COALESCE(cp.copied_from, p.id) ORDER BY COALESCE(cp.copied_from, p.id))
                   FROM public.points p
                   LEFT JOIN public.canvas_draft_points cp ON cp.draft_id = v_d.id AND cp.point_id = p.id
                  WHERE p.first_validator_id = v_d.owner_id AND p.system_tags @> ARRAY[v_dtag, v_b]::text[]), '{}'::uuid[])
       IS DISTINCT FROM
       COALESCE((SELECT array_agg(p.id ORDER BY p.id) FROM public.points p
                  WHERE p.first_validator_id = v_d.owner_id AND p.system_tags @> ARRAY[v_btag, v_b]::text[]), '{}'::uuid[]) THEN
      v_out := v_out || v_b;
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_changed_boxes(uuid) FROM PUBLIC, anon, authenticated;

-- Runs that reached the model and finished: they count toward the cap of 30. Undone runs count, failed ones do not.
CREATE OR REPLACE FUNCTION public._canvas_draft_used_runs(p_draft uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer FROM public.canvas_draft_runs r
   WHERE r.draft_id = p_draft AND r.state IN ('done', 'undone') AND r.kind IN ('draft', 'message', 'focus', 'fork_first')
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_used_runs(uuid) FROM PUBLIC, anon, authenticated;

-- 'busy' when the owner has an active run on this draft; 'busy_elsewhere' when the only active run is on another
-- draft and p_elsewhere is true; NULL when the owner is idle (for this purpose).
CREATE OR REPLACE FUNCTION public._canvas_draft_busy_code(p_owner uuid, p_draft uuid, p_elsewhere boolean)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_draft IS NOT NULL AND EXISTS (SELECT 1 FROM public.canvas_draft_runs r
                                          WHERE r.owner_id = p_owner AND r.draft_id = p_draft AND r.state IN ('queued', 'running'))
      THEN 'busy'
    WHEN p_elsewhere AND EXISTS (SELECT 1 FROM public.canvas_draft_runs r
                                  WHERE r.owner_id = p_owner AND r.state IN ('queued', 'running'))
      THEN 'busy_elsewhere'
  END
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_busy_code(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- A refusal: the RPC wrote nothing for the caller's request. The current revision rides along so the client can refetch.
CREATE OR REPLACE FUNCTION public._canvas_draft_refuse(p_code text, p_draft uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object('status', 'refused', 'code', p_code,
                            'revision', (SELECT d.revision FROM public.canvas_drafts d WHERE d.id = p_draft))
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_refuse(text, uuid) FROM PUBLIC, anon, authenticated;

-- The answer to a second tap on a started offer, and to a replay of the fork whose draft has since closed: the canvas that
-- was started, with its OPEN draft when it has one, or draft_id null (never a closed draft shown as if it were open).
CREATE OR REPLACE FUNCTION public._canvas_draft_started_result(p_canvas uuid, p_uid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
           'status', 'ok', 'already_started', true, 'replayed', true, 'run_id', NULL,
           'canvas_id', p_canvas, 'canvas_name', (SELECT c.name FROM public.canvases c WHERE c.id = p_canvas),
           'draft_id', od.id, 'thread_root_id', od.thread_root_id, 'conversation_id', od.conversation_id,
           'version_name', od.version_name, 'revision', od.revision)
    FROM (SELECT 1) one
    LEFT JOIN LATERAL (SELECT d.* FROM public.canvas_drafts d
                        WHERE d.canvas_id = p_canvas AND d.owner_id = p_uid AND d.state = 'open' LIMIT 1) od ON true
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_started_result(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Whether a published draft's kept material has expired: its time has passed while an offer is still `offered`. The ONE
-- definition, used by both `closed_draft` and every `closed_drafts` entry of the state read.
CREATE OR REPLACE FUNCTION public._canvas_draft_material_expired(p_draft uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((SELECT d.material_until IS NOT NULL AND d.material_until < now()
                          AND EXISTS (SELECT 1 FROM public.canvas_draft_offers o WHERE o.draft_id = d.id AND o.state = 'offered')
                     FROM public.canvas_drafts d WHERE d.id = p_draft), false)
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_material_expired(uuid) FROM PUBLIC, anon, authenticated;

-- Every client RPC: a signed-in, verified caller (as canvas_workspace_send always required).
CREATE OR REPLACE FUNCTION public._canvas_draft_require_verified(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = p_uid AND pr.is_verified = true) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_require_verified(uuid) FROM PUBLIC, anon, authenticated;

-- A v6 draft: one that has ever had a revision, or a run of a v6 kind. The earlier (legacy) functions refuse such a draft;
-- a legacy draft (revision 0, runs of the old kinds only) keeps working through them.
CREATE OR REPLACE FUNCTION public._canvas_draft_is_v6(p_draft uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((SELECT d.revision > 0
                          OR EXISTS (SELECT 1 FROM public.canvas_draft_runs r
                                      WHERE r.draft_id = d.id AND r.kind IN ('message', 'focus', 'fork_first'))
                     FROM public.canvas_drafts d WHERE d.id = p_draft), false)
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_is_v6(uuid) FROM PUBLIC, anon, authenticated;

-- What a run-creating RPC returns, and what a repeat with the same client id returns again (the CURRENT revision).
CREATE OR REPLACE FUNCTION public._canvas_draft_run_result(p_run uuid, p_replayed boolean)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
           'status', 'ok', 'replayed', p_replayed, 'run_id', r.id, 'kind', r.kind,
           'revision', d.revision,
           'draft_id', d.id, 'canvas_id', d.canvas_id, 'canvas_name', d.canvas_name, 'version_name', d.version_name,
           'thread_root_id', d.thread_root_id, 'conversation_id', d.conversation_id,
           'message_id', r.trigger_message_id)
    FROM public.canvas_draft_runs r
    JOIN public.canvas_drafts d ON d.id = r.draft_id
   WHERE r.id = p_run
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_run_result(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- The expire step. FIRST thing under the owner lock in every RPC below and in get_canvas_draft_state.
--   * a queued run older than 3 minutes, or a running run older than 5 minutes (the existing c_dead) is failed
--     ('abandoned'); a running one is charged its full reservation (the call may have been billed);
--   * a queued run whose voice trigger message has transcript_status 'failed' (or a blank transcript) is failed at
--     once ('transcript_failed'), with no model call and no charge.
-- Returns how many runs it failed. The caller holds the per-owner lock.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._canvas_draft_expire(p_owner uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_queued  CONSTANT interval := interval '3 minutes';
  c_running CONSTANT interval := interval '5 minutes';
  v_c   record;
  v_run public.canvas_draft_runs;
  n     integer := 0;
BEGIN
  FOR v_c IN
    SELECT r.id, r.draft_id, r.state,
           (r.state = 'queued' AND r.input_kind = 'voice' AND t.id IS NOT NULL
            AND (t.transcript_status = 'failed'
                 OR (t.transcript_status = 'done' AND btrim(COALESCE(t.transcript, '')) = ''))) AS voice_failed
      FROM public.canvas_draft_runs r
      LEFT JOIN public.chat_messages t ON t.id = r.trigger_message_id
     WHERE r.owner_id = p_owner AND r.state IN ('queued', 'running')
       AND ((r.state = 'queued'  AND r.created_at < now() - c_queued)
         OR (r.state = 'running' AND COALESCE(r.started_at, r.created_at) < now() - c_running)
         OR (r.state = 'queued' AND r.input_kind = 'voice' AND t.id IS NOT NULL
             AND (t.transcript_status = 'failed'
                  OR (t.transcript_status = 'done' AND btrim(COALESCE(t.transcript, '')) = ''))))
     ORDER BY r.created_at, r.id
  LOOP
    -- draft row first, then the run row
    PERFORM 1 FROM public.canvas_drafts d WHERE d.id = v_c.draft_id FOR UPDATE;
    SELECT r.* INTO v_run FROM public.canvas_draft_runs r
     WHERE r.id = v_c.id AND r.state IN ('queued', 'running') FOR UPDATE;
    CONTINUE WHEN NOT FOUND;
    IF v_run.state = 'running' AND v_run.spend_id IS NOT NULL THEN
      UPDATE public.mirror_ai_spend s SET actual_usd = s.reserved_usd, state = 'settled', settled_at = now()
       WHERE s.id = v_run.spend_id AND s.state = 'reserved';
    END IF;
    UPDATE public.canvas_draft_runs r
       SET state = 'failed', error_code = CASE WHEN v_c.voice_failed THEN 'transcript_failed' ELSE 'abandoned' END,
           finished_at = now()
     WHERE r.id = v_run.id;
    -- a v6 run moves the revision; an expired LEGACY run must not (a draft with revision > 0 is a v6 draft)
    IF v_run.kind IN ('message', 'focus', 'fork_first') THEN
      UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_run.draft_id;
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_expire(uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- The agent's reply in a draft thread, carrying the run it belongs to (Undo rewrites it) and the refs of everyone whose
-- words it was derived from (erasure). Returns the message id; NULL when there is nothing to say.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._canvas_draft_post_reply(
  p_conversation uuid, p_thread_root uuid, p_body text, p_refs text[], p_run uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NULLIF(btrim(COALESCE(p_body, '')), '') IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.chat_messages (conversation_id, author_id, body, kind, thread_root_id, derived_refs, canvas_run_id, created_at)
  VALUES (p_conversation, NULL, left(btrim(p_body), 4000), 'agent', p_thread_root, COALESCE(p_refs, '{}'), p_run, clock_timestamp())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_post_reply(uuid, uuid, text, text[], uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- THE one selector of what a run (and a fork) may read. {message_ids, material_ids, copy_ids}.
--   messages  the owner's messages of the draft's thread (kind 'message'; a voice note counts by its transcript) whose
--             CURRENT run (the newest run that has the message as its trigger) is done, plus the trigger message of
--             p_run. Excluded: messages whose current run is undone, failed, capped, cancelled, queued or running (the
--             trigger apart), and messages with no run at all.
--   material  rows whose message_id is one of those messages, and every fork-seed row of the draft.
--   copy_ids  forward/clarify copies the owner made into the draft's OWN thread, as before. A fork ignores them.
-- Excluded everywhere: the agent's replies (they are never model context: the draft's points are the state).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._canvas_draft_effective_input(p_draft uuid, p_run uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_d       public.canvas_drafts;
  v_trigger uuid;
  v_msgs    uuid[];
  v_mats    uuid[];
  v_copies  uuid[];
BEGIN
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('message_ids', '[]'::jsonb, 'material_ids', '[]'::jsonb, 'copy_ids', '[]'::jsonb);
  END IF;
  IF p_run IS NOT NULL THEN
    SELECT r.trigger_message_id INTO v_trigger FROM public.canvas_draft_runs r WHERE r.id = p_run AND r.draft_id = p_draft;
  END IF;

  v_msgs := ARRAY(
    SELECT m.id
      FROM public.chat_messages m
     WHERE m.conversation_id = v_d.conversation_id AND m.thread_root_id = v_d.thread_root_id
       AND m.kind = 'message' AND m.author_id = v_d.owner_id
       AND m.context_conversation_id IS NULL AND m.deleted_at IS NULL
       AND (m.id = v_trigger
            OR (SELECT r.state FROM public.canvas_draft_runs r
                 WHERE r.trigger_message_id = m.id
                 ORDER BY r.created_at DESC, r.id DESC LIMIT 1) = 'done')
     ORDER BY m.created_at, m.id);

  v_mats := ARRAY(
    SELECT x.id FROM public.canvas_draft_material x
     WHERE x.draft_id = p_draft AND (x.origin = 'fork_seed' OR x.message_id = ANY (v_msgs))
     ORDER BY x.created_at, x.id);

  v_copies := ARRAY(
    SELECT m.id
      FROM public.chat_messages m
     WHERE m.conversation_id = v_d.conversation_id AND m.thread_root_id = v_d.thread_root_id
       AND m.kind IN ('forward', 'clarify') AND m.author_id = v_d.owner_id
       AND m.context_conversation_id IS NULL AND m.deleted_at IS NULL
     ORDER BY m.created_at, m.id);

  RETURN jsonb_build_object('message_ids', to_jsonb(v_msgs), 'material_ids', to_jsonb(v_mats), 'copy_ids', to_jsonb(v_copies));
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_effective_input(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Retention: when a CLOSED (published) draft has no `offered` offer left, its kept material is deleted in the same
-- transaction. Returns the number of rows deleted.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._canvas_draft_offers_settled(p_draft uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.canvas_drafts d WHERE d.id = p_draft AND d.state = 'published')
     AND NOT EXISTS (SELECT 1 FROM public.canvas_draft_offers o WHERE o.draft_id = p_draft AND o.state = 'offered') THEN
    WITH x AS (SELECT m.id FROM public.canvas_draft_material m WHERE m.draft_id = p_draft ORDER BY m.id FOR UPDATE)
    DELETE FROM public.canvas_draft_material m USING x WHERE m.id = x.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    UPDATE public.canvas_drafts d SET material_until = NULL WHERE d.id = p_draft AND d.material_until IS NOT NULL;
  END IF;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_offers_settled(uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Ledger cleanup (Publish, Discard): delete every point the draft created that no version tags any more, then the
-- engine-written stories of those points when no remaining point links them. Owner-written stories are never touched
-- (they are not in the ledger). Returns {points, stories} deleted.
-- Not search_path = '': deleting points and stories fires triggers that resolve unqualified names.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._canvas_draft_cleanup_ledger(p_draft uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner uuid;
  v_pts   uuid[];
  v_sids  uuid[];
  np      integer := 0;
  ns      integer := 0;
BEGIN
  SELECT d.owner_id INTO v_owner FROM public.canvas_drafts d WHERE d.id = p_draft;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('points', 0, 'stories', 0);
  END IF;
  SELECT COALESCE(array_agg(cp.point_id), '{}') INTO v_pts
    FROM public.canvas_draft_points cp
    JOIN public.points p ON p.id = cp.point_id
   WHERE cp.draft_id = p_draft
     AND NOT EXISTS (SELECT 1 FROM unnest(p.system_tags) t WHERE t LIKE 'canvas\_%');
  -- the engine's stories of the whole ledger (a surviving point keeps its link, so its story survives the test below)
  SELECT COALESCE(array_agg(DISTINCT u.sid), '{}') INTO v_sids
    FROM public.canvas_draft_points cp, LATERAL unnest(cp.story_ids) AS u(sid)
   WHERE cp.draft_id = p_draft;
  IF cardinality(v_pts) > 0 THEN
    DELETE FROM public.points p WHERE p.id = ANY (v_pts);
    GET DIAGNOSTICS np = ROW_COUNT;
  END IF;
  IF cardinality(v_sids) > 0 THEN
    DELETE FROM public.stories s
     WHERE s.id = ANY (v_sids) AND s.author_id = v_owner AND s.visibility = 'private'::public.content_visibility
       AND NOT EXISTS (SELECT 1 FROM public.story_points sp WHERE sp.story_id = s.id);
    GET DIAGNOSTICS ns = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('points', np, 'stories', ns);
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_cleanup_ledger(uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Discard, inside a transaction that already holds the owner lock and the draft row: the draft's tag leaves every point
-- that holds it, the ledger is cleaned, the steps, the offers and the material go, the draft closes. Callers check that
-- no run is active. A discarded draft leaves no gap in the numbering (its version row stays, unpublished).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._canvas_draft_discard_inner(p_draft uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_d     public.canvas_drafts;
  v_tag   text;
  v_clean jsonb;
BEGIN
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft;
  IF NOT FOUND OR v_d.state <> 'open' THEN
    RETURN jsonb_build_object('points', 0, 'stories', 0);
  END IF;
  SELECT 'canvas_' || v.name INTO v_tag FROM public.canvas_versions v WHERE v.id = v_d.version_id;
  PERFORM set_config('p1536.keep_updated_at', 'on', true);
  UPDATE public.points p SET system_tags = array_remove(p.system_tags, v_tag)
   WHERE p.first_validator_id = v_d.owner_id AND p.system_tags @> ARRAY[v_tag]::text[];
  PERFORM set_config('p1536.keep_updated_at', 'off', true);
  v_clean := public._canvas_draft_cleanup_ledger(v_d.id);
  DELETE FROM public.canvas_draft_steps s WHERE s.draft_id = v_d.id;
  DELETE FROM public.canvas_draft_offers o WHERE o.draft_id = v_d.id;
  WITH x AS (SELECT m.id FROM public.canvas_draft_material m WHERE m.draft_id = v_d.id ORDER BY m.id FOR UPDATE)
  DELETE FROM public.canvas_draft_material m USING x WHERE m.id = x.id;
  UPDATE public.canvas_drafts d
     SET state = 'discarded', closed_at = now(), revision = d.revision + 1, material_until = NULL
   WHERE d.id = v_d.id;

  -- A fork's draft that never published is discarded: the offer that started it is not left "started" for a canvas that
  -- will never exist. It goes back to `offered` when the source's material is still available (an open source draft, or a
  -- published one whose kept material has not expired); otherwise it is dismissed.
  IF v_d.source_draft_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.canvas_versions cv WHERE cv.canvas_id = v_d.canvas_id AND cv.published_at IS NOT NULL) THEN
    UPDATE public.canvas_draft_offers o
       SET state = CASE WHEN EXISTS (
                            SELECT 1 FROM public.canvas_drafts s
                             WHERE s.id = o.draft_id
                               AND (s.state = 'open'
                                    OR (s.state = 'published' AND s.material_until IS NOT NULL AND s.material_until > now()
                                        AND EXISTS (SELECT 1 FROM public.canvas_draft_material m WHERE m.draft_id = s.id))))
                        THEN 'offered' ELSE 'dismissed' END,
           started_canvas_id = NULL
     WHERE o.draft_id = v_d.source_draft_id AND o.started_canvas_id = v_d.canvas_id AND o.state = 'started';
    UPDATE public.canvas_drafts s SET revision = s.revision + 1
     WHERE s.id = v_d.source_draft_id AND s.state IN ('open', 'published');
    -- a dismissed offer may have been the last open one: the source's kept material goes at once
    PERFORM public._canvas_draft_offers_settled(v_d.source_draft_id);
  END IF;
  RETURN v_clean;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_discard_inner(uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- A new canvas with an automatic address (canvas, canvas_2, ...): a name no canvas, version or point tag of the owner
-- uses yet. It has no first version of its own: its draft is its first version.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._canvas_draft_new_canvas(p_uid uuid)
RETURNS public.canvases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name   text := 'canvas';
  v_n      integer := 1;
  v_canvas public.canvases;
BEGIN
  WHILE EXISTS (SELECT 1 FROM public.canvases c WHERE c.owner_id = p_uid AND c.name = v_name)
     OR EXISTS (SELECT 1 FROM public.canvas_versions v WHERE v.owner_id = p_uid AND v.name = v_name)
     OR EXISTS (SELECT 1 FROM public.points p WHERE p.first_validator_id = p_uid
                  AND p.system_tags @> ARRAY['canvas_' || v_name]::text[]) LOOP
    v_n := v_n + 1;
    v_name := 'canvas_' || v_n;
  END LOOP;
  PERFORM set_config('p1536.first_version_draft', 'on', true);
  INSERT INTO public.canvases (owner_id, name) VALUES (p_uid, v_name) RETURNING * INTO v_canvas;
  PERFORM set_config('p1536.first_version_draft', 'off', true);
  RETURN v_canvas;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_new_canvas(uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- A new open draft of p_canvas, started from p_base (a published version of it) or from nothing. Creates the draft
-- version (internal name <canvas>_d<6 hex>), the thread root in the owner's mirror (an owner message with no text whose
-- attachment is the version the draft starts from, or for a new canvas the draft itself) and the draft row, and tags
-- every private point of the base version into the draft: the draft STARTS AS ITS BASE, with the same point ids, so
-- positions and stories carry over. A base point that is not private (a legacy public seed) cannot take the draft's
-- tag (p1515_canvas_points_are_private), so it is carried as a private copy with the owner's private stories linked.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._canvas_draft_new(
  p_uid uuid, p_canvas uuid, p_base uuid, p_source uuid, p_focus text)
RETURNS public.canvas_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_canvas public.canvases;
  v_vname  text;
  v_ver    uuid;
  v_conv   uuid;
  v_root   uuid;
  v_at     timestamptz;
  v_d      public.canvas_drafts;
  v_btag   text;
  v_dtag   text;
  v_boxes  text[] := public._canvas_box_tags();
  v_pt     public.points;
  v_new    uuid;
BEGIN
  SELECT c.* INTO v_canvas FROM public.canvases c WHERE c.id = p_canvas AND c.owner_id = p_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  IF p_base IS NOT NULL THEN
    SELECT 'canvas_' || v.name INTO v_btag FROM public.canvas_versions v
     WHERE v.id = p_base AND v.canvas_id = v_canvas.id AND v.published_at IS NOT NULL;
    IF v_btag IS NULL THEN
      RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
    END IF;
  END IF;

  LOOP
    v_vname := left(v_canvas.name, 56) || '_d' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.canvas_versions v WHERE v.owner_id = p_uid AND v.name = v_vname);
  END LOOP;
  v_dtag := 'canvas_' || v_vname;
  PERFORM set_config('p1536.first_version_draft', 'on', true);
  INSERT INTO public.canvas_versions (canvas_id, owner_id, name) VALUES (v_canvas.id, p_uid, v_vname)
  RETURNING id INTO v_ver;
  PERFORM set_config('p1536.first_version_draft', 'off', true);

  v_conv := public._chat_ensure_mirror(p_uid);
  INSERT INTO public.chat_messages (conversation_id, author_id, body, kind, attachment_kind, attachment_id, created_at)
  VALUES (v_conv, p_uid, NULL, 'message', 'canvas_version', COALESCE(p_base, v_ver), clock_timestamp())
  RETURNING id, created_at INTO v_root, v_at;
  UPDATE public.chat_conversations c SET last_message_at = v_at WHERE c.id = v_conv;
  INSERT INTO public.chat_member_state (conversation_id, profile_id, last_read_at, manual_unread)
  VALUES (v_conv, p_uid, v_at, false)
  ON CONFLICT (conversation_id, profile_id) DO UPDATE
    SET last_read_at  = GREATEST(COALESCE(public.chat_member_state.last_read_at, '-infinity'::timestamptz), EXCLUDED.last_read_at),
        manual_unread = false;

  -- a draft opened from a published version inherits the focus of the draft that published it
  INSERT INTO public.canvas_drafts
    (version_id, canvas_id, owner_id, base_version_id, conversation_id, thread_root_id, canvas_name, version_name,
     focus, source_draft_id)
  VALUES (v_ver, v_canvas.id, p_uid, p_base, v_conv, v_root, v_canvas.name, v_vname,
          COALESCE(NULLIF(left(btrim(COALESCE(p_focus, '')), 120), ''),
                   (SELECT pd.focus FROM public.canvas_drafts pd WHERE pd.version_id = p_base AND pd.state = 'published' LIMIT 1)),
          p_source)
  RETURNING * INTO v_d;

  IF p_base IS NOT NULL THEN
    -- the draft starts as its base: every private base point takes the draft's tag (same ids; updated_at is not touched)
    PERFORM set_config('p1536.keep_updated_at', 'on', true);
    UPDATE public.points p SET system_tags = array_append(p.system_tags, v_dtag)
     WHERE p.first_validator_id = p_uid AND p.visibility = 'private'::public.content_visibility
       AND p.system_tags @> ARRAY[v_btag]::text[] AND p.system_tags && v_boxes
       AND NOT (p.system_tags @> ARRAY[v_dtag]::text[]);
    PERFORM set_config('p1536.keep_updated_at', 'off', true);
    -- a legacy public base point is carried as a private copy (no link), recorded in the ledger
    FOR v_pt IN
      SELECT p.* FROM public.points p
       WHERE p.first_validator_id = p_uid AND p.visibility <> 'private'::public.content_visibility
         AND p.system_tags @> ARRAY[v_btag]::text[] AND p.system_tags && v_boxes
       ORDER BY p.created_at, p.id
    LOOP
      INSERT INTO public.points (statement, first_validator_id, visibility, tags, system_tags)
      VALUES (v_pt.statement, p_uid, 'private'::public.content_visibility, '{}',
              ARRAY[public._canvas_point_box(v_pt.system_tags), v_dtag])
      RETURNING id INTO v_new;
      -- a private COPY of an existing point keeps the owner's stance on the point it copies (none if there is none)
      INSERT INTO public.point_positions (point_id, user_id, position)
      SELECT v_new, p_uid, pp.position FROM public.point_positions pp WHERE pp.point_id = v_pt.id AND pp.user_id = p_uid;
      INSERT INTO public.story_points (story_id, point_id, author_id)
      SELECT sp.story_id, v_new, p_uid
        FROM public.story_points sp JOIN public.stories s ON s.id = sp.story_id
       WHERE sp.point_id = v_pt.id AND s.author_id = p_uid AND s.visibility = 'private'::public.content_visibility;
      INSERT INTO public.canvas_draft_points (draft_id, point_id, run_id, story_ids, copied_from)
      VALUES (v_d.id, v_new, NULL, '{}', v_pt.id);
    END LOOP;
  END IF;
  RETURN v_d;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_new(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. Caps (D18) and the read
-- ============================================================================
-- _mirror_limits: the canvas caps (60 runs / $6.00 a day per person, $45.00 a day for the shared canvas bucket).
-- Body byte-for-byte 20261029100100 except those three numbers and the comment above the total.
CREATE OR REPLACE FUNCTION public._mirror_limits()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'reply_max_usd',             0.105,   -- (50000 in x $1.50 + 1200 out x $7.50) / 1e6 x 1.25; mirror-agent.ts BUDGET_TOKENS/MAX_OUT_TOKENS
    'portrait_max_usd',          0.70,    -- 2 generations x (primary + fallback image) + 2 vision checks, x 1.25
    'person_reply_daily_usd',    0.60,
    'person_reply_daily_count',  30,
    'person_portrait_daily_usd', 2.10,
    'person_portrait_daily_count', 3,
    'global_reply_daily_usd',    5.00,
    'global_portrait_daily_usd', 6.00,
    -- P1536 canvas drafts. canvas_max_usd = (63,000 in x $1.50 + 16,000 out x $7.50) / 1e6 x 1.25 (the mirror's
    -- reservation prices, not the registry's lower ones). extract_max_usd: one extraction call of a file.
    'canvas_max_usd',            0.27,
    'extract_max_usd',           0.35,
    'person_canvas_daily_usd',   6.00,
    'person_canvas_daily_count', 60,
    'global_canvas_daily_usd',   45.00,
    -- Founder 2026-10-29 (D18): per person 60 runs and $6.00 a day, shared canvas bucket $45.00 a day. Chat replies keep
    -- their own $5.00 (global_reply_daily_usd) and the total stays at $50.00 a day (founder 2026-10-27).
    'global_total_daily_usd',    50.00
  );
$$;
REVOKE ALL ON FUNCTION public._mirror_limits() FROM PUBLIC, anon, authenticated;

-- get_canvas: byte-for-byte 20261029100000 except two additions: every version entry carries from_seq (the published
-- version it was drafted from, null for a first version; a reader sees published versions only), and the owner's
-- access.draft also carries the revision, the focus and the boxes that differ from the base ("Changed", computed).
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

-- ============================================================================
-- 4. Worker: begin a run by its id
-- ============================================================================
-- _canvas_draft_run_begin(p_run, p_owner, p_has_file, p_cap_reply): the edge function calls it with the run id a user RPC
-- returned and the user id it verified; a run that is not that user's is `gone`. Returns {status: run | running | not_ready | busy | capped | gone, ...}.
--   run        the run moved queued -> running, its spend is reserved, and the payload below is what the engine reads
--   running    the run is already running: nothing is done, no model call may be made (a second invoke)
--   not_ready  its input is not ready: a voice note whose transcript is pending, or an upload whose file this
--              invocation does not carry (p_has_file false)
--   busy       a row the context needs is locked by an erasure; try again
--   capped     the daily AI cap: the run is marked 'capped', nothing is charged, no model call; p_cap_reply (when given)
--              is posted in the thread
--   gone       the run does not exist, is terminal (state says which), or was failed here: an expired lease, a voice
--              note whose transcript failed ('transcript_failed': no model call, no charge), a closed draft
-- An upload run claims first and extracts afterwards, in the same invocation: p_has_file true reserves the extraction
-- price (extract_max_usd) on top of the drafting price in ONE reservation, which the run's completion settles in one
-- number. The legacy 4-argument begin (owner, draft, kind, speed) is untouched and still serves the old client.
CREATE OR REPLACE FUNCTION public._canvas_draft_run_begin(p_run uuid, p_owner uuid, p_has_file boolean DEFAULT false, p_cap_reply text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_chars CONSTANT integer := 150000;
  c_rows  CONSTANT integer := 500;
  v_run     public.canvas_draft_runs;
  v_d       public.canvas_drafts;
  v_canvas  public.canvases;
  v_base    public.canvas_versions;
  v_trig    public.chat_messages;
  v_lim     jsonb := public._mirror_limits();
  v_in      jsonb;
  v_max     numeric;
  v_spend   uuid;
  v_ids     uuid[];
  v_locked  uuid[];
  v_refs    text[];
  v_ref     text;
  v_boxes   text[] := public._canvas_box_tags();
  v_dtag    text;
  v_slug    text;
  v_first   text;
  v_full    text;
  v_names   text[] := '{}';
  v_thread  jsonb := '[]'::jsonb;
  v_material jsonb;
  v_points  jsonb;
  v_offers  jsonb;
  v_target  public.canvas_draft_offers;
  v_pre     uuid[];
BEGIN
  IF p_run IS NULL OR p_owner IS NULL THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run;
  IF NOT FOUND OR v_run.owner_id IS DISTINCT FROM p_owner THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_run.owner_id::text, 0));
  PERFORM public._canvas_draft_expire(v_run.owner_id);
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = v_run.draft_id FOR UPDATE;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run FOR UPDATE;

  IF v_run.state = 'running' THEN
    RETURN jsonb_build_object('status', 'running', 'run_id', v_run.id);
  END IF;
  IF v_run.state <> 'queued' OR v_run.kind NOT IN ('message', 'focus', 'fork_first') THEN
    RETURN jsonb_build_object('status', 'gone', 'state', v_run.state, 'error_code', v_run.error_code);
  END IF;
  IF v_d.state <> 'open' THEN
    UPDATE public.canvas_draft_runs r SET state = 'failed', error_code = 'draft_closed', finished_at = now() WHERE r.id = v_run.id;
    UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id;
    RETURN jsonb_build_object('status', 'gone', 'state', 'failed', 'error_code', 'draft_closed');
  END IF;

  IF v_run.trigger_message_id IS NOT NULL THEN
    SELECT m.* INTO v_trig FROM public.chat_messages m WHERE m.id = v_run.trigger_message_id;
  END IF;

  -- readiness
  IF v_run.input_kind = 'voice' THEN
    IF v_trig.id IS NULL OR v_trig.deleted_at IS NOT NULL OR v_trig.transcript_status = 'failed'
       OR (v_trig.transcript_status = 'done' AND btrim(COALESCE(v_trig.transcript, '')) = '') THEN
      UPDATE public.canvas_draft_runs r SET state = 'failed', error_code = 'transcript_failed', finished_at = now() WHERE r.id = v_run.id;
      UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id;
      RETURN jsonb_build_object('status', 'gone', 'state', 'failed', 'error_code', 'transcript_failed');
    END IF;
    IF v_trig.transcript_status IS DISTINCT FROM 'done' THEN
      RETURN jsonb_build_object('status', 'not_ready', 'run_id', v_run.id, 'reason', 'transcript_pending');
    END IF;
  ELSIF v_run.input_kind = 'file' AND NOT COALESCE(p_has_file, false) THEN
    RETURN jsonb_build_object('status', 'not_ready', 'run_id', v_run.id, 'reason', 'file_missing');
  END IF;
  IF v_run.kind = 'message' AND (v_trig.id IS NULL OR v_trig.deleted_at IS NOT NULL) THEN
    UPDATE public.canvas_draft_runs r SET state = 'failed', error_code = 'message_gone', finished_at = now() WHERE r.id = v_run.id;
    UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id;
    RETURN jsonb_build_object('status', 'gone', 'state', 'failed', 'error_code', 'message_gone');
  END IF;
  IF v_run.kind = 'focus' THEN
    SELECT o.* INTO v_target FROM public.canvas_draft_offers o WHERE o.id = v_run.target_offer_id AND o.draft_id = v_d.id;
  END IF;

  SELECT c.* INTO v_canvas FROM public.canvases c WHERE c.id = v_d.canvas_id;
  v_dtag := 'canvas_' || v_d.version_name;
  IF v_d.base_version_id IS NOT NULL THEN
    SELECT v.* INTO v_base FROM public.canvas_versions v WHERE v.id = v_d.base_version_id;
  END IF;
  SELECT pr.slug, split_part(COALESCE(pr.name, ''), ' ', 1), COALESCE(pr.name, '')
    INTO v_slug, v_first, v_full FROM public.profiles pr WHERE pr.id = v_run.owner_id;
  v_ref := public._chat_author_ref(v_run.owner_id);

  -- THE selector. Messages and copies are read newest first within the offer bound; the trigger message is always
  -- read (context fitting never drops it).
  v_in := public._canvas_draft_effective_input(v_d.id, v_run.id);
  v_ids := ARRAY(
    SELECT s.id FROM (
      SELECT x.id, sum(public._mirror_row_chars(x)) OVER (ORDER BY x.created_at DESC, x.id DESC
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
        FROM public.chat_messages x
       WHERE x.id IN (SELECT jsonb_array_elements_text(v_in -> 'message_ids')::uuid
                       UNION SELECT jsonb_array_elements_text(v_in -> 'copy_ids')::uuid)
         AND x.id IS DISTINCT FROM v_run.trigger_message_id
       ORDER BY x.created_at DESC, x.id DESC LIMIT c_rows) s
     WHERE COALESCE(s.before, 0) < c_chars);
  IF v_run.trigger_message_id IS NOT NULL THEN
    v_ids := v_ids || v_run.trigger_message_id;
  END IF;
  -- One lock pass, FOR SHARE SKIP LOCKED, then the context lock shared and only TRIED, exactly as _mirror_begin_job
  -- does (deadlock-free against erase_chat_data_for's phased locks).
  SELECT COALESCE(array_agg(q.id), '{}') INTO v_locked FROM (
    SELECT m.id FROM public.chat_messages m WHERE m.id = ANY (v_ids) ORDER BY m.created_at, m.id FOR SHARE SKIP LOCKED) q;
  IF v_run.trigger_message_id IS NOT NULL AND NOT (v_run.trigger_message_id = ANY (v_locked)) THEN
    RETURN jsonb_build_object('status', 'busy', 'run_id', v_run.id);
  END IF;
  v_ids := ARRAY(SELECT u FROM unnest(v_ids) u WHERE u = ANY (v_locked));
  IF NOT pg_try_advisory_xact_lock_shared(hashtext('p1520_mirror_context')) THEN
    RETURN jsonb_build_object('status', 'busy', 'run_id', v_run.id);
  END IF;

  SELECT COALESCE(jsonb_agg(it.item ORDER BY it.at, it.id, it.part), '[]'::jsonb) INTO v_thread FROM (
    SELECT t.id, t.created_at AS at, 0 AS part,
           jsonb_build_object('kind', 'owner_message', 'message_id', t.id,
                              'text', COALESCE(NULLIF(btrim(COALESCE(t.body, '')), ''), t.transcript),
                              'voice', t.audio_duration_ms IS NOT NULL,
                              'box_refs', to_jsonb(t.box_refs),
                              'is_trigger', t.id = v_run.trigger_message_id) AS item
      FROM public.chat_messages t
     WHERE t.id = ANY (v_ids) AND t.kind = 'message' AND t.deleted_at IS NULL
       AND NULLIF(btrim(COALESCE(NULLIF(btrim(COALESCE(t.body, '')), ''), t.transcript, '')), '') IS NOT NULL
    UNION ALL
    SELECT t.id, t.created_at, 1,
           jsonb_build_object(
             'kind', 'clarify_copy',
             'label', left(COALESCE(NULLIF(t.forward_snapshot ->> 'conversation_title', ''),
                                    NULLIF(t.forward_snapshot ->> 'author_name', ''), 'a copied chat'), 80),
             'lines', (
               SELECT COALESCE(jsonb_agg(l.line ORDER BY l.ord), '[]'::jsonb) FROM (
                 SELECT 0 AS ord,
                        jsonb_build_object('by', CASE WHEN t.forward_author_id = v_run.owner_id THEN 'owner' ELSE 'other' END,
                                           'text', t.forward_snapshot ->> 'body') AS line
                  WHERE NULLIF(btrim(COALESCE(t.forward_snapshot ->> 'body', '')), '') IS NOT NULL
                 UNION ALL
                 SELECT x.ord::integer,
                        jsonb_build_object('by', CASE WHEN x.entry ->> 'author_ref' = v_ref THEN 'owner' ELSE 'other' END,
                                           'text', x.entry ->> 'body')
                   FROM jsonb_array_elements(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) WITH ORDINALITY AS x(entry, ord)
                  WHERE NULLIF(btrim(COALESCE(x.entry ->> 'body', '')), '') IS NOT NULL
                    AND x.ord > jsonb_array_length(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) - 100
               ) l))
      FROM public.chat_messages t
     WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.kind IN ('forward', 'clarify') AND t.forward_snapshot IS NOT NULL
  ) it;

  -- the other people in those copies (a point or story that contains one of these names is dropped by the engine)
  SELECT COALESCE(array_agg(DISTINCT q.n), '{}') INTO v_names FROM (
    SELECT btrim(t.forward_snapshot ->> 'author_name') AS n
      FROM public.chat_messages t
     WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.forward_snapshot IS NOT NULL
       AND t.forward_author_id IS DISTINCT FROM v_run.owner_id
    UNION
    SELECT btrim(x.entry ->> 'author_name')
      FROM public.chat_messages t, jsonb_array_elements(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) AS x(entry)
     WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND (x.entry ->> 'author_ref') IS DISTINCT FROM v_ref
    UNION
    SELECT btrim(t.forward_snapshot ->> 'conversation_title')
      FROM public.chat_messages t
     WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.forward_snapshot ? 'conversation_title_ref'
  ) q
  WHERE q.n IS NOT NULL AND q.n <> '' AND lower(q.n) <> 'deleted user' AND lower(q.n) <> lower(v_full);

  -- whose words are in it, from exactly the rows read (erasure provenance; see _mirror_begin_job)
  SELECT array_remove(array_agg(DISTINCT r.ref), NULL) INTO v_refs FROM (
    SELECT public._chat_author_ref(t.author_id) AS ref
      FROM public.chat_messages t WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.author_id IS NOT NULL
    UNION
    SELECT public._chat_author_ref(t.forward_author_id)
      FROM public.chat_messages t WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.forward_author_id IS NOT NULL
    UNION
    SELECT x.entry ->> 'author_ref'
      FROM public.chat_messages t, jsonb_array_elements(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) AS x(entry)
     WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL
    UNION
    SELECT t.forward_snapshot ->> 'conversation_title_ref'
      FROM public.chat_messages t
     WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.forward_snapshot ? 'conversation_title_ref'
  ) r;

  -- spend: the drafting price, plus the extraction price when this invocation carries the file
  v_max := (v_lim ->> 'canvas_max_usd')::numeric
           + CASE WHEN v_run.input_kind = 'file' AND COALESCE(p_has_file, false) THEN (v_lim ->> 'extract_max_usd')::numeric ELSE 0 END;
  v_spend := public._mirror_reserve(v_run.owner_id, 'canvas', v_max);
  IF v_spend IS NULL THEN
    UPDATE public.canvas_draft_runs r SET state = 'capped', error_code = 'cap', finished_at = now() WHERE r.id = v_run.id;
    UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id;
    IF NULLIF(btrim(COALESCE(p_cap_reply, '')), '') IS NOT NULL THEN
      PERFORM public._canvas_draft_post_reply(v_d.conversation_id, v_d.thread_root_id, p_cap_reply, '{}', v_run.id);
    END IF;
    RETURN jsonb_build_object('status', 'capped', 'run_id', v_run.id);
  END IF;

  UPDATE public.canvas_draft_runs r
     SET state = 'running', attempts = r.attempts + 1, spend_id = v_spend, derived_refs = COALESCE(v_refs, '{}'),
         started_at = now()
   WHERE r.id = v_run.id;
  UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id;

  v_pre := public._canvas_draft_point_ids(v_d.id);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'box', public._canvas_point_box(p.system_tags),
           'statement', p.statement,
           'story', (SELECT s.content FROM public.story_points sp JOIN public.stories s ON s.id = sp.story_id
                      WHERE sp.point_id = p.id AND s.author_id = v_run.owner_id ORDER BY s.created_at, s.id LIMIT 1),
           'other_positions', (SELECT count(*) FROM public.point_positions pp WHERE pp.point_id = p.id AND pp.user_id <> v_run.owner_id))
         ORDER BY p.created_at, p.id), '[]'::jsonb)
    INTO v_points FROM public.points p WHERE p.id = ANY (v_pre);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'label', m.label, 'text', m.text,
                                               'message_id', m.message_id, 'origin', m.origin)
                            ORDER BY m.created_at, m.id), '[]'::jsonb)
    INTO v_material FROM public.canvas_draft_material m
   WHERE m.id IN (SELECT jsonb_array_elements_text(v_in -> 'material_ids')::uuid);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', o.id, 'group_label', o.group_label, 'state', o.state)
                            ORDER BY o.created_at, o.id), '[]'::jsonb)
    INTO v_offers FROM public.canvas_draft_offers o WHERE o.draft_id = v_d.id;

  RETURN jsonb_build_object(
    'status', 'run', 'run_id', v_run.id, 'kind', v_run.kind, 'input_kind', v_run.input_kind,
    'reserved_usd', v_max,
    'canvas_path', '/p/' || COALESCE(v_slug, v_run.owner_id::text) || '/canvas/' || v_canvas.name || '?v=' || v_d.version_name,
    'base_label', CASE WHEN v_d.base_version_id IS NULL THEN NULL ELSE 'v' || v_base.published_seq END,
    -- the whole canvas is to be drafted: a fork's first run, or an untagged message on an empty draft with no focus yet
    'first_draft', (v_run.kind = 'fork_first'
                    OR (v_run.kind = 'message' AND cardinality(v_pre) = 0 AND v_d.base_version_id IS NULL
                        AND v_d.focus IS NULL AND v_trig.box_refs IS NULL)),
    'focus', v_d.focus,
    'target_group', v_target.group_label,
    'box_refs', to_jsonb(v_trig.box_refs),
    'trigger_message_id', v_run.trigger_message_id,
    'draft_points', v_points,
    'questions', v_d.questions,
    'offers', v_offers,
    'material', v_material,
    'thread', v_thread,
    'other_names', to_jsonb(v_names),
    'owner_first_name', NULLIF(v_first, ''), 'owner_name', NULLIF(v_full, ''),
    'canvas_name', v_canvas.name, 'version_name', v_d.version_name,
    'used_runs', public._canvas_draft_used_runs(v_d.id),
    'revision', v_d.revision + 1);
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_run_begin(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_run_begin(uuid, uuid, boolean, text) TO service_role;

-- ============================================================================
-- 5. Worker: material, completion, failure
-- ============================================================================
-- _canvas_draft_add_material: the text of an upload or a link, kept with the message that brought it. Writes only for a
-- RUNNING run of that draft (a late write for a failed, expired or cancelled run touches nothing: 'gone'). p_message
-- defaults to the run's trigger message; it must be an owner message of the draft's thread. The cap of 10 counts only the
-- draft's own material of messages that still count (not undone, failed, capped or cancelled ones); a fork's seed rows
-- have their own cap (see canvas_draft_fork). The run must be p_owner's.
-- {status: ok | limit | denied | gone}. The legacy 5-argument form (owner, draft, kind, label, text) is untouched.
CREATE OR REPLACE FUNCTION public._canvas_draft_add_material(
  p_run uuid, p_owner uuid, p_kind text, p_label text, p_text text, p_message uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max CONSTANT integer := 10;
  v_run  public.canvas_draft_runs;
  v_d    public.canvas_drafts;
  v_text text := left(COALESCE(p_text, ''), 200000);
  v_msg  uuid;
  v_id   uuid;
  v_in   jsonb;
BEGIN
  IF p_run IS NULL OR p_owner IS NULL OR p_kind IS NULL OR p_kind NOT IN ('file', 'link') OR v_text = '' THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run;
  IF NOT FOUND OR v_run.owner_id IS DISTINCT FROM p_owner THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_run.owner_id::text, 0));
  PERFORM public._canvas_draft_expire(v_run.owner_id);
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = v_run.draft_id FOR UPDATE;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run FOR UPDATE;
  IF v_run.state <> 'running' OR v_d.state <> 'open' THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  v_msg := COALESCE(p_message, v_run.trigger_message_id);
  IF v_msg IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.chat_messages m
        WHERE m.id = v_msg AND m.conversation_id = v_d.conversation_id AND m.thread_root_id = v_d.thread_root_id
          AND m.author_id = v_d.owner_id) THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  IF (SELECT count(*) FROM public.canvas_draft_material m
       WHERE m.draft_id = v_d.id AND m.origin = 'message'
         AND (m.message_id IS NULL
              OR COALESCE((SELECT r.state FROM public.canvas_draft_runs r WHERE r.trigger_message_id = m.message_id
                            ORDER BY r.created_at DESC, r.id DESC LIMIT 1), 'running')
                 NOT IN ('undone', 'failed', 'capped', 'cancelled'))) >= c_max THEN
    RETURN jsonb_build_object('status', 'limit');
  END IF;
  INSERT INTO public.canvas_draft_material (draft_id, owner_id, kind, label, text, chars, message_id, origin)
  VALUES (v_d.id, v_d.owner_id, p_kind, left(COALESCE(NULLIF(btrim(p_label), ''), p_kind), 200), v_text,
          char_length(v_text), v_msg, 'message')
  RETURNING id INTO v_id;
  -- a mutation like any other: two state reads must not show different material at the same revision
  UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id;
  -- the material the run may read NOW (through the one selector, which includes the row just written), so the caller can
  -- draft with it in the same invocation
  v_in := public._canvas_draft_effective_input(v_d.id, v_run.id);
  RETURN jsonb_build_object('status', 'ok', 'id', v_id, 'chars', char_length(v_text),
                            'revision', (SELECT d.revision FROM public.canvas_drafts d WHERE d.id = v_d.id),
                            'truncated', char_length(COALESCE(p_text, '')) > 200000,
                            'material', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                           'id', x.id, 'kind', x.kind, 'label', x.label, 'text', x.text,
                                           'message_id', x.message_id, 'origin', x.origin) ORDER BY x.created_at, x.id), '[]'::jsonb)
                                           FROM public.canvas_draft_material x
                                          WHERE x.id IN (SELECT jsonb_array_elements_text(v_in -> 'material_ids')::uuid)));
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_add_material(uuid, uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_add_material(uuid, uuid, text, text, text, uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- _canvas_draft_run_complete: (p_run, p_owner, ...) the model's result, applied in ONE transaction (any error rolls every write back and
-- leaves the run running, for _canvas_draft_run_fail). Returns {status: ok | failed | gone, ...}.
--   p_actions          [{action|type: keep, point_id}
--                      | {action|type: reword|move, old_point_id, box, statement, story}
--                      | {action|type: new, box, statement, story}]; a point of a SCOPED box that no action names
--                      leaves the draft (there is no drop action)
--   p_questions        {canvas box tag: question}
--   p_scope            the boxes the model says the message addressed (used only for an untagged message run)
--   p_focus            the business the canvas is about (used only by the first draft)
--   p_other_canvases   [{group, why}] other businesses the material is about (offers)
--   p_note             the model's one short note; used for the reply only when p_reply is empty and no box changed
--   p_reply            the agent's reply, posted in the thread with the run id
-- Order: the undo step first, then the scoped apply (a focus run rebuilds the customer-facing boxes), then the per-box
-- merge of questions and links, then the offer merge, then the ledger (written as each point is made), then the reply
-- with the run id, then the revision. It never calls _canvas_draft_clear_points.
-- Server enforcement: the SOURCE box of a named point and the DESTINATION box must both be in scope; a tagged message's
-- scope is exactly its box_refs (the model's scope is ignored); the first draft, a focus run and a fork's first run
-- cover all nine boxes. Anything outside the scope is dropped and counted. An EMPTY scope changes nothing: no step, no
-- focus, no offers; the reply is the caller's (or "No box changed."), and the run still counts as used.
-- Not search_path = '': inserting points, stories, story_points and point_positions fires triggers that resolve
-- unqualified names. Every relation named here is schema-qualified.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._canvas_draft_run_complete(
  p_run uuid, p_owner uuid, p_actions jsonb, p_questions jsonb, p_scope text[], p_focus text, p_other_canvases jsonb,
  p_note text, p_reply text, p_usd numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_actions CONSTANT integer := 45;
  v_run    public.canvas_draft_runs;
  v_d      public.canvas_drafts;
  v_trig   public.chat_messages;
  v_boxes  text[] := public._canvas_box_tags();
  v_cust   text[] := public._canvas_customer_box_tags();
  v_tag    text;
  v_pre    uuid[];
  v_scope  text[];
  v_first  boolean;
  v_a      jsonb;
  v_type   text;
  v_old    uuid;
  v_op     public.points;
  v_src    text;
  v_box    text;
  v_stmt   text;
  v_story  text;
  v_pid    uuid;
  v_sid    uuid;
  v_seen   uuid[] := '{}';
  v_keep   uuid[] := '{}';
  v_links  jsonb;
  v_chain  uuid;
  v_kept   integer := 0;
  v_made   integer := 0;
  v_drop   integer := 0;
  v_k      text;
  v_q      jsonb;
  v_full   numeric;
  v_offer  public.canvas_draft_offers;
  v_prev   text;
  v_row    public.canvas_draft_offers;
  v_new_offers uuid[] := '{}';
  v_oid    uuid;
  v_label  text;
  v_why    text;
  v_el     jsonb;
  v_open   integer;
  v_reply  text;
  v_reply_id uuid;
  v_focus  text;
  v_boxes_filled integer;
BEGIN
  IF p_run IS NULL OR p_owner IS NULL THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run;
  IF NOT FOUND OR v_run.owner_id IS DISTINCT FROM p_owner THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_run.owner_id::text, 0));
  PERFORM public._canvas_draft_expire(v_run.owner_id);
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = v_run.draft_id FOR UPDATE;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run FOR UPDATE;
  IF v_run.state = 'cancelled' THEN
    SELECT s.reserved_usd INTO v_full FROM public.mirror_ai_spend s WHERE s.id = v_run.spend_id;
    PERFORM public._mirror_settle(v_run.spend_id, COALESCE(p_usd, v_full));   -- erased: the call was made, nothing is written
    RETURN jsonb_build_object('status', 'gone', 'state', 'cancelled');
  END IF;
  IF v_run.state <> 'running' OR v_run.kind NOT IN ('message', 'focus', 'fork_first') THEN
    RETURN jsonb_build_object('status', 'gone', 'state', v_run.state);
  END IF;

  -- shape checks: a malformed result raises, the transaction rolls back and the caller fails the run
  IF p_actions IS NULL OR jsonb_typeof(p_actions) <> 'array' OR jsonb_array_length(p_actions) > c_max_actions THEN
    RAISE EXCEPTION 'canvas draft: actions must be an array of at most % items', c_max_actions USING ERRCODE = '22023';
  END IF;
  IF p_questions IS NOT NULL AND jsonb_typeof(p_questions) <> 'object' THEN
    RAISE EXCEPTION 'canvas draft: questions must be an object' USING ERRCODE = '22023';
  END IF;
  IF p_other_canvases IS NOT NULL AND (jsonb_typeof(p_other_canvases) <> 'array' OR jsonb_array_length(p_other_canvases) > 20) THEN
    RAISE EXCEPTION 'canvas draft: other_canvases must be an array of at most 20' USING ERRCODE = '22023';
  END IF;
  FOR v_k IN SELECT jsonb_object_keys(COALESCE(p_questions, '{}'::jsonb)) LOOP
    IF NOT (v_k = ANY (v_boxes)) OR jsonb_typeof(p_questions -> v_k) <> 'string' THEN
      RAISE EXCEPTION 'canvas draft: bad question' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT s.reserved_usd INTO v_full FROM public.mirror_ai_spend s WHERE s.id = v_run.spend_id;
  PERFORM public._mirror_settle(v_run.spend_id, COALESCE(p_usd, v_full));
  IF v_d.state <> 'open' THEN
    UPDATE public.canvas_draft_runs r SET state = 'failed', error_code = 'draft_closed', finished_at = now() WHERE r.id = p_run;
    RETURN jsonb_build_object('status', 'gone', 'state', 'failed', 'error_code', 'draft_closed');
  END IF;

  -- a focus switch re-checks under the lock that its target is still offered; otherwise nothing changes
  IF v_run.kind = 'focus' THEN
    SELECT o.* INTO v_offer FROM public.canvas_draft_offers o
     WHERE o.id = v_run.target_offer_id AND o.draft_id = v_d.id FOR UPDATE;
    IF NOT FOUND OR v_offer.state <> 'offered' THEN
      UPDATE public.canvas_draft_runs r SET state = 'failed', error_code = 'not_offered', finished_at = now() WHERE r.id = p_run;
      UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id;
      RETURN jsonb_build_object('status', 'failed', 'code', 'not_offered');
    END IF;
  END IF;

  v_tag := 'canvas_' || v_d.version_name;
  IF v_run.trigger_message_id IS NOT NULL THEN
    SELECT m.* INTO v_trig FROM public.chat_messages m WHERE m.id = v_run.trigger_message_id;
  END IF;
  v_pre := public._canvas_draft_point_ids(v_d.id);
  -- the first draft: an UNTAGGED message on an empty draft with no base and no focus yet. A tagged message is always
  -- exactly its tags, and an emptied draft (it has a focus) never lets a message run change that focus.
  v_first := (v_run.kind = 'message' AND v_trig.box_refs IS NULL AND cardinality(v_pre) = 0
              AND v_d.base_version_id IS NULL AND v_d.focus IS NULL);

  -- the scope of this run
  IF v_run.kind IN ('focus', 'fork_first') THEN
    v_scope := v_boxes;
  ELSIF v_run.kind = 'message' AND v_trig.box_refs IS NOT NULL THEN
    v_scope := ARRAY(SELECT DISTINCT b FROM unnest(v_trig.box_refs) b WHERE b = ANY (v_boxes) ORDER BY b);
  ELSIF v_first THEN
    v_scope := v_boxes;
  ELSE
    v_scope := ARRAY(SELECT DISTINCT b FROM unnest(COALESCE(p_scope, '{}')) b WHERE b = ANY (v_boxes) ORDER BY b);
    v_drop := v_drop + (SELECT count(DISTINCT b) FROM unnest(COALESCE(p_scope, '{}')) b WHERE NOT (b = ANY (v_boxes)));
  END IF;

  IF cardinality(v_scope) = 0 THEN
    -- nothing is applied: every action and question the model supplied is dropped, and counted
    v_drop := v_drop + jsonb_array_length(p_actions) + (SELECT count(*) FROM jsonb_object_keys(COALESCE(p_questions, '{}'::jsonb)));
  END IF;

  v_links := v_d.pending_links;
  v_q := v_d.questions;
  v_focus := v_d.focus;

  IF cardinality(v_scope) > 0 THEN
    -- 1. the undo step: the draft as it is before this run changes anything
    INSERT INTO public.canvas_draft_steps (run_id, draft_id, point_ids, questions, pending_links, focus)
    VALUES (v_run.id, v_d.id, v_pre, v_d.questions, v_d.pending_links, v_d.focus);

    -- 2. the scoped apply
    FOR v_a IN SELECT e FROM jsonb_array_elements(p_actions) e LOOP
      v_type := COALESCE(v_a ->> 'action', v_a ->> 'type');
      IF v_type IS NULL OR v_type NOT IN ('keep', 'reword', 'move', 'new') THEN
        RAISE EXCEPTION 'canvas draft: unknown action' USING ERRCODE = '22023';
      END IF;
      v_op := NULL;
      v_old := NULL;
      v_src := NULL;

      IF v_type IN ('keep', 'reword', 'move') THEN
        v_old := COALESCE(v_a ->> 'point_id', v_a ->> 'old_point_id')::uuid;
        IF v_old IS NULL THEN
          RAISE EXCEPTION 'canvas draft: an action names no point' USING ERRCODE = '22023';
        END IF;
        -- v6 form of the earlier guards: a point may only be named once, and must be a point of THIS draft as it stood
        -- before the run (the draft starts as its base, so a base point is one until a run takes it out). Anything else is
        -- malformed model output: the run raises, rolls back and the caller fails it (Try again).
        IF v_old = ANY (v_seen) THEN
          RAISE EXCEPTION 'canvas draft: a point is named twice' USING ERRCODE = '22023';
        END IF;
        IF NOT (v_old = ANY (v_pre)) THEN
          RAISE EXCEPTION 'canvas draft: point is not a point of this draft' USING ERRCODE = '22023';
        END IF;
        v_seen := v_seen || v_old;
        SELECT p.* INTO v_op FROM public.points p WHERE p.id = v_old;
        v_src := public._canvas_point_box(v_op.system_tags);
        IF v_src IS NULL OR NOT (v_src = ANY (v_scope)) THEN
          v_drop := v_drop + 1;          -- the source box is out of scope
          CONTINUE;
        END IF;
      END IF;

      IF v_type = 'keep' THEN
        IF v_run.kind = 'focus' AND v_src = ANY (v_cust) THEN
          v_drop := v_drop + 1;          -- a focus switch rebuilds the customer-facing boxes: keep is refused there
          CONTINUE;
        END IF;
        v_keep := v_keep || v_old;
        v_kept := v_kept + 1;
        CONTINUE;
      END IF;

      v_box := COALESCE(NULLIF(v_a ->> 'box', ''), CASE WHEN v_type <> 'new' THEN v_src END);
      IF v_box IS NULL OR NOT (v_box = ANY (v_boxes)) THEN
        RAISE EXCEPTION 'canvas draft: unknown box' USING ERRCODE = '22023';
      END IF;
      IF NOT (v_box = ANY (v_scope)) THEN
        v_drop := v_drop + 1;            -- the destination box is out of scope: the refused action must not remove its source
        IF v_old IS NOT NULL THEN
          v_keep := v_keep || v_old;
        END IF;
        CONTINUE;
      END IF;
      IF v_run.kind = 'focus' AND v_type = 'move' AND v_box = ANY (v_cust) THEN
        v_drop := v_drop + 1;            -- a move would carry a point over unchanged into a rebuilt box: refused. Its source
        IF NOT (v_src = ANY (v_cust)) THEN   -- stays only if it is a founder-fit point; a customer-facing source is rebuilt
          v_keep := v_keep || v_old;
        END IF;
        CONTINUE;
      END IF;
      v_stmt := btrim(COALESCE(NULLIF(btrim(v_a ->> 'statement'), ''), CASE WHEN v_type = 'move' THEN v_op.statement END, ''));
      IF char_length(v_stmt) NOT BETWEEN 1 AND 300 THEN
        RAISE EXCEPTION 'canvas draft: bad statement' USING ERRCODE = '22023';
      END IF;
      v_story := btrim(COALESCE(v_a ->> 'story', ''));
      IF char_length(v_story) > 1500 THEN
        RAISE EXCEPTION 'canvas draft: story too long' USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.points (statement, first_validator_id, visibility, tags, system_tags)
      VALUES (v_stmt, v_d.owner_id, 'private'::public.content_visibility, '{}', ARRAY[v_box, v_tag])
      RETURNING id INTO v_pid;
      -- D20: a point the engine writes starts with NO stance of the owner (the owner marks it before Publish). A reword is a new
      -- point and starts without one; the stance stays on the old point. A move carries the SAME words into another box, so it
      -- keeps the stance the owner had on the point it copies; a move that arrives with NEW words is a reword and gets none.
      IF v_type = 'move' AND v_stmt = btrim(v_op.statement) THEN
        INSERT INTO public.point_positions (point_id, user_id, position)
        SELECT v_pid, v_d.owner_id, pp.position FROM public.point_positions pp WHERE pp.point_id = v_op.id AND pp.user_id = v_d.owner_id;
      END IF;
      v_sid := NULL;
      IF v_story <> '' THEN
        INSERT INTO public.stories (content, author_id, visibility)
        VALUES (v_story, v_d.owner_id, 'private'::public.content_visibility) RETURNING id INTO v_sid;
        INSERT INTO public.story_points (story_id, point_id, author_id) VALUES (v_sid, v_pid, v_d.owner_id);
      ELSIF v_type IN ('move', 'reword') THEN
        -- same words (another box), or a reword that carries no story of its own (a draft writes points only): the
        -- owner's private stories of the old point follow it. They are the owner's, not the engine's: never in the ledger.
        INSERT INTO public.story_points (story_id, point_id, author_id)
        SELECT sp.story_id, v_pid, v_d.owner_id
          FROM public.story_points sp JOIN public.stories s ON s.id = sp.story_id
         WHERE sp.point_id = v_old AND s.author_id = v_d.owner_id AND s.visibility = 'private'::public.content_visibility;
      END IF;
      INSERT INTO public.canvas_draft_points (draft_id, point_id, run_id, story_ids)
      VALUES (v_d.id, v_pid, v_run.id, CASE WHEN v_sid IS NULL THEN '{}'::uuid[] ELSE ARRAY[v_sid] END);
      v_made := v_made + 1;

      -- a pending supersede link (old -> new) for a reword or move of a REUSED head point; a reword of a point this
      -- draft made takes over that point's link (the chain), anything else is a new point with no link
      -- (a focus run's reword into a customer-facing box is the rebuild's NEW content, not a revision of the old group's point)
      IF v_type IN ('reword', 'move') AND NOT (v_run.kind = 'focus' AND v_type = 'reword' AND v_box = ANY (v_cust)) THEN
        SELECT (l ->> 'old')::uuid INTO v_chain FROM jsonb_array_elements(v_links) l WHERE l ->> 'new' = v_old::text LIMIT 1;
        IF v_chain IS NOT NULL THEN
          v_links := v_links || jsonb_build_array(jsonb_build_object(
            'old', v_chain, 'new', v_pid, 'relation', v_type,
            'why', COALESCE(NULLIF(left(v_a ->> 'why', 200), ''), CASE v_type WHEN 'reword' THEN 'reworded' ELSE 'moved' END)));
        ELSIF NOT EXISTS (SELECT 1 FROM public.canvas_draft_points cp WHERE cp.draft_id = v_d.id AND cp.point_id = v_old)
              AND v_op.superseded_by IS NULL AND v_op.visibility = 'private'::public.content_visibility THEN
          v_links := v_links || jsonb_build_array(jsonb_build_object(
            'old', v_old, 'new', v_pid, 'relation', v_type,
            'why', COALESCE(NULLIF(left(v_a ->> 'why', 200), ''), CASE v_type WHEN 'reword' THEN 'reworded' ELSE 'moved' END)));
        END IF;
        v_chain := NULL;
      END IF;
    END LOOP;

    -- every point of a scoped box that no keep named leaves the draft (it stays on any version that holds it; a point
    -- only this draft made stays in the ledger until Publish or Discard)
    PERFORM set_config('p1536.keep_updated_at', 'on', true);
    UPDATE public.points p SET system_tags = array_remove(p.system_tags, v_tag)
     WHERE p.id = ANY (v_pre) AND public._canvas_point_box(p.system_tags) = ANY (v_scope) AND NOT (p.id = ANY (v_keep));
    PERFORM set_config('p1536.keep_updated_at', 'off', true);

    -- 3. the per-box merge of questions, scoped boxes only
    FOREACH v_k IN ARRAY v_scope LOOP
      v_q := v_q - v_k;
    END LOOP;
    FOR v_k IN SELECT jsonb_object_keys(COALESCE(p_questions, '{}'::jsonb)) LOOP
      IF v_k = ANY (v_scope) THEN
        IF NULLIF(btrim(p_questions ->> v_k), '') IS NOT NULL THEN
          v_q := v_q || jsonb_build_object(v_k, left(btrim(p_questions ->> v_k), 400));
        END IF;
      ELSE
        v_drop := v_drop + 1;
      END IF;
    END LOOP;
    -- links whose new point left the draft are dropped (a later run rewrote or omitted it)
    SELECT COALESCE(jsonb_agg(l), '[]'::jsonb) INTO v_links
      FROM jsonb_array_elements(v_links) l
     WHERE (l ->> 'new')::uuid = ANY (public._canvas_draft_point_ids(v_d.id));

    -- 4. focus. A message run never changes it; a focus run takes the offer's group; the first draft takes the model's.
    v_prev := v_d.focus;
    IF v_run.kind = 'focus' THEN
      v_focus := v_offer.group_label;
      -- the previous focus becomes an offer, so the owner can switch back or start it
      IF v_prev IS NOT NULL THEN
        SELECT o.* INTO v_row FROM public.canvas_draft_offers o
         WHERE o.draft_id = v_d.id AND public._canvas_offer_key(o.group_label) = public._canvas_offer_key(v_prev);
        IF NOT FOUND THEN
          INSERT INTO public.canvas_draft_offers (draft_id, group_label, why, state, created_run_id, created_at)
          VALUES (v_d.id, v_prev, NULL, 'offered', v_run.id, clock_timestamp()) RETURNING id INTO v_oid;
          v_new_offers := v_new_offers || v_oid;
        ELSIF v_row.state = 'focused' THEN
          UPDATE public.canvas_draft_offers o SET state = 'offered' WHERE o.id = v_row.id;
        END IF;
      END IF;
      UPDATE public.canvas_draft_offers o SET state = 'focused' WHERE o.id = v_offer.id;
    ELSIF v_first THEN
      v_focus := COALESCE(NULLIF(left(btrim(COALESCE(p_focus, '')), 120), ''), v_d.focus);
    END IF;

    -- 5. the offer merge: a group matching an existing offer or the focus is ignored; at most 3 open offers
    FOR v_el IN SELECT e FROM jsonb_array_elements(COALESCE(p_other_canvases, '[]'::jsonb)) e LOOP
      v_label := CASE jsonb_typeof(v_el)
                   WHEN 'string' THEN v_el #>> '{}'
                   WHEN 'object' THEN COALESCE(v_el ->> 'group_label', v_el ->> 'group', v_el ->> 'label')
                 END;
      v_why := CASE WHEN jsonb_typeof(v_el) = 'object' THEN NULLIF(left(btrim(COALESCE(v_el ->> 'why', '')), 400), '') END;
      v_label := NULLIF(left(btrim(COALESCE(v_label, '')), 120), '');
      CONTINUE WHEN v_label IS NULL;
      CONTINUE WHEN v_focus IS NOT NULL AND public._canvas_offer_key(v_label) = public._canvas_offer_key(v_focus);
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.canvas_draft_offers o
         WHERE o.draft_id = v_d.id AND public._canvas_offer_key(o.group_label) = public._canvas_offer_key(v_label));
      SELECT count(*) INTO v_open FROM public.canvas_draft_offers o WHERE o.draft_id = v_d.id AND o.state = 'offered';
      CONTINUE WHEN v_open >= 3;
      -- clock_timestamp(): offers made by one run keep the model's order
      INSERT INTO public.canvas_draft_offers (draft_id, group_label, why, state, created_run_id, created_at)
      VALUES (v_d.id, v_label, v_why, 'offered', v_run.id, clock_timestamp()) RETURNING id INTO v_oid;
      v_new_offers := v_new_offers || v_oid;
    END LOOP;

    UPDATE public.canvas_draft_steps s SET new_offer_ids = v_new_offers WHERE s.run_id = v_run.id;
    UPDATE public.canvas_drafts d SET pending_links = v_links, questions = v_q, focus = v_focus WHERE d.id = v_d.id;
  END IF;

  -- 6. the reply, carrying the run id
  v_reply := NULLIF(btrim(COALESCE(p_reply, '')), '');
  IF v_reply IS NULL AND cardinality(v_scope) = 0 THEN
    v_reply := 'No box changed.' || COALESCE(' ' || NULLIF(left(btrim(COALESCE(p_note, '')), 160), ''), '');
  END IF;
  v_reply_id := public._canvas_draft_post_reply(v_d.conversation_id, v_d.thread_root_id, v_reply, v_run.derived_refs, v_run.id);

  -- 7. the run and the revision
  UPDATE public.canvas_draft_runs r
     SET state = 'done', finished_at = now(), scope = v_scope, reply_message_id = v_reply_id
   WHERE r.id = v_run.id;
  UPDATE public.canvas_drafts d
     SET revision = d.revision + 1, run_count = d.run_count + 1
   WHERE d.id = v_d.id;
  SELECT count(DISTINCT public._canvas_point_box(p.system_tags)) INTO v_boxes_filled
    FROM public.points p WHERE p.id = ANY (public._canvas_draft_point_ids(v_d.id));
  RETURN jsonb_build_object(
    'status', 'ok', 'applied', cardinality(v_scope) > 0, 'scope', to_jsonb(v_scope), 'dropped', v_drop,
    'kept', v_kept, 'created', v_made, 'boxes_filled', v_boxes_filled, 'offers_added', cardinality(v_new_offers),
    'reply_message_id', v_reply_id, 'revision', (SELECT d.revision FROM public.canvas_drafts d WHERE d.id = v_d.id),
    'version', v_d.version_name);
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_run_complete(uuid, uuid, jsonb, jsonb, text[], text, jsonb, text, text, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_run_complete(uuid, uuid, jsonb, jsonb, text[], text, jsonb, text, text, numeric)
  TO service_role;


-- ----------------------------------------------------------------------------
-- _canvas_draft_run_fail(p_run, p_owner, p_code, p_reply, p_actual_usd): a run that failed. The spend is settled at
-- p_actual_usd (NULL means the call never started: released), the reply (when given) is posted with the run id so the
-- bubble can offer Try again, the revision moves. Returns false for a run that is not p_owner's or not running: nothing is
-- written. The earlier 4-argument form (no owner) is untouched and serves the legacy runs.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._canvas_draft_run_fail(p_run uuid, p_owner uuid, p_code text, p_reply text, p_actual_usd numeric DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.canvas_draft_runs;
  v_d   public.canvas_drafts;
  v_id  uuid;
BEGIN
  IF p_run IS NULL OR p_owner IS NULL THEN
    RETURN false;
  END IF;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run;
  IF NOT FOUND OR v_run.owner_id IS DISTINCT FROM p_owner THEN
    RETURN false;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_run.owner_id::text, 0));
  PERFORM public._canvas_draft_expire(v_run.owner_id);
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = v_run.draft_id FOR UPDATE;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run FOR UPDATE;
  IF v_run.state = 'cancelled' THEN
    PERFORM public._mirror_settle(v_run.spend_id, p_actual_usd);   -- erased: what the call cost is still counted
    RETURN false;
  END IF;
  IF v_run.state <> 'running' THEN
    RETURN false;
  END IF;
  IF v_run.spend_id IS NOT NULL THEN
    PERFORM public._mirror_settle(v_run.spend_id, p_actual_usd);
  END IF;
  UPDATE public.canvas_draft_runs r
     SET state = 'failed', error_code = left(COALESCE(NULLIF(p_code, ''), 'error'), 40), finished_at = now()
   WHERE r.id = p_run;
  IF p_reply IS NOT NULL AND v_d.state = 'open' THEN
    v_id := public._canvas_draft_post_reply(v_d.conversation_id, v_d.thread_root_id, p_reply, v_run.derived_refs, v_run.id);
    UPDATE public.canvas_draft_runs r SET reply_message_id = v_id WHERE r.id = p_run;
  END IF;
  IF v_run.kind IN ('message', 'focus', 'fork_first') THEN
    UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_run_fail(uuid, uuid, text, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_run_fail(uuid, uuid, text, text, numeric) TO service_role;
-- ============================================================================
-- 6. Client RPCs: Send and Try again
-- ============================================================================
-- Every client RPC below: refuses a signed-out caller and a caller who does not own the canvas or draft (42501, the same
-- message as every other canvas refusal); takes the per-owner lock, then runs the expire step; and answers a refusal
-- that is about the STATE of things as {status:'refused', code, revision} having written nothing for the request:
--   busy, busy_elsewhere, cap_reached, stale_view, not_retryable, not_offered, expired, draft_empty, no_changes.
-- A success is {status:'ok', ...}. A repeat with the same p_client_id returns the first result and writes nothing.

-- canvas_workspace_send(p_canvas, p_from_version, p_expected_draft, p_expected_revision, p_replace, p_body, p_box_refs,
--                       p_attachment, p_client_id)
-- One owner message (text, a voice note, or an upload) and the one queued run that applies it, in ONE transaction.
--   p_canvas            the canvas, or NULL for a new canvas (then p_from_version and p_expected_draft must be NULL)
--   p_from_version      a published version of the canvas to open the draft from when none is open
--   p_expected_draft    the open draft the client believes is open (NULL when it believes there is none)
--   p_expected_revision that draft's revision as the client last read it
--   p_replace           true: discard the open draft first, in this transaction ("Start over from vN")
--   p_box_refs          the boxes the owner tagged the message with (Add to chat); validated against _canvas_box_tags()
--   p_attachment        NULL | {kind:'file', label} | {kind:'voice', duration_ms, waveform?}. A voice note is written by
--                       P1576's chat_commit_voice_note (the one write path), its audio object key derived from the
--                       mirror conversation, the owner and p_client_id (the same id the upload used). A file is only
--                       announced: the client then posts the file to canvas-draft with the returned run_id.
--   p_client_id         required: idempotency of the send, and the message's client id
-- Returns {status:'ok', run_id, revision, draft_id, canvas_id, canvas_name, version_name, thread_root_id,
--          conversation_id, message_id, replayed}.
-- Refuses: busy, busy_elsewhere, cap_reached (the 30th used run applied; nothing is written), stale_view.
CREATE OR REPLACE FUNCTION public.canvas_workspace_send(
  p_canvas uuid, p_from_version uuid, p_expected_draft uuid, p_expected_revision integer, p_replace boolean,
  p_body text, p_box_refs text[], p_attachment jsonb, p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_open CONSTANT integer := 10;
  c_cap      CONSTANT integer := 30;
  v_uid    uuid := auth.uid();
  v_body   text := NULLIF(btrim(COALESCE(p_body, '')), '');
  v_refs   text[];
  v_att    text;
  v_label  text;
  v_input  text := 'text';
  v_canvas public.canvases;
  v_d      public.canvas_drafts;
  v_have   boolean := false;
  v_prev   uuid;
  v_code   text;
  v_msg    public.chat_messages;
  v_run    uuid;
  v_rev    integer;
  v_key    text;
  v_wave   smallint[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = v_uid AND pr.is_verified = true) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'canvas send: a client id is required' USING ERRCODE = '22023';
  END IF;
  IF char_length(COALESCE(v_body, '')) > 4000 THEN
    RAISE EXCEPTION 'canvas send: message too long' USING ERRCODE = '22023';
  END IF;
  IF p_box_refs IS NOT NULL AND cardinality(p_box_refs) > 0 THEN
    IF NOT (p_box_refs <@ public._canvas_box_tags()) THEN
      RAISE EXCEPTION 'canvas send: unknown box tag' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(DISTINCT b ORDER BY b) INTO v_refs FROM unnest(p_box_refs) b;
  END IF;
  IF p_attachment IS NOT NULL THEN
    IF jsonb_typeof(p_attachment) <> 'object' OR COALESCE(p_attachment ->> 'kind', '') NOT IN ('file', 'voice') THEN
      RAISE EXCEPTION 'canvas send: bad attachment' USING ERRCODE = '22023';
    END IF;
    v_att := p_attachment ->> 'kind';
    IF v_att = 'file' THEN
      v_label := NULLIF(left(btrim(COALESCE(p_attachment ->> 'label', '')), 200), '');
      IF v_label IS NULL THEN
        RAISE EXCEPTION 'canvas send: a file needs a label' USING ERRCODE = '22023';
      END IF;
      v_input := 'file';
    ELSE
      IF v_body IS NOT NULL OR COALESCE(p_attachment ->> 'duration_ms', '') !~ '^[0-9]{1,6}$' THEN
        RAISE EXCEPTION 'canvas send: bad voice note' USING ERRCODE = '22023';
      END IF;
      v_input := 'voice';
    END IF;
  ELSIF v_body IS NULL THEN
    RAISE EXCEPTION 'canvas send: empty message' USING ERRCODE = '22023';
  END IF;
  IF p_canvas IS NULL AND (p_from_version IS NOT NULL OR p_expected_draft IS NOT NULL OR COALESCE(p_replace, false)) THEN
    RAISE EXCEPTION 'canvas send: a new canvas has no version or draft' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));
  PERFORM public._canvas_draft_expire(v_uid);

  -- a repeat: the first result (with the draft's CURRENT revision), nothing written
  SELECT r.id INTO v_prev FROM public.canvas_draft_runs r WHERE r.owner_id = v_uid AND r.client_id = p_client_id;
  IF FOUND THEN
    RETURN public._canvas_draft_run_result(v_prev, true);
  END IF;

  IF p_canvas IS NULL THEN
    v_code := public._canvas_draft_busy_code(v_uid, NULL, true);
    IF v_code IS NOT NULL THEN
      RETURN public._canvas_draft_refuse(v_code, NULL);
    END IF;
  ELSE
    SELECT c.* INTO v_canvas FROM public.canvases c WHERE c.id = p_canvas AND c.owner_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
    END IF;
    SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.canvas_id = v_canvas.id AND d.state = 'open' FOR UPDATE;
    IF FOUND THEN
      v_have := true;
      v_code := public._canvas_draft_busy_code(v_uid, v_d.id, true);
      IF v_code IS NOT NULL THEN
        RETURN public._canvas_draft_refuse(v_code, v_d.id);
      END IF;
      IF NOT COALESCE(p_replace, false) AND public._canvas_draft_used_runs(v_d.id) >= c_cap THEN
        RETURN public._canvas_draft_refuse('cap_reached', v_d.id);
      END IF;
      IF p_expected_draft IS DISTINCT FROM v_d.id OR p_expected_revision IS DISTINCT FROM v_d.revision THEN
        RETURN public._canvas_draft_refuse('stale_view', v_d.id);
      END IF;
      IF COALESCE(p_replace, false) THEN
        PERFORM public._canvas_draft_discard_inner(v_d.id);
        v_have := false;
      END IF;
    ELSE
      v_code := public._canvas_draft_busy_code(v_uid, NULL, true);
      IF v_code IS NOT NULL THEN
        RETURN public._canvas_draft_refuse(v_code, NULL);
      END IF;
      IF p_expected_draft IS NOT NULL THEN
        RETURN public._canvas_draft_refuse('stale_view', NULL);    -- the draft the client saw is gone
      END IF;
    END IF;
    -- no draft open and no version named: only a canvas with nothing published yet (a first canvas whose draft was
    -- discarded: "Start over") opens a fresh first draft
    IF NOT v_have AND p_from_version IS NULL
       AND EXISTS (SELECT 1 FROM public.canvas_versions v WHERE v.canvas_id = v_canvas.id AND v.published_at IS NOT NULL) THEN
      RAISE EXCEPTION 'canvas send: no draft is open and no version to start from' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF NOT v_have THEN
    IF (SELECT count(*) FROM public.canvas_drafts d WHERE d.owner_id = v_uid AND d.state = 'open') >= c_max_open THEN
      RAISE EXCEPTION 'too many open drafts' USING ERRCODE = '54000';
    END IF;
    IF p_canvas IS NULL THEN
      v_canvas := public._canvas_draft_new_canvas(v_uid);
    END IF;
    v_d := public._canvas_draft_new(v_uid, v_canvas.id, p_from_version, NULL, NULL);
  END IF;

  -- the owner's message
  IF v_att = 'voice' THEN
    v_key := lower(v_d.conversation_id::text) || '/' || lower(v_uid::text) || '/' || lower(p_client_id::text) || '.wav';
    IF jsonb_typeof(p_attachment -> 'waveform') = 'array' THEN
      v_wave := ARRAY(SELECT x::smallint FROM jsonb_array_elements_text(p_attachment -> 'waveform') x);
    END IF;
    v_msg := public.chat_commit_voice_note(v_uid, v_d.conversation_id, v_key, (p_attachment ->> 'duration_ms')::integer,
                                           v_d.thread_root_id, NULL, p_client_id, v_wave);
    IF v_msg.thread_root_id IS DISTINCT FROM v_d.thread_root_id THEN
      RAISE EXCEPTION 'canvas send: that voice note belongs to another thread' USING ERRCODE = '22023';
    END IF;
    UPDATE public.chat_messages m SET box_refs = v_refs WHERE m.id = v_msg.id;
  ELSE
    INSERT INTO public.chat_messages (conversation_id, author_id, body, thread_root_id, kind, client_id, box_refs, created_at)
    VALUES (v_d.conversation_id, v_uid, COALESCE(v_body, v_label), v_d.thread_root_id, 'message', p_client_id, v_refs, clock_timestamp())
    RETURNING * INTO v_msg;
  END IF;

  UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id RETURNING d.revision INTO v_rev;
  INSERT INTO public.canvas_draft_runs
    (draft_id, owner_id, kind, speed, state, trigger_message_id, scope, client_id, input_kind, created_revision)
  VALUES (v_d.id, v_uid, 'message', 'fast', 'queued', v_msg.id, v_refs, p_client_id, v_input, v_rev)
  RETURNING id INTO v_run;
  RETURN public._canvas_draft_run_result(v_run, false);
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_workspace_send(uuid, uuid, uuid, integer, boolean, text, text[], jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_workspace_send(uuid, uuid, uuid, integer, boolean, text, text[], jsonb, uuid)
  TO authenticated;

-- canvas_draft_retry(p_draft, p_failed_run, p_expected_revision, p_client_id)
-- A new queued run that copies a failed run's kind, trigger message, scope and target offer. The run must be the draft's
-- newest and failed (or capped by the daily AI cap). An upload whose material was never written (the extraction failed,
-- or the client left before posting the file) is not_retryable: the owner sends the file again. An upload whose material
-- was written retries as a text run, because the selector already includes the row through the trigger message.
CREATE OR REPLACE FUNCTION public.canvas_draft_retry(p_draft uuid, p_failed_run uuid, p_expected_revision integer, p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_cap CONSTANT integer := 30;
  v_uid  uuid := auth.uid();
  v_d    public.canvas_drafts;
  v_old  public.canvas_draft_runs;
  v_prev uuid;
  v_code text;
  v_run  uuid;
  v_rev  integer;
  v_in   text;
BEGIN
  PERFORM public._canvas_draft_require_verified(v_uid);
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'canvas retry: a client id is required' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));
  PERFORM public._canvas_draft_expire(v_uid);
  -- a repeat: the first result (with the draft's CURRENT revision), nothing written
  SELECT r.id INTO v_prev FROM public.canvas_draft_runs r WHERE r.owner_id = v_uid AND r.client_id = p_client_id;
  IF FOUND THEN
    RETURN public._canvas_draft_run_result(v_prev, true);
  END IF;
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  IF v_d.state <> 'open' THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  v_code := public._canvas_draft_busy_code(v_uid, v_d.id, true);
  IF v_code IS NOT NULL THEN
    RETURN public._canvas_draft_refuse(v_code, v_d.id);
  END IF;
  IF public._canvas_draft_used_runs(v_d.id) >= c_cap THEN
    RETURN public._canvas_draft_refuse('cap_reached', v_d.id);
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_d.revision THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;

  SELECT r.* INTO v_old FROM public.canvas_draft_runs r WHERE r.id = p_failed_run AND r.draft_id = v_d.id FOR UPDATE;
  IF NOT FOUND OR v_old.state NOT IN ('failed', 'capped') OR v_old.kind NOT IN ('message', 'focus', 'fork_first')
     OR v_old.id IS DISTINCT FROM (SELECT r.id FROM public.canvas_draft_runs r WHERE r.draft_id = v_d.id
                                    ORDER BY r.created_at DESC, r.id DESC LIMIT 1) THEN
    RETURN public._canvas_draft_refuse('not_retryable', v_d.id);
  END IF;
  IF v_old.kind = 'message' THEN
    IF v_old.trigger_message_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id = v_old.trigger_message_id AND m.deleted_at IS NULL) THEN
      RETURN public._canvas_draft_refuse('not_retryable', v_d.id);
    END IF;
    -- a voice note whose transcript failed (or came back blank) has nothing to retry
    IF v_old.input_kind = 'voice' AND EXISTS (
         SELECT 1 FROM public.chat_messages m
          WHERE m.id = v_old.trigger_message_id
            AND (m.transcript_status = 'failed' OR (m.transcript_status = 'done' AND btrim(COALESCE(m.transcript, '')) = ''))) THEN
      RETURN public._canvas_draft_refuse('not_retryable', v_d.id);
    END IF;
    IF v_old.input_kind = 'file' AND NOT EXISTS (
         SELECT 1 FROM public.canvas_draft_material x WHERE x.draft_id = v_d.id AND x.message_id = v_old.trigger_message_id) THEN
      RETURN public._canvas_draft_refuse('not_retryable', v_d.id);
    END IF;
  ELSIF v_old.kind = 'focus' THEN
    IF NOT EXISTS (SELECT 1 FROM public.canvas_draft_offers o
                    WHERE o.id = v_old.target_offer_id AND o.draft_id = v_d.id AND o.state = 'offered') THEN
      RETURN public._canvas_draft_refuse('not_retryable', v_d.id);
    END IF;
  END IF;
  v_in := CASE WHEN v_old.input_kind = 'voice' THEN 'voice' ELSE 'text' END;

  UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id RETURNING d.revision INTO v_rev;
  INSERT INTO public.canvas_draft_runs
    (draft_id, owner_id, kind, speed, state, trigger_message_id, scope, target_offer_id, client_id, input_kind, created_revision)
  VALUES (v_d.id, v_uid, v_old.kind, 'fast', 'queued', v_old.trigger_message_id, v_old.scope, v_old.target_offer_id,
          p_client_id, v_in, v_rev)
  RETURNING id INTO v_run;
  RETURN public._canvas_draft_run_result(v_run, false);
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_retry(uuid, uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_retry(uuid, uuid, integer, uuid) TO authenticated;

-- ============================================================================
-- 7. Client RPCs: the other businesses (focus switch, fork, dismiss)
-- ============================================================================
-- canvas_draft_switch_focus(p_draft, p_offer, p_expected_revision, p_client_id)
-- "Make it about <group>": a queued run of kind 'focus' whose target is the offer. The draft is untouched until the run
-- completes (the target is re-checked then). Refuses: busy, busy_elsewhere, cap_reached, stale_view, not_offered.
CREATE OR REPLACE FUNCTION public.canvas_draft_switch_focus(p_draft uuid, p_offer uuid, p_expected_revision integer, p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_cap CONSTANT integer := 30;
  v_uid  uuid := auth.uid();
  v_d    public.canvas_drafts;
  v_o    public.canvas_draft_offers;
  v_prev uuid;
  v_code text;
  v_run  uuid;
  v_rev  integer;
BEGIN
  PERFORM public._canvas_draft_require_verified(v_uid);
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'canvas focus: a client id is required' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));
  PERFORM public._canvas_draft_expire(v_uid);
  -- a repeat: the first result (with the draft's CURRENT revision), nothing written
  SELECT r.id INTO v_prev FROM public.canvas_draft_runs r WHERE r.owner_id = v_uid AND r.client_id = p_client_id;
  IF FOUND THEN
    RETURN public._canvas_draft_run_result(v_prev, true);
  END IF;
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  IF v_d.state <> 'open' THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  v_code := public._canvas_draft_busy_code(v_uid, v_d.id, true);
  IF v_code IS NOT NULL THEN
    RETURN public._canvas_draft_refuse(v_code, v_d.id);
  END IF;
  IF public._canvas_draft_used_runs(v_d.id) >= c_cap THEN
    RETURN public._canvas_draft_refuse('cap_reached', v_d.id);
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_d.revision THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  SELECT o.* INTO v_o FROM public.canvas_draft_offers o WHERE o.id = p_offer AND o.draft_id = v_d.id FOR UPDATE;
  IF NOT FOUND OR v_o.state <> 'offered' THEN
    RETURN public._canvas_draft_refuse('not_offered', v_d.id);
  END IF;

  UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id RETURNING d.revision INTO v_rev;
  INSERT INTO public.canvas_draft_runs
    (draft_id, owner_id, kind, speed, state, target_offer_id, client_id, input_kind, created_revision)
  VALUES (v_d.id, v_uid, 'focus', 'fast', 'queued', v_o.id, p_client_id, 'text', v_rev)
  RETURNING id INTO v_run;
  RETURN public._canvas_draft_run_result(v_run, false);
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_switch_focus(uuid, uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_switch_focus(uuid, uuid, integer, uuid) TO authenticated;

-- canvas_draft_fork(p_draft, p_offer, p_expected_revision, p_client_id)
-- "Start an <group> canvas": a new canvas, draft and thread, seeded from the source's effective input (the owner's files
-- and links, plus one "Your messages" row holding the owner's done messages; never a failed or undone message, never a
-- forward/clarify copy), with the focus set to the offer's group and a queued 'fork_first' run. The offer becomes
-- `started`. Idempotent per offer: a second tap, or a second tab, returns the canvas already started.
-- Refuses: busy, busy_elsewhere, stale_view, expired (the kept material is past material_until), not_offered.
CREATE OR REPLACE FUNCTION public.canvas_draft_fork(p_draft uuid, p_offer uuid, p_expected_revision integer, p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_open CONSTANT integer := 10;
  c_seed     CONSTANT integer := 12;
  v_n      integer;
  v_all    integer;
  v_listed integer;
  v_locked integer;
  v_slots  integer;
  v_merge  integer;
  v_cons   text;
  v_cons_at timestamptz;
  v_uid    uuid := auth.uid();
  v_src    public.canvas_drafts;
  v_o      public.canvas_draft_offers;
  v_prev   uuid;
  v_code   text;
  v_canvas public.canvases;
  v_new    public.canvas_drafts;
  v_in     jsonb;
  v_rev    integer;
  v_run    uuid;
  v_text   text;
  v_old    public.canvas_drafts;
BEGIN
  PERFORM public._canvas_draft_require_verified(v_uid);
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'canvas fork: a client id is required' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));
  PERFORM public._canvas_draft_expire(v_uid);
  -- a repeat: the first result (with the draft's CURRENT revision), nothing written
  SELECT r.id INTO v_prev FROM public.canvas_draft_runs r WHERE r.owner_id = v_uid AND r.client_id = p_client_id;
  IF FOUND THEN
    -- a replay with the ORIGINAL client id: the first result while its draft is still open; once that draft has closed
    -- (published or discarded) it answers like a second tap, never a closed draft shown as if it were open
    SELECT d.* INTO v_old FROM public.canvas_drafts d JOIN public.canvas_draft_runs r ON r.draft_id = d.id WHERE r.id = v_prev;
    IF v_old.state = 'open' THEN
      RETURN public._canvas_draft_run_result(v_prev, true);
    END IF;
    RETURN public._canvas_draft_started_result(v_old.canvas_id, v_uid);
  END IF;
  SELECT d.* INTO v_src FROM public.canvas_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  SELECT o.* INTO v_o FROM public.canvas_draft_offers o WHERE o.id = p_offer AND o.draft_id = v_src.id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public._canvas_draft_refuse('not_offered', v_src.id);
  END IF;

  -- a second tap, or a second tab: the canvas that offer already started, never a second fork
  IF v_o.state = 'started' AND v_o.started_canvas_id IS NOT NULL THEN
    RETURN public._canvas_draft_started_result(v_o.started_canvas_id, v_uid);
  END IF;

  v_code := public._canvas_draft_busy_code(v_uid, v_src.id, true);
  IF v_code IS NOT NULL THEN
    RETURN public._canvas_draft_refuse(v_code, v_src.id);
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_src.revision THEN
    RETURN public._canvas_draft_refuse('stale_view', v_src.id);
  END IF;
  IF v_src.state = 'discarded' THEN
    RETURN public._canvas_draft_refuse('not_offered', v_src.id);
  END IF;
  IF v_src.state = 'published' AND v_src.material_until IS NOT NULL AND v_src.material_until < now() THEN
    RETURN public._canvas_draft_refuse('expired', v_src.id);
  END IF;
  IF v_o.state <> 'offered' THEN
    RETURN public._canvas_draft_refuse('not_offered', v_src.id);
  END IF;
  IF (SELECT count(*) FROM public.canvas_drafts d WHERE d.owner_id = v_uid AND d.state = 'open') >= c_max_open THEN
    RAISE EXCEPTION 'too many open drafts' USING ERRCODE = '54000';
  END IF;

  -- FIRST the source's COMPLETE material set is share-locked, every row of the draft, in id order, in one statement. Settlement at the end of
  -- this function (the last offer started) locks all of the source's material, and the expiry job locks every expired row in id order: a
  -- lock on only the selected rows would let the job take an excluded row that sorts earlier and then wait for a selected one while
  -- this transaction waits for the excluded one. With the whole set held here, the job waits for all of it, and the later FOR UPDATE of
  -- settlement is an upgrade of rows this transaction already holds.
  SELECT count(*) INTO v_all FROM (
    SELECT m.id FROM public.canvas_draft_material m WHERE m.draft_id = v_src.id ORDER BY m.id FOR SHARE) a;
  -- the seed: the source's effective input through the one selector, and its material rows LOCKED (FOR SHARE, in id order) in the
  -- statement that lists them, BEFORE anything is written. The hourly expiry deletes without an owner lock, so without this a
  -- delete could commit between the listing, the count and the copy (READ COMMITTED) and the fork would succeed with files
  -- missing. With the share locks the delete waits for this transaction (it locks in the same id order, so the two cannot cross);
  -- and a row it already deleted is skipped by the lock, so the locked count falls short of the listed one and the fork is refused
  -- 'expired', having written nothing.
  v_in := public._canvas_draft_effective_input(v_src.id, NULL);
  v_listed := jsonb_array_length(COALESCE(v_in -> 'material_ids', '[]'::jsonb));
  SELECT count(*) INTO v_locked FROM (
    SELECT m.id FROM public.canvas_draft_material m
     WHERE m.id IN (SELECT jsonb_array_elements_text(v_in -> 'material_ids')::uuid)
     ORDER BY m.id FOR SHARE) l;
  IF v_locked <> v_listed
     OR (v_src.state = 'published' AND v_src.material_until IS NOT NULL AND v_src.material_until < clock_timestamp()) THEN
    RETURN public._canvas_draft_refuse('expired', v_src.id);
  END IF;

  v_canvas := public._canvas_draft_new_canvas(v_uid);
  v_new := public._canvas_draft_new(v_uid, v_canvas.id, NULL, v_src.id, v_o.group_label);

  -- the seed: the source's effective input through the one selector. The owner's files and links are copied as seed
  -- rows; the owner's done messages become ONE "Your messages" row. Forward/clarify copies never cross.
  -- Seed rows have their own cap (c_seed): when the candidates would not fit, the OLDEST are consolidated into one
  -- "Earlier material" row, so a fork (and a fork of a fork) never carries more than c_seed seed rows.
  SELECT count(*) INTO v_n FROM public.canvas_draft_material m
   WHERE m.id IN (SELECT jsonb_array_elements_text(v_in -> 'material_ids')::uuid);
  SELECT string_agg(COALESCE(NULLIF(btrim(COALESCE(t.body, '')), ''), t.transcript), E'\n\n' ORDER BY t.created_at, t.id)
    INTO v_text
    FROM public.chat_messages t
   WHERE t.id IN (SELECT jsonb_array_elements_text(v_in -> 'message_ids')::uuid)
     AND NULLIF(btrim(COALESCE(NULLIF(btrim(COALESCE(t.body, '')), ''), t.transcript, '')), '') IS NOT NULL;
  v_slots := c_seed - CASE WHEN v_text IS NOT NULL THEN 1 ELSE 0 END;
  v_merge := CASE WHEN v_n > v_slots THEN v_n - v_slots + 1 ELSE 0 END;      -- how many of the oldest rows are consolidated
  -- every seed row keeps the CREATED_AT of the row it copies (all rows of one transaction would otherwise share now()), so
  -- the order stays chronological across generations and "the oldest" always means the oldest
  INSERT INTO public.canvas_draft_material (draft_id, owner_id, kind, label, text, chars, origin, source_material_id, created_at)
  SELECT v_new.id, v_uid, x.kind, x.label, x.text, x.chars, 'fork_seed', x.id, x.created_at
    FROM (SELECT m.*, row_number() OVER (ORDER BY m.created_at, m.id) AS rn
            FROM public.canvas_draft_material m
           WHERE m.id IN (SELECT jsonb_array_elements_text(v_in -> 'material_ids')::uuid)) x
   WHERE x.rn > v_merge
   ORDER BY x.rn;
  IF v_merge > 0 THEN
    SELECT left(string_agg('=== ' || x.label || E' ===\n' || x.text, E'\n\n' ORDER BY x.rn), 200000), min(x.created_at) INTO v_cons, v_cons_at
      FROM (SELECT m.*, row_number() OVER (ORDER BY m.created_at, m.id) AS rn
              FROM public.canvas_draft_material m
             WHERE m.id IN (SELECT jsonb_array_elements_text(v_in -> 'material_ids')::uuid)) x
     WHERE x.rn <= v_merge;
    IF NULLIF(v_cons, '') IS NOT NULL THEN      -- an empty consolidation is skipped, never inserted as NULL
      INSERT INTO public.canvas_draft_material (draft_id, owner_id, kind, label, text, chars, origin, created_at)
      VALUES (v_new.id, v_uid, 'messages', 'Earlier material', v_cons, char_length(v_cons), 'fork_seed', v_cons_at);
    END IF;
  END IF;
  IF v_text IS NOT NULL THEN
    v_text := left(v_text, 200000);
    INSERT INTO public.canvas_draft_material (draft_id, owner_id, kind, label, text, chars, origin)
    VALUES (v_new.id, v_uid, 'messages', 'Your messages', v_text, char_length(v_text), 'fork_seed');
  END IF;

  UPDATE public.canvas_draft_offers o SET state = 'started', started_canvas_id = v_canvas.id WHERE o.id = v_o.id;
  UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_src.id;
  PERFORM public._canvas_draft_offers_settled(v_src.id);

  UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_new.id RETURNING d.revision INTO v_rev;
  INSERT INTO public.canvas_draft_runs
    (draft_id, owner_id, kind, speed, state, target_offer_id, client_id, input_kind, created_revision)
  VALUES (v_new.id, v_uid, 'fork_first', 'fast', 'queued', v_o.id, p_client_id, 'text', v_rev)
  RETURNING id INTO v_run;
  RETURN public._canvas_draft_run_result(v_run, false);
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_fork(uuid, uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_fork(uuid, uuid, integer, uuid) TO authenticated;

-- canvas_draft_offer_dismiss(p_draft, p_offer, p_expected_revision)
-- The small "x" on an offer row: the offer becomes `dismissed` and the revision moves. A repeat on a dismissed offer
-- returns ok and writes nothing. When it was the last `offered` offer of a closed draft, that draft's kept material is
-- deleted in the same transaction. Refuses: busy, busy_elsewhere, stale_view (also when the offer is no longer offered).
CREATE OR REPLACE FUNCTION public.canvas_draft_offer_dismiss(p_draft uuid, p_offer uuid, p_expected_revision integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_d    public.canvas_drafts;
  v_o    public.canvas_draft_offers;
  v_code text;
  v_rev  integer;
BEGIN
  PERFORM public._canvas_draft_require_verified(v_uid);
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));
  PERFORM public._canvas_draft_expire(v_uid);
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  SELECT o.* INTO v_o FROM public.canvas_draft_offers o WHERE o.id = p_offer AND o.draft_id = v_d.id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  IF v_o.state = 'dismissed' THEN
    RETURN jsonb_build_object('status', 'ok', 'repeated', true, 'revision', v_d.revision);
  END IF;
  v_code := public._canvas_draft_busy_code(v_uid, v_d.id, true);
  IF v_code IS NOT NULL THEN
    RETURN public._canvas_draft_refuse(v_code, v_d.id);
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_d.revision OR v_o.state <> 'offered' THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  UPDATE public.canvas_draft_offers o SET state = 'dismissed' WHERE o.id = v_o.id;
  UPDATE public.canvas_drafts d SET revision = d.revision + 1 WHERE d.id = v_d.id RETURNING d.revision INTO v_rev;
  PERFORM public._canvas_draft_offers_settled(v_d.id);
  RETURN jsonb_build_object('status', 'ok', 'revision', v_rev);
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_offer_dismiss(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_offer_dismiss(uuid, uuid, integer) TO authenticated;

-- ============================================================================
-- 8. Client RPCs: Undo, Publish, Discard and the state read
-- ============================================================================
-- canvas_draft_undo(p_draft, p_expected_run, p_expected_revision)
-- Restores the draft to the state before the newest APPLIED run (a done run that has a step): its point set, questions,
-- pending links and focus. The run's still-`offered` new offers go; a started or dismissed offer is never changed. For a
-- focus switch the target goes back to `offered` and the previous focus back to `focused`. The run's reply is rewritten
-- to "Undone." and the run becomes `undone`; its step is deleted. Points the run made stay in the ledger until Publish or
-- Discard. There is no redo. Refuses: busy, stale_view (a stale run id or revision changes nothing).
CREATE OR REPLACE FUNCTION public.canvas_draft_undo(p_draft uuid, p_expected_run uuid, p_expected_revision integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_d    public.canvas_drafts;
  v_run  public.canvas_draft_runs;
  v_step public.canvas_draft_steps;
  v_tag  text;
  v_cur  uuid[];
  v_code text;
  v_rev  integer;
  v_next uuid;
BEGIN
  PERFORM public._canvas_draft_require_verified(v_uid);
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));
  PERFORM public._canvas_draft_expire(v_uid);
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  IF v_d.state <> 'open' THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  v_code := public._canvas_draft_busy_code(v_uid, v_d.id, false);
  IF v_code IS NOT NULL THEN
    RETURN public._canvas_draft_refuse(v_code, v_d.id);
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_d.revision THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  SELECT r.* INTO v_run
    FROM public.canvas_draft_runs r JOIN public.canvas_draft_steps s ON s.run_id = r.id
   WHERE r.draft_id = v_d.id AND r.state = 'done'
   ORDER BY r.finished_at DESC, r.created_at DESC, r.id DESC LIMIT 1
   FOR UPDATE OF r;
  IF NOT FOUND OR v_run.id IS DISTINCT FROM p_expected_run THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  SELECT s.* INTO v_step FROM public.canvas_draft_steps s WHERE s.run_id = v_run.id;

  v_tag := 'canvas_' || v_d.version_name;
  v_cur := public._canvas_draft_point_ids(v_d.id);
  PERFORM set_config('p1536.keep_updated_at', 'on', true);
  UPDATE public.points p SET system_tags = array_remove(p.system_tags, v_tag)
   WHERE p.id = ANY (v_cur) AND NOT (p.id = ANY (v_step.point_ids));
  UPDATE public.points p SET system_tags = array_append(p.system_tags, v_tag)
   WHERE p.id = ANY (v_step.point_ids) AND p.first_validator_id = v_d.owner_id
     AND NOT (p.system_tags @> ARRAY[v_tag]::text[]);
  PERFORM set_config('p1536.keep_updated_at', 'off', true);

  -- offers: this run's new offers go if still offered; a focus switch is reversed; started/dismissed never change
  DELETE FROM public.canvas_draft_offers o
   WHERE o.draft_id = v_d.id AND o.id = ANY (v_step.new_offer_ids) AND o.state = 'offered';
  IF v_run.kind = 'focus' THEN
    UPDATE public.canvas_draft_offers o SET state = 'offered' WHERE o.id = v_run.target_offer_id AND o.state = 'focused';
    IF v_step.focus IS NOT NULL THEN
      UPDATE public.canvas_draft_offers o SET state = 'focused'
       WHERE o.draft_id = v_d.id AND o.state = 'offered' AND o.id IS DISTINCT FROM v_run.target_offer_id
         AND public._canvas_offer_key(o.group_label) = public._canvas_offer_key(v_step.focus)
         AND NOT (o.id = ANY (v_step.new_offer_ids));
    END IF;
  END IF;

  UPDATE public.canvas_drafts d
     SET pending_links = v_step.pending_links, questions = v_step.questions, focus = v_step.focus,
         revision = d.revision + 1
   WHERE d.id = v_d.id RETURNING d.revision INTO v_rev;
  IF v_run.reply_message_id IS NOT NULL THEN
    UPDATE public.chat_messages m SET body = 'Undone.' WHERE m.id = v_run.reply_message_id AND m.deleted_at IS NULL;
  END IF;
  UPDATE public.canvas_draft_runs r SET state = 'undone' WHERE r.id = v_run.id;
  DELETE FROM public.canvas_draft_steps s WHERE s.run_id = v_run.id;

  SELECT r.id INTO v_next
    FROM public.canvas_draft_runs r JOIN public.canvas_draft_steps s ON s.run_id = r.id
   WHERE r.draft_id = v_d.id AND r.state = 'done'
   ORDER BY r.finished_at DESC, r.created_at DESC, r.id DESC LIMIT 1;
  RETURN jsonb_build_object('status', 'ok', 'revision', v_rev, 'undone_run_id', v_run.id, 'next_undo_run_id', v_next);
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_undo(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_undo(uuid, uuid, integer) TO authenticated;

-- canvas_draft_publish(p_draft, p_expected_revision)
-- Publishes the draft as the next numbered version. The server refuses an empty draft (draft_empty) and a draft with no
-- difference from its base (no_changes) even when called directly. Under the per-owner lock it applies each pending
-- supersede link only if the old point is still a head of this canvas, records the version's origin (from_seq), cleans
-- the ledger (every point the draft made that no version tags, and the engine's stories of those), deletes the steps,
-- applies the retention rule (no open offer: the extracted text is deleted now; otherwise it is kept until
-- published_at + 30 days - 1 hour) and posts the publish reply. Publish while the newest run failed is allowed: that
-- message is not part of the version. Refuses: busy, stale_view, draft_empty, no_changes.
CREATE OR REPLACE FUNCTION public.canvas_draft_publish(p_draft uuid, p_expected_revision integer)
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
  v_from    integer;
  v_code    text;
  v_pts     uuid[];
  v_offers  text;
  v_n_off   integer;
  v_refs    text[];
  v_clean   jsonb;
  v_body    text;
  v_reply   uuid;
  v_until   timestamptz;
BEGIN
  PERFORM public._canvas_draft_require_verified(v_uid);
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));
  PERFORM public._canvas_draft_expire(v_uid);
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  IF v_d.state <> 'open' THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  v_code := public._canvas_draft_busy_code(v_uid, v_d.id, false);
  IF v_code IS NOT NULL THEN
    RETURN public._canvas_draft_refuse(v_code, v_d.id);
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_d.revision THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;

  v_tag := 'canvas_' || v_d.version_name;
  v_pts := public._canvas_draft_point_ids(v_d.id);
  IF cardinality(v_pts) = 0 THEN
    RETURN public._canvas_draft_refuse('draft_empty', v_d.id);
  END IF;
  IF v_d.base_version_id IS NOT NULL THEN
    SELECT v.published_seq INTO v_from FROM public.canvas_versions v WHERE v.id = v_d.base_version_id;
    -- one definition of "differs from its base": at least one box whose point set differs (_canvas_draft_changed_boxes)
    IF cardinality(public._canvas_draft_changed_boxes(v_d.id)) = 0 THEN
      RETURN public._canvas_draft_refuse('no_changes', v_d.id);
    END IF;
  END IF;

  FOR v_link IN SELECT e FROM jsonb_array_elements(v_d.pending_links) e LOOP
    v_old := (v_link ->> 'old')::uuid;
    v_new := (v_link ->> 'new')::uuid;
    v_why := left(COALESCE(v_link ->> 'why', ''), 200);
    BEGIN
      IF v_old IS NULL OR v_new IS NULL OR v_old = v_new THEN
        RAISE EXCEPTION 'bad link' USING ERRCODE = 'check_violation';
      END IF;
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
      -- the supersede link IS the version chain, but linking must not make the OLD point look edited: the older version's
      -- output stays byte-identical except `superseded_by` on exactly the points this version reworded or moved (S1.7)
      PERFORM set_config('p1536.keep_updated_at', 'on', true);
      UPDATE public.points o SET superseded_by = v_new WHERE o.id = v_old;
      PERFORM set_config('p1536.keep_updated_at', 'off', true);
    EXCEPTION WHEN check_violation OR foreign_key_violation THEN
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('old', v_old, 'new', v_new, 'why', v_why));
    END;
  END LOOP;

  v_seq := public._canvas_next_version_seq(v_d.canvas_id);
  UPDATE public.canvas_versions v
     SET published_at = now(), published_seq = v_seq, from_seq = v_from
   WHERE v.id = v_d.version_id;

  -- the ledger: the draft's tag now names a PUBLISHED version, so a point made by this draft survives iff it is tagged
  v_clean := public._canvas_draft_cleanup_ledger(v_d.id);
  DELETE FROM public.canvas_draft_steps s WHERE s.draft_id = v_d.id;

  -- retention (D16): open offers keep the extracted text until published_at + 30 days - 1 hour
  SELECT count(*), string_agg(o.group_label, ', ' ORDER BY o.created_at, o.id) INTO v_n_off, v_offers
    FROM public.canvas_draft_offers o WHERE o.draft_id = v_d.id AND o.state = 'offered';
  IF v_n_off > 0 THEN
    v_until := now() + interval '719 hours';          -- 30 days minus an hour, without a calendar (DST-proof)
  ELSE
    WITH x AS (SELECT m.id FROM public.canvas_draft_material m WHERE m.draft_id = v_d.id ORDER BY m.id FOR UPDATE)
    DELETE FROM public.canvas_draft_material m USING x WHERE m.id = x.id;
    v_until := NULL;
  END IF;
  UPDATE public.canvas_drafts d
     SET state = 'published', closed_at = now(), skipped_links = v_skipped, revision = d.revision + 1, material_until = v_until
   WHERE d.id = v_d.id;

  -- the publish reply (D17): says what happened to the material. The offers render from get_canvas_draft_state.
  SELECT array_remove(array_agg(DISTINCT u.ref), NULL) INTO v_refs
    FROM public.canvas_draft_runs r, LATERAL unnest(COALESCE(r.derived_refs, '{}')) AS u(ref)
   WHERE r.draft_id = v_d.id AND r.state IN ('done', 'undone');
  v_body := CASE WHEN v_n_off > 0
    THEN 'Published v' || v_seq || '. Your material also covers ' || v_offers
         || '. I keep the text of your uploads for this until you start it or for 30 days, then delete it.'
    ELSE 'Published v' || v_seq || '. I deleted the text of your uploads; the canvas keeps what I drew from them.' END;
  v_reply := public._canvas_draft_post_reply(v_d.conversation_id, v_d.thread_root_id, v_body, v_refs, NULL);
  RETURN jsonb_build_object(
    'status', 'ok', 'seq', v_seq, 'from_seq', v_from, 'skipped_links', jsonb_array_length(v_skipped),
    'revision', v_d.revision + 1, 'open_offers', v_n_off, 'material_until', v_until, 'reply_message_id', v_reply,
    'cleanup', v_clean);
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_publish(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_publish(uuid, integer) TO authenticated;

-- canvas_draft_discard(p_draft, p_expected_revision)
-- Discards the open draft: the tag leaves the points it holds, the points and engine stories it made are deleted (the
-- ledger), and the steps, offers and extracted text go. Refuses: busy, stale_view.
CREATE OR REPLACE FUNCTION public.canvas_draft_discard(p_draft uuid, p_expected_revision integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_d     public.canvas_drafts;
  v_code  text;
  v_clean jsonb;
BEGIN
  PERFORM public._canvas_draft_require_verified(v_uid);
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));
  PERFORM public._canvas_draft_expire(v_uid);
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft AND d.owner_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  IF v_d.state <> 'open' THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  v_code := public._canvas_draft_busy_code(v_uid, v_d.id, false);
  IF v_code IS NOT NULL THEN
    RETURN public._canvas_draft_refuse(v_code, v_d.id);
  END IF;
  IF p_expected_revision IS DISTINCT FROM v_d.revision THEN
    RETURN public._canvas_draft_refuse('stale_view', v_d.id);
  END IF;
  v_clean := public._canvas_draft_discard_inner(v_d.id);
  RETURN jsonb_build_object('status', 'ok', 'cleanup', v_clean);
END;
$$;
REVOKE ALL ON FUNCTION public.canvas_draft_discard(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canvas_draft_discard(uuid, integer) TO authenticated;

-- get_canvas_draft_state(p_canvas)
-- The owner's one read of a canvas's drafting state. It runs the expire step first, so a stale run never shows as
-- "Updating...". Returns {canvas_id, canvas_name, draft, closed_draft}:
--   draft         the open draft (revision, focus, base_seq, used_runs, cap, has_points, differs_from_base,
--                 changed_boxes, questions, active_run, active_elsewhere, undo_run_id, runs, offers, material), or null
--   closed_draft  the newest PUBLISHED draft: its offers and material_expired (material_until has passed while an offer
--                 is still offered), or null. A discarded draft keeps no offers.
-- Offers are read here, never from message text.
CREATE OR REPLACE FUNCTION public.get_canvas_draft_state(p_canvas uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_canvas public.canvases;
  v_d      public.canvas_drafts;
  v_c      public.canvas_drafts;
  v_draft  jsonb := NULL;
  v_closed jsonb := NULL;
  v_pts    uuid[];
  v_base   integer;
  v_closed_all jsonb;
  v_active public.canvas_draft_runs;
BEGIN
  PERFORM public._canvas_draft_require_verified(v_uid);
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_uid::text, 0));
  SELECT c.* INTO v_canvas FROM public.canvases c WHERE c.id = p_canvas AND c.owner_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  PERFORM public._canvas_draft_expire(v_uid);

  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.canvas_id = v_canvas.id AND d.state = 'open';
  IF FOUND THEN
    v_pts := public._canvas_draft_point_ids(v_d.id);
    IF v_d.base_version_id IS NOT NULL THEN
      SELECT v.published_seq INTO v_base FROM public.canvas_versions v WHERE v.id = v_d.base_version_id;
    END IF;
    SELECT r.* INTO v_active FROM public.canvas_draft_runs r
     WHERE r.owner_id = v_uid AND r.draft_id = v_d.id AND r.state IN ('queued', 'running') LIMIT 1;
    v_draft := jsonb_build_object(
      'id', v_d.id, 'revision', v_d.revision, 'version_name', v_d.version_name, 'focus', v_d.focus,
      'base_version_id', v_d.base_version_id, 'base_seq', v_base,
      'thread_root_id', v_d.thread_root_id, 'conversation_id', v_d.conversation_id,
      'used_runs', public._canvas_draft_used_runs(v_d.id), 'cap', 30,
      'has_points', cardinality(v_pts) > 0,
      -- the same definition Publish enforces (no_changes): at least one box whose point set differs from the base's
      'differs_from_base', CASE WHEN v_d.base_version_id IS NULL THEN cardinality(v_pts) > 0
                                ELSE cardinality(public._canvas_draft_changed_boxes(v_d.id)) > 0 END,
      'changed_boxes', to_jsonb(public._canvas_draft_changed_boxes(v_d.id)),
      'questions', v_d.questions,
      'active_run', CASE WHEN v_active.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', v_active.id, 'kind', v_active.kind, 'state', v_active.state, 'input_kind', v_active.input_kind,
          'trigger_message_id', v_active.trigger_message_id, 'created_at', v_active.created_at, 'started_at', v_active.started_at) END,
      'active_elsewhere', v_active.id IS NULL AND EXISTS (
          SELECT 1 FROM public.canvas_draft_runs r WHERE r.owner_id = v_uid AND r.state IN ('queued', 'running')),
      'undo_run_id', (SELECT r.id FROM public.canvas_draft_runs r JOIN public.canvas_draft_steps s ON s.run_id = r.id
                       WHERE r.draft_id = v_d.id AND r.state = 'done'
                       ORDER BY r.finished_at DESC, r.created_at DESC, r.id DESC LIMIT 1),
      'runs', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id', x.id, 'kind', x.kind, 'state', x.state, 'input_kind', x.input_kind, 'error_code', x.error_code,
                  'trigger_message_id', x.trigger_message_id, 'reply_message_id', x.reply_message_id, 'scope', to_jsonb(x.scope),
                  'target_offer_id', x.target_offer_id, 'created_at', x.created_at, 'finished_at', x.finished_at)
                  ORDER BY x.created_at, x.id)
                FROM (SELECT * FROM public.canvas_draft_runs r WHERE r.draft_id = v_d.id
                       ORDER BY r.created_at DESC, r.id DESC LIMIT 60) x), '[]'::jsonb),
      'offers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id', o.id, 'group_label', o.group_label, 'why', o.why, 'state', o.state, 'started_canvas_id', o.started_canvas_id)
                  ORDER BY o.created_at, o.id) FROM public.canvas_draft_offers o WHERE o.draft_id = v_d.id), '[]'::jsonb),
      'material', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id', m.id, 'message_id', m.message_id, 'origin', m.origin, 'kind', m.kind, 'label', m.label, 'chars', m.chars)
                  ORDER BY m.created_at, m.id) FROM public.canvas_draft_material m WHERE m.draft_id = v_d.id), '[]'::jsonb));
  END IF;

  SELECT d.* INTO v_c FROM public.canvas_drafts d
   WHERE d.canvas_id = v_canvas.id AND d.state = 'published' ORDER BY d.closed_at DESC, d.created_at DESC LIMIT 1;
  IF FOUND THEN
    v_closed := jsonb_build_object(
      'id', v_c.id, 'revision', v_c.revision, 'version_name', v_c.version_name,
      'published_seq', (SELECT v.published_seq FROM public.canvas_versions v WHERE v.id = v_c.version_id),
      'thread_root_id', v_c.thread_root_id, 'conversation_id', v_c.conversation_id,
      'material_until', v_c.material_until,
      'material_expired', public._canvas_draft_material_expired(v_c.id),
      'offers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id', o.id, 'group_label', o.group_label, 'why', o.why, 'state', o.state, 'started_canvas_id', o.started_canvas_id)
                  ORDER BY o.created_at, o.id) FROM public.canvas_draft_offers o WHERE o.draft_id = v_c.id), '[]'::jsonb));
  END IF;

  -- EVERY published draft of the canvas that still has an offered OR a started offer (not only the newest): an offered one
  -- can be started or dismissed, a started one keeps started_canvas_id so the client can show Open; material_expired says
  -- whether its kept material is gone
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', c.id, 'revision', c.revision, 'version_name', c.version_name,
           'published_seq', (SELECT v.published_seq FROM public.canvas_versions v WHERE v.id = c.version_id),
           'thread_root_id', c.thread_root_id, 'conversation_id', c.conversation_id, 'material_until', c.material_until,
           'material_expired', public._canvas_draft_material_expired(c.id),
           'offers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                       'id', o.id, 'group_label', o.group_label, 'why', o.why, 'state', o.state, 'started_canvas_id', o.started_canvas_id)
                       ORDER BY o.created_at, o.id) FROM public.canvas_draft_offers o WHERE o.draft_id = c.id), '[]'::jsonb))
           ORDER BY c.closed_at, c.id), '[]'::jsonb)
    INTO v_closed_all
    FROM public.canvas_drafts c
   WHERE c.canvas_id = v_canvas.id AND c.state = 'published'
     AND EXISTS (SELECT 1 FROM public.canvas_draft_offers o WHERE o.draft_id = c.id AND o.state IN ('offered', 'started'));

  RETURN jsonb_build_object('canvas_id', v_canvas.id, 'canvas_name', v_canvas.name, 'draft', v_draft,
                            'closed_draft', v_closed, 'closed_drafts', v_closed_all);
END;
$$;
REVOKE ALL ON FUNCTION public.get_canvas_draft_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_canvas_draft_state(uuid) TO authenticated;

-- ============================================================================
-- 9. The hourly material expiry
-- ============================================================================
-- Expiry is enforced by TIME on every read and every fork (material_until < now()). This job only deletes the rows, so
-- physical deletion happens within 30 days whenever pg_cron runs on schedule; a missed run leaves the rows unreadable
-- (time-enforced) until the next run deletes them.
CREATE OR REPLACE FUNCTION public._canvas_draft_material_expire()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n integer;
BEGIN
  -- ONE statement, no advisory lock. The rows it deletes are already unreadable by time: every reader of the extracted text either
  -- is an open draft (no expiry), or checks material_until < now() first (the fork refuses 'expired'; the offers settlement and the
  -- state read compare material_until too), and the one direct read, the owner's list of labels and sizes, never carries the text.
  -- So the job needs no owner lock, and it can never be pushed past the 30 days by a busy owner (material_until is 719 hours after
  -- Publish; the hourly run deletes within the next hour). A fork never copies a partial set: it share-locks the source's rows first
  -- and refuses 'expired' if any listed row is gone or the time has passed.
  -- The rows are locked first, in id order (a fork locks the same rows FOR SHARE in the same order), so this statement waits for a
  -- fork that is copying them and cannot cross with it; it holds no lock but these row locks.
  WITH doomed AS (
    SELECT m.id FROM public.canvas_draft_material m
      JOIN public.canvas_drafts d ON d.id = m.draft_id
     WHERE d.state = 'published' AND d.material_until IS NOT NULL AND d.material_until < now()
     ORDER BY m.id FOR UPDATE OF m)
  DELETE FROM public.canvas_draft_material m USING doomed WHERE m.id = doomed.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_material_expire() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_material_expire() TO service_role;

-- ----------------------------------------------------------------------------
-- The global stale-run sweep. _canvas_draft_expire runs lazily, per owner, when that owner calls an RPC; if the edge isolate
-- died after the claim and the owner never returns, the run stays 'running' (its spend reserved) forever. This sweep, run by the
-- hourly job, does the SAME per-run work for every owner that has a queued or running run past its lease, by calling
-- _canvas_draft_expire for that owner (so the settle logic exists once: the reservation is settled at its full amount, the run is
-- failed 'abandoned', a v6 run moves the revision). Each owner's engine lock is only TRIED: a busy owner is active by definition
-- and its own next RPC expires its runs, and a try never waits while this transaction holds the locks of the owners done before.
-- Returns how many runs it failed.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._canvas_draft_expire_all()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_o record;
  n   integer := 0;
BEGIN
  FOR v_o IN
    SELECT DISTINCT r.owner_id
      FROM public.canvas_draft_runs r
     WHERE (r.state = 'running' AND COALESCE(r.started_at, r.created_at) < now() - interval '5 minutes')
        OR (r.state = 'queued' AND r.created_at < now() - interval '3 minutes')
     ORDER BY r.owner_id
  LOOP
    CONTINUE WHEN NOT pg_try_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_o.owner_id::text, 0));
    n := n + public._canvas_draft_expire(v_o.owner_id);
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_expire_all() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_expire_all() TO service_role;

DO $p1536_cron$
BEGIN
  IF coalesce(current_setting('shared_preload_libraries', true), '') !~ '\mpg_cron\M' THEN
    RAISE WARNING USING MESSAGE =
      'P1536: pg_cron is not in shared_preload_libraries on this server, so no cron job can exist here: skipping '
      'canvas_draft_material_expire. Expired material stays unreadable (expiry is enforced by time) but is not deleted.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    EXECUTE 'CREATE EXTENSION pg_cron';
  END IF;
  PERFORM cron.unschedule('canvas_draft_material_expire')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'canvas_draft_material_expire');
  PERFORM cron.schedule('canvas_draft_material_expire', '5 * * * *', $job$ SELECT public._canvas_draft_material_expire(); SELECT public._canvas_draft_expire_all(); $job$);
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'canvas_draft_material_expire' AND active) THEN
    RAISE EXCEPTION USING MESSAGE =
      'P1536: pg_cron accepted the scheduling call but cron.job holds no active row for canvas_draft_material_expire: '
      'refusing to record this migration as applied.';
  END IF;
END;
$p1536_cron$;

-- ============================================================================
-- 10. The earlier P1536 functions, made safe against a v6 draft
-- ============================================================================
-- Each body below is its LATEST previous body plus ONE guard (pinned by src/tests/p1536-v6-engine-migration.test.ts): a draft
-- that belongs to the v6 engine (_canvas_draft_is_v6: it has had a revision, or a run of a v6 kind) is refused by the
-- legacy publish, discard, begin and 6-argument complete, so an old client or edge function can never run the old
-- clear-and-reinsert write over a v6 draft. A legacy draft (revision 0, old run kinds only) keeps working through them.
-- canvas_draft_publish(uuid): previous body (see the diffed-against list) plus the v6 guard
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
  IF public._canvas_draft_is_v6(v_d.id) THEN
    RAISE EXCEPTION 'canvas draft: this draft belongs to the v6 engine; use canvas_draft_publish(draft, expected revision)' USING ERRCODE = '55000';
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

-- canvas_draft_discard(uuid): previous body (see the diffed-against list) plus the v6 guard
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
  IF public._canvas_draft_is_v6(v_d.id) THEN
    RAISE EXCEPTION 'canvas draft: this draft belongs to the v6 engine; use canvas_draft_discard(draft, expected revision)' USING ERRCODE = '55000';
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

-- _canvas_draft_run_begin(uuid, uuid, text, text): previous body (see the diffed-against list) plus the v6 guard
CREATE OR REPLACE FUNCTION public._canvas_draft_run_begin(p_owner uuid, p_draft uuid, p_kind text, p_speed text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_chars     CONSTANT integer := 150000;
  c_rows      CONSTANT integer := 500;
  c_dead      CONSTANT interval := interval '5 minutes';
  c_revisions CONSTANT integer := 5;
  v_d       public.canvas_drafts;
  v_canvas  public.canvases;
  v_dver    text;
  v_base    public.canvas_versions;
  v_lim     jsonb := public._mirror_limits();
  v_max     numeric;
  v_spend   uuid;
  v_run     uuid;
  v_ids     uuid[] := '{}';
  v_locked  uuid[];
  v_refs    text[];
  v_thread  jsonb := '[]'::jsonb;
  v_names   text[] := '{}';
  v_basepts jsonb := '[]'::jsonb;
  v_draftpts jsonb := '[]'::jsonb;
  v_material jsonb := '[]'::jsonb;
  v_first   text;
  v_full    text;
  v_slug    text;
  v_ref     text := public._chat_author_ref(p_owner);
  v_boxes   text[] := public._canvas_box_tags();
  v_dtag    text;
  v_btag    text;
BEGIN
  IF p_owner IS NULL OR p_draft IS NULL OR p_kind IS NULL OR p_kind NOT IN ('tensions', 'draft', 'extract')
     OR p_speed IS NULL OR p_speed NOT IN ('fast', 'slow') THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  -- LOCK ORDER everywhere in this file: the per-owner lock, then the draft row, then the run row.
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || p_owner::text, 0));
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = p_draft AND d.owner_id = p_owner FOR UPDATE;
  IF NOT FOUND OR v_d.state <> 'open' THEN
    RETURN jsonb_build_object('status', 'denied');
  END IF;
  IF public._canvas_draft_is_v6(v_d.id) THEN
    RAISE EXCEPTION 'canvas draft: this draft belongs to the v6 engine; use _canvas_draft_run_begin(run, owner)' USING ERRCODE = '55000';
  END IF;
  IF p_kind = 'tensions' AND v_d.base_version_id IS NULL THEN
    RETURN jsonb_build_object('status', 'denied');   -- a first canvas has no current version to be in tension with
  END IF;

  -- A run that has been running longer than 5 minutes is dead: its reservation is charged in full (it may have
  -- been billed), then the run is failed, so the owner can start again.
  UPDATE public.mirror_ai_spend s SET actual_usd = s.reserved_usd, state = 'settled', settled_at = now()
    FROM public.canvas_draft_runs r
   WHERE r.spend_id = s.id AND r.owner_id = p_owner AND r.state IN ('queued', 'running')
     AND COALESCE(r.started_at, r.created_at) < now() - c_dead AND s.state = 'reserved';
  UPDATE public.canvas_draft_runs r SET state = 'failed', error_code = 'abandoned', finished_at = now()
   WHERE r.owner_id = p_owner AND r.state IN ('queued', 'running') AND COALESCE(r.started_at, r.created_at) < now() - c_dead;
  IF EXISTS (SELECT 1 FROM public.canvas_draft_runs r WHERE r.owner_id = p_owner AND r.state IN ('queued', 'running')) THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;
  IF (p_kind = 'draft' AND v_d.run_count >= c_revisions) OR (p_kind = 'tensions' AND v_d.tension_count >= c_revisions) THEN
    RETURN jsonb_build_object('status', 'cap_reached');
  END IF;

  v_max := CASE WHEN p_kind = 'extract' THEN (v_lim ->> 'extract_max_usd')::numeric ELSE (v_lim ->> 'canvas_max_usd')::numeric END;

  IF p_kind <> 'extract' THEN
    SELECT c.* INTO v_canvas FROM public.canvases c WHERE c.id = v_d.canvas_id;
    SELECT v.name INTO v_dver FROM public.canvas_versions v WHERE v.id = v_d.version_id;
    v_dtag := 'canvas_' || v_dver;
    IF v_d.base_version_id IS NOT NULL THEN
      SELECT v.* INTO v_base FROM public.canvas_versions v WHERE v.id = v_d.base_version_id;
      v_btag := 'canvas_' || v_base.name;
    END IF;
    SELECT pr.slug, split_part(COALESCE(pr.name, ''), ' ', 1), COALESCE(pr.name, '')
      INTO v_slug, v_first, v_full FROM public.profiles pr WHERE pr.id = p_owner;

    -- The draft's thread: the owner's own rows (messages and copies), newest first within the offer bound.
    v_ids := ARRAY(
      SELECT s.id FROM (
        SELECT x.id, sum(public._mirror_row_chars(x)) OVER (ORDER BY x.created_at DESC, x.id DESC
                 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
          FROM public.chat_messages x
         WHERE x.conversation_id = v_d.conversation_id
           AND (x.id = v_d.thread_root_id OR x.thread_root_id = v_d.thread_root_id)
           AND x.kind IN ('message', 'forward', 'clarify') AND x.author_id = p_owner
           AND x.context_conversation_id IS NULL AND x.deleted_at IS NULL
         ORDER BY x.created_at DESC, x.id DESC LIMIT c_rows) s
       WHERE COALESCE(s.before, 0) < c_chars);
    -- One lock pass, FOR SHARE SKIP LOCKED, then the context lock shared and only TRIED, exactly as
    -- _mirror_begin_job does (deadlock-free against erase_chat_data_for's phased locks): a row an erase or an edit
    -- holds is neither read nor part of derived_refs.
    SELECT COALESCE(array_agg(q.id), '{}') INTO v_locked FROM (
      SELECT m.id FROM public.chat_messages m WHERE m.id = ANY (v_ids) ORDER BY m.created_at, m.id FOR SHARE SKIP LOCKED) q;
    v_ids := ARRAY(SELECT u FROM unnest(v_ids) u WHERE u = ANY (v_locked));
    IF NOT pg_try_advisory_xact_lock_shared(hashtext('p1520_mirror_context')) THEN
      RETURN jsonb_build_object('status', 'busy');
    END IF;

    SELECT COALESCE(jsonb_agg(it.item ORDER BY it.at, it.id, it.part), '[]'::jsonb) INTO v_thread FROM (
      SELECT t.id, t.created_at AS at, 0 AS part,
             jsonb_build_object('kind', 'owner_message', 'text', t.body) AS item
        FROM public.chat_messages t
       WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND NULLIF(btrim(COALESCE(t.body, '')), '') IS NOT NULL
      UNION ALL
      SELECT t.id, t.created_at, 1,
             jsonb_build_object(
               'kind', 'clarify_copy',
               'label', left(COALESCE(NULLIF(t.forward_snapshot ->> 'conversation_title', ''),
                                      NULLIF(t.forward_snapshot ->> 'author_name', ''), 'a copied chat'), 80),
               'lines', (
                 SELECT COALESCE(jsonb_agg(l.line ORDER BY l.ord), '[]'::jsonb) FROM (
                   SELECT 0 AS ord,
                          jsonb_build_object('by', CASE WHEN t.forward_author_id = p_owner THEN 'owner' ELSE 'other' END,
                                             'text', t.forward_snapshot ->> 'body') AS line
                    WHERE NULLIF(btrim(COALESCE(t.forward_snapshot ->> 'body', '')), '') IS NOT NULL
                   UNION ALL
                   SELECT x.ord::integer,
                          jsonb_build_object('by', CASE WHEN x.entry ->> 'author_ref' = v_ref THEN 'owner' ELSE 'other' END,
                                             'text', x.entry ->> 'body')
                     FROM jsonb_array_elements(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) WITH ORDINALITY AS x(entry, ord)
                    WHERE NULLIF(btrim(COALESCE(x.entry ->> 'body', '')), '') IS NOT NULL
                      AND x.ord > jsonb_array_length(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) - 100
                 ) l))
        FROM public.chat_messages t
       WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.kind IN ('forward', 'clarify') AND t.forward_snapshot IS NOT NULL
    ) it;

    -- The other people in those copies (a point or story that contains one of these names is dropped by the engine).
    SELECT COALESCE(array_agg(DISTINCT q.n), '{}') INTO v_names FROM (
      SELECT btrim(t.forward_snapshot ->> 'author_name') AS n
        FROM public.chat_messages t
       WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.forward_snapshot IS NOT NULL
         AND t.forward_author_id IS DISTINCT FROM p_owner
      UNION
      SELECT btrim(x.entry ->> 'author_name')
        FROM public.chat_messages t, jsonb_array_elements(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) AS x(entry)
       WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND (x.entry ->> 'author_ref') IS DISTINCT FROM v_ref
      UNION
      SELECT btrim(t.forward_snapshot ->> 'conversation_title')
        FROM public.chat_messages t
       WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.forward_snapshot ? 'conversation_title_ref'
    ) q
    WHERE q.n IS NOT NULL AND q.n <> '' AND lower(q.n) <> 'deleted user' AND lower(q.n) <> lower(v_full);

    -- whose words are in it, from exactly the rows read (erasure provenance; see _mirror_begin_job)
    SELECT array_remove(array_agg(DISTINCT r.ref), NULL) INTO v_refs FROM (
      SELECT public._chat_author_ref(t.author_id) AS ref
        FROM public.chat_messages t WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.author_id IS NOT NULL
      UNION
      SELECT public._chat_author_ref(t.forward_author_id)
        FROM public.chat_messages t WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.forward_author_id IS NOT NULL
      UNION
      SELECT x.entry ->> 'author_ref'
        FROM public.chat_messages t, jsonb_array_elements(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) AS x(entry)
       WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL
      UNION
      SELECT t.forward_snapshot ->> 'conversation_title_ref'
        FROM public.chat_messages t
       WHERE t.id = ANY (v_ids) AND t.deleted_at IS NULL AND t.forward_snapshot ? 'conversation_title_ref'
    ) r;
  END IF;

  -- A draft run also reads the tensions an earlier run stored (they paraphrase that run's thread), so it carries the
  -- refs they were derived from, even when that thread row has since been deleted: erasing that person cancels it.
  IF p_kind = 'draft' AND cardinality(v_d.tension_refs) > 0 THEN
    SELECT array_remove(array_agg(DISTINCT u.ref), NULL) INTO v_refs
      FROM unnest(COALESCE(v_refs, '{}') || v_d.tension_refs) AS u(ref);
  END IF;

  v_spend := public._mirror_reserve(p_owner, 'canvas', v_max);
  IF v_spend IS NULL THEN
    INSERT INTO public.canvas_draft_runs (draft_id, owner_id, kind, speed, state, error_code, finished_at)
    VALUES (v_d.id, p_owner, p_kind, p_speed, 'capped', 'cap', now())
    RETURNING id INTO v_run;
    RETURN jsonb_build_object('status', 'capped', 'run_id', v_run);
  END IF;

  INSERT INTO public.canvas_draft_runs (draft_id, owner_id, kind, speed, state, attempts, spend_id, derived_refs, started_at)
  VALUES (v_d.id, p_owner, p_kind, p_speed, 'running', 1, v_spend, COALESCE(v_refs, '{}'), now())
  RETURNING id INTO v_run;
  UPDATE public.canvas_drafts d
     SET run_count     = d.run_count + CASE WHEN p_kind = 'draft' THEN 1 ELSE 0 END,
         tension_count = d.tension_count + CASE WHEN p_kind = 'tensions' THEN 1 ELSE 0 END
   WHERE d.id = v_d.id;

  IF p_kind = 'extract' THEN
    RETURN jsonb_build_object('status', 'run', 'run_id', v_run, 'kind', p_kind, 'reserved_usd', v_max);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'box', (SELECT t FROM unnest(p.system_tags) t WHERE t = ANY (v_boxes) LIMIT 1),
           'statement', p.statement,
           'story', (SELECT s.content FROM public.story_points sp JOIN public.stories s ON s.id = sp.story_id
                      WHERE sp.point_id = p.id AND s.author_id = p_owner ORDER BY s.created_at, s.id LIMIT 1),
           'is_head', p.superseded_by IS NULL,
           'other_positions', (SELECT count(*) FROM public.point_positions pp WHERE pp.point_id = p.id AND pp.user_id <> p_owner))
         ORDER BY p.created_at, p.id), '[]'::jsonb)
    INTO v_basepts
    FROM public.points p
   WHERE v_btag IS NOT NULL AND p.first_validator_id = p_owner
     AND p.system_tags @> ARRAY[v_btag]::text[] AND p.system_tags && v_boxes;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'box', (SELECT t FROM unnest(p.system_tags) t WHERE t = ANY (v_boxes) LIMIT 1),
           'statement', p.statement,
           'story', (SELECT s.content FROM public.story_points sp JOIN public.stories s ON s.id = sp.story_id
                      WHERE sp.point_id = p.id AND s.author_id = p_owner ORDER BY s.created_at, s.id LIMIT 1),
           'reused', EXISTS (SELECT 1 FROM unnest(p.system_tags) t WHERE t LIKE 'canvas\_%' AND t <> v_dtag),
           -- the base point a reword or move of an earlier run derives this point from (the recorded link), so a
           -- revision can say it again as a reword or move instead of losing the link
           'from_point_id', (SELECT l ->> 'old' FROM jsonb_array_elements(v_d.pending_links) l WHERE l ->> 'new' = p.id::text LIMIT 1),
           'relation', (SELECT l ->> 'relation' FROM jsonb_array_elements(v_d.pending_links) l WHERE l ->> 'new' = p.id::text LIMIT 1))
         ORDER BY p.created_at, p.id), '[]'::jsonb)
    INTO v_draftpts
    FROM public.points p
   WHERE p.first_validator_id = p_owner AND p.system_tags @> ARRAY[v_dtag]::text[] AND p.system_tags && v_boxes;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'label', m.label, 'text', m.text)
                            ORDER BY m.created_at, m.id), '[]'::jsonb)
    INTO v_material FROM public.canvas_draft_material m WHERE m.draft_id = v_d.id;

  RETURN jsonb_build_object(
    'status', 'run', 'run_id', v_run, 'kind', p_kind, 'speed', p_speed, 'reserved_usd', v_max,
    'canvas_path', '/p/' || COALESCE(v_slug, p_owner::text) || '/canvas/' || v_canvas.name || '?v=' || v_dver,
    'base_label', CASE WHEN v_d.base_version_id IS NULL THEN NULL ELSE 'v' || v_base.published_seq END,
    'base_points', v_basepts,
    'material', v_material,
    'tensions', v_d.tensions,
    'other_names', to_jsonb(v_names),
    'thread', v_thread,
    'draft_points', v_draftpts,
    'owner_first_name', NULLIF(v_first, ''), 'owner_name', NULLIF(v_full, ''),
    'canvas_name', v_canvas.name, 'version_name', v_dver,
    'run_count', v_d.run_count + CASE WHEN p_kind = 'draft' THEN 1 ELSE 0 END,
    'tension_count', v_d.tension_count + CASE WHEN p_kind = 'tensions' THEN 1 ELSE 0 END);
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_run_begin(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_run_begin(uuid, uuid, text, text) TO service_role;

-- _canvas_draft_run_complete(uuid, jsonb, jsonb, jsonb, text, numeric): previous body (see the diffed-against list) plus the v6 guard
CREATE OR REPLACE FUNCTION public._canvas_draft_run_complete(
  p_run uuid, p_actions jsonb, p_questions jsonb, p_decided jsonb, p_reply text, p_usd numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_actions CONSTANT integer := 45;
  v_run   public.canvas_draft_runs;
  v_d     public.canvas_drafts;
  v_boxes text[] := public._canvas_box_tags();
  v_dver  text;
  v_cname text;
  v_slug  text;
  v_tag   text;
  v_btag  text;
  v_a     jsonb;
  v_type  text;
  v_old   uuid;
  v_op    public.points;
  v_box   text;
  v_stmt  text;
  v_story text;
  v_pid   uuid;
  v_sid   uuid;
  v_new_stories uuid[] := '{}';
  v_seen  uuid[] := '{}';
  v_links jsonb := '[]'::jsonb;
  v_kept  integer := 0;
  v_made  integer := 0;
  v_k     text;
  v_q     jsonb := '{}'::jsonb;
  v_full  numeric;
BEGIN
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_run.owner_id::text, 0));
  SELECT d.* INTO v_d FROM public.canvas_drafts d WHERE d.id = v_run.draft_id FOR UPDATE;
  SELECT r.* INTO v_run FROM public.canvas_draft_runs r WHERE r.id = p_run AND r.kind = 'draft' FOR UPDATE;
  IF public._canvas_draft_is_v6(v_d.id) THEN
    RAISE EXCEPTION 'canvas draft: this draft belongs to the v6 engine; use _canvas_draft_run_complete(run, owner, ...)' USING ERRCODE = '55000';
  END IF;
  IF v_run.id IS NOT NULL AND v_run.state = 'cancelled' THEN
    SELECT s.reserved_usd INTO v_full FROM public.mirror_ai_spend s WHERE s.id = v_run.spend_id;
    PERFORM public._mirror_settle(v_run.spend_id, COALESCE(p_usd, v_full));   -- erased: the call was made, nothing is written
    RETURN NULL;
  END IF;
  IF v_run.id IS NULL OR v_run.state <> 'running' THEN
    RETURN NULL;
  END IF;

  IF p_actions IS NULL OR jsonb_typeof(p_actions) <> 'array' OR jsonb_array_length(p_actions) > c_max_actions THEN
    RAISE EXCEPTION 'canvas draft: actions must be an array of at most % items', c_max_actions USING ERRCODE = '22023';
  END IF;
  IF p_questions IS NOT NULL AND jsonb_typeof(p_questions) <> 'object' THEN
    RAISE EXCEPTION 'canvas draft: questions must be an object' USING ERRCODE = '22023';
  END IF;
  IF p_decided IS NOT NULL AND (jsonb_typeof(p_decided) <> 'array' OR jsonb_array_length(p_decided) > 60) THEN
    RAISE EXCEPTION 'canvas draft: decided must be an array of at most 60' USING ERRCODE = '22023';
  END IF;
  FOR v_k IN SELECT jsonb_object_keys(COALESCE(p_questions, '{}'::jsonb)) LOOP
    IF NOT (v_k = ANY (v_boxes)) OR jsonb_typeof(p_questions -> v_k) <> 'string' THEN
      RAISE EXCEPTION 'canvas draft: bad question' USING ERRCODE = '22023';
    END IF;
    v_q := v_q || jsonb_build_object(v_k, left(p_questions ->> v_k, 400));
  END LOOP;

  SELECT s.reserved_usd INTO v_full FROM public.mirror_ai_spend s WHERE s.id = v_run.spend_id;
  PERFORM public._mirror_settle(v_run.spend_id, COALESCE(p_usd, v_full));
  IF v_d.state <> 'open' THEN
    UPDATE public.canvas_draft_runs r SET state = 'failed', error_code = 'draft_closed', finished_at = now() WHERE r.id = p_run;
    RETURN NULL;
  END IF;

  SELECT v.name INTO v_dver FROM public.canvas_versions v WHERE v.id = v_d.version_id;
  SELECT c.name INTO v_cname FROM public.canvases c WHERE c.id = v_d.canvas_id;
  SELECT 'canvas_' || v.name INTO v_btag FROM public.canvas_versions v WHERE v.id = v_d.base_version_id;
  v_tag := 'canvas_' || v_dver;

  -- 1 + 2: a revision replaces the draft: its created points go, reused points lose the draft's tag
  PERFORM public._canvas_draft_clear_points(v_d.id);

  -- 3: the actions
  FOR v_a IN SELECT e FROM jsonb_array_elements(p_actions) e LOOP
    v_type := COALESCE(v_a ->> 'action', v_a ->> 'type');
    IF v_type IS NULL OR v_type NOT IN ('keep', 'reword', 'move', 'new') THEN
      RAISE EXCEPTION 'canvas draft: unknown action' USING ERRCODE = '22023';
    END IF;

    IF v_type IN ('keep', 'reword', 'move') THEN
      v_old := COALESCE(v_a ->> 'point_id', v_a ->> 'old_point_id')::uuid;
      IF v_btag IS NULL OR v_old IS NULL THEN
        RAISE EXCEPTION 'canvas draft: no base version to take a point from' USING ERRCODE = '22023';
      END IF;
      IF v_old = ANY (v_seen) THEN
        RAISE EXCEPTION 'canvas draft: a point is named twice' USING ERRCODE = '22023';
      END IF;
      v_seen := v_seen || v_old;
      -- the owner's own point on the BASE version: nothing else may be reused, reworded or moved
      SELECT p.* INTO v_op FROM public.points p
       WHERE p.id = v_old AND p.first_validator_id = v_d.owner_id
         AND p.system_tags @> ARRAY[v_btag]::text[] AND p.system_tags && v_boxes;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'canvas draft: point is not on the base version' USING ERRCODE = '22023';
      END IF;
    END IF;

    -- A keep carries the old point over by giving it the draft's tag. A point that is not private (a legacy public
    -- seed) cannot take it: p1515_canvas_points_are_private refuses a changed canvas_ tag on a public point. It is
    -- carried as a private copy instead (below), with no link.
    IF v_type = 'keep' AND v_op.visibility = 'private'::public.content_visibility THEN
      UPDATE public.points p SET system_tags = array_append(p.system_tags, v_tag)
       WHERE p.id = v_old AND NOT (p.system_tags @> ARRAY[v_tag]::text[]);
      v_kept := v_kept + 1;
      CONTINUE;
    END IF;

    v_box := CASE WHEN v_type = 'keep' THEN (SELECT t FROM unnest(v_op.system_tags) t WHERE t = ANY (v_boxes) LIMIT 1)
                  ELSE COALESCE(NULLIF(v_a ->> 'box', ''), CASE WHEN v_type <> 'new' THEN
                    (SELECT t FROM unnest(v_op.system_tags) t WHERE t = ANY (v_boxes) LIMIT 1) END) END;
    IF v_box IS NULL OR NOT (v_box = ANY (v_boxes)) THEN
      RAISE EXCEPTION 'canvas draft: unknown box' USING ERRCODE = '22023';
    END IF;
    v_stmt := btrim(COALESCE(NULLIF(btrim(v_a ->> 'statement'), ''), CASE WHEN v_type IN ('move', 'keep') THEN v_op.statement END, ''));
    IF char_length(v_stmt) NOT BETWEEN 1 AND 300 THEN
      RAISE EXCEPTION 'canvas draft: bad statement' USING ERRCODE = '22023';
    END IF;
    v_story := CASE WHEN v_type = 'keep' THEN '' ELSE btrim(COALESCE(v_a ->> 'story', '')) END;
    IF char_length(v_story) > 1500 THEN
      RAISE EXCEPTION 'canvas draft: story too long' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.points (statement, first_validator_id, visibility, tags, system_tags)
    VALUES (v_stmt, v_d.owner_id, 'private'::public.content_visibility, '{}', ARRAY[v_box, v_tag])
    RETURNING id INTO v_pid;
    -- D20: no stance for a new or reworded point; a move or a keep with the SAME words (a private copy) keeps the owner's stance; with new words it is a reword and gets none
    IF v_type IN ('move', 'keep') AND v_stmt = btrim(v_op.statement) THEN
      INSERT INTO public.point_positions (point_id, user_id, position)
      SELECT v_pid, v_d.owner_id, pp.position FROM public.point_positions pp WHERE pp.point_id = v_op.id AND pp.user_id = v_d.owner_id;
    END IF;
    IF v_story <> '' THEN
      INSERT INTO public.stories (content, author_id, visibility)
      VALUES (v_story, v_d.owner_id, 'private'::public.content_visibility) RETURNING id INTO v_sid;
      INSERT INTO public.story_points (story_id, point_id, author_id) VALUES (v_sid, v_pid, v_d.owner_id);
      v_new_stories := v_new_stories || v_sid;   -- the engine wrote it: a revision or discard may delete it
    ELSIF v_type IN ('move', 'keep', 'reword') THEN
      -- same words (another box, or a private copy of a public point), or a reword that carries no story of its own
      -- (a draft writes points only): the owner's private stories of the old point follow it. They are the owner's,
      -- not the engine's: never recorded in created_story_ids.
      INSERT INTO public.story_points (story_id, point_id, author_id)
      SELECT sp.story_id, v_pid, v_d.owner_id
        FROM public.story_points sp JOIN public.stories s ON s.id = sp.story_id
       WHERE sp.point_id = v_old AND s.author_id = v_d.owner_id AND s.visibility = 'private'::public.content_visibility;
    END IF;
    IF v_type = 'keep' THEN
      v_kept := v_kept + 1;
    ELSE
      v_made := v_made + 1;
    END IF;

    -- Link only to a HEAD (one successor per point), and only from a private point; anything else is a new point
    -- with no link.
    IF v_type IN ('reword', 'move') AND v_op.superseded_by IS NULL AND v_op.visibility = 'private'::public.content_visibility THEN
      v_links := v_links || jsonb_build_array(jsonb_build_object(
        'old', v_old, 'new', v_pid, 'relation', v_type,
        'why', COALESCE(NULLIF(left(v_a ->> 'why', 200), ''), CASE v_type WHEN 'reword' THEN 'reworded' ELSE 'moved' END)));
    END IF;
  END LOOP;

  -- 4: the draft's own record, then the reply, then the run
  UPDATE public.canvas_drafts d
     SET pending_links = v_links, questions = v_q, decided = COALESCE(p_decided, '[]'::jsonb),
         created_story_ids = v_new_stories
   WHERE d.id = v_d.id;
  PERFORM public._canvas_draft_post(v_d.conversation_id, v_d.thread_root_id, p_reply, v_run.derived_refs);
  UPDATE public.canvas_draft_runs r SET state = 'done', finished_at = now() WHERE r.id = p_run;
  SELECT pr.slug INTO v_slug FROM public.profiles pr WHERE pr.id = v_d.owner_id;
  RETURN jsonb_build_object(
    'status', 'ok', 'points', v_kept + v_made, 'kept', v_kept, 'created', v_made,
    'links', jsonb_array_length(v_links), 'version', v_dver,
    'canvas_path', '/p/' || COALESCE(v_slug, v_d.owner_id::text) || '/canvas/' || v_cname || '?v=' || v_dver);
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_draft_run_complete(uuid, jsonb, jsonb, jsonb, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._canvas_draft_run_complete(uuid, jsonb, jsonb, jsonb, text, numeric) TO service_role;

-- @@ERASE_BEGIN
-- erase_chat_data_for: 20261029100100's body (step 7 of P1536 kept in full) with two additions: before anything else it takes
-- the engine's per-owner advisory locks (the erased user's and every affected owner's, as one sorted set), and right after
-- the step-6 context lock it locks the affected draft rows in id order, so erasure and the draft engine never interleave; step 7 also
-- bumps the revision of each draft that had a v6 run cancelled. Everything else, including every P1536 edit, is that body. NOTE: another feature's migration that sorts later and rebuilds this function from an older body would
-- drop step 7 again; src/tests/p1536-draft-versions-migration.test.ts and p1536-v6-engine-migration.test.ts fail on the
-- merged tree when that happens.
CREATE OR REPLACE FUNCTION public.erase_chat_data_for(p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  v_ref text := public._chat_author_ref(p_uid);
  n     integer;
  pass  integer;
  v_o   record;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'erase_chat_data_for: no subject' USING ERRCODE = '22023';
  END IF;

  -- The engine's per-owner advisory locks come FIRST, before any row is touched: the erased user's own, and those of every
  -- owner of a draft whose runs read their words, as ONE set taken in owner order. Every engine function takes its owner's
  -- lock before anything else, so an engine transaction in flight (it may hold a conversation or draft row) finishes first,
  -- and two concurrent erasures take the locks in the same global order and cannot cross. Waiting here cannot form a cycle:
  -- the engine only TRIES the p1520 lock (shared) and never waits for it. (An owner who becomes affected only between this
  -- read and the p1520 lock below is the one case not covered: its draft rows are still locked in step 6.)
  FOR v_o IN
    SELECT x.owner_id FROM (
      SELECT p_uid AS owner_id
      UNION
      SELECT d.owner_id FROM public.canvas_drafts d
       WHERE d.tension_refs @> ARRAY[v_ref]
          OR d.id IN (SELECT r.draft_id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref])
    ) x
    ORDER BY x.owner_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || v_o.owner_id::text, 0));
  END LOOP;

  -- ORDER MATTERS (race with forward_chat_message / clarify_chat_message). Those lock their source
  -- row FOR SHARE, so step 2's UPDATE of the erased user's own rows WAITS for any in-flight copy of
  -- them to commit. Under READ COMMITTED every statement takes a fresh snapshot, so the scrub in
  -- step 3 (a later statement) then SEES a copy that committed while step 2 waited and scrubs it.
  -- Scrubbing first would miss it. A copy that starts after step 2 commits finds the source deleted
  -- and is refused. Step 3 runs twice for the copy-of-a-copy case (a forward of a forward that
  -- committed while step 3's first pass waited).

  -- 1. their mirror and everything copied into it
  DELETE FROM public.chat_conversations c WHERE c.kind = 'mirror' AND c.owner_id = p_uid;
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_mirrors_deleted', n);

  -- 2. their messages in shared conversations
  UPDATE public.chat_messages m
     SET body = NULL, deleted_at = COALESCE(m.deleted_at, now()),
         attachment_kind = NULL, attachment_id = NULL,
         forward_snapshot = NULL, forward_author_id = NULL,
         author_id = NULL
   WHERE m.author_id = p_uid;
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_messages_erased', n);

  -- 3. copies made by OTHER people that carry their words. Erase means erase; D5 snapshot survival
  -- applies to ordinary deletes, not account erasure: the author becomes 'Deleted user', the body is
  -- removed (also from copied thread entries), the attachment and the back-reference are cleared.
  FOR pass IN 1..2 LOOP
    UPDATE public.chat_messages m
       SET forward_snapshot = jsonb_set(jsonb_set(m.forward_snapshot, '{author_name}', to_jsonb('Deleted user'::text)),
                                        '{body}', 'null'::jsonb),
           attachment_kind = NULL, attachment_id = NULL,
           forward_author_id = NULL
     WHERE m.forward_author_id = p_uid AND m.forward_snapshot IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_forwards_anonymised_' || pass, n);

    UPDATE public.chat_messages m
       SET forward_snapshot = jsonb_set(m.forward_snapshot, '{thread}', (
             SELECT COALESCE(jsonb_agg(
                      CASE WHEN t.e ->> 'author_ref' = v_ref
                           THEN (t.e - 'author_ref') || jsonb_build_object('author_name', 'Deleted user', 'body', NULL::text)
                           ELSE t.e END
                      ORDER BY t.ord), '[]'::jsonb)
               FROM jsonb_array_elements(m.forward_snapshot -> 'thread') WITH ORDINALITY AS t(e, ord)))
     WHERE m.forward_snapshot IS NOT NULL
       AND jsonb_path_exists(m.forward_snapshot, '$.thread[*] ? (@.author_ref == $ref)',
                             jsonb_build_object('ref', v_ref));
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_threads_anonymised_' || pass, n);

    -- a clarify made in a 1:1 with them carries their name as the chat title
    UPDATE public.chat_messages m
       SET forward_snapshot = jsonb_set(m.forward_snapshot - 'conversation_title_ref', '{conversation_title}',
                                        to_jsonb('Deleted user'::text))
     WHERE m.forward_snapshot ->> 'conversation_title_ref' = v_ref;
  END LOOP;

  -- 4. read state and blocks
  DELETE FROM public.chat_member_state s WHERE s.profile_id = p_uid;
  DELETE FROM public.chat_blocks b WHERE b.blocker_id = p_uid OR b.blocked_id = p_uid;

  -- 5. conversations that would be left with nobody
  DELETE FROM public.chat_conversations c
   WHERE c.kind = 'dm'
     AND ((c.dm_user_a = p_uid AND c.dm_user_b IS NULL) OR (c.dm_user_b = p_uid AND c.dm_user_a IS NULL));
  UPDATE public.chat_conversations c SET created_by = NULL WHERE c.created_by = p_uid;

  -- 6. (P1520) AI work derived from their words. The exclusive lock waits for every job still reading its
  -- context (_mirror_begin_job holds it shared) and keeps new ones out until this commits, so no job can
  -- record refs this step does not see. Jobs first: a completion that commits while this waits leaves a
  -- reply the next statement then scrubs.
  PERFORM pg_advisory_xact_lock(hashtext('p1520_mirror_context'));
  -- the draft rows the engine would lock, in id order, before any reply message or run row is touched (the owner locks are
  -- already held, see the top of this function)
  PERFORM 1 FROM public.canvas_drafts d
   WHERE d.tension_refs @> ARRAY[v_ref]
      OR d.id IN (SELECT r.draft_id FROM public.canvas_draft_runs r WHERE r.derived_refs @> ARRAY[v_ref])
   ORDER BY d.id FOR UPDATE;
  UPDATE public.mirror_jobs j
     SET state = 'cancelled', error_code = 'erased', finished_at = now()
   WHERE j.state IN ('queued', 'running') AND j.derived_refs @> ARRAY[v_ref];
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('mirror_jobs_cancelled', n);
  UPDATE public.chat_messages m
     SET body = NULL, deleted_at = COALESCE(m.deleted_at, now()), derived_refs = NULL
   WHERE m.kind = 'agent' AND m.derived_refs @> ARRAY[v_ref];
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('mirror_replies_erased', n);

  -- 7. (P1536) canvas draft runs that read their words. Same lock as step 6 (still held), so no run can record refs this
  -- step does not see. A cancelled run's completion writes and posts nothing. The tensions and decided notes of a
  -- draft are model output that can paraphrase what its runs read, and they are fed to its next run: cleared.
  -- a cancelled run changes what the owner sees (the spot stops saying "Updating..."), so the draft's revision moves, once
  -- per draft that had a v6 run cancelled; the draft rows are already locked above
  UPDATE public.canvas_drafts d SET revision = d.revision + 1
   WHERE d.id IN (SELECT r.draft_id FROM public.canvas_draft_runs r
                   WHERE r.state IN ('queued', 'running') AND r.derived_refs @> ARRAY[v_ref]
                     AND r.kind IN ('message', 'focus', 'fork_first'));
  UPDATE public.canvas_draft_runs r
     SET state = 'cancelled', error_code = 'erased', finished_at = now()
   WHERE r.state IN ('queued', 'running') AND r.derived_refs @> ARRAY[v_ref];
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('canvas_draft_runs_cancelled', n);
  UPDATE public.canvas_drafts d
     SET tensions = '[]'::jsonb, decided = '[]'::jsonb, tension_refs = '{}'
   WHERE d.tension_refs @> ARRAY[v_ref]
      OR EXISTS (SELECT 1 FROM public.canvas_draft_runs r WHERE r.draft_id = d.id AND r.derived_refs @> ARRAY[v_ref]);
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('canvas_drafts_scrubbed', n);

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.erase_chat_data_for(uuid) FROM PUBLIC, anon, authenticated;
-- @@ERASE_END

COMMIT;
