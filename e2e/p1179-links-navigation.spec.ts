/**
 * @file p1179-links-navigation.spec.ts
 * @description P1179 AC-11 and the persistence property — the menu's entries
 * reach their destinations, and the button survives the hop.
 *
 * "Persists across destinations without a Back hop" is the property the whole
 * `?event=<slug>` design exists to provide (Resolved Decision 2). It is asserted
 * by arriving at the destination and finding the button THERE — not by checking
 * that the link carried the param, which would test the string, not the outcome.
 */

import { test, expect, type Page } from '@playwright/test';
import { getTestAuthContext } from './helpers/auth-context';
import { createTestEvent, deleteTestEvent, rsvpToEvent } from './helpers/test-event';
import { createTestUser } from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';

const linksButton = (page: Page) =>
  page.getByTestId('event-links-button').filter({ visible: true }).first();

/**
 * The room gate redirects `/events/:slug/room` → `/ready` ASYNCHRONOUSLY, once it
 * has read room state. The menu closes itself on any location change — correct
 * behaviour, since an attendee must never arrive at a destination with the sheet
 * still covering it — so a click that lands inside that redirect window opens a
 * sheet that is snapped shut a frame later, and the entry click then has nothing
 * to hit. Waiting for the URL to stop moving before touching the menu removes the
 * race from the TEST without hiding it: the product behaviour is unchanged and
 * still asserted everywhere else in this file.
 */
async function settle(page: Page) {
  let previous = '';
  for (let i = 0; i < 10; i++) {
    const current = page.url();
    if (current === previous) return;
    previous = current;
    await page.waitForTimeout(300);
  }
}

async function openMenu(page: Page) {
  await settle(page);
  const btn = linksButton(page);
  await expect(btn).toBeVisible({ timeout: 30000 });
  await btn.click();
  await expect(page.getByTestId('event-links-sheet')).toBeVisible();
}

/**
 * Every test here crosses a ROUTE BOUNDARY into a lazily-imported chunk
 * (/live, /transcribe, /stake). Against the dev server the first hit to each
 * compiles it on demand, which regularly costs more than the 30s default —
 * observed as `Start a Clarity Session reaches /live` failing cold and passing
 * warm, with no assertion error, only a timeout. That is a wrong time budget,
 * not a flaky product: the same test passes deterministically once the chunk
 * exists. Raised here rather than retried.
 */
// The timeout is raised because this file's shape demands it, not because the
// product is flaky:
//   - every test crosses a route boundary into a LAZILY-imported chunk (/live,
//     /transcribe, /stake), which the dev server compiles on first hit;
//   - they share one beforeAll-created event and all drive the same dev server.
// Set here rather than on the command line, because the contract runs this file
// with the project's default worker count. (`mode: 'serial'` was tried and
// REVERTED: these tests are independent, and serial turned one real failure into
// five by chaining the rest behind it.)
test.describe.configure({ timeout: 90_000 });

test.describe('P1179 AC-11 — the entries reach their destinations', () => {
  let eventId: string;
  let slug: string;

  test.beforeAll(async () => {
    const { user } = await createTestUser({ name: 'P1179 Nav Host' });
    const event = await createTestEvent(user.id);
    eventId = event.id;
    slug = event.slug;
    // One per-event extra, so the "This event" group is exercised on a real row.
    const { error: linkErr } = await supabaseAdmin.from('events')
      .update({ links: [{ tag: 'tonight', label: 'Tonight' }] }).eq('id', eventId);
    if (linkErr) throw new Error(`seeding events.links failed: ${linkErr.message}`);
  });

  /**
   * WARM THE LAZY CHUNKS FIRST.
   *
   * Every destination here (/live, /transcribe, /stake/:tag) is a lazily-imported
   * route that the dev server compiles ON FIRST HIT. Clicking a menu entry starts
   * that navigation, and Playwright's click waits for the page to settle after it
   * — so a cold compile shows up as a CLICK that never returns, with no assertion
   * error and no failing locator, which is why this read as an unrelated hang.
   *
   * Measured 2026-08-28 with a probe spec: identical flow, first run failed inside
   * the entry click at 14.8s, the immediate retry passed the whole flow at 8.6s.
   * The only difference between them was whether the chunk already existed.
   *
   * Visiting the routes once here compiles them before any test measures anything.
   * It hides nothing: no assertion is relaxed, and the click-through behaviour is
   * still what every test below exercises.
   */
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      for (const route of ['/live', '/transcribe', '/stake/cmp7', '/stake/cmp3', '/stake/tonight']) {
        await page.goto(route, { waitUntil: 'domcontentloaded' }).catch(() => {});
      }
    } finally {
      await page.close();
    }
  });

  test.afterAll(async () => { if (eventId) await deleteTestEvent(eventId); });

  test('Start a Clarity Session reaches /live', async ({ browser }) => {
    const { context, user, cleanup } = await getTestAuthContext('host', browser);
    try {
      await rsvpToEvent(eventId, user.user.id);
      const page = await context.newPage();
      await page.goto(`/events/${slug}/room`);
      await openMenu(page);
      await page.getByTestId('event-links-entry').filter({ hasText: 'Start a Clarity Session' }).click();
      await expect(page).toHaveURL(/\/live/, { timeout: 30000 });
    } finally { await cleanup(); }
  });

  test('Transcribe reaches the transcription room', async ({ browser }) => {
    const { context, user, cleanup } = await getTestAuthContext('host', browser);
    try {
      await rsvpToEvent(eventId, user.user.id);
      const page = await context.newPage();
      await page.goto(`/events/${slug}/room`);
      await openMenu(page);
      await page.getByTestId('event-links-entry').filter({ hasText: 'Transcribe' }).click();
      await expect(page).toHaveURL(/\/transcribe/, { timeout: 30000 });
      // Not a 404 / not-found shell — the working room actually mounted.
      await expect(page.locator('body')).not.toContainText(/page not found/i);
    } finally { await cleanup(); }
  });

  test('the button PERSISTS on the destination — no Back hop needed for the next one', async ({ browser }) => {
    const { context, user, cleanup } = await getTestAuthContext('host', browser);
    try {
      await rsvpToEvent(eventId, user.user.id);
      const page = await context.newPage();
      await page.goto(`/events/${slug}/room`);
      await openMenu(page);
      await page.getByTestId('event-links-entry').filter({ hasText: /^cmp7$/ }).click();

      await expect(page).toHaveURL(new RegExp(`/stake/cmp7\\?event=${slug}`), { timeout: 30000 });
      // The whole point: the button is HERE, on the destination.
      await expect(linksButton(page)).toBeVisible();

      // And it still works — a second destination without going back.
      await openMenu(page);
      await page.getByTestId('event-links-entry').filter({ hasText: /^cmp3$/ }).click();
      await expect(page).toHaveURL(new RegExp(`/stake/cmp3\\?event=${slug}`), { timeout: 30000 });
      await expect(linksButton(page)).toBeVisible();
    } finally { await cleanup(); }
  });

  test('the per-event extra appears and resolves to its tag', async ({ browser }) => {
    const { context, user, cleanup } = await getTestAuthContext('host', browser);
    try {
      await rsvpToEvent(eventId, user.user.id);
      const page = await context.newPage();
      await page.goto(`/events/${slug}/room`);
      await openMenu(page);
      await expect(page.getByTestId('event-links-entry')).toHaveCount(6);
      await page.getByTestId('event-links-entry').filter({ hasText: 'Tonight' }).click();
      await expect(page).toHaveURL(new RegExp(`/stake/tonight\\?event=${slug}`), { timeout: 30000 });
    } finally { await cleanup(); }
  });

  test('a BARE /stake/:tag renders the cut-down feed with NO button and no event context', async ({ browser }) => {
    const { context, cleanup } = await getTestAuthContext('host', browser);
    try {
      const page = await context.newPage();
      await page.goto('/stake/cmp7');
      // The surface itself mounted...
      await expect(page.getByTestId('stake-event-slug')).toHaveText('', { timeout: 30000 });
      // ...and carries no Links button, because there is no event.
      await expect(page.getByTestId('event-links-button')).toHaveCount(0);
    } finally { await cleanup(); }
  });
});
