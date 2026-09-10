-- P1278: readmit the /live calibration INSERT that P1150 refused, without reopening P1150.
--
-- diffed against: 20260901220000_p1150_b_bind_delivery_and_caller.sql (story_verifications_insert)
--   The letter branch below is that policy's WITH CHECK carried over CONJUNCT FOR CONJUNCT,
--   byte-identical, wrapped in parentheses. p1150_letter_rating_admissible is NOT redefined,
--   NOT dropped and NOT re-granted here — this file does not touch it.
--   The only change is a second OR-branch for source = 'live'.
--
-- client-safe: this migration only WIDENS admission. Every row the deployed bundle can write
--   today (the two letter-screening paths in src/app/data/letters-service.ts, submitRating :320
--   and submitLetterResponseAuthenticated :1138-1150) still matches the letter branch unchanged,
--   so no path that works today can start 403ing. No REVOKE, no column drop, no type change; the
--   DROP POLICY is immediately followed by a CREATE POLICY that is a strict superset.
--
-- ---------------------------------------------------------------------------------------
-- WHAT WAS BROKEN
-- ---------------------------------------------------------------------------------------
-- story_verifications has exactly ONE INSERT policy, and since P1150 it admits only the
-- letter-screening shape. The /live calibration write —
-- src/app/pages/clarity-live-page.tsx:2305 (`void writeVerification`, P413) →
-- src/app/data/calibration-service-real.ts:246 (`recordVerification`) — fails it on four
-- independent conjuncts:
--
--   source        client sends nothing; the column default is 'live' (p581)   policy wants 'letter'
--   session_id    the live session id                                          policy wants NULL
--   speaker_rating the checker's real rating                                    policy wants 0
--   delivery_id   client sends nothing                                          policy wants NOT NULL
--
-- P1150's own header asserts "Live sessions have no client write path into this table today"
-- (20260901210000:12). That claim was false when it was written, and its canary carried only a
-- source = 'live' case that must be REJECTED — never a control asserting a legitimate live row is
-- ADMITTED, so the predicate's false-positive rate was never measured (.claude/rules/epistemic.md
-- gate 7c). The policy reached prod 2026-09-07T06:19:57Z; the newest /live session visible to anon
-- was 2026-09-01, so nothing has been lost yet. The next round loses.
--
-- ---------------------------------------------------------------------------------------
-- EXACTLY WHAT P1150 BLOCKED, AND WHY THIS DOES NOT RESTORE IT
-- ---------------------------------------------------------------------------------------
-- P1150's attack, in its own words (20260901210000:16-21): "An ordinary verified user inserted a
-- row naming a THIRD PARTY as speaker on that party's own story with speaker_rating = 10; the row
-- landed and update_profile_ears_count moved the third party's verification_session_count 0 -> 1."
-- The defect was that P586's predicate (`auth.uid() = speaker_id OR auth.uid() = listener_id`)
-- bound the caller to ONE actor column and left the OTHER, plus the attributed rating, free.
-- P1150 B then added the caller's own delivery, closing an enumeration oracle and the
-- NULL-delivery wildcard outside P1067's partial unique index.
--
-- The live branch below does not reopen that, because it never leaves an actor column free.
-- BOTH speaker_id and listener_id must be participants of the named session, and they must
-- differ — so `speaker_id IN (creator, joiner) AND listener_id IN (creator, joiner) AND
-- speaker_id <> listener_id` forces {speaker_id, listener_id} = {creator_profile_id,
-- joiner_profile_id} exactly. There is no column a caller can point at someone who was not in
-- the room.
--
-- That is only worth anything if session membership is itself unforgeable. It is, and both
-- columns are pinned by privilege rather than by predicate:
--
--   creator_profile_id  INSERT: clarity_sessions_verified_host_insert requires
--                       `creator_profile_id IS NULL OR creator_profile_id = auth.uid()` (P1038).
--                       UPDATE: not in the column grant list — P1047 dropped table-level UPDATE
--                       and re-granted 18 columns, deliberately excluding creator_profile_id
--                       and target_listener_id (20260811150000:71-95).
--   joiner_profile_id   UPDATE revoked from anon and authenticated by P1053
--                       (20260812160000_p1053_revoke_client_joiner_writes.sql:65). The only
--                       writer is claim_joiner_seat, SECURITY DEFINER, which sets
--                       `joiner_profile_id = COALESCE(auth.uid(), joiner_profile_id)` — the
--                       seat is derived from the caller's JWT and can never be nominated
--                       (20260812210000:134-136).
--
-- So a caller cannot manufacture a session in which a chosen victim is a participant, which is
-- the whole of the P1150 attack. The helper additionally requires the CALLER to be one of the two
-- participants, so a bystander who can read the session row cannot write ratings into it.
--
-- The actor binding alone is NOT enough, and the first draft of this migration stopped there.
-- The Codex review found the hole: `story_verifications` has a SECOND counters trigger,
-- update_story_understood_count, which recomputes `stories.understood_count` for NEW.story_id —
-- and the story's author need not be in the room. Two colluding (or one two-account) participants
-- in a genuine session could therefore name ANY story id and move a stranger's public number. That
-- is third-party counter movement, the same class P1150 closed, reached through a column the actor
-- binding does not cover. So story_id is bound too:
--
--   the story's author must be one of the two session participants.
--
-- That is exactly what /live can produce. The picker is fed by
-- storiesService.getStoriesByAuthorWithPoints(userId, userId) — "The picker only shows your own
-- stories" (live-mode-view.tsx:1302), and StorySearchPicker filters that same list ("Search your
-- stories"). The other entry is a letter-sourced room (clarity-live-page.tsx:3078,
-- selectedStoryId = sess.sourceStoryId), whose creator must be the letter's sender
-- (clarity_sessions_verified_host_insert) and whose letter stories are the sender's own
-- (doc_stories INSERT requires stories.author_id = auth.uid(), P551). Either way the author is a
-- participant. version_id is pinned to that same story, so a real version of one story cannot be
-- attached to another.
--
-- Residual, named rather than hidden: a genuine participant may attribute the pair in either order
-- (the caller may be the speaker OR the listener — /live has no fixed direction; whoever checks
-- understanding is the speaker for that exchange, and both clients fire the write), may replay the
-- same exchange to increment verification_session_count for both participants, and may name any of
-- their OWN or their PARTNER'S stories rather than the one the round actually used. All three are
-- inflation inside a room both people really shared, bounded by needing a real counterparty, and
-- all three were equally reachable before P1150 closed the path. Deduplicating live rows needs a
-- product decision first — both clients write the same exchange today, so a unique index would
-- refuse the second one. See features/p1278_*.md.
--
-- ---------------------------------------------------------------------------------------
-- WHY ONE POLICY WITH TWO BRANCHES, NOT TWO POLICIES
-- ---------------------------------------------------------------------------------------
-- Permissive policies OR together, which is why P1150 asserted "exactly 1 INSERT policy on
-- story_verifications" in its own DO block — a second policy is indistinguishable from a widened
-- first one, and reviewing either in isolation tells you nothing. Adding a branch inside the one
-- policy keeps that assertion TRUE and re-asserts it below, so P1150's guard is preserved rather
-- than rewritten or deleted.
--
-- ---------------------------------------------------------------------------------------
-- ANONYMOUS CALLERS ARE NOT ADMITTED — and cannot be, by RLS
-- ---------------------------------------------------------------------------------------
-- The founder's decision is that guests may record. This policy does NOT deliver that half, and
-- the reason is that RLS cannot: an anonymous caller has no identity to bind, and
-- clarity_sessions_select exposes every row with target_listener_id IS NULL to anon, while
-- P1057's column grant hands anon `id, creator_profile_id, joiner_profile_id`
-- (20260817140001:68-72). An anon-admitting branch would therefore let any unauthenticated
-- caller enumerate real (session, speaker, listener) triples and insert speaker_rating = 10 rows
-- against strangers — a counter-inflation attack on the SAME columns and the SAME trigger that
-- P1150 closed, reachable without authenticating at all. Admitting anon here would restore
-- P1150's defect in a new dress.
--
-- Guest recording also cannot be reached today regardless of policy: story_verifications
-- .speaker_id and .listener_id are NOT NULL REFERENCES profiles(id) (20260204:120-121, only
-- story_id/version_id were relaxed by P413), and a /live guest has no profile row —
-- claim_joiner_seat leaves joiner_profile_id NULL for a caller with no JWT. Every admissible
-- live row therefore names two signed-in participants, and its writer is one of them. Serving
-- guests needs (a) speaker_id/listener_id to accept NULL plus a NULL guard in
-- update_profile_ears_count, and (b) a SECURITY DEFINER RPC that takes the room CODE — the
-- capability anon cannot read since P1057 — instead of an RLS predicate. Both are founder
-- decisions with product consequences for the ear metric; see the spec.
--
-- Canary: e2e/integration/p1150-story-verification-counterparty.spec.ts (extended with a live
-- control that must be ADMITTED and two live gap tests that must be REFUSED).

-- ============================================================================
-- Helper: is this row a real exchange between the two people in that session?
-- ============================================================================
-- SECURITY DEFINER for the P581/P1150 reason: an inline EXISTS in a policy is evaluated as the
-- caller and re-enters clarity_sessions_select, which hides letter-sourced targeted sessions
-- (target_listener_id IS NOT NULL) from everyone but the creator and the target. A letter-sourced
-- /live round would then be refused for the joiner. The helper reads the row once as owner.
-- STABLE, fail-closed on every NULL.
CREATE OR REPLACE FUNCTION public.p1278_live_verification_admissible(
  p_session  uuid,
  p_speaker  uuid,
  p_listener uuid,
  p_story    uuid,
  p_version  uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT p_session  IS NOT NULL
     AND p_speaker  IS NOT NULL
     AND p_listener IS NOT NULL
     AND p_speaker IS DISTINCT FROM p_listener
     AND auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.clarity_sessions s
        WHERE s.id = p_session
          AND s.creator_profile_id IS NOT NULL
          AND s.joiner_profile_id  IS NOT NULL
          AND auth.uid() IN (s.creator_profile_id, s.joiner_profile_id)
          AND p_speaker  IN (s.creator_profile_id, s.joiner_profile_id)
          AND p_listener IN (s.creator_profile_id, s.joiner_profile_id)
          -- A storyless exchange is legitimate (P413 made story_id nullable for loose
          -- paraphrase rounds). A story that IS named must belong to someone in the room,
          -- or update_story_understood_count moves a stranger's public counter.
          AND (
            p_story IS NULL
            OR EXISTS (
              SELECT 1
                FROM public.stories st
               WHERE st.id = p_story
                 AND st.author_id IN (s.creator_profile_id, s.joiner_profile_id)
            )
          )
     )
     -- A version, when present, must be a version OF that story. `=` against a NULL p_story
     -- yields NULL, so "a version with no story" fails closed.
     AND (
       p_version IS NULL
       OR EXISTS (
         SELECT 1
           FROM public.story_versions v
          WHERE v.id = p_version
            AND v.story_id = p_story
       )
     );
$$;

REVOKE ALL ON FUNCTION public.p1278_live_verification_admissible(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.p1278_live_verification_admissible(uuid, uuid, uuid, uuid, uuid) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.p1278_live_verification_admissible(uuid, uuid, uuid, uuid, uuid) TO authenticated;

-- ============================================================================
-- The policy
-- ============================================================================
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
    -- Branch 2 — /live calibration. P1278.
    -- delivery_id IS NULL keeps a live row outside P1067's partial unique index
    -- (delivery_id, story_id) WHERE source = 'letter' AND delivery_id IS NOT NULL, and stops a
    -- live-shaped row being used to occupy a letter delivery slot.
    (
      source = 'live'
      AND verified = true
      AND session_id IS NOT NULL
      AND delivery_id IS NULL
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
  v_cfg text[];
BEGIN
  -- P1150's invariant, preserved: a second permissive INSERT policy would OR in silently.
  SELECT count(*) INTO v_insert_policies
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'story_verifications' AND cmd = 'INSERT';
  IF v_insert_policies <> 1 THEN
    RAISE EXCEPTION 'P1278: expected exactly 1 INSERT policy on story_verifications, found %', v_insert_policies;
  END IF;

  -- The letter branch must still carry every conjunct P1150 B added.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'story_verifications'
       AND policyname = 'story_verifications_insert'
       AND with_check LIKE '%p1150_letter_rating_admissible%'
       AND with_check LIKE '%delivery_id IS NOT NULL%'
       AND with_check LIKE '%listener_rating IS NOT NULL%'
       AND with_check LIKE '%speaker_rating = 0%'
  ) THEN
    RAISE EXCEPTION 'P1278: the letter branch lost a P1150 conjunct';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'story_verifications'
       AND policyname = 'story_verifications_insert'
       AND with_check LIKE '%p1278_live_verification_admissible%'
  ) THEN
    RAISE EXCEPTION 'P1278: the live branch is missing';
  END IF;

  -- The letter helper must still exist with P1150 B's 4-argument signature and its grants.
  IF NOT has_function_privilege('authenticated', 'public.p1150_letter_rating_admissible(uuid, uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1278: authenticated lost EXECUTE on the letter helper';
  END IF;
  IF has_function_privilege('anon', 'public.p1150_letter_rating_admissible(uuid, uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1278: anon gained EXECUTE on the letter helper';
  END IF;

  SELECT p.proconfig INTO v_cfg FROM pg_proc p
   WHERE p.oid = 'public.p1278_live_verification_admissible(uuid, uuid, uuid, uuid, uuid)'::regprocedure;
  IF v_cfg IS NULL OR NOT ('search_path=""' = ANY(v_cfg) OR 'search_path=' = ANY(v_cfg)) THEN
    RAISE EXCEPTION 'P1278: live helper search_path is % — expected empty', v_cfg;
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.p1278_live_verification_admissible(uuid, uuid, uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1278: authenticated cannot EXECUTE the live helper — every /live row would be refused';
  END IF;
  IF has_function_privilege('anon', 'public.p1278_live_verification_admissible(uuid, uuid, uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1278: anon can EXECUTE the live helper';
  END IF;

  -- Fail-closed with no caller identity (this block runs without a JWT: auth.uid() is NULL).
  IF public.p1278_live_verification_admissible(
       gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), NULL, NULL) THEN
    RAISE EXCEPTION 'P1278: live helper admitted a row with no caller identity';
  END IF;

  RAISE NOTICE 'P1278: /live calibration rows are admitted when both actors are the named session''s participants and the caller is one of them; the letter branch is unchanged.';
END;
$$;
