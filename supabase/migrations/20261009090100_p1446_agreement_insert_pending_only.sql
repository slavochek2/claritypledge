-- diffed against: 20260224150000_p422_clarity_agreements.sql ("Authenticated users can create
--   agreements" — the only INSERT policy on the table; never replaced since)
--
-- client-safe: the only client insert (createAgreement in src/app/data/agreements-service-real.ts)
--   sends creator_profile_id, partner_email, partner_display_name, terms_text, visibility and
--   agreement_version — never status or partner_profile_id, so the column defaults ('pending',
--   NULL) satisfy the added checks. create_agreement_with_profile (SECURITY DEFINER, owner
--   bypasses RLS), accept_agreement (definer) and service-role edge functions are not governed.
--
-- P1446: a client creates only a pending agreement with no partner. The partner is set, and the
-- agreement made active, only by accept_agreement — the recipient-authorised path. P1230 locked
-- these columns on UPDATE; the INSERT side was left open, and p878_relationship_scope counts
-- active and terminated agreements as relationships. Same rule P1321 applied to witnesses: every
-- input to that scope must be a fact the other party took part in.
-- Specifics: .private/docs/security-log.md (P1446).
--
-- Policy name unchanged so the RLS drift and scope checks keep matching it. TO authenticated:
-- anon could never pass auth.uid() IS NOT NULL, so this narrows nothing that worked.

DROP POLICY IF EXISTS "Authenticated users can create agreements" ON public.clarity_agreements;

CREATE POLICY "Authenticated users can create agreements"
  ON public.clarity_agreements FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND creator_profile_id = auth.uid()
    AND status = 'pending'
    AND partner_profile_id IS NULL
  );

DO $$
DECLARE
  c_expected CONSTANT text :=
    '((auth.uid() IS NOT NULL) AND (creator_profile_id = auth.uid()) AND (status = ''pending''::text) AND (partner_profile_id IS NULL))';
  v_check text;
  v_roles text;
BEGIN
  IF (SELECT count(*) FROM pg_policy
      WHERE polrelid = 'public.clarity_agreements'::regclass AND polcmd = 'a') <> 1 THEN
    RAISE EXCEPTION 'P1446: expected exactly one INSERT policy on clarity_agreements';
  END IF;

  SELECT pg_get_expr(pol.polwithcheck, pol.polrelid),
         (SELECT string_agg(r.rolname, ',' ORDER BY r.rolname) FROM pg_roles r WHERE r.oid = ANY (pol.polroles))
    INTO v_check, v_roles
  FROM pg_policy pol
  WHERE pol.polrelid = 'public.clarity_agreements'::regclass AND pol.polcmd = 'a';

  IF regexp_replace(coalesce(v_check, ''), '\s', '', 'g') <> regexp_replace(c_expected, '\s', '', 'g') THEN
    RAISE EXCEPTION 'P1446: INSERT policy WITH CHECK is % — expected %', coalesce(v_check, '<null>'), c_expected;
  END IF;
  IF v_roles IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'P1446: INSERT policy roles are % — expected exactly authenticated', coalesce(v_roles, '<PUBLIC>');
  END IF;
END $$;
