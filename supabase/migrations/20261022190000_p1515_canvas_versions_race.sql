-- diffed against: 20261022180000_p1515_canvas_versions_integrity.sql (_canvas_point_one_version and
--   _canvas_version_keeps_points_single, their only live bodies). Each body below is byte-for-byte its source except for
--   the one added lock statement.
-- P1515 phase 5 review (Codex, round 2): a race and two ways around the one-version-per-point check.
--
-- client-safe: the canvas feature is unreleased (prod holds none of it). Two trigger bodies replaced, one trigger
--   re-created with a longer column list, one trigger added; no signature, grant or policy changes.
--
-- WHAT CHANGES
--   1. RACE. T1 inserts version b of a canvas while T2 tags a point canvas_a and canvas_b: each check ran against a
--      snapshot that could not see the other's uncommitted write, so both passed. Both trigger functions now take
--      pg_advisory_xact_lock on ONE key per owner as their first statement. The lock is held to the end of the
--      transaction, so the second writer waits until the first has COMMITTED; the check that follows is a new SQL
--      statement inside a VOLATILE plpgsql function, and under READ COMMITTED (the Postgres default, which PostgREST
--      and the Management API use) each statement takes a fresh snapshot, so it sees that commit and refuses. Under
--      REPEATABLE READ or SERIALIZABLE the snapshot is fixed at the first statement and this would not hold; the
--      database default is not changed and nothing here runs in those modes.
--   2. canvas_versions UPDATE bypassed the check (a rename or a move re-pointed a version after its insert was
--      checked). canvas_id, owner_id and name are now immutable: a BEFORE UPDATE trigger refuses a change to any of them.
--   3. The points trigger did not fire when only first_validator_id changed, so handing a two-version point to the
--      canvas's owner skipped the check. first_validator_id is in the UPDATE OF list.

BEGIN;

CREATE OR REPLACE FUNCTION public._canvas_point_one_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.system_tags IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(NEW.system_tags) t WHERE t LIKE 'canvas\_%') THEN
    RETURN NEW;
  END IF;
  -- Serialize with every other writer of this owner's versions or version tags (see the header).
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || NEW.first_validator_id::text, 0));
  IF EXISTS (
    SELECT 1
      FROM unnest(NEW.system_tags) t
      JOIN public.canvas_versions v ON v.owner_id = NEW.first_validator_id AND v.name = lower(substr(t, 8))
     WHERE t LIKE 'canvas\_%'
     GROUP BY v.canvas_id
    HAVING count(DISTINCT v.name) > 1
  ) THEN
    RAISE EXCEPTION 'a point can be on only one version of a canvas' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._canvas_version_keeps_points_single()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('p1515:canvas_versions:' || NEW.owner_id::text, 0));
  IF EXISTS (
    SELECT 1
      FROM public.points p
      JOIN public.canvas_versions v ON v.canvas_id = NEW.canvas_id
     WHERE p.first_validator_id = NEW.owner_id
       AND p.system_tags @> ARRAY['canvas_' || NEW.name]::text[]
       AND p.system_tags @> ARRAY['canvas_' || v.name]::text[]
       AND v.name <> NEW.name
  ) THEN
    RAISE EXCEPTION 'a point can be on only one version of a canvas' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_p1515_point_one_version ON public.points;
CREATE TRIGGER trg_p1515_point_one_version
  BEFORE INSERT OR UPDATE OF system_tags, first_validator_id ON public.points
  FOR EACH ROW EXECUTE FUNCTION public._canvas_point_one_version();

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
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._canvas_version_immutable() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_p1515_version_immutable ON public.canvas_versions;
CREATE TRIGGER trg_p1515_version_immutable
  BEFORE UPDATE ON public.canvas_versions
  FOR EACH ROW EXECUTE FUNCTION public._canvas_version_immutable();

COMMIT;
