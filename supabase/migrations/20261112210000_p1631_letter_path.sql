-- Migration: P1631 M2, a point published to a chat cannot be carried into a letter
-- client-safe: both functions keep their signatures, return types and grants; seal_and_send_letter leaves a chat-published point out of the snapshot exactly as it already leaves out a foreign private point (no new payload key, no error), and submit_point_response_by_token answers false for such a point, the same answer it gives for any point that is not in the letter
--
-- The hole. A private point that was published into a chat is meant to have no link: only people who can read the chat card may read it or set a position on it (RESTRICTIVE
-- policies on point_positions, 20261112150000). But the point's author could still put it in a letter. seal_and_send_letter copied the statement of an owned private point into the
-- letter snapshot, and submit_point_response_by_token (SECURITY DEFINER, callable by anon with a letter token) then wrote point_positions as the table owner, which skips the
-- restrictive policy. So a token link showed the point, and people outside the chat set positions that chat members then saw.
--
-- The fix, two marked conditions, each `-- P1631 letter`:
--   1. seal_and_send_letter: a point that has ANY row in point_chat_shares (the closed table that means "was published once", even if the card was deleted) is left out of the
--      snapshot, the same way a foreign private point is. It is not an error and the letter still seals; the snapshot just does not list that point.
--   2. submit_point_response_by_token: a point that has a point_chat_shares row is refused with false before anything is written. This also covers letters sealed before this
--      migration whose snapshot already holds such a point.
--
-- Each replaced function is the newest body copied byte for byte, then the marked lines added. Both functions have exactly one live signature (the three-argument seal overload was
-- dropped in 20260902002000 and the four-argument one re-created in 20261109100000; submit_point_response_by_token has only ever had the three-argument one), so each is handled once.
-- Grants are as the newest file had them.
--
-- diffed against:
--   seal_and_send_letter             20261109133000_p1650_review_fixes.sql
--   submit_point_response_by_token   20260416150000_p714_fix_position_enum_guard.sql

BEGIN;

-- ============================================================================
-- seal_and_send_letter
-- ============================================================================
CREATE OR REPLACE FUNCTION seal_and_send_letter(
  p_letter_id      UUID,
  p_predictions    JSONB DEFAULT '[]'::jsonb,
  p_deliveries     JSONB DEFAULT '[]'::jsonb,
  p_responses_mode TEXT DEFAULT 'invite'
)
RETURNS JSONB
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
  v_delivery_id         UUID;     -- P1650
  v_post_ids            UUID[] := '{}';  -- P1650: deliveries to post a card for, after the seal
  v_post_names          TEXT[] := '{}';  -- P1650 fix: what the sender typed for each of them (NULL = picked from the list)
  v_post_id             UUID;     -- P1650
  v_post_status         TEXT;     -- P1650
  v_skipped             JSONB := '[]'::jsonb;  -- P1650
  v_i                   INTEGER;  -- P1650 fix
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
  LEFT JOIN profiles ap ON ap.id = s.author_id
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
      'storyAuthorName', COALESCE(ap.name, ''),
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
          -- P1515: never copy the statement of a private point the sender does not own. Anyone
          -- may link their own story to a point id they know, so without this a letter would
          -- carry another person's private statement in its snapshot.
          AND (pt.visibility = 'public'::content_visibility OR pt.first_validator_id = v_sender_id)
          -- P1631 letter: a point that was ever published into a chat has no link; it stays out of the snapshot, so no token response can reach it
          AND NOT EXISTS (SELECT 1 FROM public.point_chat_shares pcs WHERE pcs.point_id = pt.id) -- P1631 letter
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
  LEFT JOIN profiles ap ON ap.id = s.author_id
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

    v_delivery_id := NULL; -- P1650: a conflicting insert returns no row; never carry the previous id
    INSERT INTO letter_deliveries (
      letter_id, receiver_email, receiver_name,
      receiver_profile_id, invitation_expires_at,
      created_by_sender -- P1650: the sender made this row
    )
    VALUES (
      p_letter_id,
      v_receiver_email,
      v_del->>'receiver_name',
      v_receiver_profile_id,
      now() + interval '7 days',
      true -- P1650
    )
    ON CONFLICT (letter_id, receiver_email) WHERE receiver_email IS NOT NULL DO NOTHING
    RETURNING id INTO v_delivery_id; -- P1650

    IF v_delivery_id IS NOT NULL AND v_receiver_profile_id IS NOT NULL THEN
      v_post_ids := v_post_ids || v_delivery_id; -- P1650
      -- P1650 fix: the label the sender typed. The typed name, else the typed email; NULL when the sender picked a person
      -- from the list (the email in v_receiver_email was then resolved by the server and must never be returned).
      -- P1650 review: a whitespace-only typed name or email counts as empty.
      v_post_names := v_post_names || COALESCE(NULLIF(btrim(v_del->>'receiver_name'), ''), NULLIF(btrim(v_del->>'receiver_email'), ''))::text;
    END IF;
  END LOOP;

  UPDATE clarity_letters
  SET status = 'sealed', sealed_at = now()
  WHERE id = p_letter_id;

  -- P1650: a card in each invited recipient's 1:1 (one-to-one AND one-to-many letters), after the letter is sealed.
  -- Sealing must never fail because of chat: a failure is a warning and the recipient is reported as skipped.
  FOR v_i IN 1 .. cardinality(v_post_ids)
  LOOP
    v_post_id := v_post_ids[v_i];
    BEGIN
      v_post_status := public._chat_post_letter_delivery(v_post_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'seal_and_send_letter: chat message not posted (%)', SQLERRM;
      v_post_status := 'skipped';
    END;
    IF v_post_status = 'skipped' THEN
      -- P1650 fix: exactly {delivery_id, name}; never a profile id, never a server-resolved email.
      -- P1650 review: never an empty name.
      v_skipped := v_skipped || jsonb_build_array((
        SELECT jsonb_build_object(
                 'delivery_id', d.id,
                 'name', COALESCE(v_post_names[v_i], NULLIF(btrim(pr.name), ''), 'this recipient'))
          FROM letter_deliveries d
          LEFT JOIN profiles pr ON pr.id = d.receiver_profile_id
         WHERE d.id = v_post_id));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('sealed', true, 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION seal_and_send_letter(UUID, JSONB, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION seal_and_send_letter(UUID, JSONB, JSONB, TEXT) TO authenticated;

-- ============================================================================
-- submit_point_response_by_token
-- ============================================================================
CREATE OR REPLACE FUNCTION submit_point_response_by_token(
  p_token UUID,
  p_point_id UUID,
  p_position TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_id UUID;
  v_letter_id   UUID;
BEGIN
  -- NULL guard on p_point_id before any writes
  IF p_point_id IS NULL THEN
    RETURN false;
  END IF;

  -- Enum validation — reject unknown position values cleanly before cast.
  -- IMPORTANT: these must match the actual position_type enum values.
  IF p_position NOT IN (
    'strongly_disagree', 'disagree', 'somewhat_disagree', 'unsure',
    'somewhat_agree', 'agree', 'strongly_agree'
  ) THEN
    RETURN false;
  END IF;

  -- Validate token (expiry check removed in P683; invitation_expires_at gates
  -- session minting only, not engagement writes).
  SELECT ld.id, ld.letter_id INTO v_delivery_id, v_letter_id
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RETURN false;
  END IF;

  -- P684: reject anonymous callers on one-to-many letters (public letters require auth)
  IF (SELECT mode FROM clarity_letters WHERE id = v_letter_id) = 'one-to-many'
     AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required for one-to-many responses';
  END IF;

  -- Authorization guard: p_point_id must be in the letter's sealed point_config.
  -- Uses jsonb_array_elements(point_config->'points') — the immutable snapshot —
  -- NOT a story_points JOIN, which can diverge after seal (point deleted from
  -- story, test fixture missing story_points row, etc.).
  IF NOT EXISTS (
    SELECT 1
    FROM letter_story_snapshots lss,
         jsonb_array_elements(lss.point_config->'points') pt
    WHERE lss.letter_id = v_letter_id
      AND (pt->>'id')::uuid = p_point_id
  ) THEN
    RETURN false;
  END IF;

  -- P1631 letter: a point that was ever published into a chat takes no response through a link (this write runs as the table owner and would skip the chat's position policy)
  IF EXISTS (SELECT 1 FROM public.point_chat_shares pcs WHERE pcs.point_id = p_point_id) THEN -- P1631 letter
    RETURN false; -- P1631 letter
  END IF; -- P1631 letter
  -- Primary write: letter engagement record (idempotent).
  INSERT INTO letter_point_responses (delivery_id, point_id, position)
  VALUES (v_delivery_id, p_point_id, p_position)
  ON CONFLICT DO NOTHING;

  -- P705/P716 dual-write: live display store.
  -- Condition: auth.uid() IS NOT NULL (current caller), not v_receiver_id + is_verified.
  -- This covers the unclaimed-delivery case where receiver_profile_id is still NULL.
  -- SECURITY DEFINER bypasses RLS so both verified and unverified authenticated
  -- users write immediately. Anon callers skip; positions replay via
  -- persist_anonymous_completion at signup.
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO point_positions (point_id, user_id, position)
    VALUES (p_point_id, auth.uid(), p_position::position_type)
    ON CONFLICT (point_id, user_id) DO UPDATE
      SET position = EXCLUDED.position, updated_at = now();
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_point_response_by_token(UUID, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION submit_point_response_by_token(UUID, UUID, TEXT) TO authenticated;

COMMIT;
