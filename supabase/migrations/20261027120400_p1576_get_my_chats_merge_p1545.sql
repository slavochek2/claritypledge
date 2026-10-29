-- P1576 x P1545: get_my_chats() carrying BOTH features' changes.
-- diffed against: 20261023100000_p1545_artifacts_data.sql (branch feature/p1545-menu-artifacts) and
--   20261027120100_p1576_chat_voice_notes.sql
--
-- 20261027120100_p1576_chat_voice_notes.sql redefined get_my_chats() from the p1512 body (adding the
-- "Voice message" list preview). P1545 (20261023100000_p1545_artifacts_data.sql, on its own branch) had
-- redefined it too (an empty, never-opened channel counts unread 1). Applied to the shared TEST DB, the
-- p1576 body silently dropped P1545's rule. This file is P1545's body, byte for byte, plus exactly the two
-- p1576 lines (the preview CASE arm and audio_duration_ms in the last-message lateral). It depends only on
-- objects already on main (event_grace_interval since p1256), so it is correct whichever feature ships
-- first; if P1545 ships AFTER this, its older-timestamped file would overwrite this body and drop the
-- voice preview (cosmetic: the list shows "Attachment") -- re-apply this file then.
--
-- client-safe: same signature and return shape; only the preview text and unread count change.

CREATE OR REPLACE FUNCTION public.get_my_chats()
RETURNS TABLE (
  conversation_id      uuid,
  kind                 text,
  title                text,
  other_id             uuid,
  other_name           text,
  other_slug           text,
  other_avatar_url     text,
  other_avatar_color   text,
  other_deleted        boolean,
  org_id               uuid,
  org_slug             text,
  org_name             text,
  event_id             uuid,
  event_slug           text,
  event_title          text,
  event_datetime       timestamptz,
  owner_first_name     text,
  last_message_id      uuid,
  last_author_id       uuid,
  last_author_name     text,
  last_body            text,
  last_message_kind    text,
  last_message_deleted boolean,
  last_message_at      timestamptz,
  unread_count         integer,
  manual_unread        boolean,
  archived             boolean,
  last_read_at         timestamptz,
  is_partner           boolean,
  members_since        timestamptz,
  can_send             boolean,
  blocked_by_me        boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM public._chat_ensure_for_user(v_uid);

  RETURN QUERY
  SELECT
    c.id,
    c.kind,
    c.title,
    op.id,
    op.name,
    op.slug,
    op.avatar_url,
    op.avatar_color,
    (c.kind = 'dm' AND op.id IS NULL),
    org.id,
    org.slug,
    org.name,
    ev.id,
    ev.slug,
    ev.title,
    ev.datetime,
    split_part(ow.name, ' ', 1),
    lm.id,
    lm.author_id,
    lm.author_name,
    -- A clarify shows the clarifier's note when there is one, else the copied words from the snapshot;
    -- delete and erase clear both.
    CASE WHEN lm.deleted_at IS NOT NULL THEN 'Message deleted'
         WHEN lm.audio_duration_ms IS NOT NULL THEN 'Voice message'
         WHEN lm.kind = 'clarify' THEN COALESCE(lm.body, lm.forward_snapshot ->> 'body')
         ELSE lm.body END,
    lm.kind,
    (lm.deleted_at IS NOT NULL),
    lm.created_at,
    -- P1545: an EMPTY channel the person has never opened counts unread 1 while it is in their Inbox
    -- (a group always; an event from 24 h before it starts until the grace window after). Opening it
    -- (mark_chat_read) sets last_read_at, which ends it. Real unread messages always win.
    CASE
      WHEN COALESCE(un.n, 0) > 0 THEN un.n
      WHEN lm.id IS NULL AND st.last_read_at IS NULL
           AND (c.kind = 'group'
                OR (c.kind = 'event' AND ev.datetime IS NOT NULL
                    AND now() >= ev.datetime - interval '24 hours'
                    AND now() <= ev.datetime + public.event_grace_interval()))
        THEN 1
      ELSE 0
    END,
    COALESCE(st.manual_unread, false),
    COALESCE(st.archived, false),
    st.last_read_at,
    (c.kind = 'dm' AND op.id IS NOT NULL AND public._chat_shared_reason(v_uid, op.id) = 'partner'),
    NULLIF(mine.since, '-infinity'::timestamptz),
    -- false for a 1:1 once either side has blocked the other (or the other account is gone); the
    -- blocked side only learns "cannot send", never who blocked whom
    (c.kind <> 'dm' OR (op.id IS NOT NULL AND NOT public._chat_blocked_either(v_uid, op.id))),
    (c.kind = 'dm' AND op.id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.chat_blocks b WHERE b.blocker_id = v_uid AND b.blocked_id = op.id))
  FROM public._chat_my_conversations(v_uid) mine
  JOIN public.chat_conversations c ON c.id = mine.id
  LEFT JOIN public.chat_member_state st ON st.conversation_id = c.id AND st.profile_id = v_uid
  LEFT JOIN public.profiles op
         ON c.kind = 'dm'
        AND op.id = CASE WHEN c.dm_user_a = v_uid THEN c.dm_user_b ELSE c.dm_user_a END
  LEFT JOIN public.events ev ON ev.id = c.event_id
  LEFT JOIN public.organization org ON org.id = COALESCE(c.org_id, ev.org_id)
  LEFT JOIN public.profiles ow ON ow.id = c.owner_id
  LEFT JOIN LATERAL (
    SELECT m.id, m.author_id, ap.name AS author_name, m.body, m.kind, m.forward_snapshot, m.deleted_at, m.created_at,
           m.audio_duration_ms
      FROM public.chat_messages m
      LEFT JOIN public.profiles ap ON ap.id = m.author_id
     WHERE m.conversation_id = c.id
       AND m.thread_root_id IS NULL
       AND m.created_at >= mine.since
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS n
      FROM public.chat_messages m
     WHERE m.conversation_id = c.id
       AND m.thread_root_id IS NULL
       AND m.deleted_at IS NULL
       AND m.author_id IS DISTINCT FROM v_uid
       AND m.created_at >= mine.since
       AND m.created_at > COALESCE(st.last_read_at, '-infinity'::timestamptz)
  ) un ON true
  ORDER BY COALESCE(lm.created_at, c.created_at) DESC, c.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_chats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_chats() TO authenticated;
