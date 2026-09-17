-- Migration: P1327 — close the anon EXECUTE grant on event_grace_interval()
-- Created: 2026-09-17
-- Spec: features/p1327_function_grant_drift_four_unresolvable_new.md
--
-- client-safe: no client calls this function. Its callers are all SECURITY DEFINER and so run as
-- the owner: join_event_room, set_room_readiness, set_room_opt_in, reset_room_answer (P1256), and
-- assert_transcribe_event_access, an INVOKER helper revoked from anon and authenticated and reached
-- only from the DEFINER functions enter_/create_/join_transcribe_room. No policy or view names it.
-- e2e reads it through the service role.
--
-- Scope: anon only. The drift check gates anon, and the authenticated grant is not changed here.
-- Both revoke forms are required (P1066): Supabase's default privileges grant anon role-directly.
--
-- Verify post-apply by reading the live catalog — scripts/function-grant-drift-check.py or
-- has_function_privilege('anon', 'public.event_grace_interval()', 'execute') — never by
-- "migration applied" alone.

REVOKE ALL ON FUNCTION public.event_grace_interval() FROM anon;
REVOKE ALL ON FUNCTION public.event_grace_interval() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_grace_interval() TO authenticated;
