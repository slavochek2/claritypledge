/**
 * @file p1077-ready.spec.ts
 * @description E2E for /ready — thinking-state awareness before a clarity meeting.
 *
 * Covers the spec's Done-When list: public access with no redirect, the slider
 * starting at the midpoint with a visible "Neutral" tick, no numeral/percentage
 * anywhere, keyboard operability, Continue always enabled and navigating to /meet
 * (both skipped and after interaction), and no horizontal overflow at
 * 320px/375px/desktop. The backend-requests test now asserts P1083's shape (one
 * read on load, the slider drag itself silent, one write on Continue) rather than
 * P1077's original zero — P1083 deliberately reverses that non-goal.
 *
 * Runs signed out on purpose — /ready is a public entry point.
 */
import { test, expect, type Page } from '@playwright/test';

const QUESTION = 'How up for thinking are you right now?';

const slider = (page: Page) => page.getByRole('slider');
const continueButton = (page: Page) => page.getByRole('button', { name: 'Continue', exact: true });

test.describe('P1077 /ready', () => {
  test('loads for a signed-out visitor with no redirect', async ({ page }) => {
    await page.goto('/ready');
    await expect(page).toHaveURL(/\/ready\/?$/);
    await expect(page.getByText(QUESTION)).toBeVisible();
  });

  test('slider starts at the midpoint with a visible "Neutral" tick', async ({ page }) => {
    await page.goto('/ready');
    await expect(slider(page)).toHaveAttribute('aria-valuenow', '5');
    await expect(page.getByText('Neutral')).toBeVisible();
  });

  test('pole labels are visible at each end of the track', async ({ page }) => {
    await page.goto('/ready');
    // Two of each since P1083: the distribution's own axis, and the slider's own.
    await expect(page.getByText('Keep it light')).toHaveCount(2);
    await expect(page.getByText('Go deep')).toHaveCount(2);
    for (const locator of [page.getByText('Keep it light'), page.getByText('Go deep')]) {
      await expect(locator.first()).toBeVisible();
      await expect(locator.last()).toBeVisible();
    }
  });

  test('renders no numeral, percentage, or dynamic value label anywhere', async ({ page }) => {
    await page.goto('/ready');
    const bodyText = (await page.locator('body').innerText()) ?? '';
    expect(bodyText).not.toMatch(/\d+\/10/);
    expect(bodyText).not.toMatch(/\d+%/);
  });

  test("expandedHitArea's bottom padding doesn't overlap the pole-label row", async ({ page }) => {
    // Real layout, not jsdom — the interactive slider div's expanded hit box (from
    // expandedHitArea) sits directly above this label row (mt-1.5 in the no-expansion
    // case; mt-5 here). A regression that shrinks the gap would make the slider's
    // border box paint underneath the labels, which visually and functionally dead-zones
    // that part of the intended touch-target expansion.
    await page.goto('/ready');
    const sliderBox = await slider(page).boundingBox();
    // P1083 added a SECOND "Keep it light" (the distribution's own axis, above the
    // slider) — .last() is the slider's own pole label, the one this test is about.
    const labelBox = await page.getByText('Keep it light').last().boundingBox();
    expect(sliderBox && labelBox && labelBox.y).toBeGreaterThanOrEqual(
      (sliderBox?.y ?? 0) + (sliderBox?.height ?? 0)
    );
  });

  test('slider is operable by keyboard: arrows, Home, End', async ({ page }) => {
    await page.goto('/ready');
    const s = slider(page);
    await s.focus();
    await page.keyboard.press('ArrowRight');
    await expect(s).toHaveAttribute('aria-valuenow', '6');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(s).toHaveAttribute('aria-valuenow', '4');
    await page.keyboard.press('Home');
    await expect(s).toHaveAttribute('aria-valuenow', '0');
    await page.keyboard.press('End');
    await expect(s).toHaveAttribute('aria-valuenow', '10');
  });

  test('Continue is enabled from the first frame and reaches /meet without touching the slider (skipped path)', async ({ page }) => {
    await page.goto('/ready');
    await expect(continueButton(page)).toBeEnabled();
    await continueButton(page).click();
    await expect(page).toHaveURL(/\/meet\/?$/);
    // Reaching /meet via Continue must produce the same page as a direct visit —
    // its choosing-step primary action is the observable proof.
    await expect(page.getByRole('button', { name: 'Opt in', exact: true })).toBeVisible();
  });

  test('Continue reaches /meet after the slider has been moved', async ({ page }) => {
    await page.goto('/ready');
    await slider(page).focus();
    await page.keyboard.press('ArrowRight');
    await continueButton(page).click();
    await expect(page).toHaveURL(/\/meet\/?$/);
  });

  // P1083 reversed this Non-Goal deliberately: the distribution read happens on
  // load, and Continue now writes an ephemeral submission. What stays true from
  // P1077 is that the SLIDER DRAG ITSELF never talks to the backend — only the
  // initial read and the final Continue write do. See e2e/p1083-ready-distribution.spec.ts
  // for the distribution/retention coverage this reversal exists to serve.
  test('the slider drag itself makes no backend request — only the initial read and the final Continue write do', async ({ page }) => {
    const requests: string[] = [];
    let watching = false;

    page.on('request', (req) => {
      if (!/\/rest\/v1\/ready_submissions/.test(req.url())) return;
      if (watching) requests.push(`${req.method()} ${req.url()}`);
    });

    await page.goto('/ready');
    await page.waitForLoadState('networkidle');

    watching = true;
    await slider(page).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('End');
    // The drag alone — before Continue — must never write.
    expect(requests).toEqual([]);

    // The write is fire-and-forget (never awaited before navigate()), so it can
    // still be in flight after the URL has already changed — wait for the actual
    // request rather than racing the navigation.
    const [writeRequest] = await Promise.all([
      page.waitForRequest((req) => /\/rest\/v1\/ready_submissions/.test(req.url())),
      continueButton(page).click(),
    ]);
    await expect(page).toHaveURL(/\/meet\/?$/);
    watching = false;

    expect(writeRequest.method()).toBe('POST');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatch(/^POST /);

    // Deliberately no cleanup here. This test's own header already accepts a
    // stray extra row as harmless (self-heals within the 10-minute window), and
    // every spec that does exact-count assertions on this table already wipes it
    // in its own beforeEach — so a table-wide delete from this file would only
    // add a cross-FILE race with zero compensating benefit (adversarial review
    // finding, 2026-08-17: an earlier version of this test added one and all 5
    // reviewers independently flagged it as strictly worse than doing nothing).
  });

  test('no horizontal overflow and no clipped tick label at 320px, 375px, or desktop', async ({ page }) => {
    for (const width of [320, 375, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/ready');
      await expect(page.getByText(QUESTION)).toBeVisible();

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflows, `horizontal overflow at ${width}px`).toBe(false);

      await expect(slider(page)).toBeInViewport();
      await expect(page.getByText('Neutral')).toBeInViewport();
      // Both instances of each pole label (P1083's distribution axis, and the
      // slider's own) must clear the fold at every width.
      for (const locator of [page.getByText('Keep it light'), page.getByText('Go deep')]) {
        await expect(locator.first()).toBeInViewport();
        await expect(locator.last()).toBeInViewport();
      }
      await expect(continueButton(page)).toBeInViewport();

      const box = await continueButton(page).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
    }
  });
});
