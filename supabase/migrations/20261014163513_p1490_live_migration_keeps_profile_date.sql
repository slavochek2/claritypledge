-- P1490 (part 3): the /live -> authenticated profile migration keeps the original profile date.
--
-- diffed against: 20261014071137_p1137_live_migration_carries_test_flag.sql (migrate_live_profile,
--   its only definition). diff: the legacy row's created_at is read in the same locked loop that
--   reads is_test_account, and the insert-only create of the caller's row writes it (column default
--   expression when there is no legacy row). Everything else is byte-identical: owner-first lock
--   order, the anonymous-owner check under the lock, case-insensitive candidate match with the
--   ambiguity refusal, the insert-only create, upsert_my_profile fill and the flag carry. The
--   REVOKE/GRANT pair re-applies P1137's ACL verbatim.
-- client-safe: signature, return shape and grants unchanged; the one deployed caller (the sign-in
--   callback's /live branch) sends the same p_data and reads the same result.
--
-- created_at is shown publicly as the pledge date. The migration deletes the legacy row and creates
-- the caller's row, so without the carry every migrated user's date reset to the migration time.
-- The value comes only from server-side state of the locked legacy row, never from p_data. This
-- function runs in owner context, so guard_profile_created_at (P1490 part 1), which pins the
-- column for anon/authenticated writes only, does not override the carried value.
--
-- Known limitation (unchanged from P1137): a concurrent legacy-profile migration and account
-- erasure of the same legacy owner can, rarely, abort one of the two with a deadlock error. Both
-- fail safe (no partial state). Prod has no anonymous-owned profiles and nothing sends
-- source=live; revisit if that path returns.

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
  v_old_created timestamptz;
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
    SELECT p.id, COALESCE(p.is_test_account, false) AS flag, p.created_at
    FROM public.profiles p
    WHERE lower(p.email) = lower(v_email) AND p.id <> v_id
    ORDER BY p.id
    FOR UPDATE OF p
  LOOP
    v_candidates := v_candidates + 1;
    v_profiles := v_profiles || r.id;
    v_old_id   := r.id;
    v_old_flag := r.flag;
    v_old_created := r.created_at;
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
    v_old_created := NULL;
  END IF;

  -- Insert-only create: unique violation on id if the caller's row exists or appears concurrently.
  -- P1490: created_at (the public pledge date) is carried from the locked legacy row; with no
  -- legacy row it is the column default's own expression. Never read from p_data.
  INSERT INTO public.profiles (id, email, name, slug, is_verified, has_pledged, created_at)
  VALUES (v_id, v_email, p_data->>'name', p_data->>'slug', false, false,
          COALESCE(v_old_created, pg_catalog.timezone('utc'::text, pg_catalog.now())));

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

-- CREATE OR REPLACE keeps the existing ACL, but re-apply P1137's lock explicitly (both forms:
-- Supabase default privileges grant EXECUTE to anon and authenticated directly).
REVOKE EXECUTE ON FUNCTION public.migrate_live_profile(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.migrate_live_profile(jsonb) TO authenticated;

COMMENT ON FUNCTION public.migrate_live_profile(jsonb) IS
  'P1137/P1490: /live -> authenticated profile migration in one transaction. Migrates only a profile '
  'owned by an anonymous auth user whose email matches the caller''s confirmed email (case-insensitive, '
  'unambiguous); carries is_test_account and created_at from it. Never takes either from the caller.';
