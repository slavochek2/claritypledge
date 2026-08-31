/**
 * @file p1179-links-menu.spec.ts
 * @description P1179 AC-2 / AC-3 — the button survives 320px, and the sheet is
 * a bottom sheet with 44px targets.
 *
 * AC-2 is asserted on MEASURED BOUNDING BOXES, not on visibility. "Visible" is
 * true of a control sitting underneath the avatar; the failure this criterion
 * exists to catch is exactly that overlap, which is what sank the nav centre
 * slot at this width.
 *
 * The viewport is CONFIRMED via window.innerWidth before anything is measured.
 * `.claude/rules/browser.md`: a resize can silently no-op, and a 320px assertion
 * taken at 375px passes for the wrong reason.
 */

import { test, expect, type Page } from '@playwright/test';
import { getTestAuthContext } from './helpers/auth-context';
import { createTestEvent, deleteTestEvent, rsvpToEvent } from './helpers/test-event';

/** Fails loudly rather than measuring at a width the browser silently refused. */
async function assertViewport(page: Page, width: number) {
  const actual = await page.evaluate(() => window.innerWidth);
  expect(actual, `viewport did not take the resize — measured at ${actual}px, not ${width}px`).toBe(width);
}

function overlaps(a: { x: number; y: number; width: number; height: number },
                  b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && b.x < a.x + a.width &&
         a.y < b.y + b.height && b.y < a.y + a.height;
}

test.describe('P1179 AC-2 / AC-3 — the Links control at a literal 320px', () => {
  let eventId: string;
  let slug: string;

  test.beforeAll(async () => {
    // The row is created by an admin client; the attendee below is a separate,
    // real, registered user — a component fed props would certify a screen
    // nobody sees.
    const { createTestUser } = await import('./helpers/test-user');
    const { user } = await createTestUser({ name: 'P1179 Host' });
    const event = await createTestEvent(user.id);
    eventId = event.id;
    slug = event.slug;
  });

  test.afterAll(async () => { if (eventId) await deleteTestEvent(eventId); });

  for (const width of [320, 375]) {
    test(`AC-2: the button is tappable and overlaps neither the logo nor the avatar at ${width}px`, async ({ browser }) => {
      const { context, user, cleanup } = await getTestAuthContext('host', browser);
      try {
        await rsvpToEvent(eventId, user.user.id);
        const page = await context.newPage();
        await page.setViewportSize({ width, height: 780 });
        await page.goto(`/events/${slug}/room`);

        // The nav renders BOTH right-hand groups and hides one by breakpoint, so
        // the trigger is in the DOM twice. Measure the one the attendee can
        // actually see — a hidden desktop button has no meaningful box at 320px.
        const btn = page.getByTestId('event-links-button').filter({ visible: true }).first();
        await expect(btn).toBeVisible({ timeout: 15000 });
        await assertViewport(page, width);

        const btnBox = (await btn.boundingBox())!;
        expect(btnBox, 'the button has no box — it is not laid out').not.toBeNull();

        // Inside the viewport, horizontally and vertically.
        expect(btnBox.x).toBeGreaterThanOrEqual(0);
        expect(btnBox.x + btnBox.width).toBeLessThanOrEqual(width);

        // A real tap target.
        expect(btnBox.height).toBeGreaterThanOrEqual(44);

        // Overlaps nothing in the header. The logo link and the avatar/menu control
        // are the two things AC-2 names.
        const logo = page.locator('header a[href="/"], nav a[href="/"]').first();
        if (await logo.count()) {
          const logoBox = await logo.boundingBox();
          if (logoBox) expect(overlaps(btnBox, logoBox), 'Links overlaps the logo').toBe(false);
        }
        const avatar = page.locator('[aria-label="Open menu"], [aria-label="Menu"]').first();
        if (await avatar.count()) {
          const avatarBox = await avatar.boundingBox();
          if (avatarBox) expect(overlaps(btnBox, avatarBox), 'Links overlaps the avatar').toBe(false);
        }
      } finally { await cleanup(); }
    });
  }

  test('AC-3: at PHONE width it opens a BOTTOM sheet, not a top-anchored dropdown, and every entry is >= 44px', async ({ browser }) => {
    const { context, user, cleanup } = await getTestAuthContext('host', browser);
    try {
      await rsvpToEvent(eventId, user.user.id);
      const page = await context.newPage();
      await page.setViewportSize({ width: 375, height: 780 });
      await page.goto(`/events/${slug}/room`);

      const btn = page.getByTestId('event-links-button').filter({ visible: true }).first();
      await expect(btn).toBeVisible({ timeout: 15000 });
      await assertViewport(page, 375);
      await btn.click();

      const sheet = page.getByTestId('event-links-menu');
      await expect(sheet).toBeVisible();

      const viewport = page.viewportSize()!;
      // The sheet SLIDES IN (animate-in slide-in-from-bottom, 300ms), so a box read
      // on the first frame is a box mid-transform. Poll the settled position rather
      // than sleeping a guessed duration.
      await expect.poll(
        async () => {
          const b = await sheet.boundingBox();
          return b ? Math.round(b.y + b.height) : -1;
        },
        { message: 'sheet never settled against the bottom of the viewport', timeout: 5000 }
      ).toBe(viewport.height);

      const sheetBox = (await sheet.boundingBox())!;
      // Two more properties that separate a bottom sheet from the top-anchored
      // dropdown, neither of which "it is tall" would give you. The dropdown is no
      // longer "rejected" outright — since 2026-08-31 it is the DESKTOP shape (see
      // the desktop test below) — but at 375px it is still the wrong one, for the
      // reason it always was: a menu tapped repeatedly by someone standing and
      // holding a phone one-handed has to sit in thumb reach.
      //   1. it spans the FULL viewport width (inset-x-0) — a dropdown is a narrow
      //      right-aligned panel under its trigger;
      //   2. its top edge is BELOW the trigger's own bottom — a dropdown hangs off
      //      the trigger, so its top sits inside the header band.
      expect(sheetBox.x).toBeLessThanOrEqual(1);
      // Full-bleed within a scrollbar's tolerance. Exact equality is not assertable
      // here: opening the sheet locks body scroll, so the ~15px scrollbar disappears
      // between the sheet's layout and the read, and the two widths legitimately
      // differ by that much. The tolerance is far tighter than the property under
      // test — the rejected dropdown is a ~200px right-aligned panel in this viewport
      // and fails this by 150px, not by 15.
      const layoutWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(sheetBox.width).toBeGreaterThanOrEqual(layoutWidth - 20);

      const btnBox = (await btn.boundingBox())!;
      expect(sheetBox.y, 'the sheet hangs from the header — that is the desktop shape on a phone')
        .toBeGreaterThan(btnBox.y + btnBox.height);

      const entries = page.getByTestId('event-links-entry');
      const n = await entries.count();
      expect(n).toBe(5);
      for (let i = 0; i < n; i++) {
        const box = (await entries.nth(i).boundingBox())!;
        expect(box.height, `entry ${i} is ${box.height}px tall`).toBeGreaterThanOrEqual(44);
      }
    } finally { await cleanup(); }
  });

  /**
   * THE DESKTOP SHAPE. Founder, 2026-08-31, looking at the same control on a
   * monitor: "it's really weird on desktop it just like slides up ... it should
   * be like we have the use cases you know at the top and then I click".
   *
   * This asserts the two properties that make it a dropdown rather than a sheet,
   * and they are the exact inverses of the phone assertions above — so a change
   * that collapsed the two shapes back into one would fail here or there,
   * whichever direction it collapsed in.
   */
  test('at desktop width it opens as a narrow panel anchored under the trigger', async ({ browser }) => {
    const { context, user, cleanup } = await getTestAuthContext('host', browser);
    try {
      await rsvpToEvent(eventId, user.user.id);
      const page = await context.newPage();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/events/${slug}/room`);

      const btn = page.getByTestId('event-links-button').filter({ visible: true }).first();
      await expect(btn).toBeVisible({ timeout: 15000 });
      await btn.click();

      const menu = page.getByTestId('event-links-menu');
      await expect(menu).toBeVisible();
      await expect(menu).toHaveAttribute('data-shape', 'dropdown');

      const btnBox = (await btn.boundingBox())!;
      const menuBox = (await menu.boundingBox())!;
      const viewport = page.viewportSize()!;

      // NOT full-bleed: a narrow panel, nothing like the sheet's full width.
      expect(menuBox.width, 'a desktop dropdown must not span the viewport')
        .toBeLessThan(viewport.width / 2);
      // NOT bottom-anchored: it hangs off the trigger, so it starts in the top
      // half of the page rather than settling against the bottom edge.
      expect(menuBox.y, 'the panel is not anchored to the trigger')
        .toBeLessThan(viewport.height / 2);
      // And it is actually near the trigger, not merely somewhere above the fold.
      expect(Math.abs(menuBox.y - (btnBox.y + btnBox.height)), 'panel is not under the trigger')
        .toBeLessThan(40);
    } finally { await cleanup(); }
  });
});
