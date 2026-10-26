-- P1557: the self-hosted TEST database signs its keys with the synthetic ref cpselfhostedtest01. The
-- e2e purge guard must admit that ref, and only that: the claim can be signed only by that server's
-- secret, so prod cannot produce it. Nothing here accepts a missing ref, any non-prod ref, or a header.
-- Copies of these refs: scripts/lib/test-target.mjs (TEST_PROJECT_REFS, SELFHOSTED_TEST_REF).
-- diffed against: 20261021190000_p1532_e2e_guard_new_test_ref.sql (_e2e_purge_allowed); the only
--   change is the added ref 'cpselfhostedtest01' in the IN-list.
-- client-safe: function body only, same signature and grants.

CREATE OR REPLACE FUNCTION public._e2e_purge_allowed(p_claims jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(p_claims ->> 'ref', '') IN ('ayibkeoyukulbsjpxgaw', 'gfjctyxqlwexxwsmkakq', 'cpselfhostedtest01')
     AND coalesce(p_claims ->> 'role', '') = 'service_role';
$$;

REVOKE ALL ON FUNCTION public._e2e_purge_allowed(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._e2e_purge_allowed(jsonb) TO service_role;
