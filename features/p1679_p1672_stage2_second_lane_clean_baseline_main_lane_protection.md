---
status: week
type: task
rank: 335
workstream: infrastructure
created_date: '2026-11-13'
tags: [test-server, self-hosted, edge-functions, concurrency]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: sonnet
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1679: P1672 stage 2: second TEST lane, clean main-lane baseline, VM-side main-lane protection

## Problem

> Founder framing, verbatim (2026-11-13): *"move the stage 2 checklist items into their own spec so stage 1 can ship"*

Carried over from P1672 so that stage 1 can ship. Stage 2 is the second half of the P1672 plan, not a
new design. Its content was reviewed by three vendors as part of P1672 and is carried over unchanged;
no new spec review was run when this file was split out.

Read P1672's Problem section first (P1672 will sit under `features/done/` once stage 1 ships; find it
by its P-number). In short: every branch tests against one shared self-hosted TEST server, so two open
branches with no function directory in common keep erasing each other's deployed functions and schema.
Stage 1 delivers one isolated lane and the claim protocol, and leaves three things open, which this
spec closes:

- A browser-only branch with function changes (P1631's kind) still shares the main lane, because only
  one lane exists.
- The main lane still holds unlanded branch schema, which every stage-1 lane inherits on copy.
- Nothing on the VM stops a branch's function deploy or migration from reaching the main lane when it
  comes from a checkout running pre-P1672 scripts.

## Appetite

Same as P1672 (see its Appetite). The one new constraint: the baseline cleanup is destructive on shared
TEST and needs the founder's OK at the time it runs.

## Solution

### Stage 2: second lane, clean baseline, protected main lane

- **A second lane**, so a browser-only branch with function changes (P1631's kind) leaves the main lane.
- **Main-lane baseline cleanup.** The main-lane ledger is made equal to main's migration files, in both
  directions, and the branch-only objects behind removed versions are dropped.
  - It runs only once no active branch depends on the main lane for unlanded schema.
  - It waits for the founder's OK at the time it runs (db-access.md).
  - Known item: P1672's live landing check left schema `_p1672_land_probe` and ledger version
    `20261113235950` (no file on main) on the main lane. Both go in this cleanup.
- **Server-side refusal on the main lane.** The VM refuses a function deploy or migration aimed at the
  main lane unless it comes from main's landing or an explicit main deploy. It holds whichever script
  version a checkout runs.
- **Capacity.** Measure two lanes plus the main lane under concurrent E2E. Recommend the VM upgrade to
  the founder only if the measurement shows contention.

**The acceptance demonstration, at the end of stage 2:**
- Two branches run in two lanes at the same time.
- One processes its own fixtures through its real scheduled dispatch.
- The other runs a branch-only browser-called function.
- A landing on main during both runs changes neither lane, and brings the main lane forward.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The main lane holds unlanded branch schema, so stage-1 lanes inherit it | ACCEPT for stage 1 (P1672) | The claim prints, after the copy, the two-way ledger diff against main's files. Stage 2 cleans it. |
| CPU contention with two lanes plus the main lane | MITIGATE | VM-wide admission, measured in stage 2. Upgrade priced in P1672's Cost Budget. |

**Non-Goals**

Inherited from P1672 unchanged: do NOT change prod, the prod deploy path or hosted TEST; do NOT change
product code (environment configuration and resolver wiring only); do NOT build more than two lanes or
an autoscaler.

## Done-When

Each check is by effect, and its control must fail first.

- [ ] **Acceptance demonstration** (Solution): two lanes in use at once, one through its real scheduled dispatch and one through a branch-only browser-called function, while a main landing changes neither lane and brings the main lane forward.
- [ ] **The baseline is clean.** After the cleanup, run with the founder's OK, the main-lane ledger equals main's migration files in both directions. A branch-only object seeded beforehand under an extra version is gone (catalog diff).
- [ ] **The VM protects the main lane.** The VM refuses a branch's function deploy and migration aimed at the main lane, including from a checkout running pre-P1672 scripts. Control: a main landing deploy passes.
- [ ] **Capacity is measured.** CPU, memory and timeouts measured under two concurrent lane E2E runs plus main-lane traffic, recorded privately, with an upgrade recommendation for the founder if contention shows.
- [ ] **The docs record the change.** `docs/decisions.md` records the reversal of the 2026-11-05 "detect, do not prevent" deferral and the P1591 resolver change. The testing docs say how a lane is claimed, used and released.

## Related

- P1672: the predecessor (stage 1: lane tooling, claim protocol, per-worktree resolver, VM-wide E2E admission). This spec is its stage 2.
- P1631: the browser-only branch that the second lane is for.
