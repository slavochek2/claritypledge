---
status: week
type: bug
rank: 57
severity: high
workstream: infrastructure
date_reported: '2026-08-21'
created_date: '2026-08-21'
tags: [rls, security, prod, data-integrity]
delivery_stage: create-bug
pipeline_ran: [create-bug]
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

Discovered as a direct side effect of extending `scripts/rls-drift-check.py` for P1138's
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

Not yet performed — see private log for the exact live-catalogue read that surfaced this.
`/reproduce` must confirm via the real unauthenticated REST path (matching P1138's
methodology), not just a policy-catalogue read.

**Reproduction rate:** unknown — not yet exploited.

## Expected Behavior

A write from an unauthenticated caller is refused on every affected table, unless a table's
write path is genuinely anonymous by product design (matching the precedent already accepted
for a sibling policy in this same table family) — in which case that determination happens
during `/reproduce`, not here.

## Actual Behavior

Per the live policy catalogue read, the write appears admitted unconditionally on all four
affected policies.

## Affected Files

- One migration under `supabase/migrations/` already tightened this table family's UPDATE
  side but never touched INSERT — named in the private log
- `scripts/rls-drift-check.py` — the new leg that surfaced this (P1138's AC4 work)

## Severity

**High** — matches P1138's severity rationale: a live unauthenticated write surface on prod,
same product area (the idea-feed / calibration content pipeline).

## Fix Approach

Same sequence as P1138: `/reproduce` must establish, per table, from `src/`, whether a
legitimate client write path exists before anything is dropped or scoped — including
checking whether any of these four need the same anonymous-write accepted-limitation
treatment already granted to their UPDATE-side sibling, rather than assuming a hard
authentication requirement.

## Non-Goals

- The already-accepted `clarity_idea_votes` UPDATE carve-out (anonymous voting, no
  `auth.uid()` to bind against) is out of scope — already allowlisted, not a bug.
- Read-side policies are out of scope; this spec covers writes only.
- No prod mutation happens under this spec without a separate, explicit approval.

## Acceptance Criteria

- [ ] An unauthenticated write to each affected table is refused **on test**, demonstrated by
      a canary observed failing first, not by reading the policy back
- [ ] Every legitimate in-app write path on the affected tables still succeeds — verified per
      table against a real caller, not asserted
- [ ] Live policy state on prod shows the fix applied, re-queried after deploy with the
      project ref stated explicitly in the evidence
- [ ] Private log entry updated from unpatched to fixed, with the re-query output
- [ ] No console errors in the affected user flows after the change
