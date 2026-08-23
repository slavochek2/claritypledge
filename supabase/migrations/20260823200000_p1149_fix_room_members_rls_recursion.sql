-- new function: is_transcribe_room_member did not exist before this migration.
-- client-safe: P1149 (feature/p1149-transcribe-room) has never shipped to prod or main —
-- transcribe_rooms/transcribe_room_members/transcribe_messages are brand-new tables with
-- zero deployed client code reading or writing them, so the DROP POLICY + CREATE POLICY
-- below (superseding the original migration's roster SELECT policy) affects no live client.
--
-- P1149 fix-forward: transcribe_room_members' own SELECT policy self-referenced the same
-- table inside its EXISTS subquery — Postgres has to evaluate that table's RLS policy to
-- run the subquery, which means evaluating the SAME policy again, which needs the subquery
-- again: "infinite recursion detected in policy for relation transcribe_room_members"
-- (42P17), reproduced live via e2e/p1149-chat-render.spec.ts joining a real room.
--
-- The original migration (20260823190000) is already applied to the shared test DB, so
-- per this repo's convention (see 20260821120000_p1114_public_roster_reversal.sql), the
-- fix is forward, not an in-place edit — migrate.sh tracks by filename, not content, so
-- editing the original in place would silently no-op on an already-applied DB.
--
-- Fix: a SECURITY DEFINER helper function. It queries transcribe_room_members with RLS
-- bypassed (owner privilege), so the policy that calls it never re-enters itself. Every
-- OTHER policy this migration touches was already cross-table (transcribe_rooms →
-- transcribe_room_members, transcribe_messages → transcribe_room_members) and never
-- recursive — only the roster's own SELECT policy needs this.

CREATE OR REPLACE FUNCTION public.is_transcribe_room_member(p_room_id uuid, p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.transcribe_room_members
    WHERE room_id = p_room_id AND profile_id = p_profile_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_transcribe_room_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_transcribe_room_member(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "room members can see the roster" ON public.transcribe_room_members;
CREATE POLICY "room members can see the roster"
  ON public.transcribe_room_members FOR SELECT
  TO authenticated
  USING (public.is_transcribe_room_member(room_id, auth.uid()));
