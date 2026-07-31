/**
 * @file p1017-reproduce.spec.ts
 * @description P1017 canary — /intro must show a loading signal in the content
 * area while the cross-origin Google Calendar embed is still fetching.
 *
 * Why the route interception: the bug's window is "route committed, iframe not
 * yet painted". Against the real calendar.google.com that window is a few
 * hundred milliseconds of network luck — untestable. Holding the embed's
 * response open makes the window deterministic and arbitrarily long, so the
 * assertion is about the *state*, never about timing.
 *
 * The fulfilled response keeps the calendar.google.com origin, so the iframe
 * stays genuinely cross-origin — the same constraint the fix must work under
 * (its internal state is unreadable; `onLoad` is the only available signal).
 */
import { test, expect } from '@playwright/test';

const CALENDAR_GLOB = '**calendar.google.com/**';
const LOADER = 'intro-calendar-loading';

/**
 * Route /intro with the calendar embed held open. Returns `release()`, which
 * completes the embed's response and lets its `onLoad` fire.
 */
async function gotoIntroWithHeldCalendar(page: import('@playwright/test').Page) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route(CALENDAR_GLOB, async (route) => {
    await held;
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body>calendar embed</body></html>',
    });
  });

  // `domcontentloaded`, not the default `load`: a held iframe blocks the window
  // load event by design, so waiting for it would hang until the test timeout.
  await page.goto('/intro', { waitUntil: 'domcontentloaded' });
  return release;
}

test.describe('P1017: /intro loading state for the calendar embed', () => {
  test('shows a loader in the content area while the embed is still loading', async ({ page }) => {
    const release = await gotoIntroWithHeldCalendar(page);

    // The embed is deliberately still in flight here. This is the exact window
    // the bug lives in: today nothing renders below the logo nav.
    await expect(page.getByTestId(LOADER)).toBeVisible();

    release();
  });

  test('removes the loader once the embed loads, leaving the iframe in place', async ({ page }) => {
    const release = await gotoIntroWithHeldCalendar(page);
    await expect(page.getByTestId(LOADER)).toBeVisible();

    release();

    await expect(page.getByTestId(LOADER)).toBeHidden();
    await expect(page.locator('iframe[title="Book your free alignment audit"]')).toBeVisible();
  });

  test('the loader does not displace the embed — no layout shift when it clears', async ({ page }) => {
    // 320px is the narrowest supported width and the one where the embed's
    // min-h split (min-h-[1000px] vs sm:min-h-[580px]) is load-bearing —
    // db54449e fixed phones being unable to book at all. The loader must
    // overlay that box, never push it.
    await page.setViewportSize({ width: 320, height: 700 });
    const release = await gotoIntroWithHeldCalendar(page);

    const iframe = page.locator('iframe[title="Book your free alignment audit"]');
    await expect(page.getByTestId(LOADER)).toBeVisible();
    const boxWhileLoading = await iframe.boundingBox();

    release();
    await expect(page.getByTestId(LOADER)).toBeHidden();
    const boxAfterLoad = await iframe.boundingBox();

    expect(boxWhileLoading).not.toBeNull();
    expect(boxAfterLoad).not.toBeNull();
    expect(boxAfterLoad!.y).toBeCloseTo(boxWhileLoading!.y, 0);
    expect(boxAfterLoad!.height).toBeCloseTo(boxWhileLoading!.height, 0);
  });

  test('no heading or body copy is added to the page (decisions.md 2026-07-16)', async ({ page }) => {
    const release = await gotoIntroWithHeldCalendar(page);
    // The embed carries its own title; a first-party heading here duplicates it
    // back-to-back at the highest-intent moment and was removed on purpose.
    // A loader is the right gap-filler precisely because it is transient.
    await expect(page.locator('main h1, main h2')).toHaveCount(0);
    release();
  });
});
