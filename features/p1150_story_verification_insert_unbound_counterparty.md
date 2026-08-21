---
status: week
type: bug
rank: 65
severity: high
workstream: infrastructure
date_reported: '2026-08-21'
created_date: '2026-08-21'
tags: [rls, security, prod, data-integrity]
delivery_stage: create-bug
pipeline_ran: [create-bug]
driver: anomaly
---

# P1150: The story-verification write path binds the caller but not the counterparty — same class as P1138/P1139, first one with real callers

> **Live and unpatched.** Per `.claude/commands/slava/maintain/privacy/SKILL.md`, the exact policy
> predicate, the unbound columns, the call sites and the reproduction path are deliberately **not**
> in this public spec. They are in `.private/docs/security-log.md`, entry **2026-08-21 "P1150 filed
> — `story_verifications` INSERT binds the caller but not the *counterparty*"**. Read that first;
> this spec is not actionable without it.

## Summary

An INSERT policy on the story-verification table checks that the caller is one of the two people
named on the row, but leaves the *other* person — and the rating attributed to them — unconstrained.

## Root Cause

Written permissive at creation and never revisited, the same origin as P1138 and P1139. A later
migration did tighten it once, from "any authenticated caller" to "caller must be one of the two
actors" — which closed the obvious hole and left the subtler one: binding the caller to *one* of two
actor columns says nothing about the other.

The consequence is not just a spurious row. Verification rows feed generated columns and a trigger
that recomputes public profile counters for **both** named parties, so a crafted write moves numbers
on a profile that is not the caller's.

Surfaced by the security agent during `/architect` on
[P1141](p1141_story_carries_a_video_with_jumpable_quotes.md), whose design leaned on the assumption
that these rows can only originate from a story's own author. That assumption is true of the
live-session UI and false of the database. P1141 records the correction; its own UI decision did not
depend on it.

## Reproduction Steps

Not yet reproduced. **Do not mark this confirmed until it is** — the evidence so far is a policy read
plus a call-site read, which is precisely the weaker form P1139's spec warns against ("confirmed
empirically on test via the real unauthenticated REST path — not a policy-catalogue read").

1. On **test**, authenticate as an ordinary verified user.
2. Through the real REST path — not the app UI, which never offers this — write a verification row
   naming a *different* user as the counterparty, against a story that user did not author.
3. Observe whether the row is accepted, and whether the counterparty's public profile counters move.

**Reproduction rate:** unknown — see `/reproduce`.

## Expected Behavior

A verification row can only be written in the shapes the product actually produces, and cannot
attribute a rating to someone who did not give it.

## Actual Behavior

*(To be confirmed by `/reproduce`.)* Expected from reading the policy: the row is accepted and the
named counterparty's counters move.

## Affected Files

- The migration that last recreated the policy — named in `.private/docs/security-log.md`
- Two client call sites that legitimately write these rows — named in the same entry
- The trigger that recomputes profile counters on insert — same entry

## Severity

**High** — a write-authorization gap that lets one account move another account's public numbers.
Not critical: no data loss, no auth bypass, no blocked flow, and no evidence it has been exercised.

## Fix Approach

**Do NOT copy P1139's revoke-and-close.** That worked because P1139's tables had *zero* legitimate
client callers. This table has two real ones, and they are asymmetric — in one of them the caller is
legitimately **not** the counterparty. A predicate that simply pins both actors to the caller breaks
a shipped, working flow.

The task is scoping, not closing:

1. `/reproduce` first, via the real REST path, to confirm the gap and its blast radius.
2. Enumerate what each real caller actually needs to write — both call sites, not one.
3. Write the narrowest predicate admitting exactly those shapes. Constrain the counterparty *and*
   the attributed rating; the policy currently leaves both free.
4. Check whether the two shapes can share one predicate or need separating by the row's own source
   marker.

Check `.private/docs/security-log.md` before designing — it records which caller sets which column,
and the one asymmetry that makes the obvious fix wrong.

## Acceptance Criteria

- [ ] A user cannot write a verification row naming a third party as counterparty on a story that
      third party did not author
- [ ] A user cannot cause another user's public profile counters to change through this path
- [ ] Letter-screening ratings still submit and still record correctly — the asymmetric caller is
      the regression risk, verify it explicitly
- [ ] Live-session ratings still submit and still record correctly
- [ ] The gap is demonstrated failing before the fix and passing after, through the real REST path —
      not a policy-catalogue read
- [ ] Regression test passes: `e2e/integration/p1150-*.spec.ts`

## Non-Goals

- **Do NOT change the ear metric or calibration semantics.** P940 redefined the ear metric
  deliberately; this spec constrains *who may write a row*, never what a row means.
- **Do NOT reopen P1138 or P1139.** Both are `all-done` and shipped. Closed specs are records.
- **Do NOT widen scope to other tables** in a general RLS sweep. One table, one predicate.
- **Do NOT hide the symptom in the UI.** P1141 already hides the count on agent stories for an
  unrelated product reason; that is not a fix for this and must not be cited as one.
