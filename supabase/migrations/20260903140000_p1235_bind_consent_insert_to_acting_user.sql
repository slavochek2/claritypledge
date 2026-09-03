-- P1235: bind the consent audit trail's INSERT policies to the acting user.
--
-- Defect (pre-existing since 20250101_initial_schema.sql, re-declared identically in
-- 20260107_p37_consent_mechanism.sql): the INSERT policies on `terms_acceptances` and
-- `session_consents` verified only that the CALLER was authenticated, never that the row's
-- `user_id` named that caller. Any authenticated user could write a consent record naming any
-- other user, and neither table has an UPDATE or DELETE policy, so the forged row was permanent
-- from the client's perspective. These tables are the GDPR Art. 7(1) "demonstrate consent"
-- evidence, so an unbound writer voids the evidence.
--
-- Applies decisions.md 2026-08-10: "Every INSERT policy whose table has an owner/author column
-- must include `<owner_column> = auth.uid()` in WITH CHECK." P1032/P1034 fixed the same class on
-- stories/points/story_points. P1038's schema-wide audit classified these two tables as
-- "not-applicable (no owner column)" — a false negative: `user_id` IS the owner column, it simply
-- carries no foreign key (a deliberate retention choice, see 20260107 header).
--
-- The original in-file justification for the missing binding was mistaken. It read: "Profile
-- creation happens BEFORE the profile row exists, so we can't check auth.uid() = user_id."
-- `auth.uid() = user_id` compares two UUIDs; it does not read `profiles` and does not require a
-- profile row.
--
-- client-safe: no frontend change is required or implied. All four client writers
-- (api.ts recordTermsAcceptance / recordSessionConsent, letters-service.ts
-- submitLetterResponseAuthenticated, letter-reading-page.tsx handleStaleTermsAccept) already pass
-- the session user's own id, verified by grep over every call site. The three service-role edge
-- functions (create-and-sign, create-and-open-letter, confirm-letter-response) write on behalf of
-- other users and are unaffected: service_role carries rolbypassrls = true, so RLS never applies
-- to them. Scoping TO authenticated therefore removes no legitimate writer.

-- ============================================================================
-- 1. terms_acceptances
-- ============================================================================
ALTER TABLE terms_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can record acceptance" ON terms_acceptances;
CREATE POLICY "Authenticated users can record acceptance"
  ON terms_acceptances FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 2. session_consents
-- ============================================================================
ALTER TABLE session_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can record consent" ON session_consents;
CREATE POLICY "Authenticated users can record consent"
  ON session_consents FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 3. Verification
-- ============================================================================
-- Asserts by NORMALISED pg_get_expr equality, never by substring match. A substring assert for
-- 'auth.uid()' passes on the very predicate this migration replaces, which mentioned auth.uid()
-- without binding anything.
--
-- Normalisation-immunity is obtained by making Postgres render the INTENDED expression itself:
-- a throwaway reference policy carrying the target predicate is created on the same table, its
-- rendered text is read back through the same pg_get_expr call, and the real policy is compared
-- to that. Any rendering choice Postgres makes (parenthesisation, operand order, schema
-- qualification) applies identically to both sides, so the comparison cannot drift.
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

    -- Render the intended predicate through Postgres itself.
    EXECUTE format(
      'CREATE POLICY p1235_reference_probe ON %I FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())',
      t
    );
    SELECT pg_get_expr(p.polwithcheck, p.polrelid) INTO expected
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = t AND p.polname = 'p1235_reference_probe';
    EXECUTE format('DROP POLICY p1235_reference_probe ON %I', t);

    IF expected IS NULL THEN
      RAISE EXCEPTION 'P1235: could not render reference predicate for %', t;
    END IF;

    -- Exactly ONE INSERT policy may exist. Permissive policies are OR'd, so a second
    -- INSERT policy with a weaker WITH CHECK would silently re-open the hole this closes.
    SELECT count(*) INTO n_insert
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = t AND p.polcmd = 'a';
    IF n_insert <> 1 THEN
      RAISE EXCEPTION 'P1235: % has % INSERT policies, expected exactly 1 (permissive policies are OR-ed)', t, n_insert;
    END IF;

    SELECT pg_get_expr(p.polwithcheck, p.polrelid),
           ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles))
      INTO actual, actual_roles
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = t AND p.polcmd = 'a';

    IF actual IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'P1235: % INSERT WITH CHECK is % — expected %', t, coalesce(actual, '<null>'), expected;
    END IF;

    IF actual_roles IS DISTINCT FROM ARRAY['authenticated']::text[] THEN
      RAISE EXCEPTION 'P1235: % INSERT policy roles are % — expected {authenticated} (an unscoped policy defaults to PUBLIC, decisions.md 2026-08-10)',
        t, actual_roles::text;
    END IF;

    -- Invariant: an audit trail the subject can rewrite is not an audit trail.
    SELECT count(*) INTO n_writeable
      FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = t AND p.polcmd IN ('w', 'd');
    IF n_writeable <> 0 THEN
      RAISE EXCEPTION 'P1235: % gained % UPDATE/DELETE policies — the audit trail must stay append-only', t, n_writeable;
    END IF;

    IF NOT (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = t) THEN
      RAISE EXCEPTION 'P1235: RLS is not enabled on %', t;
    END IF;

    RAISE NOTICE 'P1235 OK: %.INSERT bound to % TO {authenticated}', t, actual;
  END LOOP;
END $$;
