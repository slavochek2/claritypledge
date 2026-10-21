-- P1532: P1530 moved the TEST project to ref ayibkeoyukulbsjpxgaw. The e2e guard allowed only the
-- old ref, so on the new project every e2e_* function would refuse. Allow both test refs until the
-- old project is paused; prod (besjtuodziykmjidubzw) is still refused. Copies of these refs:
-- e2e/helpers/e2e-namespace.ts TEST_PROJECT_REFS.
-- diffed against: 20261021174500_p1532_review_fixes.sql (_e2e_purge_allowed); only the ref test changes.
-- client-safe: function body only, same signature and grants.

CREATE OR REPLACE FUNCTION public._e2e_purge_allowed(p_claims jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(p_claims ->> 'ref', '') IN ('ayibkeoyukulbsjpxgaw', 'gfjctyxqlwexxwsmkakq')
     AND coalesce(p_claims ->> 'role', '') = 'service_role';
$$;

REVOKE ALL ON FUNCTION public._e2e_purge_allowed(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._e2e_purge_allowed(jsonb) TO service_role;
