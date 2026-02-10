---
status: in-progress
type: bug
priority: p0
severity: high
date_reported: '2026-02-09'
tags: []
---

# BUG: P140 - Story Refresh Undefined State

## Problem

Story detail pages show "Failed to load story. Please check your connection." error when refreshed due to undefined `setPositionLoading` state variable being called.

## Symptoms

- Navigate to any story detail page (`/story/:id`)
- Refresh the page (Cmd+R)
- See error: "Failed to load story. Please check your connection."
- Console shows: `ReferenceError: setPositionLoading is not defined`
- Affects all story pages (100% failure rate)

## Root Cause

**File:** `src/app/pages/story-detail-page.tsx` (lines 504, 520)

P132 commit added calls to `setPositionLoading(true)` and `setPositionLoading(false)` without defining the state variable:

```typescript
// ❌ Bug: setPositionLoading never defined
if (data.points.length > 0) {
  setPositionLoading(true);  // ReferenceError
  try {
    // fetch position data
  } finally {
    setPositionLoading(false);  // ReferenceError
  }
}
```

The error is caught by outer try/catch, setting `error = 'network_error'`, which displays the connection error message.

**Why it wasn't caught:**
1. Pre-commit checks not run before P132 commit
2. Vite build uses esbuild (ignores type errors by default)
3. No E2E tests for story detail page loading
4. Code never manually tested

## Resolution

**Code fix:**
- Removed undefined `setPositionLoading(true)` and `setPositionLoading(false)` calls
- Position data loading still works (unused loading state removed)

**Prevention (3 layers):**
1. **Dev time:** Added explicit `tsc --noEmit` to pre-commit checks
2. **Runtime:** Added E2E test for story refresh scenario
3. **Process:** Strengthened CLAUDE.md to require `/slava:build:create-feature` skill

## Verification

- [ ] Run `npm run dev` and navigate to `/story/:id`
- [ ] Refresh page - should load without errors
- [ ] Console has no `setPositionLoading` errors
- [ ] Run E2E test: `npm run test:e2e -- e2e/story-detail-page-loads.spec.ts`
- [ ] Run pre-commit: `./scripts/pre-commit-checks.sh` - TypeScript check passes
