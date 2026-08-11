-- ============================================================================
-- P1042: Drop prod-only drifted RLS policies (converge prod to test)
-- ============================================================================
-- Found by a live prod-vs-test pg_policies diff during the P1038 audit.
-- Four PERMISSIVE policies exist on prod but not test. Permissive policies OR
-- together, so each one silently defeats the tightened policy beside it.
--
--   clarity_sessions      "Anyone can read sessions"            SELECT qual=true
--   clarity_feed_ideas    "Anyone can update feed ideas"        UPDATE qual=true
--   clarity_idea_comments "Anyone can update comments"          UPDATE qual=true
--   clarity_idea_votes    "Anyone can update their own votes"   UPDATE qual=true
--
-- Two distinct drift origins:
--   1. The three UPDATE policies are dropped by 20260211_tighten_idea_feed_rls.sql,
--      which deploy-manifest.json records as APPLIED TO PROD. Test reflects the
--      drops; prod does not. The manifest is not evidence of live state.
--   2. clarity_sessions "Anyone can read sessions" appears in NO migration at all
--      (grep matches only a comment at 20250101_initial_schema.sql:155 describing a
--      differently-named policy that P703 correctly dropped). Applied out-of-band.
--
-- This migration is idempotent and safe to run against test, where it is a no-op.
--
-- client-safe: DROP-only. Verified before writing:
--   * clarity_sessions retains clarity_sessions_select, whose first branch is
--     (target_listener_id IS NULL) — anonymous/guest reads of practice rooms are
--     unaffected. Only the 14 letter-sourced private rows become non-public.
--   * clarity_feed_ideas and clarity_idea_comments lose UPDATE entirely, matching
--     test and 20260211's stated intent (both are immutable after creation).
--     Verified no caller: grep for .update()/.upsert() on either table across
--     src/ returns zero hits.
--   * clarity_idea_votes retains "Voters can update their own votes". NOTE: that
--     replacement is itself USING(true) WITH CHECK(true) — a documented, accepted
--     limitation (anonymous sessions, app-layer enforcement in api.ts). Dropping
--     the duplicate here is hygiene, NOT a security fix for that table.
--
-- Does NOT address: clarity_sessions UPDATE-side creator_profile_id forgery
-- (separate finding, separate spec). See .private/docs/security-log.md.
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can read sessions" ON public.clarity_sessions;
DROP POLICY IF EXISTS "Anyone can update feed ideas" ON public.clarity_feed_ideas;
DROP POLICY IF EXISTS "Anyone can update comments" ON public.clarity_idea_comments;
DROP POLICY IF EXISTS "Anyone can update their own votes" ON public.clarity_idea_votes;
