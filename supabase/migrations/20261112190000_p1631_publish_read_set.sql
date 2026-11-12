-- P1631 publish: the read rule as one small set per statement, computed from the published cards.
-- client-safe: the dropped policies are re-created at once with the same meaning; the revoked function is new here and granted to authenticated
--
-- Measured on TEST with EXPLAIN ANALYZE as a signed-in user reading the public feed (50 newest public points; the index scan
-- passes about 5,600 other rows):
--   20261112150000  `id IN (SELECT point_id FROM chat_shared_point_ids())`: one hashed subplan per statement, ~25 ms, almost all of it
--                   chat_my_access() walking every conversation the reader may see.
--   20261112180000  `visibility = 'private' AND _point_chat_readable_by_me(id)`: 176 ms. Policy conditions run before the query's own
--                   filter (security barrier), so the function ran once for every private row the scan passed.
-- This migration: one hashed subplan per statement again, but built from point_chat_shares (one row per published card) instead of
-- from every conversation: each share's conversation is checked with _chat_access_since, the same rule chat_my_access applies (it adds
-- no other condition). Cost grows with the number of published cards in the whole product, not with the reader's chats or the
-- scanned rows. Known limit: when published cards number in the tens of thousands this set must be narrowed to the reader's
-- conversations (an index on the reader's access), which is a later change.
--
-- new function: _my_chat_shared_point_ids (no earlier body). No existing function is replaced; the three policies are re-created.
-- _point_chat_readable_by_me stays for single-point checks (_point_position_write_ok, story links).
--
-- Rule (unchanged, founder decisions 2026-11-12): a published private point, and the positions on it, are readable by exactly the
-- people who can read a live card carrying it under the chat's own history rule.

BEGIN;

CREATE OR REPLACE FUNCTION public._my_chat_shared_point_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
ROWS 20
AS $$
  SELECT s.point_id
    FROM public.point_chat_shares s
    JOIN public.chat_messages m ON m.id = s.message_id
   WHERE m.deleted_at IS NULL AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id
     AND m.created_at >= COALESCE(public._chat_access_since(s.conversation_id, (SELECT auth.uid())), 'infinity'::timestamptz);
$$;
REVOKE ALL ON FUNCTION public._my_chat_shared_point_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._my_chat_shared_point_ids() TO authenticated;

DROP POLICY IF EXISTS points_select_chat_shared ON public.points;
CREATE POLICY points_select_chat_shared ON public.points FOR SELECT TO authenticated
  USING (visibility = 'private' AND id IN (SELECT public._my_chat_shared_point_ids()));
DROP POLICY IF EXISTS point_positions_select_chat_shared ON public.point_positions;
CREATE POLICY point_positions_select_chat_shared ON public.point_positions FOR SELECT TO authenticated
  USING (point_id IN (SELECT public._my_chat_shared_point_ids()));
DROP POLICY IF EXISTS point_position_history_select_chat_shared ON public.point_position_history;
CREATE POLICY point_position_history_select_chat_shared ON public.point_position_history FOR SELECT TO authenticated
  USING (point_id IN (SELECT public._my_chat_shared_point_ids()));

COMMIT;
