-- client-safe: no client RPC changes. One new internal trigger function (no grant) and one statement-level AFTER DELETE trigger on point_positions that only writes a transaction-local setting (no table is written). Behaviour: the set of points a person erasing held is now recorded by whatever deletes their positions, instead of by erase_my_account calling _erase_lock_canvas_owners first
-- new function: _record_deleted_positions
-- Migration: P1631 erase held fix (the held set was never recorded: 20261113210000 and 20261113220000 depended on a call the live erase_my_account does not make)
-- Created: 2026-11-13
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md
-- Guaranteed by: src/tests/p1631-erase-held-fix-migration.test.ts (source contract), src/tests/integration/p1631-erase-keeps-held-points.test.ts
--
-- DIAGNOSIS (read-only probes of TEST, plus the repo). 20261113210000 recorded the held set in _erase_lock_canvas_owners, on the premise that erase_my_account calls it before it deletes the person's
-- positions (true of the repo's newest body, 20261030090000:328 before :472). The erase_my_account that is LIVE on TEST does not: pg_proc.prosrc of public.erase_my_account contains neither
-- 'p1536:erasure', nor 'p1592:erasing', nor a call of _erase_lock_canvas_owners (it does contain the position delete and the erase_chat_data_for call). So the writer first ran inside erase_chat_data_for,
-- after the positions were gone, recorded nothing, and both sweeps (scoped to that set) matched nothing. The live body differs from the repo's newest definition although 20261030090000 is recorded
-- as applied; that mismatch is reported separately and not repaired here.
-- FIX. Record the set where the deletion happens, so it holds for any erase_my_account body: a statement-level AFTER DELETE trigger on point_positions with a transition table collects, per user, the
-- points whose positions the statement deleted, and merges them into the same transaction-local setting that _erase_lock_canvas_owners writes and _erase_held_points reads
-- (_erase_held_setting names it). The setting is local to the transaction, so a position the person removed in an earlier transaction (the F3 control) is never in it. The writer in
-- _erase_lock_canvas_owners stays (it records the positions that still exist when erase_chat_data_for is called directly). No function body is restated.
--
-- diffed against: no function is restated (the trigger function is new).

BEGIN;

CREATE OR REPLACE FUNCTION public._record_deleted_positions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT o.user_id, array_agg(DISTINCT o.point_id::text) AS pts FROM old_rows o WHERE o.user_id IS NOT NULL GROUP BY o.user_id LOOP
    PERFORM set_config(public._erase_held_setting(r.user_id), COALESCE((SELECT string_agg(DISTINCT h, ',') FROM unnest(
      string_to_array(NULLIF(COALESCE(current_setting(public._erase_held_setting(r.user_id), true), ''), ''), ',') || r.pts) AS h), ''), true);
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._record_deleted_positions() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS point_positions_record_deleted ON public.point_positions;
CREATE TRIGGER point_positions_record_deleted
  AFTER DELETE ON public.point_positions
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public._record_deleted_positions();

COMMIT;
