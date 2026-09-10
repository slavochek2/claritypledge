-- P1278 B: a /live calibration row must be readable by the two people who made it.
--
-- diffed against: 20260403224331_p581_clarity_letters.sql:320-334 ("Verifications visible when
--   story visible"). The `source = 'letter'` arm is carried over BYTE-FOR-BYTE. The ELSE arm
--   keeps its existing story-visibility EXISTS unchanged and gains one OR-branch for the two
--   actors named on the row. No other policy, grant or column is touched.
--
-- client-safe: SELECT-only, and strictly WIDENING. Every row any caller can read today is still
--   readable — the prior predicate survives as an OR-branch, unmodified. No REVOKE, no DROP of a
--   column or function, no signature change. anon is unaffected: both new disjuncts are guarded
--   by `auth.uid() IS NOT NULL`, so for an anonymous caller this policy evaluates exactly as
--   before.
--
-- ---------------------------------------------------------------------------------------
-- WHAT P1278 (A) MISSED
-- ---------------------------------------------------------------------------------------
-- 20260909093000 fixed the INSERT policy so a /live calibration row is ADMITTED. It is not
-- enough, and the canary caught it: `control (P1278): a storyless exchange is admitted (P413
-- nullable story/version)` still failed with 42501 after that migration was applied to test.
--
-- The cause is on the READ side, not the write side. The client insert is
-- `.insert({...}).select('*').single()` (src/app/data/calibration-service-real.ts:250-262), so
-- PostgREST issues INSERT ... RETURNING. Postgres applies the SELECT policy to a RETURNING row,
-- and this table's SELECT policy routes every non-letter row through
--
--     EXISTS (SELECT 1 FROM stories
--              WHERE stories.id = story_verifications.story_id
--                AND (stories.visibility = 'public' OR stories.author_id = auth.uid()))
--
-- which is FALSE whenever `story_id IS NULL`. P413 made story_id nullable precisely so a loose
-- paraphrase round could be recorded without a story, and /live still produces those —
-- clarity-live-page.tsx:2183 looks a version up ONLY `if (storyId)` and passes `storyId`
-- through unset otherwise. So a storyless round writes a row the writer cannot read back, the
-- RETURNING fails, and the client sees an insert error for a row that was in fact admitted.
--
-- The same predicate has a second consequence that was never a test but is a live defect: a
-- /live round about a story whose visibility is `private` is readable by its AUTHOR only. The
-- other participant — the person who did the paraphrasing, whose own listener_rating is on the
-- row — cannot read their own calibration record. `source = 'letter'` rows have never had this
-- problem; that arm binds visibility to the two actors, which is what this migration gives the
-- live arm too.
--
-- ---------------------------------------------------------------------------------------
-- WHY WIDENING HERE IS NOT A LEAK
-- ---------------------------------------------------------------------------------------
-- The new disjunct admits a row to `speaker_id` and `listener_id` and to nobody else. Those two
-- columns cannot be nominated: P1278's INSERT policy forces {speaker_id, listener_id} to equal
-- {creator_profile_id, joiner_profile_id} of the named session exactly, and both of those are
-- pinned by privilege rather than predicate (creator_profile_id is excluded from P1047's column
-- grant list; joiner_profile_id is written only by claim_joiner_seat, SECURITY DEFINER, from the
-- caller's own JWT). So a caller cannot write themselves onto a stranger's row in order to read
-- it, which is the only way this branch could be turned into an oracle.
--
-- It is also the same rule the letter arm has enforced since P581: the two people named on a
-- calibration row may read it. This migration removes an inconsistency rather than inventing a
-- rule.

DROP POLICY IF EXISTS "Verifications visible when story visible" ON public.story_verifications;

CREATE POLICY "Verifications visible when story visible"
  ON public.story_verifications FOR SELECT USING (
    CASE
      WHEN source = 'letter' THEN
        -- P581, unchanged: visible only to the speaker (sender) or listener (receiver).
        speaker_id = auth.uid() OR listener_id = auth.uid()
      ELSE
        -- P1278 B: the two participants of the exchange, regardless of story visibility and
        -- including a storyless round. `auth.uid() IS NOT NULL` keeps this fail-closed for
        -- anon, where `speaker_id = auth.uid()` would otherwise be NULL rather than FALSE.
        (
          auth.uid() IS NOT NULL
          AND (speaker_id = auth.uid() OR listener_id = auth.uid())
        )
        OR
        -- P586/P581 story-visibility rule, carried over unchanged.
        EXISTS (
          SELECT 1 FROM public.stories
          WHERE stories.id = story_verifications.story_id
            AND (stories.visibility = 'public'::content_visibility OR stories.author_id = auth.uid())
        )
    END
  );

-- ============================================================================
-- Verification — fail loud, in the migration itself
-- ============================================================================
DO $$
DECLARE
  v_select_policies integer;
  v_qual text;
BEGIN
  SELECT count(*) INTO v_select_policies
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'story_verifications' AND cmd = 'SELECT';
  IF v_select_policies <> 1 THEN
    RAISE EXCEPTION 'P1278 B: expected exactly 1 SELECT policy on story_verifications, found %', v_select_policies;
  END IF;

  SELECT qual INTO v_qual
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'story_verifications'
     AND policyname = 'Verifications visible when story visible';

  -- The letter arm must still bind to the two actors.
  IF v_qual NOT LIKE '%source = ''letter''%' THEN
    RAISE EXCEPTION 'P1278 B: the letter arm lost its source discriminator';
  END IF;

  -- The story-visibility rule must still be present — this migration adds to it, never replaces it.
  IF v_qual NOT LIKE '%visibility = ''public''%' OR v_qual NOT LIKE '%author_id = auth.uid()%' THEN
    RAISE EXCEPTION 'P1278 B: the story-visibility branch was lost';
  END IF;

  RAISE NOTICE 'P1278 B: a /live calibration row is now readable by its two named participants, including a storyless round; the letter arm and the story-visibility rule are unchanged.';
END;
$$;
