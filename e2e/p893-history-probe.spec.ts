/**
 * @file p893-history-probe.spec.ts
 * @description P893 regression canary, revised by P1364 — a tab click on /letters now
 * REPLACES the history entry (P1364: "letters tab clicks add no Back steps", matching /feed),
 * so each click adds ZERO entries. P893's original worry — Radix TabsTrigger firing
 * onValueChange twice per click and pushing two identical entries — is covered a fortiori:
 * no click adds any entry. Back leaves /letters in one press.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';

test.describe('P893 probe', () => {
  let user: TestUser;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P893 Probe User' });
  });

  test.afterAll(async () => {
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test('history entries per tab click', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/letters?tab=drafts');
    await page.waitForLoadState('networkidle');

    const len0 = await page.evaluate(() => history.length);

    await page.getByRole('tab', { name: /Published/i }).click();
    await expect(page).toHaveURL(/[?&]tab=sent/);
    await page.waitForTimeout(500);
    const len1 = await page.evaluate(() => history.length);

    await page.getByRole('tab', { name: /Inbox/i }).click();
    await expect(page).toHaveURL(/[?&]tab=inbox/);
    await page.waitForTimeout(500);
    const len2 = await page.evaluate(() => history.length);

    console.log(`[P893 PROBE] history.length: start=${len0} afterPublished=${len1} afterInbox=${len2}`);
    // P1364: was "exactly 1 entry" per click (a push); tab clicks now replace.
    expect(len1 - len0, 'Published click adds no history entry').toBe(0);
    expect(len2 - len1, 'Inbox click adds no history entry').toBe(0);

    // The dedupe guard must not swallow a legitimate change back to a previous tab.
    await page.getByRole('tab', { name: /Published/i }).click();
    await expect(page).toHaveURL(/[?&]tab=sent/);
  });
});
