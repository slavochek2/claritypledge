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
 *
 * P1512: signed in on a phone there is no hamburger panel any more — the bottom bar's Me tab opens
 * the Me sheet, a fixed bottom sheet that is drawn over the bar. The invariant is the same one
 * (the menu's last entry is reachable and not painted over by the fixed bar) and is
 * measured on that sheet: scrolled to its end, its last entry is fully on screen and the topmost
 * element at its centre belongs to the sheet, not to the bar.
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

      await page.getByTestId('bottom-nav-me').click();
      const panel = page.getByTestId('me-sheet');
      await expect(panel).toBeVisible();
      // The sheet slides up (300ms): measure only once it has stopped moving.
      let prevY = Number.NaN;
      await expect.poll(async () => {
        const y = (await panel.boundingBox())?.y ?? Number.NaN;
        const settled = y === prevY;
        prevY = y;
        return settled;
      }, { message: `${vp.name}: sheet settled`, intervals: [150] }).toBe(true);

      // The sheet's own scroller is its <nav>; scroll it to the end.
      await panel.locator('nav').evaluate((el) => { el.scrollTop = el.scrollHeight; });
      // Last interactive entry in the sheet (the avatar menu's own last item for a signed-in user).
      const last = panel.locator('a, button').last();
      await expect(last).toBeVisible();

      const lastBox = await last.boundingBox();
      const panelBox = await panel.boundingBox();
      const navBox = await bottomNav.boundingBox();
      expect(lastBox && panelBox && navBox).toBeTruthy();
      // Fully on screen, below the top edge and above the bottom edge.
      expect(panelBox!.y, `${vp.name}: sheet top must stay on screen`).toBeGreaterThanOrEqual(0);
      expect(
        lastBox!.y + lastBox!.height,
        `${vp.name}: last entry must end inside the viewport`,
      ).toBeLessThanOrEqual(vp.height + 0.5);
      // Not painted over by the fixed bar: the topmost element at the entry's centre is the sheet's.
      const owner = await page.evaluate(([x, y]) => {
        const el = document.elementFromPoint(x!, y!);
        return el?.closest('[data-testid="me-sheet"]') ? 'sheet' : el?.closest('[data-nav="bottom"]') ? 'bottom-bar' : (el?.tagName ?? 'none');
      }, [lastBox!.x + lastBox!.width / 2, lastBox!.y + lastBox!.height / 2]);
      expect(owner, `${vp.name}: the last entry must not be covered by the bottom bar`).toBe('sheet');
      // Not over-corrected: the sheet reaches the bottom of the screen, no dead gap (it covers the bar's slot).
      expect(vp.height - (panelBox!.y + panelBox!.height), `${vp.name}: no gap under the sheet`).toBeLessThanOrEqual(2);
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
