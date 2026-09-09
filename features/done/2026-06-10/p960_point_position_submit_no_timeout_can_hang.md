---
status: all-done
type: bug
disclosure: public
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
pipeline_ran: [create-bug, reproduce, fix]
completed_at: 2026-09-09
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

- [x] A hung point-response RPC times out and re-enables the point-engage controls. Both awaits are wrapped in `withTimeout(..., SUBMIT_TIMEOUT_MS, 'Submit point position')`. `src/tests/p960-reproduce.test.tsx` covers the token and deliveryId branches with a promise that never settles: both assert `isSubmitting === false` after the timer advances. Both failed before the fix, pass after (6/6).
- [x] Error feedback is surfaced (toast) rather than a silent permanent disable. The catch now toasts instead of rethrowing for any non-token-expiry error. The rethrow reached nobody — `handleSubmitPosition` (letter-flow-content.tsx:503) awaits with no catch — so a genuine RPC rejection was also silent. Asserted in the HANG and REJECT cases; the REJECT case also asserts the call resolves rather than rejecting.
- [x] Regression test covers the hang path for `submitPointPosition` (fake timers). `vi.useFakeTimers()` plus `advanceTimersByTimeAsync(20000)` past the 15s timeout, one case per RPC branch.
- [x] No console errors during the normal point-submit flow. Two guard cases assert the untouched paths: token expiry still sets `tokenExpired` with no toast, and a successful submit still advances to `point-revealed`. Regression suites green: p959 (3), p714 (5), p898 (15), p960 (6) — 29/29. `npm run lint` exit 0, `./scripts/typecheck-gate.sh` exit 0. No browser check was run; this is unit-level evidence only.

## Implementation notes

- `RATING_SUBMIT_TIMEOUT_MS` is renamed `SUBMIT_TIMEOUT_MS` (the Fix Approach allows this once the
  constant is shared). Same 15000ms value; the four P959 call sites are updated in the same commit.
- `mountedRef` guards are added to the post-await return, the catch, and the `finally`, matching
  what `submitStoryRating` does.
- The canary uses the REAL snapshot mapper with two visible points. The phase machine reads
  `point_config` directly, so a mocked mapper cannot move the phase, and a single visible point
  takes the D36 legacy walk that starts on `story-rate` rather than `point-engage`.

## Code-review findings (codex, adversarial pass)

Verdict: **CHANGES REQUESTED**. Both findings were real and both are now fixed.

1. **[HIGH] The timeout invited a retry the authenticated path could not serve.** `withTimeout`
   rejects locally without cancelling the request, so the server can commit the first answer after
   the client gives up. `submitPointResponse` was a plain `INSERT` under
   `letter_point_responses_unique`, so the retry hit 23505, threw, and the reader was stuck on
   `point-engage` with a generic error until a reload. Verified rather than assumed: the token path
   has always been idempotent (`submit_point_response_by_token` inserts `ON CONFLICT ... DO
   NOTHING`, `20260403224331_p581_clarity_letters.sql:599`) and the client insert had no such
   guard. Fixed by treating 23505 as success in `submitPointResponse`, matching the SQL path.
   This corrects a claim in the first draft of the fix comment, which asserted both paths were
   idempotent without checking.
2. **[MEDIUM] The canary certified recovery from UI re-enablement alone.** It never simulated the
   first request committing after the timeout and then a retry. Added: a late-commit-then-retry
   case in `p960-reproduce.test.tsx` that asserts the retry reaches `point-revealed`, and
   `src/tests/p960-duplicate-point-response.test.ts` for the service behaviour underneath it.
   Failure path exercised: restoring the bare `if (error)` makes the service canary fail (1
   failed), and the guard makes it pass (3 passed).
