-- diffed against: 20260823120100_p1141_seal_rpc_video_fields.sql
-- P1212 §4b: the sealed-letter snapshot carries the STORY's own author id.
--
-- WHY. The snapshot recorded storyText, imageUrl, videoUrl, videoQuotes and per-point
-- data — and no story author id, name or agent flag. The letter surface therefore
-- derived its byline from the value the caller passes into the mapper, which is the
-- letter's SENDER (story-walk.tsx:95-96 states the assumption in a comment: "Author of
-- the story = sender"). That is sound for a sender's own stories, the only ones
-- doc_stories INSERT lets them attach (p551_clarity_docs.sql:92-105) — but it left the
-- surface unable to tell a machine-authored reading from a human's, so it rendered
-- every letter story as a person's. A service-role write, which the disagreement
-- pipeline uses, bypasses that RLS entirely.
--
-- CREATE OR REPLACE on top of the P1141 body VERBATIM. P1141 is the CURRENT definition,
-- not merely a recent one; rebuilding from any older base is the regression
-- sd-guard-completeness.test.ts exists to catch, and it has caught exactly that on this
-- function twice (P952 dropped P914's relationship-scope gate; P749/P757 and P833 each
-- dropped 'imageUrl'). The ONLY change below is one added key.
--
-- No backfill. Every letter sealed before this legitimately has no storyAuthorId, and
-- absent is the correct value rather than a gap: the mapper reads it as an empty author
-- id, the agent registry answers "not an agent", and the letter renders exactly as it
-- rendered before. The alternative — inferring agent-ness from the sender's NAME — would
-- attribute machine-written prose to a named human, which is the one outcome this
-- surface must never produce.
--
-- ::text because the mapper reads it as a string; jsonb_build_object would otherwise
-- emit a bare uuid whose JSON form is already a string, but the cast makes the contract
-- explicit at the boundary rather than implicit in the driver.

CREATE OR REPLACE FUNCTION seal_and_send_letter(
  p_letter_id      UUID,
  p_predictions    JSONB DEFAULT '[]'::jsonb,
  p_deliveries     JSONB DEFAULT '[]'::jsonb,
  p_responses_mode TEXT DEFAULT 'invite'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id           UUID;
  v_sender_email        TEXT;
  v_mode                TEXT;
  v_letter_status       TEXT;
  v_source_doc_id       UUID;
  v_pred                JSONB;
  v_del                 JSONB;
  v_receiver_email      TEXT;
  v_receiver_profile_id UUID;
  v_desynced_stories    TEXT;
  v_is_admin            BOOLEAN;  -- P975 (restored from P914)
BEGIN
  -- Validate p_responses_mode before any writes (don't rely on CHECK for error message)
  IF p_responses_mode NOT IN ('off', 'invite', 'push') THEN
    RAISE EXCEPTION 'Invalid responses_mode: %. Must be one of: off, invite, push', p_responses_mode;
  END IF;

  SELECT sender_id, mode, status, source_doc_id
  INTO v_sender_id, v_mode, v_letter_status, v_source_doc_id
  FROM clarity_letters
  WHERE id = p_letter_id;

  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Letter not found: %', p_letter_id;
  END IF;

  IF v_sender_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the letter sender can seal this letter';
  END IF;

  IF v_letter_status != 'draft' THEN
    RAISE EXCEPTION 'Letter is already sealed or expired (status: %)', v_letter_status;
  END IF;

  SELECT email INTO v_sender_email
  FROM auth.users
  WHERE id = v_sender_id;

  -- P975 (restored from P914): resolve admin bypass once, up front.
  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
  FROM profiles p
  WHERE p.id = v_sender_id;

  -- P833: pre-flight desync check.
  SELECT string_agg(s.id::text, ', ' ORDER BY s.id)
  INTO v_desynced_stories
  FROM doc_stories ds
  JOIN stories s ON s.id = ds.story_id
  LEFT JOIN story_versions sv
    ON sv.story_id = s.id AND sv.version_number = s.current_version
  WHERE ds.doc_id = v_source_doc_id
    AND (v_mode = 'one-to-one' OR s.visibility = 'public'::content_visibility)
    AND sv.id IS NULL;

  IF v_desynced_stories IS NOT NULL THEN
    RAISE EXCEPTION
      'seal_and_send_letter: story_versions desync for story_id(s): % — run backfill before sealing',
      v_desynced_stories;
  END IF;

  -- P952 AD-2: write responses_mode in-transaction, after ownership check
  UPDATE clarity_letters
  SET responses_mode = p_responses_mode
  WHERE id = p_letter_id;

  INSERT INTO letter_story_snapshots (letter_id, story_id, version_id, position, point_config, visibility)
  SELECT
    p_letter_id,
    ds.story_id,
    sv.id,
    ds.position,
    jsonb_build_object(
      'storyText', COALESCE(sv.content, ''),
      'imageUrl', COALESCE(s.image_url, ''),
      'videoUrl', COALESCE(s.video_url, ''),
      'videoQuotes', COALESCE(s.video_quotes, '{"quotes": [], "durationSeconds": null}'::jsonb),
      'storyAuthorId', s.author_id::text,
      'points', COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'id', pt.id::text,
            'text', pt.statement,
            'authorPosition', (
              SELECT pp.position::text
              FROM point_positions pp
              WHERE pp.point_id = pt.id AND pp.user_id = v_sender_id
              LIMIT 1
            ),
            'visibility', pt.visibility::text,
            'hidden', COALESCE((ds.point_config->'hidden')::jsonb ? pt.id::text, false)
          ) ORDER BY sp.created_at
        )
        FROM story_points sp
        JOIN points pt ON pt.id = sp.point_id
        WHERE sp.story_id = ds.story_id
          AND pt.superseded_by IS NULL
        ), '[]'::jsonb
      ),
      'order', COALESCE(ds.point_config->'order', '[]'::jsonb),
      'hidden', COALESCE(ds.point_config->'hidden', '[]'::jsonb),
      'lead_count', CASE
        WHEN jsonb_typeof(ds.point_config->'lead_count') = 'number'
          THEN to_jsonb(GREATEST(0, floor((ds.point_config->>'lead_count')::numeric)::int))
        ELSE '1'::jsonb
      END
    ),
    s.visibility::text
  FROM doc_stories ds
  JOIN stories s ON s.id = ds.story_id
  JOIN story_versions sv ON sv.story_id = s.id AND sv.version_number = s.current_version
  WHERE ds.doc_id = v_source_doc_id
    AND (v_mode = 'one-to-one' OR s.visibility = 'public'::content_visibility)
  ON CONFLICT (letter_id, story_id) DO NOTHING;

  FOR v_pred IN SELECT * FROM jsonb_array_elements(p_predictions)
  LOOP
    INSERT INTO letter_predictions (letter_id, delivery_id, story_id, prediction)
    VALUES (
      p_letter_id,
      CASE WHEN v_pred->>'delivery_id' IS NOT NULL
        THEN (v_pred->>'delivery_id')::UUID
        ELSE NULL
      END,
      (v_pred->>'story_id')::UUID,
      (v_pred->>'prediction')::INTEGER
    )
    ON CONFLICT ON CONSTRAINT letter_predictions_unique DO NOTHING;
  END LOOP;

  FOR v_del IN SELECT * FROM jsonb_array_elements(p_deliveries)
  LOOP
    v_receiver_email := v_del->>'receiver_email';
    v_receiver_profile_id := NULLIF(v_del->>'receiver_profile_id', '')::UUID;

    IF v_receiver_email IS NULL AND v_receiver_profile_id IS NOT NULL THEN
      IF v_receiver_profile_id = v_sender_id THEN
        RAISE EXCEPTION 'Cannot send a letter to yourself (receiver matches sender)';
      END IF;
      -- P975 (restored from P914): relationship-scope gate. A non-admin sender may
      -- only resolve the email of a profile inside their relationship scope. Blocks
      -- the email-harvesting oracle that the gateless P952 4-arg overload reopened.
      -- NOT EXISTS (never NOT IN): a NULL in the scope set would make NOT IN return
      -- NULL (treated as not-true), silently failing open.
      IF NOT v_is_admin
         AND NOT EXISTS (
           SELECT 1 FROM public.p878_relationship_scope(v_sender_id) s
           WHERE s = v_receiver_profile_id
         ) THEN
        RAISE EXCEPTION 'Recipient is not in your relationship scope';
      END IF;
      SELECT email INTO v_receiver_email
      FROM profiles
      WHERE id = v_receiver_profile_id;
      IF v_receiver_email IS NULL THEN
        RAISE EXCEPTION 'Recipient profile has no resolvable email';
      END IF;
    ELSIF v_receiver_email IS NOT NULL THEN
      IF v_receiver_email = v_sender_email THEN
        RAISE EXCEPTION 'Cannot send a letter to yourself (receiver_email matches sender)';
      END IF;
      v_receiver_profile_id := NULL;
      SELECT id INTO v_receiver_profile_id
      FROM profiles
      WHERE lower(email) = lower(v_receiver_email)
      LIMIT 1;
    END IF;

    INSERT INTO letter_deliveries (
      letter_id, receiver_email, receiver_name,
      receiver_profile_id, invitation_expires_at
    )
    VALUES (
      p_letter_id,
      v_receiver_email,
      v_del->>'receiver_name',
      v_receiver_profile_id,
      now() + interval '7 days'
    )
    ON CONFLICT (letter_id, receiver_email) WHERE receiver_email IS NOT NULL DO NOTHING;
  END LOOP;

  UPDATE clarity_letters
  SET status = 'sealed', sealed_at = now()
  WHERE id = p_letter_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION seal_and_send_letter(UUID, JSONB, JSONB, TEXT) TO authenticated;
