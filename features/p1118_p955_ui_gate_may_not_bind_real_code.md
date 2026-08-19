---
status: backlog
type: task
rank: 97
created_date: '2026-08-19'
tags: [p955, ui-gate, ci, gates, verification]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1118: Establish whether the p955 UI gate binds real code, and whether CI enforces it

## Problem

**Situation:** The p955 UI gate is cited as the deterministic block on competing primary
actions and dead controls (`.claude/rules/visual-qa.md` names it twice). It has a workflow
(`.github/workflows/ui-gate.yml`) and three test files.

**Complication:** two separate doubts, one verified and one not.

1. **VERIFIED this session:** the gate's sibling `src/tests/p955-strictness-canary.test.ts`
   IS real — a grep canary over `dev.md`/`fix.md` whose header documents it having been
   demonstrated RED (6/6) before going green. So the gate is **not** uniformly hollow, and
   any spec claiming so is wrong.
2. **UNVERIFIED — the actual open question:** whether `src/tests/p955-gate.test.ts`'s
   assertions bind anything beyond their own fixtures. It renders fixtures it also defines
   (`p955-fixture.tsx`, `GateFixture.tsx`), which is the shape of an input-independent test:
   green regardless of what the application does.
3. **UNVERIFIED — requires GitHub settings access, which this session did not have:**
   whether `ui-gate` is a **required** check on `main`. If it is not, the workflow is
   advisory and the header's claim to be a boundary is false. Only `audit-privacy` is
   known to be required.

**Question:** does a real competing-primary defect, introduced into real application code,
turn this gate red — and does that red block a merge?

## Appetite

Medium blast radius (a gate other rules delegate to). Reversible. Low decision density —
this is measurement first, repair second.

## Solution

Answer by experiment, not by reading. Introduce a genuine P955 violation into a real
component on a throwaway branch — two full-width primary buttons in one view — and observe
whether `p955-gate.test.ts` fails. If it stays green, the assertions do not bind the
application and must be re-pointed at real render trees. Separately, read the `main`
ruleset and record whether `ui-gate` is required; if it is not, either make it required or
delete the boundary claim from the workflow header.

## Risks / Non-Goals

- **Do NOT** delete or weaken `p955-strictness-canary.test.ts` — it is proven working.
- **Do NOT** conclude "hollow" from file structure alone. The disproof is a real defect
  that fails to turn it red, pasted.
- **Risk:** making `ui-gate` required could block unrelated merges if it is flaky. Observe
  its history before requiring it.

## Done-When

- [ ] A real P955 violation in real application code is shown to turn `p955-gate.test.ts`
      RED — failing output pasted — or the test is shown not to bind and is repaired
- [ ] The `main` ruleset's required checks are enumerated and recorded in this spec
- [ ] `ui-gate` is either required on `main`, or its header no longer claims to be a boundary
- [ ] The deploy manifest's staleness relative to `src/App.tsx` is re-derived and stated
      (the originating plan claimed stale since `5357db72` — treat as unverified)

## Context

Filed while executing the `/goalify` plan (2026-08-19). The plan asserted the gate was
"HOLLOW — assertions called only inside `src/tests/p955-gate.test.ts`". Checking that claim
found a second, working canary the plan did not mention, so the assertion as written is
false. The narrower doubt survives and is what this spec tests.
