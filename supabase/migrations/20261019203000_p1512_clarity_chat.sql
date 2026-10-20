-- P1512: Clarity Chat v1 — real, private person-to-person messaging, enforced in the database.
--
-- client-safe: purely additive. Four new tables (chat_conversations, chat_messages,
--   chat_member_state, chat_blocks) and new functions that no deployed client calls. The
--   REVOKE / DROP POLICY statements below act only on objects this same file creates (the
--   idiom keeps the file re-runnable; the DROP FUNCTION IF EXISTS lines drop only functions this
--   file creates a few lines later, so a changed RETURNS TABLE or argument list can be re-applied). Two additive BEFORE INSERT triggers are added to
--   membership and event_rsvps; they only ever replace a client-supplied accepted_at /
--   rsvped_at with now(), which is the value every existing client already lets the column
--   DEFAULT supply (grepped src/, e2e/, scripts/: nothing sends either column).
--   erase_my_account() is redefined with one added statement and an unchanged signature.
--
-- diffed against: 20260903090000_p520_erasure_hardening_2.sql, the latest migration that
--   defines public.erase_my_account(). Confirmed identical to the live definition on the
--   test project (pg_get_functiondef, whitespace aside). Body is byte-for-byte that file's,
--   plus exactly one added statement: `PERFORM public.erase_chat_data_for(v_uid);` inside
--   the `IF v_name IS NOT NULL` block, after the logs / room-membership block.
--
-- DESIGN (features/p1512_clarity_chat_v1_real_release.md, Technical Architecture):
--   * ACCESS IS COMPUTED, NOT COPIED. chat_access_since(conversation, uid) returns the
--     moment from which a user may read a conversation (NULL = no access):
--       dm      '-infinity' for either party
--       mirror  '-infinity' for the owner
--       group   membership.accepted_at           (D3: history from join time)
--       event   host: '-infinity'; otherwise event_rsvps.rsvped_at, but only if the RSVP was
--               made no later than events.datetime + event_grace_interval() (D4, 12 h)
--     Leaving a group / cancelling an RSVP removes the row, so access ends at once; rejoining
--     restarts history at the new time. There is no membership table to keep in sync.
--   * NO CLIENT WRITES. authenticated holds SELECT only on the four tables; every write is a
--     SECURITY DEFINER RPC that derives the actor from auth.uid() (no "me" parameter exists).
--     The write canary is therefore structural: there is no INSERT/UPDATE/DELETE grant to abuse.
--   * REALTIME. chat_messages and chat_member_state join supabase_realtime. Realtime applies
--     RLS to INSERT/UPDATE postgres_changes (P1057) but not to DELETE, which carries only the
--     primary key under REPLICA IDENTITY DEFAULT (left as is). So a user delete is an UPDATE that
--     nulls the body; only cascades (event or conversation removed) hard-delete.
--   * membership.accepted_at and event_rsvps.rsvped_at gate history, but both tables grant
--     authenticated a full-row INSERT, so a client could backdate itself into history. The
--     BEFORE INSERT triggers stamp now() for anon/authenticated callers; service_role (tests,
--     backfills) and role-less contexts (migrations) are untouched.
--
-- ERASURE (P520). profiles rows are deleted by the cascade from auth.users, so every FK into
--   profiles must let that delete succeed: author_id, dm_user_a/b and created_by are SET NULL,
--   the rest CASCADE. erase_chat_data_for() runs first and scrubs content (see its comment).
--
-- KNOWN LIMITATIONS (accepted, written down so nobody rediscovers them):
--   * Forwarding a forward keeps the ORIGINAL snapshot only (never nests), and drops any 'thread'.
--   * Deleted messages still order the chat list (the row, not the body, drives the preview time).
--   * Clients subscribe to postgres_changes unfiltered; RLS decides what each one receives. Fine at
--     current scale; revisit with conversation filters or private broadcast channels.
--   * A block is detectable by the blocked side (their sends and start_dm fail). Not hidden in v1.
--   * A host editing an event's datetime moves the D4 window for everyone (access is computed).
--   * Profile deletes made OUTSIDE erase_my_account() keep message bodies; the author then shows as
--     Deleted user. Only erase_my_account() scrubs content.
--   * A Realtime DELETE (cascade when an event or conversation is removed) is not RLS-filtered; its
--     payload carries only the row's primary key, which is why chat_member_state has a surrogate id
--     (its natural key would have leaked who is in which conversation).
--   * Sends are idempotent per (author, client_id): a retry whose first response was lost returns the
--     stored row. client_id stays SELECT-able (random, unique per author, not secret); the sender uses
--     it to match the Realtime echo to its pending message. Its uniqueness is per author, so another
--     person's message can never be returned or blocked by a key you choose.
--   * Attachment visibility mirrors the points / stories SELECT policies by hand (see
--     _chat_can_attach); if those policies change, change the helper with them.
--
-- EVENT DELETE. The only FKs added to events are chat_conversations.event_id ON DELETE CASCADE
--   (and, through it, chat_messages / chat_member_state). Nothing here can block an event delete,
--   which is the INBOX-189 failure this spec must not repeat.

-- ============================================================================
-- 1. Tables
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL CHECK (kind IN ('dm', 'group', 'event', 'mirror')),
  org_id          uuid REFERENCES public.organization(id) ON DELETE CASCADE,
  event_id        uuid REFERENCES public.events(id)       ON DELETE CASCADE,
  owner_id        uuid REFERENCES public.profiles(id)     ON DELETE CASCADE,
  dm_user_a       uuid REFERENCES public.profiles(id)     ON DELETE SET NULL,
  dm_user_b       uuid REFERENCES public.profiles(id)     ON DELETE SET NULL,
  created_by      uuid REFERENCES public.profiles(id)     ON DELETE SET NULL,
  title           text CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 60),
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  CONSTRAINT chat_conversations_shape CHECK (
       (kind = 'group'  AND org_id IS NOT NULL AND event_id IS NULL AND owner_id IS NULL
                        AND dm_user_a IS NULL AND dm_user_b IS NULL)
    OR (kind = 'event'  AND event_id IS NOT NULL AND org_id IS NULL AND owner_id IS NULL
                        AND dm_user_a IS NULL AND dm_user_b IS NULL)
    OR (kind = 'mirror' AND owner_id IS NOT NULL AND org_id IS NULL AND event_id IS NULL
                        AND dm_user_a IS NULL AND dm_user_b IS NULL)
    -- a dm keeps existing after one side is erased (SET NULL), so either side may be NULL
    OR (kind = 'dm'     AND org_id IS NULL AND event_id IS NULL AND owner_id IS NULL
                        AND (dm_user_a IS NULL OR dm_user_b IS NULL OR dm_user_a < dm_user_b))
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_group_org   ON public.chat_conversations (org_id)   WHERE kind = 'group';
CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_event      ON public.chat_conversations (event_id) WHERE kind = 'event';
CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_mirror     ON public.chat_conversations (owner_id) WHERE kind = 'mirror';
CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_dm_pair    ON public.chat_conversations (dm_user_a, dm_user_b) WHERE kind = 'dm';
CREATE INDEX        IF NOT EXISTS chat_conversations_dm_b       ON public.chat_conversations (dm_user_b) WHERE kind = 'dm';
CREATE INDEX        IF NOT EXISTS chat_conversations_created_by ON public.chat_conversations (created_by, created_at) WHERE kind = 'dm';

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id             uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  author_id                   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body                        text CHECK (body IS NULL OR char_length(body) <= 4000),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  edited_at                   timestamptz,
  deleted_at                  timestamptz,
  reply_to_id                 uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  thread_root_id              uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  forwarded_from_message_id   uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  forward_snapshot            jsonb,
  -- the ORIGINAL author of a forwarded / clarified text. Deliberately no FK: it exists only so
  -- erasure can rename the snapshot; erase_chat_data_for() clears it afterwards.
  forward_author_id           uuid,
  kind                        text NOT NULL DEFAULT 'message' CHECK (kind IN ('message', 'forward', 'clarify')),
  attachment_kind             text CHECK (attachment_kind IS NULL OR attachment_kind IN ('point', 'story')),
  attachment_id               uuid,
  -- Idempotency key chosen by the sending client: a retry of a send whose response was lost returns
  -- the original row instead of posting twice. Random and unique per author, so it is not secret and
  -- stays SELECT-able (the sender also needs it to match the Realtime echo to its pending message).
  client_id                   uuid,
  CONSTRAINT chat_messages_attachment_pair CHECK ((attachment_kind IS NULL) = (attachment_id IS NULL)),
  -- a deleted message carries no content at all: the body is removed on the server, not flagged
  CONSTRAINT chat_messages_deleted_is_empty CHECK (
    deleted_at IS NULL
    OR (body IS NULL AND attachment_id IS NULL AND forward_snapshot IS NULL)
  ),
  CONSTRAINT chat_messages_has_content CHECK (
    deleted_at IS NOT NULL OR body IS NOT NULL OR attachment_id IS NOT NULL OR forward_snapshot IS NOT NULL
  ),
  CONSTRAINT chat_messages_forward_has_snapshot CHECK (
    kind = 'message' OR deleted_at IS NOT NULL OR forward_snapshot IS NOT NULL
  )
);

-- Re-run safety for a database that already holds the table without the column.
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS client_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_author_client ON public.chat_messages (author_id, client_id)
  WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS chat_messages_conversation_created ON public.chat_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS chat_messages_thread_root          ON public.chat_messages (thread_root_id) WHERE thread_root_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS chat_messages_author               ON public.chat_messages (author_id) WHERE author_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS chat_messages_forward_author       ON public.chat_messages (forward_author_id) WHERE forward_author_id IS NOT NULL;

-- The primary key is a surrogate id on purpose: Realtime does not apply RLS to DELETE and sends the
-- primary key of the removed row to every subscriber. A natural (conversation_id, profile_id) key
-- would tell every client which person was in which conversation.
CREATE TABLE IF NOT EXISTS public.chat_member_state (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  profile_id      uuid NOT NULL REFERENCES public.profiles(id)           ON DELETE CASCADE,
  last_read_at    timestamptz,
  manual_unread   boolean NOT NULL DEFAULT false,
  archived        boolean NOT NULL DEFAULT false,
  CONSTRAINT chat_member_state_conv_profile_key UNIQUE (conversation_id, profile_id)
);
-- Re-run safety for a database that already holds the first shape (composite primary key).
DO $member_state_shape$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint c
              WHERE c.conrelid = 'public.chat_member_state'::regclass AND c.contype = 'p'
                AND array_length(c.conkey, 1) = 2) THEN
    ALTER TABLE public.chat_member_state ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
    ALTER TABLE public.chat_member_state DROP CONSTRAINT chat_member_state_pkey;
    ALTER TABLE public.chat_member_state ADD CONSTRAINT chat_member_state_pkey PRIMARY KEY (id);
    ALTER TABLE public.chat_member_state DROP CONSTRAINT IF EXISTS chat_member_state_conv_profile_key;
    ALTER TABLE public.chat_member_state
      ADD CONSTRAINT chat_member_state_conv_profile_key UNIQUE (conversation_id, profile_id);
  END IF;
END;
$member_state_shape$;
CREATE INDEX IF NOT EXISTS chat_member_state_profile ON public.chat_member_state (profile_id);

CREATE TABLE IF NOT EXISTS public.chat_blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS chat_blocks_blocked ON public.chat_blocks (blocked_id);

-- ============================================================================
-- 2. Access functions
-- ============================================================================
-- Internal: the rule itself. Takes any uid, so it is NOT callable by clients.
CREATE OR REPLACE FUNCTION public._chat_access_since(p_conversation uuid, p_uid uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE c.kind
    WHEN 'dm' THEN
      CASE WHEN p_uid IS NOT NULL AND (c.dm_user_a = p_uid OR c.dm_user_b = p_uid)
           THEN '-infinity'::timestamptz END
    WHEN 'mirror' THEN
      CASE WHEN p_uid IS NOT NULL AND c.owner_id = p_uid
           THEN '-infinity'::timestamptz END
    WHEN 'group' THEN
      (SELECT m.accepted_at FROM public.membership m
        WHERE m.org_id = c.org_id AND m.user_id = p_uid)
    WHEN 'event' THEN
      (SELECT CASE
                WHEN e.host_id = p_uid THEN '-infinity'::timestamptz
                ELSE (SELECT r.rsvped_at FROM public.event_rsvps r
                       WHERE r.event_id = e.id AND r.profile_id = p_uid
                         AND r.rsvped_at <= e.datetime + public.event_grace_interval())
              END
         FROM public.events e WHERE e.id = c.event_id)
  END
  FROM public.chat_conversations c
  WHERE c.id = p_conversation;
$$;
REVOKE ALL ON FUNCTION public._chat_access_since(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Public face used by the RLS policies (and by clients that want to ask). A client may only ask
-- about itself, so the function cannot be used to probe whether somebody else is in a chat.
CREATE OR REPLACE FUNCTION public.chat_access_since(p_conversation uuid, p_uid uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_uid IS NOT NULL AND (p_uid = auth.uid() OR auth.role() = 'service_role')
    THEN public._chat_access_since(p_conversation, p_uid)
  END;
$$;
REVOKE ALL ON FUNCTION public.chat_access_since(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_access_since(uuid, uuid) TO authenticated;

-- The conversations a user can read right now, with the time their history starts.
CREATE OR REPLACE FUNCTION public._chat_my_conversations(p_uid uuid)
RETURNS TABLE (id uuid, since timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT x.cid, x.s
    FROM (
      SELECT cand.cid, public._chat_access_since(cand.cid, p_uid) AS s
        FROM (
          SELECT c.id AS cid FROM public.chat_conversations c
           WHERE c.kind = 'dm' AND (c.dm_user_a = p_uid OR c.dm_user_b = p_uid)
          UNION
          SELECT c.id FROM public.chat_conversations c
           WHERE c.kind = 'mirror' AND c.owner_id = p_uid
          UNION
          SELECT c.id FROM public.chat_conversations c
            JOIN public.membership m ON m.org_id = c.org_id AND m.user_id = p_uid
           WHERE c.kind = 'group'
          UNION
          SELECT c.id FROM public.chat_conversations c
            JOIN public.events e ON e.id = c.event_id
           WHERE c.kind = 'event'
             AND (e.host_id = p_uid
                  OR EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = e.id AND r.profile_id = p_uid))
        ) cand
    ) x
   WHERE x.s IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public._chat_my_conversations(uuid) FROM PUBLIC, anon, authenticated;

-- What the RLS policies read: the caller's accessible conversations with their history start, as ONE
-- set computed once per statement (a STABLE set-returning function over auth.uid(), no uid argument,
-- so it cannot be used to look at anyone else). ROWS tells the planner it is small, so a policy like
-- `conversation_id IN (SELECT ... FROM chat_my_access())` becomes an index-driven semi join instead
-- of two definer-function calls per message row.
CREATE OR REPLACE FUNCTION public.chat_my_access()
RETURNS TABLE (conversation_id uuid, since timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
ROWS 50
AS $$
  SELECT m.id, m.since FROM public._chat_my_conversations((SELECT auth.uid())) m;
$$;
REVOKE ALL ON FUNCTION public.chat_my_access() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_my_access() TO authenticated;

-- ============================================================================
-- 3. RLS + grants: SELECT only, and only what the caller may read
-- ============================================================================
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_member_state  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_blocks        ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.chat_conversations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.chat_messages      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.chat_member_state  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.chat_blocks        FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.chat_conversations TO authenticated;
GRANT SELECT ON public.chat_messages      TO authenticated;
GRANT SELECT ON public.chat_member_state  TO authenticated;
GRANT SELECT ON public.chat_blocks        TO authenticated;

DROP POLICY IF EXISTS chat_conversations_select ON public.chat_conversations;
CREATE POLICY chat_conversations_select ON public.chat_conversations FOR SELECT TO authenticated
  USING (id IN (SELECT a.conversation_id FROM public.chat_my_access() a));

DROP POLICY IF EXISTS chat_messages_select ON public.chat_messages;
CREATE POLICY chat_messages_select ON public.chat_messages FOR SELECT TO authenticated
  USING (
    conversation_id IN (SELECT a.conversation_id FROM public.chat_my_access() a)
    AND created_at >= (SELECT a.since FROM public.chat_my_access() a
                        WHERE a.conversation_id = chat_messages.conversation_id)
  );

DROP POLICY IF EXISTS chat_member_state_select ON public.chat_member_state;
CREATE POLICY chat_member_state_select ON public.chat_member_state FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS chat_blocks_select ON public.chat_blocks;
CREATE POLICY chat_blocks_select ON public.chat_blocks FOR SELECT TO authenticated
  USING (blocker_id = (SELECT auth.uid()));

-- ============================================================================
-- 4. Timestamps that gate history cannot be backdated by a client
-- ============================================================================
CREATE OR REPLACE FUNCTION public._chat_stamp_membership_time()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.role(), '') IN ('anon', 'authenticated') THEN
    -- INSERT: the server decides when you joined. UPDATE: a client can never move it (no client
    -- UPDATE path exists today; this keeps it that way if one is added).
    IF TG_OP = 'INSERT' THEN NEW.accepted_at := now(); ELSE NEW.accepted_at := OLD.accepted_at; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._chat_stamp_membership_time() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._chat_stamp_rsvp_time()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.role(), '') IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN NEW.rsvped_at := now(); ELSE NEW.rsvped_at := OLD.rsvped_at; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._chat_stamp_rsvp_time() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_stamp_membership_time ON public.membership;
CREATE TRIGGER chat_stamp_membership_time BEFORE INSERT OR UPDATE OF accepted_at ON public.membership
  FOR EACH ROW EXECUTE FUNCTION public._chat_stamp_membership_time();

DROP TRIGGER IF EXISTS chat_stamp_rsvp_time ON public.event_rsvps;
CREATE TRIGGER chat_stamp_rsvp_time BEFORE INSERT OR UPDATE OF rsvped_at ON public.event_rsvps
  FOR EACH ROW EXECUTE FUNCTION public._chat_stamp_rsvp_time();

-- ============================================================================
-- 5. Internal helpers (never client-callable)
-- ============================================================================
CREATE OR REPLACE FUNCTION public._chat_blocked_either(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_blocks b
     WHERE (b.blocker_id = p_a AND b.blocked_id = p_b)
        OR (b.blocker_id = p_b AND b.blocked_id = p_a)
  );
$$;
REVOKE ALL ON FUNCTION public._chat_blocked_either(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- D1: why two people may start a 1:1. NULL = no shared connection.
CREATE OR REPLACE FUNCTION public._chat_shared_reason(p_a uuid, p_b uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.clarity_agreements ca
                  WHERE ca.status = 'active'
                    AND ((ca.creator_profile_id = p_a AND ca.partner_profile_id = p_b)
                      OR (ca.creator_profile_id = p_b AND ca.partner_profile_id = p_a)))
      THEN 'partner'
    WHEN EXISTS (SELECT 1 FROM public.membership m1
                   JOIN public.membership m2 ON m2.org_id = m1.org_id
                  WHERE m1.user_id = p_a AND m2.user_id = p_b)
      THEN 'group'
    -- the event leg respects the D4 window: an RSVP made after datetime + grace counts for nothing
    WHEN EXISTS (SELECT 1 FROM public.events e
                   JOIN public.event_rsvps r1 ON r1.event_id = e.id
                   JOIN public.event_rsvps r2 ON r2.event_id = e.id
                  WHERE r1.profile_id = p_a AND r2.profile_id = p_b
                    AND r1.rsvped_at <= e.datetime + public.event_grace_interval()
                    AND r2.rsvped_at <= e.datetime + public.event_grace_interval())
      OR EXISTS (SELECT 1 FROM public.events e
                   JOIN public.event_rsvps r ON r.event_id = e.id
                  WHERE e.host_id = p_a AND r.profile_id = p_b
                    AND r.rsvped_at <= e.datetime + public.event_grace_interval())
      OR EXISTS (SELECT 1 FROM public.events e
                   JOIN public.event_rsvps r ON r.event_id = e.id
                  WHERE e.host_id = p_b AND r.profile_id = p_a
                    AND r.rsvped_at <= e.datetime + public.event_grace_interval())
      THEN 'event'
  END;
$$;
REVOKE ALL ON FUNCTION public._chat_shared_reason(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- The ONLY shape a forward may carry out of its source (D5). A new key in a source snapshot (source
-- chat title, kind, opaque refs, thread) therefore never reaches a new audience by accident.
CREATE OR REPLACE FUNCTION public._chat_forward_snapshot(p_snap jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'author_name', COALESCE(p_snap -> 'author_name', to_jsonb('Deleted user'::text)),
    'body',        COALESCE(p_snap -> 'body', 'null'::jsonb),
    'created_at',  COALESCE(p_snap -> 'created_at', 'null'::jsonb));
$$;
REVOKE ALL ON FUNCTION public._chat_forward_snapshot(jsonb) FROM PUBLIC, anon, authenticated;

-- Opaque, one-way reference to an author inside a copied thread entry. Erasure needs to find "the
-- entries this person wrote" without the copy carrying their raw id, so clients (who can read the
-- copy) never see an id they could not already see in the source, and the mapper never uses it.
CREATE OR REPLACE FUNCTION public._chat_author_ref(p_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT encode(sha256(convert_to('p1512:' || p_id::text, 'UTF8')), 'hex');
$$;
REVOKE ALL ON FUNCTION public._chat_author_ref(uuid) FROM PUBLIC, anon, authenticated;

-- May this person attach this point / story? Mirrors the SELECT policies of points and stories
-- ("Points visible by visibility", "Stories readable by visibility"): public, or yours. Written out
-- here because this runs as the definer; if those policies change, change this with them.
CREATE OR REPLACE FUNCTION public._chat_can_attach(p_kind text, p_id uuid, p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE p_kind
    WHEN 'point' THEN EXISTS (SELECT 1 FROM public.points x
                               WHERE x.id = p_id AND (x.visibility = 'public' OR x.first_validator_id = p_uid))
    WHEN 'story' THEN EXISTS (SELECT 1 FROM public.stories x
                               WHERE x.id = p_id AND (x.visibility = 'public' OR x.author_id = p_uid))
    ELSE false
  END;
$$;
REVOKE ALL ON FUNCTION public._chat_can_attach(text, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._chat_ensure_mirror(p_uid uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT c.id INTO v_id FROM public.chat_conversations c WHERE c.kind = 'mirror' AND c.owner_id = p_uid;
  IF v_id IS NULL THEN
    INSERT INTO public.chat_conversations (kind, owner_id) VALUES ('mirror', p_uid)
    ON CONFLICT (owner_id) WHERE kind = 'mirror' DO NOTHING;
    SELECT c.id INTO v_id FROM public.chat_conversations c WHERE c.kind = 'mirror' AND c.owner_id = p_uid;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public._chat_ensure_mirror(uuid) FROM PUBLIC, anon, authenticated;

-- Idempotently creates the conversations a user is entitled to: mirror, General per
-- organization, channel per event they host or RSVP'd to. Whether they may READ a channel is
-- still decided by _chat_access_since (an RSVP after the grace window creates the row, not access).
CREATE OR REPLACE FUNCTION public._chat_ensure_for_user(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._chat_ensure_mirror(p_uid);

  INSERT INTO public.chat_conversations (kind, org_id)
  SELECT 'group', m.org_id FROM public.membership m
   WHERE m.user_id = p_uid
     AND NOT EXISTS (SELECT 1 FROM public.chat_conversations c WHERE c.kind = 'group' AND c.org_id = m.org_id)
  ON CONFLICT (org_id) WHERE kind = 'group' DO NOTHING;

  INSERT INTO public.chat_conversations (kind, event_id)
  SELECT 'event', x.event_id
    FROM (SELECT r.event_id FROM public.event_rsvps r WHERE r.profile_id = p_uid
          UNION
          SELECT e.id FROM public.events e WHERE e.host_id = p_uid) x
   WHERE NOT EXISTS (SELECT 1 FROM public.chat_conversations c WHERE c.kind = 'event' AND c.event_id = x.event_id)
  ON CONFLICT (event_id) WHERE kind = 'event' DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public._chat_ensure_for_user(uuid) FROM PUBLIC, anon, authenticated;


-- Raises unless p_uid may post to the conversation; returns the conversation row.
-- One message for "no such conversation" and "not yours", so ids cannot be probed.
CREATE OR REPLACE FUNCTION public._chat_assert_can_post(p_conversation uuid, p_uid uuid)
RETURNS public.chat_conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conv  public.chat_conversations;
  v_other uuid;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_conv FROM public.chat_conversations c WHERE c.id = p_conversation;
  IF NOT FOUND OR public._chat_access_since(p_conversation, p_uid) IS NULL THEN
    RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
  END IF;
  IF v_conv.kind = 'dm' THEN
    v_other := CASE WHEN v_conv.dm_user_a = p_uid THEN v_conv.dm_user_b ELSE v_conv.dm_user_a END;
    IF v_other IS NULL THEN
      RAISE EXCEPTION 'chat: this person is no longer available' USING ERRCODE = '42501';
    END IF;
    IF public._chat_blocked_either(p_uid, v_other) THEN
      RAISE EXCEPTION 'chat: cannot message this person' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN v_conv;
END;
$$;
REVOKE ALL ON FUNCTION public._chat_assert_can_post(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 6. Reading RPCs
-- ============================================================================
-- Drop first so a changed RETURNS TABLE shape can be re-applied while iterating.
DROP FUNCTION IF EXISTS public.get_my_chats();
CREATE FUNCTION public.get_my_chats()
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
    -- A clarify copy keeps its words in the snapshot (body is NULL), so the mirror's row shows them;
    -- delete and erase clear the snapshot too.
    CASE WHEN lm.deleted_at IS NOT NULL THEN 'Message deleted'
         WHEN lm.kind = 'clarify' THEN lm.forward_snapshot ->> 'body'
         ELSE lm.body END,
    lm.kind,
    (lm.deleted_at IS NOT NULL),
    lm.created_at,
    COALESCE(un.n, 0),
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

DROP FUNCTION IF EXISTS public.search_chat_people(text);
CREATE FUNCTION public.search_chat_people(p_query text)
RETURNS TABLE (
  profile_id   uuid,
  name         text,
  slug         text,
  avatar_url   text,
  avatar_color text,
  shared       text,
  has_dm       uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid     uuid := auth.uid();
  v_pattern text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  v_pattern := '%' || replace(replace(replace(btrim(COALESCE(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  RETURN QUERY
  WITH cand AS (
    -- 1 partner, 2 group, 3 event: the lowest number is the reason shown
    SELECT CASE WHEN ca.creator_profile_id = v_uid THEN ca.partner_profile_id ELSE ca.creator_profile_id END AS pid,
           'Clarity Partner'::text AS label, 1 AS pr
      FROM public.clarity_agreements ca
     WHERE ca.status = 'active' AND (ca.creator_profile_id = v_uid OR ca.partner_profile_id = v_uid)
    UNION ALL
    SELECT m2.user_id, o.name, 2
      FROM public.membership m1
      JOIN public.membership m2 ON m2.org_id = m1.org_id AND m2.user_id <> v_uid
      JOIN public.organization o ON o.id = m1.org_id
     WHERE m1.user_id = v_uid
    UNION ALL
    SELECT r2.profile_id, e.title, 3
      FROM public.events e
      JOIN public.event_rsvps r1 ON r1.event_id = e.id
      JOIN public.event_rsvps r2 ON r2.event_id = e.id AND r2.profile_id <> v_uid
     WHERE r1.profile_id = v_uid
       AND r1.rsvped_at <= e.datetime + public.event_grace_interval()
       AND r2.rsvped_at <= e.datetime + public.event_grace_interval()
    UNION ALL
    SELECT e.host_id, e.title, 3
      FROM public.event_rsvps r1
      JOIN public.events e ON e.id = r1.event_id
     WHERE r1.profile_id = v_uid AND e.host_id IS NOT NULL AND e.host_id <> v_uid
       AND r1.rsvped_at <= e.datetime + public.event_grace_interval()
    UNION ALL
    SELECT r.profile_id, e.title, 3
      FROM public.events e
      JOIN public.event_rsvps r ON r.event_id = e.id
     WHERE e.host_id = v_uid AND r.profile_id <> v_uid
       AND r.rsvped_at <= e.datetime + public.event_grace_interval()
  ), best AS (
    SELECT DISTINCT ON (cand.pid) cand.pid, cand.label
      FROM cand
     WHERE cand.pid IS NOT NULL
     ORDER BY cand.pid, cand.pr
  )
  SELECT p.id, p.name, p.slug, p.avatar_url, p.avatar_color, b.label,
         (SELECT c.id FROM public.chat_conversations c
           WHERE c.kind = 'dm'
             AND c.dm_user_a = LEAST(v_uid, p.id) AND c.dm_user_b = GREATEST(v_uid, p.id))
    FROM best b
    JOIN public.profiles p ON p.id = b.pid
   WHERE p.name ILIKE v_pattern ESCAPE '\'
     AND NOT public._chat_blocked_either(v_uid, p.id)
   ORDER BY p.name, p.id
   LIMIT 20;
END;
$$;
REVOKE ALL ON FUNCTION public.search_chat_people(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_chat_people(text) TO authenticated;

DROP FUNCTION IF EXISTS public.search_my_messages(text);
CREATE FUNCTION public.search_my_messages(p_query text)
RETURNS TABLE (
  message_id      uuid,
  conversation_id uuid,
  author_id       uuid,
  author_name     text,
  body            text,
  created_at      timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid     uuid := auth.uid();
  v_q       text := btrim(COALESCE(p_query, ''));
  v_pattern text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_q) < 2 THEN
    RETURN;
  END IF;
  v_pattern := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  RETURN QUERY
  SELECT m.id, m.conversation_id, m.author_id, ap.name, m.body, m.created_at
    FROM public._chat_my_conversations(v_uid) mine
    JOIN public.chat_messages m ON m.conversation_id = mine.id AND m.created_at >= mine.since
    LEFT JOIN public.profiles ap ON ap.id = m.author_id
   WHERE m.deleted_at IS NULL
     AND m.body ILIKE v_pattern ESCAPE '\'
   ORDER BY m.created_at DESC, m.id DESC
   LIMIT 30;
END;
$$;
REVOKE ALL ON FUNCTION public.search_my_messages(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_my_messages(text) TO authenticated;

DROP FUNCTION IF EXISTS public.get_thread_stats(uuid, uuid[]);
-- Reply counts and the most recent repliers for a page of thread roots, aggregated in one pass on
-- the server (a client-side select of the replies would be cut by row limits across roots). Only
-- roots of THIS conversation that the caller can read are answered, so an id from another chat is
-- simply absent from the result. Channels only; at most 100 roots per call.
CREATE FUNCTION public.get_thread_stats(p_conversation uuid, p_roots uuid[])
RETURNS TABLE (root_id uuid, reply_count integer, recent_author_ids uuid[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid   uuid := auth.uid();
  v_since timestamptz;
  v_kind  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  v_since := public._chat_access_since(p_conversation, v_uid);
  IF v_since IS NULL THEN
    RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(cardinality(p_roots), 0) > 100 THEN
    RAISE EXCEPTION 'chat: at most 100 threads per call' USING ERRCODE = '22023';
  END IF;
  SELECT c.kind INTO v_kind FROM public.chat_conversations c WHERE c.id = p_conversation;
  IF v_kind NOT IN ('group', 'event') OR COALESCE(cardinality(p_roots), 0) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH roots AS (
    SELECT m.id AS rid FROM public.chat_messages m
     WHERE m.id = ANY(p_roots) AND m.conversation_id = p_conversation
       AND m.thread_root_id IS NULL AND m.created_at >= v_since
  ), replies AS (
    SELECT m.thread_root_id AS rid, m.author_id, m.created_at
      FROM public.chat_messages m
     WHERE m.conversation_id = p_conversation
       AND m.thread_root_id IN (SELECT r.rid FROM roots r)
       AND m.deleted_at IS NULL AND m.created_at >= v_since
  ), counts AS (
    SELECT x.rid, count(*)::integer AS n FROM replies x GROUP BY x.rid
  ), recent AS (
    SELECT x.rid, x.author_id, max(x.created_at) AS last_at
      FROM replies x WHERE x.author_id IS NOT NULL GROUP BY x.rid, x.author_id
  ), ranked AS (
    SELECT y.rid, y.author_id, row_number() OVER (PARTITION BY y.rid ORDER BY y.last_at DESC, y.author_id) AS rn
      FROM recent y
  )
  SELECT r.rid,
         COALESCE(c.n, 0),
         COALESCE((SELECT array_agg(k.author_id ORDER BY k.rn) FROM ranked k WHERE k.rid = r.rid AND k.rn <= 3),
                  '{}'::uuid[])
    FROM roots r
    LEFT JOIN counts c ON c.rid = r.rid;
END;
$$;
REVOKE ALL ON FUNCTION public.get_thread_stats(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_thread_stats(uuid, uuid[]) TO authenticated;

DROP FUNCTION IF EXISTS public.get_my_blocks();
CREATE FUNCTION public.get_my_blocks()
RETURNS TABLE (
  blocked_id   uuid,
  name         text,
  slug         text,
  avatar_url   text,
  avatar_color text,
  created_at   timestamptz
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
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT b.blocked_id, p.name, p.slug, p.avatar_url, p.avatar_color, b.created_at
    FROM public.chat_blocks b
    JOIN public.profiles p ON p.id = b.blocked_id
   WHERE b.blocker_id = v_uid
   ORDER BY b.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_blocks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_blocks() TO authenticated;

-- ============================================================================
-- 7. Writing RPCs. Every one derives the actor from auth.uid(); none takes "me".
-- ============================================================================
CREATE OR REPLACE FUNCTION public.start_dm(p_other uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_a   uuid;
  v_b   uuid;
  v_id  uuid;
  v_new integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_other IS NULL OR p_other = v_uid THEN
    RAISE EXCEPTION 'chat: choose another person' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_other) THEN
    RAISE EXCEPTION 'chat: cannot start a conversation with this person' USING ERRCODE = '42501';
  END IF;
  IF public._chat_blocked_either(v_uid, p_other) THEN
    RAISE EXCEPTION 'chat: cannot start a conversation with this person' USING ERRCODE = '42501';
  END IF;

  v_a := LEAST(v_uid, p_other);
  v_b := GREATEST(v_uid, p_other);

  -- An existing conversation stays usable after the shared connection ends.
  SELECT c.id INTO v_id FROM public.chat_conversations c
   WHERE c.kind = 'dm' AND c.dm_user_a = v_a AND c.dm_user_b = v_b;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  IF public._chat_shared_reason(v_uid, p_other) IS NULL THEN
    RAISE EXCEPTION 'chat: cannot start a conversation with this person' USING ERRCODE = '42501';
  END IF;

  -- D2: at most 20 NEW conversations per person per rolling 24 h. The advisory lock makes the
  -- count-then-insert atomic per user, so parallel calls cannot step over the limit.
  PERFORM pg_advisory_xact_lock(hashtextextended('chat_start_dm:' || v_uid::text, 0));
  SELECT count(*)::integer INTO v_new FROM public.chat_conversations c
   WHERE c.kind = 'dm' AND c.created_by = v_uid AND c.created_at > now() - interval '24 hours';
  IF v_new >= 20 THEN
    RAISE EXCEPTION 'chat: too many new conversations today' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.chat_conversations (kind, dm_user_a, dm_user_b, created_by)
  VALUES ('dm', v_a, v_b, v_uid)
  ON CONFLICT (dm_user_a, dm_user_b) WHERE kind = 'dm' DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT c.id INTO v_id FROM public.chat_conversations c
     WHERE c.kind = 'dm' AND c.dm_user_a = v_a AND c.dm_user_b = v_b;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.start_dm(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_dm(uuid) TO authenticated;

-- The argument list gained p_client_id, so the old form is dropped first (created only by this file).
DROP FUNCTION IF EXISTS public.send_chat_message(uuid, text, uuid, uuid, text, uuid);
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
  IF p_attachment_kind IS NOT NULL AND p_attachment_kind NOT IN ('point', 'story') THEN
    RAISE EXCEPTION 'chat: unknown attachment kind' USING ERRCODE = '22023';
  END IF;
  IF v_body IS NULL AND p_attachment_id IS NULL THEN
    RAISE EXCEPTION 'chat: empty message' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'chat: message too long' USING ERRCODE = '22023';
  END IF;
  -- One error for "does not exist" and "exists but you cannot see it", so ids cannot be probed.
  IF p_attachment_id IS NOT NULL AND NOT public._chat_can_attach(p_attachment_kind, p_attachment_id, v_uid) THEN
    RAISE EXCEPTION 'chat: attachment not available' USING ERRCODE = '22023';
  END IF;

  IF p_thread_root IS NOT NULL THEN
    IF v_conv.kind NOT IN ('group', 'event') THEN
      RAISE EXCEPTION 'chat: threads are for channels' USING ERRCODE = '22023';
    END IF;
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

CREATE OR REPLACE FUNCTION public.edit_chat_message(p_message uuid, p_body text)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_msg  public.chat_messages;
  v_body text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_msg FROM public.chat_messages m
   WHERE m.id = p_message AND m.author_id = v_uid AND m.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;
  PERFORM public._chat_assert_can_post(v_msg.conversation_id, v_uid);
  IF v_msg.created_at < public._chat_access_since(v_msg.conversation_id, v_uid) THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;

  v_body := NULLIF(btrim(COALESCE(p_body, '')), '');
  IF v_body IS NULL AND v_msg.attachment_id IS NULL AND v_msg.forward_snapshot IS NULL THEN
    RAISE EXCEPTION 'chat: empty message' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'chat: message too long' USING ERRCODE = '22023';
  END IF;

  UPDATE public.chat_messages m SET body = v_body, edited_at = now()
   WHERE m.id = v_msg.id
  RETURNING * INTO v_msg;
  RETURN v_msg;
END;
$$;
REVOKE ALL ON FUNCTION public.edit_chat_message(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edit_chat_message(uuid, text) TO authenticated;

-- A delete is an UPDATE that removes the content (never a DELETE: Realtime does not apply RLS to
-- DELETE). Forwards made earlier keep their own copy (D5). Allowed even after the author lost
-- access to the conversation, so leaving a group never traps your own words there.
CREATE OR REPLACE FUNCTION public.delete_chat_message(p_message uuid)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_msg public.chat_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_msg FROM public.chat_messages m WHERE m.id = p_message AND m.author_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;
  IF v_msg.deleted_at IS NOT NULL THEN
    RETURN v_msg;
  END IF;
  UPDATE public.chat_messages m
     SET body = NULL, deleted_at = now(),
         attachment_kind = NULL, attachment_id = NULL,
         forward_snapshot = NULL, forward_author_id = NULL
   WHERE m.id = v_msg.id
  RETURNING * INTO v_msg;
  RETURN v_msg;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_chat_message(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_chat_message(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.forward_chat_message(uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.forward_chat_message(
  p_source              uuid,
  p_target_conversation uuid,
  p_note                text DEFAULT NULL,
  p_client_id           uuid DEFAULT NULL
)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_src       public.chat_messages;
  v_author    text;
  v_note      text;
  v_snapshot  jsonb;
  v_orig_id   uuid;
  v_since     timestamptz;
  v_row       public.chat_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM public._chat_assert_can_post(p_target_conversation, v_uid);
  v_since := public._chat_access_since(p_target_conversation, v_uid);

  -- Idempotent retry (see send_chat_message): same author + client id returns the earlier forward.
  -- This runs BEFORE the source checks on purpose: a retry whose source was deleted (or erased) in
  -- the meantime must hand back the forward that was already stored, not "message not available".
  -- Permission to post in the target was just checked, and the stored row must still be visible.
  IF p_client_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = v_uid AND m.client_id = p_client_id;
    IF FOUND THEN
      IF v_row.conversation_id <> p_target_conversation THEN
        RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
      END IF;
      IF v_row.created_at < v_since THEN
        RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
      END IF;
      RETURN v_row;
    END IF;
  END IF;

  -- The forwarder must be able to READ the source right now. FOR SHARE takes a row lock that
  -- conflicts with erase_chat_data_for's UPDATE of the same row: an in-flight erase finishes first
  -- (and the deleted_at test below then refuses), or this transaction commits first and the erase
  -- that was waiting scrubs the copy we are about to make.
  SELECT m.* INTO v_src FROM public.chat_messages m
   WHERE m.id = p_source
     AND m.created_at >= COALESCE(public._chat_access_since(m.conversation_id, v_uid), 'infinity'::timestamptz)
     FOR SHARE;
  IF NOT FOUND OR v_src.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF char_length(v_note) > 4000 THEN
    RAISE EXCEPTION 'chat: message too long' USING ERRCODE = '22023';
  END IF;

  IF v_src.kind = 'message' THEN
    SELECT COALESCE(p.name, 'Deleted user') INTO v_author
      FROM (SELECT 1) one LEFT JOIN public.profiles p ON p.id = v_src.author_id;
    -- D5: a forward reveals nothing about the source chat. The snapshot is built from an explicit
    -- allowlist (author_name, body, created_at), never by copying whatever a source snapshot holds.
    v_snapshot := jsonb_build_object(
      'author_name', v_author,
      'body', v_src.body,
      'created_at', v_src.created_at);
    v_orig_id := v_src.author_id;
  ELSE
    -- forwarding a forward / clarify keeps pointing at the original author; the source chat's
    -- title, kind, refs and any thread are NOT carried (allowlist again)
    v_snapshot := public._chat_forward_snapshot(v_src.forward_snapshot);
    v_orig_id := v_src.forward_author_id;
  END IF;

  INSERT INTO public.chat_messages
    (conversation_id, author_id, body, kind, forward_snapshot, forward_author_id,
     forwarded_from_message_id, attachment_kind, attachment_id, client_id, created_at)
  VALUES
    (p_target_conversation, v_uid, v_note, 'forward', v_snapshot, v_orig_id,
     v_src.id, v_src.attachment_kind, v_src.attachment_id, p_client_id, clock_timestamp())
  ON CONFLICT (author_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = v_uid AND m.client_id = p_client_id;
    IF v_row.conversation_id <> p_target_conversation THEN
      RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
    END IF;
    IF v_row.created_at < v_since THEN
      RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
    END IF;
    RETURN v_row;
  END IF;

  UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = p_target_conversation;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.forward_chat_message(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.forward_chat_message(uuid, uuid, text, uuid) TO authenticated;

-- Clarify: copy a message (and the thread it sits in) into the CALLER'S OWN mirror chat.
-- Nothing is written to the source conversation.
CREATE OR REPLACE FUNCTION public.clarify_chat_message(p_source uuid)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_src       public.chat_messages;
  v_since     timestamptz;
  v_src_kind  text;
  v_author    text;
  v_root      uuid;
  v_thread    jsonb;
  v_base      jsonb;
  v_orig_id   uuid;
  v_mirror    uuid;
  v_title     text;
  v_title_ref text;
  v_src_conv  public.chat_conversations;
  v_row       public.chat_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  -- FOR SHARE: see forward_chat_message (serialises with an in-flight erase).
  SELECT m.* INTO v_src FROM public.chat_messages m
   WHERE m.id = p_source
     AND m.created_at >= COALESCE(public._chat_access_since(m.conversation_id, v_uid), 'infinity'::timestamptz)
     FOR SHARE;
  IF NOT FOUND OR v_src.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;
  v_since := public._chat_access_since(v_src.conversation_id, v_uid);
  v_mirror := public._chat_ensure_mirror(v_uid);

  v_root := COALESCE(v_src.thread_root_id, v_src.id);
  -- Lock the thread rows first (a separate statement, so the aggregate below reads a snapshot taken
  -- AFTER any erase that was holding them has committed).
  PERFORM 1 FROM public.chat_messages x
   WHERE (x.id = v_root OR x.thread_root_id = v_root)
     AND x.id <> v_src.id
     AND x.conversation_id = v_src.conversation_id
     AND x.created_at >= v_since
   ORDER BY x.created_at, x.id
   FOR SHARE;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'author_ref', public._chat_author_ref(t.author_id),
           'author_name', COALESCE(tp.name, 'Deleted user'),
           'body', t.body,
           'created_at', t.created_at) ORDER BY t.created_at, t.id), '[]'::jsonb)
    INTO v_thread
    FROM (SELECT x.* FROM public.chat_messages x
           WHERE (x.id = v_root OR x.thread_root_id = v_root)
             AND x.id <> v_src.id
             AND x.conversation_id = v_src.conversation_id
             AND x.deleted_at IS NULL
             AND x.created_at >= v_since
           ORDER BY x.created_at, x.id
           LIMIT 100) t
    LEFT JOIN public.profiles tp ON tp.id = t.author_id;

  IF v_src.kind = 'message' THEN
    SELECT * INTO v_src_conv FROM public.chat_conversations c WHERE c.id = v_src.conversation_id;
    SELECT COALESCE(p.name, 'Deleted user') INTO v_author
      FROM (SELECT 1) one LEFT JOIN public.profiles p ON p.id = v_src.author_id;
    -- "Clarified from <author> in <title>": the title as the CLARIFIER sees the chat.
    IF v_src_conv.kind = 'dm' THEN
      SELECT COALESCE(p.name, 'Deleted user'),
             public._chat_author_ref(CASE WHEN v_src_conv.dm_user_a = v_uid THEN v_src_conv.dm_user_b ELSE v_src_conv.dm_user_a END)
        INTO v_title, v_title_ref
        FROM (SELECT 1) one
        LEFT JOIN public.profiles p
               ON p.id = CASE WHEN v_src_conv.dm_user_a = v_uid THEN v_src_conv.dm_user_b ELSE v_src_conv.dm_user_a END;
    ELSIF v_src_conv.kind = 'group' THEN
      SELECT o.name || ' · General' INTO v_title FROM public.organization o WHERE o.id = v_src_conv.org_id;
    ELSIF v_src_conv.kind = 'event' THEN
      SELECT e.title INTO v_title FROM public.events e WHERE e.id = v_src_conv.event_id;
    ELSE
      v_title := COALESCE(v_src_conv.title, 'Mirror');
    END IF;
    v_base := jsonb_build_object(
      'author_name', v_author,
      'body', v_src.body,
      'created_at', v_src.created_at,
      'conversation_kind', v_src_conv.kind,
      'conversation_title', v_title);
    -- the other person's opaque ref, so erasing THEM can blank their name out of this title
    IF v_title_ref IS NOT NULL THEN
      v_base := v_base || jsonb_build_object('conversation_title_ref', v_title_ref);
    END IF;
    v_orig_id := v_src.author_id;
  ELSE
    v_base := v_src.forward_snapshot - 'thread';
    v_orig_id := v_src.forward_author_id;
  END IF;

  INSERT INTO public.chat_messages
    (conversation_id, author_id, body, kind, forward_snapshot, forward_author_id,
     forwarded_from_message_id, attachment_kind, attachment_id, created_at)
  VALUES
    (v_mirror, v_uid, NULL, 'clarify', v_base || jsonb_build_object('thread', v_thread), v_orig_id,
     v_src.id, v_src.attachment_kind, v_src.attachment_id, clock_timestamp())
  RETURNING * INTO v_row;

  UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = v_mirror;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_chat_message(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_chat_message(uuid) TO authenticated;

-- The signature gained p_through_message, so the old two-argument form is dropped first (it is only
-- ever created by this file; a CREATE OR REPLACE would leave it behind as an overload).
DROP FUNCTION IF EXISTS public.mark_chat_read(uuid, timestamptz);
-- p_through_message is the precise way to mark read: the read marker lands exactly on that message's
-- created_at. A client clock (a JS Date has millisecond precision, created_at has microseconds) can
-- land a few microseconds BEFORE the newest message and leave it unread forever, so p_at is kept only
-- for compatibility. Whatever is passed, the marker never moves backwards.
CREATE OR REPLACE FUNCTION public.mark_chat_read(
  p_conversation    uuid,
  p_at              timestamptz DEFAULT NULL,
  p_through_message uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_since timestamptz;
  v_at    timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  v_since := public._chat_access_since(p_conversation, v_uid);
  IF v_since IS NULL THEN
    RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
  END IF;

  IF p_through_message IS NOT NULL THEN
    SELECT m.created_at INTO v_at FROM public.chat_messages m
     WHERE m.id = p_through_message AND m.conversation_id = p_conversation AND m.created_at >= v_since;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
    END IF;
  ELSE
    v_at := LEAST(COALESCE(p_at, clock_timestamp()), clock_timestamp());
  END IF;

  INSERT INTO public.chat_member_state (conversation_id, profile_id, last_read_at, manual_unread)
  VALUES (p_conversation, v_uid, v_at, false)
  ON CONFLICT (conversation_id, profile_id) DO UPDATE
    SET last_read_at  = GREATEST(COALESCE(public.chat_member_state.last_read_at, '-infinity'::timestamptz),
                                 EXCLUDED.last_read_at),
        manual_unread = false;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_chat_read(uuid, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_chat_read(uuid, timestamptz, uuid) TO authenticated;

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
  INSERT INTO public.chat_member_state (conversation_id, profile_id, manual_unread, archived)
  VALUES (p_conversation, v_uid, COALESCE(p_manual_unread, false), COALESCE(p_archived, false))
  ON CONFLICT (conversation_id, profile_id) DO UPDATE
    SET archived      = COALESCE(p_archived, public.chat_member_state.archived),
        manual_unread = COALESCE(p_manual_unread, public.chat_member_state.manual_unread);
END;
$$;
REVOKE ALL ON FUNCTION public.set_chat_state(uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_chat_state(uuid, boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.rename_mirror(p_title text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_title  text := btrim(COALESCE(p_title, ''));
  v_mirror uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF char_length(v_title) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'chat: a name is 1 to 60 characters' USING ERRCODE = '22023';
  END IF;
  v_mirror := public._chat_ensure_mirror(v_uid);
  UPDATE public.chat_conversations c SET title = v_title WHERE c.id = v_mirror;
  RETURN v_title;
END;
$$;
REVOKE ALL ON FUNCTION public.rename_mirror(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rename_mirror(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.block_user(p_other uuid)
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
  IF p_other IS NULL OR p_other = v_uid THEN
    RAISE EXCEPTION 'chat: choose another person' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_other) THEN
    RAISE EXCEPTION 'chat: person not found' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.chat_blocks (blocker_id, blocked_id) VALUES (v_uid, p_other)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.block_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unblock_user(p_other uuid)
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
  DELETE FROM public.chat_blocks b WHERE b.blocker_id = v_uid AND b.blocked_id = p_other;
END;
$$;
REVOKE ALL ON FUNCTION public.unblock_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_user(uuid) TO authenticated;

-- ============================================================================
-- 8. Erasure (P520)
-- ============================================================================
-- Not client-callable: reached only through erase_my_account(). What it does, and does NOT do:
--   * their mirror chat is deleted (cascades its messages and read state);
--   * their messages everywhere else lose body, attachment and snapshot and are marked deleted,
--     with author_id set NULL (the client renders a NULL author as "Deleted user");
--   * forwards / clarify copies made by OTHER people lose the erased user's words too: the
--     snapshot (and any copied thread entry) gets author 'Deleted user', a null body, and the id
--     that pointed back at them is cleared. Erase means erase; D5 snapshot survival applies to
--     ordinary deletes, not account erasure;
--   * their read state and blocks (given and received) are deleted;
--   * a 1:1 whose other side is already gone is deleted; otherwise it stays for the other person.
CREATE OR REPLACE FUNCTION public.erase_chat_data_for(p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  v_ref text := public._chat_author_ref(p_uid);
  n     integer;
  pass  integer;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'erase_chat_data_for: no subject' USING ERRCODE = '22023';
  END IF;

  -- ORDER MATTERS (race with forward_chat_message / clarify_chat_message). Those lock their source
  -- row FOR SHARE, so step 2's UPDATE of the erased user's own rows WAITS for any in-flight copy of
  -- them to commit. Under READ COMMITTED every statement takes a fresh snapshot, so the scrub in
  -- step 3 (a later statement) then SEES a copy that committed while step 2 waited and scrubs it.
  -- Scrubbing first would miss it. A copy that starts after step 2 commits finds the source deleted
  -- and is refused. Step 3 runs twice for the copy-of-a-copy case (a forward of a forward that
  -- committed while step 3's first pass waited).

  -- 1. their mirror and everything copied into it
  DELETE FROM public.chat_conversations c WHERE c.kind = 'mirror' AND c.owner_id = p_uid;
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_mirrors_deleted', n);

  -- 2. their messages in shared conversations
  UPDATE public.chat_messages m
     SET body = NULL, deleted_at = COALESCE(m.deleted_at, now()),
         attachment_kind = NULL, attachment_id = NULL,
         forward_snapshot = NULL, forward_author_id = NULL,
         author_id = NULL
   WHERE m.author_id = p_uid;
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_messages_erased', n);

  -- 3. copies made by OTHER people that carry their words. Erase means erase; D5 snapshot survival
  -- applies to ordinary deletes, not account erasure: the author becomes 'Deleted user', the body is
  -- removed (also from copied thread entries), the attachment and the back-reference are cleared.
  FOR pass IN 1..2 LOOP
    UPDATE public.chat_messages m
       SET forward_snapshot = jsonb_set(jsonb_set(m.forward_snapshot, '{author_name}', to_jsonb('Deleted user'::text)),
                                        '{body}', 'null'::jsonb),
           attachment_kind = NULL, attachment_id = NULL,
           forward_author_id = NULL
     WHERE m.forward_author_id = p_uid AND m.forward_snapshot IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_forwards_anonymised_' || pass, n);

    UPDATE public.chat_messages m
       SET forward_snapshot = jsonb_set(m.forward_snapshot, '{thread}', (
             SELECT COALESCE(jsonb_agg(
                      CASE WHEN t.e ->> 'author_ref' = v_ref
                           THEN (t.e - 'author_ref') || jsonb_build_object('author_name', 'Deleted user', 'body', NULL::text)
                           ELSE t.e END
                      ORDER BY t.ord), '[]'::jsonb)
               FROM jsonb_array_elements(m.forward_snapshot -> 'thread') WITH ORDINALITY AS t(e, ord)))
     WHERE m.forward_snapshot IS NOT NULL
       AND jsonb_path_exists(m.forward_snapshot, '$.thread[*] ? (@.author_ref == $ref)',
                             jsonb_build_object('ref', v_ref));
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_threads_anonymised_' || pass, n);

    -- a clarify made in a 1:1 with them carries their name as the chat title
    UPDATE public.chat_messages m
       SET forward_snapshot = jsonb_set(m.forward_snapshot - 'conversation_title_ref', '{conversation_title}',
                                        to_jsonb('Deleted user'::text))
     WHERE m.forward_snapshot ->> 'conversation_title_ref' = v_ref;
  END LOOP;

  -- 4. read state and blocks
  DELETE FROM public.chat_member_state s WHERE s.profile_id = p_uid;
  DELETE FROM public.chat_blocks b WHERE b.blocker_id = p_uid OR b.blocked_id = p_uid;

  -- 5. conversations that would be left with nobody
  DELETE FROM public.chat_conversations c
   WHERE c.kind = 'dm'
     AND ((c.dm_user_a = p_uid AND c.dm_user_b IS NULL) OR (c.dm_user_b = p_uid AND c.dm_user_a IS NULL));
  UPDATE public.chat_conversations c SET created_by = NULL WHERE c.created_by = p_uid;

  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.erase_chat_data_for(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- erase_my_account — body is byte-for-byte 20260903090000_p520_erasure_hardening_2.sql
-- plus ONE added statement (PERFORM public.erase_chat_data_for(v_uid)).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.erase_my_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_name          text;
  v_email         text;
  v_slug          text;
  v_tomb          constant text := 'Deleted user';
  v_tomb_email    constant text := 'deleted-user@invalid';
  v_sessions      uuid[] := '{}';
  v_same_name     uuid[] := '{}';
  v_counterparts  uuid[];
  v_their_stories uuid[];
  v_out           jsonb := '{}'::jsonb;
  n               integer;
  s               record;
  v_my_name       text;
  v_other_name    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'erase_my_account: not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT p.name, p.email, p.slug INTO v_name, v_email, v_slug FROM public.profiles p WHERE p.id = v_uid;

  IF v_name IS NOT NULL THEN

    -- ---- Lock my sessions first: in-flight live writers queue behind these row
    -- locks and re-evaluate their predicates after this commits (§ 4 of the round-1 header).
    PERFORM 1 FROM public.clarity_sessions
     WHERE creator_profile_id = v_uid OR joiner_profile_id = v_uid OR target_listener_id = v_uid
       FOR UPDATE;
    SELECT COALESCE(array_agg(id), '{}') INTO v_sessions
      FROM public.clarity_sessions
     WHERE creator_profile_id = v_uid OR joiner_profile_id = v_uid OR target_listener_id = v_uid;

    -- ---- Agreements (RESTRICT both sides) --------------------------------------
    UPDATE public.clarity_agreements
       SET status               = 'terminated',
           terminated_at        = COALESCE(terminated_at, now()),
           terminated_by        = NULL,
           partner_profile_id   = NULL,
           partner_email        = v_tomb_email,
           partner_display_name = v_tomb
     WHERE partner_profile_id = v_uid
        OR (partner_profile_id IS NULL AND lower(partner_email) = lower(v_email));
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('agreements_anonymised', n);

    DELETE FROM public.clarity_agreements WHERE creator_profile_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('agreements_deleted', n);

    -- ---- Story verifications (NO ACTION, NOT NULL both sides) --------------------
    SELECT array_agg(DISTINCT x) INTO v_counterparts
      FROM (SELECT speaker_id  AS x FROM public.story_verifications WHERE listener_id = v_uid
            UNION
            SELECT listener_id AS x FROM public.story_verifications WHERE speaker_id  = v_uid) q
     WHERE x <> v_uid;

    SELECT array_agg(DISTINCT sv.story_id) INTO v_their_stories
      FROM public.story_verifications sv
      JOIN public.stories st ON st.id = sv.story_id
     WHERE (sv.speaker_id = v_uid OR sv.listener_id = v_uid)
       AND st.author_id <> v_uid;

    DELETE FROM public.story_verifications WHERE speaker_id = v_uid OR listener_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('verifications_deleted', n);

    UPDATE public.profiles p
       SET ears_count = (SELECT count(DISTINCT sv.speaker_id) FROM public.story_verifications sv
                          WHERE sv.listener_id = p.id AND sv.accuracy_achieved),
           verification_session_count =
             (SELECT count(*) FROM public.story_verifications sv WHERE sv.listener_id = p.id)
           + (SELECT count(*) FROM public.story_verifications sv
               WHERE sv.speaker_id = p.id AND sv.speaker_id <> sv.listener_id)
     WHERE p.id = ANY(COALESCE(v_counterparts, '{}'::uuid[]));

    UPDATE public.stories st
       SET understood_count = (SELECT count(DISTINCT sv.listener_id) FROM public.story_verifications sv
                                WHERE sv.story_id = st.id AND sv.accuracy_achieved)
     WHERE st.id = ANY(COALESCE(v_their_stories, '{}'::uuid[]));

    -- ---- Letters I sent, docs I own (NO ACTION, NOT NULL) ------------------------
    UPDATE public.clarity_sessions SET source_letter_id = NULL
     WHERE source_letter_id IN (SELECT id FROM public.clarity_letters WHERE sender_id = v_uid);
    DELETE FROM public.story_explain_backs WHERE recorder_id = v_uid;
    DELETE FROM public.clarity_letters WHERE sender_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('letters_deleted', n);
    DELETE FROM public.clarity_docs WHERE owner_id = v_uid;

    -- ---- Letters delivered TO me by others --------------------------------------
    DELETE FROM public.letter_point_responses
     WHERE delivery_id IN (SELECT id FROM public.letter_deliveries WHERE receiver_profile_id = v_uid);
    UPDATE public.letter_deliveries
       SET receiver_profile_id = NULL, receiver_email = NULL, receiver_name = v_tomb
     WHERE receiver_profile_id = v_uid
        OR (receiver_email IS NOT NULL AND lower(receiver_email) = lower(v_email));
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('deliveries_anonymised', n);

    -- ---- Live sessions ------------------------------------------------------------
    -- A session nobody else ever joined is mine alone: delete it outright.
    DELETE FROM public.clarity_sessions
     WHERE id = ANY(v_sessions) AND creator_profile_id = v_uid
       AND joiner_profile_id IS NULL AND joiner_name IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('solo_sessions_deleted', n);

    -- Transcripts hold my verbatim speech — erased (spec [FOUNDER DECISION]).
    DELETE FROM public.session_transcripts WHERE session_id = ANY(v_sessions);
    DELETE FROM public.transcription_jobs  WHERE session_id = ANY(v_sessions);

    -- Per shared session: name-only tables use the SESSION-TIME name and only when the
    -- counterparty's name differs; live_state is scrubbed by key.
    FOR s IN
      SELECT id, code, creator_profile_id, joiner_profile_id, creator_name, joiner_name, live_state
        FROM public.clarity_sessions
       WHERE id = ANY(v_sessions)
    LOOP
      IF s.creator_profile_id = v_uid THEN
        v_my_name := s.creator_name;  v_other_name := s.joiner_name;
      ELSIF s.joiner_profile_id = v_uid THEN
        v_my_name := s.joiner_name;   v_other_name := s.creator_name;
      ELSE
        v_my_name := NULL;            v_other_name := NULL;   -- target_listener only: no name on the row
      END IF;

      IF v_my_name IS NOT NULL AND v_my_name IS NOT DISTINCT FROM v_other_name THEN
        v_same_name := v_same_name || s.id;
      ELSIF v_my_name IS NOT NULL THEN
        -- Rows that are MINE (author/actor) go; my name on the counterparty's rows is tombstoned.
        DELETE FROM public.clarity_verifications v
         USING public.clarity_chat_messages m
         WHERE v.message_id = m.id AND m.session_id = s.id AND v.verifier_name = v_my_name;
        DELETE FROM public.clarity_chat_messages WHERE session_id = s.id AND author_name = v_my_name;
        DELETE FROM public.clarity_ideas         WHERE session_id = s.id AND author_name = v_my_name;
        DELETE FROM public.clarity_live_turns    WHERE session_id = s.id AND actor_name  = v_my_name;
        UPDATE public.clarity_live_turns
           SET speaker_name  = CASE WHEN speaker_name  = v_my_name THEN v_tomb ELSE speaker_name  END,
               listener_name = CASE WHEN listener_name = v_my_name THEN v_tomb ELSE listener_name END
         WHERE session_id = s.id AND (speaker_name = v_my_name OR listener_name = v_my_name);
        UPDATE public.clarity_demo_rounds
           SET speaker_name  = CASE WHEN speaker_name  = v_my_name THEN v_tomb ELSE speaker_name  END,
               listener_name = CASE WHEN listener_name = v_my_name THEN v_tomb ELSE listener_name END
         WHERE session_id = s.id AND (speaker_name = v_my_name OR listener_name = v_my_name);
        DELETE FROM public.ml_training_sessions WHERE session_code = s.code AND user_name = v_my_name;
      END IF;

      UPDATE public.clarity_sessions
         SET live_state = public._p520_scrub_live_state(live_state, COALESCE(v_my_name, v_name), v_slug, v_tomb)
       WHERE id = s.id AND live_state IS NOT NULL;
    END LOOP;

    -- Identity columns: matched on the ID, never the name. Shared sessions are closed.
    UPDATE public.clarity_sessions
       SET creator_profile_id = CASE WHEN creator_profile_id = v_uid THEN NULL   ELSE creator_profile_id END,
           creator_name       = CASE WHEN creator_profile_id = v_uid THEN v_tomb ELSE creator_name       END,
           joiner_profile_id  = CASE WHEN joiner_profile_id  = v_uid THEN NULL   ELSE joiner_profile_id  END,
           joiner_name        = CASE WHEN joiner_profile_id  = v_uid THEN v_tomb ELSE joiner_name        END,
           target_listener_id = CASE WHEN target_listener_id = v_uid THEN NULL   ELSE target_listener_id END,
           status             = 'cancelled'
     WHERE id = ANY(v_sessions);
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('sessions_anonymised', n);

    UPDATE public.clarity_sessions SET source_story_id = NULL
     WHERE source_story_id IN (SELECT id FROM public.stories WHERE author_id = v_uid);

    -- ---- Positions, then their history (trigger order) ------------------------------
    DELETE FROM public.point_positions WHERE user_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('positions_deleted', n);
    DELETE FROM public.point_position_history WHERE user_id = v_uid;
    DELETE FROM public.story_point_history    WHERE user_id = v_uid;

    -- ---- My content ---------------------------------------------------------------------
    DELETE FROM public.stories WHERE author_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('stories_deleted', n);

    -- ---- Community data I created: orphan, never delete ---------------------------------
    UPDATE public.points SET first_validator_id = NULL WHERE first_validator_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('points_orphaned', n);
    UPDATE public.events SET host_id = NULL WHERE host_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('events_orphaned', n);

    -- ---- Endorsements I gave (matched on the id column) -----------------------------------
    UPDATE public.witnesses
       SET witness_profile_id = NULL, witness_name = v_tomb, witness_linkedin_url = NULL
     WHERE witness_profile_id = v_uid;

    -- ---- Logs / room memberships that outlive me -------------------------------------------
    UPDATE public.email_send_log SET profile_id = NULL WHERE profile_id = v_uid;
    UPDATE public.event_room_members SET profile_id = NULL, display_name = v_tomb WHERE profile_id = v_uid;

    -- ---- Clarity Chat (P1512): messages, mirror, read state, blocks ------------------------
    PERFORM public.erase_chat_data_for(v_uid);

    -- ---- PII tables with no FK at all ---------------------------------------------------------
    DELETE FROM public.terms_acceptances WHERE user_id = v_uid;
    DELETE FROM public.session_consents  WHERE user_id = v_uid;
  END IF;

  -- ---- Audit row, then the identity itself -------------------------------------------------
  INSERT INTO public.erased_subjects (user_id, same_name_sessions)
  VALUES (v_uid, v_same_name)
  ON CONFLICT (user_id) DO UPDATE SET erased_at = now(), same_name_sessions = EXCLUDED.same_name_sessions;

  -- The two GoTrue tables that do NOT cascade from auth.users (header § 8).
  -- refresh_tokens.user_id is varchar and carries no FK; flow_state.user_id carries none either.
  DELETE FROM auth.refresh_tokens WHERE user_id = v_uid::text;
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('auth_refresh_tokens_deleted', n);
  DELETE FROM auth.flow_state WHERE user_id = v_uid;
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('auth_flow_state_deleted', n);

  DELETE FROM auth.users WHERE id = v_uid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'erase_my_account: auth user % not found', v_uid USING ERRCODE = 'P0002';
  END IF;

  RETURN v_out || jsonb_build_object('auth_user_deleted', true,
                                     'same_name_sessions', to_jsonb(v_same_name));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.erase_my_account() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.erase_my_account() TO authenticated;

-- ============================================================================
-- 9. Backfill: one General per organization, one channel per event, one mirror per profile
-- ============================================================================
INSERT INTO public.chat_conversations (kind, org_id)
SELECT 'group', o.id FROM public.organization o
 WHERE NOT EXISTS (SELECT 1 FROM public.chat_conversations c WHERE c.kind = 'group' AND c.org_id = o.id)
ON CONFLICT (org_id) WHERE kind = 'group' DO NOTHING;

INSERT INTO public.chat_conversations (kind, event_id)
SELECT 'event', e.id FROM public.events e
 WHERE NOT EXISTS (SELECT 1 FROM public.chat_conversations c WHERE c.kind = 'event' AND c.event_id = e.id)
ON CONFLICT (event_id) WHERE kind = 'event' DO NOTHING;

INSERT INTO public.chat_conversations (kind, owner_id)
SELECT 'mirror', p.id FROM public.profiles p
 WHERE NOT EXISTS (SELECT 1 FROM public.chat_conversations c WHERE c.kind = 'mirror' AND c.owner_id = p.id)
ON CONFLICT (owner_id) WHERE kind = 'mirror' DO NOTHING;

-- ============================================================================
-- 10. Realtime: only after the policies above exist. REPLICA IDENTITY stays DEFAULT.
-- ============================================================================
DO $realtime$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_member_state') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_member_state;
  END IF;
END;
$realtime$;

-- ============================================================================
-- 11. Deploy-time assertions: the structural claims above are checked, not assumed.
-- ============================================================================
DO $assert$
DECLARE
  t  text;
  f  record;
  v_count integer;
BEGIN
  -- no write privilege for any client role on any chat table
  FOREACH t IN ARRAY ARRAY['chat_conversations', 'chat_messages', 'chat_member_state', 'chat_blocks'] LOOP
    IF has_table_privilege('authenticated', 'public.' || t, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || t, 'DELETE')
       OR has_table_privilege('anon', 'public.' || t, 'SELECT')
       OR has_table_privilege('anon', 'public.' || t, 'INSERT')
       OR has_table_privilege('anon', 'public.' || t, 'UPDATE')
       OR has_table_privilege('anon', 'public.' || t, 'DELETE') THEN
      RAISE EXCEPTION 'P1512: a client role holds a forbidden privilege on public.%', t;
    END IF;
    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = ('public.' || t)::regclass) THEN
      RAISE EXCEPTION 'P1512: RLS is not enabled on public.%', t;
    END IF;
  END LOOP;

  -- every chat function: anon and PUBLIC cannot execute any of them; internal ones are
  -- not executable by authenticated either
  FOR f IN
    SELECT p.oid, p.proname,
           (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                                         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')) AS public_exec
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('chat_access_since', 'get_my_chats', 'search_chat_people', 'search_my_messages',
                         'get_my_blocks', 'start_dm', 'send_chat_message', 'edit_chat_message',
                         'delete_chat_message', 'forward_chat_message', 'clarify_chat_message',
                         'mark_chat_read', 'set_chat_state', 'rename_mirror', 'block_user', 'unblock_user',
                         'chat_my_access', 'get_thread_stats')
  LOOP
    IF has_function_privilege('anon', f.oid, 'EXECUTE') OR f.public_exec THEN
      RAISE EXCEPTION 'P1512: anon or PUBLIC can execute public.%', f.proname;
    END IF;
    IF NOT has_function_privilege('authenticated', f.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1512: authenticated cannot execute public.%', f.proname;
    END IF;
  END LOOP;
  FOR f IN
    SELECT p.oid, p.proname,
           (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                                         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')) AS public_exec
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND (p.proname LIKE '\_chat\_%' OR p.proname = 'erase_chat_data_for')
  LOOP
    IF has_function_privilege('anon', f.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', f.oid, 'EXECUTE')
       OR f.public_exec THEN
      RAISE EXCEPTION 'P1512: a client role can execute internal function public.%', f.proname;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'erase_my_account';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'P1512: expected exactly 1 erase_my_account function, found %', v_count;
  END IF;
END;
$assert$;
