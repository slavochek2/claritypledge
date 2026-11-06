-- Migration: P1556 personal contact codes, exact-handle search, can-message check
-- Created: 2026-11-06
-- Spec: features/p1556_find_and_message_a_person.md (Server contract)
-- Guaranteed by: src/tests/p1556-*.test.ts, e2e/integration/p1556-contact-code.spec.ts
--
-- A person's code is a 128-bit random token. Opening it starts (or reopens) a 1:1 with its owner even when the two
-- share no group, event or agreement: being shown or sent the code is the owner's consent. This is the ONLY new way
-- past _chat_shared_reason; start_dm and _chat_dm_for_share (P1545) are not touched.
--
-- Access: the token table has RLS on and no policies, and every function here is SECURITY DEFINER. A token is read
-- only by its owner (get_my_contact_code); lookup_contact_code returns the owner's public name and photo, never the
-- token or the id. Every failure a stranger can see is the same message, so a probe cannot tell blocked from invalid.
--
-- new function (every function in this file is new; none existed before P1556)
--
-- client-safe: additive. New tables and new functions only; no existing signature, column or key changes.

-- 1. Tables ---------------------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.contact_codes (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE CHECK (token ~ '^[0-9a-f]{32}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  reset_at   timestamptz
);
ALTER TABLE public.contact_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_codes FROM PUBLIC, anon, authenticated;

-- One row per 1:1 a code started: the owner-side daily limit counts these (start_dm's limit counts only the starter).
CREATE TABLE IF NOT EXISTS public.contact_code_redemptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  redeemer_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_code_redemptions_owner_time ON public.contact_code_redemptions (owner_id, created_at);
ALTER TABLE public.contact_code_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_code_redemptions FROM PUBLIC, anon, authenticated;

-- 2. Owner calls ----------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._contact_code_new_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = ''
AS $$ SELECT encode(extensions.gen_random_bytes(16), 'hex') $$;
REVOKE ALL ON FUNCTION public._contact_code_new_token() FROM PUBLIC, anon, authenticated;

-- The caller's own token, created on first use.
CREATE OR REPLACE FUNCTION public.get_my_contact_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_token text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'contact code: not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT c.token INTO v_token FROM public.contact_codes c WHERE c.profile_id = v_uid;
  IF v_token IS NULL THEN
    INSERT INTO public.contact_codes (profile_id, token) VALUES (v_uid, public._contact_code_new_token())
    ON CONFLICT (profile_id) DO NOTHING;
    SELECT c.token INTO v_token FROM public.contact_codes c WHERE c.profile_id = v_uid;
  END IF;
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_contact_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_contact_code() TO authenticated;

-- Replace the caller's token. The row lock serialises with redeem_contact_code, which locks the same row: a redemption
-- either finishes before the reset or sees the new token and fails. Existing 1:1s are not affected.
CREATE OR REPLACE FUNCTION public.reset_my_contact_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_token text := public._contact_code_new_token();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'contact code: not authenticated' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.contact_codes (profile_id, token) VALUES (v_uid, v_token)
  ON CONFLICT (profile_id) DO UPDATE SET token = EXCLUDED.token, reset_at = now();
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.reset_my_contact_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_my_contact_code() TO authenticated;

-- 3. Opening a code -------------------------------------------------------------------------------------------------

-- Before sign-up: who the code belongs to. Name and photo only; nothing for an invalid token.
CREATE OR REPLACE FUNCTION public.lookup_contact_code(p_token text)
RETURNS TABLE (name text, avatar_url text, avatar_color text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.name, p.avatar_url, p.avatar_color
    FROM public.contact_codes c
    JOIN public.profiles p ON p.id = c.profile_id
   WHERE p_token ~ '^[0-9a-f]{32}$' AND c.token = p_token;
$$;
REVOKE ALL ON FUNCTION public.lookup_contact_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_contact_code(text) TO anon, authenticated;

-- Start or reopen the 1:1 with the code's owner. Returns the conversation id.
-- Errors: 'contact code: own code' (22023) for your own code; 'contact code: paused' (54000) past the owner's daily
-- limit; 'chat: too many new conversations today' (54000) past the caller's; every other refusal (bad, reset or
-- unknown token, blocked either way) is 'contact code: not available' (42501), the same text for all of them.
CREATE OR REPLACE FUNCTION public.redeem_contact_code(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_a     uuid;
  v_b     uuid;
  v_id    uuid;
  v_new   integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'contact code: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'contact code: not available' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE: the same row reset_my_contact_code writes, so the two cannot interleave.
  SELECT c.profile_id INTO v_owner FROM public.contact_codes c WHERE c.token = p_token FOR UPDATE;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'contact code: not available' USING ERRCODE = '42501';
  END IF;
  IF v_owner = v_uid THEN
    RAISE EXCEPTION 'contact code: own code' USING ERRCODE = '22023';
  END IF;
  IF public._chat_blocked_either(v_uid, v_owner) THEN
    RAISE EXCEPTION 'contact code: not available' USING ERRCODE = '42501';
  END IF;

  v_a := LEAST(v_uid, v_owner);
  v_b := GREATEST(v_uid, v_owner);
  SELECT c.id INTO v_id FROM public.chat_conversations c
   WHERE c.kind = 'dm' AND c.dm_user_a = v_a AND c.dm_user_b = v_b;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- The starter's limit: start_dm's own rule (P1512 D2), on the same advisory lock so the two paths share one count.
  PERFORM pg_advisory_xact_lock(hashtextextended('chat_start_dm:' || v_uid::text, 0));
  SELECT count(*)::integer INTO v_new FROM public.chat_conversations c
   WHERE c.kind = 'dm' AND c.created_by = v_uid AND c.created_at > now() - interval '24 hours';
  IF v_new >= 20 THEN
    RAISE EXCEPTION 'chat: too many new conversations today' USING ERRCODE = '54000';
  END IF;

  -- The owner's limit: 20 new chats a day from one code. The code row lock above already serialises redemptions of
  -- this owner's code, so the count cannot be overstepped by parallel calls.
  SELECT count(*)::integer INTO v_new FROM public.contact_code_redemptions r
   WHERE r.owner_id = v_owner AND r.created_at > now() - interval '24 hours';
  IF v_new >= 20 THEN
    RAISE EXCEPTION 'contact code: paused' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.chat_conversations (kind, dm_user_a, dm_user_b, created_by)
  VALUES ('dm', v_a, v_b, v_uid)
  ON CONFLICT (dm_user_a, dm_user_b) WHERE kind = 'dm' DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT c.id INTO v_id FROM public.chat_conversations c
     WHERE c.kind = 'dm' AND c.dm_user_a = v_a AND c.dm_user_b = v_b;
    RETURN v_id;
  END IF;
  INSERT INTO public.contact_code_redemptions (owner_id, redeemer_id, conversation_id) VALUES (v_owner, v_uid, v_id);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_contact_code(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_contact_code(text) TO authenticated;

-- 4. Handles --------------------------------------------------------------------------------------------------------

-- Whether the caller may message p_other: an existing 1:1, or a shared connection, and no block either way.
CREATE OR REPLACE FUNCTION public.can_message_profile(p_other uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
     AND p_other IS NOT NULL
     AND p_other <> auth.uid()
     AND NOT public._chat_blocked_either(auth.uid(), p_other)
     AND (
       EXISTS (SELECT 1 FROM public.chat_conversations c
                WHERE c.kind = 'dm'
                  AND c.dm_user_a = LEAST(auth.uid(), p_other)
                  AND c.dm_user_b = GREATEST(auth.uid(), p_other))
       OR public._chat_shared_reason(auth.uid(), p_other) IS NOT NULL
     );
$$;
REVOKE ALL ON FUNCTION public.can_message_profile(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_message_profile(uuid) TO authenticated;

-- Exact-handle lookup for New message. The client normalises (trim, leading @, a pasted profile URL); this compares
-- case-insensitively and returns at most one person. Never yourself; never someone blocked either way.
CREATE OR REPLACE FUNCTION public.find_profile_by_handle(p_handle text)
RETURNS TABLE (id uuid, name text, slug text, avatar_url text, avatar_color text, can_message boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.name, p.slug, p.avatar_url, p.avatar_color, public.can_message_profile(p.id)
    FROM public.profiles p
   WHERE auth.uid() IS NOT NULL
     AND char_length(btrim(COALESCE(p_handle, ''))) BETWEEN 1 AND 100
     AND lower(p.slug) = lower(btrim(p_handle))
     AND p.id <> auth.uid()
     AND NOT public._chat_blocked_either(auth.uid(), p.id)
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.find_profile_by_handle(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_profile_by_handle(text) TO authenticated;
