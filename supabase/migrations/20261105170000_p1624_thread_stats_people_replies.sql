-- client-safe: same name and arguments; the two new output columns are additive, and deployed clients read the old columns by name.
-- P1624: a transcript's row in the chat shows only people's replies, while every other thread keeps
-- its count. Round and table threads also hold transcript text, and their "N replies" link draws
-- nothing at 0, so reply_count and recent_author_ids keep their meaning and two values are added.
-- Diffed against: 20261022160000_p1546_threads_everywhere.sql (get_thread_stats). Only the new
-- output columns and the CTEs that fill them differ. A mirror agent's reply counts: only
-- is_transcription rows are left out, and the count does not depend on author_id.
-- DROP is required because CREATE OR REPLACE cannot change a return type.
DROP FUNCTION IF EXISTS public.get_thread_stats(uuid, uuid[]);
CREATE FUNCTION public.get_thread_stats(p_conversation uuid, p_roots uuid[])
RETURNS TABLE (root_id uuid, reply_count integer, recent_author_ids uuid[], people_reply_count integer, people_author_ids uuid[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid   uuid := auth.uid();
  v_since timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  v_since := public._chat_access_since(p_conversation, v_uid);
  IF v_since IS NULL THEN
    RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(cardinality(p_roots), 0) > 100 THEN
    RAISE EXCEPTION 'chat: at most 100 threads per call' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(cardinality(p_roots), 0) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH roots AS (
    SELECT m.id AS rid FROM public.chat_messages m
     WHERE m.id = ANY(p_roots) AND m.conversation_id = p_conversation
       AND m.thread_root_id IS NULL AND m.created_at >= v_since
  ), replies AS (
    SELECT m.thread_root_id AS rid, m.author_id, m.created_at, m.is_transcription
      FROM public.chat_messages m
     WHERE m.conversation_id = p_conversation
       AND m.thread_root_id IN (SELECT r.rid FROM roots r)
       AND m.deleted_at IS NULL AND m.created_at >= v_since
  ), counts AS (
    SELECT x.rid, count(*)::integer AS n,
           (count(*) FILTER (WHERE NOT x.is_transcription))::integer AS people_n
      FROM replies x GROUP BY x.rid
  ), recent AS (
    SELECT x.rid, x.author_id, max(x.created_at) AS last_at
      FROM replies x WHERE x.author_id IS NOT NULL GROUP BY x.rid, x.author_id
  ), ranked AS (
    SELECT y.rid, y.author_id, row_number() OVER (PARTITION BY y.rid ORDER BY y.last_at DESC, y.author_id) AS rn
      FROM recent y
  ), people_recent AS (
    SELECT x.rid, x.author_id, max(x.created_at) AS last_at
      FROM replies x WHERE x.author_id IS NOT NULL AND NOT x.is_transcription GROUP BY x.rid, x.author_id
  ), people_ranked AS (
    SELECT y.rid, y.author_id, row_number() OVER (PARTITION BY y.rid ORDER BY y.last_at DESC, y.author_id) AS rn
      FROM people_recent y
  )
  SELECT r.rid,
         COALESCE(c.n, 0),
         COALESCE((SELECT array_agg(k.author_id ORDER BY k.rn) FROM ranked k WHERE k.rid = r.rid AND k.rn <= 3),
                  '{}'::uuid[]),
         COALESCE(c.people_n, 0),
         COALESCE((SELECT array_agg(k.author_id ORDER BY k.rn) FROM people_ranked k WHERE k.rid = r.rid AND k.rn <= 3),
                  '{}'::uuid[])
    FROM roots r
    LEFT JOIN counts c ON c.rid = r.rid;
END;
$$;
REVOKE ALL ON FUNCTION public.get_thread_stats(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_thread_stats(uuid, uuid[]) TO authenticated;
