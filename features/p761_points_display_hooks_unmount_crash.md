---
status: week
type: bug
rank: 1000760.0
severity: medium
workstream: core
date_reported: '2026-04-18'
created_date: '2026-04-18'
tags: [hooks, unmount, async, regression]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P761: usePointsForProfile and usePointsForFeed crash on unmount — unguarded async state updates

## Summary

`usePointsForProfile` and `usePointsForFeed` in `usePointsForDisplay.ts` have the same unmount-crash pattern as P760: async fetch fires on mount, `finally { setLoading(false) }` runs unconditionally after teardown, causing state updates on unmounted components and `window is not defined` crashes in Vitest.

## Root Cause

Both hooks declare a `load` async function that calls `setLoading(true)`, `setPoints(data)`, `setError(err)`, and `finally { setLoading(false) }` — all unconditionally. No `isMountedRef` guard. When the component unmounts mid-fetch (navigation, fast re-render, StrictMode double-invoke), the settled Promise callbacks still execute and attempt to update state on a dead component. In Vitest/jsdom, this triggers `window is not defined` because React's scheduler tries to access browser APIs in a torn-down environment.

P760 patched `useUnreadLetterCount` but the pattern was not applied to the sibling hooks in the same file.

## Reproduction Steps

1. Write a Vitest test that renders `usePointsForProfile` or `usePointsForFeed` via `renderHook`
2. Unmount immediately after render (before the 50ms mock promise resolves)
3. Await the promise window
4. Observe: React state update fires on unmounted component → `window is not defined` error / unhandled rejection

**Reproduction rate:** 100% in Vitest; latent in production (no observable crash, but potential state corruption on fast navigation)

## Expected Behavior

After unmount, no state setters are called. Async fetch result is discarded silently.

## Actual Behavior

`setPoints`, `setError`, and `setLoading` all execute after unmount via the unguarded `finally` block, producing unhandled rejections in tests and potential stale state in production.

## Affected Files

- `src/app/hooks/usePointsForDisplay.ts` — line 62-64 (`usePointsForProfile` finally block), line 126-127 (`usePointsForFeed` finally block); both `load` functions lack `isMountedRef` guard

## Severity

**Medium** — not a production crash visible to users, but causes Vitest suite failures and latent state corruption risk on fast navigation. Same severity as P760.

## Fix Approach

Add `isMountedRef = useRef(true)` to each hook. Mount effect sets `isMountedRef.current = true` (StrictMode reset) and cleanup sets it to `false`. Guard all state setters inside `load` with `if (isMountedRef.current)`. Guard the early `setLoading(true)` at start of `load` with `if (!isMountedRef.current) return`. Identical pattern to P760 fix on `useUnreadLetterCount`.

Files changed: `src/app/hooks/usePointsForDisplay.ts` (add `useRef` import + guards to both hooks), `src/tests/usePointsForDisplay-unmount.test.tsx` (new canary test — write before fix, must fail on main).

## Acceptance Criteria

- [ ] Canary test `src/tests/usePointsForDisplay-unmount.test.tsx` FAILS on main before fix is applied
- [ ] After fix: both `usePointsForProfile` and `usePointsForFeed` tests PASS with no unhandled rejections
- [ ] Full `npx vitest run` suite passes with 0 new errors
- [ ] `tsc --noEmit` passes (no type regressions)
- [ ] No console errors or warnings introduced
