-- diffed against: 20260404120000_security_backlog_rls.sql (FIX 1)
--
-- client-safe: no deployed client sets witness_profile_id on insert (addWitness in
--   src/app/data/api.ts sends profile_id, witness_name, witness_linkedin_url), so the added
--   `witness_profile_id IS NULL` check refuses nothing a shipped bundle sends.
--
-- P1321 (definer-function review, lead L2): the witnesses INSERT policy checked only
-- auth.uid() = profile_id, leaving witness_profile_id — "this registered user witnessed me" —
-- entirely caller-chosen. p878_relationship_scope trusts that column, so a forged row placed any
-- named user inside the caller's relationship scope, and the RPCs gated on that scope
-- (create_agreement_with_profile and the letter recipient pickers) then treated them as a
-- relation.
--
-- No client writes the column: addWitness (src/app/data/api.ts) inserts profile_id,
-- witness_name and witness_linkedin_url only. The column is written elsewhere only by the
-- erasure functions (SECURITY DEFINER, setting it to NULL) and by service-role test seeding,
-- neither of which RLS governs. So client inserts must leave it NULL. A future flow that links
-- a registered witness must do it in a definer function that proves the witness is the caller.
--
-- Policy name unchanged so P1207's scope review and the RLS drift checker keep matching it.

DROP POLICY IF EXISTS "Authenticated users can insert witnesses" ON public.witnesses;

CREATE POLICY "Authenticated users can insert witnesses"
  ON public.witnesses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = profile_id AND witness_profile_id IS NULL);
