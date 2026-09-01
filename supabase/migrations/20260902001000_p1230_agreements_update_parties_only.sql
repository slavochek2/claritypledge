-- P1230: clarity_agreements UPDATE is for parties only, and parties cannot
-- reassign who the parties are.
--
-- client-safe: (1) the anon UPDATE REVOKE removes a grant no deployed client
-- can exercise — every UPDATE policy on this table binds auth.uid(), which is
-- NULL for anon, so anon writes already returned zero rows; (2) the policy
-- rewrite keeps every path the client uses (resend / cancel / terminate /
-- lazy-expiry are all issued by a party); (3) acceptance runs through the
-- accept_agreement SECURITY DEFINER RPC, which the trigger below exempts.
-- new function (trg_agreements_lock_party_ids has no prior definition)
--
-- What was wrong (P422, 20260225150000 / 20260225180000): the UPDATE policy's
-- USING admitted any caller on `status = 'pending' AND invitation_token IS NOT
-- NULL`, and WITH CHECK only required the NEW row to name the caller as a
-- party. So a signed-in stranger who knows a pending agreement's id can set
-- partner_profile_id to themselves — USING passes on the pending branch, WITH
-- CHECK passes once they are the partner — and take over the invitation
-- without ever holding the token. Mechanics + measurement:
-- .private/docs/security-log.md § 2026-09-01 (P1230).
--
-- Drift note: the test project already carries the parties-only USING/CHECK
-- (out-of-band, no migration). Prod still has the P422 predicate. The DO block
-- at the end asserts the final predicate regardless of starting state, so the
-- file is safe to run on either.
--
-- Three layers, because policies cannot see OLD:
--   1. policy   — only a party may touch a row (USING) and the result must still
--                 name them (WITH CHECK)
--   2. trigger  — a party may not change creator_profile_id / partner_profile_id;
--                 only the SECURITY DEFINER acceptance path (runs as the function
--                 owner, not anon/authenticated) and service_role may
--   3. grant    — anon loses UPDATE altogether

-- 1. Policy ------------------------------------------------------------------

DROP POLICY IF EXISTS "Parties can update their agreements" ON public.clarity_agreements;

CREATE POLICY "Parties can update their agreements"
  ON public.clarity_agreements FOR UPDATE
  TO authenticated
  USING (
    creator_profile_id = auth.uid()
    OR partner_profile_id = auth.uid()
  )
  WITH CHECK (
    creator_profile_id = auth.uid()
    OR partner_profile_id = auth.uid()
  );

COMMENT ON POLICY "Parties can update their agreements" ON public.clarity_agreements IS
  'P1230: a row is updatable only by its creator or partner, and must still name the caller afterwards. Invitation acceptance is accept_agreement() (SECURITY DEFINER, token-checked); there is no pending/token branch here on purpose.';

-- 2. Trigger: party ids are immutable for RLS-subject roles ------------------

CREATE OR REPLACE FUNCTION public.trg_agreements_lock_party_ids()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- current_user is the role the statement runs as: 'anon' / 'authenticated'
  -- for PostgREST table writes; the function OWNER for SECURITY DEFINER RPCs
  -- (accept_agreement sets partner_profile_id legitimately); 'service_role'
  -- for edge functions and test fixtures. Only the first two are locked.
  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.creator_profile_id IS DISTINCT FROM OLD.creator_profile_id
       OR NEW.partner_profile_id IS DISTINCT FROM OLD.partner_profile_id THEN
      RAISE EXCEPTION 'agreement parties cannot be reassigned' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agreements_lock_party_ids ON public.clarity_agreements;
CREATE TRIGGER agreements_lock_party_ids
  BEFORE UPDATE ON public.clarity_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_agreements_lock_party_ids();

-- 3. Grant: anon never updates agreements -----------------------------------

REVOKE UPDATE ON public.clarity_agreements FROM anon;

-- 4. Assert the final state, whatever it started as -------------------------

DO $$
DECLARE
  v_qual  TEXT;
  v_check TEXT;
  v_roles TEXT;
BEGIN
  SELECT qual, with_check, roles::text
    INTO v_qual, v_check, v_roles
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'clarity_agreements'
    AND policyname = 'Parties can update their agreements';

  IF v_qual IS NULL THEN
    RAISE EXCEPTION 'P1230: UPDATE policy missing after apply';
  END IF;
  IF v_qual ILIKE '%invitation_token%' OR v_check ILIKE '%invitation_token%'
     OR v_qual ILIKE '%pending%' THEN
    RAISE EXCEPTION 'P1230: UPDATE policy still carries the pending/token branch: % / %', v_qual, v_check;
  END IF;
  IF v_roles NOT LIKE '%authenticated%' OR v_roles LIKE '%anon%' OR v_roles LIKE '%public%' THEN
    RAISE EXCEPTION 'P1230: UPDATE policy roles unexpected: %', v_roles;
  END IF;

  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'clarity_agreements' AND cmd = 'UPDATE') <> 1 THEN
    RAISE EXCEPTION 'P1230: expected exactly one UPDATE policy on clarity_agreements';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'clarity_agreements' AND t.tgname = 'agreements_lock_party_ids' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'P1230: party-id lock trigger missing';
  END IF;

  IF has_table_privilege('anon', 'public.clarity_agreements', 'UPDATE') THEN
    RAISE EXCEPTION 'P1230: anon still holds UPDATE on clarity_agreements';
  END IF;
END $$;
