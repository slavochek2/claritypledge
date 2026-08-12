-- client-safe: no deployed client reaches this table. /chat and /clarity-chat both
-- render <ChatRedirect /> to /create (src/App.tsx:709-710); clarity-chat-page.tsx,
-- the only caller of sendChatMessage / getChatMessages / subscribeToChatMessages /
-- subscribeToChatMessageUpdates, is imported by nothing. Grepped supabase/functions,
-- scripts, e2e and src/tests for clarity_chat_messages: zero hits outside api.ts and
-- the orphaned page. Currently-loaded old tabs are the residual risk, and the worst
-- case there is a chat surface no route can reach failing to load messages.
-- ============================================================================
-- Revoke all access to clarity_chat_messages — decommissioned feature
-- ============================================================================
-- Found by scripts/rls-drift-check.py (P1048) on its first live run, 2026-08-12.
--
-- Live policy set on prod before this migration:
--
--   SELECT  "Chat messages are viewable by everyone"  qual = true
--   UPDATE  "Anyone can update chat messages"         qual = true, check = true
--   INSERT  "Anyone can insert chat messages"         check = (auth.uid() IS NOT NULL)
--
-- All three are granted to `{public}`, which includes `anon`. So any
-- unauthenticated caller holding the anon key — the key that ships in the
-- public JS bundle — could read every chat message and rewrite the content of
-- any of them. Demonstrated read-side on prod before writing this migration:
-- an anon-key GET returned `content-range: 0-0/15` with no session. The write
-- side was NOT exercised against prod (that would have mutated live rows); it
-- is inferred from `USING (true) WITH CHECK (true)` on a {public} UPDATE.
--
-- The UPDATE policy appears in NO migration in this repo — applied out-of-band,
-- the same origin class as P1046's `clarity_sessions "Anyone can read sessions"`.
--
-- WHY REVOKE RATHER THAN TIGHTEN
-- The chat feature is decommissioned. `/chat` and `/clarity-chat` both render
-- <ChatRedirect /> (src/App.tsx:709-710), which Navigates to /create;
-- src/app/pages/clarity-chat-page.tsx is imported by nothing. No edge function,
-- script, or e2e test references the table. Writing a correctly-scoped policy
-- for a surface no code reaches would be inventing an access rule nobody needs.
-- Removing every policy is the smaller, more honest change.
--
-- WHY THIS IS DENY-ALL AND NOT OPEN-ALL
-- Verified before writing: pg_class.relrowsecurity = true on BOTH prod and test.
-- With RLS enabled and zero policies, Postgres denies every row to any role that
-- does not bypass RLS. This is the load-bearing precondition — had RLS been
-- disabled, dropping the policies would have made the table WIDE OPEN instead.
-- Re-verify relrowsecurity before reusing this pattern on another table.
--
-- service_role still reaches the table (it bypasses RLS), so backups, admin
-- queries, and any future decommissioning of the data itself are unaffected.
--
-- DATA IS NOT TOUCHED. The 15 rows remain. This migration only removes access.
--
-- ROLLBACK: re-create whichever policies are needed. Nothing is destroyed here,
-- so reversing this is additive, not a restore.
--
-- NOT ADDRESSED HERE: the other findings from the same drift-check run, incl.
-- unauthenticated INSERT on ml_training_sessions, and three tables that have no
-- CREATE TABLE in any migration. See .private/docs/security-log.md 2026-08-12.
-- ============================================================================

-- Assert the deny-all precondition at APPLY time, before anything is dropped,
-- rather than trusting the check performed while authoring. Ordered first on
-- purpose: if RLS were ever turned off on this table, the DROPs below would
-- expose it rather than protect it, and this must fail before that happens --
-- not after, relying on transaction rollback semantics that vary by how the
-- file is submitted (CLI push vs Management API).
DO $$
BEGIN
  IF NOT COALESCE(
       (SELECT relrowsecurity FROM pg_class
         WHERE relname = 'clarity_chat_messages'
           AND relnamespace = 'public'::regnamespace),
       false) THEN
    RAISE EXCEPTION
      'ABORT: RLS is disabled on (or table missing) public.clarity_chat_messages. Dropping its policies would expose the table, not protect it.';
  END IF;
END $$;

DROP POLICY IF EXISTS "Chat messages are viewable by everyone" ON public.clarity_chat_messages;
DROP POLICY IF EXISTS "Anyone can update chat messages" ON public.clarity_chat_messages;
DROP POLICY IF EXISTS "Anyone can insert chat messages" ON public.clarity_chat_messages;
