-- P1137: is_test_account is server-owned on INSERT too.
--
-- client-safe: no deployed client sets is_test_account on insert. Profile creation goes through
--   upsert_my_profile / migrate_live_profile (SECURITY DEFINER, owner context) and the edge
--   functions' service_role inserts — none of them a client role, so none is affected. A client
--   insert that does include the column still succeeds for every other column.
-- new function: guard_profile_test_account() — nothing replaced, no existing body edited.
--
-- is_test_account is a trust column (P571). Like the other trust columns (P880), it is now
-- server-owned on INSERT as well as UPDATE:
--   * client-role INSERT (anon / authenticated): starts unflagged;
--   * owner-context writers (migrate_live_profile's carry, upsert_my_profile) and service_role
--     (admin tooling, test seeding) pass through unchanged.
--
-- UPDATE is deliberately NOT pinned here: the P571 policy already refuses a client change with an
-- error, and pinning it in a BEFORE trigger would turn that loud refusal into a silent no-op.
--
-- A separate function rather than an edit of guard_profile_trust_columns, following P1453
-- (guard_profile_banner_credit) and P1485 (guard_profile_counters), so that shared function is not
-- redefined. SECURITY INVOKER (the default) on purpose: under SECURITY DEFINER current_user would
-- always be the owner and the client-role check would never match.

CREATE OR REPLACE FUNCTION public.guard_profile_test_account()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    NEW.is_test_account := false;
  END IF;
  RETURN NEW;
END;
$$;

-- A trigger function is not callable through PostgREST and needs no EXECUTE grant to fire. Both
-- forms: Supabase default privileges grant EXECUTE on new public functions to anon and authenticated
-- directly, not only through PUBLIC.
REVOKE ALL ON FUNCTION public.guard_profile_test_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_profile_test_account() FROM anon, authenticated;

DROP TRIGGER IF EXISTS guard_profile_test_account ON public.profiles;
CREATE TRIGGER guard_profile_test_account
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_test_account();

COMMENT ON FUNCTION public.guard_profile_test_account() IS
  'P1137: client-role (anon/authenticated) profile INSERTs start with is_test_account = false. '
  'Owner-context writers and service_role pass through; UPDATE stays refused by the P571 policy.';
