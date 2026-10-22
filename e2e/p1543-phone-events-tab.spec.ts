/**
 * @file p1543-phone-events-tab.spec.ts
 * @description P1543 — signed in on a phone, the bottom tab bar carries Events (the events list)
 * where Groups used to be; Groups moves into the Me sheet. Viewport is confirmed via
 * window.innerWidth before asserting (.claude/rules/browser.md).
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';

test.describe('P1543 — phone tab bar: Events replaces Groups', () => {
  test.setTimeout(90000);
  let user: TestUser;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P1543 Tabs' });
    const { error } = await supabaseAdmin.from('profiles').update({ is_verified: true }).eq('id', user.user.id);
    if (error) throw new Error(`verify test user failed: ${error.message}`);
  });

  test.afterAll(async () => {
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test('375px: Events tab opens the events list; no Groups tab', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await setTestSession(page, user.email);
    await page.goto('/feed');
    expect(await page.evaluate(() => window.innerWidth)).toBe(375);

    const bottomNav = page.locator('[data-nav="bottom"]');
    await expect(bottomNav).toBeVisible({ timeout: 15000 });
    // Events first: proves the tabs rendered, so the Groups count below cannot pass on an empty bar.
    const events = bottomNav.getByRole('link', { name: /^Events/ });
    await expect(events).toBeVisible();
    await expect(events).toHaveAttribute('href', '/events/list');
    await expect(bottomNav.getByRole('link', { name: /^Groups/ })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('p1543-tabbar-375.png') });

    // Groups is still one tap away, inside the Me sheet.
    await page.getByTestId('bottom-nav-me').click();
    const sheet = page.getByTestId('me-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('link', { name: /^Groups/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    await events.click();
    await expect(page).toHaveURL(/\/events\/list(\?.*)?$/);
  });
});
