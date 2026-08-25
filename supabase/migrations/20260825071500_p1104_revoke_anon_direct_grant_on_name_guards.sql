-- client-safe: revokes an EXECUTE grant no legitimate client path uses. Both functions are
-- guard helpers called only from guard_profile_trust_columns() (SECURITY INVOKER trigger,
-- fires as `authenticated` on real profile writes, never `anon`) and from SECURITY DEFINER
-- RPCs (upsert_my_profile, create_or_reuse_agent_account — the latter already service_role-only)
-- that execute as their owner regardless of anon's grants. No src/ call site invokes either
-- function directly. Verified via curl as anon on prod immediately after applying.
--
-- P1104 fix-forward: 20260825070000 revoked EXECUTE from PUBLIC only. Verified live on prod
-- immediately after applying (curl to /rest/v1/rpc/is_reserved_agent_name as anon) — anon could
-- still call it and got a clean `false`, no permission error. The REVOKE FROM PUBLIC form is
-- textually identical to the one that works and gives no error either way — exactly the P1063
-- evasion class this repo already has a name for ("the migration text says REVOKE, review
-- passes, and the privilege is still there").
--
-- Cause: this project also carries a DIRECT grant to `anon`, separate from the PUBLIC grant —
-- the same "cause 1" the p1063 migration (20260813080000) already had to handle for four other
-- functions, and whose own REVOKE list there covers `FROM anon` and `FROM PUBLIC` as two
-- separate statements, not one. This migration's predecessor only wrote the PUBLIC half.
--
-- Fix: REVOKE from anon explicitly, matching the p1063 precedent's two-statement form.

REVOKE EXECUTE ON FUNCTION public.is_reserved_agent_name(text)   FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_reserved_machine_slug(text) FROM anon;
