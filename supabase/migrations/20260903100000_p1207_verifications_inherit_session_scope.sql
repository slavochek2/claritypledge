-- Migration: P1207 F11 — clarity_verifications must follow its session's visibility
-- Created: 2026-09-03
-- Spec: features/p1207_adversarial_permission_audit_before_agent_api.md
-- Audit: docs/audits/p1207-phase1-findings.md (F11; F7 resolved into it)
--
-- F10 scoped the session's direct children (demo_rounds, ideas, live_turns). It MISSED the
-- grandchild: clarity_verifications hangs off clarity_chat_messages, which hangs off the
-- session. So the fix stopped one join short.
--
-- The resulting state is self-evidently unintended rather than a design choice:
--   clarity_chat_messages   RLS enabled, NO SELECT policy at all -> default-deny, anon reads nothing
--   clarity_verifications   "Verifications are viewable by everyone"  cmd=SELECT  qual=true
-- The MESSAGE is private. The PARAPHRASE OF THAT MESSAGE is world-readable, together with the
-- verifier's name and their self_rating. Nobody designs that on purpose.
--
-- This also resolves F7. Phase 1 filed F7 as "clarity_verifications.session_id is anon-readable
-- on prod" and Phase 2 reclassified it as a product question ("should verifications be public?").
-- It was never a product question: the neighbouring table already answers it. Checking the
-- artifact instead of asking the founder is what surfaced that — the same check that retracted
-- F3, F4 and F8.
--
-- Reuses can_read_clarity_session() from F10 rather than restating the rule, for the same reason
-- F10 did: a parent and its descendants that state the rule separately are a parent and its
-- descendants that will drift apart. That drift is this entire finding.
--
-- client-safe: no client change needed. clarity-chat-page.tsx reads verifications only for
-- messages in the session the user is currently in, and for the anonymous /live flow that
-- session has target_listener_id IS NULL, which can_read_clarity_session admits unchanged. The
-- only reads that stop working are cross-session reads of DIRECTED sessions, which no client
-- performs — those are the leak.
--
-- INSERT is deliberately NOT touched. Its with_check is already auth.uid() IS NOT NULL, and
-- narrowing the write path is a separate question with its own blast radius (it is the same
-- provenance gap P1100 tracks on story_verifications). Reported, not bundled.

DROP POLICY IF EXISTS "Verifications are viewable by everyone" ON public.clarity_verifications;

CREATE POLICY "Verifications follow their session's visibility"
  ON public.clarity_verifications FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clarity_chat_messages m
      WHERE m.id = clarity_verifications.message_id
        AND can_read_clarity_session(m.session_id)
    )
  );

COMMENT ON POLICY "Verifications follow their session's visibility" ON public.clarity_verifications IS
  'P1207 F11: a verification is session content one join further out than F10 reached. The chat '
  'message it paraphrases is already default-denied to anon; publishing the paraphrase while '
  'hiding the message is not a design. Do not restore a qual=true read here.';
