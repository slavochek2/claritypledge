---
status: in-progress
type: bug
rank: 57
severity: high
workstream: infrastructure
date_reported: '2026-08-21'
created_date: '2026-08-21'
tags: [rls, security, prod, data-integrity]
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: e2e/integration/p1139-reproduce.spec.ts
  root_cause: "Four INSERT policies created as `FOR INSERT WITH CHECK (true)` with no `TO <role>` scope and never revisited; the two later migrations that tightened this table family only touched UPDATE. anon holds the table-level INSERT grant, so the policy is the only gate. Confirmed empirically on test via the real unauthenticated REST path — not a policy-catalogue read. Crucially, unlike P1138's ml_training_sessions, NO table here has a legitimate client write path: every DB-touching idea-feed function in api.ts has zero callers repo-wide."
  confidence: high
  surfaces_in_scope: [clarity_feed_ideas, clarity_idea_comments, clarity_idea_votes, clarity_idea_vote_history]
  surfaces_deferred: []
  surface_audit_anchor: "createFeedIdea|voteOnIdea|addIdeaComment|elevateCommentToIdea|getFeedIdeas|subscribeToFeed"
  surface_audit_hits: 0
  scenarios_excluded: "clarity_idea_votes UPDATE — allowlisted founder decision (scripts/rls-drift-allowlist.txt). INSERT side is in scope."
  reproduced_at: '2026-08-21'
---

# P1139: Idea-feed INSERT policies carry an unconditional write predicate — same class as P1138, different tables

> **Live and unpatched.** Per `.claude/commands/slava/maintain/privacy/SKILL.md`, the affected
> table list, the current policy state, and reproduction detail are deliberately **not** in
> this public spec. They are in `.private/docs/security-log.md`, entry **2026-08-21 "P1139
> filed — same bug class as P1138, idea-feed INSERT side, live on prod and test"**. Read that
> first; this spec is not actionable without it.

## Summary

A small group of tables in the "idea feed" family carry INSERT policies with an
unconditional predicate, live on prod and on test. Same bug class as P1138 (written
permissive at creation, never revisited), different tables and a different write command
(INSERT rather than UPDATE).

## Root Cause

**Confirmed empirically 2026-08-21 on test (`gfjctyxqlwexxwsmkakq`). Prod never touched.**

All four policies are `FOR INSERT WITH CHECK (true)` with no `TO <role>` clause, exactly as
written at table creation. Neither later migration that tightened this family touched the
INSERT side — both operated on UPDATE only. `anon` holds the table-level INSERT grant, so
the policy is the only gate, and it admits everything.

**The decisive finding, which changes the fix from P1138's:** none of the four tables has a
legitimate client write path at all. Every DB-touching idea-feed function in
`src/app/data/api.ts` — `createFeedIdea`, `voteOnIdea`, `addIdeaComment`,
`elevateCommentToIdea`, `getFeedIdeas`, `getIdeaComments`, `getIdeaVoters`, `getVoteHistory`,
`subscribeToFeed` — has **zero callers anywhere in the repo** (whole-repo grep; the only hits
are `api.ts`'s own internal calls and a unit test covering the localStorage helpers). The
`/feed` route serves P491's hashtag feed, an unrelated feature. This is the same shape as
P1138's `clarity_verifications` finding: a write path that exists only in dead code.

So the spec's original framing — "unless a table's write path is genuinely anonymous by
product design" — resolves to: there is no write path to preserve on any of the four. The
only writes these policies can admit today are hostile ones.

**Second class of defect, found during the scenario audit.** RLS is row-level only and says
nothing about which *columns* a client may set. None of the four tables carries
`GRANT INSERT (col)` scoping, so an unauthenticated caller can also set server-owned columns
directly — proven on test by pinning `clarity_feed_ideas.created_at` to 2099 (which would
permanently occupy the top of the feed's `order('created_at', desc)` query) and backdating
`clarity_idea_vote_history.changed_at` to 2020 (planting a fabricated position-change ahead
of the real one). This is the exact defect P1083's adversarial review caught on
`ready_submissions` (2026-08-17) and closed with `REVOKE INSERT` + `GRANT INSERT (value)`.
That table's migration cites `clarity_feed_ideas` as its precedent — the precedent itself
was never given the same treatment.

Originally discovered as a direct side effect of extending `scripts/rls-drift-check.py` for P1138's
AC4 — a new leg that flags any `PERMISSIVE` write policy with an unconditional predicate
and no `TO <role>` scope, independent of whether prod, test, and migration files all agree.
The first live run of that new leg surfaced four policies P1138's own scoped sweep (a
one-time SQL query against the live policy catalogue) never covered.

A prior migration already tightened this same table family's UPDATE side — dropping two
UPDATE policies entirely and scoping the third with a documented, accepted limitation for
anonymous voting (that specific policy is now allowlisted in
`scripts/rls-drift-allowlist.txt` as a founder decision, out of scope here) — but never
touched the INSERT side. These four INSERT policies are genuinely new findings, not a
re-discovery of the already-accepted carve-out.

**Not yet empirically exploited.** The finding so far is read-only: live policy catalogue
state via the Management API, both environments, 2026-08-21. `/reproduce` has not run.

## Reproduction Steps

**Empirically reproduced 2026-08-21, test only (`gfjctyxqlwexxwsmkakq`).** All four tables
were exploited end-to-end via the real unauthenticated REST path (anon key, no session, no
ownership relationship). Every write landed. Verified by a service-role re-read after each
attempt, never by reading the policy back. Per the P1138 pitfall, the anon writes are issued
without `.select()` chained, so a SELECT-policy refusal on the echo-back can never be
mistaken for a `WITH CHECK` refusal.

All seeded and exploited rows cleaned up after; zero residue confirmed by a follow-up
service-role read, with row totals back to the exact pre-run baseline. Prod was never
written to — only read, for row counts.

Canary: `e2e/integration/p1139-reproduce.spec.ts` — 6/6 failing before a fix, each for the
right reason (service-role re-read shows the unauthenticated write landed).

**Reproduction rate:** 100% (policy state, not timing-dependent).

## Expected Behavior

A write from an unauthenticated caller is refused on every affected table, unless a table's
write path is genuinely anonymous by product design (matching the precedent already accepted
for a sibling policy in this same table family) — in which case that determination happens
during `/reproduce`, not here.

## Actual Behavior

The write is admitted unconditionally on all four — proven, not inferred. An anonymous
caller with nothing but the public anon key can post ideas, post comments, cast votes, and
fabricate vote-history entries, and can pin the server-owned timestamp columns while doing
it. Vote history is the record of how a stated position changed over time, which makes a
forgeable history a research-integrity problem before it is a spam one.

## Affected Files

- One migration under `supabase/migrations/` already tightened this table family's UPDATE
  side but never touched INSERT — named in the private log
- `scripts/rls-drift-check.py` — the new leg that surfaced this (P1138's AC4 work)

## Severity

**High** — matches P1138's severity rationale: a live unauthenticated write surface on prod,
same product area (the idea-feed / calibration content pipeline).

## Fix Approach

The write-path audit `/reproduce` was required to run is done: **zero legitimate callers on
all four tables.** That settles the open question in favour of dropping rather than scoping —
none of the four needs the anonymous-write accepted-limitation treatment, because there is no
anonymous client to preserve. This matches the precedent the same table family already set on
its UPDATE side, where two policies were dropped outright for the same reason.

1. Drop all four INSERT policies. Nothing in `src/` calls them.
2. Confirm the drift checker's unconditional-write leg goes quiet for these four afterwards.
3. Apply to test first. Prod only on separate explicit founder approval, per Non-Goals.

**`[FOUNDER DECISION: the idea feed is dead code — remove it or park it?]`** The whole feature
(four tables, ~500 lines of `api.ts`, three realtime subscriptions) has no UI and 1 idea +
1 vote on prod. Dropping the policies closes the security hole and leaves the dead code in
place. Removing the feature outright would close it permanently and is the only option that
prevents this class recurring here a third time. Out of scope for this spec either way — but
it is the actual root question, and it needs an answer rather than another policy patch.

**Related latent bug, not filed:** `elevateCommentToIdea` (`api.ts:2727`) issues an `UPDATE`
on `clarity_idea_comments` whose UPDATE policy was dropped by an earlier migration, and does
not check the error — so it fails silently. Unreachable today (zero callers); it only matters
if the feature is revived rather than removed.

## Non-Goals

- The already-accepted `clarity_idea_votes` UPDATE carve-out (anonymous voting, no
  `auth.uid()` to bind against) is out of scope — already allowlisted, not a bug.
- Read-side policies are out of scope; this spec covers writes only.
- Removing the idea-feed feature itself (tables + `api.ts` code) is out of scope — see the
  founder decision in Fix Approach.
- No prod mutation happens under this spec without a separate, explicit approval.

## Acceptance Criteria

- [x] *(reproduce half)* A canary was observed failing first, before any fix —
      `e2e/integration/p1139-reproduce.spec.ts`, 6/6 failing on test, each for the right
      reason (service-role re-read shows the unauthenticated write landed)
- [ ] An unauthenticated write to each affected table is refused **on test**, demonstrated by
      that same canary turning green after the fix
- [x] Every legitimate in-app write path on the affected tables still succeeds — vacuously
      satisfied and grep-verified: there are **no** client write paths on any of the four
      tables, so there is nothing to preserve. Whole-repo grep of every exported idea-feed
      function returned zero callers outside `api.ts` itself
- [ ] Live policy state on prod shows the fix applied, re-queried after deploy with the
      project ref stated explicitly in the evidence
- [ ] Private log entry updated from unpatched to fixed, with the re-query output
- [ ] Column-level INSERT grants scope what an anon caller may set, so server-owned timestamp
      columns cannot be pinned — canary tests 5 and 6 turn green (moot if the policies are
      dropped outright, which removes the write entirely; keep the assertions as regression
      cover either way)
- [ ] No console errors in the affected user flows after the change
