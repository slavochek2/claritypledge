---
status: week
type: bug
rank: 1000065
severity: high
workstream: infrastructure
date_reported: '2026-09-03'
created_date: '2026-09-03'
tags: [live, e2e, two-party, p1043]
delivery_stage: create-bug
pipeline_ran: [create-bug]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1234: Two-party session creation never reaches the waiting room, blocking the whole /live E2E suite

## Summary

Clicking **New session** on `/live` no longer produces the **Invite Your Partner** waiting room.
The button exists and the click lands; the invite screen never appears. Every two-party E2E test
dies at that assertion, before reaching any join, story, or rating step.

## Reproduction Steps

1. Run any two-party spec — `p-story-persistence-fixes` is the cleanest, being untouched by recent work.
2. Observe the failure at `expect(speakerPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 })`.

**Reproduction rate:** 100%. **16 of 16** tests failed at this assertion across four sampled files
(`p272-live-verification`, `p275-live-positions`, `p400-story-card-rendering`,
`a11y/p398-accessibility`), plus the control below.

## Actual vs Expected

**Expected:** the waiting room renders with the share link (`clarity-live-page.tsx:4386`, testid
`share-link` at `:4407`).
**Actual:** `element(s) not found` after a 10s wait. The button itself is present and live at
`clarity-live-page.tsx:4197` (`isLoading ? 'Creating...' : 'New session'`), so the click is
delivered — session creation is what does not complete.

## What has been ruled out — by control, not by argument

| Hypothesis | Disproof | Verdict |
|---|---|---|
| Caused by P1232's guest-join edits | `p-story-persistence-fixes.spec.ts`, a file P1232 never touched, fails at the identical locator and line | **Ruled out** |
| Caused by P1231's suite-wide storageState seed | Re-ran that same control with the seed disabled via a temporary config flag — identical failure | **Ruled out** |
| Copy renamed, as with P396 | Both strings are live in src: `New session` at `:4197`, `Invite Your Partner` at `:4386` | **Ruled out** |
| Network/environment | Some runs in the same batch failed with `ConnectTimeoutError`, but the creator-flow failure reproduces with connectivity confirmed healthy | **Not the cause** (may co-occur) |

## Invariants

- Any fix must be verified against a file **outside** the set being edited. This defect was
  distinguishable from two concurrent changes only because an untouched control was run; a
  same-file check would have been consistent with all three hypotheses.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The real cause is environmental (polluted shared test DB) rather than code | DEFER | The test DB is 61% leaked fixture data (P1043 triage). Rule this out before reading application code |
| Fixing it uncovers a second layer of failures underneath | ACCEPT | Expected and desirable — those are currently invisible |
| Treated as one bug when it is several | MITIGATE | Diagnose against `clarity_sessions` insert behaviour first; do not assume a single root cause |

**Non-Goals**
- Do NOT modify the E2E specs to work around it. The tests are asserting the correct thing.
- Do NOT fold in the guest-join or tutorial-modal work — both are shipped (P1232, P1231).

## Acceptance Criteria

- [ ] Clicking **New session** on `/live` renders the **Invite Your Partner** waiting room with a
      usable share link, verified in a browser
- [ ] `p-story-persistence-fixes.spec.ts` — the untouched control — reaches a join step
- [ ] At least one two-party spec completes a full creator to joiner round trip
- [ ] The cause is stated in `docs/decisions.md`, or recorded plainly as not found with the
      mitigation named instead

## Why this matters more than its own tests

The 2026-08-31 triage attributed failures in these files to the guest-join form at
`a11y/p398-accessibility.spec.ts:46` and `p275-live-positions.spec.ts:54`. **Those lines are
unreachable** — both files die at lines 41 and 48 respectively. The guest-join defect was real and
is fixed (P1232), but it was not what those runs were failing on. Any triage number for the /live
suite is suspect until this is fixed, because this defect masks everything downstream of it.

## Related

- **P612** — the /live *header* CTA is a no-op while the centre button works. Different button,
  and its reproduction steps assert "New session in the center works" (`p612:27`), which this
  spec contradicts. Worth re-checking P612 against current behaviour when fixing this.
- **P1232 / P1231** — the two E2E repairs whose behavioural verification this blocked.
- **P1043** — owns the remaining undiagnosed suite failures.
