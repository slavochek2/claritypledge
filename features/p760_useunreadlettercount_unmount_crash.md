---
status: qa
type: bug
rank: 1000760.0
severity: medium
workstream: dx
date_reported: '2026-04-18'
created_date: '2026-04-18'
tags: [testing, hooks, vitest, navigation]
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
---

# P760: useUnreadLetterCount unmount crash fails full Vitest suite

## Summary

When the full Vitest unit suite runs, `navigation-acceptance-full.test.tsx` mounts navigation components that include `useUnreadLetterCount`. The hook fires an async fetch on mount; when the test ends and jsdom tears down the environment, the in-flight promise resolves and calls `setLoading(false)` → React's `dispatchSetState → requestUpdateLane → resolveUpdatePriority` accesses `window` → gone → `ReferenceError: window is not defined` (unhandled rejection). Vitest catches it and fails the suite (1 error; 1931 tests otherwise pass).

## Root Cause

Two-layer cause:

1. **Test hygiene gap:** `navigation-acceptance-full.test.tsx` renders real navigation components without mocking `useUnreadLetterCount`. Nav tests are about menu visibility, auth states, and avatar behaviour — not unread counts. Running the real fetch path couples navigation tests to letter-service behaviour.

2. **Hook missing unmount guard:** `useUnreadLetterCount.ts` has no `isMountedRef` guard — its `finally { setLoading(false) }` runs unconditionally after unmount, triggering a React state update into a dead jsdom environment.

## Reproduction Steps

1. From the repo root on main, run the full Vitest suite: `npx vitest run`
2. Observe: 1 error — `ReferenceError: window is not defined` inside an unhandled rejection from `navigation-acceptance-full.test.tsx`
3. Stack trace passes through `useUnreadLetterCount.ts` finally block

**Reproduction rate:** 100%

## Expected Behavior

Full Vitest suite runs with 1932+ tests passing and 0 errors. No `window is not defined` unhandled rejection.

## Actual Behavior

Suite reports 1 error: `ReferenceError: window is not defined` as an unhandled rejection originating from the `useUnreadLetterCount` finally block during `navigation-acceptance-full.test.tsx` teardown.

## Affected Files

- `src/tests/navigation-acceptance-full.test.tsx` — mounts real nav components without mocking `useUnreadLetterCount`; the fetch fires and resolves after jsdom teardown
- `src/app/hooks/useUnreadLetterCount.ts` — `finally { setLoading(false) }` has no unmount guard; any test that forgets to mock the hook will trigger this

## Severity

**Medium** — no user-facing impact; breaks the full Vitest suite run and masks legitimate failures.

## Fix Approach

Two-layer fix (both required):

**Layer A — Test hygiene (minimum fix for this specific failure):**
Add `vi.mock('@/app/hooks/useUnreadLetterCount', () => ({ useUnreadLetterCount: () => ({ count: 0, loading: false }) }))` at the top of `navigation-acceptance-full.test.tsx`. Mirrors the existing mock pattern in `p722-reproduce.test.tsx:119`.

**Layer B — Hook hardening (prevents future regressions):**
Add `isMountedRef` to `useUnreadLetterCount.ts`. Guard all `setCount` / `setLoading` calls with `if (isMountedRef.current)`. See architect plan `~/.claude/plans/create-a-plan-for-lively-kitten.md` for exact implementation.

**Tech debt noted (out of scope):** `usePointsForDisplay.ts` and `useLetterReadingState.ts` have the same `finally { setLoading(false) }` pattern without an unmount guard — file separately.

## Acceptance Criteria

- [x] `npx vitest run src/tests/useUnreadLetterCount-unmount.test.tsx` — canary test PASSES (note: not fully discriminating due to React 18 silent-drop behavior; documents invariant and exercises the code path)
- [x] `npx vitest run` — full suite reports 0 errors, 1932 tests pass, no `window is not defined` unhandled rejection
- [x] No unrelated test changes (only 3 planned files touched)
- [x] `tsc --noEmit` passes after hook changes
