-- P1243 part A: restore the post-erasure profile-existence guard on the consent INSERT
-- policies, alongside P1235's acting-user binding. BOTH conjuncts, on BOTH tables.
--
-- Regression. Two correct migrations, merged in timestamp order, produce an incorrect result:
--
--   20260902090000_p520_erasure_hardening.sql:95-111  set the INSERT policies on
--     terms_acceptances and session_consents to
--       auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid())
--
--   20260903140000_p1235_bind_consent_insert_to_acting_user.sql:35  runs LATER and replaces
--     both with WITH CHECK (user_id = auth.uid()) — dropping the profile-existence conjunct.
--
-- The P1235 author saw the extra conjunct on the test database, could not find it in any repo
-- file, concluded it was out-of-band drift by an unknown actor, and deliberately dropped it. It
-- was not drift: it was P520's hardening, applied to test from a branch that had not yet merged.
--
-- WHY BOTH ARE NEEDED, AND WHY NEITHER IMPLIES THE OTHER:
--
--   user_id = auth.uid()                      — binds the row to its writer. Stops an
--                                               authenticated user forging a consent record
--                                               that names somebody else. (P1235, GDPR Art. 7(1):
--                                               an unbound writer voids the consent evidence.)
--
--   EXISTS (SELECT 1 FROM profiles p          — requires the writer to still exist. After
--            WHERE p.id = auth.uid())           erase_my_account() deletes the profile and the
--                                               auth.users row, the browser's already-minted
--                                               access token stays valid for up to an hour and
--                                               auth.uid() keeps returning the erased UUID. This
--                                               conjunct is what stops that stale token writing
--                                               new consent rows for a person who no longer
--                                               exists. (P520, GDPR Art. 17.)
--
-- A post-erasure ghost writing `user_id = <its own erased uuid>` satisfies P1235's binding
-- perfectly. Binding says WHOSE row it is; existence says whether the writer is still a person.
--
-- These two tables carry NO foreign key to profiles — a deliberate retention choice (see the
-- 20260107 header, and decisions.md: "P520 needs ... explicit cleanup for terms_acceptances and
-- session_consents (no FK constraints)"). On an FK'd table the post-erasure insert would be
-- rejected by the FK regardless of policy. Here RLS is the only thing standing.
--
-- `auth.uid() IS NOT NULL` from the P520 form is dropped as redundant: `user_id = auth.uid()`
-- cannot be true when auth.uid() is NULL (NULL = x yields NULL, which WITH CHECK treats as a
-- refusal), and the EXISTS subquery cannot match a NULL id either.
--
-- client-safe: no frontend change. Every client writer already passes the session user's own id
-- (P1235 verified this by grep over all four call sites) and, being signed in, has a profile row.
-- The service-role edge functions carry rolbypassrls = true, so RLS never applies to them.

-- ============================================================================
-- 1. terms_acceptances
-- ============================================================================
ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can record acceptance" ON public.terms_acceptances;
CREATE POLICY "Authenticated users can record acceptance"
  ON public.terms_acceptances FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
  );

-- ============================================================================
-- 2. session_consents
-- ============================================================================
ALTER TABLE public.session_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can record consent" ON public.session_consents;
CREATE POLICY "Authenticated users can record consent"
  ON public.session_consents FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
  );

-- ============================================================================
-- 3. Verification
-- ============================================================================
-- Asserts by NORMALISED pg_get_expr equality, never by substring match. Substring matching is
-- what made this regression possible to miss: a substring assert for 'auth.uid()' passes on the
-- predicate this migration replaces, and a substring assert for 'user_id = auth.uid()' passes on
-- it too — the P1235 predicate is a literal prefix of the correct one. Only whole-predicate
-- equality distinguishes "bound" from "bound AND guarded".
--
-- Normalisation-immunity, as in P1235: a throwaway reference policy carrying the intended
-- predicate is created on the same table, its rendered text is read back through the same
-- pg_get_expr call, and the real policy is compared to that. Any rendering choice Postgres makes
-- (parenthesisation, operand order, schema qualification, subquery layout) applies identically to
-- both sides, so the comparison cannot drift.
DO $$
DECLARE
  t            text;
  expected     text;
  actual       text;
  actual_roles text[];
  n_insert     int;
  n_writeable  int;
BEGIN
  FOREACH t IN ARRAY ARRAY['terms_acceptances', 'session_consents'] LOOP

    EXECUTE format(
      'CREATE POLICY p1243_reference_probe ON public.%I FOR INSERT TO authenticated '
      'WITH CHECK (user_id = auth.uid() '
      'AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))',
      t
    );
    SELECT pg_get_expr(p.polwithcheck, p.polrelid) INTO expected
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = t AND p.polname = 'p1243_reference_probe';
    EXECUTE format('DROP POLICY p1243_reference_probe ON public.%I', t);

    IF expected IS NULL THEN
      RAISE EXCEPTION 'P1243: could not render reference predicate for %', t;
    END IF;

    -- Exactly ONE INSERT policy may exist. Permissive policies are OR'd, so a second INSERT
    -- policy with a weaker WITH CHECK would silently re-open both holes.
    SELECT count(*) INTO n_insert
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = t AND p.polcmd = 'a';
    IF n_insert <> 1 THEN
      RAISE EXCEPTION 'P1243: % has % INSERT policies, expected exactly 1 (permissive policies are OR-ed)', t, n_insert;
    END IF;

    SELECT pg_get_expr(p.polwithcheck, p.polrelid),
           ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles))
      INTO actual, actual_roles
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = t AND p.polcmd = 'a';

    IF actual IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'P1243: % INSERT WITH CHECK is % — expected %', t, coalesce(actual, '<null>'), expected;
    END IF;

    IF actual_roles IS DISTINCT FROM ARRAY['authenticated']::text[] THEN
      RAISE EXCEPTION 'P1243: % INSERT policy roles are % — expected {authenticated} (an unscoped policy defaults to PUBLIC, decisions.md 2026-08-10)',
        t, actual_roles::text;
    END IF;

    -- Invariant (P1235): an audit trail the subject can rewrite is not an audit trail.
    SELECT count(*) INTO n_writeable
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = t AND p.polcmd IN ('w', 'd');
    IF n_writeable <> 0 THEN
      RAISE EXCEPTION 'P1243: % gained % UPDATE/DELETE policies — the audit trail must stay append-only', t, n_writeable;
    END IF;

    IF NOT (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = t) THEN
      RAISE EXCEPTION 'P1243: RLS is not enabled on %', t;
    END IF;

    RAISE NOTICE 'P1243 OK: %.INSERT = %  TO {authenticated}', t, actual;
  END LOOP;
END $$;
