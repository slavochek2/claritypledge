-- P1485: pin the server-maintained profile counters on client writes.
--
-- client-safe: no deployed client writes either column (updateProfile, upsert_my_profile and
--   AuthCallbackPage never send them). Their maintainers are the story_verifications counter
--   trigger and erase_my_account(), both SECURITY DEFINER, so they run as the owner and are
--   unaffected. A client write still saves every other column it carries.
-- new function: guard_profile_counters() -- nothing replaced, no existing body edited.
--
-- ears_count and verification_session_count are maintained by the database. Same technique as
-- P880 (guard_profile_trust_columns) and P1453 (guard_profile_banner_credit): for anon /
-- authenticated writes, INSERT starts both counters at 0 and UPDATE keeps the stored values.
-- Owner-context writers and service_role (admin tooling, test seeding) pass through.
--
-- A separate function, as P1453 did, so the shared trust-column guard is not redefined.
-- SECURITY INVOKER (the default) on purpose: under SECURITY DEFINER current_user would always be
-- the owner and the client-role check would never match.

CREATE OR REPLACE FUNCTION public.guard_profile_counters()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.ears_count                 := 0;
      NEW.verification_session_count := 0;
    ELSE  -- UPDATE
      NEW.ears_count                 := OLD.ears_count;
      NEW.verification_session_count := OLD.verification_session_count;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- A trigger function is not callable through PostgREST and needs no EXECUTE grant to fire, so
-- no client role is given one. Both forms: Supabase default privileges grant EXECUTE on new
-- public functions to anon and authenticated directly, not only through PUBLIC.
REVOKE ALL ON FUNCTION public.guard_profile_counters() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_profile_counters() FROM anon, authenticated;

DROP TRIGGER IF EXISTS guard_profile_counters ON public.profiles;
CREATE TRIGGER guard_profile_counters
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_counters();

COMMENT ON FUNCTION public.guard_profile_counters() IS
  'P1485: pins profiles.ears_count / verification_session_count on anon/authenticated writes. '
  'Maintained only by the story_verifications counter trigger and erase_my_account (owner context) '
  'and by service_role.';
