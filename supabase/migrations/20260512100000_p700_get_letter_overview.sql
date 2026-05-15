-- P700: get_letter_overview(p_letter_id UUID)
-- new function
--
-- Returns a single-row aggregated payload for the author's cohort overview page.
-- Author-only (no receiver branch). Any non-author call returns 0 rows silently.
--
-- Decision 9 (Option A): story-level hashtags read live from stories.tags;
-- per-point hashtags read live from points.tags[1]. Decorative drift accepted
-- on the same reasoning that allows live profile lookups in get_letter_results.
-- ONLY tags/hashtag columns are read live — never story title, point text, or order.
--
-- Decision 10: display_name is computed server-side. Raw receiver_email is NOT returned.
--
-- Decision 4: Position labels rendered client-side via POSITION_SHORT_LABELS (all 7 values).

CREATE OR REPLACE FUNCTION get_letter_overview(p_letter_id UUID)
RETURNS TABLE (
  letter          JSONB,   -- { id, title, status, sender_id }
  stories         JSONB,   -- ordered by position: [{ story_id, position, title, hashtags, points: [{ id, text, hashtag, sort_order }] }]
  deliveries      JSONB,   -- [{ delivery_id, display_name, profile_slug, profile_id, has_responded, completed_at }]
  predictions     JSONB,   -- [{ delivery_id, story_id, prediction }]   sender-expected ratings (0-10)
  ratings         JSONB,   -- [{ delivery_id, story_id, listener_rating }]   recipient actual ratings (0-10)
  point_responses JSONB    -- [{ delivery_id, point_id, position }]   recipient positions per point
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id          UUID;
  v_status             TEXT;
  v_letter_json        JSONB;
  v_stories_json       JSONB;
  v_deliveries_json    JSONB;
  v_predictions_json   JSONB;
  v_ratings_json       JSONB;
  v_point_resp_json    JSONB;
  v_snapshot_story_ids UUID[];
BEGIN
  -- ── Step 1: Resolve letter ownership ─────────────────────────────────────
  SELECT cl.sender_id, cl.status
  INTO v_sender_id, v_status
  FROM clarity_letters cl
  WHERE cl.id = p_letter_id;

  -- ── Step 2: Author guard — MANDATORY (SECURITY DEFINER bypasses RLS) ─────
  -- Returns zero rows for: letter not found, not sealed, or caller is not the sender.
  -- No receiver branch — this is author-only with no exception.
  IF v_sender_id IS NULL OR v_sender_id != auth.uid() OR v_status != 'sealed' THEN
    RETURN;
  END IF;

  -- ── Step 3: Build letter JSONB ────────────────────────────────────────────
  SELECT jsonb_build_object(
    'id',        cl.id,
    'title',     cd.title,
    'status',    cl.status,
    'sender_id', cl.sender_id
  )
  INTO v_letter_json
  FROM clarity_letters cl
  JOIN clarity_docs cd ON cd.id = cl.source_doc_id
  WHERE cl.id = p_letter_id;

  -- ── Step 4: Collect snapshot story IDs for scoping later steps ───────────
  SELECT COALESCE(array_agg(lss.story_id), '{}')
  INTO v_snapshot_story_ids
  FROM letter_story_snapshots lss
  WHERE lss.letter_id = p_letter_id;

  -- ── Step 5: Build stories JSONB from snapshots (frozen content) ───────────
  -- Story title and point text come exclusively from letter_story_snapshots.point_config.
  -- Hashtags are read live from stories.tags and points.tags (Option A — Decision 9).
  -- COALESCE to empty array/string so missing live rows omit hashtags silently.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'story_id',  lss.story_id,
        'position',  lss.position,
        'title',     (lss.point_config->>'storyTitle'),
        'hashtags',  COALESCE(s.tags, '{}'),
        'points',    (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',         pt_elem->>'id',
                'text',       pt_elem->>'text',
                'hashtag',    COALESCE(
                                (SELECT p.tags[1]
                                 FROM points p
                                 WHERE p.id = (pt_elem->>'id')::UUID),
                                ''
                              ),
                'sort_order', ordinality - 1
              )
              ORDER BY ordinality
            ),
            '[]'::jsonb
          )
          FROM jsonb_array_elements(
            COALESCE(lss.point_config->'points', '[]'::jsonb)
          ) WITH ORDINALITY AS t(pt_elem, ordinality)
        )
      )
      ORDER BY lss.position
    ),
    '[]'::jsonb
  )
  INTO v_stories_json
  FROM letter_story_snapshots lss
  LEFT JOIN stories s ON s.id = lss.story_id
  WHERE lss.letter_id = p_letter_id;

  -- ── Step 6: Build deliveries JSONB ────────────────────────────────────────
  -- display_name computed server-side — raw receiver_email not returned (Decision 10).
  -- profile_slug from joined profiles (receiver_profile_id may be NULL for email-only).
  -- has_responded = delivery status is 'completed'.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'delivery_id',  ld.id,
        'display_name', COALESCE(
                          NULLIF(ld.receiver_name, ''),
                          NULLIF(p.name, ''),
                          NULLIF(ld.receiver_email, ''),
                          'Anonymous'
                        ),
        'profile_slug',    p.slug,
        'profile_id',      ld.receiver_profile_id,
        'has_responded',   (ld.status = 'completed'),
        'completed_at',    ld.completed_at
      )
      ORDER BY ld.created_at
    ),
    '[]'::jsonb
  )
  INTO v_deliveries_json
  FROM letter_deliveries ld
  LEFT JOIN profiles p ON p.id = ld.receiver_profile_id
  WHERE ld.letter_id = p_letter_id;

  -- ── Step 7: Build predictions JSONB ──────────────────────────────────────
  -- Scoped strictly to this letter's letter_id to prevent cross-letter leaks.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'delivery_id', lp.delivery_id,
        'story_id',    lp.story_id,
        'prediction',  lp.prediction
      )
    ),
    '[]'::jsonb
  )
  INTO v_predictions_json
  FROM letter_predictions lp
  WHERE lp.letter_id = p_letter_id;

  -- ── Step 8: Build ratings JSONB ───────────────────────────────────────────
  -- All recipients' actual understanding ratings from letter responses.
  -- Scoped to this letter's stories and sender (to avoid cross-letter stories).
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'delivery_id',     ld.id,
        'story_id',        sv.story_id,
        'listener_rating', sv.listener_rating
      )
    ),
    '[]'::jsonb
  )
  INTO v_ratings_json
  FROM story_verifications sv
  JOIN letter_deliveries ld
    ON ld.receiver_profile_id = sv.listener_id
    AND ld.letter_id = p_letter_id
  WHERE sv.source = 'letter'
    AND sv.speaker_id = v_sender_id
    AND sv.story_id = ANY(v_snapshot_story_ids);

  -- ── Step 9: Build point_responses JSONB ──────────────────────────────────
  -- All recipients' positions per point, scoped to deliveries of this letter.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'delivery_id', lpr.delivery_id,
        'point_id',    lpr.point_id,
        'position',    lpr.position
      )
    ),
    '[]'::jsonb
  )
  INTO v_point_resp_json
  FROM letter_point_responses lpr
  JOIN letter_deliveries ld ON ld.id = lpr.delivery_id
  WHERE ld.letter_id = p_letter_id;

  -- ── Step 10: Return single row ────────────────────────────────────────────
  RETURN QUERY SELECT
    v_letter_json,
    v_stories_json,
    v_deliveries_json,
    v_predictions_json,
    v_ratings_json,
    v_point_resp_json;
END;
$$;

-- Grant to authenticated only — never anon (overview is author-only)
GRANT EXECUTE ON FUNCTION get_letter_overview(UUID) TO authenticated;
