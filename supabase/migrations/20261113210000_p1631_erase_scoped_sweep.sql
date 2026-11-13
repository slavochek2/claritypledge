-- client-safe: no client RPC changes. _erase_lock_canvas_owners, _clarify_erase_person, _point_chat_erase_author and _point_chat_erase_orphans are internal (no client grant) and keep their signatures; _erase_held_points is new, internal, no grant. Behaviour: the orphan sweeps of account erasure now delete only points the person erasing HELD at the start of their erasure, and a refused draft that read the erased person loses its model-made suggestions
-- new function: _erase_held_points
-- Migration: P1631 erasure review fixes (F3 scope of the orphan sweeps, F5 refused drafts' suggestions)
-- Created: 2026-11-13
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md
-- Guaranteed by: src/tests/p1631-erase-scoped-sweep-migration.test.ts (source contract), src/tests/integration/p1631-erase-keeps-held-points.test.ts
--
-- Earlier P1631 migrations are applied and are not edited. Each replaced function is its newest body copied byte for byte, then marked lines (`-- P1631 erase scoped`).
-- Two functions replace one existing line each (the last line of the orphan sweep's NOT EXISTS, which ended the statement, becomes two marked lines); the unit test removes exactly that old line
-- from the earlier body and the marked lines from this one.
--
-- diffed against:
--   _erase_lock_canvas_owners(uuid)   20261030090000_p1536_p1592_merge_erase_forward.sql (its newest definition): plus 3 marked lines at the end.
--   _clarify_erase_person(uuid)       20261113130000_p1631_erase_keeps_held_points.sql (its newest definition): plus 3 marked lines.
--   _point_chat_erase_author(uuid)    20261113160000_p1631_erase_last_holder.sql (its newest definition): the sweep's last line replaced by 2 marked lines.
--   _point_chat_erase_orphans(uuid)   20261113180000_p1631_erase_last_holder_fix.sql (its newest definition): the sweep's last line replaced by 2 marked lines.
--
-- F3. Both sweeps deleted ANY private point with a share row whose publisher is gone and no holder other than the person erasing, including a point the eraser never touched (a kept point whose last
--     holder had un-held it, deleted when an unrelated chat member erased, under a live card). They now also require that the point is one the person erasing held when their erasure began.
--     The set is recorded by the first call of _erase_lock_canvas_owners in the transaction (erase_my_account calls it before its first mutation, so before it deletes the person's positions; a direct
--     call of erase_chat_data_for records the positions that still exist). It is kept in a transaction-local setting named for the person ('p1631.erase_held.<uuid>', set_config with is_local = true,
--     gone at commit or rollback), merged with anything already recorded in the same transaction, so the second call (inside erase_chat_data_for, after the positions are deleted) does not erase it.
--     Chosen over replacing erase_my_account (about 230 lines, pinned by p1536 tests as a whole) and over a trigger on point_positions (a new writer-path on a core table): one small helper body is
--     replaced, and the earlier p1536 pin tests list it. The setting can only be written by the erasure itself (a client cannot call set_config through the API).
-- F5. A refused draft keeps `suggestions`, model text made from the erased person's words (before the OQ9 change those were nulled). _clarify_erase_person now nulls suggestions on every draft that
--     read the person and is not in flight (an in-flight draft is failed and cleared as before). Statement order: before the unchanged ref removal.
-- F4 (race between step 2's kept-card decision and the share update in step 6) is NOT fixed here: it needs a concurrent position write during one erasure, and one decision cannot be shared between the
--     two places without restating erase_chat_data_for and passing the set through; recorded as a known limit.

BEGIN;

-- 1. the held set -----------------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._erase_lock_canvas_owners(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ref text := public._chat_author_ref(p_uid);
  v_o   record;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION '_erase_lock_canvas_owners: no subject' USING ERRCODE = '22023';
  END IF;
  -- (An owner who becomes affected only after this read is the one case not covered: its draft rows are still locked in
  -- erase_chat_data_for, after the p1520 lock.)
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
  -- the points this person holds now, recorded before erase_my_account deletes their positions and merged with what an earlier call of this transaction recorded -- P1631 erase scoped
  PERFORM set_config('p1631.erase_held.' || p_uid::text, COALESCE((SELECT string_agg(DISTINCT h, ',') FROM unnest( -- P1631 erase scoped
    string_to_array(NULLIF(COALESCE(current_setting('p1631.erase_held.' || p_uid::text, true), ''), ''), ',') -- P1631 erase scoped
    || ARRAY(SELECT pp.point_id::text FROM public.point_positions pp WHERE pp.user_id = p_uid)) AS h), ''), true); -- P1631 erase scoped
END;
$$;

REVOKE ALL ON FUNCTION public._erase_lock_canvas_owners(uuid) FROM PUBLIC, anon, authenticated;

-- The points the person erasing held when their erasure began (empty outside an erasure). Internal.
CREATE OR REPLACE FUNCTION public._erase_held_points(p_uid uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(string_to_array(NULLIF(current_setting('p1631.erase_held.' || p_uid::text, true), ''), ',')::uuid[], '{}'::uuid[]);
$$;
REVOKE ALL ON FUNCTION public._erase_held_points(uuid) FROM PUBLIC, anon, authenticated;

-- 2. F5 ---------------------------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._clarify_erase_person(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ref    text := public._chat_author_ref(p_uid);
  v_points uuid[];
BEGIN
  PERFORM 1 FROM public.clarify_drafts d WHERE d.derived_refs @> ARRAY[v_ref] ORDER BY d.id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  -- a refused draft's suggestions are model text made from the erased person's words: cleared on every draft that is not in flight (an in-flight draft is failed and cleared below) -- P1631 erase scoped
  UPDATE public.clarify_drafts d SET suggestions = NULL -- P1631 erase scoped
   WHERE d.derived_refs @> ARRAY[v_ref] AND d.suggestions IS NOT NULL AND d.state NOT IN ('queued', 'running'); -- P1631 erase scoped
  -- a draft that read the erased person's words keeps its state and point (the point is its author's sentence): only the ref leaves it, so the statements below see only drafts whose run is in flight -- P1631 erase keeps held points
  UPDATE public.clarify_drafts d SET derived_refs = array_remove(d.derived_refs, v_ref) -- P1631 erase keeps held points
   WHERE d.derived_refs @> ARRAY[v_ref] AND d.state NOT IN ('queued', 'running'); -- P1631 erase keeps held points
  SELECT COALESCE(array_agg(d.point_id), '{}') INTO v_points
    FROM public.clarify_drafts d WHERE d.derived_refs @> ARRAY[v_ref] AND d.point_id IS NOT NULL;
  -- a run in flight is dead: its reservation is charged in full (the model may have been called), as the sweep does; the run's late completion settles nothing twice -- P1631
  UPDATE public.mirror_ai_spend s SET actual_usd = s.reserved_usd, state = 'settled', settled_at = now() -- P1631
   WHERE s.state = 'reserved' AND s.id IN (SELECT d.spend_id FROM public.clarify_drafts d -- P1631
                                           WHERE d.derived_refs @> ARRAY[v_ref] AND d.state = 'running' AND d.spend_id IS NOT NULL); -- P1631
  UPDATE public.clarify_drafts d
     SET state = 'failed', error_code = 'erased', point_id = NULL, suggestions = NULL, cited = NULL,
         derived_refs = '{}', sent_ids = '{}', updated_at = now()
   WHERE d.derived_refs @> ARRAY[v_ref];
  DELETE FROM public.points p WHERE p.id = ANY (v_points) AND p.visibility = 'private'::public.content_visibility; -- P1631 r2: whoever holds a position on it, it is derived from the erased words; positions go with it
END;
$$;
REVOKE ALL ON FUNCTION public._clarify_erase_person(uuid) FROM PUBLIC, anon, authenticated;

-- 3. F3: both sweeps ----------------------------------------------------------------------------------------------------------------------------

-- Erasure of an author: the private points they published are deleted (first_validator_id is already nulled by erase_my_account, so the point cannot be found by owner).
-- The share rows go with the points (cascade). Called only from erase_chat_data_for. search_path is public, pg_temp: the triggers on points read `points` unqualified.
CREATE OR REPLACE FUNCTION public._point_chat_erase_author(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- a point another person holds a position on is kept: its share row loses the publisher, so the delete below does not find it -- P1631 erase keeps held points
  UPDATE public.point_chat_shares s SET shared_by = NULL -- P1631 erase keeps held points
   WHERE s.shared_by = p_uid -- P1631 erase keeps held points
     AND EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = s.point_id AND pp.user_id IS DISTINCT FROM p_uid); -- P1631 erase keeps held points
  -- a kept point (its author is gone) whose only remaining holder is the person erasing is orphaned: it goes with them -- P1631 erase last holder
  DELETE FROM public.points op -- P1631 erase last holder
   WHERE op.visibility = 'private'::public.content_visibility -- P1631 erase last holder
     AND EXISTS (SELECT 1 FROM public.point_chat_shares os WHERE os.point_id = op.id AND os.shared_by IS NULL) -- P1631 erase last holder
     AND NOT EXISTS (SELECT 1 FROM public.point_positions lp WHERE lp.point_id = op.id AND lp.user_id IS DISTINCT FROM p_uid) -- P1631 erase scoped
     AND op.id = ANY (public._erase_held_points(p_uid)); -- P1631 erase scoped: only a point the person erasing held
  DELETE FROM public.points p
   WHERE p.visibility = 'private'::public.content_visibility
     AND p.id IN (SELECT s.point_id FROM public.point_chat_shares s WHERE s.shared_by = p_uid);
END;
$$;
REVOKE ALL ON FUNCTION public._point_chat_erase_author(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._point_chat_erase_orphans(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- a kept point (its author is gone) whose only remaining holder is the person erasing is orphaned: it goes with them. search_path is public, pg_temp: the triggers on points read `points` unqualified.
  DELETE FROM public.points op
   WHERE op.visibility = 'private'::public.content_visibility
     AND EXISTS (SELECT 1 FROM public.point_chat_shares os WHERE os.point_id = op.id AND os.shared_by IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.point_positions lp WHERE lp.point_id = op.id AND lp.user_id IS DISTINCT FROM p_uid) -- P1631 erase scoped
     AND op.id = ANY (public._erase_held_points(p_uid)); -- P1631 erase scoped: only a point the person erasing held
END;
$$;
REVOKE ALL ON FUNCTION public._point_chat_erase_orphans(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
