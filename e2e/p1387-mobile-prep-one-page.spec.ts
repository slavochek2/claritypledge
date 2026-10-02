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
    // Space under the content that a fixed bottom <nav> (the phone BottomNav) sits over is not
    // blank: it is what keeps the last content clear of the nav. Only the remainder counts.
    let navCover = 0;
    for (const nav of Array.from(document.querySelectorAll<HTMLElement>('nav'))) {
      const r = nav.getBoundingClientRect();
      if (getComputedStyle(nav).position === 'fixed' && r.height > 0 && r.bottom >= window.innerHeight - 1) navCover = Math.max(navCover, r.height);
    }
    return Math.round(doc.scrollHeight - Math.max(contentBottom, window.innerHeight) - navCover);
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

    test('preparation: every step is one page — no blank scroll, nothing pinned beyond the step header', async ({ page }) => {
      await setTestSession(page, u.email);
      await page.goto(`/events/${ev.slug}/prepare`);
      const check = async (name: string) => {
        await settle(page);
        expect(await blankTail(page), `${name}: blank scroll`).toBeLessThanOrEqual(24);
        const pinned = await pinnedShare(page);
        // The fixed step header (back arrow, title, progress) is ~12-14%; anything above 25%
        // means a bottom panel or bar is pinned too.
        expect(pinned.share, `${name}: pinned ${pinned.who}`).toBeLessThanOrEqual(0.25);
      };
      await expect(page.getByRole('heading', { name: 'Your preparation' })).toBeVisible();
      await check('plan');
      await page.getByRole('button', { name: 'Start now' }).click();
      await expect(page.getByRole('heading', { name: 'How this event is different' })).toBeVisible();
      await check('welcome');
      await page.getByRole('button', { name: 'Continue without video' }).click();
      await expect(page.getByRole('heading', { name: 'What is cognitive understanding?' })).toBeVisible();
      await check('story');
      await page.getByRole('button', { name: 'Continue without video' }).click();
      await expect(page.getByRole('heading', { name: 'Introducing the Clarity Meeting Principle' })).toBeVisible();
      await check('principle intro');
      await page.getByRole('button', { name: 'Continue without video' }).click();
      await expect(page.getByTestId('principle-decision-question')).toBeVisible();
      await check('principle decision');
      await page.getByRole('button', { name: 'Opt in' }).click();
      await page.getByRole('button', { name: 'Try it now' }).click();
      await expect(page.getByRole('button', { name: 'Rate 7' })).toBeVisible();
      await check('rating');
      // Arrival scrolls the question into view: the 0-10 row is on screen without a swipe.
      await expect(page.getByRole('button', { name: 'Rate 7' })).toBeInViewport();
      await page.getByRole('button', { name: 'Rate 7' }).click();
      await page.getByRole('button', { name: 'Confirm' }).click();
      await expect(page.getByRole('heading', { name: /value perception/ })).toBeVisible();
      await check('cmp7');
      await page.getByRole('button', { name: 'Skip and proceed' }).click();
      await expect(page.getByRole('heading', { name: /Set your positions/ })).toBeVisible();
      await check('positions');
      await page.getByRole('button', { name: 'Skip and proceed' }).click();
      await expect(page.getByRole('heading', { name: /volunteers/ })).toBeVisible();
      await check('research');
      await page.getByRole('button', { name: 'Yes, sure' }).click();
      await expect(page.getByRole('heading', { name: /USB-C/ })).toBeVisible();
      await check('mic');
      await page.getByRole('button', { name: 'Yes, USB-C' }).click();
      await expect(page.getByRole('heading', { name: 'Thank you for preparing' })).toBeVisible();
      await check('end');
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
