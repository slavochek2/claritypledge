-- P1278 C: a /live row that carries no ratings is not a calibration, and must not move counters.
--
-- diffed against: 20260910110000 is a SELECT policy and is NOT touched here. This file rewrites
--   only the INSERT policy created by 20260909093000_p1278_admit_live_calibration_insert.sql.
--   The letter branch is carried over CONJUNCT FOR CONJUNCT, byte-identical.
--   p1278_live_verification_admissible and p1150_letter_rating_admissible are NOT redefined,
--   NOT dropped and NOT re-granted here.
--
-- diff: TWO conjuncts added to the live branch —
--   `speaker_rating IS NOT NULL` and `listener_rating IS NOT NULL`.
--
-- client-safe: NARROWING, but provably not of any traffic the client can produce.
--   RecordVerificationInput types both ratings as a required `number`
--   (src/app/data/calibration-service.interface.ts:71-72), the only caller passes
--   `checkerRating` / `responderRating`, both non-optional `number`
--   (src/app/pages/clarity-live-page.tsx:2151-2158), and recordVerification forwards them
--   without a `?? null` (calibration-service-real.ts:256-261) — unlike story_id/version_id,
--   which it does null-coalesce. No deployed client path can emit a NULL rating, so nothing
--   that works today starts failing. The letter branch is untouched.
--
-- ---------------------------------------------------------------------------------------
-- WHAT THE REVIEW FOUND
-- ---------------------------------------------------------------------------------------
-- Found by an adversarial Codex review of the P1278 A+B diff, 2026-09-10, and confirmed by
-- command against the test database before being acted on (.claude/rules/epistemic.md gate 9):
--
--   * `story_verifications.speaker_rating` and `.listener_rating` are both NULLABLE
--     (information_schema: is_nullable = YES for both).
--   * Their CHECK constraints are `BETWEEN 0 AND 10`, and a CHECK evaluates NULL as UNKNOWN,
--     which a CHECK ADMITS. So the column constraints do not require a rating.
--   * `update_profile_ears_count()` increments `verification_session_count` for the listener
--     unconditionally, and for the speaker whenever the two differ — it never inspects a
--     rating (verified by reading pg_proc.prosrc on test).
--
-- So before this migration, either genuine participant of a genuine session could insert
--
--     source='live', verified=true, session_id=<real>, delivery_id=NULL,
--     speaker_id=<a>, listener_id=<b>, speaker_rating=NULL, listener_rating=NULL
--
-- and move BOTH participants' public `verification_session_count` with a row that records no
-- calibration at all. It is not third-party attribution — P1278 A's actor binding holds, and the
-- review confirmed that separately — so the blast radius is two consenting accounts inflating
-- their own numbers. That is still a fabricated record behind a public counter, and it is
-- gratuitous: the letter branch has required `listener_rating IS NOT NULL` since P1150 B, so
-- this was an inconsistency between the two branches rather than a considered allowance.
--
-- NOT fixed here, named instead: replay inflation (the same real exchange written twice, or by
-- both clients) remains reachable and is the residual P1278 A already documents. Deduplicating
-- live rows needs a product decision first, because both clients legitimately write the same
-- exchange today and a unique index would refuse the second one. See features/p1278_*.md.

DROP POLICY IF EXISTS "story_verifications_insert" ON public.story_verifications;

CREATE POLICY "story_verifications_insert"
  ON public.story_verifications FOR INSERT
  WITH CHECK (
    -- Branch 1 — letter screening. P1150 B, unchanged.
    (
      auth.uid() IS NOT NULL
      AND listener_id = auth.uid()
      AND speaker_id IS DISTINCT FROM auth.uid()
      AND source = 'letter'
      AND verified = false
      AND session_id IS NULL
      AND speaker_rating = 0
      AND listener_rating IS NOT NULL
      AND delivery_id IS NOT NULL
      AND public.p1150_letter_rating_admissible(story_id, speaker_id, version_id, delivery_id)
    )
    OR
    -- Branch 2 — /live calibration. P1278 A, plus C's two rating conjuncts.
    (
      source = 'live'
      AND verified = true
      AND session_id IS NOT NULL
      AND delivery_id IS NULL
      -- P1278 C: an admitted live row must actually be a rating. Both counters triggers fire
      -- on every inserted row regardless of rating, so a NULL-rating row is a counter move
      -- with no calibration behind it.
      AND speaker_rating IS NOT NULL
      AND listener_rating IS NOT NULL
      AND public.p1278_live_verification_admissible(
            session_id, speaker_id, listener_id, story_id, version_id)
    )
  );

-- ============================================================================
-- Verification — fail loud, in the migration itself
-- ============================================================================
DO $$
DECLARE
  v_insert_policies integer;
  v_check text;
BEGIN
  SELECT count(*) INTO v_insert_policies
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'story_verifications' AND cmd = 'INSERT';
  IF v_insert_policies <> 1 THEN
    RAISE EXCEPTION 'P1278 C: expected exactly 1 INSERT policy on story_verifications, found %', v_insert_policies;
  END IF;

  SELECT with_check INTO v_check
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'story_verifications'
     AND policyname = 'story_verifications_insert';

  -- P1150's conjuncts must all still be present.
  IF v_check NOT LIKE '%p1150_letter_rating_admissible%'
     OR v_check NOT LIKE '%delivery_id IS NOT NULL%'
     OR v_check NOT LIKE '%speaker_rating = 0%' THEN
    RAISE EXCEPTION 'P1278 C: the letter branch lost a P1150 conjunct';
  END IF;

  -- P1278 A's live branch must still be present.
  IF v_check NOT LIKE '%p1278_live_verification_admissible%' THEN
    RAISE EXCEPTION 'P1278 C: the live branch is missing';
  END IF;

  -- C's own conjuncts.
  IF v_check NOT LIKE '%speaker_rating IS NOT NULL%'
     OR v_check NOT LIKE '%listener_rating IS NOT NULL%' THEN
    RAISE EXCEPTION 'P1278 C: the rating conjuncts are missing';
  END IF;

  RAISE NOTICE 'P1278 C: a live row must carry both ratings; the letter branch and both helpers are unchanged.';
END;
$$;
