---
status: all-done
type: task
rank: 1000000.25
workstream: live
created_date: 2026-02-27T00:00:00.000Z
tags:
  - e2e
  - testing
  - two-party
  - realtime
flow: dev
locked_at: '2026-02-28T09:34:29.546Z'
---

# P460: Fix Two-Party E2E Session Infrastructure

## Problem

All two-party live session E2E tests are skipped (`test.describe.skip`) because session state sync between Playwright's isolated browser contexts fails in the test environment.

**Root cause:** Supabase Realtime WebSocket presence events do NOT propagate between `browser.newContext()` isolated contexts. When the joiner joins via one context, the creator's page (in a separate context) never receives the Realtime event — so the creator's UI never updates.

**Affected file:** `e2e/live-content-picker.spec.ts` — entire test suite skipped since P128.

**The app code is correct.** Only the test infrastructure needs fixing.

## What Already Exists

`e2e/helpers/test-realtime.ts` has DB polling helpers:
- `mockMicPermission(page)` — injects fake mic stream so mic permission check doesn't block
- `waitForDBPresence(table, column, value, matchColumn, matchValue)` — polls DB until value appears
- `waitForDBStateKey(table, id, key, value)` — polls `state` JSONB column
- `waitForDBColumnSet(table, id, column)` — waits for any non-null value in column

These are ready to use but the tests never fully adopted them — the skip was filed instead.

## Solution

Replace Realtime-dependent UI assertions with DB polling + page reload/revalidation strategy:

1. **After joiner joins:** use `waitForDBPresence` to confirm DB state, then call `page.reload()` on the creator page to force a fresh fetch of session state (bypasses Realtime entirely)
2. **For session state transitions:** same pattern — DB poll → reload → assert UI
3. **For phase changes:** same — DB poll → reload → assert

This is a test-only fix. App code stays untouched.

## Files to Change

- `e2e/live-content-picker.spec.ts` — remove `.skip`, rewrite setup to use DB polling + page reload pattern
- `e2e/helpers/test-realtime.ts` — add `reloadAfterDBPresence(page, ...)` convenience helper if needed

## Acceptance Criteria

- [ ] `test.describe.skip` removed from `live-content-picker.spec.ts`
- [ ] At least 1 two-party test passes (happy path: creator + joiner see each other)
- [ ] No test flakiness — DB polling has deterministic timeout
- [ ] `test-realtime.ts` helpers used correctly (not raw polling inline)

## Technical Notes

**Pattern for each cross-context assertion:**
```typescript
// OLD (broken — Realtime doesn't propagate):
await expect(creatorPage.getByText('Test Joiner')).toBeVisible({ timeout: 15000 });

// NEW (works — DB poll then force reload):
await waitForDBPresence('clarity_sessions', 'joiner_name', 'Test Joiner', 'code', roomCode);
await creatorPage.reload();
await expect(creatorPage.getByText('Test Joiner')).toBeVisible({ timeout: 10000 });
```

**Debug report reference:** `test-results/P128-CONTENT-PICKER-DEBUG.md` (if it exists)

**Scope:** Fix enough tests to unblock CI. Priority order:
1. Happy path: creator + joiner connected
2. Story selection by creator (joiner sees it)
3. Check button flow
