---
status: qa
type: bug
rank: 1
severity: medium
workstream: C1
date_reported: '2026-06-30'
created_date: '2026-06-30'
tags: [live, realtime, stale-echo, p671, stuck-session]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: src/tests/p976-reproduce.test.ts
  root_cause: "Realtime/drift-poll not-in-flight branches do a wholesale setLiveState; the only guard (isPhaseRegression) is phase-rank only and never compares the boolean submission flags, so a same-phase echo with *Submitted:false clobbers local true."
  confidence: high
  guard_contract: "Fix must export a shared isStateRegression(local, incoming) from src/app/lib/live-state-merge.ts: true when isPhaseRegression OR (same ratingPhase AND any monotonic flag true→false: checkerSubmitted/responderSubmitted/explainBackDone/celebrationAcknowledgedByCreator/Joiner). Wire into all 3 call sites (realtime :1288, drift-poll :1543, mergeInFlight)."
  surfaces_in_scope: [realtime-not-in-flight, drift-poll-not-in-flight, mergeInFlight]
  surfaces_deferred: []
  note_for_fix: "p976-reproduce.test.ts carries a @ts-expect-error on the isStateRegression import — remove it once the export exists. live.md mandates a two-party UI-driven E2E (button clicks, template e2e/p827-picker-real-flow.spec.ts) that fails pre-fix and passes post-fix; author it in /fix (the unit canary is the deterministic guard-contract proof, not a substitute for the E2E)."
  reproduced_at: 2026-06-30
---

# P976: /live boolean-flag stale echo can clobber a just-submitted rating (P671 class)

## Summary

In a two-party /live session, a stale Supabase Realtime echo arriving at the **same** `ratingPhase` can overwrite a locally-set `checkerSubmitted`/`responderSubmitted = true` back to `false`, reverting the UI to "waiting for partner" after the partner has already submitted — the P671 "stuck session" failure mode, reachable via a boolean flag rather than via a phase regression.

## Root Cause

The realtime merge guard `isPhaseRegression` (`src/app/pages/clarity-live-page.tsx:176`) is **phase-only**: it rejects an incoming state only when its `ratingPhase` rank is lower than the local rank. It never compares the boolean submission flags.

In the **not-in-flight** branches the incoming state is applied wholesale with no flag-level guard:
- realtime handler — `src/app/pages/clarity-live-page.tsx:1288-1291` (`setLiveState(mergedState)`)
- drift poll — `src/app/pages/clarity-live-page.tsx:1543-1545` (identical wholesale replace)

`mergeInFlight` (`src/lib/live-state-merge.ts:39-49`) applies the monotonic guard to `ratingPhase` only; boolean flags survive an in-flight echo *incidentally* (because `...prev` overlays `...incoming`) and only while `updateInFlightRef.current` is true. Once no write is in flight, a stale echo cached before the partner's submission can land at the same phase with `*Submitted: false` and clobber the local `true`.

Discovered while fixing `src/tests/live-state-guard.test.ts`, which previously tested an inline phantom `isStateRegression` and imported nothing from production — it gave false confidence that boolean-flag regressions were guarded. The gap is now documented as 4 `it.todo` entries in that file (committed in `4245e464`).

## Reproduction Steps

1. Start a two-party /live session (creator + joiner), both reach the `rating` phase on the same story/round.
2. Joiner submits their rating at T0 → server `live_state` advances to `*Submitted = true` at the same `ratingPhase`.
3. A Realtime echo cached **before** T0 (or a drift poll reading a lagging replica) arrives at T1 carrying `*Submitted = false` at the *same* `ratingPhase`, while no local write is in flight on the creator's client.
4. Observe: the creator's UI reverts to "waiting for partner" though the joiner has already submitted; the round can stall.

**Reproduction rate:** intermittent (timing-dependent on echo/poll ordering vs. submission).

## Expected Behavior

Once a submission flag is `true` at a given `ratingPhase`, a later same-phase echo carrying `false` for that flag is rejected (monotonic on the flags, as it already is on the phase). The UI continues to reflect that the partner submitted.

## Actual Behavior

The same-phase `false` echo is applied wholesale, resetting the local `true` and showing "waiting for partner" — a stuck/again-waiting session with no data loss.

## Affected Files

- `src/app/pages/clarity-live-page.tsx:176` — `isPhaseRegression` (phase-only guard)
- `src/app/pages/clarity-live-page.tsx:1288-1291` — realtime not-in-flight wholesale replace
- `src/app/pages/clarity-live-page.tsx:1543-1545` — drift-poll not-in-flight wholesale replace
- `src/lib/live-state-merge.ts:39-49` — `mergeInFlight` (guards `ratingPhase` only)
- `src/tests/live-state-guard.test.ts` — 4 `it.todo` entries documenting the gap

## Severity

**Medium** — intermittent stuck/again-waiting session degrades the core /live experience, but it is recoverable (next correct echo or a re-submit re-syncs) and there is no data loss or security exposure.

## Fix Approach

Extend the regression guard to also reject **same-phase boolean-flag regressions**: when incoming `ratingPhase === local ratingPhase`, a flag transition `true → false` for `checkerSubmitted` / `responderSubmitted` (and any other monotonic submission flags) is a regression and the echo must be skipped — in BOTH the realtime and drift-poll not-in-flight branches, not only inside `mergeInFlight`. Prefer a single shared guard used by all three call sites.

Per [.claude/rules/live.md](../.claude/rules/live.md), the fix is NOT complete until a **two-party E2E that drives the real UI** (button clicks, not `advanceSessionState`) fails on the pre-fix commit and passes on the post-fix commit. Reference template: `e2e/p827-picker-real-flow.spec.ts`. The 4 `it.todo` entries in `live-state-guard.test.ts` should become real unit assertions against the extended guard.

## Acceptance Criteria

- [x] A same-phase Realtime/poll echo carrying `*Submitted: false` does NOT revert a locally-set `*Submitted: true` (8 assertions in `p976-reproduce.test.ts` + 5 in `live-state-guard.test.ts`)
- [x] Both the realtime handler and the drift-poll branch apply the boolean-flag guard (not only `mergeInFlight`) — wired `isStateRegression` into realtime ~1254 and drift-poll ~1527
- [x] Two-party UI-driven E2E reproduces the stuck state on the pre-fix commit and passes post-fix — `e2e/p976-boolean-flag-stale-echo.spec.ts` (button click + stale-echo DB inject, two subscribed browser contexts)
- [x] Phase-regression behavior is unchanged — all 16 existing `isPhaseRegression` phase tests in `live-state-guard.test.ts` pass
- [ ] No console errors during a normal two-party rating round (browser-observable; pending manual UAT)
