---
status: all-done
type: task
rank: 250012.75
workstream: foundation
created_date: '2026-03-16'
flow: dev
tags:
  - auth
  - refactor
test_files:
  - src/tests/p537-useauth-reference-stability.test.tsx
locked_at: '2026-03-18T08:10:39.926Z'
---

# TASK: P537 — Memoize useAuth() return values

## Goal

Stabilize `useAuth()` hook return references (`session`, `user`, `refreshProfile`) so they don't create new object references on every render. Currently, unstable refs cause consumers' `useEffect` to re-fire when unrelated child components re-render.

**Root cause (from /falsify):** `useAuth()` returns new object references each render. AuthCallbackPage's `useEffect` depends on `session`, `user`, and `refreshProfile` — when these are new objects (even with identical content), the effect re-triggers `processAuth()`, causing duplicate profile upserts. Two bandaids are in place (CSS-only loader, `data-status` wrapper) but the underlying vulnerability remains.

## Steps

1. Read `src/auth/useAuth.tsx` (or wherever the auth context/hook is defined)
2. Wrap `session` and `user` return values in `useMemo` (deep-compare on actual content, not reference)
3. Wrap `refreshProfile` in `useCallback`
4. Verify AuthCallbackPage's `data-status` wrapper can be removed after fix
5. Run existing auth flow tests — they should pass without the `data-status` workaround

## Done When

- [ ] `useAuth()` returns stable references when underlying data hasn't changed
- [ ] Auth flow tests pass (critical-auth-flow.test.tsx)
- [ ] New test: reference stability assertion (same render = same ref)
- [ ] `data-status` wrapper in AuthCallbackPage removed (if safe)

## Test Coverage Strategy

**What's Tested:**
- ✅ `refreshProfile` reference stability across re-renders (unit) — currently FAILS, proves the bug
- ✅ `signOut` reference stability across re-renders (unit) — currently FAILS, proves the bug
- ✅ `user` reference stability (unit) — already passes (useState is stable)
- ✅ `session` reference stability (unit) — already passes (useState is stable)
- ✅ Auth flow regression (existing `critical-auth-flow.test.tsx` — 9 tests)

**What's NOT Tested:**
- ❌ No E2E (no UI change)
- ❌ No integration (no DB/API change)
- ❌ No a11y (no UI)

**Test Pyramid:**
```
/ 4 UNIT (reference stability) \
+ 9 existing (auth flow regression)
```

Total: 4 new automated tests + 9 existing regression tests
**Files:** `src/tests/p537-useauth-reference-stability.test.tsx`

**Confirmed:** 2 of 4 tests currently FAIL on `refreshProfile` and `signOut` — proving the instability exists. Fix = wrap in useCallback.
