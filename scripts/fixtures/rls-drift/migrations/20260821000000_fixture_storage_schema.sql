-- FIXTURE ONLY — never applied to any database.
--
-- Exercises the 2026-08-21 [P1135] widening of rls-drift-check.py from
-- schema `public` only to `public` + `storage`, and the schema-qualified
-- key (schema, table, policy) that made the widening safe.
--
-- "duplicate name test" exists here ONLY on storage.objects. The live
-- fixtures pair a legitimate storage.objects row of this name (created here,
-- so it must NOT be flagged) with an out-of-band public.objects row of the
-- SAME name (created nowhere, so it MUST be flagged) — proving the two
-- schemas do not launder each other's legitimacy through a shared name.

CREATE POLICY "public can read agent avatars" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'agent-avatars');

CREATE POLICY "duplicate name test" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'agent-avatars');
