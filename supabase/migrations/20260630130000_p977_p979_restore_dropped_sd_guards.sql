-- P977/P978/P979: restore three SECURITY DEFINER guards silently dropped by
-- prior recreate-from-older-base migrations (the P952 regression class).
--
-- Each function below is recreated from its CURRENT (latest) body with the
-- lost guard re-applied — every other intentional change (P964 delivery-scope,
-- P684 anon/one-to-many auth guard, P683 expiry-check drop) is preserved.
--
--  P977  get_letter_position_stories     re-add two-participant author whitelist
--        (dropped by P964 20260626120000). Confines returned position-stories to
--        the delivery's sender+receiver; without it a third party's story on a
--        shared snapshot point leaks to the caller (SECURITY DEFINER bypasses RLS,
--        so a private third-party story would leak too).
--
--  P978  reveal_prediction_by_token      re-add per-listener + snapshot-scoped
--        sealed-bid gate (dropped by P683 20260411201933, reverting P651). The
--        un-scoped gate unlocked the sender's prediction as soon as ANY listener
--        rated the story; restore so a caller sees the prediction only after
--        THEIR OWN rating within this letter's snapshot.
--
--  P979  update_delivery_status_by_token re-add forward-only (monotonic) rank
--        guard (dropped by P683 20260411201933, reverting P651). Backward
--        transitions (e.g. completed → opened) become no-ops again.
--
-- diffed against: 20260626120000_p964_position_stories_delivery_scope.sql  (get_letter_position_stories)
-- diffed against: 20260412000001_p684_anon_rpc_auth_guard.sql  (reveal_prediction_by_token, update_delivery_status_by_token)
-- client-safe: the REVOKE/GRANT below merely re-states P964's existing grants
--   (authenticated keeps EXECUTE; public/anon were already revoked by P964). No
--   change to client reachability or call signature — deployed clients unaffected.
-- --------------------------------------------------------------------------

-- ============================================================================
-- P977: get_letter_position_stories — restore two-participant author whitelist
-- on top of the current P964 body (keeps both P964 fixes).
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_letter_position_stories(UUID);

CREATE FUNCTION public.get_letter_position_stories(p_delivery_id UUID)
RETURNS TABLE(
  point_id            UUID,
  story_id            UUID,
  author_id           UUID,
  author_name         TEXT,
  author_avatar_url   TEXT,
  author_avatar_color TEXT,
  author_has_pledged  BOOLEAN,
  content             TEXT,
  tags                TEXT[],
  created_at          TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_letter_id   UUID;
  v_sender_id   UUID;
  v_receiver_id UUID;
BEGIN
  IF NOT public._is_letter_participant(p_delivery_id) THEN
    RETURN;
  END IF;

  SELECT ld.letter_id, cl.sender_id, ld.receiver_profile_id
  INTO v_letter_id, v_sender_id, v_receiver_id
  FROM public.letter_deliveries ld
  JOIN public.clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.id = p_delivery_id;

  IF v_letter_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    sp.point_id,
    sp.story_id,
    sp.author_id,
    pr.name         AS author_name,
    pr.avatar_url   AS author_avatar_url,
    pr.avatar_color AS author_avatar_color,
    pr.has_pledged  AS author_has_pledged,
    s.content,
    s.tags,
    s.created_at
  FROM public.story_points sp
  JOIN public.stories s   ON s.id  = sp.story_id
  JOIN public.profiles pr ON pr.id = sp.author_id
  WHERE sp.point_id IN (
    SELECT DISTINCT (pt->>'id')::UUID
    FROM public.letter_story_snapshots lss
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(lss.point_config->'points', '[]'::jsonb)
    ) AS pt
    WHERE lss.letter_id = v_letter_id
      AND (pt->>'id') IS NOT NULL
  )
  -- P977: restored P904 two-participant bound. The SECURITY DEFINER bypass means
  -- this WHERE clause is the only thing confining rows to the letter's two
  -- participants — without it an unrelated third party's story (incl. private)
  -- on a shared point leaks. Prevents leaking stories from users who merely
  -- filed on the same point outside this letter.
  AND sp.author_id IN (v_sender_id, v_receiver_id)
  -- P964 D3 (#2): exclude sender's stories server-side.
  AND sp.author_id != v_sender_id
  -- P964 D3 (#1): delivery-scope receiver stories via letter_point_responses.
  -- A receiver story is valid for THIS delivery only if the receiver has a
  -- point-response row for (delivery_id, point_id). A reused point from a
  -- different delivery won't have a matching lpr row → filtered out.
  AND (
    sp.author_id != v_receiver_id
    OR EXISTS (
      SELECT 1 FROM public.letter_point_responses lpr
      WHERE lpr.delivery_id = p_delivery_id
        AND lpr.point_id = sp.point_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_letter_position_stories(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_letter_position_stories(UUID) TO authenticated;

-- ============================================================================
-- P978: reveal_prediction_by_token — restore P651 per-listener + snapshot-scoped
-- sealed-bid gate on top of the current P684 body (keeps P684 mode guard +
-- P683 expiry-check drop).
-- ============================================================================
CREATE OR REPLACE FUNCTION reveal_prediction_by_token(
  p_token UUID,
  p_story_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_id UUID;
  v_letter_id   UUID;
  v_sender_id   UUID;
  v_receiver_id UUID;
  v_prediction  INTEGER;
BEGIN
  -- Validate token (expiry predicate removed — see P683 migration header)
  SELECT ld.id, ld.letter_id, cl.sender_id, ld.receiver_profile_id
  INTO v_delivery_id, v_letter_id, v_sender_id, v_receiver_id
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- P684: reject anonymous callers on one-to-many letters only
  IF (SELECT mode FROM clarity_letters WHERE id = v_letter_id) = 'one-to-many'
     AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required for one-to-many responses';
  END IF;

  -- P978 (restored P651): sealed-bid gate scoped to THIS delivery's listener and
  -- this letter's snapshot. A co-recipient's rating, or a rating of the same
  -- story under a different letter, must NOT unlock the reveal.
  IF v_receiver_id IS NOT NULL THEN
    -- Authenticated path: caller must have rated as this delivery's receiver.
    IF NOT EXISTS (
      SELECT 1 FROM story_verifications sv
      JOIN letter_story_snapshots lss ON lss.story_id = sv.story_id AND lss.letter_id = v_letter_id
      WHERE sv.story_id = p_story_id
        AND sv.listener_id = v_receiver_id
        AND sv.speaker_id = v_sender_id
        AND sv.source = 'letter'
    ) THEN
      RETURN NULL;
    END IF;
  ELSE
    -- Anon path: caller must have rated as the token user (auth.uid() or sentinel).
    IF NOT EXISTS (
      SELECT 1 FROM story_verifications sv
      JOIN letter_story_snapshots lss ON lss.story_id = sv.story_id AND lss.letter_id = v_letter_id
      WHERE sv.story_id = p_story_id
        AND sv.speaker_id = v_sender_id
        AND sv.source = 'letter'
        AND sv.listener_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Return prediction scoped to this delivery
  SELECT lp.prediction INTO v_prediction
  FROM letter_predictions lp
  WHERE lp.letter_id = v_letter_id
    AND lp.story_id = p_story_id
    AND (lp.delivery_id = v_delivery_id OR lp.delivery_id IS NULL)
  ORDER BY CASE WHEN lp.delivery_id = v_delivery_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_prediction IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object('prediction', v_prediction);
END;
$$;

GRANT EXECUTE ON FUNCTION reveal_prediction_by_token(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION reveal_prediction_by_token(UUID, UUID) TO authenticated;

-- ============================================================================
-- P979: update_delivery_status_by_token — restore P651 forward-only rank guard
-- on top of the current P684 body (keeps P684 mode guard + P683 expiry drop).
-- ============================================================================
CREATE OR REPLACE FUNCTION update_delivery_status_by_token(
  p_token UUID,
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_id    UUID;
  v_letter_id      UUID;
  v_current_status TEXT;
  v_current_rank   INTEGER;
  v_new_rank       INTEGER;
BEGIN
  SELECT ld.id, ld.letter_id, ld.status
  INTO v_delivery_id, v_letter_id, v_current_status
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RETURN false;
  END IF;

  -- P684: reject anonymous callers on one-to-many letters only
  IF (SELECT mode FROM clarity_letters WHERE id = v_letter_id) = 'one-to-many'
     AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required for one-to-many responses';
  END IF;

  -- P979 (restored P651): forward-only guard. Reject backward transitions so a
  -- token holder can't drive their own delivery's status backward (e.g.
  -- completed → opened), corrupting the sender's progress display.
  v_current_rank := CASE v_current_status
    WHEN 'sent' THEN 1 WHEN 'opened' THEN 2 WHEN 'in_progress' THEN 3 WHEN 'completed' THEN 4 ELSE 0 END;
  v_new_rank := CASE p_status
    WHEN 'sent' THEN 1 WHEN 'opened' THEN 2 WHEN 'in_progress' THEN 3 WHEN 'completed' THEN 4 ELSE 0 END;

  IF v_new_rank <= v_current_rank THEN
    RETURN true; -- no-op, not an error
  END IF;

  UPDATE letter_deliveries
  SET
    status = p_status,
    opened_at = CASE WHEN p_status = 'opened' AND opened_at IS NULL THEN now() ELSE opened_at END,
    completed_at = CASE WHEN p_status = 'completed' AND completed_at IS NULL THEN now() ELSE completed_at END,
    receiver_profile_id = COALESCE(receiver_profile_id, auth.uid())
  WHERE id = v_delivery_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION update_delivery_status_by_token(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION update_delivery_status_by_token(UUID, TEXT) TO authenticated;
