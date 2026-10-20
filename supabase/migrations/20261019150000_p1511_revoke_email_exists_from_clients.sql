-- P1511: email_exists becomes server-only.
--
-- Since P877 the logged-out login form called email_exists directly (anon + authenticated
-- EXECUTE), so anyone could ask, without limit, which addresses have an account. The form now
-- asks the check-login-email edge function, which reserves a slot in the P1225 per-IP limiter
-- before calling email_exists with the service role. This removes the direct path.
--
-- Rollout order (the spec's Pre-deploy Checklist): the function is deployed and the frontend that
-- calls it is live BEFORE this runs, with a gap so open tabs age out. A tab still running the old
-- bundle gets a refused RPC, and the old checkEmailExists ignored the error and returned false —
-- so that tab tells an existing user "No account found" until it reloads. The gap is the only
-- mitigation; already-loaded bundles cannot be patched.
--
-- Supabase's default privileges grant EXECUTE to anon and authenticated by name, so REVOKE FROM
-- PUBLIC alone is not enough (P683, P877 section 2). Idempotent.
--
-- client-safe: after the rollout order above no deployed client calls email_exists.

REVOKE EXECUTE ON FUNCTION public.email_exists(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_exists(text) TO service_role;

COMMENT ON FUNCTION public.email_exists(text) IS
  'P877/P1511: does a profile with this email exist (boolean only). Service role only — clients '
  'ask the check-login-email edge function, which is limited per IP.';
