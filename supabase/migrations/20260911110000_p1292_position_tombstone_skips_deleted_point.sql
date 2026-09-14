-- P1292: deleting a point — or a profile — no longer fails on the position-history trigger.
--
-- diffed against: 20260409120000_fix_position_history_trigger.sql (log_position_change)
-- diff: ONE change, in the DELETE arm. `INSERT ... VALUES (OLD.point_id, ...)` becomes
--   `INSERT ... SELECT ... WHERE EXISTS (the point still exists) AND EXISTS (the profile still exists)`. The INSERT and UPDATE arms,
--   SECURITY DEFINER, SET search_path = public, LANGUAGE plpgsql and RETURN COALESCE(NEW, OLD) are
--   carried over byte-for-byte. The trigger binding (AFTER INSERT OR UPDATE OR DELETE ON
--   point_positions, 20260204_stories_points_calibration.sql) is untouched — CREATE OR REPLACE keeps
--   it pointing at this function. The history INSERT policy from the prior migration is not redefined.
--
-- client-safe: the only behaviour change is that deletes which ALWAYS failed now succeed — a point
--   delete, and a profile delete for any user who still holds a position. No client
--   path deletes points (grep of src/ finds no delete against `points`). The one production path that
--   fires this arm — account erasure deleting a user's point_positions while the points remain —
--   takes the EXISTS branch and writes its tombstone exactly as before.
--
-- ---------------------------------------------------------------------------------------
-- WHAT WAS BROKEN
-- ---------------------------------------------------------------------------------------
-- DELETE FROM points cascades to point_positions (ON DELETE CASCADE), which fires this trigger's
-- DELETE arm, which inserted a tombstone into point_position_history for OLD.point_id — the point being
-- deleted in that same statement. point_position_history.point_id is NOT NULL REFERENCES points(id),
-- so the insert violated the foreign key (23503) and the whole delete rolled back. Every point delete
-- failed: 16/16 in the P1078 e2e cleanup, and reproduced on test 2026-09-11 inside an
-- always-rolled-back block (the counts were re-read afterwards and were unchanged).
--
-- ---------------------------------------------------------------------------------------
-- WHY EXISTS IS THE RIGHT TEST — MEASURED, NOT ASSUMED
-- ---------------------------------------------------------------------------------------
-- The guard rests on a visibility fact: when the cascade fires this row trigger, the parent point's
-- deletion is already visible to a query inside it. Measured on test 2026-09-11 by redefining this
-- function inside a DO block that always raised at the end, so the redefinition itself rolled back:
--   * whole-point delete  -> SUCCEEDED, 5 positions cascaded, 0 history rows left for the point;
--   * position-only delete (the erasure path) -> tombstone still written, history 0 -> 1.
-- The live function was verified unchanged afterwards.
--
-- ---------------------------------------------------------------------------------------
-- THE SAME DEFECT ON THE OTHER PARENT — found while fixing this one
-- ---------------------------------------------------------------------------------------
-- point_position_history.user_id is ALSO `REFERENCES profiles(id) ON DELETE CASCADE`. Deleting a
-- profile cascades to point_positions, fires the same arm, and the tombstone references the profile
-- being deleted: 23503 on point_position_history_user_id_fkey, reproduced on test 2026-09-11 in an
-- always-rolled-back block. erase_my_account survives it only because it deletes the user's
-- point_positions explicitly BEFORE deleting auth.users (20260903090000_p520_erasure_hardening_2.sql);
-- any other way of removing a user who holds positions fails — the Supabase dashboard's user delete,
-- and e2e's deleteTestUser, which swallows the error as a warning, so test users accumulate. Same arm,
-- same mechanism, same guard; the history rows cascade away with the profile anyway.
--
-- Skipping the tombstone on a point or profile delete loses nothing. point_position_history.point_id is itself
-- ON DELETE CASCADE, so every history row of a deleted point goes in the same statement; a tombstone
-- written there would be deleted in the same instant, if the foreign key let it exist at all.

CREATE OR REPLACE FUNCTION log_position_change()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.point_position_history (point_id, user_id, position, reasoning)
    VALUES (NEW.point_id, NEW.user_id, NEW.position, NEW.reasoning);
  ELSIF TG_OP = 'UPDATE' AND (OLD.position IS DISTINCT FROM NEW.position OR OLD.reasoning IS DISTINCT FROM NEW.reasoning) THEN
    INSERT INTO public.point_position_history (point_id, user_id, position, reasoning)
    VALUES (NEW.point_id, NEW.user_id, NEW.position, NEW.reasoning);
  ELSIF TG_OP = 'DELETE' THEN
    -- P1292: only when BOTH parents survive. Deleting a point or a profile cascades its history
    -- away anyway, and a tombstone referencing a parent deleted in the same statement violates the FK.
    -- Schema-qualified on purpose: SET search_path = public still searches pg_temp FIRST for
    -- relations, so an unqualified name here could be shadowed by a session's temp table and the
    -- tombstone silently skipped (codex, 2026-09-11; measured).
    -- The INSERT TARGET carries that same exposure and was missed by the first pass: only the
    -- EXISTS subqueries were qualified, so the audit row itself could still land in a shadowing
    -- pg_temp.point_position_history while the delete reported success (codex, 2026-09-14).
    -- All three arms are qualified, and the assertion below refuses any unqualified target.
    INSERT INTO public.point_position_history (point_id, user_id, position, reasoning)
    SELECT OLD.point_id, OLD.user_id, NULL, NULL
     WHERE EXISTS (SELECT 1 FROM public.points p WHERE p.id = OLD.point_id)
       AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = OLD.user_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Verification — fail loud, in the migration itself
-- ============================================================================
DO $$
DECLARE
  v_src  text;
  v_def  boolean;
  v_cfg  text[];
  v_trig text;
BEGIN
  SELECT p.prosrc, p.prosecdef, p.proconfig INTO v_src, v_def, v_cfg
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'log_position_change';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'P1292: log_position_change() is missing';
  END IF;
  IF v_src NOT LIKE '%WHERE EXISTS (SELECT 1 FROM public.points p WHERE p.id = OLD.point_id)%' THEN
    RAISE EXCEPTION 'P1292: the DELETE arm lost its point-exists guard — every point delete fails again';
  END IF;
  IF v_src NOT LIKE '%EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = OLD.user_id)%' THEN
    RAISE EXCEPTION 'P1292: the DELETE arm lost its profile-exists guard — deleting a user who holds a position fails again';
  END IF;
  IF v_src NOT LIKE '%VALUES (NEW.point_id, NEW.user_id, NEW.position, NEW.reasoning)%' THEN
    RAISE EXCEPTION 'P1292: the INSERT/UPDATE arms changed — this migration must touch the DELETE arm only';
  END IF;
  -- Every write target must be schema-qualified, or a session temp table can shadow the audit
  -- table inside this SECURITY DEFINER function and the history silently loses the row.
  IF v_src ~ 'INSERT INTO[[:space:]]+point_position_history' THEN
    RAISE EXCEPTION 'P1292: an INSERT target lost its public. qualification — pg_temp can shadow the audit table';
  END IF;
  IF (length(v_src) - length(replace(v_src, 'INSERT INTO public.point_position_history', ''))) / length('INSERT INTO public.point_position_history') <> 3 THEN
    RAISE EXCEPTION 'P1292: expected exactly 3 qualified INSERT targets in log_position_change';
  END IF;
  IF NOT v_def THEN
    RAISE EXCEPTION 'P1292: log_position_change lost SECURITY DEFINER — the history INSERT policy would refuse the trigger (the 20260409 bug)';
  END IF;
  IF v_cfg IS NULL OR NOT ('search_path=public' = ANY(v_cfg)) THEN
    RAISE EXCEPTION 'P1292: log_position_change search_path is %, expected public', v_cfg;
  END IF;

  SELECT pg_get_triggerdef(t.oid) INTO v_trig
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.point_positions'::regclass
     AND t.tgfoid = 'public.log_position_change'::regproc
     AND NOT t.tgisinternal;
  IF v_trig IS NULL
     OR v_trig NOT ILIKE '%AFTER%' OR v_trig NOT ILIKE '%DELETE%'
     OR v_trig NOT ILIKE '%INSERT%' OR v_trig NOT ILIKE '%UPDATE%' THEN
    RAISE EXCEPTION 'P1292: the position trigger binding changed: %', v_trig;
  END IF;

  RAISE NOTICE 'P1292: point and profile deletes now cascade cleanly; a position-only delete still writes its tombstone.';
END;
$$;
