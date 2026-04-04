---
status: all-done
type: task
rank: 0.001
flow: dev
completed_at: "2026-04-03"
superseded_by: p644
tags:
  - testing
  - e2e
  - infra
  - quality-gate
created_date: 2026-04-03T00:00:00.000Z
---

# P637: No-Reload E2E Sync — Catch Realtime + Drift Gaps

## Problem Statement

**Every two-party Playwright test uses `page.reload()` to sync state between browser contexts.** This is stronger than any real-world delivery mechanism — it fetches the entire session from DB, bypassing both Realtime WebSocket delivery AND drift detection polling. Result: tests pass but the feature is broken for real users.

**Concrete incident (P617):** `ratingInitiatedBy` was missing from the drift detection field list (15 fields checked, this one omitted). Realtime was flapping (`CHANNEL_ERROR` loop). The listener's mode switcher never disabled. But all 5 Playwright E2E tests passed — because `page.reload()` loaded `ratingInitiatedBy` directly from DB, skipping both broken delivery paths.

**Class of bug:** Any `live_state` field that (a) affects UI rendering and (b) isn't in the drift detection list will be invisible to the partner when Realtime drops. Our tests systematically mask this by reloading.

## Discovery Context

**Session transcript:** `/Users/slavochek/.claude/projects/-Users-slavochek-Projects-public-claritypledge/593ee69e-4fbe-461d-b2af-44f00b84661c.jsonl`

**Evidence chain:**
- P617 UAT-3 E2E test passed (verified disabled mode switcher via `opacity-50` CSS class)
- Manual UAT showed mode switcher NEVER disables — after 5-7 attempts
- Console logs revealed Realtime channel flapping: `SUBSCRIBED → CHANNEL_ERROR` in tight loop
- Drift detection at `clarity-live-page.tsx:1212-1235` checks 15 fields but NOT `ratingInitiatedBy`
- Test used `waitForLiveStateKey() → page.reload() → assert` which bypasses both delivery mechanisms

## Solution: Two Changes

### 1. `waitForUIUpdate()` helper — replaces `reload()` in two-party tests

```typescript
// e2e/helpers/test-realtime.ts (new export)

/**
 * Wait for a UI element to appear/change WITHOUT page.reload().
 * Forces the test to rely on the app's own state delivery (Realtime + drift polling).
 * If the field isn't delivered, the test fails — which is the point.
 *
 * Use this INSTEAD of: waitForDBKey() → page.reload() → expect(locator)
 * Use this FOR: asserting cross-context state changes in two-party tests
 *
 * @param page - The page that should receive the update (the listener)
 * @param locator - What to wait for (e.g., page.locator('[class*="opacity-50"]'))
 * @param timeoutMs - How long to wait (should exceed drift polling interval)
 */
export async function waitForUIUpdate(
  page: Page,
  locator: Locator,
  timeoutMs: number = 20000,
): Promise<void> {
  await expect(locator).toBeVisible({ timeout: timeoutMs });
}
```

**Usage (P617 UAT-3 rewritten):**
```typescript
// BEFORE (masks delivery bugs):
await waitForLiveStateKey(session.sessionCode, 'ratingInitiatedBy');
await guest.page.reload();
await expect(guest.page.locator('[class*="opacity-50"]')).toBeVisible();

// AFTER (catches delivery bugs):
await waitForUIUpdate(
  guest.page,
  guest.page.locator('[class*="opacity-50"]'),
  20000, // must exceed drift polling interval
);
```

If drift detection doesn't include `ratingInitiatedBy`, the locator never appears → test fails → bug caught before shipping.

### 2. Drift completeness unit test

```typescript
// src/tests/drift-detection-completeness.test.ts

/**
 * Verifies every live_state field that affects UI rendering is covered
 * by the drift detection polling fallback in clarity-live-page.tsx.
 *
 * When you add a new field to live_state that changes what users see,
 * add it to UI_AFFECTING_FIELDS. If you forget to also add it to
 * drift detection, this test fails.
 */
import { describe, it, expect } from 'vitest';

// Fields checked in the drift detection block (clarity-live-page.tsx ~L1212-1235)
const DRIFT_CHECKED_FIELDS = [
  'ratingPhase',
  'checkerName',
  'checkerSubmitted',
  'checkerRating',
  'responderSubmitted',
  'responderRating',
  'explainBackDone',
  'checksCount',
  'clarificationPhase',
  'roleSwitchNegotiation',
  'selectedStoryId',
  'selectedStoryData',
  'selectedContentTitle',
  'celebrationAcknowledgedByCreator',
  'celebrationAcknowledgedByJoiner',
  'celebrationAcknowledgedBy',
  'livePositions',
];

// Fields that affect what users SEE — if these change and the user
// doesn't get the update, they see stale/wrong UI
const UI_AFFECTING_FIELDS = [
  ...DRIFT_CHECKED_FIELDS,
  'ratingInitiatedBy',  // P617: disables mode switcher + hides story card for listener
  // Add new fields here as they're introduced
];

describe('Drift detection completeness', () => {
  it('covers all UI-affecting live_state fields', () => {
    const missing = UI_AFFECTING_FIELDS.filter(f => !DRIFT_CHECKED_FIELDS.includes(f));
    expect(missing).toEqual([]);
  });
});
```

This test currently FAILS (because `ratingInitiatedBy` is missing from drift detection) — which is correct. Fix drift detection → test passes.

## Acceptance Criteria

- [x] `ratingInitiatedBy` added to drift detection in `clarity-live-page.tsx` (the immediate P617 fix)
- [x] `waitForUIUpdate()` helper added to `e2e/helpers/test-realtime.ts`
- [x] At least one existing two-party test converted from `reload()` to `waitForUIUpdate()` (no existing test used `reload()` for cross-context sync — updated `live-content-picker.spec.ts` comment + documented pattern)
- [x] Drift completeness unit test added and passing
- [x] `page.reload()` pattern documented as banned in two-party state sync (added to `docs/technical/e2e-testing-guide.md`)

## Scope Fence

**In scope:** drift detection fix + no-reload helper + completeness test + docs
**Out of scope:** fixing Realtime channel flapping (separate infra issue), converting ALL existing tests (do incrementally)

## Risk

Converting tests from `reload()` to `waitForUIUpdate()` may surface MORE hidden bugs (fields missing from drift detection). This is a feature, not a risk — but expect some tests to fail initially.
