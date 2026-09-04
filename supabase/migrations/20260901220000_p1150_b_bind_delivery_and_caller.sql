-- P1150 (part B): bind the letter rating to the caller's OWN delivery, and stop the helper
-- from answering questions about other users.
--
-- diffed against: 20260901210000_p1150_bind_story_verification_counterparty.sql
--   Helper: p_listener parameter REMOVED — the caller's identity is read from auth.uid()
--   inside the function; p_delivery is now REQUIRED (NOT NULL) and must be that caller's
--   delivery on the letter; `SET search_path = ''` with every reference schema-qualified;
--   EXECUTE to authenticated only (service_role bypasses RLS and never needs it).
--   Policy: adds `delivery_id IS NOT NULL` and `listener_rating IS NOT NULL`.
--
-- requires-frontend: 915065c7
--   Deployed clients before that commit (letters-service.ts submitRating / submitLetterResponseAuthenticated)
--   do NOT send delivery_id, so this policy would refuse every letter rating until
--   the frontend that sends it is live. The marker is repointed to the commit that adds it once
--   that commit exists (P1057 Migration B precedent); migrate.sh holds prod until then.
--
-- Codex review of P1150 (FIX FIRST), both verified by the lead — two findings against the
-- part-A helper, an enumeration oracle over the letter relations and an unbounded-insert
-- wildcard. Mechanics + measurement (prod not yet remediated as of this writing):
-- .private/docs/security-log.md § 2026-09-04.
--
-- Fix: the helper only ever answers about auth.uid(); the delivery is mandatory and must be
-- the caller's on that letter, so every admitted row falls under P1067's unique index
-- (delivery_id, story_id) WHERE source = 'letter' AND delivery_id IS NOT NULL — the second
-- rating of the same story through the same delivery is a 23505, and the AFTER INSERT counters
-- trigger never runs for it. listener_rating NOT NULL closes a row that records nothing.
--
-- Canary: e2e/integration/p1150-story-verification-counterparty.spec.ts (extended).

DROP POLICY IF EXISTS "story_verifications_insert" ON public.story_verifications;
DROP FUNCTION IF EXISTS public.p1150_letter_rating_admissible(uuid, uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.p1150_letter_rating_admissible(
  p_story    uuid,
  p_speaker  uuid,
  p_version  uuid,
  p_delivery uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT p_story IS NOT NULL
     AND p_speaker IS NOT NULL
     AND p_delivery IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.letter_deliveries d
         JOIN public.clarity_letters l
           ON l.id = d.letter_id
         JOIN public.letter_story_snapshots s
           ON s.letter_id = l.id AND s.story_id = p_story
        WHERE d.id = p_delivery
          AND d.receiver_profile_id = auth.uid()
          AND l.sender_id = p_speaker
          AND (p_version IS NULL OR s.version_id = p_version)
     );
$$;

REVOKE ALL ON FUNCTION public.p1150_letter_rating_admissible(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.p1150_letter_rating_admissible(uuid, uuid, uuid, uuid) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.p1150_letter_rating_admissible(uuid, uuid, uuid, uuid) TO authenticated;

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
    AND listener_rating IS NOT NULL
    AND delivery_id IS NOT NULL
    AND public.p1150_letter_rating_admissible(story_id, speaker_id, version_id, delivery_id)
  );

-- ============================================================================
-- Verification
-- ============================================================================
DO $$
DECLARE
  v_insert_policies integer;
  v_cfg text[];
BEGIN
  SELECT count(*) INTO v_insert_policies
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'story_verifications' AND cmd = 'INSERT';
  IF v_insert_policies <> 1 THEN
    RAISE EXCEPTION 'P1150 B: expected exactly 1 INSERT policy on story_verifications, found %', v_insert_policies;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'story_verifications'
       AND policyname = 'story_verifications_insert'
       AND with_check LIKE '%delivery_id IS NOT NULL%'
       AND with_check LIKE '%listener_rating IS NOT NULL%'
  ) THEN
    RAISE EXCEPTION 'P1150 B: policy does not require delivery_id and listener_rating';
  END IF;

  -- The 5-arg oracle must be gone.
  IF EXISTS (SELECT 1 FROM pg_proc WHERE oid = to_regprocedure('public.p1150_letter_rating_admissible(uuid, uuid, uuid, uuid, uuid)')) THEN
    RAISE EXCEPTION 'P1150 B: the 5-argument helper still exists';
  END IF;

  SELECT p.proconfig INTO v_cfg FROM pg_proc p
   WHERE p.oid = 'public.p1150_letter_rating_admissible(uuid, uuid, uuid, uuid)'::regprocedure;
  IF v_cfg IS NULL OR NOT ('search_path=""' = ANY(v_cfg) OR 'search_path=' = ANY(v_cfg)) THEN
    RAISE EXCEPTION 'P1150 B: helper search_path is % — expected empty', v_cfg;
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.p1150_letter_rating_admissible(uuid, uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1150 B: authenticated cannot EXECUTE the helper — every letter rating would be refused';
  END IF;
  IF has_function_privilege('anon', 'public.p1150_letter_rating_admissible(uuid, uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1150 B: anon can EXECUTE the helper';
  END IF;

  -- Fail-closed with no caller identity (this block runs without a JWT: auth.uid() is NULL).
  IF public.p1150_letter_rating_admissible(gen_random_uuid(), gen_random_uuid(), NULL, gen_random_uuid()) THEN
    RAISE EXCEPTION 'P1150 B: helper admitted a row with no caller identity';
  END IF;

  RAISE NOTICE 'P1150 B: letter ratings are bound to the caller''s own delivery; helper answers only about auth.uid().';
END;
$$;
