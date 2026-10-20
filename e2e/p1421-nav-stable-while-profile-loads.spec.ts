/**
 * @file p1421-nav-stable-while-profile-loads.spec.ts
 * @description P1421 — the signed-in navigation must not reflow under the cursor when the
 * profile finishes loading, and the mobile bottom nav must appear as soon as a session
 * is known.
 *
 * Reproduction: the profile fetch (rpc/get_profile_by_id) is held for PROFILE_DELAY_MS,
 * the way a slow connection holds it. Before the fix, Home/Letters/Groups rendered during
 * the wait and then jumped ~212px left when Partners, My Profile, Tools and the avatar
 * arrived — a click aimed during the wait landed on the neighbouring item.
 *
 * P1512: the signed-in navigation is now the desktop SIDEBAR (data-nav="sidebar", replacing the
 * top nav) and the phone bottom bar whose last slot is the "Me" tab (replacing the My Profile
 * link). The invariant is unchanged — the slots that exist before the profile resolves keep their
 * boxes after it — and is measured on the sidebar rows and the bottom-bar tabs.
 */
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';

const PROFILE_DELAY_MS = 6000;

async function holdProfileFetch(page: Page) {
  let released = false;
  await page.route('**/rest/v1/rpc/get_profile_by_id*', async (route) => {
    await new Promise((r) => setTimeout(r, PROFILE_DELAY_MS));
    released = true;
    await route.continue();
  });
  return () => released;
}

async function boxesOf(page: Page, labels: string[]) {
  const nav = page.locator('[data-nav="sidebar"]');
  const out: Record<string, { x: number; y: number }> = {};
  for (const label of labels) {
    const box = await nav.getByRole('link', { name: label, exact: true }).boundingBox();
    if (!box) throw new Error(`no box for ${label}`);
    out[label] = { x: Math.round(box.x), y: Math.round(box.y) };
  }
  return out;
}

test.describe('P1421 — nav does not shift when the profile resolves', () => {
  test.describe.configure({ timeout: 90000 });
  let member: TestUser;

  test.beforeAll(async () => {
    member = await createTestUser({ name: 'P1421 Member' });
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ is_verified: true })
      .eq('id', member.user.id);
    if (error) throw new Error(`verify shim failed: ${error.message}`);
  });

  test.afterAll(async () => {
    if (member?.user?.id) await deleteTestUser(member.user.id);
  });

  // P1421 review: the early layout needs this device to have seen the user verified once,
  // so each test first loads normally (writing the hint), then reloads with the profile held.
  async function primeVerifiedHint(page: Page, surface: 'sidebar' | 'bottom') {
    await page.goto('/feed');
    // The profile-dependent slot: My Profile in the sidebar, the Me tab in the bottom bar.
    const settled = surface === 'sidebar'
      ? page.locator('[data-nav="sidebar"]').getByRole('link', { name: 'My Profile', exact: true })
      : page.getByTestId('bottom-nav-me');
    await expect(settled.first()).toBeAttached({ timeout: 20000 });
  }

  for (const width of [1024, 1279, 1280]) {
    test(`desktop ${width}: Home/Letters/Groups keep their position across profile load`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await setTestSession(page, member.email);
      await primeVerifiedHint(page, 'sidebar');
      const isReleased = await holdProfileFetch(page);
      await page.reload();

      const nav = page.locator('[data-nav="sidebar"]');
      await expect(nav.getByRole('link', { name: 'Letters', exact: true })).toBeVisible({ timeout: 5000 });
      expect(isReleased(), 'measurement must happen while the profile is still held').toBe(false);
      const before = await boxesOf(page, ['Home', 'Letters', 'Groups']);
      const avatarSlot = await nav.locator('[data-nav-slot-placeholder="avatar"]').boundingBox();
      // E: a click on an inert placeholder lands on the header, not on the page beneath.
      const partnersSlot = await nav.locator('[data-nav-slot-placeholder="Partners"]').boundingBox();
      const hit = await page.evaluate(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return !!el?.closest('[data-nav="sidebar"]');
      }, [partnersSlot!.x + partnersSlot!.width / 2, partnersSlot!.y + partnersSlot!.height / 2]);
      expect(hit, 'click on the Partners slot must hit the nav').toBe(true);
      const urlBefore = page.url();
      await page.mouse.click(partnersSlot!.x + partnersSlot!.width / 2, partnersSlot!.y + partnersSlot!.height / 2);
      expect(page.url()).toBe(urlBefore);

      await expect(nav.getByRole('link', { name: 'My Profile', exact: true })).toBeVisible({
        timeout: PROFILE_DELAY_MS + 15000,
      });
      // Let the avatar / Tools / badges settle.
      await page.waitForTimeout(1000);
      const after = await boxesOf(page, ['Home', 'Letters', 'Groups']);
      console.log(`[P1421] ${width} before`, JSON.stringify(before), 'after', JSON.stringify(after));

      // D: the avatar slot's box equals the real avatar button's box.
      const avatarBtn = await nav.getByRole('button', { name: 'Menu' }).boundingBox();
      console.log(`[P1421] ${width} avatar slot`, JSON.stringify(avatarSlot), 'button', JSON.stringify(avatarBtn));
      expect(Math.abs(avatarBtn!.x - avatarSlot!.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(avatarBtn!.width - avatarSlot!.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(avatarBtn!.height - avatarSlot!.height)).toBeLessThanOrEqual(1);

      for (const label of ['Home', 'Letters', 'Groups']) {
        expect(Math.abs(after[label].x - before[label].x), `${label} x shifted`).toBeLessThanOrEqual(1);
        expect(Math.abs(after[label].y - before[label].y), `${label} y shifted`).toBeLessThanOrEqual(1);
      }
    });
  }

  test('mobile 375: bottom nav is visible while the profile is still loading', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await setTestSession(page, member.email);
    await primeVerifiedHint(page, 'bottom');
    const isReleased = await holdProfileFetch(page);
    await page.reload();

    const bottom = page.locator('[data-nav="bottom"]');
    await expect(bottom).toBeVisible({ timeout: 4000 });
    expect(isReleased(), 'bottom nav must appear before the profile resolves').toBe(false);
    const homeBefore = await bottom.getByRole('link', { name: 'Home' }).boundingBox();
    // The Me slot holds its place (P1421) while the profile loads: an inert placeholder, not a button.
    const meSlot = await bottom.locator('[data-nav-slot-placeholder="You"]').boundingBox();
    expect(meSlot, 'the Me slot is held while the profile loads').not.toBeNull();

    await expect(bottom.getByTestId('bottom-nav-me')).toBeVisible({
      timeout: PROFILE_DELAY_MS + 15000,
    });
    const homeAfter = await bottom.getByRole('link', { name: 'Home' }).boundingBox();
    expect(Math.abs(homeAfter!.x - homeBefore!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(homeAfter!.width - homeBefore!.width)).toBeLessThanOrEqual(1);
    // The real Me tab lands in the slot the placeholder held.
    const meAfter = await bottom.getByTestId('bottom-nav-me').boundingBox();
    expect(Math.abs(meAfter!.x - meSlot!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(meAfter!.width - meSlot!.width)).toBeLessThanOrEqual(1);
  });
});
