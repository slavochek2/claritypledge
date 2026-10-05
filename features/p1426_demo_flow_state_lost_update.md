---
status: backlog
type: bug
rank: 316
severity: medium
workstream: live
date_reported: 2026-10-06
created_date: 2026-10-06
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [demo, race, lost-update, jsonb]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1426: /demo loses one partner's write when both update the session state at once

## Summary

`updateDemoFlowState` (`src/app/data/api.ts:1656`) reads `clarity_sessions.state`, spreads it,
merges the caller's partial and writes the **whole object** back. `/demo` (`src/App.tsx:916`) is a
two-party page where both roles write (`src/app/pages/clarity-demo-page.tsx:204`, `:275`), so two
writes inside one read→write window lose one of them. Same bug class as P1425 (a stale snapshot
written back over a shared JSON column); found by the P1425 bug-class sweep, not by a user report.

## Root Cause

Read-modify-write of a whole jsonb column from the client with no condition on what was read:

```
A: SELECT state            → {x}
B: SELECT state            → {x}
A: UPDATE state = {x, a}
B: UPDATE state = {x, b}   ← A's `a` is gone
```

The protected `/live` path does not have this problem: its writes go through the atomic
`patch_live_state` merge RPC (`||` in SQL). `/demo` never got the same treatment.

UNVERIFIED: how often both partners write inside the window in practice — no reproduction yet.

## Invariants

- A writer of a shared JSON column changes only the keys it owns, atomically in the database
  (P1425 invariant, generalised). A client-side spread of a read is never written back whole.

## Reproduction Steps

1. Open `/demo` as speaker and listener in two browsers on one session.
2. Have both submit (rating / step change) within the same ~100 ms.
3. Observe: one partner's submitted value is missing from `clarity_sessions.state`.

**Reproduction rate:** intermittent (timing-dependent). `/reproduce` should force it by
interleaving two `updateDemoFlowState` calls against the test DB.

## Expected Behavior

Both partners' updates are present in `state` afterwards.

## Actual Behavior

The later writer's spread of its stale read overwrites the earlier writer's keys.

## Affected Files

- `src/app/data/api.ts` — `updateDemoFlowState` (~line 1656)
- `src/app/pages/clarity-demo-page.tsx` — callers at ~136, ~204, ~275, ~497
- `src/app/data/api.ts` — `endClaritySession` (~line 1508): same select→spread→update shape on
  `live_state`, **no production callers** (only test mocks; P1053 already replaced the same pattern
  in `clearSessionJoiner`). Delete it so nobody revives it.

## Severity

**Medium** — silent loss of a partner's input on a live two-party page; timing-dependent.

## Fix Approach

Mirror `patch_live_state`: an RPC that merges a partial into `state` with `||` in one UPDATE, and
`updateDemoFlowState` calls it instead of select+update. `clarity_sessions` is a core table and its
UPDATE policy is permissive (decisions.md, P671 entry) — `/architect` should decide the RPC's guard.
Delete the dead `endClaritySession`.

## Acceptance Criteria

- [ ] Two interleaved `updateDemoFlowState` calls against the test DB both survive (regression test)
- [ ] `/demo` speaker + listener submitting together both see each other's values
- [ ] `endClaritySession` removed, no remaining callers
- [ ] No console errors in the `/demo` flow
