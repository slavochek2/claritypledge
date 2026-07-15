---
status: week
type: bug
rank: 1000945.0
severity: low
workstream: observability
date_reported: '2026-07-15'
created_date: '2026-07-15'
tags: [sentry, observability, noise-filter, error-handling]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P990: `logDbError` suppresses network-blip noise, then the next line re-throws it into Sentry

## Summary

`logDbError()` deliberately drops network-blip errors (`Load failed`, `Failed to fetch`, empty-message aborts) so they never reach Sentry — but 28 call sites immediately re-throw the same error wrapped in a new `Error`, which reaches Sentry through the global handler instead. The filter suppresses one door and the throw opens another.

Prior art: **P913** added the expired-token filter and the `Load failed` / empty-message filters were added to `db-error-logger.ts` (see its inline comments citing `JAVASCRIPT-REACT-2H`, `-2J`). Those filters work — for the non-throwing paths. What they missed: every `logDbError(...)` followed by `throw new Error(...)` re-reports the identical noise under a different message.

## Root Cause

`src/app/data/db-error-logger.ts:36-50` returns early (no `Sentry.captureException`) when the Postgrest-shaped error is a network blip. But the pattern at the call sites is:

```typescript
if (error) {
  logDbError('submitPointResponse', error);                        // filtered → no Sentry
  throw new Error(`Failed to submit point response: ${error.message}`);  // ← unfiltered → Sentry
}
```

The thrown `Error` carries the blip text in its message (`Failed to submit point response: TypeError: Load failed`) and is a plain `Error`, not a `PostgrestError`, so `logDbError`'s filter never sees it. It propagates to Sentry's global handler / the React ErrorBoundary.

**Evidence this is live, not theoretical:** Sentry has both twins for the same underlying event —
- `JAVASCRIPT-REACT-28` — `DB error in submitPointResponse: TypeError: Load failed` (the `logDbError` path; **now filtered**)
- `JAVASCRIPT-REACT-29` — `Failed to submit point response: TypeError: Load failed` (the `throw` path; **still reported**)

Both fired from `/letter/7bd0d109-…`, one event each, same timeframe. 28 is silenced; 29 is not.

## Reproduction Steps

1. Open `/letter/:id` as a recipient on a flaky connection (or Mobile Safari, which phrases a failed fetch as `Load failed`).
2. Submit a point response.
3. Kill connectivity mid-request (or background the tab so Safari kills the fetch).
4. Observe: `logDbError('submitPointResponse', …)` correctly suppresses, but Sentry still receives `Failed to submit point response: TypeError: Load failed`.

**Reproduction rate:** intermittent — requires the fetch to fail; 1 event observed in ~1 month.

## Expected Behavior

A network blip produces no Sentry event at all, regardless of whether the call site re-throws. The user-facing error path (toast, retry affordance) is unaffected — the throw should still happen, it just shouldn't be *reported* as an application bug.

## Actual Behavior

The blip is reported to Sentry under the wrapper message. `JAVASCRIPT-REACT-29` is the live instance.

## Affected Files

- `src/app/data/db-error-logger.ts` — lines 36-50, the `isNetworkBlip` predicate (currently local, not exported)
- 28 call sites of the `logDbError(...)` → `throw new Error(...)` shape:
  - `src/app/data/letters-service.ts` — 17 sites (78, 337, 386, 485, 506, 670, 849, 871, 886, 927, 1131, 1168, 1677, 1693, …)
  - `src/app/data/docs-service.ts` — 9 sites (272, 496, 538, 556, 578, 599, 621, 638, 651)
  - `src/app/data/points-service-real.ts` — 2 sites (865, 880)
  - `src/app/data/events-service-real.ts` — 3 sites (891, 923, 938)

## Severity

**Low** — 0 users impacted, 1 observed event. The user-facing behavior is already correct (the throw drives the error UI); this is reporting hygiene only. Filed because it's a systemic hole in a filter the team already decided it wanted: leaving it means the `Load failed` noise the P913-era work suppressed keeps arriving under different names.

## Fix Approach

Do **not** hand-edit 28 call sites. The blip classification already exists — the fix is to make the throw path consult it.

**A broad `beforeSend` message filter is disfavoured — this is settled, not open.** decisions.md 2026-06-05 (P883) explicitly rejected Sentry-side filtering for noise our own code already classifies: *"the filter belongs where the knowledge lives, and a Sentry filter would also hide genuinely unexpected errors sharing the message shape."* A `/Load failed/` message filter would drop a genuinely unexpected error that happens to wrap a fetch failure — exactly the harm P883 named. (P988's `ignoreErrors` patterns are **not** a precedent here: that noise is injected by the host browser and our code never sees it, so Sentry-side is the only available layer. See the four-rung ladder in decisions.md 2026-07-15.)

Preferred direction (needs a design call at `/architect` time):
- Keep the knowledge where it lives. Export the `isNetworkBlip` predicate from `db-error-logger.ts` and classify at the service layer, per P883's ordering rule.
- Have the blip path throw a **distinguishable error type** (e.g. a `NetworkBlipError`) rather than a bare `Error`, so any Sentry-side drop keys on the type *our code assigned* rather than on a message shape Sentry has to guess at. This preserves the user-facing throw while making the report suppressible without message breadth.
- The 28-call-site churn is the real cost of this route and the reason the broad filter was tempting. Look for a shared choke point (a `throwDbError(context, error)` helper the sites already funnel through, or could) so the classification is written once, not 28 times — a future site that forgets the helper is the failure mode to design against.

Open question that remains: whether the type-keyed drop happens in `beforeSend` (needs the type to survive Sentry's serialization — verify, don't assume) or by not throwing at all on the blip path (changes caller control flow — check every caller's error UI first).

## Acceptance Criteria

- [ ] A Sentry event with message `Failed to submit point response: TypeError: Load failed` is dropped
- [ ] A Sentry event with message `Failed to create letter: TypeError: Load failed` is dropped (proves the fix is generic, not one call site)
- [ ] A genuine application error from the same functions (e.g. `Failed to create letter: duplicate key value violates unique constraint`) still reaches Sentry
- [ ] The user-facing error path is unchanged — the throw still happens and the UI still shows its error state
- [ ] Regression test passes: `src/tests/p990-*.test.ts`
- [ ] No console errors during the affected flow
