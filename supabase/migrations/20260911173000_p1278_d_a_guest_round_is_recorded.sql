-- P1278 D: a /live round with a guest is recorded. The signed-in creator writes it, and the guest's side
-- of the row is NULL.
--
-- diffed against: 20260909093000_p1278_admit_live_calibration_insert.sql (p1278_live_verification_admissible)
--   diff: the participant test gains a second arm. Arm 1 is P1278 A unchanged (two signed-in
--   participants, either may write). Arm 2 admits a guest in the joiner seat: joiner_profile_id IS NULL,
--   the seat is occupied (joiner_seat_claimed_at IS NOT NULL), the room is still open (ended_at IS NULL
--   and status 'active' or NULL), the caller IS the creator, and exactly one of speaker/listener is the
--   creator while the other is NULL. The story and version conjuncts, SECURITY
--   DEFINER, search_path = '' and the grants are unchanged.
-- diffed against: 20260616120000_p940_ear_metric_per_story.sql (update_profile_ears_count)
--   diff: the listener update runs only when listener_id IS NOT NULL, and the speaker update's test
--   becomes `speaker_id IS NOT NULL AND speaker_id IS DISTINCT FROM listener_id` — `!=` against a NULL
--   listener is NULL and would silently skip the speaker. The recompute itself is byte-for-byte.
-- diffed against: 20260910110000_p1278_b_live_verification_visible_to_its_participants.sql
--   (policy "Verifications visible when story visible")
--   diff: the story-visibility disjunct additionally requires both participants to be named, so a guest
--   round is visible only to its creator (the participant disjunct) and never published through a public
--   story. Changed with ALTER POLICY; the letter arm and the participant disjunct are byte-for-byte.
-- diffed against: 20260627120000_p967_listener_calibration_rpc.sql (get_my_listener_calibration_diffs)
--   diff: `JOIN profiles` becomes `LEFT JOIN profiles`, so a round whose speaker was a guest stays in the
--   breakdown with a NULL speaker name. Grants re-asserted exactly as 20260627130000 left them.
--
-- client-safe: widens only. Every row a deployed client writes today names two participants and is
--   admitted exactly as before; a deployed client returns early on a missing profile id, so it never sends
--   a NULL participant and cannot observe the change. The one reader shape that changes is the breakdown
--   RPC, which can now return a row with a NULL speaker name — the page that renders it changes in the
--   same release, and until then such a row can only exist once this migration is applied.
--
-- ---------------------------------------------------------------------------------------
-- THE DECISION, AND THE SHAPE CHOSEN
-- ---------------------------------------------------------------------------------------
-- Founder, 2026-09-09: "guests may record; recordings are accepted from signed-in users AND guests;
-- guest-origin rows must remain distinguishable so they can be filtered later; I don't want to
-- overcomplicate it." Founder, 2026-09-11: build it.
--
-- The spec sketched a SECURITY DEFINER RPC the guest's own anonymous client would call. This does not
-- do that, because nothing needs it: a guest's round always has a signed-in creator in the same room,
-- that creator's client already holds both ratings when the round is revealed, and it can write through
-- the existing INSERT policy with its own identity. So there is NO new anonymous write surface, no seat
-- secret to present, and exactly one row per guest round — the guest's client has no user and never
-- writes. A guest is marked by the field the spec named: a NULL participant id. No new column.
--
-- Guests can only ever hold the JOINER seat: every clarity_sessions INSERT policy requires
-- creator_profile_id IS NOT NULL.
--
-- ---------------------------------------------------------------------------------------
-- WHAT A GUEST ROUND MOVES, AND WHAT IT CANNOT
-- ---------------------------------------------------------------------------------------
--   verification_session_count  the creator's, once per round. The guest has no profile to move.
--   ears_count                  distinct STORIES a listener was rated on. A guest listener has no
--                               profile; a creator listening to a guest speaks about no story of the
--                               guest's (a guest has none), so a storyless round moves nothing.
--   stories.understood_count    COUNT(DISTINCT listener_id) — NULL is not counted, so a guest who
--                               understood a story never inflates its number.
--   calibration                 the creator's averages include rounds with a guest (they already read the
--                               table without a join), and the breakdown now lists them too, so the page
--                               stays faithful to those averages (the P967 invariant).
-- The creator can still inflate their own session count by writing rounds — exactly as two signed-in
-- users can. A guest seat is no cheaper: it has to be occupied in a room the creator made.
--
-- Two conditions were added after adversarial review (codex, 2026-09-11), both measured:
--   * The room must still be open. complete_clarity_session stamps ended_at but leaves the seat stamp,
--     and erase_my_account nulls a departing JOINER's profile id and cancels the room while leaving the
--     seat stamp — so without ended_at IS NULL, an ended room, or a room whose signed-in joiner erased
--     their account, would read as "a guest is seated" forever. The status test is POSITIVE — only
--     'active' or NULL — rather than "not cancelled": status is client-updatable under P1047, so a room
--     marked 'completed' without an end stamp must not qualify either (codex, second pass).
--   * A guest round is never published. The SELECT policy's story-visibility disjunct shows every row
--     about a public story to anyone; a guest never agreed to that, so that disjunct now requires both
--     participants to be named. The creator still reads their own guest rounds through the participant
--     disjunct. Nothing in the app lists a public story's verification rows today, so no screen changes.
--
-- The CHECK below makes the guest marker unambiguous: at most one participant may be NULL, and only on a
-- live row. Letter rows are untouched — both of their participants are always named.

ALTER TABLE public.story_verifications
  ALTER COLUMN speaker_id  DROP NOT NULL,
  ALTER COLUMN listener_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.story_verifications'::regclass
                    AND conname = 'story_verifications_guest_side_only_on_live') THEN
    ALTER TABLE public.story_verifications
      ADD CONSTRAINT story_verifications_guest_side_only_on_live
      CHECK (num_nonnulls(speaker_id, listener_id) = 2
             OR (source = 'live' AND num_nonnulls(speaker_id, listener_id) = 1));
  END IF;
END
$$;

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
  SELECT p_session IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND (p_speaker IS NOT NULL OR p_listener IS NOT NULL)
     AND p_speaker IS DISTINCT FROM p_listener
     AND EXISTS (
       SELECT 1
         FROM public.clarity_sessions s
        WHERE s.id = p_session
          AND s.creator_profile_id IS NOT NULL
          AND (
                -- Arm 1 (P1278 A, unchanged): two signed-in participants, either of whom may write.
                (    s.joiner_profile_id IS NOT NULL
                 AND p_speaker  IS NOT NULL
                 AND p_listener IS NOT NULL
                 AND auth.uid() IN (s.creator_profile_id, s.joiner_profile_id)
                 AND p_speaker  IN (s.creator_profile_id, s.joiner_profile_id)
                 AND p_listener IN (s.creator_profile_id, s.joiner_profile_id))
             OR
                -- Arm 2 (P1278 D): a guest holds the joiner seat. It has no profile, so the row names
                -- only the creator and leaves the guest's side NULL — and only the creator may write it.
                (    s.joiner_profile_id IS NULL
                 AND s.joiner_seat_claimed_at IS NOT NULL
                 AND s.ended_at IS NULL
                 AND COALESCE(s.status, 'active') = 'active'
                 AND auth.uid() = s.creator_profile_id
                 AND (   (p_speaker  = s.creator_profile_id AND p_listener IS NULL)
                      OR (p_listener = s.creator_profile_id AND p_speaker  IS NULL)))
              )
          -- A storyless exchange is legitimate (P413). A story that IS named must belong to someone in
          -- the room — in a guest room that can only be the creator.
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
     -- A version, when present, must be a version OF that story.
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

ALTER POLICY "Verifications visible when story visible"
  ON public.story_verifications
  USING (
    CASE
      WHEN source = 'letter' THEN
        -- P581, unchanged: visible only to the speaker (sender) or listener (receiver).
        speaker_id = auth.uid() OR listener_id = auth.uid()
      ELSE
        -- P1278 B, unchanged: the two participants of the exchange.
        (
          auth.uid() IS NOT NULL
          AND (speaker_id = auth.uid() OR listener_id = auth.uid())
        )
        OR
        -- P586/P581 story-visibility rule — P1278 D: only for a round that names both participants.
        -- A guest round is never published through a public story.
        (
          num_nonnulls(speaker_id, listener_id) = 2
          AND EXISTS (
            SELECT 1 FROM public.stories
            WHERE stories.id = story_verifications.story_id
              AND (stories.visibility = 'public'::content_visibility OR stories.author_id = auth.uid())
          )
        )
    END
  );

REVOKE ALL ON FUNCTION public.p1278_live_verification_admissible(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.p1278_live_verification_admissible(uuid, uuid, uuid, uuid, uuid) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.p1278_live_verification_admissible(uuid, uuid, uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION update_profile_ears_count()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ears_count = distinct stories this listener has been rated on (any score).
  -- Recompute from source on every insert: idempotent, no dedup-state bookkeeping,
  -- no drift. NEW row is already visible (AFTER INSERT), so it is included.
  -- P1278 D: a guest round leaves one participant NULL; only a named participant moves.
  IF NEW.listener_id IS NOT NULL THEN
    UPDATE profiles
    SET
      ears_count = (
        SELECT COUNT(DISTINCT story_id)
        FROM story_verifications
        WHERE listener_id = NEW.listener_id
          AND story_id IS NOT NULL
      ),
      verification_session_count = verification_session_count + 1
    WHERE id = NEW.listener_id;
  END IF;

  -- Speaker's session count. IS DISTINCT FROM, not !=: against a NULL listener, != is NULL and would
  -- silently skip the speaker.
  IF NEW.speaker_id IS NOT NULL AND NEW.speaker_id IS DISTINCT FROM NEW.listener_id THEN
    UPDATE profiles
    SET verification_session_count = verification_session_count + 1
    WHERE id = NEW.speaker_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_my_listener_calibration_diffs()
RETURNS TABLE (
  id             UUID,
  story_id       UUID,
  listener_rating SMALLINT,
  speaker_rating  SMALLINT,
  speaker_name   TEXT,
  speaker_slug   TEXT,
  story_title    TEXT,
  created_at     TIMESTAMPTZ,
  sort_order     INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sv.id,
    sv.story_id,
    sv.listener_rating,
    sv.speaker_rating,
    p.name::TEXT       AS speaker_name,
    p.slug::TEXT       AS speaker_slug,
    NULL::TEXT         AS story_title,
    sv.created_at,
    sv.sort_order
  FROM story_verifications sv
  -- P1278 D: LEFT, so a round whose speaker was a guest (no profile) stays in the breakdown.
  LEFT JOIN profiles p ON p.id = sv.speaker_id
  LEFT JOIN stories s ON s.id = sv.story_id
  WHERE sv.listener_id = auth.uid()
    AND sv.speaker_rating IS NOT NULL
    AND sv.listener_rating IS NOT NULL
    -- eligibility: matches get_my_listener_calibration_diffs WHERE clause
  ORDER BY sv.created_at DESC;
$$;

REVOKE ALL ON FUNCTION get_my_listener_calibration_diffs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_listener_calibration_diffs() TO authenticated;

-- ============================================================================
-- Verification — fail loud, in the migration itself
-- ============================================================================
DO $$
DECLARE
  v_src  text;
  v_def  text;
  v_n    int;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'story_verifications'
                AND column_name IN ('speaker_id', 'listener_id') AND is_nullable = 'NO') THEN
    RAISE EXCEPTION 'P1278 D: a story_verifications participant column is still NOT NULL';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
   WHERE conrelid = 'public.story_verifications'::regclass
     AND conname = 'story_verifications_guest_side_only_on_live';
  IF v_def IS NULL OR v_def NOT ILIKE '%num_nonnulls(speaker_id, listener_id) = 2%'
     OR v_def NOT ILIKE '%source = ''live''%' THEN
    RAISE EXCEPTION 'P1278 D: the guest-side CHECK is missing or changed: %', v_def;
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc
   WHERE oid = 'public.p1278_live_verification_admissible(uuid, uuid, uuid, uuid, uuid)'::regprocedure;
  IF v_src NOT LIKE '%s.joiner_seat_claimed_at IS NOT NULL%'
     OR v_src NOT LIKE '%s.ended_at IS NULL%'
     OR v_src NOT LIKE '%COALESCE(s.status, ''active'') = ''active''%'
     OR v_src NOT LIKE '%auth.uid() = s.creator_profile_id%'
     OR v_src NOT LIKE '%auth.uid() IN (s.creator_profile_id, s.joiner_profile_id)%' THEN
    RAISE EXCEPTION 'P1278 D: the admission function lost an arm or its caller binding';
  END IF;
  IF has_function_privilege('anon', 'public.p1278_live_verification_admissible(uuid, uuid, uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1278 D: anon can execute the admission function';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.update_profile_ears_count()'::regprocedure;
  IF v_src NOT LIKE '%IF NEW.listener_id IS NOT NULL THEN%'
     OR v_src NOT LIKE '%NEW.speaker_id IS DISTINCT FROM NEW.listener_id%' THEN
    RAISE EXCEPTION 'P1278 D: update_profile_ears_count lost a NULL guard — a guest round would skip or crash the speaker update';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = 'public.get_my_listener_calibration_diffs()'::regprocedure;
  IF v_src NOT LIKE '%LEFT JOIN profiles p ON p.id = sv.speaker_id%' THEN
    RAISE EXCEPTION 'P1278 D: the breakdown RPC drops guest-speaker rounds again — the page would disagree with the averages';
  END IF;
  IF has_function_privilege('anon', 'public.get_my_listener_calibration_diffs()', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1278 D: anon can execute the breakdown RPC';
  END IF;

  SELECT qual INTO v_def FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'story_verifications'
     AND policyname = 'Verifications visible when story visible';
  IF v_def IS NULL OR v_def NOT LIKE '%num_nonnulls(speaker_id, listener_id) = 2%'
     OR v_def NOT LIKE '%source = ''letter''%' OR v_def NOT LIKE '%visibility = ''public''%' THEN
    RAISE EXCEPTION 'P1278 D: the SELECT policy would publish a guest round, or lost its letter or visibility arm: %', v_def;
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'story_verifications' AND cmd = 'SELECT';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'P1278 D: expected exactly one SELECT policy on story_verifications, found %', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'story_verifications' AND cmd = 'INSERT';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'P1278 D: expected exactly one INSERT policy on story_verifications (the P1150 invariant), found %', v_n;
  END IF;

  RAISE NOTICE 'P1278 D: a guest round is admitted from the signed-in creator with the guest side NULL; counters move only for named participants.';
END;
$$;
