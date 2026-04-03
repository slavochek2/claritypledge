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

import { Page, Locator, expect } from '@playwright/test';
import { supabaseAdmin } from '../../src/lib/supabase-admin';

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
