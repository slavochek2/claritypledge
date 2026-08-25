-- P1104 followup: close the default PUBLIC EXECUTE grant on two guard-helper functions.
--
-- is_reserved_agent_name(text) and is_reserved_machine_slug(text) were created without an
-- explicit REVOKE/GRANT, so Postgres left them on the default: EXECUTE granted to PUBLIC,
-- which anon inherits. /day's function-grant-drift-check.py flagged both as new anon-reachable
-- functions (2026-08-25).
--
-- client-safe: no legitimate client path calls either function directly.
--   - guard_profile_trust_columns() (SECURITY INVOKER trigger on profiles) calls
--     is_reserved_agent_name — it fires as whichever role writes profiles, which for a real
--     user is `authenticated`, never `anon` (profiles writes are auth-gated).
--   - create_or_reuse_agent_account(...) and upsert_my_profile(...) (SECURITY DEFINER) call
--     both guards — they execute as their owner, which always retains EXECUTE on its own
--     functions regardless of grants, so revoking PUBLIC does not affect them.
--     create_or_reuse_agent_account is itself already service_role-only
--     (20260824120000_p1104_reserve_machine_slug.sql).
--
-- Same two-cause note as 20260813080000_p1063_revoke_anon_execute_on_signed_in_rpcs.sql:
-- REVOKE ... FROM anon would silently no-op here, since anon holds no direct grant — the
-- grant is on PUBLIC and anon merely inherits it. Revoke from PUBLIC.

REVOKE ALL ON FUNCTION public.is_reserved_agent_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_reserved_agent_name(text) TO authenticated;

REVOKE ALL ON FUNCTION public.is_reserved_machine_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_reserved_machine_slug(text) TO authenticated;
