-- P1583: letters sent to me show "N of M steps" on Artifacts.
-- diffed against: 20261023110000_p1545_chat_letter_delivery_id.sql (get_received_letters_page, latest definition)
-- client-safe: additive columns; existing clients ignore them
-- The function returns jsonb (not RETURNS TABLE), so CREATE OR REPLACE suffices: signature and grants unchanged.
-- The two keys reuse the sender-side expression from get_deliveries_with_progress (latest:
-- 20261027150000_p1545_sender_seen.sql), schema-qualified because this function runs with search_path = '',
-- with ONE deliberate deviation: jsonb_array_length is guarded by jsonb_typeof(...) = 'array' (the
-- p705 null-safe pattern), so a single snapshot whose point_config->'points' is not an array cannot
-- error the whole received page. The sender side keeps the unguarded form (pre-existing, unchanged here).

-- Received letters, one page at a time (Shared with you)
-- ============================================================================
-- The same rows and the same filter as get_inbox_items branch 1 (a delivery to me, not self-sent), with the
-- same SECURITY DEFINER read of the source doc title (clarity_docs RLS would hide a private doc from the
-- receiver). Keyset order is (created_at DESC, id DESC): pass the last row's timestamp and delivery_id to get
-- the next page. p_limit is clamped to 1..200.
CREATE OR REPLACE FUNCTION public.get_received_letters_page(
  p_limit     int         DEFAULT 100,
  p_before_ts timestamptz DEFAULT NULL,
  p_before_id uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT COALESCE(jsonb_agg(page.item ORDER BY page.created_at DESC, page.id DESC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT ld.created_at, ld.id,
             jsonb_build_object(
               'type',         'received',
               'delivery_id',  ld.id,
               'letter_id',    ld.letter_id,
               'title',        COALESCE(cd.title, 'Untitled'),
               'actor_name',   COALESCE(p.name, 'Someone'),
               'actor_slug',   p.slug,
               'timestamp',    ld.created_at,
               'read_at',      ld.read_at,
               'completed_at', ld.completed_at,
               'steps_completed', LEAST(
                 COALESCE(ld.stories_rated, 0) + (
                   SELECT COUNT(*)
                   FROM public.letter_point_responses lpr
                   WHERE lpr.delivery_id = ld.id
                 ),
                 (SELECT COUNT(*) FROM public.letter_story_snapshots lss WHERE lss.letter_id = ld.letter_id) +
                 COALESCE(
                   (SELECT SUM(CASE WHEN jsonb_typeof(lss2.point_config->'points') = 'array' THEN jsonb_array_length(lss2.point_config->'points') END)
                    FROM public.letter_story_snapshots lss2
                    WHERE lss2.letter_id = ld.letter_id),
                   0
                 )
               ),
               'total_steps', (
                 (SELECT COUNT(*) FROM public.letter_story_snapshots lss WHERE lss.letter_id = ld.letter_id) +
                 COALESCE(
                   (SELECT SUM(CASE WHEN jsonb_typeof(lss2.point_config->'points') = 'array' THEN jsonb_array_length(lss2.point_config->'points') END)
                    FROM public.letter_story_snapshots lss2
                    WHERE lss2.letter_id = ld.letter_id),
                   0
                 )
               )
             ) AS item
        FROM public.letter_deliveries ld
        JOIN public.clarity_letters cl ON cl.id = ld.letter_id
        JOIN public.clarity_docs cd    ON cd.id = cl.source_doc_id
        JOIN public.profiles p         ON p.id  = cl.sender_id
       WHERE ld.receiver_profile_id = v_uid
         AND cl.sender_id <> v_uid
         AND (p_before_ts IS NULL OR (ld.created_at, ld.id) < (p_before_ts, COALESCE(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
       ORDER BY ld.created_at DESC, ld.id DESC
       LIMIT v_limit
    ) page;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_received_letters_page(int, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_received_letters_page(int, timestamptz, uuid) TO authenticated;
