-- P1545 WP1: the data layer for the Artifacts page and for sharing artifacts in chats.
--
-- client-safe: deployed clients keep working. Every function that is replaced keeps its name, argument
--   list and return shape (get_my_chats, send_chat_message, share_canvas); the only DROP FUNCTION is the
--   old 3-argument _chat_can_attach, an internal helper that no client role may execute (REVOKEd since
--   P1512) and whose only caller, send_chat_message, is replaced in this same file. A deployed client
--   that meets a chat message with attachment_kind 'canvas' or 'letter' renders its unknown-kind card as
--   "Not available to you", which is the honest fallback. The empty-channel unread of 1 only changes a
--   badge number.
--
-- diffed against:
--   * get_my_chats      20261019203000_p1512_clarity_chat.sql (the only definition). Body is byte-for-byte
--     that file's except the `unread_count` expression (one CASE, see below).
--   * send_chat_message 20261022160000_p1546_threads_everywhere.sql (latest). Body is that file's except:
--     the kind allow-list gains 'canvas' and 'letter', and _chat_can_attach receives the conversation.
--   * share_canvas      20261021200000_p1515_people_and_link.sql (latest). Body is that file's except: the
--     audience INSERT returns the new entry id, and a NEW grant (never a re-share) posts one message.
--   Every guard of the three stays.
--
-- DESIGN (features/p1545_menu_and_artifacts.md, Phase 2 build plan WP1 + Spec review amendments)
--   * "Shared with me" lists EXPLICIT grants only (person, a group I belong to, an event I am admitted
--     to), through _canvas_admitted_via. A canvas that is only open by link is in nobody's list.
--   * canvas_reads is the artifact read state: RLS on, no policy, no grant (like P1515's tables); written
--     only by mark_canvas_read. Unread = no read row, or a read before the grant was made.
--   * Chat attachment kinds 'canvas' and 'letter' (attachment_id = canvases.id / clarity_letters.id).
--     _chat_can_attach admits them only when the chat's audience can already read the artifact.
--   * A letter message is posted by a trigger on letter_deliveries (seal and add-recipient both insert
--     there), so the sealing RPCs stay untouched. Registered recipients of a one-to-one letter only.
--   * Messages carry NO body: the wording of a share message is a founder decision, the card is the message.
--   * get_chat_artifact_attachment answers the card for the VIEWER: a revoked or deleted artifact comes back
--     available=false with no title, so nothing leaks and the message stays.

-- ============================================================================
-- 1. chat_messages: allow the two new attachment kinds
-- ============================================================================
-- the column was declared with an inline CHECK, which Postgres named chat_messages_attachment_kind_check
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_attachment_kind_check;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_attachment_kind_check
  CHECK (attachment_kind IS NULL OR attachment_kind IN ('point', 'story', 'canvas', 'letter'));

-- ============================================================================
-- 2. canvas_reads: one read marker per (canvas, person). Closed to every client role.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.canvas_reads (
  canvas_id uuid NOT NULL REFERENCES public.canvases(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (canvas_id, user_id)
);
CREATE INDEX IF NOT EXISTS canvas_reads_user ON public.canvas_reads (user_id);
ALTER TABLE public.canvas_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.canvas_reads FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. Internal chat helpers (never client-callable)
-- ============================================================================

-- The 1:1 for a share, find-or-create, under exactly start_dm's rules (not blocked, an existing 1:1 stays
-- usable, a NEW one needs a shared connection and the 20-a-day limit). NULL = no message can be posted;
-- the artifact still shows in the other person's Shared with you.
CREATE OR REPLACE FUNCTION public._chat_dm_for_share(p_from uuid, p_to uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_a   uuid;
  v_b   uuid;
  v_id  uuid;
  v_new integer;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from = p_to THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_to) THEN
    RETURN NULL;
  END IF;
  IF public._chat_blocked_either(p_from, p_to) THEN
    RETURN NULL;
  END IF;
  v_a := LEAST(p_from, p_to);
  v_b := GREATEST(p_from, p_to);
  SELECT c.id INTO v_id FROM public.chat_conversations c
   WHERE c.kind = 'dm' AND c.dm_user_a = v_a AND c.dm_user_b = v_b;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  IF public._chat_shared_reason(p_from, p_to) IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('chat_start_dm:' || p_from::text, 0));
  SELECT count(*)::integer INTO v_new FROM public.chat_conversations c
   WHERE c.kind = 'dm' AND c.created_by = p_from AND c.created_at > now() - interval '24 hours';
  IF v_new >= 20 THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.chat_conversations (kind, dm_user_a, dm_user_b, created_by)
  VALUES ('dm', v_a, v_b, p_from)
  ON CONFLICT (dm_user_a, dm_user_b) WHERE kind = 'dm' DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT c.id INTO v_id FROM public.chat_conversations c
     WHERE c.kind = 'dm' AND c.dm_user_a = v_a AND c.dm_user_b = v_b;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public._chat_dm_for_share(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Posts one attachment-only message as p_author. Does nothing when there is no conversation, the author
-- cannot read it, or (1:1) either side blocked the other. Moves the author's own read marker, like a send.
CREATE OR REPLACE FUNCTION public._chat_post_artifact(p_conversation uuid, p_author uuid, p_kind text, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conv public.chat_conversations;
  v_at   timestamptz;
BEGIN
  IF p_conversation IS NULL OR p_author IS NULL OR p_kind NOT IN ('canvas', 'letter') OR p_id IS NULL THEN
    RETURN;
  END IF;
  SELECT * INTO v_conv FROM public.chat_conversations c WHERE c.id = p_conversation;
  IF NOT FOUND OR public._chat_access_since(p_conversation, p_author) IS NULL THEN
    RETURN;
  END IF;
  IF v_conv.kind = 'dm' THEN
    IF v_conv.dm_user_a IS NULL OR v_conv.dm_user_b IS NULL
       OR public._chat_blocked_either(v_conv.dm_user_a, v_conv.dm_user_b) THEN
      RETURN;
    END IF;
  ELSIF v_conv.kind NOT IN ('group', 'event') THEN
    RETURN;
  END IF;

  INSERT INTO public.chat_messages (conversation_id, author_id, kind, attachment_kind, attachment_id, created_at)
  VALUES (p_conversation, p_author, 'message', p_kind, p_id, clock_timestamp())
  RETURNING created_at INTO v_at;

  UPDATE public.chat_conversations c SET last_message_at = v_at WHERE c.id = p_conversation;
  INSERT INTO public.chat_member_state (conversation_id, profile_id, last_read_at, manual_unread)
  VALUES (p_conversation, p_author, v_at, false)
  ON CONFLICT (conversation_id, profile_id) DO UPDATE
    SET last_read_at  = GREATEST(COALESCE(public.chat_member_state.last_read_at, '-infinity'::timestamptz),
                                 EXCLUDED.last_read_at),
        manual_unread = false;
END;
$$;
REVOKE ALL ON FUNCTION public._chat_post_artifact(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- The chat a canvas grant belongs in: a person -> the 1:1; a group / an event -> its channel (created
-- if the first person has not opened it yet, exactly as _chat_ensure_for_user would).
CREATE OR REPLACE FUNCTION public._chat_post_canvas_share(p_owner uuid, p_canvas uuid, p_kind text, p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conv uuid;
BEGIN
  IF p_kind = 'person' THEN
    v_conv := public._chat_dm_for_share(p_owner, p_target);
  ELSIF p_kind = 'group' THEN
    INSERT INTO public.chat_conversations (kind, org_id) VALUES ('group', p_target)
    ON CONFLICT (org_id) WHERE kind = 'group' DO NOTHING;
    SELECT c.id INTO v_conv FROM public.chat_conversations c WHERE c.kind = 'group' AND c.org_id = p_target;
  ELSIF p_kind = 'event' THEN
    INSERT INTO public.chat_conversations (kind, event_id) VALUES ('event', p_target)
    ON CONFLICT (event_id) WHERE kind = 'event' DO NOTHING;
    SELECT c.id INTO v_conv FROM public.chat_conversations c WHERE c.kind = 'event' AND c.event_id = p_target;
  END IF;
  PERFORM public._chat_post_artifact(v_conv, p_owner, 'canvas', p_canvas);
END;
$$;
REVOKE ALL ON FUNCTION public._chat_post_canvas_share(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- May this person attach this artifact to THIS conversation? Never widens access: the audience of the
-- conversation must already be able to read it, and the sender must be able to read it too.
--   point / story  unchanged from P1512 (public, or yours).
--   canvas, 1:1    the other member holds a person grant (or is the owner), or the canvas is link-public.
--   canvas, channel  that group / event holds a grant.
--   letter         1:1 only, the caller is the sender of a sealed one-to-one letter and the other member
--                  is one of its recipients.
--   anything else (the mirror, an unknown kind, a missing artifact) -> false.
CREATE OR REPLACE FUNCTION public._chat_can_attach(p_kind text, p_id uuid, p_uid uuid, p_conversation uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conv   public.chat_conversations;
  v_canvas public.canvases;
  v_other  uuid;
BEGIN
  IF p_kind = 'point' THEN
    RETURN EXISTS (SELECT 1 FROM public.points x
                    WHERE x.id = p_id AND (x.visibility = 'public' OR x.first_validator_id = p_uid));
  ELSIF p_kind = 'story' THEN
    RETURN EXISTS (SELECT 1 FROM public.stories x
                    WHERE x.id = p_id AND (x.visibility = 'public' OR x.author_id = p_uid));
  ELSIF p_kind NOT IN ('canvas', 'letter') THEN
    RETURN false;
  END IF;

  IF p_uid IS NULL OR p_id IS NULL OR p_conversation IS NULL THEN
    RETURN false;
  END IF;
  SELECT * INTO v_conv FROM public.chat_conversations c WHERE c.id = p_conversation;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_kind = 'canvas' THEN
    SELECT * INTO v_canvas FROM public.canvases c WHERE c.id = p_id;
    IF NOT FOUND THEN
      RETURN false;
    END IF;
    -- the sender must be able to read it themselves
    IF NOT (v_canvas.owner_id = p_uid
            OR v_canvas.general_access = 'link'
            OR public._canvas_admitted_via(v_canvas.id, p_uid) IS NOT NULL) THEN
      RETURN false;
    END IF;
    IF v_conv.kind = 'dm' THEN
      v_other := CASE WHEN v_conv.dm_user_a = p_uid THEN v_conv.dm_user_b ELSE v_conv.dm_user_a END;
      IF v_other IS NULL THEN
        RETURN false;
      END IF;
      RETURN v_canvas.owner_id = v_other
          OR v_canvas.general_access = 'link'
          OR EXISTS (SELECT 1 FROM public.canvas_audience a
                      WHERE a.canvas_id = v_canvas.id AND a.kind = 'person' AND a.profile_id = v_other);
    ELSIF v_conv.kind = 'group' THEN
      RETURN EXISTS (SELECT 1 FROM public.canvas_audience a
                      WHERE a.canvas_id = v_canvas.id AND a.kind = 'group' AND a.org_id = v_conv.org_id);
    ELSIF v_conv.kind = 'event' THEN
      RETURN EXISTS (SELECT 1 FROM public.canvas_audience a
                      WHERE a.canvas_id = v_canvas.id AND a.kind = 'event' AND a.event_id = v_conv.event_id);
    END IF;
    RETURN false;
  END IF;

  -- letter: a private letter is never attached to a channel
  IF v_conv.kind <> 'dm' THEN
    RETURN false;
  END IF;
  v_other := CASE WHEN v_conv.dm_user_a = p_uid THEN v_conv.dm_user_b ELSE v_conv.dm_user_a END;
  IF v_other IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.clarity_letters l
                  WHERE l.id = p_id AND l.sender_id = p_uid AND l.status = 'sealed' AND l.mode = 'one-to-one'
                    AND EXISTS (SELECT 1 FROM public.letter_deliveries d
                                 WHERE d.letter_id = l.id AND d.receiver_profile_id = v_other));
END;
$$;
REVOKE ALL ON FUNCTION public._chat_can_attach(text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 4. send_chat_message (kinds widened, the conversation reaches _chat_can_attach)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_conversation    uuid,
  p_body            text,
  p_reply_to        uuid DEFAULT NULL,
  p_thread_root     uuid DEFAULT NULL,
  p_attachment_kind text DEFAULT NULL,
  p_attachment_id   uuid DEFAULT NULL,
  p_client_id       uuid DEFAULT NULL
)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_conv  public.chat_conversations;
  v_since timestamptz;
  v_body  text;
  v_row   public.chat_messages;
BEGIN
  v_conv  := public._chat_assert_can_post(p_conversation, v_uid);
  v_since := public._chat_access_since(p_conversation, v_uid);

  -- Idempotent retry: this author already sent with this client id, so return THAT row. Reusing the
  -- id for a different conversation is an error, never a cross-post.
  IF p_client_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = v_uid AND m.client_id = p_client_id;
    IF FOUND THEN
      IF v_row.conversation_id <> p_conversation THEN
        RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
      END IF;
      -- A replay is a READ of the stored row, so it follows today's visibility: a message from a
      -- membership that has since ended (left and rejoined) is not handed back.
      IF v_row.created_at < v_since THEN
        RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
      END IF;
      RETURN v_row;
    END IF;
  END IF;

  v_body := NULLIF(btrim(COALESCE(p_body, '')), '');
  IF (p_attachment_kind IS NULL) <> (p_attachment_id IS NULL) THEN
    RAISE EXCEPTION 'chat: an attachment needs a kind and an id' USING ERRCODE = '22023';
  END IF;
  IF p_attachment_kind IS NOT NULL AND p_attachment_kind NOT IN ('point', 'story', 'canvas', 'letter') THEN
    RAISE EXCEPTION 'chat: unknown attachment kind' USING ERRCODE = '22023';
  END IF;
  IF v_body IS NULL AND p_attachment_id IS NULL THEN
    RAISE EXCEPTION 'chat: empty message' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'chat: message too long' USING ERRCODE = '22023';
  END IF;
  -- One error for "does not exist" and "exists but you cannot see it", so ids cannot be probed.
  IF p_attachment_id IS NOT NULL AND NOT public._chat_can_attach(p_attachment_kind, p_attachment_id, v_uid, p_conversation) THEN
    RAISE EXCEPTION 'chat: attachment not available' USING ERRCODE = '22023';
  END IF;

  -- P1546: every conversation kind has threads (a 1:1 and the mirror too); who may read a reply is
  -- whoever may read its conversation, so the RLS on chat_messages needs no change.
  IF p_thread_root IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.chat_messages t
                    WHERE t.id = p_thread_root AND t.conversation_id = p_conversation
                      AND t.deleted_at IS NULL AND t.thread_root_id IS NULL AND t.created_at >= v_since) THEN
      RAISE EXCEPTION 'chat: thread not available' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_reply_to IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.chat_messages t
                    WHERE t.id = p_reply_to AND t.conversation_id = p_conversation
                      AND t.deleted_at IS NULL AND t.created_at >= v_since) THEN
      RAISE EXCEPTION 'chat: reply target not available' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- clock_timestamp(), not now(): now() is the START of this transaction, which can be earlier than
  -- another device's read marker written while this call was running (unread would miscount).
  INSERT INTO public.chat_messages
    (conversation_id, author_id, body, reply_to_id, thread_root_id, kind, attachment_kind, attachment_id,
     client_id, created_at)
  VALUES
    (p_conversation, v_uid, v_body, p_reply_to, p_thread_root, 'message', p_attachment_kind, p_attachment_id,
     p_client_id, clock_timestamp())
  ON CONFLICT (author_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    -- a concurrent call with the same client id committed first: return its row
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = v_uid AND m.client_id = p_client_id;
    IF v_row.conversation_id <> p_conversation THEN
      RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
    END IF;
    IF v_row.created_at < v_since THEN
      RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
    END IF;
    RETURN v_row;
  END IF;

  IF p_thread_root IS NULL THEN
    UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = p_conversation;
    -- Writing in a chat means you are in it: your own send clears a manual "unread" mark and moves
    -- your read marker to the new message. (Thread replies do not: the thread is not the channel.)
    INSERT INTO public.chat_member_state (conversation_id, profile_id, last_read_at, manual_unread)
    VALUES (p_conversation, v_uid, v_row.created_at, false)
    ON CONFLICT (conversation_id, profile_id) DO UPDATE
      SET last_read_at  = GREATEST(COALESCE(public.chat_member_state.last_read_at, '-infinity'::timestamptz),
                                   EXCLUDED.last_read_at),
          manual_unread = false;
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.send_chat_message(uuid, text, uuid, uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_chat_message(uuid, text, uuid, uuid, text, uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public._chat_can_attach(text, uuid, uuid);

-- ============================================================================
-- 5. share_canvas posts one message on a NEW grant
-- ============================================================================
CREATE OR REPLACE FUNCTION public.share_canvas(p_name text, p_kind text, p_target uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_name   text := lower(COALESCE(p_name, ''));
  v_canvas uuid;
  v_entry  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF v_name !~ '^[a-z0-9_]{1,64}$' OR p_kind IS NULL OR p_kind NOT IN ('event', 'group', 'person') OR p_target IS NULL THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  -- The caller must actually own a canvas of this name (at least one current point on it).
  IF NOT EXISTS (
    SELECT 1 FROM public.points p
     WHERE p.first_validator_id = v_uid
       AND p.superseded_by IS NULL
       AND p.system_tags @> ARRAY['canvas_' || v_name]::text[]
       AND p.system_tags && public._canvas_box_tags()
  ) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  -- Everything inside a canvas follows the canvas, so a canvas must hold no PUBLIC point. The trigger
  -- below keeps new ones out; this refuses a legacy canvas that still has one (its visibility cannot
  -- change, p586), with the same message as every other refusal.
  IF EXISTS (
    SELECT 1 FROM public.points p
     WHERE p.first_validator_id = v_uid
       AND p.superseded_by IS NULL
       AND p.visibility = 'public'::public.content_visibility
       AND p.system_tags @> ARRAY['canvas_' || v_name]::text[]
  ) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  -- A cancelled event is not a place to share with.
  IF p_kind = 'event' AND EXISTS (
    SELECT 1 FROM public.events e WHERE e.id = p_target AND e.status = 'cancelled'
  ) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'person' THEN
    -- Only a person the owner could find in the invite field (search_profiles), never themselves.
    IF NOT public._canvas_person_eligible(v_uid, p_target) THEN
      RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public._canvas_target_admits(
       p_kind,
       CASE WHEN p_kind = 'event' THEN p_target END,
       CASE WHEN p_kind = 'group' THEN p_target END,
       v_uid) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.canvases (owner_id, name) VALUES (v_uid, v_name)
  ON CONFLICT (owner_id, name) DO NOTHING;
  SELECT c.id INTO v_canvas FROM public.canvases c WHERE c.owner_id = v_uid AND c.name = v_name;

  INSERT INTO public.canvas_audience (canvas_id, kind, event_id, org_id, profile_id)
  VALUES (
    v_canvas, p_kind,
    CASE WHEN p_kind = 'event' THEN p_target END,
    CASE WHEN p_kind = 'group' THEN p_target END,
    CASE WHEN p_kind = 'person' THEN p_target END
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_entry;

  -- P1545: a NEW grant posts one attachment message in the matching chat; a re-share (the entry
  -- already existed) posts nothing. Sharing must never fail because of chat, so a failure to post is a
  -- warning, not an error (the canvas still shows in Shared with you).
  IF v_entry IS NOT NULL THEN
    BEGIN
      PERFORM public._chat_post_canvas_share(v_uid, v_canvas, p_kind, p_target);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'share_canvas: chat message not posted (%)', SQLERRM;
    END;
  END IF;

  RETURN true;
END;
$$;


REVOKE ALL ON FUNCTION public.share_canvas(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.share_canvas(text, text, uuid) TO authenticated;

-- ============================================================================
-- 6. Letters: a registered recipient of a one-to-one letter gets the letter in the 1:1
-- ============================================================================
-- seal_and_send_letter and add_recipient_to_sealed_letter both INSERT into letter_deliveries, so one
-- trigger covers seal and add-recipient without touching either. A delivery with no profile (an email
-- that has not registered) and every public-link delivery (mode one-to-many) post nothing.
CREATE OR REPLACE FUNCTION public._chat_post_letter_on_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sender uuid;
  v_mode   text;
BEGIN
  IF NEW.receiver_profile_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT l.sender_id, l.mode INTO v_sender, v_mode FROM public.clarity_letters l WHERE l.id = NEW.letter_id;
  IF v_sender IS NULL OR v_mode <> 'one-to-one' OR v_sender = NEW.receiver_profile_id THEN
    RETURN NEW;
  END IF;
  -- Sealing and adding a recipient must never fail because of chat.
  BEGIN
    PERFORM public._chat_post_artifact(
      public._chat_dm_for_share(v_sender, NEW.receiver_profile_id), v_sender, 'letter', NEW.letter_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'letter delivery: chat message not posted (%)', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._chat_post_letter_on_delivery() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS p1545_chat_post_letter ON public.letter_deliveries;
CREATE TRIGGER p1545_chat_post_letter
  AFTER INSERT ON public.letter_deliveries
  FOR EACH ROW EXECUTE FUNCTION public._chat_post_letter_on_delivery();

-- ============================================================================
-- 7. get_my_chats: an empty, never-opened channel counts unread 1 (Inbox eligibility)
-- ============================================================================
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
    SELECT m.id, m.author_id, ap.name AS author_name, m.body, m.kind, m.forward_snapshot, m.deleted_at, m.created_at
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

-- Existing memberships must not wake up with phantom badges on deploy: every empty channel a person is
-- already in is marked opened. Only rows that were never opened (last_read_at NULL) change, and only
-- where the person has no visible message to read, so nobody loses a real unread.
INSERT INTO public.chat_member_state (conversation_id, profile_id, last_read_at)
SELECT DISTINCT ON (x.cid, x.pid) x.cid, x.pid, now()
  FROM (
    SELECT c.id AS cid, m.user_id AS pid, m.accepted_at AS since
      FROM public.chat_conversations c
      JOIN public.membership m ON m.org_id = c.org_id
     WHERE c.kind = 'group'
    UNION ALL
    SELECT c.id, r.profile_id, r.rsvped_at
      FROM public.chat_conversations c
      JOIN public.event_rsvps r ON r.event_id = c.event_id
     WHERE c.kind = 'event'
    UNION ALL
    SELECT c.id, e.host_id, '-infinity'::timestamptz
      FROM public.chat_conversations c
      JOIN public.events e ON e.id = c.event_id
     WHERE c.kind = 'event' AND e.host_id IS NOT NULL
  ) x
 WHERE x.pid IS NOT NULL AND x.since IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = x.pid)
   AND NOT EXISTS (SELECT 1 FROM public.chat_messages m
                    WHERE m.conversation_id = x.cid AND m.thread_root_id IS NULL AND m.created_at >= x.since)
ON CONFLICT (conversation_id, profile_id) DO UPDATE
  SET last_read_at = EXCLUDED.last_read_at
  WHERE public.chat_member_state.last_read_at IS NULL;

-- ============================================================================
-- 8. The Artifacts page: my canvases, canvases shared with me, the read marker
-- ============================================================================

-- The caller's canvases: every canvas name they hold points on (the tag set the canvas page uses) merged
-- with their canvases rows (a row exists only once something was shared). No row = private, no audience.
CREATE OR REPLACE FUNCTION public.list_my_artifacts_canvases()
RETURNS TABLE (
  canvas_id      uuid,
  name           text,
  general_access text,
  has_audience   boolean,
  last_edit      timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH tagged AS (
    SELECT substr(t.tag, 8) AS cname, max(p.updated_at) AS edited
      FROM public.points p
     CROSS JOIN LATERAL unnest(p.system_tags) AS t(tag)
     WHERE p.first_validator_id = v_uid
       AND p.superseded_by IS NULL
       AND p.system_tags && public._canvas_box_tags()
       AND t.tag LIKE 'canvas\_%'
       AND substr(t.tag, 8) ~ '^[a-z0-9_]{1,64}$'
     GROUP BY 1
  )
  SELECT c.id,
         COALESCE(c.name, tg.cname),
         COALESCE(c.general_access, 'restricted'),
         COALESCE(EXISTS (SELECT 1 FROM public.canvas_audience a WHERE a.canvas_id = c.id), false),
         COALESCE(tg.edited, c.created_at)
    FROM tagged tg
    FULL JOIN (SELECT * FROM public.canvases cc WHERE cc.owner_id = v_uid) c ON c.name = tg.cname
   ORDER BY COALESCE(tg.edited, c.created_at) DESC NULLS LAST, COALESCE(c.name, tg.cname);
END;
$$;
REVOKE ALL ON FUNCTION public.list_my_artifacts_canvases() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_artifacts_canvases() TO authenticated;

-- Canvases other people shared with the caller through an EXPLICIT grant that admits them right now.
-- A canvas open only by link is never listed (it would list every link canvas to everyone).
CREATE OR REPLACE FUNCTION public.list_canvases_shared_with_me()
RETURNS TABLE (
  canvas_id          uuid,
  name               text,
  owner_id           uuid,
  owner_name         text,
  owner_slug         text,
  owner_avatar_url   text,
  owner_avatar_color text,
  via                text,
  via_name           text,
  shared_at          timestamptz,
  unread             boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT c.id,
         c.name,
         c.owner_id,
         op.name,
         op.slug,
         op.avatar_url,
         op.avatar_color,
         a.kind,
         CASE a.kind WHEN 'group' THEN org.name WHEN 'event' THEN ev.title END,
         a.created_at,
         (r.read_at IS NULL OR r.read_at < a.created_at)
    FROM public.canvases c
    CROSS JOIN LATERAL (SELECT public._canvas_admitted_via(c.id, v_uid) AS aid) v
    JOIN public.canvas_audience a ON a.id = v.aid
    LEFT JOIN public.profiles op ON op.id = c.owner_id
    LEFT JOIN public.organization org ON org.id = a.org_id
    LEFT JOIN public.events ev ON ev.id = a.event_id
    LEFT JOIN public.canvas_reads r ON r.canvas_id = c.id AND r.user_id = v_uid
   WHERE c.owner_id <> v_uid
     AND v.aid IS NOT NULL
   ORDER BY a.created_at DESC, c.id;
END;
$$;
REVOKE ALL ON FUNCTION public.list_canvases_shared_with_me() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_canvases_shared_with_me() TO authenticated;

-- Opening a canvas marks it read for the caller. Only a person an explicit grant admits has a read
-- marker; for anyone else (the owner, a link holder, a stranger) it does nothing and says nothing, so it
-- cannot be used to probe which canvases exist.
CREATE OR REPLACE FUNCTION public.mark_canvas_read(p_owner uuid, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_canvas uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  SELECT c.id INTO v_canvas FROM public.canvases c
   WHERE c.owner_id = p_owner AND c.name = lower(COALESCE(p_name, '')) AND c.owner_id <> v_uid;
  IF v_canvas IS NULL OR public._canvas_admitted_via(v_canvas, v_uid) IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.canvas_reads (canvas_id, user_id, read_at) VALUES (v_canvas, v_uid, clock_timestamp())
  ON CONFLICT (canvas_id, user_id) DO UPDATE
    SET read_at = GREATEST(public.canvas_reads.read_at, EXCLUDED.read_at);
END;
$$;
REVOKE ALL ON FUNCTION public.mark_canvas_read(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_canvas_read(uuid, text) TO authenticated;

-- ============================================================================
-- 9. The chat card for a canvas / letter attachment, judged for the VIEWER
-- ============================================================================
-- available=false (and nothing else) when the artifact is gone or the viewer may not read it now: the
-- chat shows "No longer available" and the message stays. A canvas that is only open by link is not
-- available through a chat (the link token is the owner's alone and is never returned here).
CREATE OR REPLACE FUNCTION public.get_chat_artifact_attachment(p_kind text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_canvas public.canvases;
  v_letter public.clarity_letters;
  v_title  text;
  v_owner  public.profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'canvas' THEN
    SELECT * INTO v_canvas FROM public.canvases c WHERE c.id = p_id;
    IF FOUND AND (v_canvas.owner_id = v_uid OR public._canvas_admitted_via(v_canvas.id, v_uid) IS NOT NULL) THEN
      SELECT * INTO v_owner FROM public.profiles p WHERE p.id = v_canvas.owner_id;
      RETURN jsonb_build_object(
        'available', true, 'kind', 'canvas', 'id', v_canvas.id, 'name', v_canvas.name,
        'owner_id', v_canvas.owner_id, 'owner_name', v_owner.name, 'owner_slug', v_owner.slug,
        'is_owner', v_canvas.owner_id = v_uid);
    END IF;
  ELSIF p_kind = 'letter' THEN
    SELECT * INTO v_letter FROM public.clarity_letters l WHERE l.id = p_id;
    IF FOUND AND v_letter.status = 'sealed'
       AND (v_letter.sender_id = v_uid
            OR EXISTS (SELECT 1 FROM public.letter_deliveries d
                        WHERE d.letter_id = v_letter.id AND d.receiver_profile_id = v_uid)) THEN
      SELECT d.title INTO v_title FROM public.clarity_docs d WHERE d.id = v_letter.source_doc_id;
      SELECT * INTO v_owner FROM public.profiles p WHERE p.id = v_letter.sender_id;
      RETURN jsonb_build_object(
        'available', true, 'kind', 'letter', 'id', v_letter.id, 'title', v_title,
        'sender_id', v_letter.sender_id, 'sender_name', v_owner.name, 'sender_slug', v_owner.slug,
        'is_sender', v_letter.sender_id = v_uid);
    END IF;
  END IF;
  RETURN jsonb_build_object('available', false, 'kind', p_kind, 'id', p_id);
END;
$$;
REVOKE ALL ON FUNCTION public.get_chat_artifact_attachment(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_artifact_attachment(text, uuid) TO authenticated;
