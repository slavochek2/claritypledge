-- Migration: P1631 A9, Publish to chat: read cost of the chat-shared read policies
--
-- Measured on TEST with EXPLAIN ANALYZE as an authenticated user: the SELECT policies of 20261112150000_p1631_publish_to_chat.sql
-- (`id IN (SELECT point_id FROM public.chat_shared_point_ids())`) make Postgres build that hashed subplan once per statement for EVERY authenticated read of points,
-- point_positions and point_position_history. chat_shared_point_ids -> chat_my_access walks all of the caller's conversations: about 25 ms per statement, even for the
-- public feed, where no row is private and the set is never needed.
--
-- The fix is a per-row test with an early exit. _point_chat_readable_by_me(p_point) starts from the point_chat_shares index on (point_id): a point that was never published
-- costs one index probe and returns false, with no scan of the caller's chats. Only a published point goes on to the chat_messages primary key and one _chat_access_since
-- call per share row of THAT point. In the points policy it also sits behind `visibility = 'private'`, so public rows never reach it.
--
-- Semantics are exactly "p_point IN (SELECT point_id FROM chat_shared_point_ids())":
--   chat_my_access() = _chat_my_conversations(auth.uid()) = the candidate conversations (dm, mirror, group, event) whose _chat_access_since(conversation, uid) IS NOT NULL.
--   _chat_access_since is itself the full rule (dm: participant, mirror: owner, group: accepted membership, event: host or RSVP inside the grace window), and every conversation it
--   answers non-NULL for is a candidate, so calling it directly on the share's conversation gives the same `since`; NULL (not a member) is COALESCEd to 'infinity', which no
--   created_at reaches. chat_my_access adds no other condition (no blocked-user or conversation-state test). The live-card test and `m.created_at >= since` are copied unchanged.
--
-- chat_shared_point_ids() and list_chat_points are NOT changed: their callers are per conversation or per list, where the set is wanted.
--
-- diffed against:
--   _point_position_write_ok 20261112170000_p1631_publish_fixes.sql
--   points_select_chat_shared, point_positions_select_chat_shared, point_position_history_select_chat_shared 20261112150000_p1631_publish_to_chat.sql
--   story_points_insert_chat_shared 20261112170000_p1631_publish_fixes.sql (calls _point_position_write_ok; its definition is unchanged and not restated)
--   (point_chat_shared, 20261112170000, still reads chat_shared_point_ids() behind a short-circuit; it is a single-point RPC and is left alone.)
--
-- client-safe: _point_chat_readable_by_me answers only for auth.uid() and takes no uid, so it cannot be used to look at anyone else; it returns a boolean about a point the
--   caller names, which the caller learns anyway by reading the point.

BEGIN;

CREATE OR REPLACE FUNCTION public._point_chat_readable_by_me(p_point uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.point_chat_shares s
      JOIN public.chat_messages m ON m.id = s.message_id
     WHERE s.point_id = p_point
       AND m.deleted_at IS NULL AND m.attachment_kind = 'point' AND m.attachment_id = s.point_id
       AND m.created_at >= COALESCE(public._chat_access_since(s.conversation_id, (SELECT auth.uid())), 'infinity'::timestamptz)
  );
$$;
REVOKE ALL ON FUNCTION public._point_chat_readable_by_me(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._point_chat_readable_by_me(uuid) TO authenticated;

DROP POLICY IF EXISTS points_select_chat_shared ON public.points;
CREATE POLICY points_select_chat_shared ON public.points FOR SELECT TO authenticated
  USING (visibility = 'private' AND public._point_chat_readable_by_me(id));
DROP POLICY IF EXISTS point_positions_select_chat_shared ON public.point_positions;
CREATE POLICY point_positions_select_chat_shared ON public.point_positions FOR SELECT TO authenticated
  USING (public._point_chat_readable_by_me(point_id));
DROP POLICY IF EXISTS point_position_history_select_chat_shared ON public.point_position_history;
CREATE POLICY point_position_history_select_chat_shared ON public.point_position_history FOR SELECT TO authenticated
  USING (public._point_chat_readable_by_me(point_id));

-- True for every point that was never published, for its author, and for the people the point is shared with. The policy expression runs as the caller, so it needs the grant.
CREATE OR REPLACE FUNCTION public._point_position_write_ok(p_point uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE -- P1631 publish fixes: chat_shared_point_ids() runs only for a published point and a caller who is not its owner
    WHEN NOT EXISTS (SELECT 1 FROM public.point_chat_shares s WHERE s.point_id = p_point) THEN true -- P1631 publish fixes
    WHEN EXISTS (SELECT 1 FROM public.points p WHERE p.id = p_point AND p.first_validator_id = auth.uid()) THEN true -- P1631 publish fixes
    ELSE public._point_chat_readable_by_me(p_point) -- P1631 read cost
  END; -- P1631 publish fixes
$$;
REVOKE ALL ON FUNCTION public._point_position_write_ok(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._point_position_write_ok(uuid) TO authenticated;

COMMIT;
