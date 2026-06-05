/**
 * @file p893-history-probe.spec.ts
 * @description P893 regression canary — each tab click on /letters must push
 * exactly ONE history entry. Radix TabsTrigger fires onValueChange twice per
 * click (focus activation + click); before the dedupe guard in
 * letters-page.tsx handleTabChange, this pushed two identical entries and the
 * browser Back button needed two presses to leave a tab.
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
    expect(len1 - len0, 'Published click should push exactly 1 entry').toBe(1);
    expect(len2 - len1, 'Inbox click should push exactly 1 entry').toBe(1);

    // Back then re-click: the dedupe guard must NOT swallow a legitimate
    // tab change after browser Back resyncs the URL.
    await page.goBack();
    await expect(page).toHaveURL(/[?&]tab=sent/);
    await page.getByRole('tab', { name: /Inbox/i }).click();
    await expect(page).toHaveURL(/[?&]tab=inbox/);
  });
});
