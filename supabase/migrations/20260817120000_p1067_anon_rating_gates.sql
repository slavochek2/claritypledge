-- P1067 (N2, N3): bind a letter rating to the delivery it was made in.
--
-- One missing fact explains every symptom this migration closes: a rating did
-- not record which delivery produced it. Without that, the reveal gate could
-- only scope itself to the rater's identity — so a rating made under one
-- invitation unlocked a sibling delivery's sealed prediction — and the write
-- path had nothing to declare unique, so its ON CONFLICT clause had no
-- constraint to catch and the counter guard behind it never fired.
--
-- Four statements, one concern:
--   1. story_verifications.delivery_id, nullable.
--   2. Backfill, restricted to rows whose delivery is unambiguous.
--   3. A partial unique index over (delivery_id, story_id) for letter ratings —
--      the constraint the existing ON CONFLICT was always missing.
--   4. Both writers set the column; the reveal gate for an unclaimed delivery
--      requires it to match. Every other line of every body is unchanged from
--      the live definition it replaces.
--
-- The caller-supplied story id is also checked against the letter before a
-- rating is written, matching what the sibling response RPC already does.
--
-- diffed against: the LIVE catalog rather than a migration file, same method and
--   reason as 20260813170000. Every body below was taken from
--   pg_get_functiondef(oid) keyed on oid::regprocedure and md5'd before editing;
--   the hashes are recorded in .private/docs/security-log.md. The complete set of
--   functions that write these rows was enumerated from pg_proc on BOTH
--   environments rather than by grepping migrations — a constraint only half the
--   writers populate is decorative, which is the defect being fixed.
--
-- Findings, prod counts and four corrections to the originating review:
--   .private/docs/security-log.md.
--
-- client-safe: no signature changes, no grant changes, no new refusal on any path
--   that works today. The rating call and the reveal call are made back to back by
--   the same hook, so a rating written now always carries the delivery the reveal
--   then asks for. Historical rows whose delivery could not be determined are left
--   unlinked and are reachable only through the claimed-receiver branch, which this
--   migration does not touch — deliberately, so those rows keep working.
--
-- Integration test: e2e/integration/20260817120000_p1067_anon_rating_gates.spec.ts

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The missing linkage
-- ---------------------------------------------------------------------------
-- Nullable on purpose: historical rows exist whose delivery cannot be derived,
-- and /live verifications have no delivery at all. ON DELETE SET NULL keeps the
-- calibration row when a delivery goes away.

ALTER TABLE public.story_verifications
  ADD COLUMN IF NOT EXISTS delivery_id UUID
  REFERENCES public.letter_deliveries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_verifications_delivery
  ON public.story_verifications(delivery_id);

-- ---------------------------------------------------------------------------
-- 2. Backfill — only where the delivery is unambiguous
-- ---------------------------------------------------------------------------
-- A row is linkable when exactly one delivery matches on all three of: the
-- listener is that delivery's receiver, the letter's sender is the row's
-- speaker, and the letter's snapshot carries the story. Where two deliveries
-- satisfy that (the same reader received the same story in more than one
-- letter from the same sender), the row stays unlinked rather than guessed.
--
-- Within one (delivery, story) only the earliest row is linked, so step 3 can
-- create the index. Duplicates are left in place, not deleted: they are
-- historical measurements, and deleting them would move counters.

WITH candidate AS (
  SELECT sv.id                    AS sv_id,
         MIN(ld.id::text)::uuid   AS delivery_id,
         COUNT(DISTINCT ld.id)    AS n
  FROM public.story_verifications sv
  JOIN public.letter_story_snapshots lss
    ON lss.story_id = sv.story_id
  JOIN public.letter_deliveries ld
    ON ld.letter_id = lss.letter_id
   AND ld.receiver_profile_id = sv.listener_id
  JOIN public.clarity_letters cl
    ON cl.id = ld.letter_id
   AND cl.sender_id = sv.speaker_id
  WHERE sv.source = 'letter'
    AND sv.delivery_id IS NULL
  GROUP BY sv.id
),
ranked AS (
  SELECT c.sv_id,
         c.delivery_id,
         ROW_NUMBER() OVER (
           PARTITION BY c.delivery_id, sv.story_id
           ORDER BY sv.created_at NULLS LAST, sv.id
         ) AS rn
  FROM candidate c
  JOIN public.story_verifications sv ON sv.id = c.sv_id
  WHERE c.n = 1
)
UPDATE public.story_verifications sv
SET delivery_id = r.delivery_id
FROM ranked r
WHERE sv.id = r.sv_id
  AND r.rn = 1
  -- Re-runnable: skip any (delivery, story) already taken by a linked row.
  -- Without this the statement is safe on a virgin column and fails with 23505
  -- on any second run — including a retry after a partial deploy. Caught by
  -- re-applying this file to test rather than by reading it.
  AND NOT EXISTS (
    SELECT 1
    FROM public.story_verifications ex
    WHERE ex.delivery_id = r.delivery_id
      AND ex.story_id = sv.story_id
      AND ex.source = 'letter'
  );

-- ---------------------------------------------------------------------------
-- 3. The constraint the write path always assumed it had
-- ---------------------------------------------------------------------------
-- One rating per story per delivery. Partial, because unlinked and non-letter
-- rows must stay outside it.

CREATE UNIQUE INDEX IF NOT EXISTS story_verifications_letter_delivery_story_unique
  ON public.story_verifications (delivery_id, story_id)
  WHERE source = 'letter' AND delivery_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4a. submit_rating_by_token — record the delivery; check the story belongs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_rating_by_token(p_token uuid, p_story_id uuid, p_rating integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_delivery_id UUID;
  v_letter_id   UUID;
  v_sender_id   UUID;
BEGIN
  -- Validate token + get sender + letter
  SELECT ld.id, cl.id, cl.sender_id INTO v_delivery_id, v_letter_id, v_sender_id
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

  -- P1067: the story id arrives from the caller and was never checked against
  -- the letter, so any story could be attributed to this letter's sender. A
  -- sealed letter's snapshot does not change, so a miss here is never a race.
  IF NOT EXISTS (
    SELECT 1 FROM letter_story_snapshots
    WHERE letter_id = v_letter_id AND story_id = p_story_id
  ) THEN
    RAISE EXCEPTION 'Story does not belong to this letter';
  END IF;

  -- Insert story verification (rating)
  -- Note: accuracy_achieved is GENERATED; session_id is FK to clarity_sessions (NULL for letters)
  -- P1067: delivery_id binds the rating to this delivery — it is what the reveal
  -- gate scopes to, and what makes ON CONFLICT below catch anything at all.
  INSERT INTO story_verifications (
    story_id, version_id, speaker_id, listener_id,
    listener_rating, speaker_rating,
    source, verified, session_id, delivery_id
  ) VALUES (
    p_story_id,
    (SELECT version_id FROM letter_story_snapshots WHERE letter_id = v_letter_id AND story_id = p_story_id LIMIT 1),
    v_sender_id,
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    p_rating, 0,
    'letter', false, NULL, v_delivery_id
  )
  ON CONFLICT DO NOTHING;

  -- P721: Only increment counter if a row was actually inserted.
  -- Without this guard, duplicate calls (retries, double-submits) inflate
  -- stories_rated past the real story count, producing "9 of 8 steps" in the inbox.
  IF FOUND THEN
    UPDATE letter_deliveries
    SET stories_rated = stories_rated + 1
    WHERE id = v_delivery_id;
  END IF;

  RETURN true;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4b. persist_anonymous_completion — the second writer of these rows
-- ---------------------------------------------------------------------------
-- Enumerated from pg_proc, not from the client. It already resolves the
-- delivery, so recording it is one column — and it is what brings this path
-- under the index, making its own ON CONFLICT effective for the first time.

CREATE OR REPLACE FUNCTION public.persist_anonymous_completion(p_nonce uuid, p_letter_id uuid, p_ratings jsonb, p_positions jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id UUID;
  v_delivery_id UUID;
  v_rating JSONB;
  v_pos JSONB;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT id INTO v_delivery_id
  FROM letter_deliveries
  WHERE letter_id = p_letter_id AND receiver_profile_id = v_caller_id
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RAISE EXCEPTION 'No delivery found for this letter and user';
  END IF;

  FOR v_rating IN SELECT * FROM jsonb_array_elements(p_ratings) LOOP
    INSERT INTO story_verifications (
      story_id, version_id, session_id, speaker_id, listener_id,
      listener_rating, source, verified, sort_order, delivery_id
    ) VALUES (
      (v_rating->>'story_id')::UUID,
      (v_rating->>'version_id')::UUID,
      NULL,
      (v_rating->>'speaker_id')::UUID,
      v_caller_id,
      (v_rating->>'rating')::SMALLINT,
      'letter', false,
      (v_rating->>'sort_order')::INTEGER,
      v_delivery_id
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  FOR v_pos IN SELECT * FROM jsonb_array_elements(p_positions) LOOP
    INSERT INTO letter_point_responses (delivery_id, point_id, position)
    VALUES (v_delivery_id, (v_pos->>'point_id')::UUID, v_pos->>'position')
    ON CONFLICT ON CONSTRAINT letter_point_responses_unique DO NOTHING;
  END LOOP;

  INSERT INTO point_positions (point_id, user_id, position)
  SELECT lpr.point_id, v_caller_id, lpr.position::position_type
  FROM letter_point_responses lpr
  WHERE lpr.delivery_id = v_delivery_id
    AND lpr.position IN ('strongly_disagree', 'disagree', 'slightly_disagree', 'neutral', 'slightly_agree', 'agree', 'strongly_agree')
  ON CONFLICT (point_id, user_id) DO NOTHING;

  UPDATE letter_deliveries SET status = 'completed', completed_at = now() WHERE id = v_delivery_id;

  RETURN true;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4c. reveal_prediction_by_token — the unclaimed branch scopes to the delivery
-- ---------------------------------------------------------------------------
-- Only the unclaimed branch changes. The claimed branch is already confined by
-- the receiver's identity, and one recipient holds one delivery per letter; and
-- adding the same requirement there would silently withhold reveals from the
-- historical rows step 2 could not link.

CREATE OR REPLACE FUNCTION public.reveal_prediction_by_token(p_token uuid, p_story_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- P1067: and must have rated under THIS delivery. Identity alone let one
    -- caller holding two of a letter's invitations reveal under the second on
    -- the strength of a rating made under the first.
    IF NOT EXISTS (
      SELECT 1 FROM story_verifications sv
      JOIN letter_story_snapshots lss ON lss.story_id = sv.story_id AND lss.letter_id = v_letter_id
      WHERE sv.story_id = p_story_id
        AND sv.speaker_id = v_sender_id
        AND sv.source = 'letter'
        AND sv.delivery_id = v_delivery_id
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
$function$;

COMMIT;
