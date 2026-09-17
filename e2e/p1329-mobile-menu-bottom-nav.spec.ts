/**
 * @file p1329-mobile-menu-bottom-nav.spec.ts
 * @description P1329 — signed in on a phone, the open menu's last entries sat under the
 * fixed bottom tab bar (founder screenshot, 2026-09-17, /feed). P1310 capped the panel
 * against the viewport minus the TOP nav only; the bottom nav (signed-in only, same z-50,
 * later in the DOM) painted over the panel's last ~64px.
 *
 * Behavioural: scroll the panel to its end and assert the last entry is fully above the
 * bottom nav's top edge — the thing jsdom cannot see (see p1310-mobile-nav.test.tsx).
 * Viewport is confirmed via window.innerWidth before measuring (.claude/rules/browser.md).
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';

const VIEWPORTS = [
  { name: '375', width: 375, height: 667 },
  { name: '320', width: 320, height: 568 },
];

test.describe('P1329 — open mobile menu clears the bottom nav when signed in', () => {
  test.setTimeout(90000);
  let user: TestUser;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P1329 Menu' });
    const { error } = await supabaseAdmin.from('profiles').update({ is_verified: true }).eq('id', user.user.id);
    if (error) throw new Error(`verify test user failed: ${error.message}`);
  });

  test.afterAll(async () => {
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  for (const vp of VIEWPORTS) {
    test(`${vp.name}px: last menu entry is reachable above the bottom nav`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await setTestSession(page, user.email);
      await page.goto('/feed');
      expect(await page.evaluate(() => window.innerWidth)).toBe(vp.width);

      const bottomNav = page.locator('[data-nav="bottom"]');
      await expect(bottomNav).toBeVisible({ timeout: 15000 });

      await page.getByRole('button', { name: /open menu/i }).click();
      const panel = page.locator('#mobile-navigation-menu');
      await expect(panel).toBeVisible();

      await panel.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      // Last interactive entry in the panel (Sign out for a signed-in user).
      const last = panel.locator('a, button').last();
      await expect(last).toBeVisible();

      const lastBox = await last.boundingBox();
      const panelBox = await panel.boundingBox();
      const navBox = await bottomNav.boundingBox();
      expect(lastBox && panelBox && navBox).toBeTruthy();
      expect(
        panelBox!.y + panelBox!.height,
        `${vp.name}: panel bottom must not extend under the bottom nav`,
      ).toBeLessThanOrEqual(navBox!.y + 0.5);
      expect(
        lastBox!.y + lastBox!.height,
        `${vp.name}: last entry must end above the bottom nav`,
      ).toBeLessThanOrEqual(navBox!.y + 0.5);
      // Not over-corrected: the panel still reaches down to the bar, no dead gap.
      expect(navBox!.y - (panelBox!.y + panelBox!.height), `${vp.name}: no gap above the bottom nav`).toBeLessThanOrEqual(2);
      await page.screenshot({ path: test.info().outputPath(`signed-in-${vp.name}.png`) });
    });
  }

  // Control: signed out there is no bottom nav, so the P1310 cap (full height) must still apply.
  test('375px signed out: panel still uses the full viewport height', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.locator('[data-nav="bottom"]')).toHaveCount(0);
    await page.getByRole('button', { name: /open menu/i }).click();
    const panel = page.locator('#mobile-navigation-menu');
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box!.y + box!.height).toBeGreaterThan(660);
    await ctx.close();
  });
});
