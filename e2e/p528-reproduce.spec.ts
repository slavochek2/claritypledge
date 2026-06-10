import { test, expect } from '@playwright/test';

/**
 * P528 canary — mobile scroll bounce triggers pull-to-refresh, reloading /live
 * and killing the active session.
 *
 * MECHANISM PROXY (read before trusting this test):
 * The actual symptom — a native pull-to-refresh gesture reloading the document —
 * is NOT automatable. Pull-to-refresh is a browser-compositor / OS gesture;
 * Playwright touch emulation does not reach the native overscroll path, so no
 * test can reload the page on demand. This canary therefore asserts the FIX
 * MECHANISM: that the document is configured to contain overscroll (so the
 * gesture has nothing to chain into), rather than the user-visible reload.
 *
 * Root cause: nothing in src/ or index.html sets `overscroll-behavior`
 * (`grep -rn overscroll` → 0 hits), so the browser default `auto` lets an
 * overscroll at the top of the inner `.live-scroll` container chain up to the
 * viewport and trigger pull-to-refresh.
 *
 * Fix (P528, scope = app-wide): `html, body { overscroll-behavior-y: contain }`
 * in src/index.css. Chosen over per-container scoping because it is robust
 * across every /live view state (waiting / active / free) and kills the
 * wasteful full-document reload everywhere in the SPA.
 *
 * Expected lifecycle:
 *   - BEFORE fix: body computed `overscroll-behavior-y` === 'auto'  → FAILS
 *   - AFTER fix:  body computed `overscroll-behavior-y` === 'contain' → PASSES
 *
 * Caveat this canary CANNOT catch (flagged for /fix): `overscroll-behavior`
 * historically required iOS Safari 16.4+ to govern pull-to-refresh. A CSS-presence
 * check goes green even on a device where the gesture is not actually suppressed.
 * /fix must confirm target-device coverage separately.
 */

const ROUTES = ['/', '/live'];

for (const route of ROUTES) {
  test(`P528: overscroll is contained on ${route} (no pull-to-refresh chaining)`, async ({ page }) => {
    await page.goto(route);

    // The global fix lives on html, body — applied regardless of what the route
    // renders (landing content, /live start screen, or an auth redirect), so no
    // session or auth setup is needed to observe it.
    const overscrollY = await page.evaluate(
      () => getComputedStyle(document.body).overscrollBehaviorY,
    );

    // 'auto' (the default) is the vulnerable state that allows pull-to-refresh.
    // The fix sets 'contain'; accept 'none' too so the canary survives if /fix
    // picks the stronger value.
    expect(['contain', 'none']).toContain(overscrollY);
  });
}
