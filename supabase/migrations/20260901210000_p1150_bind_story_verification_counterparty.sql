-- P1150: story_verifications INSERT — bind the counterparty and the attributed rating.
--
-- new function: p1150_letter_rating_admissible(uuid, uuid, uuid, uuid, uuid)
--
-- client-safe: the ONLY direct client writers of this table are the two letter-screening
--   paths in src/app/data/letters-service.ts (submitRating :320, submitLetterResponseAuthenticated
--   :1138-1150). Both write exactly the shape admitted below: caller = listener_id, speaker_id =
--   the letter's sender_id, speaker_rating = 0, source = 'letter', verified = false,
--   session_id = NULL, story_id = a story in that letter's snapshot, version_id = that snapshot's
--   version or omitted, delivery_id omitted. grep story_verifications src/ finds no other inserter;
--   every other writer (submit_rating_by_token, persist_anonymous_completion, fixtures) is
--   SECURITY DEFINER or service_role and RLS does not govern it. Live sessions have no client
--   write path into this table today.
--
-- The gap (reproduced 2026-09-01 on test through the real REST path, integration spec below):
-- the P586 predicate `auth.uid() = speaker_id OR auth.uid() = listener_id` bound the caller to
-- ONE of the two actor columns and left the other free, along with speaker_rating. An ordinary
-- verified user inserted a row naming a third party as speaker on that party's own story with
-- speaker_rating = 10; the row landed and update_profile_ears_count moved the third party's
-- verification_session_count 0 → 1.
--
-- The fix is scoping, not closing (the spec is explicit: P1139's revoke-and-close would break a
-- shipped flow). The predicate admits exactly the product's letter-screening shape:
--   * the caller is the listener and is NOT the speaker;
--   * the row is a letter rating: source = 'letter', verified = false, session_id IS NULL;
--   * the attributed speaker_rating is the 0 placeholder — the sender's real number lives in
--     letter_predictions and is written by the sender, never by the receiver;
--   * the (speaker, story, listener) triple is a real letter relation: a letter SENT BY speaker_id
--     whose snapshot CONTAINS story_id and which has a delivery to the caller. Letter stories are
--     the sender's own (doc_stories INSERT requires stories.author_id = auth.uid(), P551), so this
--     also pins speaker_id to the story author without depending on it;
--   * version_id / delivery_id, when present, must belong to that same letter / caller.
--
-- Why a SECURITY DEFINER helper rather than inline EXISTS: the three letter tables all carry
-- RLS whose policies themselves call definer helpers (_is_letter_receiver, _is_letter_sender,
-- P581). An inline subquery in a policy is evaluated as the caller and re-enters those policies;
-- the helper reads the relation once as owner, the P581 pattern. STABLE, fail-closed on NULLs.
-- The lookups are keyed on (letter_id, story_id) PK, idx_clarity_letters_sender and the
-- letter_deliveries (letter_id, receiver_profile_id) index — no hot scan.
--
-- Non-goals honoured: ear-metric semantics untouched (P940), no other table touched, no UI change.
-- Canary: e2e/integration/p1150-story-verification-counterparty.spec.ts — 5 gap tests observed
-- failing against the P586 policy before this file was written; 3 controls (both client shapes +
-- a definer/service_role write) pass before and after.

CREATE OR REPLACE FUNCTION public.p1150_letter_rating_admissible(
  p_story    uuid,
  p_speaker  uuid,
  p_listener uuid,
  p_version  uuid,
  p_delivery uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT p_story IS NOT NULL
     AND p_speaker IS NOT NULL
     AND p_listener IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.clarity_letters l
         JOIN public.letter_story_snapshots s
           ON s.letter_id = l.id AND s.story_id = p_story
         JOIN public.letter_deliveries d
           ON d.letter_id = l.id AND d.receiver_profile_id = p_listener
        WHERE l.sender_id = p_speaker
          AND (p_version  IS NULL OR s.version_id = p_version)
          AND (p_delivery IS NULL OR d.id = p_delivery)
     );
$$;

-- Callable by the role the policy is evaluated as. Nothing it returns is secret (a boolean about
-- the caller's own letter relation), but keep it off anon and PUBLIC like every helper here.
REVOKE ALL ON FUNCTION public.p1150_letter_rating_admissible(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.p1150_letter_rating_admissible(uuid, uuid, uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.p1150_letter_rating_admissible(uuid, uuid, uuid, uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "story_verifications_insert" ON public.story_verifications;

CREATE POLICY "story_verifications_insert"
  ON public.story_verifications FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND listener_id = auth.uid()
    AND speaker_id IS DISTINCT FROM auth.uid()
    AND source = 'letter'
    AND verified = false
    AND session_id IS NULL
    AND speaker_rating = 0
    AND public.p1150_letter_rating_admissible(story_id, speaker_id, auth.uid(), version_id, delivery_id)
  );

-- ============================================================================
-- Verification — fail loud, in the migration itself
-- ============================================================================
DO $$
DECLARE
  v_insert_policies integer;
BEGIN
  -- Permissive policies OR together: a second INSERT policy would silently reopen the gap.
  SELECT count(*) INTO v_insert_policies
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'story_verifications' AND cmd = 'INSERT';
  IF v_insert_policies <> 1 THEN
    RAISE EXCEPTION 'P1150: expected exactly 1 INSERT policy on story_verifications, found %', v_insert_policies;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'story_verifications'
       AND policyname = 'story_verifications_insert'
       AND with_check LIKE '%p1150_letter_rating_admissible%'
  ) THEN
    RAISE EXCEPTION 'P1150: story_verifications_insert does not reference the admissibility helper';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.p1150_letter_rating_admissible(uuid, uuid, uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1150: authenticated cannot EXECUTE the helper — every letter rating would be refused';
  END IF;
  IF has_function_privilege('anon', 'public.p1150_letter_rating_admissible(uuid, uuid, uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1150: anon can EXECUTE the helper — the REVOKE did not hold';
  END IF;

  -- Fail-closed on NULLs: no relation, no admission.
  IF public.p1150_letter_rating_admissible(NULL, NULL, NULL, NULL, NULL) THEN
    RAISE EXCEPTION 'P1150: helper admitted an all-NULL triple';
  END IF;

  RAISE NOTICE 'P1150: story_verifications INSERT now admits only the letter-screening shape.';
END;
$$;
