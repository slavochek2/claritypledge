---
status: backlog
type: bug
rank: 13
severity: medium
workstream: C1
date_reported: '2026-06-24'
created_date: '2026-06-24'
tags:
  - letters
  - receiver
  - point-engage
  - error-handling
  - silent-failure
delivery_stage: create-bug
pipeline_ran:
  - create-bug
---

# P960: Point-position submit can hang the receiver (no RPC timeout)

## Summary

`submitPointPosition` in `src/app/hooks/useLetterReadingState.ts` awaits the point-response RPC with no timeout. If the RPC hangs (promise never settles), `isSubmitting` stays `true` forever (the `finally` is never reached), permanently disabling the point-engage UI — the same hang failure mode fixed for the rating step in P959.

## Root Cause

Same class as P959. `submitPointPosition` already has a `catch` (so a *rejecting* RPC is handled), but the awaits (`submitPointResponseByToken` / `submitPointResponse`) are not wrapped in a timeout. A hung promise never reaches `finally { setIsSubmitting(false) }`, so the point-engage controls stay disabled with no recovery. P959 fixed this for `submitStoryRating` by wrapping the RPC awaits in `withTimeout(...)` (module-level helper added in P959).

## Reproduction Steps

1. As a real receiver (token or deliveryId flow), reach a `point-engage` step.
2. Select a position and submit while the point-response RPC hangs (never settles).
3. Observe: the point controls stay disabled indefinitely; no recovery.

**Reproduction rate:** 100% when the RPC hangs.

## Expected Behavior

A hung point-response RPC should time out, surface feedback, and re-enable the controls for a retry — mirroring the P959 rating-step fix.

## Actual Behavior

Controls stay disabled forever; no timeout, no recovery.

## Affected Files

- `src/app/hooks/useLetterReadingState.ts` — `submitPointPosition` (RPC awaits lack the `withTimeout` wrapper that `submitStoryRating` now uses).

## Severity

**Medium** — requires an RPC hang (rarer than the rating path, which lacked even a catch); reject path already handled. Same hook, lower exposure.

## Fix Approach

Wrap the `submitPointResponseByToken` / `submitPointResponse` awaits in the existing `withTimeout(..., RATING_SUBMIT_TIMEOUT_MS, ...)` helper (rename the constant to something submit-generic if shared). Add the `mountedRef` guard to its post-await setState too. Reuse the P959 canary shape (fake-timer hang test).

## Acceptance Criteria

- [ ] A hung point-response RPC times out and re-enables the point-engage controls.
- [ ] Error feedback is surfaced (toast) rather than a silent permanent disable.
- [ ] Regression test covers the hang path for `submitPointPosition` (fake timers).
- [ ] No console errors during the normal point-submit flow.
