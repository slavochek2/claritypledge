-- client-safe: removes public.point_share_to_chat(uuid, uuid, uuid, uuid), which no client or edge function calls (it had no grant to any client role since 20261112170000)
-- Migration: P1631 drop the unused re-share function
-- Created: 2026-11-13
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md
-- Guaranteed by: src/tests/p1631-drop-reshare-migration.test.ts (source contract), src/tests/integration/p1631-publish.test.ts
--
-- Founder decision 2026-11-13 (spec Open Question 7): no private point is forwarded by anyone, the author included. Forward of a private point stays refused
-- (20261112150000_p1631_publish_to_chat.sql, the forward guard). No other function or policy calls this function (searched supabase/migrations).

DROP FUNCTION IF EXISTS public.point_share_to_chat(uuid, uuid, uuid, uuid);
