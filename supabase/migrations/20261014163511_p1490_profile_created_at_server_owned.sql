-- P1490 (part 1): profiles.created_at is server-owned on client-role writes.
--
-- client-safe: no deployed client writes created_at. Profile creation goes through
--   upsert_my_profile / migrate_live_profile (SECURITY DEFINER, owner context) and service_role;
--   updateProfile, the terms re-acceptance write and the sign-in callback never send the column.
--   A client write that does carry it still saves every other column.
-- new function: guard_profile_created_at() — nothing replaced, no existing body edited.
--
-- created_at is shown publicly as the profile's pledge date, so it is a server-owned value like
-- the P880 trust columns. For anon / authenticated writes:
--   * UPDATE keeps the stored value (founder decision 2026-10-14);
--   * INSERT takes the server's time — the column default's own expression — whatever the
--     request carries.
-- Owner-context writers (upsert_my_profile, migrate_live_profile, erasure) and service_role
-- (admin tooling, test seeding) pass through unchanged.
--
-- A separate function rather than an edit of guard_profile_trust_columns, following P1453,
-- P1485 and P1137, so that shared function is not redefined. SECURITY INVOKER (the default) on
-- purpose: under SECURITY DEFINER current_user would always be the owner and the client-role
-- check would never match.

CREATE OR REPLACE FUNCTION public.guard_profile_created_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_at := pg_catalog.timezone('utc'::text, pg_catalog.now());
    ELSE  -- UPDATE
      NEW.created_at := OLD.created_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- A trigger function is not callable through PostgREST and needs no EXECUTE grant to fire, so no
-- client role is given one. Both forms: Supabase default privileges grant EXECUTE on new public
-- functions to anon and authenticated directly, not only through PUBLIC.
REVOKE ALL ON FUNCTION public.guard_profile_created_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_profile_created_at() FROM anon, authenticated;

DROP TRIGGER IF EXISTS guard_profile_created_at ON public.profiles;
CREATE TRIGGER guard_profile_created_at
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_created_at();

COMMENT ON FUNCTION public.guard_profile_created_at() IS
  'P1490: pins profiles.created_at (the public pledge date) on anon/authenticated writes: INSERT '
  'takes the server time, UPDATE keeps the stored value. Owner-context writers and service_role '
  'pass through.';
