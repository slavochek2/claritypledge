/**
 * @file test-realtime.ts
 *
 * E2E Test Helpers for Realtime Synchronization
 *
 * ClarityPledge uses Supabase `postgres_changes` (DB-level, WAL-based) for
 * Realtime subscriptions. These DO propagate between Playwright's isolated
 * browser contexts — each context opens its own WebSocket to Supabase, and
 * both receive DB change events independently. Context isolation is browser
 * state (cookies, localStorage), not network.
 *
 * Note: Supabase `presence` and `broadcast` are connection-scoped and would
 * NOT propagate. But ClarityPledge does not use those for state sync.
 *
 * The primary assertion pattern for two-party tests is `waitForUIUpdate()`,
 * which waits for the DOM to update via the app's own delivery mechanisms
 * (Realtime + 1s drift polling). No page.reload() needed.
 *
 * The DB polling helpers below (`waitForDBPresence`, `waitForDBStateKey`, etc.)
 * are useful for test synchronization — knowing when state has been written
 * before asserting UI — but cross-context delivery works without them.
 */

import { Page, Locator, expect } from '@playwright/test';
import { supabaseAdmin } from './supabase-admin';

/**
 * Mocks `navigator.mediaDevices.getUserMedia` on a page to return a fake audio stream.
 *
 * Two-party E2E tests require both contexts to have mic access so the app's
 * mic permission check does not block the join flow. Call this on BOTH creator
 * and joiner pages immediately after `page = await context.newPage()`, before
 * any navigation, so the mock is injected on every subsequent page load.
 *
 * @param page - Playwright Page to inject the mic mock into
 *
 * @example
 * const creatorPage = await creatorContext.newPage();
 * const joinerPage  = await joinerContext.newPage();
 * await mockMicPermission(creatorPage);
 * await mockMicPermission(joinerPage);
 */
export async function mockMicPermission(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const mockAudioTrack = {
      kind: 'audio' as const,
      enabled: true,
      stop: () => {},
    };
    const mockStream = {
      getTracks: () => [mockAudioTrack],
      getAudioTracks: () => [mockAudioTrack],
    };
    // Override getUserMedia globally so the app's mic check always succeeds.
    // This is safe for two-party tests where mic behaviour is not under test.
    navigator.mediaDevices.getUserMedia = async () => mockStream as unknown as MediaStream;
  });
}

// ─── State Advancement (P636) ──────────────────────────────────────
// Write live_state directly to DB, bypassing multi-reload chains that
// exceed Playwright's 30s timeout in two-party tests.

/**
 * Advance a live session's state by writing directly to DB via supabaseAdmin.
 * Use to skip multi-step UI flows without reload chains.
 *
 * After calling this, use waitForUIUpdate() to wait for the UI to reflect
 * the new state — postgres_changes Realtime events DO propagate between
 * Playwright's isolated browser contexts, and 1s drift polling provides
 * a reliable fallback.
 *
 * @param sessionCode - The session room code
 * @param stateOverrides - Partial LiveSessionState to merge into live_state
 */
export async function advanceSessionState(
  sessionCode: string,
  stateOverrides: Record<string, unknown>,
): Promise<void> {
  const { data, error: selectError } = await supabaseAdmin
    .from('clarity_sessions')
    .select('live_state')
    .eq('code', sessionCode)
    .single();
  if (selectError) throw new Error(`advanceSessionState SELECT failed for code '${sessionCode}': ${selectError.message}`);

  const current = (data?.live_state as Record<string, unknown>) ?? {};
  const { error: updateError } = await supabaseAdmin
    .from('clarity_sessions')
    .update({ live_state: { ...current, ...stateOverrides } })
    .eq('code', sessionCode);
  if (updateError) throw new Error(`advanceSessionState UPDATE failed for code '${sessionCode}': ${updateError.message}`);
}

/** State after speaker clicks Speak (sets ratingInitiatedBy) */
export function speakerInitiatedState(speakerName: string): Record<string, unknown> {
  return { ratingInitiatedBy: speakerName };
}

/** State after full round completion — back to idle (all rating fields reset) */
export function postRoundIdleState(): Record<string, unknown> {
  return {
    ratingPhase: 'idle',
    checkerName: null,
    checkerRating: null,
    responderRating: null,
    ratingInitiatedBy: null,
    checkerSubmitted: null,
    responderSubmitted: null,
    proverName: null,
    explainBackRatings: [],
  };
}

/** State mid-round: checker submitted, waiting for responder */
export function checkerSubmittedState(checkerName: string, rating: number): Record<string, unknown> {
  return {
    ratingPhase: 'waiting',
    checkerName,
    checkerRating: rating,
    checkerSubmitted: true,
    ratingInitiatedBy: checkerName,
  };
}

// ─── DB Polling Helpers ────────────────────────────────────────────

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
  console.log(`[test-realtime] Waiting for ${table}.${column} = '${value}' where ${matchColumn} = '${matchValue}'`);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(column)
      .eq(matchColumn, matchValue)
      .single();

    if (!error && data && (data as Record<string, unknown>)[column] === value) {
      console.log(`[test-realtime] Found ${table}.${column} = '${value}' ✓`);
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
 * Polls a Supabase JSONB column until a specific key has an expected value.
 *
 * Use this for state columns (JSONB) where a different Playwright browser
 * context wrote a nested key. After the DB confirms the key, the page under
 * test will receive it on its next DB poll (~1 s).
 *
 * @param table       - Table name (e.g. 'clarity_sessions')
 * @param stateColumn - JSONB column name (e.g. 'state')
 * @param key         - Key within the JSONB object (e.g. 'roleSwitchNegotiation')
 * @param value       - Expected value for that key (e.g. 'pending')
 * @param matchColumn - Column to filter on (e.g. 'code')
 * @param matchValue  - Value to filter by (e.g. 'ABC123')
 * @param timeoutMs   - Max wait time in ms (default 10000)
 *
 * @throws Error if the key does not match within timeoutMs
 *
 * @example
 * await listenerPage.getByRole('button', { name: /Speak freely/i }).click();
 * await waitForDBStateKey('clarity_sessions', 'state', 'roleSwitchNegotiation', 'pending', 'code', roomCode);
 * await expect(speakerPage.getByText('Allow Bob to skip active listening?')).toBeVisible({ timeout: 10000 });
 */
export async function waitForDBStateKey(
  table: string,
  stateColumn: string,
  key: string,
  value: unknown,
  matchColumn: string,
  matchValue: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<void> {
  console.log(`[test-realtime] Waiting for ${table}.${stateColumn}.${key} = '${String(value)}' where ${matchColumn} = '${matchValue}'`);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(stateColumn)
      .eq(matchColumn, matchValue)
      .single();

    if (!error && data) {
      const stateVal = (data as Record<string, unknown>)[stateColumn];
      if (stateVal && typeof stateVal === 'object' && (stateVal as Record<string, unknown>)[key] === value) {
        console.log(`[test-realtime] Found ${table}.${stateColumn}.${key} = '${String(value)}' ✓`);
        return;
      }
    }

    await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_INTERVAL_MS));
  }

  throw new Error(
    `[waitForDBStateKey] Timed out after ${timeoutMs}ms waiting for ` +
    `${table}.${stateColumn}.${key} = '${String(value)}' where ${matchColumn} = '${matchValue}'`
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
  console.log(`[test-realtime] Waiting for ${table}.${column} to be non-null where ${matchColumn} = '${matchValue}'`);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(column)
      .eq(matchColumn, matchValue)
      .single();

    const val = data && (data as Record<string, unknown>)[column];
    if (!error && val !== null && val !== undefined && val !== '') {
      console.log(`[test-realtime] ${table}.${column} is now set ✓`);
      return;
    }

    await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_INTERVAL_MS));
  }

  throw new Error(
    `[waitForDBColumnSet] Timed out after ${timeoutMs}ms waiting for ` +
    `${table}.${column} to be non-null where ${matchColumn} = '${matchValue}'`
  );
}

/**
 * Wait for a UI element to appear/change WITHOUT page.reload().
 * Forces the test to rely on the app's own state delivery (Realtime + drift polling).
 * If the field isn't delivered, the test fails — which is the point.
 *
 * Use this INSTEAD of: waitForDBKey() → page.reload() → expect(locator)
 * Use this FOR: asserting cross-context state changes in two-party tests
 *
 * P637: page.reload() in two-party tests masks delivery bugs — it fetches
 * the entire session from DB, bypassing both Realtime and drift detection.
 *
 * @param page - The page that should receive the update (the listener)
 * @param locator - What to wait for (e.g., page.locator('[class*="opacity-50"]'))
 * @param timeoutMs - How long to wait (should exceed drift polling interval)
 */
export async function waitForUIUpdate(
  _page: Page,
  locator: Locator,
  timeoutMs: number = 20000,
): Promise<void> {
  await expect(locator).toBeVisible({ timeout: timeoutMs });
}

/**
 * Convenience wrapper: polls `clarity_sessions.live_state` until a JSONB key
 * matches a value. Equivalent to `waitForDBStateKey` scoped to the sessions table.
 *
 * @param code      - Session code (the `code` column value)
 * @param key       - live_state JSONB key to watch (e.g. 'ratingPhase')
 * @param value     - Expected value (e.g. 'idle')
 * @param timeoutMs - Max wait in ms (default 15000)
 */
export async function waitForLiveStateKey(
  code: string,
  key: string,
  value: unknown,
  timeoutMs = 15000,
): Promise<void> {
  return waitForDBStateKey('clarity_sessions', 'live_state', key, value, 'code', code, timeoutMs);
}
