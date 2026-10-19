-- P1508: system tags (box tags included) are written only by privileged roles.
-- diffed against: 20260403120000_p630_system_tags.sql (protect_system_tags; also matches the live
-- definition on test, read before writing this)
--
-- Clarity Canvas places points into boxes by `canvas:<box>` system tags. Those tags must come
-- from the service-role seed (and later the chat agent), never from a client. The P630 guard
-- covered UPDATE only; this extends the same function to INSERT on points and stories.
--
--   INSERT by a client role with a non-empty system_tags  -> rejected (42501)
--   UPDATE by a client role that changes system_tags      -> silently restored (P630, unchanged)
--   service_role, postgres, SECURITY DEFINER functions    -> unaffected
--
-- The role test is `current_user`, not `current_setting('role')`. Measured on test: inside a
-- SECURITY DEFINER function the `role` setting still reads 'authenticated' while current_user
-- reads the function owner. `current_user` is what tells a direct client write apart from a
-- definer path, and matches the profiles trust guard (P880).
--
-- Client safety: every client insert path already sends `system_tags: []` or omits it
-- (points-service-real.ts, stories-service-real.ts, letters-service.ts), so the app is unaffected.

BEGIN;

CREATE OR REPLACE FUNCTION public.protect_system_tags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      IF COALESCE(cardinality(NEW.system_tags), 0) > 0 THEN
        RAISE EXCEPTION 'system_tags are set by the system only'
          USING ERRCODE = '42501';
      END IF;
    ELSIF OLD.system_tags IS DISTINCT FROM NEW.system_tags THEN
      NEW.system_tags := OLD.system_tags;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_system_tags_points ON public.points;
CREATE TRIGGER trg_protect_system_tags_points
  BEFORE INSERT OR UPDATE ON public.points
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_system_tags();

DROP TRIGGER IF EXISTS trg_protect_system_tags_stories ON public.stories;
CREATE TRIGGER trg_protect_system_tags_stories
  BEFORE INSERT OR UPDATE ON public.stories
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_system_tags();

COMMIT;
