-- Migration: P1303 — close the anon EXECUTE grant on the room-code lookup
-- Created: 2026-09-11
-- Spec: features/p1303_room_lookup_grant.md
--
-- client-safe: the only caller (src/app/pages/transcribe-room-page.tsx) runs after the page has
-- redirected a visitor with no user to /login and returns early without a user, so no working
-- client flow calls this function anonymously, in either deploy order.
--
-- Intended end state: EXECUTE for authenticated only, as 20260901160000_p1207 meant. Supabase's
-- default privileges on the public schema grant EXECUTE on every new function to anon
-- role-directly, so a grant to authenticated alone does not produce that state (P1065). Both
-- revoke forms are required (P1066); the grant to authenticated is re-asserted so the end state
-- is stated in one place.
--
-- Verify post-apply by reading the live catalog — scripts/function-grant-drift-check.py or
-- has_function_privilege('anon', 'public.get_transcribe_room_by_code(text)', 'execute') —
-- never by "migration applied" alone.

REVOKE ALL ON FUNCTION public.get_transcribe_room_by_code(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_transcribe_room_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_transcribe_room_by_code(text) TO authenticated;
