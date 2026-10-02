/**
 * @file p1387-mobile-prep-one-page.spec.ts
 * @description P1387 — on a phone, the registration and preparation screens scroll as one page.
 * Real phone emulation (isMobile + hasTouch, iPhone 13 and a 320px phone), real test DB, real
 * signed-in session. The P1336 suite only ever ran Desktop Chrome resized, which is how a pinned
 * panel covering half the screen and 80px of blank scroll shipped unseen.
 *
 * Asserts the symptoms, not the mechanism:
 *  - no screen scrolls into blank space under its content;
 *  - nothing pinned to the screen covers more than a button strip (25% of the height).
 */
import { test, expect, devices, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';

test.describe.configure({ timeout: 180_000 });

const { defaultBrowserType: _b, ...iphone13 } = devices['iPhone 13'];
const PHONES = [
  { name: '390', use: iphone13 },
  { name: '320', use: { ...iphone13, viewport: { width: 320, height: 568 }, screen: { width: 320, height: 568 } } },
];

/** Blank scroll: how far the page scrolls past the end of its last visible content. A long screen
 *  may scroll; it must not scroll into empty space. 0 when the page does not scroll at all. */
const blankTail = (page: Page) =>
  page.evaluate(() => {
    const doc = document.scrollingElement!;
    if (doc.scrollHeight <= window.innerHeight) return 0;
    let contentBottom = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('main *'))) {
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.width === 0 || getComputedStyle(el).visibility === 'hidden') continue;
      contentBottom = Math.max(contentBottom, r.bottom + window.scrollY);
    }
    return Math.round(doc.scrollHeight - Math.max(contentBottom, window.innerHeight));
  });

/** Share of the screen covered by pinned (fixed/sticky) content, measured as a finger sees it:
 *  a 9x16 grid of points, each asking which element is on top there (elementFromPoint, which skips
 *  pointer-events:none layers). A point counts as covered when that element sits inside a fixed or
 *  sticky ancestor. The site's top bar and the phone BottomNav are chrome, not content — excluded. */
const pinnedShare = (page: Page) =>
  page.evaluate(() => {
    const pinnedAncestor = (el: Element | null): HTMLElement | null => {
      for (let n = el as HTMLElement | null; n && n !== document.body; n = n.parentElement) {
        const pos = getComputedStyle(n).position;
        if (pos === 'fixed' || pos === 'sticky') return n;
      }
      return null;
    };
    let covered = 0;
    let total = 0;
    const who = new Map<string, number>();
    for (let i = 0; i < 9; i++) for (let j = 0; j < 16; j++) {
      const x = ((i + 0.5) / 9) * window.innerWidth;
      const y = ((j + 0.5) / 16) * window.innerHeight;
      total++;
      const pin = pinnedAncestor(document.elementFromPoint(x, y));
      if (!pin || pin.closest('nav, header')) continue;
      covered++;
      const key = `${pin.tagName}[${pin.getAttribute('data-testid') ?? ''}].${pin.className.toString().slice(0, 50)}`;
      who.set(key, (who.get(key) ?? 0) + 1);
    }
    return { share: Math.round((covered / total) * 100) / 100, who: JSON.stringify([...who]) };
  });

const settle = (page: Page) => page.waitForTimeout(600);

for (const phone of PHONES) {
  test.describe(`P1387 phone ${phone.name}`, () => {
    test.use(phone.use);
    let host: TestUser;
    let ev: TestEvent;
    let u: TestUser;

    test.beforeAll(async () => {
      host = await createTestUser({ name: `P1387 Host ${phone.name}` });
      ev = await createTestEvent(host.user.id, new Date(Date.now() + 2 * 24 * 3600 * 1000), {
        title: `Clarity Night #97: P1387 mobile ${phone.name}`,
        location: 'Test venue, Chiang Mai',
      });
      const { error } = await supabaseAdmin.from('events')
        .update({ preparation_enabled: true, statement_tag: 'ikigai1' }).eq('id', ev.id);
      if (error) throw error;
      u = await createTestUser({ name: `P1387 Phone ${phone.name}` });
      await rsvpToEvent(ev.id, u.user.id);
    });

    test.afterAll(async () => {
      if (ev) await deleteTestEvent(ev.id);
      for (const x of [u, host]) if (x?.user?.id) {
        await supabaseAdmin.from('point_positions').delete().eq('user_id', x.user.id);
        await deleteTestUser(x.user.id);
      }
    });

    test('confirm screen: registration details are not under a pinned panel', async ({ page }) => {
      await setTestSession(page, u.email);
      await page.goto(`/events/${ev.slug}/confirm`);
      await expect(page.getByTestId('registered-card')).toContainText("You're Registered!");
      await expect(page.getByRole('button', { name: 'Prepare now' })).toBeVisible();
      await settle(page);
      const pinned = await pinnedShare(page);
      expect(pinned.share, `pinned ${pinned.who}`).toBeLessThanOrEqual(0.25);
    });

    test('preparation: no blank scroll; the rating step is not a pinned panel', async ({ page }) => {
      await setTestSession(page, u.email);
      await page.goto(`/events/${ev.slug}/prepare`);
      await expect(page.getByRole('heading', { name: 'Your preparation' })).toBeVisible();
      await settle(page);
      // No BottomNav on this route, so nothing to pad for: no blank scroll under the content.
      expect(await blankTail(page), 'plan screen blank scroll').toBeLessThanOrEqual(24);

      await page.getByRole('button', { name: 'Start now' }).click();
      await page.getByRole('button', { name: 'Continue without video' }).click();
      await page.getByRole('button', { name: 'Continue without video' }).click();
      await page.getByRole('button', { name: 'Continue without video' }).click();
      await page.getByRole('button', { name: 'Opt in' }).click();
      await page.getByRole('button', { name: 'Try it now' }).click();
      await expect(page.getByRole('button', { name: 'Rate 7' })).toBeVisible();
      await settle(page);
      const pinned = await pinnedShare(page);
      expect(pinned.share, `pinned ${pinned.who}`).toBeLessThanOrEqual(0.25);
    });

    test('room gate: no blank scroll', async ({ page }) => {
      const fresh = await createTestUser({ name: `P1387 Gate ${phone.name}` });
      try {
        await rsvpToEvent(ev.id, fresh.user.id);
        await setTestSession(page, fresh.email);
        await page.goto(`/events/${ev.slug}/room`);
        await expect(page.getByTestId('prep-room-gate')).toBeVisible();
        await settle(page);
        expect(await blankTail(page), 'room gate blank scroll').toBeLessThanOrEqual(24);
      } finally {
        await deleteTestUser(fresh.user.id);
      }
    });
  });
}
