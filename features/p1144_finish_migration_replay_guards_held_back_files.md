---
status: backlog
type: task
rank: 103
created_date: '2026-08-21'
tags: [migrations, rls, security, idempotency]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
severity: medium
feature_type: backend
---

# P1144: Finish the migration replay guards P1132 held back

## Problem

**Situation:** [P1132](p1132_migration_chain_cannot_replay_from_empty.md) added idempotency
guards to 6 migration files so a from-empty database build doesn't error out. 4 of 6 are
committed and verified. The remaining 2 — `supabase/migrations/20251218_p19_3_idea_feed.sql`
and `supabase/migrations/20260223_p396_host_rls_and_session_constraints.sql` — have their
guard SQL already written and verified working live (via `supabase start` from an empty
database, this session), but committing them requires an `-- intentionally-public:` RLS
annotation to pass the P1039 pre-commit gate, and that determination is a security call
outside P1132's guard-only scope. P1132 tried to make that call anyway on 2026-08-21, got it
wrong (cited the wrong precedent — an adversarial review caught it before it shipped), and
reverted.

**Complication:** The correct answer to "is this policy intentionally public" now depends on
work that hasn't happened yet, tracked by two separate items — not this spec's to resolve,
only to wait on and then finish.

**Question:** Once those two things resolve, commit the already-written guard SQL and confirm
the full from-empty chain — P1132's original goal — actually works end to end.

## Appetite

Low blast radius (2 files, guard-only, same inert-on-live-DB argument as P1132's Appetite).
High reversibility (`git revert`). Zero decision density for THIS spec — the only open
questions belong to the two blocking items below, not here.

## Solution

1. Wait on [P1139](p1139_idea_feed_insert_policies_unconditional.md)'s `/reproduce` to
   determine, per policy, whether each of the 7 RLS policies in
   `20251218_p19_3_idea_feed.sql` is genuinely anonymous-by-design or needs scoping. Once
   settled, write the `-- intentionally-public:` (or scoped) annotation truthfully and commit
   the already-written publication-membership guards.
2. File and run `/reproduce` on the untriaged finding logged at
   `.private/docs/security-log.md` 2026-08-21 entry — not yet a P-number. Once settled,
   annotate and commit the already-written guards in
   `20260223_p396_host_rls_and_session_constraints.sql`.
3. Re-run the full from-empty `supabase start` verification P1132 did for the other 4 files,
   confirming the complete 6-file guard set (P1132's original scope) works together.

## Risks / Non-Goals

### Risks

- **Re-deciding the security question here instead of waiting for it.** Mitigation: this
  spec's Done-When is gated on the other two items actually resolving first — do not write an
  `intentionally-public` annotation from inference or precedent-matching; only from what
  `/reproduce` or the private-log item's own triage actually establishes.

### Non-Goals

- Do NOT re-litigate P1132's own guard SQL — it is already written and verified; this spec
  only unblocks committing it.
- Do NOT perform the RLS security triage inside this spec. That belongs to P1139 (already
  filed) and a new bug spec for the finding logged at `.private/docs/security-log.md`
  2026-08-21 (not yet filed — file it via `/create-bug` when picking this up, referencing
  that entry).

## Done-When

- [ ] `20251218_p19_3_idea_feed.sql`'s publication-membership guards are committed with a
      truthful annotation, sourced from P1139's `/reproduce` outcome
- [ ] `20260223_p396_host_rls_and_session_constraints.sql`'s guards are committed with a
      truthful annotation, sourced from a proper `/reproduce` on the finding logged at
      `.private/docs/security-log.md` 2026-08-21
- [ ] `supabase start` applies the full from-empty chain including all 6 P1132-scope guarded
      files with zero errors (subject to P1132's own remaining P1054 dependency for
      `ml_training_sessions`), wall-clock recorded here

## Preserved guard SQL (P1132 worktree `w4`, pre-teardown, 2026-08-21)

The worktree that had this diff live (`w4`, `feature/p1132-migration-replay-guards`) was
torn down when P1132 shipped. Neither file could be committed to any branch as-is — the
P1039 gate blocks them without an annotation this spec deliberately does not write. Saved
here so the work isn't lost. **Verify this still applies cleanly before reusing it** — both
files may have changed since 2026-08-21.

```diff
diff --git a/supabase/migrations/20251218_p19_3_idea_feed.sql b/supabase/migrations/20251218_p19_3_idea_feed.sql
index ccf3c469..4bf123f0 100644
--- a/supabase/migrations/20251218_p19_3_idea_feed.sql
+++ b/supabase/migrations/20251218_p19_3_idea_feed.sql
@@ -1,6 +1,9 @@
 -- P19.3: Idea Feed & Orphan Ideas
 -- Migration to add feed ideas, votes, vote history, and comments tables
 -- Run this in Supabase SQL Editor to apply changes
+-- client-safe: version-recorded and already applied on both live databases;
+-- the publication-membership guards below only execute on a from-empty
+-- build and are never re-run against a live DB (P1132 Appetite/Risks).
 
 -- ============================================================================
 -- IDEA FEED TABLES (P19.3 - Orphan Ideas)
@@ -46,7 +49,17 @@ CREATE POLICY "Anyone can update feed ideas"
   USING (true);
 
 -- Enable realtime for feed ideas
-ALTER PUBLICATION supabase_realtime ADD TABLE clarity_feed_ideas;
+DO $$
+BEGIN
+  IF NOT EXISTS (
+    SELECT 1 FROM pg_publication_tables
+     WHERE pubname = 'supabase_realtime'
+       AND schemaname = 'public'
+       AND tablename = 'clarity_feed_ideas'
+  ) THEN
+    ALTER PUBLICATION supabase_realtime ADD TABLE public.clarity_feed_ideas;
+  END IF;
+END $$;
 
 -- Comments on feed ideas
 CREATE TABLE IF NOT EXISTS public.clarity_idea_comments (
@@ -81,7 +94,17 @@ CREATE POLICY "Anyone can update comments"
   USING (true);
 
 -- Enable realtime for comments
-ALTER PUBLICATION supabase_realtime ADD TABLE clarity_idea_comments;
+DO $$
+BEGIN
+  IF NOT EXISTS (
+    SELECT 1 FROM pg_publication_tables
+     WHERE pubname = 'supabase_realtime'
+       AND schemaname = 'public'
+       AND tablename = 'clarity_idea_comments'
+  ) THEN
+    ALTER PUBLICATION supabase_realtime ADD TABLE public.clarity_idea_comments;
+  END IF;
+END $$;
 
 -- Add FK from feed_ideas to comments (for elevated_comment provenance)
 DO $$
@@ -132,7 +155,17 @@ CREATE POLICY "Anyone can update their own votes"
   USING (true);
 
 -- Enable realtime for votes
-ALTER PUBLICATION supabase_realtime ADD TABLE clarity_idea_votes;
+DO $$
+BEGIN
+  IF NOT EXISTS (
+    SELECT 1 FROM pg_publication_tables
+     WHERE pubname = 'supabase_realtime'
+       AND schemaname = 'public'
+       AND tablename = 'clarity_idea_votes'
+  ) THEN
+    ALTER PUBLICATION supabase_realtime ADD TABLE public.clarity_idea_votes;
+  END IF;
+END $$;
 
 -- Vote history (every vote change is recorded)
 CREATE TABLE IF NOT EXISTS public.clarity_idea_vote_history (
diff --git a/supabase/migrations/20260223_p396_host_rls_and_session_constraints.sql b/supabase/migrations/20260223_p396_host_rls_and_session_constraints.sql
index 8dddcc00..86a66693 100644
--- a/supabase/migrations/20260223_p396_host_rls_and_session_constraints.sql
+++ b/supabase/migrations/20260223_p396_host_rls_and_session_constraints.sql
@@ -1,5 +1,8 @@
 -- P396: Host RLS hardening + joiner_name length constraint
 -- Closes security hole for legacy guest-created sessions while enforcing verified-only hosting.
+-- client-safe: version-recorded and already applied on both live databases;
+-- the guards below only execute on a from-empty build and are never re-run
+-- against a live DB (P1132 Appetite/Risks).
 
 -- ============================================================================
 -- 1. INSERT policy — verified hosts only
@@ -9,6 +12,7 @@
 DROP POLICY IF EXISTS "Anyone can create sessions" ON public.clarity_sessions;
 
 -- Only verified users can create sessions
+DROP POLICY IF EXISTS "clarity_sessions_verified_host_insert" ON public.clarity_sessions;
 CREATE POLICY "clarity_sessions_verified_host_insert"
 ON public.clarity_sessions
 FOR INSERT
@@ -49,5 +53,7 @@ WITH CHECK (
 -- 3. joiner_name length constraint
 -- ============================================================================
 
+ALTER TABLE public.clarity_sessions
+DROP CONSTRAINT IF EXISTS joiner_name_length;
 ALTER TABLE public.clarity_sessions
 ADD CONSTRAINT joiner_name_length CHECK (length(joiner_name) <= 100);
```
