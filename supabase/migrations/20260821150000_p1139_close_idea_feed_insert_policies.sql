-- Migration: P1139 — close idea-feed INSERT policies with an unconditional write predicate
-- Created: 2026-08-21
-- Description:
--   Drop the four INSERT policies on the idea-feed table family (clarity_feed_ideas,
--   clarity_idea_comments, clarity_idea_votes, clarity_idea_vote_history). Each carries
--   an unconditional predicate (WITH CHECK(true), no TO <role> scope), unchanged since
--   table creation. 20260211_tighten_idea_feed_rls.sql tightened this same family's
--   UPDATE side but never touched INSERT.
--
--   Same fix shape as P1138's UPDATE-side dead-code drops: dropping a PERMISSIVE
--   policy leaves RLS with zero matching policies for INSERT on these tables, which
--   is a default-deny — the table-level INSERT grant anon/authenticated hold becomes
--   moot without a policy to admit any row. No REVOKE needed; matches the P1138
--   migration's pattern (policy-only fix for a dead-code write path).
--
-- Spec: features/p1139_idea_feed_insert_policies_unconditional.md
--
-- client-safe: every DB-touching idea-feed function in src/app/data/api.ts
-- (createFeedIdea, voteOnIdea, addIdeaComment, elevateCommentToIdea, getFeedIdeas,
-- getIdeaComments, getIdeaVoters, getVoteHistory, subscribeToFeed) has ZERO callers
-- repo-wide, verified before writing this migration (whole-repo grep, only hits are
-- api.ts's own internal calls and a unit test covering the localStorage helpers).
-- /feed is P491's unrelated hashtag feed. There is no legitimate client write path
-- on any of these four tables to preserve.

DROP POLICY IF EXISTS "Anyone can create feed ideas" ON public.clarity_feed_ideas;
DROP POLICY IF EXISTS "Anyone can insert comments" ON public.clarity_idea_comments;
DROP POLICY IF EXISTS "Anyone can insert votes" ON public.clarity_idea_votes;
DROP POLICY IF EXISTS "Anyone can insert vote history" ON public.clarity_idea_vote_history;
