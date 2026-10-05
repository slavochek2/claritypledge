/**
 * @file p1422-meet-tools-overlap.spec.ts
 * @description P1422 — on phone widths the /meet level track rode in the nav row and its
 * third stop ran under the header's labeled Tools button. Measures bounding boxes: no stop
 * may intersect the visible Tools trigger, and the track must stay in the nav on desktop.
 */
import { test, expect, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';

type Box = { x: number; y: number; width: number; height: number };

function intersects(a: Box, b: Box) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function visibleToolsBox(page: Page) {
  const tools = page.getByTestId('event-links-button').locator('visible=true').first();
  await expect(tools).toBeVisible();
  return (await tools.boundingBox())!;
}

for (const width of [375, 320]) {
  test(`/meet at ${width}px: no level stop overlaps the Tools button`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto('/meet');
    await expect(page.getByTestId('terms-stop-3')).toBeVisible();
    expect(await page.evaluate(() => window.innerWidth)).toBe(width);

    const tools = await visibleToolsBox(page);
    for (const level of [1, 2, 3]) {
      const stop = (await page.getByTestId(`terms-stop-${level}`).boundingBox())!;
      expect(intersects(stop, tools), `stop ${level} ${JSON.stringify(stop)} vs Tools ${JSON.stringify(tools)}`).toBe(false);
    }
    // Nothing pushed sideways off-screen by the move.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test('/meet at desktop: the track stays in the nav row, clear of Tools', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/meet');
  await expect(page.locator('#nav-center-slot [data-testid="terms-stop-1"]')).toBeVisible();
  const tools = await visibleToolsBox(page);
  const stop = (await page.getByTestId('terms-stop-3').boundingBox())!;
  expect(intersects(stop, tools)).toBe(false);
});

/** Scroll the page, then assert the sticky track sits fully below the fixed nav's bottom edge. */
async function expectTrackBelowNavAfterScroll(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  const nav = (await page.locator('nav[data-nav="main"]').boundingBox())!;
  const stop = (await page.getByTestId('terms-stop-1').boundingBox())!;
  expect(stop.y, `stop-1 top ${stop.y} vs nav bottom ${nav.y + nav.height}`).toBeGreaterThanOrEqual(nav.y + nav.height - 0.5);
  // Still pinned: it did not scroll away with the document.
  expect(stop.y).toBeLessThan(nav.y + nav.height + 60);
}

test('/meet at 375px: the track stays pinned below the nav while scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto('/meet');
  await expect(page.getByTestId('terms-stop-1')).toBeVisible();
  await expectTrackBelowNavAfterScroll(page);
});

test('/meet at 375px with an iOS status-bar inset: the track clears the taller nav', async ({ page }) => {
  // Chromium's safe-area override makes env(safe-area-inset-top) non-zero, as on a notched
  // iPhone with viewport-fit=cover. Skipped where this Chromium build lacks the CDP method.
  await page.setViewportSize({ width: 375, height: 740 });
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Emulation.setSafeAreaInsetsOverride' as never, { insets: { top: 47 } } as never);
  } catch {
    test.skip(true, 'Emulation.setSafeAreaInsetsOverride unavailable in this Chromium');
  }
  await page.goto('/meet');
  await expect(page.getByTestId('terms-stop-1')).toBeVisible();
  const navPad = await page.locator('nav[data-nav="main"]').evaluate((el) => getComputedStyle(el).paddingTop);
  expect(parseFloat(navPad), 'inset override did not reach env()').toBeGreaterThan(0);
  await expectTrackBelowNavAfterScroll(page);
});

test('/meet at 375px offline: the track clears the nav pushed down by the offline strip', async ({ page, context }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto('/meet');
  await expect(page.getByTestId('terms-stop-1')).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText(/offline/i).first()).toBeVisible();
  // The nav slides down under the strip (transition-all, 300ms): wait for it to settle so the
  // measurement is of the offline layout, not a frame of the animation.
  await expect.poll(() => page.locator('nav[data-nav="main"]').evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(27);
  await expectTrackBelowNavAfterScroll(page);
  await context.setOffline(false);
});

/** Every visible interactive control in the nav's right-hand group (Tools, avatar, menus). */
async function rightGroupBoxes(page: Page) {
  return page.locator('nav[data-nav="main"]').evaluate((nav) => {
    const slot = nav.querySelector('#nav-center-slot');
    return [...nav.querySelectorAll('button, a')]
      .filter((el) => !slot?.contains(el) && (el as HTMLElement).offsetParent !== null)
      .map((el) => {
        const b = el.getBoundingClientRect();
        return { label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 24), x: b.x, y: b.y, width: b.width, height: b.height };
      })
      .filter((b) => b.width > 0);
  });
}

async function expectNoStopOverlapsNavControls(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto('/meet');
  await expect(page.locator('#nav-center-slot [data-testid="terms-stop-3"]')).toBeVisible();
  await expect(page.getByTestId('event-links-button').locator('visible=true').first()).toBeVisible();
  const controls = await rightGroupBoxes(page);
  expect(controls.length).toBeGreaterThan(1); // logo + at least one right-hand control
  for (const level of [1, 2, 3]) {
    const stop = (await page.getByTestId(`terms-stop-${level}`).boundingBox())!;
    for (const c of controls) {
      expect(intersects(stop, c), `${width}px stop ${level} ${JSON.stringify(stop)} vs ${c.label} ${JSON.stringify(c)}`).toBe(false);
    }
  }
  return controls;
}

test.describe('desktop widths where the track rides in the nav row', () => {
  for (const width of [1024, 1279]) {
    test(`signed out at ${width}px: no stop overlaps a nav control`, async ({ page }) => {
      await expectNoStopOverlapsNavControls(page, width);
    });
  }

  test.describe('signed in', () => {
    let user: TestUser;
    test.beforeAll(async () => { user = await createTestUser({ name: 'P1422 Signed In' }); });
    test.afterAll(async () => { if (user?.user?.id) await deleteTestUser(user.user.id); });

    for (const width of [1024, 1279]) {
      test(`signed in at ${width}px: no stop overlaps Tools or the avatar`, async ({ page }) => {
        await setTestSession(page, user.email);
        const controls = await expectNoStopOverlapsNavControls(page, width);
        // The signed-in avatar menu ("Menu") was among the measured controls, so this is not
        // the signed-out layout measured twice.
        expect(controls.map((c) => c.label)).toContain('Menu');
      });
    }
  });
});
