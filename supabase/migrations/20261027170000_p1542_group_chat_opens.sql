-- P1542 founder UAT round 6 (decision 43): "opened the group chat" (C), so an offer the app knows is done is not
-- advertised again — once a person tapped a hike's WhatsApp group, the event page, the registration thank-you and the
-- feedback thank-you stop showing "Join WhatsApp group".
--
-- The signal is the TAP, not the join: WhatsApp gives no join callback (founder: click is the signal).
--
-- Keyed by the chat link, not the event: one WhatsApp group shared by many hikes counts once. The key is a SHA-256 of
-- the normalised invite URL computed SERVER-SIDE from event_private_info, so
--   * the private URL is never copied into a second table, and
--   * a client cannot claim an arbitrary key: the write takes an event id, and is refused for anyone who is neither
--     registered for that event nor its host (the same audience event_private_info's SELECT policy allows).
--
-- Additive only: one new table, one private helper, two RPCs. Nothing existing changes.
--
-- new function: group_chat_key, group_chat_key_for_caller, mark_group_chat_opened, group_chat_opened (none existed before)
-- client-safe: every object here is new and the REVOKEs touch only these new objects; deployed clients never call them,
--   and the round 6 client falls back to the browser's own record when the RPCs are missing.

CREATE TABLE IF NOT EXISTS public.group_chat_opens (
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chat_key TEXT NOT NULL,
  first_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (profile_id, chat_key)
);

COMMENT ON TABLE public.group_chat_opens IS
  'P1542 round 6: who has opened which group chat (keyed by a server-side hash of the invite link). Written only by mark_group_chat_opened; each person reads only their own rows.';

ALTER TABLE public.group_chat_opens ENABLE ROW LEVEL SECURITY;

-- Clients read their own rows; nothing else. There is deliberately NO insert/update/delete policy: an own-row INSERT
-- policy would let a client write any chat_key it likes. The only writer is the SECURITY DEFINER RPC below.
REVOKE ALL ON public.group_chat_opens FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.group_chat_opens TO authenticated;

DROP POLICY IF EXISTS "Own group chat opens are readable" ON public.group_chat_opens;
CREATE POLICY "Own group chat opens are readable"
  ON public.group_chat_opens FOR SELECT
  TO authenticated
  USING (profile_id = (SELECT auth.uid()));

-- The key: the trimmed link without its query string, fragment or trailing slashes, hashed. Case is kept on purpose —
-- WhatsApp invite codes are case-sensitive, so lower-casing could merge two different groups.
CREATE OR REPLACE FUNCTION public.group_chat_key(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT encode(
    sha256(convert_to(regexp_replace(regexp_replace(btrim(p_url), '[?#].*$', ''), '/+$', ''), 'UTF8')),
    'hex'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.group_chat_key(text) FROM PUBLIC, anon, authenticated;

-- May this caller see this event's group chat at all? The host, or someone holding an RSVP (event_private_info's rule).
-- Returns the link's key, or NULL when the caller may not see it or the event has no group chat.
CREATE OR REPLACE FUNCTION public.group_chat_key_for_caller(p_event_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_url text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = p_event_id AND r.profile_id = v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event_id AND e.host_id = v_uid) THEN
    RETURN NULL;
  END IF;
  SELECT p.group_chat_url INTO v_url FROM public.event_private_info p WHERE p.event_id = p_event_id;
  IF v_url IS NULL OR length(btrim(v_url)) = 0 THEN
    RETURN NULL;
  END IF;
  RETURN public.group_chat_key(v_url);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.group_chat_key_for_caller(uuid) FROM PUBLIC, anon, authenticated;

-- The tap. Idempotent: a second tap on the same link adds nothing (primary key + DO NOTHING).
-- Refused (42501) for a caller who is not registered for the event and is not its host.
CREATE OR REPLACE FUNCTION public.mark_group_chat_opened(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_key text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = p_event_id AND r.profile_id = v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event_id AND e.host_id = v_uid) THEN
    RAISE EXCEPTION 'not registered for this event' USING ERRCODE = '42501';
  END IF;
  v_key := public.group_chat_key_for_caller(p_event_id);
  IF v_key IS NULL THEN
    RETURN false; -- the event has no group chat
  END IF;
  INSERT INTO public.group_chat_opens (profile_id, chat_key)
  VALUES (v_uid, v_key)
  ON CONFLICT (profile_id, chat_key) DO NOTHING;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_group_chat_opened(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_group_chat_opened(uuid) TO authenticated;

-- The read: has the caller opened THIS event's group chat (from any event that shares the link)?
-- False for a caller who may not see the chat, so it reveals nothing about events they are not registered for.
CREATE OR REPLACE FUNCTION public.group_chat_opened(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text := public.group_chat_key_for_caller(p_event_id);
BEGIN
  IF v_key IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.group_chat_opens o
    WHERE o.profile_id = auth.uid() AND o.chat_key = v_key
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.group_chat_opened(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.group_chat_opened(uuid) TO authenticated;
