import { test, expect } from '@playwright/test';
import { getTestAuthContext } from './helpers/auth-context';

test.describe('P938: nav freezes during lazy route transition', () => {
  test('smoke: /feed boots without error boundary', async ({ page }) => {
    await page.goto('/feed');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
  });

  // Canary: proves the bug exists. MUST FAIL before the fix.
  //
  // Root cause: React Router 7.13 wraps navigations in startTransition. When the
  // destination route's lazy chunk suspends inside a transition, React's
  // "don't hide already-revealed Suspense" rule keeps the old page committed and
  // suppresses the ClarityPageLoader fallback.
  //
  // After fix (LazyRoute Suspense keyed by pathname): a fresh boundary mounts the
  // loader because React is allowed to show fallbacks for newly-mounted boundaries.
  test('clicking nav while destination chunk downloads shows a loading indicator', async ({ browser }) => {
    const { context, cleanup } = await getTestAuthContext('host', browser);
    const page = await context.newPage();
    try {
      await page.goto('/feed');
      // Wait for feed to finish loading so we start from a clean, idle state
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL('/feed');

      // Simulate a cold cache: intercept the letters-page module and hold it for 3s.
      // This keeps the lazy() import pending during the assertion window.
      await page.route('**/letters-page**', async (route) => {
        await new Promise<void>(resolve => setTimeout(resolve, 3000));
        await route.continue();
      });

      // Click the Letters nav link (desktop nav on Desktop Chrome viewport)
      await page.locator('a[href="/letters"]').first().click();

      // URL commits synchronously via pushState — this must pass immediately
      await expect(page).toHaveURL('/letters');

      // BUG: Without the fix, React keeps the feed committed (startTransition +
      // already-revealed Suspense boundary) and never mounts the PageLoader fallback.
      // .clarity-page-loader is not in the DOM at all.
      //
      // After fix: a fresh Suspense boundary (new key) mounts ClarityPageLoader.
      // Its CSS anti-flash delay is 300ms; opacity reaches 1 at ~500ms. We allow 700ms.
      //
      // THIS ASSERTION FAILS NOW — confirms the bug exists.
      await expect(page.locator('.clarity-page-loader')).toBeVisible({ timeout: 700 });
    } finally {
      await cleanup();
    }
  });
});
