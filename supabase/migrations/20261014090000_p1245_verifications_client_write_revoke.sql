-- Migration: P1245 — clarity_verifications is read-only to client roles
-- Created: 2026-10-14
-- Spec: features/p1245_verification_writes_into_a_cancelled_session.md
--
-- WHY A REVOKE, NOT A PREDICATE. The spec first proposed adding a cancelled-session clause to this
-- table's INSERT policy (a join through clarity_chat_messages). That table has no client writer
-- and no client reader left to protect: the clarity-chat page that wrote it was deleted (P803,
-- /clarity-chat now redirects), createVerification / rateVerification / setVerificationPosition /
-- getVerificationsFor* / subscribeToVerifications in src/app/data/api.ts have zero call sites, no
-- edge function or script touches it, no view depends on it, and its newest prod row is from
-- 2025-12. Tuning a write policy nobody exercises would add a two-table join for no user and keep
-- a client write path open. Taking client write access away closes the gap the spec describes —
-- and the broader one under it (the INSERT policy carried no session binding at all) — in one move.
--
-- new object: none. Grants, one policy drop, a table comment.
--
-- client-safe: no deployed client inserts, updates or deletes clarity_verifications (grep of src/,
--   supabase/functions/, scripts/, e2e/ helpers; call sites verified, not assumed). The only
--   remaining writer is erase_my_account(), SECURITY DEFINER owned by the migration role, which
--   does not run under these grants; service_role keeps its privileges.
--
-- NOT CHANGED: SELECT. The "Verifications follow their session's visibility" policy and the anon /
--   authenticated SELECT grant stay exactly as P1207/P1302 left them — removing the read path is a
--   design change to P1302, not part of this fix.
--
-- CLOSES the residual recorded in 20260902090000_p520_erasure_hardening.sql §4 ("Residual,
-- accepted and NOT closed here ... filed as P1245"): with no client write privilege on this table,
-- a write into a cancelled session's conversation is no longer possible through it. That applied
-- migration is not edited; this note supersedes its residual.
--
-- If a client writer is ever revived, it needs a NEW insert policy that binds the row to a session
-- the caller is a party to AND refuses cancelled sessions — do not simply restore the dropped one.

SET search_path = '';

DROP POLICY IF EXISTS "Anyone can insert verifications" ON public.clarity_verifications;

-- Every non-read privilege, at table level. A table-level REVOKE also clears column-level grants of
-- the same privilege type (Postgres semantics, measured on test 2026-10-14 in a rolled-back probe),
-- so a stray column grant of INSERT/UPDATE/REFERENCES cannot survive this statement. The
-- has_any_column_privilege assertions below check that, rather than trusting it.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.clarity_verifications FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.clarity_verifications IS
  'Legacy clarity-chat paraphrases (page removed in P803). Read-only to client roles since P1245: '
  'written only by erase_my_account() (SECURITY DEFINER) and service_role. Reviving a client '
  'writer needs a new session-bound insert policy that also refuses cancelled sessions.';

-- ============================================================================
-- Verification — has_table_privilege resolves PUBLIC and role inheritance (P1063);
-- has_any_column_privilege also sees column-level grants, which has_table_privilege does not.
-- ============================================================================
DO $$
DECLARE
  r text;
  p text;
  v_erase regprocedure := to_regprocedure('public.erase_my_account()');
  v_owner text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH p IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(r, 'public.clarity_verifications', p) THEN
        RAISE EXCEPTION 'P1245: % still holds % on clarity_verifications', r, p;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH p IN ARRAY ARRAY['INSERT', 'UPDATE', 'REFERENCES'] LOOP
      IF has_any_column_privilege(r, 'public.clarity_verifications', p) THEN
        RAISE EXCEPTION 'P1245: % still holds column-level % on clarity_verifications', r, p;
      END IF;
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'public' AND tablename = 'clarity_verifications' AND cmd <> 'SELECT'
  ) THEN
    RAISE EXCEPTION 'P1245: a non-SELECT policy remains on clarity_verifications';
  END IF;

  -- Positive controls: the read path, the server path and the erasure path must survive.
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF NOT has_table_privilege(r, 'public.clarity_verifications', 'SELECT') THEN
      RAISE EXCEPTION 'P1245: % lost SELECT on clarity_verifications — the P1207/P1302 read path changed', r;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'public' AND tablename = 'clarity_verifications' AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'P1245: the SELECT policy on clarity_verifications is gone';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.clarity_verifications', 'INSERT') THEN
    RAISE EXCEPTION 'P1245: service_role lost INSERT on clarity_verifications';
  END IF;
  -- The erasure path's EFFECTIVE authority: the exact zero-arg function, SECURITY DEFINER, and an
  -- owner that still holds DELETE here — not merely "some definer function by that name exists".
  IF v_erase IS NULL THEN
    RAISE EXCEPTION 'P1245: public.erase_my_account() not found';
  END IF;
  SELECT pg_catalog.pg_get_userbyid(pr.proowner) INTO v_owner
    FROM pg_catalog.pg_proc pr WHERE pr.oid = v_erase AND pr.prosecdef;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'P1245: public.erase_my_account() is not SECURITY DEFINER — it would lose its delete on clarity_verifications';
  END IF;
  IF NOT has_table_privilege(v_owner, 'public.clarity_verifications', 'DELETE') THEN
    RAISE EXCEPTION 'P1245: erase_my_account() owner % cannot DELETE clarity_verifications', v_owner;
  END IF;

  RAISE NOTICE 'P1245: client roles hold no write privilege on clarity_verifications; SELECT unchanged.';
END;
$$;
