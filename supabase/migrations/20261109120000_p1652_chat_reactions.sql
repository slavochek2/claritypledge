-- P1652: message reactions for Clarity Chat.
-- new function
--
-- client-safe: purely additive. One new table (chat_message_reactions), one trigger on chat_messages
--   that only removes rows of this new table, and three new functions no deployed client calls.
--   Nothing existing is redefined: erase_chat_data_for() and delete_chat_message() are NOT touched.
--
-- DESIGN (features/p1652_chat_links_and_basics.md, section 4):
--   * NO CLIENT WRITES (P1512): authenticated holds SELECT only. add_chat_reaction / remove_chat_reaction are
--     SECURITY DEFINER, take the person from auth.uid() (no "me" parameter), and are idempotent (never a toggle).
--   * SURROGATE KEY. The primary key is a generated id; (message_id, profile_id, emoji) is a separate UNIQUE
--     constraint. Realtime does not apply RLS to a DELETE and sends the removed row's primary key to every
--     subscriber (P1512 notes), so a natural key would leak who reacted to what.
--   * READ RULE mirrors message read access exactly: a reaction is visible when its message is visible to the
--     reader. The policy asks chat_messages itself (its RLS applies to the reader), so the conversation-access
--     rule and the "late joiner sees nothing before they joined" (since) rule are inherited, not copied.
--   * EXCLUDED CHAT: a message of a mirror conversation can never be reacted to. That is decided here, from
--     the message's own conversation, not on the screen. Private mirror rows shown inside a channel are rows
--     of a mirror conversation, so the same check covers them.
--   * DELETE: deleting a message (a soft delete: deleted_at set, row kept) removes its reactions through the
--     trigger below. The trigger sits on the row, so every path that sets deleted_at (the user delete, the
--     voice and canvas variants, erasure) is covered without redefining any of those functions. A hard delete
--     of a message or a conversation removes them through the FK cascade.
--   * ERASURE: profile_id references profiles ON DELETE CASCADE. erase_my_account() removes the profile row (via
--     the auth.users cascade), so a person's reactions go with the account. erase_chat_data_for() is left
--     alone on purpose: it is a very large function whose tests pin its statements.
--   * Reactions never touch chat_messages, chat_member_state or last_message_at, so they change no unread count,
--     list order or notification.
--   * emoji is limited to the fixed set here as well as in the client constant (REACTION_EMOJI), so a modified
--     client cannot post free text as a reaction. Changing the set means a new migration and that constant.

-- ============================================================================
-- 1. Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  emoji      text NOT NULL CHECK (emoji IN ('👍', '❤️', '😂', '😮', '😢', '🙏')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_message_reactions_unique UNIQUE (message_id, profile_id, emoji)
);

CREATE INDEX IF NOT EXISTS chat_message_reactions_profile ON public.chat_message_reactions (profile_id);

ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chat_message_reactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.chat_message_reactions TO authenticated;

DROP POLICY IF EXISTS chat_message_reactions_select ON public.chat_message_reactions;
CREATE POLICY chat_message_reactions_select ON public.chat_message_reactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id = chat_message_reactions.message_id));

-- ============================================================================
-- 2. A deleted message shows no reactions
-- ============================================================================
CREATE OR REPLACE FUNCTION public._chat_reactions_clear_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.chat_message_reactions r WHERE r.message_id = NEW.id;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._chat_reactions_clear_on_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_messages_clear_reactions ON public.chat_messages;
CREATE TRIGGER chat_messages_clear_reactions
  AFTER UPDATE OF deleted_at ON public.chat_messages
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION public._chat_reactions_clear_on_delete();

-- ============================================================================
-- 3. Writes
-- ============================================================================
DROP FUNCTION IF EXISTS public.add_chat_reaction(uuid, text);
CREATE FUNCTION public.add_chat_reaction(p_message uuid, p_emoji text)
RETURNS public.chat_message_reactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_msg   public.chat_messages;
  v_conv  public.chat_conversations;
  v_since timestamptz;
  v_row   public.chat_message_reactions;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_emoji IS NULL OR p_emoji NOT IN ('👍', '❤️', '😂', '😮', '😢', '🙏') THEN
    RAISE EXCEPTION 'chat: invalid reaction' USING ERRCODE = '22023';
  END IF;
  -- FOR SHARE: a concurrent delete of the message waits for this insert, and its trigger then clears the row.
  SELECT * INTO v_msg FROM public.chat_messages m WHERE m.id = p_message FOR SHARE;
  IF NOT FOUND OR v_msg.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;
  v_since := public._chat_access_since(v_msg.conversation_id, v_uid);
  IF v_since IS NULL OR v_msg.created_at < v_since THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_conv FROM public.chat_conversations c WHERE c.id = v_msg.conversation_id;
  IF v_conv.kind = 'mirror' THEN
    RAISE EXCEPTION 'chat: reactions are not available here' USING ERRCODE = '42501';
  END IF;
  -- refuses a blocked 1:1 and a person with no posting right
  PERFORM public._chat_assert_can_post(v_msg.conversation_id, v_uid);

  INSERT INTO public.chat_message_reactions (message_id, profile_id, emoji)
  VALUES (p_message, v_uid, p_emoji)
  ON CONFLICT (message_id, profile_id, emoji) DO NOTHING;
  SELECT * INTO v_row FROM public.chat_message_reactions r
   WHERE r.message_id = p_message AND r.profile_id = v_uid AND r.emoji = p_emoji;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.add_chat_reaction(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_chat_reaction(uuid, text) TO authenticated;

-- Removing only ever touches the caller's own row, so it needs no access check: it can reveal nothing, and a
-- person who lost access can still take their own reaction back. Repeating it changes nothing.
DROP FUNCTION IF EXISTS public.remove_chat_reaction(uuid, text);
CREATE FUNCTION public.remove_chat_reaction(p_message uuid, p_emoji text)
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
  DELETE FROM public.chat_message_reactions r
   WHERE r.message_id = p_message AND r.profile_id = v_uid AND r.emoji = p_emoji;
END;
$$;
REVOKE ALL ON FUNCTION public.remove_chat_reaction(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_chat_reaction(uuid, text) TO authenticated;

-- ============================================================================
-- 4. Realtime: after the policy above exists. REPLICA IDENTITY stays DEFAULT (a DELETE carries only the id).
-- ============================================================================
DO $realtime$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_message_reactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reactions;
  END IF;
END;
$realtime$;
