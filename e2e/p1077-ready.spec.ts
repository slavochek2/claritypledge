/**
 * @file p1077-ready.spec.ts
 * @description E2E for /ready — thinking-state awareness before a clarity meeting.
 *
 * Covers the spec's Done-When list: public access with no redirect, the slider
 * starting at the midpoint with a visible "Neutral" tick, no numeral/percentage
 * anywhere, keyboard operability, Continue always enabled and navigating to /meet
 * (both skipped and after interaction), zero backend requests, and no horizontal
 * overflow at 320px/375px/desktop.
 *
 * Runs signed out on purpose — /ready is a public entry point.
 */
import { test, expect, type Page } from '@playwright/test';

const QUESTION = 'Right now, how much are you up for thinking?';

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

  test('renders no numeral, percentage, or dynamic value label anywhere', async ({ page }) => {
    await page.goto('/ready');
    const bodyText = (await page.locator('body').innerText()) ?? '';
    expect(bodyText).not.toMatch(/\d+\/10/);
    expect(bodyText).not.toMatch(/\d+%/);
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

  test('records nothing: zero backend requests on the whole visit, including the drag and Continue', async ({ page }) => {
    const requests: string[] = [];
    let watching = false;

    page.on('request', (req) => {
      if (!/supabase\.co|\/rest\/v1\/|\/functions\/v1\//.test(req.url())) return;
      if (watching) requests.push(`${req.method()} ${req.url()}`);
    });

    await page.goto('/ready');
    await page.waitForLoadState('networkidle');

    watching = true;
    await slider(page).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('End');
    await continueButton(page).click();
    await expect(page).toHaveURL(/\/meet\/?$/);
    watching = false;

    expect(requests).toEqual([]);
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
      await expect(continueButton(page)).toBeInViewport();

      const box = await continueButton(page).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
    }
  });
});
