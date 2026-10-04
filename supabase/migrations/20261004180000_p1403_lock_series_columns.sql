-- P1403 review (Codex, 2026-10-04): events UPDATE RLS lets a host change any column on their
-- own row, so a host could set series_slug = 'social-hike' and borrow the series' reviews and
-- photos for an unrelated event. These three columns are written by the publishing skill with
-- the service role only; refuse every other writer at the database boundary.
-- new function
CREATE OR REPLACE FUNCTION public.p1403_guard_series_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.series_slug IS NOT NULL OR NEW.hike_details IS NOT NULL OR NEW.route_geojson IS NOT NULL THEN
      RAISE EXCEPTION 'series_slug, hike_details and route_geojson are set by the service role only'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.series_slug IS DISTINCT FROM OLD.series_slug
     OR NEW.hike_details IS DISTINCT FROM OLD.hike_details
     OR NEW.route_geojson IS DISTINCT FROM OLD.route_geojson THEN
    RAISE EXCEPTION 'series_slug, hike_details and route_geojson are set by the service role only'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS p1403_guard_series_columns ON public.events;
CREATE TRIGGER p1403_guard_series_columns
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.p1403_guard_series_columns();
