-- P1053 (Migration B): revoke client UPDATE on the two joiner columns.
--
-- requires-frontend: 3dce8b691e7dc2ada49bc2ee91f517ab7f2add41
--   ^^^ Replace with the frontend commit sha that ships the api.ts cutover BEFORE
--   committing this file. scripts/check-migration-client-safety.sh rejects the placeholder
--   (it requires 7-40 hex chars), and migrate.sh blocks a prod apply until that sha is an
--   ancestor of origin/main. Both behaviors are intended — this migration breaks the
--   deployed bundle the moment it lands, so the bundle must go first.
--
-- ---------------------------------------------------------------------------------------
-- THIS IS THE LOAD-BEARING FILE
-- ---------------------------------------------------------------------------------------
-- Migration A alone closes NOTHING. claim_joiner_seat is SECURITY DEFINER and therefore
-- bypasses client column grants entirely, so while anon/authenticated retain UPDATE on
-- joiner_name and joiner_profile_id, the direct-PATCH path stays wide open and every
-- exploit remains live. The RPC is decorative until this REVOKE lands (spec Risk 3).
--
-- A COLUMN-level revoke is correct here, not a table REVOKE + re-grant: P1047 part 1
-- already replaced the table-wide grant with a column allowlist, so the columns not named
-- here (state, live_state, mode, demo_status, ...) keep their existing grants untouched.
-- Revoking at table level and re-granting would rebuild that allowlist from memory and is
-- how a grant gets silently dropped.
--
-- What still works after this file, and why:
--   * claim_joiner_seat / release_joiner_seat — SECURITY DEFINER, execute as owner,
--     unaffected by client column grants. auth.uid() is preserved inside SECURITY DEFINER,
--     so a signed-in claim still authenticates correctly.
--   * patch_live_state, complete_clarity_session — SECURITY DEFINER, same reasoning.
--   * The six anonymous practice-room writes (state, live_state, mode, demo_status) —
--     different columns, grants untouched.
--   * service_role — never subject to these grants (admin + E2E tooling).
--
-- What breaks without the frontend first: joinClaritySession (api.ts:1001) and
-- clearSessionJoiner (api.ts:1235) both write these columns via direct UPDATE today. They
-- must already be calling the RPCs when this lands.

-- ============================================================================
-- 1. Repair rows the deployed bundle may have desynchronized since Migration A
-- ============================================================================
-- Between Migration A and this file, the OLD clearSessionJoiner is still live and nulls
-- joiner_name via a direct UPDATE while leaving joiner_seat_claimed_at stamped. Those rows
-- read "occupied by nobody" and would fail the constraint added below. Re-sync them to
-- vacant before constraining, so ADD CONSTRAINT cannot fail on live data.
--
-- This is why the constraint is not in Migration A: adding it there would have rejected a
-- write the deployed bundle still makes, taking the live leave path down — P1047 part 4's
-- exact failure mode.
UPDATE public.clarity_sessions
   SET joiner_seat_claimed_at = NULL
 WHERE joiner_seat_claimed_at IS NOT NULL
   AND joiner_name IS NULL;

-- ============================================================================
-- 2. The revoke
-- ============================================================================

REVOKE UPDATE (joiner_name, joiner_profile_id) ON public.clarity_sessions FROM anon, authenticated;

-- ============================================================================
-- 3. Lock occupancy and display name together
-- ============================================================================
-- Both columns are now written only by the two RPCs, and always together. The constraint
-- makes that lockstep enforced rather than conventional, so a future CREATE OR REPLACE that
-- drops one assignment fails loudly instead of leaving a seat that reads occupied with no
-- name (or a name with no occupancy, which would make the vacancy check unreliable).
--
-- A table-level CHECK validates all existing rows at ADD CONSTRAINT time. That is safe here
-- ONLY because the repair pass above runs first, in the same transaction.
ALTER TABLE public.clarity_sessions
  DROP CONSTRAINT IF EXISTS clarity_sessions_seat_claim_requires_name;

ALTER TABLE public.clarity_sessions
  ADD CONSTRAINT clarity_sessions_seat_claim_requires_name
  CHECK (joiner_seat_claimed_at IS NULL OR joiner_name IS NOT NULL);

-- ============================================================================
-- 4. Verification (run manually after apply — a REVOKE that no-ops is the P877/P886 trap)
-- ============================================================================
-- Read column_privileges, NOT pg_policies: the RLS policies are unchanged by design here,
-- so a policy-level check proves nothing. Expect ZERO rows.
--
--   SELECT grantee, privilege_type, column_name
--     FROM information_schema.column_privileges
--    WHERE table_schema = 'public'
--      AND table_name   = 'clarity_sessions'
--      AND column_name IN ('joiner_name', 'joiner_profile_id')
--      AND privilege_type = 'UPDATE'
--      AND grantee IN ('anon', 'authenticated');
