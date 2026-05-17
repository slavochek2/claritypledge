-- diffed against: 20260517110000_p843_letter_overview_filter_and_avatars.sql
-- P843 follow-up: also filter v_point_resp_json by the same hidden/superseded
-- predicate. Without this, the payload still contains responses for points
-- whose columns were filtered out of v_stories_json — leaky contract that
-- future aggregate consumers (counts, percentages) would compute wrong.
-- Visible-point filter mirrors the one in v_stories_json points subquery.

CREATE OR REPLACE FUNCTION get_letter_overview(p_letter_id UUID)
RETURNS TABLE (
  letter          JSONB,
  stories         JSONB,
  deliveries      JSONB,
  predictions     JSONB,
  ratings         JSONB,
  point_responses JSONB
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
  v_visible_point_ids  UUID[];
BEGIN
  SELECT cl.sender_id, cl.status
  INTO v_sender_id, v_status
  FROM clarity_letters cl
  WHERE cl.id = p_letter_id;

  IF v_sender_id IS NULL OR v_sender_id != auth.uid() OR v_status != 'sealed' THEN
    RETURN;
  END IF;

  SELECT jsonb_build_object(
    'id',        cl.id,
    'title',     cd.title,
    'status',    cl.status,
    'sender_id', cl.sender_id,
    'sender',    jsonb_build_object(
      'profile_id',  sp.id,
      'name',        COALESCE(NULLIF(sp.name, ''), 'Author'),
      'slug',        sp.slug,
      'avatar_url',  sp.avatar_url,
      'has_pledged', COALESCE(sp.has_pledged, false)
    )
  )
  INTO v_letter_json
  FROM clarity_letters cl
  JOIN clarity_docs cd ON cd.id = cl.source_doc_id
  LEFT JOIN profiles sp ON sp.id = cl.sender_id
  WHERE cl.id = p_letter_id;

  SELECT COALESCE(array_agg(lss.story_id), '{}')
  INTO v_snapshot_story_ids
  FROM letter_story_snapshots lss
  WHERE lss.letter_id = p_letter_id;

  -- Compute the set of visible point IDs once. Reused by v_stories_json and v_point_resp_json
  -- so both views agree on which points exist for this letter.
  SELECT COALESCE(array_agg(DISTINCT (pt_elem->>'id')::UUID), '{}')
  INTO v_visible_point_ids
  FROM letter_story_snapshots lss,
       LATERAL jsonb_array_elements(
         COALESCE(lss.point_config->'points', '[]'::jsonb)
       ) AS pt_elem
  WHERE lss.letter_id = p_letter_id
    AND COALESCE((pt_elem->>'hidden')::boolean, false) IS NOT TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(
        COALESCE(lss.point_config->'hidden', '[]'::jsonb)
      ) AS hid(id)
      WHERE hid.id = (pt_elem->>'id')
    )
    AND NOT EXISTS (
      SELECT 1 FROM points p
      WHERE p.id = (pt_elem->>'id')::UUID
        AND p.superseded_by IS NOT NULL
    );

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'story_id',  lss.story_id,
        'position',  lss.position,
        'title',     (lss.point_config->>'storyTitle'),
        'content',   COALESCE(lss.point_config->>'storyText', ''),
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
          WHERE (pt_elem->>'id')::UUID = ANY(v_visible_point_ids)
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

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'delivery_id',  ld.id,
        'display_name', COALESCE(
                          NULLIF(ld.receiver_name, ''),
                          NULLIF(p.name, ''),
                          NULLIF(ld.receiver_email, ''),
                          'Recipient'
                        ),
        'full_display_name', COALESCE(
                          NULLIF(p.name, ''),
                          NULLIF(ld.receiver_name, ''),
                          NULLIF(ld.receiver_email, ''),
                          'Recipient'
                        ),
        'profile_slug',    p.slug,
        'profile_id',      ld.receiver_profile_id,
        'avatar_url',      p.avatar_url,
        'has_pledged',     COALESCE(p.has_pledged, false),
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

  -- Only include responses for points that survive the visibility filter.
  -- Without this, the payload would leak responses for hidden/superseded points
  -- whose columns are no longer rendered.
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
  WHERE ld.letter_id = p_letter_id
    AND lpr.point_id = ANY(v_visible_point_ids);

  RETURN QUERY SELECT
    v_letter_json,
    v_stories_json,
    v_deliveries_json,
    v_predictions_json,
    v_ratings_json,
    v_point_resp_json;
END;
$$;

GRANT EXECUTE ON FUNCTION get_letter_overview(UUID) TO authenticated;
