---
status: qa
type: bug
rank: 57
severity: high
workstream: infrastructure
date_reported: '2026-08-21'
created_date: '2026-08-21'
tags: [rls, security, prod, data-integrity]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: e2e/integration/p1139-reproduce.spec.ts
  root_cause: "Four INSERT policies created with an unconditional write predicate and never revisited; the two later migrations that tightened this table family only touched UPDATE. anon holds the table-level INSERT grant, so the policy is the only gate. Confirmed empirically on test via the real unauthenticated REST path — not a policy-catalogue read. Crucially, unlike P1138's affected table, NO table here has a legitimate client write path: zero callers repo-wide. See .private/docs/security-log.md 2026-08-21 entry for affected tables/functions."
  confidence: high
  surfaces_in_scope: "see .private/docs/security-log.md 2026-08-21 entry"
  surfaces_deferred: []
  surface_audit_anchor: "see .private/docs/security-log.md 2026-08-21 entry"
  surface_audit_hits: 0
  scenarios_excluded: "one sibling UPDATE carve-out — allowlisted founder decision (scripts/rls-drift-allowlist.txt). INSERT side is in scope."
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

**Confirmed empirically 2026-08-21 on test. Prod never touched.** Affected tables, exact
policy state, and reproduction detail are in the private log, not here (see banner above).

All four policies carry an unconditional write predicate with no role scope, exactly as
written at table creation. Neither later migration that tightened this family touched the
INSERT side — both operated on UPDATE only. `anon` holds the table-level INSERT grant, so
the policy is the only gate, and it admits everything.

**The decisive finding, which changes the fix from P1138's:** none of the four tables has a
legitimate client write path at all. Every DB-touching idea-feed function in
`src/app/data/api.ts` has **zero callers anywhere in the repo** (whole-repo grep; the only
hits are `api.ts`'s own internal calls and a unit test covering the localStorage helpers).
The `/feed` route serves P491's hashtag feed, an unrelated feature. This is the same shape as
P1138's dead-code finding: a write path that exists only in code nothing calls.

So the spec's original framing — "unless a table's write path is genuinely anonymous by
product design" — resolves to: there is no write path to preserve on any of the four. The
only writes these policies can admit today are hostile ones.

**Second class of defect, found during the scenario audit.** RLS is row-level only and says
nothing about which *columns* a client may set. None of the four tables carries
column-scoped INSERT grants, so an unauthenticated caller can also set server-owned columns
directly — full reproduction technique in the private log. This is the exact defect P1083's
adversarial review caught on `ready_submissions` (2026-08-17) and closed with
`REVOKE INSERT` + `GRANT INSERT (value)`. That table's migration cites this same family as
its precedent — the precedent itself was never given the same treatment.

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

**Empirically reproduced 2026-08-21, test only.** Full reproduction technique, affected
tables, and project ref are in `.private/docs/security-log.md` — not here (see banner
above). Every write landed; verified by a service-role re-read after each attempt, never by
reading the policy back. Per the P1138 pitfall, the anon writes are issued without
`.select()` chained, so a SELECT-policy refusal on the echo-back can never be mistaken for a
`WITH CHECK` refusal.

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
**Filed as `features/p1146_decide_idea_feed_fate.md`.**

**Related latent bug:** one idea-feed function (see private log) issues an `UPDATE` whose
policy was dropped by an earlier migration, and does not check the error — so it fails
silently. Unreachable today (zero callers); it only matters if the feature is revived rather
than removed. **Folded into `p1146` rather than filed separately** — moot if that spec
resolves to removal.

## Non-Goals

- The already-accepted sibling UPDATE carve-out (anonymous voting, no
  `auth.uid()` to bind against) is out of scope — already allowlisted, not a bug.
- Read-side policies are out of scope; this spec covers writes only.
- Removing the idea-feed feature itself (tables + `api.ts` code) is out of scope — see the
  founder decision in Fix Approach.
- No prod mutation happens under this spec without a separate, explicit approval.

## Acceptance Criteria

- [x] *(reproduce half)* A canary was observed failing first, before any fix —
      `e2e/integration/p1139-reproduce.spec.ts`, 6/6 failing on test, each for the right
      reason (service-role re-read shows the unauthenticated write landed)
- [x] An unauthenticated write to each affected table is refused **on test**, demonstrated by
      that same canary turning green after the fix — `20260821150000_p1139_close_idea_feed_
      insert_policies.sql` applied to test, canary re-run single-worker (the file's
      `fullyParallel` default races `beforeAll`/`afterAll` across workers on this shared-table
      suite — see Resolution): 6/6 passed
- [x] Every legitimate in-app write path on the affected tables still succeeds — vacuously
      satisfied and grep-verified: there are **no** client write paths on any of the four
      tables, so there is nothing to preserve. Whole-repo grep of every exported idea-feed
      function returned zero callers outside `api.ts` itself
- [ ] `[post-deploy]` Live policy state on prod shows the fix applied, re-queried after deploy
      with the project ref stated explicitly in the evidence — blocked on separate explicit
      founder approval per Non-Goals; not actionable pre-deploy
- [ ] `[post-deploy]` Private log entry updated from unpatched to fixed, with the re-query
      output — depends on the prod re-query above
- [x] Column-level INSERT grants scope what an anon caller may set, so server-owned timestamp
      columns cannot be pinned — canary tests 5 and 6 turn green (moot, as anticipated: the
      policies were dropped outright, which removes the write entirely — RLS default-denies
      with zero matching PERMISSIVE policies, so no column-grant migration was needed;
      assertions kept as regression cover)
- [x] No console errors in the affected user flows after the change — vacuously satisfied,
      no in-app flow reaches these tables (zero callers, confirmed above)

## Resolution

**Fixed on test:** 2026-08-21. **Prod: still unpatched — separate explicit founder approval
required before applying there, per Non-Goals.**

**Migration:** `supabase/migrations/20260821150000_p1139_close_idea_feed_insert_policies.sql`
— drops the four unconditional INSERT policies (`Anyone can create feed ideas`,
`Anyone can insert comments`, `Anyone can insert votes`, `Anyone can insert vote history`).
Policy-only, same minimal shape as `20260821140000_p1138_...` — no `REVOKE INSERT` needed:
with zero matching PERMISSIVE INSERT policies, RLS default-denies regardless of the
table-level grant anon/authenticated still hold.

**Verification:**
- Canary (`e2e/integration/p1139-reproduce.spec.ts`) pre-fix: 6/6 failed, each for the right
  reason (service-role re-read shows the unauthenticated write landed). Post-fix: 6/6 passed.
  Discovered mid-verification: the suite's default `fullyParallel` + 3-worker config raced
  `beforeAll`/`afterAll` across workers on this shared-table fixture (same class as the
  P1083 "shared table" pattern in `docs/technical/e2e-testing-guide.md`) — one worker's
  cleanup could delete a sibling worker's just-seeded idea before its insert ran, turning
  a real RLS pass into a false pass via an FK-constraint failure instead. Fixed in-scope
  (user-approved Tier-2 same-file extension): added `mode: 'serial'` to the suite's
  `test.describe.configure`, confining all six tests to one worker. Re-verified under the
  repo's **default** worker settings (no `--workers=1` override) post-fix: 6/6 passed.
- Dead-code founder decision (`[FOUNDER DECISION: ...]` in Fix Approach) filed as
  `features/p1146_decide_idea_feed_fate.md` per user approval, committed to main
  (`b9b6356e`) — not on this branch, since spec creation always happens on main.
- `scripts/rls-drift-check.py`: the four tables' unconditional-write findings changed from
  `live_in='prod, test'` to `live_in='prod'` only — confirms the fix landed on test and
  prod remains exposed, matching the P1138 precedent.
- Regression: `e2e/integration/security-tighten-rls.spec.ts` (12 tests, SELECT-side
  visibility on `clarity_feed_ideas`, seeds via service role) and
  `e2e/integration/p1138-reproduce.spec.ts` — both green post-fix, single-worker.
- `npx tsc --noEmit` — clean (no application code touched; DB-only fix).

**Why DROP and not scope:** zero legitimate callers exist on any of the four tables
(whole-repo grep of every exported idea-feed function in `src/app/data/api.ts` — the only
hits are `api.ts`'s own internal calls and a unit test covering the localStorage helpers).
There is no anonymous-write path to preserve, unlike P1138's `ml_training_sessions`.
