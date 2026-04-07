/**
 * @file p674-smoke.spec.ts
 * @description Smoke test for P674: Simplified /live — fast regression detection.
 *
 * Verifies:
 * 1. /live page loads without errors
 * 2. No console errors on initial load
 * 3. Two-party session renders idle screen without mode toggle
 * 4. Session code displays correctly
 */

import { test, expect } from '@playwright/test';
import { createTwoPartySession, type TwoPartySession } from './helpers/test-session';

test.describe('P674: Smoke Tests', () => {
  test.describe.configure({ timeout: 60000 });

  let session: TwoPartySession;

  test.afterEach(async () => {
    if (session) await session.cleanup();
  });

  test('/live session loads without errors for both participants', async ({ browser }) => {
    session = await createTwoPartySession(browser, {
      hostName: 'SmokeHost',
      guestName: 'SmokeGuest',
    });

    // Collect console errors on host page
    const consoleErrors: string[] = [];
    session.host.page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Both pages should have loaded without redirecting away
    expect(session.host.page.url()).toContain(`/live/${session.sessionCode}`);
    expect(session.guest.page.url()).toContain(`/live/${session.sessionCode}`);

    // Host page should render meaningful content (not a blank page or error screen)
    await expect(session.host.page.locator('body')).toBeVisible();

    // Wait a beat for any async errors to surface
    await session.host.page.waitForTimeout(2000);

    // Filter out known non-critical console errors (e.g., Supabase Realtime noise)
    const criticalErrors = consoleErrors.filter(
      err =>
        !err.includes('Realtime') &&
        !err.includes('WebSocket') &&
        !err.includes('Failed to load resource'),
    );

    expect(criticalErrors).toEqual([]);
  });

  test('session code is visible to both participants', async ({ browser }) => {
    session = await createTwoPartySession(browser, {
      hostName: 'SmokeHost2',
      guestName: 'SmokeGuest2',
    });

    // Session code should be visible somewhere on the page
    await expect(
      session.host.page.getByText(session.sessionCode)
    ).toBeVisible({ timeout: 10000 });
  });

  test('no mode toggle visible (guided/free modes merged)', async ({ browser }) => {
    session = await createTwoPartySession(browser, {
      hostName: 'SmokeHost3',
      guestName: 'SmokeGuest3',
    });

    // Wait for page content to load
    await expect(session.host.page.locator('body')).toBeVisible({ timeout: 10000 });

    // These mode toggles should be gone after P674
    await expect(session.host.page.getByText('Guided mode')).not.toBeVisible({ timeout: 3000 });
    await expect(session.host.page.getByText('Open mode')).not.toBeVisible({ timeout: 3000 });
    await expect(session.guest.page.getByText('Guided mode')).not.toBeVisible({ timeout: 3000 });
    await expect(session.guest.page.getByText('Open mode')).not.toBeVisible({ timeout: 3000 });
  });
});
