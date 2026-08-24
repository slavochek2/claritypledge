-- new function: transcribe_rooms_guard_immutable_columns did not exist before this migration.
-- client-safe: P1149 (feature/p1149-transcribe-room) has never shipped to prod or main —
-- transcribe_rooms/transcribe_room_members/transcribe_messages are brand-new tables with
-- zero deployed client code reading or writing them, so the DROP POLICY + CREATE POLICY
-- below (superseding the original migration's "end the room" UPDATE policy) affects no
-- live client.
--
-- P1149 finish-review fix-forward (2026-08-24): the original "room members can end the
-- room" UPDATE policy (20260823190000) has a USING clause but no WITH CHECK. Per Postgres
-- RLS semantics, an UPDATE policy without WITH CHECK reuses USING for the check, which
-- restricts which ROW can be touched (must have a member) but not which COLUMNS change —
-- any member could rewrite `code` (breaking join-by-code for everyone else) or `event_id`
-- (re-attaching the room to an arbitrary event), not just `ended_at`.
--
-- Plain WITH CHECK can restrict the row's shape but not "this column must equal its prior
-- value" (that needs OLD, which RLS expressions don't see) — a BEFORE UPDATE trigger is the
-- standard Postgres pattern for column-level UPDATE restriction. The original migration is
-- already applied to the shared test DB, so per this repo's convention (see
-- 20260823200000_p1149_fix_room_members_rls_recursion.sql), the fix is forward, not an
-- in-place edit.

CREATE OR REPLACE FUNCTION public.transcribe_rooms_guard_immutable_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code
    OR NEW.event_id IS DISTINCT FROM OLD.event_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'transcribe_rooms: code, event_id, and created_at cannot be changed after creation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transcribe_rooms_guard_immutable_columns ON public.transcribe_rooms;
CREATE TRIGGER transcribe_rooms_guard_immutable_columns
  BEFORE UPDATE ON public.transcribe_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.transcribe_rooms_guard_immutable_columns();

DROP POLICY IF EXISTS "room members can end the room" ON public.transcribe_rooms;
CREATE POLICY "room members can end the room"
  ON public.transcribe_rooms FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transcribe_room_members m
      WHERE m.room_id = transcribe_rooms.id AND m.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transcribe_room_members m
      WHERE m.room_id = transcribe_rooms.id AND m.profile_id = auth.uid()
    )
  );
