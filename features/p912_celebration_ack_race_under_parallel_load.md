---
status: qa
type: bug
rank: 1000794.0
severity: medium
workstream: C1
date_reported: '2026-06-07'
created_date: '2026-06-07'
tags: [live, race-condition, e2e, flaky, celebration]
delivery_stage: ship
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: e2e/p912-reproduce.spec.ts
  root_cause: "Hypothesis C (phantom-transient assertion). waitForBothAcknowledged polls for celebrationAcknowledgedByCreator===true AND ...Joiner===true simultaneously, but the app races to clear that state. Under sequential resolution the joiner takes handleCelebrationComplete's bothDone branch (immediate full-overwrite reset) and both-true NEVER persists in the DB; the round still advances to idle/round2 correctly. Hypothesis A (real ack loss/deadlock) DISPROVED — durable outcome correct in every interleaving."
  confidence: high
  surfaces_in_scope: [p525-celebration-race]
  surfaces_deferred: []
  reproduced_at: 2026-06-10
---

# P912: Celebration dual-ack race — simultaneous Continue clicks intermittently lose an ack under load

## Summary

`e2e/p525-celebration-race.spec.ts` ("both users clicking Continue on celebration") flaked twice during the P891 ship — `waitForBothAcknowledged` timed out at 30s — but only when run in parallel with the p562 suite; it passes isolated (3/3 runs) and on every retry. This may be a rare real race in the P525 dual-ack write path, not just test noise.

## Root Cause

**CONFIRMED (2026-06-10): Hypothesis C — phantom-transient test assertion. Not a production bug.**

The flaking line is `await waitForBothAcknowledged(code)` (`e2e/p525-celebration-race.spec.ts:126`). That helper polls the DB every 500ms for `celebrationAcknowledgedByCreator === true && celebrationAcknowledgedByJoiner === true` **simultaneously**. But the app is *racing to clear* that exact state, so both-true is at best a brief transient and frequently never exists in the DB at all:

- **Sequential resolution** (the load-sensitive case): when the joiner clicks Continue *after* Realtime + the 1s drift poll have delivered the creator's ack into its `confirmedLiveStateRef`, the joiner takes `handleCelebrationComplete`'s `bothDone` branch (`clarity-live-page.tsx:2402`) and does an **immediate full-overwrite reset**. The DB goes `creator:true → idle/round2` directly — **both-true never persists**. Under parallel suite load the CPU-contended gap between the two `Promise.all` clicks widens, making this interleaving likely.
- **Simultaneous resolution**: both clients read both-false, both write their own boolean (patch merge → DB briefly both-true), then the reactive safety-net `useEffect` (`clarity-live-page.tsx:2471`) clears it. The both-true window is ~0.8s — a 500ms poll can sample outside it.

In **every** interleaving the *durable* outcome is correct: `ratingPhase` reaches `idle`, `currentRound` increments, and both users leave the celebration screen. The 30s timeout fires only because the helper asserts an intermediate the app intentionally skips/clears — **Hypothesis A (real ack loss / round deadlock) is DISPROVED**, and the mechanism is more precise than the spec's Hypothesis B (it is not Supabase latency; the whole sequence completes in ~1–3s).

### Evidence — 100ms `live_state` capture (test DB)

```
SEQUENTIAL  sawBothTrue=false  reachedIdle=true  finalRound=2
   137ms  c=false j=false  celebration  r=1
   373ms  c=true  j=false  celebration  r=1  (creator first-ack)
  3239ms  c=false j=false  idle         r=2  (joiner bothDone → full reset; both-true skipped)

SIMULTANEOUS sawBothTrue=true  reachedIdle=true  finalRound=2
   150ms  c=false j=false  celebration  r=1
   422ms  c=true  j=true   celebration  r=1  (both first-ack — transient)
  1199ms  c=false j=false  idle         r=2  (reactive reset clears both-true ~777ms later)
```

The canary `e2e/p912-reproduce.spec.ts` forces sequential resolution deterministically: all four durable assertions (idle, both buttons gone, round 2) pass, then `waitForBothAcknowledged` times out — reproducing the p525 failure 2/2 runs (initial + retry), no longer flaky.

### Scenario audit (Phase 2b, Track B)

`waitForBothAcknowledged` has a single call site (p525:126) and the helper is file-local. The sibling dual-ack tests (`p814`, `p879`) correctly poll for the **durable post-reset state** (`ratingPhase==='idle'` + cleared fields) and set the booleans via `advanceSessionState` to fire the reset deterministically. p525 is the only surface with the transient-state assertion (introduced in the P891 rewrite). No deferred scenarios.

## Reproduction Steps

1. Branch with the P891 test rewrites (now on main).
2. Run both suites together: `npx playwright test e2e/p562-free-mode.spec.ts e2e/p525-celebration-race.spec.ts`
3. Repeat until the celebration-race test times out in `waitForBothAcknowledged`.

**Reproduction rate:** ~2 in 3 combined runs flaked once during P891 (2026-06-05 and 2026-06-07); 0 failures isolated or on retry.

## Expected Behavior

Both ack booleans persist in `live_state` within the poll window whenever both users click Continue, regardless of suite parallelism; the test never needs a retry.

## Actual Behavior

Intermittently under parallel load, `waitForBothAcknowledged` times out (30s); the retry of the same test passes.

## Affected Files

- `e2e/p525-celebration-race.spec.ts` — **the fix target**: flawed `waitForBothAcknowledged` helper + its line-126 call
- `e2e/p912-reproduce.spec.ts` — canary (deterministic reproduction)
- `src/app/pages/clarity-live-page.tsx` — `handleCelebrationComplete` bothDone branch (2402) + reactive safety-net useEffect (2471) — **mechanism context only, no change needed**

## Severity

**Low** (downgraded from Medium after reproduction). Confirmed test-only flake — no production race. The `/live` celebration round-advance guarantee holds in every interleaving (sequential and simultaneous); the durable DB outcome is always `idle` + `round+1`. Impact is limited to CI noise / a wasted retry, not a user-facing deadlock.

## Fix Approach

Test-only fix (no `src/` change). In `e2e/p525-celebration-race.spec.ts`:

1. Delete the `await waitForBothAcknowledged(code)` call at line 126 — it asserts a transient the app intentionally skips. The assertions immediately after it (lines 129–144: `ratingPhase: 'idle'`, both Continue buttons gone, `currentRound === 2`) already prove the **durable** P525 guarantee.
2. Remove the now-dead `waitForBothAcknowledged` helper (lines 56–78).
3. Optionally fold the sequential-resolution interleaving from `e2e/p912-reproduce.spec.ts` into p525 as a second assertion path (worst-case timing), then delete the standalone canary's final phantom-transient line.

Do **not** add fresh-DB-read or server-side-RPC reset logic — Hypothesis A is disproved, so there is no production defect to fix there.

## Acceptance Criteria

- [x] Hypothesis A vs B/C discriminated with captured `live_state` evidence (see Root Cause)
- [x] Canary `e2e/p912-reproduce.spec.ts` reproduces the timeout deterministically (2/2 runs)
- [x] p525 line 126 + dead helper removed; durable-outcome assertions retained
- [x] Combined run (`p562` + `p525`) passes 5/5 with zero retries, 5 consecutive runs
