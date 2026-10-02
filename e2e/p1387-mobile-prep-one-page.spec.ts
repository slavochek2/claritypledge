/**
 * @file p1387-mobile-prep-one-page.spec.ts
 * @description P1387 — on a phone, the registration and preparation screens scroll as one page.
 * Real phone emulation (isMobile + hasTouch, iPhone 13 and iPhone SE 375x667), real test DB, real
 * signed-in session. The P1336 suite only ever ran Desktop Chrome resized, which is how a pinned
 * panel covering half the screen and 80px of blank scroll shipped unseen.
 *
 * Asserts the symptoms, not the mechanism — the founder's rule (2026-10-02): the question and
 * explanation scroll in the page; what you tap is pinned at the bottom in ONE slim bar.
 *  - no screen scrolls into blank space under its content;
 *  - the bottom bar is a slim strip (<= 22% of the screen), except the principle rating panel,
 *    which docks the question + 0-10 + Confirm and is allowed more (<= 50%), host line excluded;
 *  - the confirm screen has no bottom menu competing with Prepare now.
 */
import { test, expect, devices, type Page } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';

test.describe.configure({ timeout: 180_000 });

const { defaultBrowserType: _b, ...iphone13 } = devices['iPhone 13'];
// Real phones at a Chiang Mai expat event: a current iPhone (390) and the smallest phone still
// sold, iPhone SE 2nd/3rd gen (375x667). The 2016 SE (320) is rare enough not to design for.
const PHONES = [
  { name: '390', use: iphone13 },
  { name: 'SE-375', use: { ...iphone13, viewport: { width: 375, height: 667 }, screen: { width: 375, height: 667 } } },
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

/** Share of the screen covered by content pinned to the BOTTOM edge, measured as a finger sees it:
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
      // Only bars anchored to the bottom edge: the fixed step header (back, title, progress) is
      // the agreed top chrome; the question is what pins at the BOTTOM.
      if (pin.getBoundingClientRect().bottom < window.innerHeight - 1) continue;
      covered++;
      const key = `${pin.tagName}[${pin.getAttribute('data-testid') ?? ''}].${pin.className.toString().slice(0, 50)}`;
      who.set(key, (who.get(key) ?? 0) + 1);
    }
    return { share: Math.round((covered / total) * 100) / 100, who: JSON.stringify([...who]) };
  });

// Wait for the page to finish loading first: the points steps update their own URL just after
// load, and a measurement taken mid-update throws "execution context destroyed" (seen 1 in 3 runs).
const settle = async (page: Page) => {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);
};

/** The button is what a finger hits at its centre — not merely inside the viewport. The P1387
 *  review found the end screen's pinned row under the BottomNav while toBeInViewport passed. */
const onTop = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true }).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });

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
      expect(pinned.share, `pinned ${pinned.who}`).toBeLessThanOrEqual(0.22);
      // The decision is pinned on a phone, and nothing else competes with it at the bottom.
      await expect(page.getByRole('button', { name: 'Prepare now' })).toBeInViewport();
      expect(await onTop(page, 'Prepare now'), 'Prepare now is tappable').toBe(true);
      // The question leads the page, above the registered card.
      await expect(page.getByTestId('prep-question')).toBeInViewport();
      await expect(page.getByRole('link', { name: /^Home$/ })).toHaveCount(0);
    });

    test('preparation: every step is one page — no blank scroll, nothing pinned beyond the step header', async ({ page }) => {
      await setTestSession(page, u.email);
      await page.goto(`/events/${ev.slug}/prepare`);
      const check = async (name: string, maxPinned = 0.22, hasStepActions = true) => {
        await settle(page);
        expect(await blankTail(page), `${name}: blank scroll`).toBeLessThanOrEqual(24);
        const pinned = await pinnedShare(page);
        expect(pinned.share, `${name}: pinned ${pinned.who}`).toBeLessThanOrEqual(maxPinned);
        // Every step's next action is reachable without scrolling.
        if (hasStepActions) await expect(page.getByTestId('step-actions').last()).toBeInViewport();
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
      await check('principle decision', 0.35, false);
      await expect(page.getByRole('button', { name: 'Opt in' })).toBeInViewport();
      await page.getByRole('button', { name: 'Opt in' }).click();
      await page.getByRole('button', { name: 'Try it now' }).click();
      await expect(page.getByRole('button', { name: 'Rate 7' })).toBeVisible();
      // The rating panel docks over the certificate (founder's choice): who asks, the question, 0-10
      // and Confirm — all in the drawer, next to the answer.
      await check('rating', 0.5, false);
      await expect(page.getByRole('button', { name: 'Rate 7' })).toBeInViewport();
      expect(await onTop(page, 'Rate 7'), 'Rate 7 is tappable').toBe(true);
      await expect(page.getByTestId('rating-host')).toBeInViewport();
      await expect(page.getByText('How much do you think you understand my intended meaning behind this principle?')).toBeInViewport();
      await page.getByRole('button', { name: 'Rate 7' }).click();
      await page.getByRole('button', { name: 'Confirm' }).click();
      await expect(page.getByRole('heading', { name: /value perception/ })).toBeVisible();
      // Points steps: progress + Continue + the Skip link under it (founder's stacked choice, for
      // more answers) — a taller bar than the one-row steps.
      await check('cmp7', 0.28);
      // Continue is the main action even before every point is answered; a tap says what is missing.
      expect(await onTop(page, 'Continue'), 'Continue is tappable').toBe(true);
      // P1391: from the bottom of the list, the tap also brings the first unanswered point into
      // view — nothing is answered yet, so that is the first card.
      await page.evaluate(() => window.scrollTo(0, document.scrollingElement!.scrollHeight));
      await expect(page.locator('[data-testid^="feed-point-card-"]').first()).not.toBeInViewport();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByTestId('answer-hint')).toHaveText(/^Set your position on all \d+ points to continue\.$/);
      await expect(page.locator('[data-testid^="feed-point-card-"]').first()).toBeInViewport();
      await expect(page.getByRole('heading', { name: /value perception/ })).toBeVisible();
      await page.getByRole('button', { name: 'Skip and proceed' }).click();
      await expect(page.getByRole('heading', { name: /Set your positions/ })).toBeVisible();
      await check('positions', 0.28);
      // P1391: same on the positions step — the dimmed tap brings the first unanswered point into view.
      await page.evaluate(() => window.scrollTo(0, document.scrollingElement!.scrollHeight));
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(page.getByTestId('answer-hint')).toBeVisible();
      await expect(page.locator('[data-testid^="feed-point-card-"]').first()).toBeInViewport();
      await page.getByRole('button', { name: 'Skip and proceed' }).click();
      await expect(page.getByRole('heading', { name: /volunteers/ })).toBeVisible();
      await check('research');
      await page.getByRole('button', { name: 'Yes, sure' }).click();
      await expect(page.getByRole('heading', { name: 'Do you have a microphone to bring?' })).toBeVisible();
      // P1386: two questions. The answers are the step's actions, pinned; the page above is a few short lines.
      await check('mic', 0.35);
      await page.getByRole('button', { name: 'No, I need one' }).click();
      await expect(page.getByRole('heading', { name: 'Which charging port does your phone have?' })).toBeVisible();
      await check('mic port', 0.4);
      await page.getByRole('button', { name: /^USB-C/ }).click();
      await expect(page.getByRole('heading', { name: 'Thank you for preparing' })).toBeVisible();
      await check('end');
      // The last step keeps the app menus hidden; its pinned buttons are what a finger hits.
      await expect(page.getByRole('link', { name: /^Home$/ })).toHaveCount(0);
      expect(await onTop(page, 'Back to the event'), 'Back to the event is tappable').toBe(true);
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
