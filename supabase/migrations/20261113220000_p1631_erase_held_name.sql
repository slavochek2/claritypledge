-- client-safe: no client RPC changes. _erase_lock_canvas_owners and _erase_held_points are internal (no client grant) and keep their signatures; _erase_held_setting is new, internal, no grant. Behaviour: the transaction-local setting that records the points a person erasing held now has a valid name (20261113210000 built it with the uuid's dashes, which Postgres rejects with 42602, so every erase_my_account failed)
-- new function: _erase_held_setting
-- Migration: P1631 erase held name (fix of 20261113210000)
-- Created: 2026-11-13
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md
-- Guaranteed by: src/tests/p1631-erase-held-name-migration.test.ts (source contract), src/tests/integration/p1631-erase-keeps-held-points.test.ts
--
-- WHAT WAS WRONG. 20261113210000 named the setting 'p1631.erase_held.' || p_uid::text. A custom setting name may hold only letters, digits and underscores, so a uuid's dashes raise
-- 42602 "invalid configuration parameter name"; _erase_lock_canvas_owners is the first statement block of erase_my_account, so every erasure failed. Not caught because that migration's tests were
-- source contracts and the integration files were run only after it was applied.
-- FIX. One helper builds the name, and the writer and the reader both call it, so they cannot drift: 'p1631.erase_held_' || replace(p_uid::text, '-', '') (32 hex characters, letters and digits only).
--
-- diffed against:
--   _erase_lock_canvas_owners(uuid)   20261113210000_p1631_erase_scoped_sweep.sql (its newest definition): that body byte for byte, except its three `-- P1631 erase scoped` lines (they name the
--                                     setting), which are replaced by three lines marked `-- P1631 erase held name`.
--   _erase_held_points(uuid)          20261113210000_p1631_erase_scoped_sweep.sql (its only definition): the setting name read through the helper (marked line).

BEGIN;

CREATE OR REPLACE FUNCTION public._erase_held_setting(p_uid uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT 'p1631.erase_held_' || replace(p_uid::text, '-', '');
$$;
REVOKE ALL ON FUNCTION public._erase_held_setting(uuid) FROM PUBLIC, anon, authenticated;

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
  -- the points this person holds now, recorded before erase_my_account deletes their positions and merged with what an earlier call of this transaction recorded; the setting name comes from one helper (writer and reader) -- P1631 erase held name
  PERFORM set_config(public._erase_held_setting(p_uid), COALESCE((SELECT string_agg(DISTINCT h, ',') FROM unnest( -- P1631 erase held name
    string_to_array(NULLIF(COALESCE(current_setting(public._erase_held_setting(p_uid), true), ''), ''), ',') -- P1631 erase held name
    || ARRAY(SELECT pp.point_id::text FROM public.point_positions pp WHERE pp.user_id = p_uid)) AS h), ''), true); -- P1631 erase held name
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
  SELECT COALESCE(string_to_array(NULLIF(current_setting(public._erase_held_setting(p_uid), true), ''), ',')::uuid[], '{}'::uuid[]); -- P1631 erase held name
$$;
REVOKE ALL ON FUNCTION public._erase_held_points(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
