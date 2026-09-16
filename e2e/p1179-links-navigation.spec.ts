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
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';
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
  await expect(page.getByTestId('event-links-menu')).toBeVisible();
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
/**
 * COST, and why this file is shaped the way it is.
 *
 * Each test needs a signed-in REGISTERED attendee. Minting one through the
 * Supabase Admin API is by far the most expensive thing here, and doing it five
 * times — once per test, across three workers — is what made this file take
 * minutes while its three sibling p1179 specs finish in seconds. It also put
 * five concurrent Admin-API calls on a SHARED test database, which is where the
 * intermittent failures came from (including a spell of PostgREST answering
 * `PGRST002: Could not query the database for the schema cache`, an environment
 * condition no assertion in this file can survive).
 *
 * So the attendee and the event are created ONCE per worker and reused; each
 * test still gets its own PAGE, which is cheap and keeps the tests independent.
 *
 * Two API notes worth keeping, both learned the hard way here:
 *   - `test.describe.configure({ timeout })` at file scope did NOTHING — the
 *     reporter kept saying "Test timeout of 30000ms exceeded" (the project
 *     default) while the file claimed 90s. `test.setTimeout()` is what binds.
 *   - A HOOK has its own timeout, and `test.setTimeout()` in a `beforeEach` does
 *     not reach it. A `beforeAll` doing Admin-API work needs its own call.
 *   - `mode: 'serial'` was tried and REVERTED: these tests are independent, and
 *     serial turned one failure into five by chaining the rest behind it.
 */
test.beforeEach(() => {
  test.setTimeout(90_000);
});

test.describe('P1179 AC-11 — the entries reach their destinations', () => {
  let eventId: string;
  let slug: string;
  let auth: Awaited<ReturnType<typeof getTestAuthContext>>;
  let seededPointId: string | undefined;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    const { user: host } = await createTestUser({ name: 'P1179 Nav Host' });
    const event = await createTestEvent(host.id);
    eventId = event.id;
    slug = event.slug;
    // P1323 R5 RETIRED the per-event group. The seed is KEPT on purpose, and so is the real
    // staked point under `tonight`: the inverted assertion below must prove the group is gone
    // for an event that is CONFIGURED and HAS CONTENT. Dropping the seed would let "absent"
    // pass merely because nothing was configured — which is exactly how the original group
    // went unnoticed on 14 prod events that had nothing configured.
    const { error: linkErr } = await supabaseAdmin.from('events')
      .update({ links: [{ tag: 'tonight', label: 'Tonight' }, { tag: 'hollow', label: 'Hollow' }] })
      .eq('id', eventId);
    if (linkErr) throw new Error(`seeding events.links failed: ${linkErr.message}`);

    // A POSITION is required, not just the point: getPublicPointsFeed ends in a
    // `totalPositions > 0` filter (P543), so a point with no positions is invisible
    // to the very query the menu probes with.
    const seeded = await createTestPoint(host.id, {
      statement: `P1179 nav seed ${Date.now()}`,
      tags: ['tonight'],
      visibility: 'public',
    });
    seededPointId = seeded.id;
    await createTestPosition(seeded.id, host.id, 'agree');

    // ONE attendee for every test in this worker — see the note above.
    auth = await getTestAuthContext('host', browser);
    await rsvpToEvent(eventId, auth.user.user.id);
  });

  test.afterAll(async () => {
    if (auth) await auth.cleanup();
    if (seededPointId) await deleteTestPoint(seededPointId);
    if (eventId) await deleteTestEvent(eventId);
  });

  test('Start a Clarity Session reaches /live', async () => {
    const page = await auth.context.newPage();
    try {
      await page.goto(`/events/${slug}/room`);
      await openMenu(page);
      // P1323: tools live under the Tools tab.
      await page.getByTestId('event-links-tab-tools').click();
      await page.getByTestId('event-links-entry').filter({ hasText: 'Start a Clarity Session' }).click();
      await expect(page).toHaveURL(/\/live/, { timeout: 30000 });
    } finally { await page.close(); }
  });

  test('Transcribe reaches the transcription room', async () => {
    const page = await auth.context.newPage();
    try {
      await page.goto(`/events/${slug}/room`);
      await openMenu(page);
      await page.getByTestId('event-links-tab-tools').click();
      await page.getByTestId('event-links-entry').filter({ hasText: 'Transcribe' }).click();
      await expect(page).toHaveURL(/\/transcribe/, { timeout: 30000 });
      // Not a 404 / not-found shell — the working room actually mounted.
      await expect(page.locator('body')).not.toContainText(/page not found/i);
    } finally { await page.close(); }
  });

  test('the button PERSISTS on the destination — no Back hop needed for the next one', async () => {
    const page = await auth.context.newPage();
    try {
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
    } finally { await page.close(); }
  });

  /**
   * P1323 AC-6, INVERTED. This test used to assert that a configured extra appeared FIRST under
   * "This event". R5 retired that group (founder 2026-09-16): an extra carried a TAG, i.e. the
   * same thing a Points entry carries, and no UI to write `events.links` ever existed.
   * The event here IS configured and `tonight` DOES have a staked point, so absence cannot be
   * explained by empty data.
   */
  test('a CONFIGURED per-event extra with real content no longer renders — the group is retired', async () => {
    const page = await auth.context.newPage();
    try {
      await page.goto(`/events/${slug}/room`);
      await openMenu(page);
      await expect(page.getByTestId('event-links-menu')).not.toContainText('This event');
      for (const tab of ['points', 'letters', 'tools'] as const) {
        await page.getByTestId(`event-links-tab-${tab}`).click();
        await expect(page.getByTestId('event-links-entry').filter({ hasText: /^(Tonight|Hollow)$/ }), `${tab} tab`).toHaveCount(0);
      }
      // Control: the menu itself is populated, so the absence above is not an empty panel.
      await page.getByTestId('event-links-tab-points').click();
      await expect(page.getByTestId('event-links-entry')).toHaveCount(6);
    } finally { await page.close(); }
  });

  /**
   * P1323 AC-1, INVERTED on the founder's sign-off (2026-09-16: "yes in /stake we will have
   * LINKS!"). decisions.md 2026-08-28 had recorded "a bare /stake/:tag ... with no button" as a
   * property; that is superseded. The page's CONTENT is unchanged — still no event context.
   */
  test('a BARE /stake/:tag keeps its cut-down feed with no event context — and now carries the menu', async () => {
    const page = await auth.context.newPage();
    try {
      await page.goto('/stake/cmp7');
      await expect(page.getByTestId('stake-event-slug')).toHaveText('', { timeout: 30000 });
      await expect(linksButton(page)).toBeVisible();
      await openMenu(page);
      // Off-event, a Points entry carries no dangling ?event=.
      await page.getByTestId('event-links-entry').filter({ hasText: /^cmp3$/ }).click();
      await expect(page).toHaveURL(/\/stake\/cmp3$/, { timeout: 30000 });
    } finally { await page.close(); }
  });
});
