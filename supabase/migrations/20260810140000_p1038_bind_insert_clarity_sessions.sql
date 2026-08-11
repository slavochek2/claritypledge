-- P1038: clarity_sessions INSERT policy does not bind creator_profile_id
--
-- Same bug class as P1032 (stories/points) and P1034 (story_points): the
-- INSERT policy checks that the caller is a verified user (plus letter-sourced
-- conditionals) but never that the row's own creator_profile_id names the
-- caller — while the sibling UPDATE policy on the same table
-- (clarity_sessions_creator_update) already binds it via
-- `auth.uid() IN (target_listener_id, creator_profile_id)`.
--
-- Canary: e2e/integration/p1038-reproduce-clarity_sessions.spec.ts — observed
-- failing against the unfixed policy (forged INSERT succeeded, error: null)
-- before this migration was written. Detail: .private/docs/security-log.md,
-- "2026-08-10 — clarity_sessions INSERT policy does not bind creator_profile_id".
--
-- Fix: AND in `(creator_profile_id IS NULL OR creator_profile_id = auth.uid())`.
-- NULL is allowed (not `NOT NULL AND = auth.uid()`) because two live client
-- paths (clarity-demo-page.tsx, clarity-chat-page.tsx) insert without a
-- creator_profile_id today — see the client-safe audit below. What must never
-- be true is a caller-supplied value naming a DIFFERENT profile.

-- client-safe: every client insert path into clarity_sessions was checked
-- (src/app/data/api.ts createClaritySession, grepped for all callers):
--   - src/app/pages/clarity-live-page.tsx:3115 — creator_profile_id: user?.id
--     (current authenticated user's own id; production /live create path)
--   - src/app/components/letters/start-clarity-session-button.tsx:67 — senderId,
--     only rendered when perspective === 'sender' (src/app/components/letters/
--     story-walk.tsx:118), i.e. the current viewer IS the letter's sender — own id
--   - src/app/pages/clarity-demo-page.tsx:120 — passes `inviteNote` (not a
--     profile id) into the creatorProfileId parameter slot; resolves to NULL
--     whenever inviteNote is empty (the common case) or to a malformed-UUID
--     INSERT error otherwise. Pre-existing, unrelated bug — not fixed here.
--   - src/app/pages/clarity-chat-page.tsx:445 — no creatorProfileId argument;
--     resolves to NULL. File is not imported/routed from App.tsx (orphaned).
--   - src/app/prototypes/events/components/PracticeRooms.tsx:64 — currentUserId
--     (own id); component is not wired into any production route (prototypes/ tree)
-- No path sends a caller-supplied value naming a DIFFERENT profile as
-- creator_profile_id — this is not the badge_points insert-on-behalf-of-another
-- shape. Two paths legitimately send NULL, which is why the predicate below
-- allows NULL rather than requiring NOT NULL.

DROP POLICY IF EXISTS "clarity_sessions_verified_host_insert" ON clarity_sessions;

CREATE POLICY "clarity_sessions_verified_host_insert"
  ON clarity_sessions FOR INSERT
  WITH CHECK (
    -- Verified host required for all sessions
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND is_verified = true
    )
    -- P1038: creator_profile_id, if set, must name the caller — never another profile
    AND (
      creator_profile_id IS NULL
      OR creator_profile_id = auth.uid()
    )
    -- If letter-sourced: caller must be the letter sender
    AND (
      source_letter_id IS NULL
      OR EXISTS (
        SELECT 1 FROM clarity_letters
        WHERE id = source_letter_id
          AND sender_id = auth.uid()
      )
    )
    -- If letter-sourced with target_listener: listener must be a delivery recipient
    AND (
      source_letter_id IS NULL
      OR target_listener_id IS NULL
      OR EXISTS (
        SELECT 1 FROM letter_deliveries
        WHERE letter_id = source_letter_id
          AND receiver_profile_id = target_listener_id
      )
    )
  );
