-- P1137: the /live -> authenticated profile migration keeps is_test_account.
--
-- client-safe: (1) one BRAND-NEW function (migrate_live_profile); its REVOKE EXECUTE is immediately
--   followed by an authenticated GRANT, and no deployed bundle calls it yet. (2) Client-role DELETE
--   on profiles is removed (policy dropped, privilege revoked). No deployed client deletes a
--   profile row except the pre-P1137 /live migration branch, which nothing sends users to (no
--   client emits source=live) and which has no rows to act on (prod has no profile owned by an
--   anonymous auth user). Account erasure runs through erase_my_account() (SECURITY DEFINER),
--   admin/test cleanup through service_role. Deploy order: apply this migration BEFORE the P1137
--   frontend bundle, which calls the new function.
--
-- Known limitation: a concurrent legacy-profile migration and account erasure of the same legacy
-- owner can, rarely, abort one of the two with a deadlock error. Both fail safe (no partial state).
-- Prod has no anonymous-owned profiles and nothing sends source=live; revisit if that path returns.
--
-- Bug: AuthCallbackPage's /live migration branch deleted the old profile row from the client and
-- then created the new row through upsert_my_profile, whose INSERT never writes is_test_account.
-- The new row always took the column default (false), and since the old row was already gone, no
-- later server call could recover the value. is_test_account is a trust column (P571), so the
-- client cannot carry it either.
--
-- Fix: one SECURITY DEFINER function that does the whole migration in a single transaction.
--   1. Candidates are profiles whose email equals the caller's confirmed auth email case-
--      insensitively (the same rule get_my_profile_by_email uses to find them), under a different
--      id. All candidates are locked. More than one is refused as ambiguous.
--   2. A candidate is migrated only if it is a legacy /live profile: its owner is an ANONYMOUS
--      auth user (the pre-P396 guest identity). Any other owner is refused — an address match alone
--      never authorizes removing another account's profile. Candidate owners' auth.users rows are
--      locked FIRST (FOR SHARE, id order), then their profiles — the same order account erasure
--      takes them, so the two cannot deadlock — and the candidate set must match the locked owners.
--      is_anonymous is read under that lock right before the delete, so an anonymous -> permanent
--      conversion cannot commit in between: it waits for this transaction, or, if it committed
--      first, the locked read sees it.
--   3. The legacy row's is_test_account is read, the row is deleted, and the caller's row is
--      created INSERT-ONLY: a bare insert of the caller's id fails if any row for the caller exists
--      or is being created concurrently, so the steps below can never touch a pre-existing row.
--      upsert_my_profile (called, not copied, so its validation cannot drift) then fills that row.
--   4. is_test_account = true is set on the new row only when the legacy row had it.
--
-- The value always comes from server-side state of the legacy row: the function takes no flag
-- argument, ignores any is_test_account key in p_data, and never writes false. A failed create
-- rolls back the delete with it, so the legacy row survives and the client can retry.
--
-- Client roles can no longer DELETE profiles at all. Profile removal is server-side only (account
-- erasure, this migration, service_role), so a client cannot drop its own row and re-create it to
-- reset server-owned classification.

-- new function
CREATE OR REPLACE FUNCTION public.migrate_live_profile(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id         uuid := auth.uid();
  v_email      text;
  v_confirmed  boolean;
  v_candidates integer := 0;
  v_old_id     uuid;
  v_old_flag   boolean := false;
  v_old_anon   boolean := false;
  v_owners     uuid[];
  v_profiles   uuid[] := '{}';
  r            record;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'migrate_live_profile requires an authenticated caller';
  END IF;

  SELECT u.email, (u.email_confirmed_at IS NOT NULL)
    INTO v_email, v_confirmed
  FROM auth.users u WHERE u.id = v_id;

  IF v_email IS NULL OR NOT COALESCE(v_confirmed, false) THEN
    RAISE EXCEPTION 'migrate_live_profile requires a confirmed email';
  END IF;

  -- Migration creates the caller's row; it never touches an existing one. (The insert-only create
  -- below enforces this atomically; this check only gives the common case a clear message.)
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_id) THEN
    RAISE EXCEPTION 'migrate_live_profile: caller already has a profile';
  END IF;

  -- Lock order matches account erasure (erase_my_account deletes the auth.users row, which then
  -- cascades to the profile): candidate OWNERS first, in id order, then their profiles. Taking
  -- them the other way round could deadlock against a concurrent erasure.
  -- profiles.id references auth.users, so every candidate profile has an owner row to lock.
  SELECT COALESCE(array_agg(o.id ORDER BY o.id), '{}') INTO v_owners
  FROM (
    SELECT u.id FROM auth.users u
    WHERE u.id IN (SELECT p.id FROM public.profiles p
                   WHERE lower(p.email) = lower(v_email) AND p.id <> v_id)
    ORDER BY u.id
    FOR SHARE OF u
  ) o;

  FOR r IN
    SELECT p.id, COALESCE(p.is_test_account, false) AS flag
    FROM public.profiles p
    WHERE lower(p.email) = lower(v_email) AND p.id <> v_id
    ORDER BY p.id
    FOR UPDATE OF p
  LOOP
    v_candidates := v_candidates + 1;
    v_profiles := v_profiles || r.id;
    v_old_id   := r.id;
    v_old_flag := r.flag;
  END LOOP;

  -- Every candidate profile must be one whose owner is already locked; a candidate that appeared
  -- between the two statements is refused rather than locked out of order.
  IF v_profiles IS DISTINCT FROM v_owners THEN
    RAISE EXCEPTION 'migrate_live_profile: legacy profile changed concurrently, retry';
  END IF;

  IF v_candidates > 1 THEN
    RAISE EXCEPTION 'migrate_live_profile: ambiguous legacy profile';
  END IF;

  IF v_candidates = 1 THEN
    -- Provenance, read under the owner-row lock held since the first statement, immediately
    -- before the delete.
    SELECT COALESCE(u.is_anonymous, false) INTO v_old_anon
    FROM auth.users u WHERE u.id = v_old_id
    FOR SHARE;
    IF NOT COALESCE(v_old_anon, false) THEN
      RAISE EXCEPTION 'migrate_live_profile: matching profile is not a legacy /live profile';
    END IF;
    DELETE FROM public.profiles WHERE id = v_old_id;
  ELSE
    v_old_flag := false;
  END IF;

  -- Insert-only create: unique violation on id if the caller's row exists or appears concurrently.
  INSERT INTO public.profiles (id, email, name, slug, is_verified, has_pledged)
  VALUES (v_id, v_email, p_data->>'name', p_data->>'slug', false, false);

  PERFORM public.upsert_my_profile(p_data);

  IF v_old_flag THEN
    UPDATE public.profiles SET is_test_account = true WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'migrated', v_candidates = 1);
END;
$$;

-- Supabase's default privileges grant EXECUTE on new public functions to anon AND authenticated,
-- so REVOKE FROM PUBLIC alone is not enough (P683/P877/P880 precedent).
REVOKE EXECUTE ON FUNCTION public.migrate_live_profile(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.migrate_live_profile(jsonb) TO authenticated;

COMMENT ON FUNCTION public.migrate_live_profile(jsonb) IS
  'P1137: /live -> authenticated profile migration in one transaction. Migrates only a profile owned '
  'by an anonymous auth user whose email matches the caller''s confirmed email (case-insensitive, '
  'unambiguous); carries is_test_account from it. Never takes the flag from the caller.';

-- Profiles DELETE: server-side only. Both forms of the revoke: Supabase's default privileges grant
-- table privileges to anon and authenticated directly, not only through PUBLIC.
DROP POLICY IF EXISTS "Users can delete profiles by email match" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
REVOKE DELETE ON public.profiles FROM PUBLIC;
REVOKE DELETE ON public.profiles FROM anon, authenticated;
