-- Migration: P1604 (12/12) — the mirror agent's chat cannot be archived
-- Created: 2026-11-04
-- Spec: features/p1604_transcription_belongs_to_a_chat.md (founder: the mirror agent's chat must not offer Archive)
-- Guaranteed by: e2e/integration/p1604-mirror-no-archive.spec.ts
--
-- diffed against: 20261019203000_p1512_clarity_chat.sql (set_chat_state: same signature, return type, grants and body; ONE change:
--   archiving (p_archived = true) a conversation of kind 'mirror' is refused. p_archived = false and every other state change work as before.)
--   Data: a mirror the owner had already archived is unarchived once, so the chat comes back to the list (it was reachable only in the
--   collapsed "Archived" section, whose row menu offers Unarchive).
--
-- client-safe: function body only; one UPDATE of per-person list state.

CREATE OR REPLACE FUNCTION public.set_chat_state(
  p_conversation  uuid,
  p_archived      boolean DEFAULT NULL,
  p_manual_unread boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF public._chat_access_since(p_conversation, v_uid) IS NULL THEN
    RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
  END IF;
  -- P1604 (founder): the mirror agent's chat is never archived. Unarchiving, marking unread and reading stay allowed.
  IF p_archived IS TRUE AND EXISTS (SELECT 1 FROM public.chat_conversations c WHERE c.id = p_conversation AND c.kind = 'mirror') THEN
    RAISE EXCEPTION 'chat: the mirror agent chat cannot be archived' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.chat_member_state (conversation_id, profile_id, manual_unread, archived)
  VALUES (p_conversation, v_uid, COALESCE(p_manual_unread, false), COALESCE(p_archived, false))
  ON CONFLICT (conversation_id, profile_id) DO UPDATE
    SET archived      = COALESCE(p_archived, public.chat_member_state.archived),
        manual_unread = COALESCE(p_manual_unread, public.chat_member_state.manual_unread);
END;
$$;
REVOKE ALL ON FUNCTION public.set_chat_state(uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_chat_state(uuid, boolean, boolean) TO authenticated;

UPDATE public.chat_member_state s SET archived = false
  FROM public.chat_conversations c
 WHERE c.id = s.conversation_id AND c.kind = 'mirror' AND s.archived;
