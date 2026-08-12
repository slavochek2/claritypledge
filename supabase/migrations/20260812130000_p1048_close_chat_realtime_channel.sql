-- client-safe: strictly narrower than the migration it follows. The only subscribers to
-- this table's realtime channel are subscribeToChatMessages (src/app/data/api.ts:1701) and
-- subscribeToChatMessageUpdates (:2029), both called exclusively from
-- src/app/pages/clarity-chat-page.tsx, which no module imports and no route renders
-- (/chat and /clarity-chat both redirect to /create, src/App.tsx:709-710). A currently-open
-- old tab would stop receiving events on a surface it cannot navigate to.
-- ============================================================================
-- Remove decommissioned clarity_chat_messages from the realtime publication
-- ============================================================================
-- Follow-up to 20260812120000_p1048_lockdown_dead_chat_table.sql, which dropped every
-- RLS policy on this table to make it deny-all.
--
-- That migration closed the REST surface and was verified doing so (anon SELECT went from
-- `content-range: 0-0/15` to `*/0` on prod). It did NOT consider a second live path to the
-- same rows: the table is a member of the `supabase_realtime` publication, so changes are
-- replicated to the Realtime service and delivered over `postgres_changes` WebSocket
-- channels. Verified live at authoring time — pg_publication_tables returns
-- supabase_realtime for this table on BOTH prod and test.
--
-- WHY REMOVE RATHER THAN RELY ON RLS
-- Supabase documents postgres_changes as gated by whether the subscriber can SELECT the
-- changed row, which with zero policies should mean nothing is delivered. That is vendor
-- documentation this session did not test, and the REST-based regression suite
-- (e2e/integration/p1048-db-schema.spec.ts) structurally CANNOT test it — it speaks only
-- @supabase/supabase-js .from() calls and never opens a WebSocket. Depending on an
-- untested platform guarantee to protect a table nothing uses is the wrong trade when the
-- dependency can simply be removed. This is epistemic gate 7b applied to the fix itself:
-- the green suite bounded what was modelled, and the realtime channel was never modelled.
--
-- Also revokes the table-level grants, so a future migration that carelessly re-adds a
-- permissive policy does not by itself reopen the table. RLS remains the primary control;
-- this is defense in depth, not a replacement for it.
--
-- DATA IS NOT TOUCHED. The 15 prod rows remain, reachable by service_role as before.
--
-- KNOWN SIDE EFFECT, recorded rather than fixed: clear_explanation_request()
-- (20250101_initial_schema.sql:318, redefined 20251220_explanation_request.sql:11) issues
-- an UPDATE against this table and is NOT declared SECURITY DEFINER, so it runs as the
-- invoking role and is subject to this table's RLS. Since 20260812120000 it matches zero
-- rows for any non-bypassing role — silently, with no error. Unreachable today (its
-- trigger path requires a clarity_verifications INSERT, which requires auth, on a feature
-- with no route). Anyone reviving chat must fix that function before trusting it.
--
-- ROLLBACK: re-add to the publication and re-grant, then re-create the policies dropped by
-- 20260812120000. Nothing here destroys data.
-- ============================================================================

-- Publication membership is not IF EXISTS-able, so guard it to stay rerun-safe.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'clarity_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.clarity_chat_messages;
  END IF;
END $$;

REVOKE ALL ON public.clarity_chat_messages FROM anon, authenticated;
