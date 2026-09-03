-- P1230 part B2 (codex review): status and invitation_token stop being
-- party-mutable, and the verification block asserts predicates instead of
-- searching them for substrings.
--
-- requires-frontend: c666aa473
-- (the client whose resendInvitation() calls rotate_invitation_token() instead
--  of PATCHing invitation_token / invitation_expires_at / status on the table.
--  Applying this while a pre-P1230-B bundle is live breaks "Resend invitation"
--  with a 42501 for every creator: that bundle writes exactly the two columns
--  refused below. rotate_invitation_token ships in 20260902001500, which is
--  client-safe and must be applied BEFORE that client is deployed.)
--
-- diffed against: 20260902001000_p1230_agreements_update_parties_only.sql
--   (trg_agreements_lock_party_ids: party-id guard unchanged; two guards added)
--
-- Why. Part A locked the two party-id columns; a party could still walk a row
-- back to status='pending' and set an invitation_token of their choosing, then
-- hand that token to any authenticated account, which called accept_agreement()
-- — SECURITY DEFINER, therefore exempt from the trigger — and became the
-- partner. 20260902001500 closes the last step; this file closes the first two,
-- so the sequence cannot be staged in the first place.
--
-- Mechanics: .private/docs/security-log.md § 2026-09-03 (P1230 part B).

-- 1. Trigger: parties, status direction, and the token ------------------------
--
-- Function name is unchanged (the trigger binds to it by oid) even though it now
-- guards more than the party ids; the COMMENT carries the current contract.

CREATE OR REPLACE FUNCTION public.trg_agreements_lock_party_ids()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- current_user is the role the statement runs as: 'anon' / 'authenticated'
  -- for PostgREST table writes; the function OWNER for SECURITY DEFINER RPCs
  -- (accept_agreement assigns the partner, rotate_invitation_token rotates the
  -- token, both legitimately); 'service_role' for edge functions and test
  -- fixtures. Only the first two are locked.
  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.creator_profile_id IS DISTINCT FROM OLD.creator_profile_id
       OR NEW.partner_profile_id IS DISTINCT FROM OLD.partner_profile_id THEN
      RAISE EXCEPTION 'agreement parties cannot be reassigned' USING ERRCODE = '42501';
    END IF;

    -- No reopening. Forward transitions a party legitimately makes —
    -- pending -> expired (lazy expiry), * -> terminated (cancel / terminate) —
    -- are untouched; only arriving AT pending from something else is refused.
    -- Resending an expired invitation goes through rotate_invitation_token().
    IF NEW.status = 'pending' AND OLD.status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'an agreement cannot be returned to pending; use rotate_invitation_token()' USING ERRCODE = '42501';
    END IF;

    -- The token is the acceptance credential. A party choosing its value is the
    -- second step of the composed takeover.
    IF NEW.invitation_token IS DISTINCT FROM OLD.invitation_token THEN
      RAISE EXCEPTION 'invitation_token cannot be set by a party; use rotate_invitation_token()' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_agreements_lock_party_ids() IS
  'P1230: for anon/authenticated table writes only — party ids are immutable, status may not return to pending, and invitation_token may not be written. SECURITY DEFINER RPCs (accept_agreement, rotate_invitation_token) and service_role run as another role and are exempt by construction.';

-- The trigger itself is unchanged from 20260902001000; re-issued so this file
-- also establishes it on a database that somehow has the function without it.
DROP TRIGGER IF EXISTS agreements_lock_party_ids ON public.clarity_agreements;
CREATE TRIGGER agreements_lock_party_ids
  BEFORE UPDATE ON public.clarity_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_agreements_lock_party_ids();

-- 2. Assert the end state ----------------------------------------------------
--
-- Codex, finding 2: 20260902001000's block rejected the strings 'pending' and
-- 'invitation_token' in the predicate, which USING (true) also passes. These
-- assertions compare the deparsed predicate to the intended one instead, and
-- pin the trigger's identity, timing and enabled state rather than its mere
-- existence.

DO $$
DECLARE
  -- The deparse Postgres produces for
  --   creator_profile_id = auth.uid() OR partner_profile_id = auth.uid()
  -- Compared whitespace-insensitively so a re-deparse that spaces differently
  -- does not fail the migration, while any change of MEANING does.
  c_expected CONSTANT TEXT :=
    '((creator_profile_id = auth.uid()) OR (partner_profile_id = auth.uid()))';
  v_qual     TEXT;
  v_check    TEXT;
  v_roles    TEXT;
  v_tgtype   SMALLINT;
  v_tgenabled "char";
  v_tgfoid   OID;
  v_src      TEXT;
BEGIN
  -- 2a. UPDATE policy: exactly one, roles exactly {authenticated}, and both
  --     predicates equal to the intended expression after whitespace removal.
  IF (SELECT count(*)
      FROM pg_policy pol
      JOIN pg_class c ON c.oid = pol.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'clarity_agreements'
        AND pol.polcmd = 'w') <> 1 THEN
    RAISE EXCEPTION 'P1230-B2: expected exactly one UPDATE policy on clarity_agreements';
  END IF;

  SELECT pg_get_expr(pol.polqual, pol.polrelid),
         pg_get_expr(pol.polwithcheck, pol.polrelid),
         (SELECT string_agg(r.rolname, ',' ORDER BY r.rolname)
            FROM pg_roles r WHERE r.oid = ANY (pol.polroles))
    INTO v_qual, v_check, v_roles
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'clarity_agreements'
    AND pol.polname = 'Parties can update their agreements';

  IF v_qual IS NULL THEN
    RAISE EXCEPTION 'P1230-B2: UPDATE policy "Parties can update their agreements" missing';
  END IF;
  IF regexp_replace(v_qual, '\s', '', 'g') <> regexp_replace(c_expected, '\s', '', 'g') THEN
    RAISE EXCEPTION 'P1230-B2: UPDATE policy USING is % — expected %', v_qual, c_expected;
  END IF;
  IF v_check IS NULL OR regexp_replace(v_check, '\s', '', 'g') <> regexp_replace(c_expected, '\s', '', 'g') THEN
    RAISE EXCEPTION 'P1230-B2: UPDATE policy WITH CHECK is % — expected %', coalesce(v_check, '<null>'), c_expected;
  END IF;
  IF v_roles IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'P1230-B2: UPDATE policy roles are % — expected exactly authenticated', coalesce(v_roles, '<PUBLIC>');
  END IF;

  -- 2b. Trigger: right table (namespace-qualified), right function, row-level
  --     BEFORE UPDATE, and enabled.
  SELECT t.tgtype, t.tgenabled, t.tgfoid
    INTO v_tgtype, v_tgenabled, v_tgfoid
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'clarity_agreements'
    AND t.tgname = 'agreements_lock_party_ids'
    AND NOT t.tgisinternal;

  IF v_tgtype IS NULL THEN
    RAISE EXCEPTION 'P1230-B2: trigger agreements_lock_party_ids missing on public.clarity_agreements';
  END IF;
  IF v_tgfoid <> 'public.trg_agreements_lock_party_ids()'::regprocedure THEN
    RAISE EXCEPTION 'P1230-B2: trigger bound to % — expected public.trg_agreements_lock_party_ids()', v_tgfoid::regprocedure;
  END IF;
  -- pg_trigger.tgtype bits: 1 ROW, 2 BEFORE, 4 INSERT, 8 DELETE, 16 UPDATE.
  IF (v_tgtype & 1) = 0 THEN
    RAISE EXCEPTION 'P1230-B2: trigger is statement-level, expected FOR EACH ROW (tgtype=%)', v_tgtype;
  END IF;
  IF (v_tgtype & 2) = 0 THEN
    RAISE EXCEPTION 'P1230-B2: trigger is not BEFORE (tgtype=%) — an AFTER trigger cannot refuse the write', v_tgtype;
  END IF;
  IF (v_tgtype & 16) = 0 THEN
    RAISE EXCEPTION 'P1230-B2: trigger does not fire on UPDATE (tgtype=%)', v_tgtype;
  END IF;
  IF v_tgenabled <> 'O' THEN
    RAISE EXCEPTION 'P1230-B2: trigger tgenabled=% — expected O (fires for origin sessions)', v_tgenabled;
  END IF;

  -- 2c. The trigger body carries both new guards. (Substring is legitimate here:
  --     this is our own function source, deparsed from the CREATE above, not an
  --     attacker-shaped predicate.)
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'trg_agreements_lock_party_ids';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'P1230-B2: trg_agreements_lock_party_ids missing';
  END IF;
  IF position('cannot be returned to pending' IN v_src) = 0 THEN
    RAISE EXCEPTION 'P1230-B2: trigger body lacks the status-reversion guard';
  END IF;
  IF position('invitation_token cannot be set by a party' IN v_src) = 0 THEN
    RAISE EXCEPTION 'P1230-B2: trigger body lacks the invitation_token guard';
  END IF;

  -- 2d. Grants: the legitimate writer keeps UPDATE, anon still has none.
  --     (Without this the file could "pass" having locked everybody out.)
  IF NOT has_table_privilege('authenticated', 'public.clarity_agreements', 'UPDATE') THEN
    RAISE EXCEPTION 'P1230-B2: authenticated lost UPDATE on clarity_agreements';
  END IF;
  IF has_table_privilege('anon', 'public.clarity_agreements', 'UPDATE') THEN
    RAISE EXCEPTION 'P1230-B2: anon holds UPDATE on clarity_agreements';
  END IF;

  -- 2e. The exempt path must still exist, or resend has nowhere to go.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rotate_invitation_token' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'P1230-B2: rotate_invitation_token missing — apply 20260902001500 first';
  END IF;
END $$;
