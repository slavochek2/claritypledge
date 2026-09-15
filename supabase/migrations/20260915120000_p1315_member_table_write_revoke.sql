-- Migration: P1315 — transcribe_room_members accepts writes only through its RPCs
-- Created: 2026-09-15
-- Spec: features/p1315_room_membership_contract.md
--
-- Defense in depth behind 20260908170100_p1236_b_drop_direct_member_insert.sql. With RLS as the only
-- barrier, one future permissive policy — or RLS switched off — would reopen a client write path on
-- this table, because anon and authenticated still hold table-level write privileges from the
-- schema's default grants. Revoking them makes the grant layer refuse too.
--
-- new object: none. Grants only.
--
-- client-safe: no client writes transcribe_room_members. Membership is created and updated only by
--   SECURITY DEFINER RPCs (enter_transcribe_room, join_transcribe_room, create_transcribe_room,
--   end_/touch_transcribe_room_capture), which run as their owner and are unaffected by these grants.
--   The one direct UPDATE (supabase/functions/transcribe-slice/index.ts, touchLastSeen) uses the
--   service role. grep finds no .insert/.update/.delete/.upsert on the table in src/.
--
-- NOT CHANGED: SELECT. The roster read, the realtime channel and the member-scoped child-table
-- policies all read this table as `authenticated`.

REVOKE INSERT, UPDATE, DELETE ON public.transcribe_room_members FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- Verification — has_table_privilege resolves PUBLIC and role inheritance (P1063)
-- ============================================================================
DO $$
DECLARE
  r text;
  p text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH p IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
      IF has_table_privilege(r, 'public.transcribe_room_members', p) THEN
        RAISE EXCEPTION 'P1315: % still holds % on transcribe_room_members', r, p;
      END IF;
    END LOOP;
  END LOOP;

  -- Positive controls: the read path and the server's own write path must survive.
  IF NOT has_table_privilege('authenticated', 'public.transcribe_room_members', 'SELECT') THEN
    RAISE EXCEPTION 'P1315: authenticated lost SELECT on transcribe_room_members — the roster read is dead';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.transcribe_room_members', 'UPDATE') THEN
    RAISE EXCEPTION 'P1315: service_role lost UPDATE on transcribe_room_members — presence writes are dead';
  END IF;

  RAISE NOTICE 'P1315: client roles hold no write privilege on transcribe_room_members.';
END;
$$;
