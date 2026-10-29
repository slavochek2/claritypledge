-- P1542 round 7 (migration review): public.group_chat_key — the same normalisation as the client, two fixes.
-- diffed against: 20261027170000_p1542_group_chat_opens.sql
-- client-safe: same signature, stricter trim only (and provider-aware query/fragment handling, below)
--
-- THE RULE (identical in the client: normaliseChatLink in src/app/prototypes/events/use-group-chat-opened.ts, with its
-- host list PATH_CODE_HOSTS in src/app/prototypes/events/group-chat-utils.ts — change both together):
--   1. Trim spaces, tabs and line breaks:  btrim(p_url, E' \t\r\n').
--   2. If the host (lower-cased, an optional leading "www." ignored) is one whose invite code lives in the PATH —
--      WhatsApp (chat.whatsapp.com, whatsapp.com, wa.me), Telegram (t.me, telegram.me, telegram.dog),
--      Discord (discord.gg, discord.com, discordapp.com) — drop the query string and fragment, then trailing slashes.
--   3. Any other host — Signal included, and unknown hosts — drop only the trailing slashes before the query/fragment,
--      and KEEP the query and fragment.
--   Case is never changed (invite codes are case-sensitive).
--
-- WHY.
--   (a) The original used btrim(p_url), which strips spaces only, while the client's trim strips tabs and line breaks
--       too: a link stored with a trailing newline hashed to a different key than its clean form.
--   (b) The original dropped everything from "?" or "#" for EVERY host. Signal invite links keep the whole group code
--       in the fragment (https://signal.group/#CjQK…), so every Signal group hashed to one key: opening one hike's
--       Signal group hid the offer of every other hike's Signal group.
--
-- Unchanged on purpose: the signature (text -> text), LANGUAGE sql, IMMUTABLE, SET search_path = '', and the revokes.
-- CREATE OR REPLACE keeps the owner; the SECURITY DEFINER callers (group_chat_key_for_caller, and through it
-- mark_group_chat_opened and group_chat_opened) pick the new body up with no change of their own.
--
-- A host who rotates the group's invite link gets a new key, so the "opened" state resets and the offer shows again (intended).
--
-- Rows already recorded keep their keys. WhatsApp / Telegram / Discord links without stray tabs or line breaks keep the
-- same key as before. A link whose key changes here (Signal or unknown hosts, or a link with tabs/line breaks) simply
-- counts as not yet opened once more: the next tap records it under the new key. No data rewrite is needed.

CREATE OR REPLACE FUNCTION public.group_chat_key(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH t AS (
    SELECT btrim(p_url, E' \t\r\n') AS u
  ), h AS (
    SELECT u,
      regexp_replace(lower(substring(u from '^[A-Za-z][A-Za-z0-9+.-]*://(?:[^@/?#]*@)?([^/:?#]*)')), '^www\.', '') AS host
    FROM t
  ), n AS (
    SELECT CASE
      WHEN host IN ('chat.whatsapp.com', 'whatsapp.com', 'wa.me',
                    't.me', 'telegram.me', 'telegram.dog',
                    'discord.gg', 'discord.com', 'discordapp.com')
        THEN regexp_replace(regexp_replace(u, '[?#].*$', ''), '/+$', '')
      ELSE regexp_replace(substring(u from '^[^?#]*'), '/+$', '') || coalesce(substring(u from '[?#].*$'), '')
    END AS v
    FROM h
  )
  SELECT encode(sha256(convert_to(v, 'UTF8')), 'hex') FROM n;
$$;

REVOKE EXECUTE ON FUNCTION public.group_chat_key(text) FROM PUBLIC, anon, authenticated;
