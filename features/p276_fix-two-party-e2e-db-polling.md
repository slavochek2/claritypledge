---
status: today
type: task
rank: 4.0
workstream: foundation
tags: [e2e, testing, realtime, playwright, supabase]
created_date: 2026-02-18
---

# P276: Fix Two-Party Live Session E2E Tests — Replace Realtime Presence with DB Polling

## Problem

~30 E2E tests across four spec files consistently time out at 30 seconds:

- `e2e/speak-freely-button.spec.ts` (~7 tests)
- `e2e/partner-left-meeting.spec.ts` (~3 tests)
- `e2e/new-meeting-after-partner-left.spec.ts` (~4 tests)
- `e2e/live-meeting-mic-permission.spec.ts` (~3 tests)

All share the same structure: `browser.newContext()` creates two isolated browser contexts (creator + joiner), each navigates to `/live`, and tests assert cross-context state changes — e.g., creator's page shows the joiner's name after the joiner clicks "Join Session".

These tests hang because Supabase Realtime presence events do not propagate between isolated Playwright browser contexts.

## Root Cause

Playwright's `browser.newContext()` creates fully isolated browser environments: separate storage, cookies, and network state. Each context establishes its own Supabase Realtime WebSocket subscription. However, when context B (joiner) writes to the database, context A's (creator) Realtime subscription receives no event — the isolation prevents Realtime presence events from crossing context boundaries.

The DB write itself succeeds. For example, after the joiner clicks "Join Session":

1. `clarity_sessions.joiner_name` is written correctly in the database
2. The creator's Realtime channel subscription never fires
3. The creator's page never re-renders with the joiner's name
4. `expect(creatorPage.getByText('Bob')).toBeVisible({ timeout: 10000 })` times out after 30s

This is a **test infrastructure problem**, not an application bug. The app's Realtime subscriptions work correctly in real browsers. The tests need an alternative synchronization mechanism that works within Playwright's isolated contexts.

## Solution

Create a `waitForDBPresence` helper in `e2e/helpers/test-realtime.ts` that polls the database directly via `supabaseAdmin` until the expected value appears, then allows the test to proceed. After DB state is confirmed, the app's own polling or UI state will handle the visual update on the page under test.

### New file: `e2e/helpers/test-realtime.ts`

```typescript
/**
 * @file test-realtime.ts
 *
 * E2E Test Helpers for Realtime Synchronization
 *
 * Supabase Realtime presence events do NOT propagate between Playwright's
 * isolated browser contexts (browser.newContext()). Each context establishes
 * its own WebSocket subscription in isolation.
 *
 * These helpers poll the database directly via supabaseAdmin to wait for
 * state changes that would normally be delivered via Realtime. After DB
 * state is confirmed, the page UI update will follow via the app's own
 * polling/subscription mechanisms.
 */

import { supabaseAdmin } from '../../src/lib/supabase-admin';

const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Polls a Supabase table until a column matches an expected value.
 *
 * Use this instead of `expect(page.getByText(name)).toBeVisible()` when the
 * update is written by a different Playwright browser context (two-party tests).
 *
 * @param table       - Table name (e.g. 'clarity_sessions')
 * @param column      - Column to read (e.g. 'joiner_name')
 * @param value       - Expected value to wait for (e.g. 'Bob')
 * @param matchColumn - Column to filter on (e.g. 'code')
 * @param matchValue  - Value to filter by (e.g. 'ABC123')
 * @param timeoutMs   - Max wait time in ms (default 10000)
 *
 * @throws Error if the value does not appear within timeoutMs
 *
 * @example
 * // Wait for joiner to appear in DB before asserting UI
 * await waitForDBPresence('clarity_sessions', 'joiner_name', 'Bob', 'code', roomCode);
 * await expect(creatorPage.getByText('Bob')).toBeVisible({ timeout: 5000 });
 */
export async function waitForDBPresence(
  table: string,
  column: string,
  value: string,
  matchColumn: string,
  matchValue: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(column)
      .eq(matchColumn, matchValue)
      .single();

    if (!error && data && (data as Record<string, unknown>)[column] === value) {
      return; // Value found — test can proceed
    }

    await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_INTERVAL_MS));
  }

  throw new Error(
    `[waitForDBPresence] Timed out after ${timeoutMs}ms waiting for ` +
    `${table}.${column} = '${value}' where ${matchColumn} = '${matchValue}'`
  );
}

/**
 * Polls a Supabase table until a column becomes non-null/non-empty.
 *
 * Variant of waitForDBPresence for cases where you only need to confirm
 * a value was set (any non-null value) rather than a specific value.
 *
 * @param table       - Table name
 * @param column      - Column to check for non-null
 * @param matchColumn - Column to filter on
 * @param matchValue  - Value to filter by
 * @param timeoutMs   - Max wait time in ms (default 10000)
 */
export async function waitForDBColumnSet(
  table: string,
  column: string,
  matchColumn: string,
  matchValue: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(column)
      .eq(matchColumn, matchValue)
      .single();

    const val = data && (data as Record<string, unknown>)[column];
    if (!error && val !== null && val !== undefined && val !== '') {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_INTERVAL_MS));
  }

  throw new Error(
    `[waitForDBColumnSet] Timed out after ${timeoutMs}ms waiting for ` +
    `${table}.${column} to be non-null where ${matchColumn} = '${matchValue}'`
  );
}
```

### Usage pattern (before/after)

**Before (fails in Playwright):**
```typescript
await listenerPage.getByRole('button', { name: 'Join Session' }).click();
// Relies on Realtime — never fires between isolated contexts:
await expect(creatorPage.getByText('Bob')).toBeVisible({ timeout: 10000 });
```

**After (reliable):**
```typescript
import { waitForDBPresence } from './helpers/test-realtime';

await listenerPage.getByRole('button', { name: 'Join Session' }).click();
// Wait for DB write to confirm (Realtime-independent):
await waitForDBPresence('clarity_sessions', 'joiner_name', 'Bob', 'code', roomCode);
// Now assert the UI — app's polling will have updated by now:
await expect(creatorPage.getByText('Bob')).toBeVisible({ timeout: 5000 });
```

### Files to update

Apply the pattern to every cross-context assertion that expects the _other_ context's page to reflect a DB change:

| Spec file | Failing assertions | Pattern to fix |
|---|---|---|
| `partner-left-meeting.spec.ts` | `creatorPage.getByText('Bob')`, `joinerPage.getByText('Alice')`, `creatorPage.getByText('Bob has left')` | `waitForDBPresence` on `joiner_name`, then poll on session state |
| `new-meeting-after-partner-left.spec.ts` | Same creator/joiner cross-context assertions | Same pattern |
| `speak-freely-button.spec.ts` | `speakerPage.getByText(listenerName)`, dialog assertions cross-context | `waitForDBPresence` on `joiner_name`, then `state` column for dialog events |
| `live-meeting-mic-permission.spec.ts` | `creatorPage.getByText('Joiner')`, `creatorPage.getByText('Waiting...')` | `waitForDBPresence` on `joiner_name` |

For `speak-freely-button.spec.ts` dialog events (e.g., "Allow Bob to skip"), the `state` JSONB column on `clarity_sessions` carries the session state. A `waitForDBPresence` variant checking the `state` column for specific keys may be needed, or `waitForDBColumnSet` combined with a short UI poll.

## Acceptance Criteria

1. `e2e/helpers/test-realtime.ts` exists with `waitForDBPresence` and `waitForDBColumnSet` exported functions
2. All currently-failing two-party tests in the four spec files pass reliably (no 30s timeouts)
3. No test is deleted or `.skip`-ped as a workaround — all tests must actively pass
4. Helper follows the same pattern as `e2e/helpers/test-user.ts` (JSDoc, console logging, clear error messages)
5. Test run time for the four spec files improves from ~15 min (30s timeouts * ~30 tests) to under 3 min

## Technical Notes

### Why this approach

- DB polling via `supabaseAdmin` works in Node.js (Playwright's test runner context) and bypasses the Realtime isolation problem entirely
- The app already has its own DB polling fallback (`creator-detects-joiner.spec.ts` explicitly tests it), so the UI will update once the DB value is confirmed
- This is the minimal change: one new helper file, pattern applied across four spec files
- No changes to application code required

### State column for complex events

`clarity_sessions.state` is a JSONB column that carries the full session UI state (who is negotiating, dialog states, etc.). For `speak-freely-button.spec.ts` dialog assertions, a helper that reads `state` and checks for specific JSON keys may be useful:

```typescript
// Example for state-based polling (implement if simple value polling is insufficient)
await waitForDBStateKey('clarity_sessions', 'state', 'speakFreelyRequested', true, 'code', roomCode);
```

Examine the actual `state` structure in the DB during a real test run to determine exact key names before implementing.

### Session cleanup

The existing `deleteClaritySession(roomCode)` cleanup in `finally` blocks already handles cleanup. No changes needed there.

### TypeScript

`supabaseAdmin` already has types from `@supabase/supabase-js`. The helper uses `Record<string, unknown>` for the row data to avoid needing generated types — consistent with how other helpers in `test-user.ts` and `test-calibration.ts` are written.

## Implementation Steps

1. Create `e2e/helpers/test-realtime.ts` with `waitForDBPresence` and `waitForDBColumnSet`
2. Run the failing tests with `--reporter=list` to see exact assertions failing and confirm they map to cross-context DB reads
3. Update `partner-left-meeting.spec.ts` — simplest tests, good place to validate the pattern
4. Update `new-meeting-after-partner-left.spec.ts`
5. Update `live-meeting-mic-permission.spec.ts`
6. Update `speak-freely-button.spec.ts` — most complex, handle both `joiner_name` and `state` column checks
7. Run full suite to confirm pass rate

## Out of Scope

- Fixing Supabase Realtime in Playwright (not possible without shared browser storage)
- Changes to application code
- Changes to non-two-party tests
