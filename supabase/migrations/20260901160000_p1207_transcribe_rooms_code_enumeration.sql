-- Migration: P1207 F2 — stop room-code enumeration on transcribe_rooms
-- Created: 2026-09-01
-- Spec: features/p1207_adversarial_permission_audit_before_agent_api.md
-- Audit: docs/audits/p1207-phase1-findings.md (F2)
-- Reproduced by: e2e/integration/p1207-transcribe-room-codes.spec.ts
--
-- The SELECT policy was:  TO authenticated  USING (true)
-- so any signed-in user could read every row of transcribe_rooms — including `code`.
--
-- `code` is not an identifier, it is a CREDENTIAL, and a blanket read exposed it to every
-- authenticated user regardless of room membership. Transcripts are the product's most sensitive
-- content. Mechanics: .private/docs/security-log.md § 2026-09-04.
--
-- FIX SHAPE — the same one already used for clarity_agreements' invitation_token in this audit,
-- and for get_agreement_by_token before it: a credential must be PRESENTED, never LISTED.
--   * table SELECT is scoped to rooms the caller is already a member of (their own room list)
--   * resolving a code goes through get_transcribe_room_by_code(), SECURITY DEFINER, which
--     returns at most one row and only on an exact code match
-- You can still trade a code you were given for a room. You can no longer ask for the codes.
--
-- new function: get_transcribe_room_by_code does not exist in any prior migration (grep) and is
-- absent from prod's pg_proc (checked 2026-09-01). Nothing is redefined, so there is no prior
-- version to diff against.
--
-- The UPDATE policy ("room members can end the room") and its P1149 column guard are NOT touched.
--
-- client-safe: paired with the transcribe-service.ts change in the same commit — getRoomByCode()
-- calls the RPC instead of selecting the table. The member-scoped SELECT still serves every
-- other read (a member reading their own room). Deploying ahead of the client would make
-- getRoomByCode return null for a valid code — a "room not found" message, not data loss.

-- ============================================================================
-- 1. SELECT — members only. No enumeration.
-- ============================================================================
DROP POLICY IF EXISTS "authenticated users can read rooms" ON public.transcribe_rooms;

CREATE POLICY "room members can read their rooms"
  ON public.transcribe_rooms FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM transcribe_room_members m
      WHERE m.room_id = transcribe_rooms.id
        AND m.profile_id = auth.uid()
    )
  );

COMMENT ON POLICY "room members can read their rooms" ON public.transcribe_rooms IS
  'P1207 F2: transcribe_rooms.code is a join credential, not an identifier. A USING (true) read '
  'let any authenticated user enumerate every live room code. Code resolution goes through '
  'get_transcribe_room_by_code(); do not restore a blanket read here.';

-- ============================================================================
-- 2. Present-a-code lookup. Exact match only, so it cannot be used to enumerate.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_transcribe_room_by_code(p_code text)
RETURNS TABLE (
  id uuid, code text, event_id uuid, created_at timestamptz, ended_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT r.id, r.code, r.event_id, r.created_at, r.ended_at
  FROM transcribe_rooms r
  -- Equality on the full code only. No LIKE, no prefix, no ordering, no limit-based paging:
  -- every one of those would turn this back into an enumeration oracle.
  WHERE r.code = upper(p_code)
    AND r.ended_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_transcribe_room_by_code(text) TO authenticated;
