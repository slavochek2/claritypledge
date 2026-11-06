-- Migration: P1556 review fixes — block-blind lookup, no codes for agent accounts
-- Created: 2026-11-06
-- Spec: features/p1556_find_and_message_a_person.md (Server contract)
-- Guaranteed by: e2e/integration/p1556-contact-code.spec.ts
--
-- diffed against: 20261106100000_p1556_contact_codes.sql (applied on test; NOT edited). Each CREATE OR REPLACE below is
-- that file's body with ONLY these changes; signatures and grants are unchanged.
--   * lookup_contact_code: a signed-in caller blocked either way gets no row, as for an invalid token. Before, the
--     lookup answered and the redeem refused, and the pair told "blocked" apart from "invalid" (Opus review 1).
--   * get_my_contact_code, reset_my_contact_code, redeem_contact_code: an agent account (public.agent_accounts) has no
--     code and cannot be reached by one ("Agent and mirror profiles get no code"; Opus review 3).
--
-- client-safe: function bodies only; no table, column or key changes.

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
   WHERE p_token ~ '^[0-9a-f]{32}$' AND c.token = p_token
     AND NOT EXISTS (SELECT 1 FROM public.agent_accounts a WHERE a.profile_id = c.profile_id)
     AND (auth.uid() IS NULL OR NOT public._chat_blocked_either(auth.uid(), c.profile_id));
$$;

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
  IF EXISTS (SELECT 1 FROM public.agent_accounts a WHERE a.profile_id = v_uid) THEN
    RAISE EXCEPTION 'contact code: not available' USING ERRCODE = '42501';
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
  IF EXISTS (SELECT 1 FROM public.agent_accounts a WHERE a.profile_id = v_uid) THEN
    RAISE EXCEPTION 'contact code: not available' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.contact_codes (profile_id, token) VALUES (v_uid, v_token)
  ON CONFLICT (profile_id) DO UPDATE SET token = EXCLUDED.token, reset_at = now();
  RETURN v_token;
END;
$$;

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
  IF v_owner IS NULL OR EXISTS (SELECT 1 FROM public.agent_accounts a WHERE a.profile_id = v_owner) THEN
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

  -- The owner's limit: 20 new chats a day from one person's code, across resets (a reset does not lift it).
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
