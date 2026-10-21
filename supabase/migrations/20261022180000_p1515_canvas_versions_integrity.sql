-- new function: _canvas_point_one_version() and _canvas_version_keeps_points_single() are new trigger functions; no earlier
--   migration defines them, and nothing else is redefined below.
-- P1515 phase 5 review (Codex): two integrity holes in canvas_versions (20261022170000).
--
-- client-safe: the canvas feature is unreleased (prod holds none of it). Only constraints and triggers are added; no
--   function signature and no grant changes. The triggers run for the service role too (the only writer of versions).
--
-- WHAT CHANGES
--   1. canvas_versions.owner_id was not tied to the canvas's owner: a bad service-role insert could map B's version
--      name onto A's canvas, and A's admitted readers would then read B's points. (canvas_id, owner_id) is now a foreign
--      key to canvases (id, owner_id), which needs the unique pair on canvases.
--   2. Positions are keyed (point, user) and added stories (canvas, point), so a point on two versions of one canvas would
--      share them across both: not "per version". A point now carries at most ONE version tag of the same canvas:
--      a trigger on points refuses a second canvas_<v> tag of a canvas that already has one on the row (insert and update
--      of system_tags), and a trigger on canvas_versions refuses a version whose name would put an existing point on two
--      versions. A new version uses new point rows.

BEGIN;

ALTER TABLE public.canvases ADD CONSTRAINT canvases_id_owner_key UNIQUE (id, owner_id);
ALTER TABLE public.canvas_versions
  ADD CONSTRAINT canvas_versions_canvas_owner_fkey FOREIGN KEY (canvas_id, owner_id)
  REFERENCES public.canvases (id, owner_id) ON DELETE CASCADE;

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
REVOKE ALL ON FUNCTION public._canvas_point_one_version() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_p1515_point_one_version ON public.points;
CREATE TRIGGER trg_p1515_point_one_version
  BEFORE INSERT OR UPDATE OF system_tags ON public.points
  FOR EACH ROW EXECUTE FUNCTION public._canvas_point_one_version();

CREATE OR REPLACE FUNCTION public._canvas_version_keeps_points_single()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
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
REVOKE ALL ON FUNCTION public._canvas_version_keeps_points_single() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_p1515_version_points_single ON public.canvas_versions;
CREATE TRIGGER trg_p1515_version_points_single
  BEFORE INSERT ON public.canvas_versions
  FOR EACH ROW EXECUTE FUNCTION public._canvas_version_keeps_points_single();

COMMIT;
