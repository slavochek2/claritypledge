-- client-safe: one new read-only function; no table, column, policy or existing function changes.
-- Migration: P1631 in-chat Clarify review fix (one batched read of draft counts per open Mirror conversation, instead of one get_clarify_thread per Clarify root row)
-- Created: 2026-11-11
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md
-- Guaranteed by: src/tests/integration/p1631-clarify-drafts.test.ts (behaviour on the test database)
--
-- diffed against:
--   get_clarify_thread(uuid)  20261110153000_p1631_clarify_drafts.sql (its newest definition): same owner predicate (`d.owner_id = auth.uid()`), same table (public.clarify_drafts), same
--                             unauthenticated refusal; this function groups by thread_root_id over one Mirror conversation instead of reading one thread.
--
-- Changes:
--   new function: clarify_draft_counts(p_conversation uuid) -> jsonb object { "<thread_root_id>": <count of the caller's drafts in that thread> }. Only the caller's own drafts are counted
--   (a drafts row is deleted for real, so every row is a live draft); another user, or a conversation with none, gets '{}'.

CREATE OR REPLACE FUNCTION public.clarify_draft_counts(p_conversation uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_object_agg(t.thread_root_id::text, t.n)
      FROM (
        SELECT d.thread_root_id, count(*)::int AS n
          FROM public.clarify_drafts d
         WHERE d.mirror_conversation_id = p_conversation AND d.owner_id = v_uid
         GROUP BY d.thread_root_id
      ) t), '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_draft_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clarify_draft_counts(uuid) TO authenticated;
