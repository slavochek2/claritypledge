-- Migration: P1236 (Migration D) — close the anon EXECUTE grant on the join RPC
-- Created: 2026-09-08
-- Spec: features/p1236_server_side_live_transcription_for_rooms.md (Decision 5)
--
-- client-safe: the function already refuses an anonymous caller on its first line
-- (auth.uid() IS NULL -> 42501), verified live before writing this — SET LOCAL ROLE anon
-- inside a rolled-back transaction returned "REFUSED: not authenticated", against a control
-- call that returned PERMITTED so the probe was not blind. No working client flow depends
-- on this grant, in either deploy order.
--
-- WHAT WENT WRONG, so it is not repeated on the next SECURITY DEFINER function.
--
-- 20260908170000 created join_transcribe_room with:
--     REVOKE ALL ON FUNCTION ... FROM PUBLIC;
--     GRANT EXECUTE ON FUNCTION ... TO authenticated;
-- and that reads like a lockdown. It is not. Supabase's ALTER DEFAULT PRIVILEGES on the
-- public schema grants EXECUTE on every NEW function to anon, authenticated and
-- service_role ROLE-DIRECTLY. Revoking from PUBLIC does not touch a role-direct grant, so
-- has_function_privilege('anon', ...) came back TRUE on the test DB immediately after the
-- migration applied.
--
-- docs/technical/database.md § "Function EXECUTE grants are a separate surface (P1065)"
-- states this: both revoke forms are required, and "the ineffective revoke form and the
-- working one are textually near-identical, and the ineffective one raises no error."
-- P1063 found four such RPCs live on prod, each carrying a lockdown in its own migration
-- that had never taken effect. This is the fifth, caught before prod only because the
-- grant was read back from the live catalog rather than from the migration text.
--
-- P1065's own framing is why this is a POSTURE fix and not an incident: a finding exists
-- only in the conjunction of a live anon grant AND a guard that fails to refuse an
-- anonymous caller. The guard refuses. But a SECURITY DEFINER function reachable by anon
-- is one refactor of that guard away from being the whole hole, and there is no reason to
-- carry it.
--
-- record_transcribe_slice (20260908170200) is NOT affected: it revokes from PUBLIC, anon
-- AND authenticated explicitly, and reads back false for both roles.

REVOKE ALL ON FUNCTION public.join_transcribe_room(uuid, text, uuid, boolean) FROM anon;

-- Re-asserted so the intended end state is stated in one place rather than inferred from
-- the diff of two migrations.
REVOKE ALL ON FUNCTION public.join_transcribe_room(uuid, text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_transcribe_room(uuid, text, uuid, boolean) TO authenticated;
