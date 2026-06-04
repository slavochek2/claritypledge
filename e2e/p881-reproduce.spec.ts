/**
 * P881 canary — Mixpanel events stranded by the default ~5s batch flush window.
 *
 * Root cause (confirmed in the /reproduce session): track-then-navigate is NOT
 * the loss mechanism — mixpanel-2-latest flushes its queue via sendBeacon on
 * pagehide, and the beacon survives both reload and cross-origin redirect
 * (verified against a real local HTTPS server). Events are lost when the page
 * dies WITHOUT pagehide (mobile app-switch → OS kill, in-app browser discard)
 * inside the ~5s batch window, and the localStorage-persisted queue never gets
 * a second chance because the user never returns. Fix shape: critical events
 * must leave the browser promptly, not after a 5s batch window.
 *
 * Reproduction constraint: the real app cannot fire Mixpanel locally
 * (index.html snippet is hostname-gated off localhost AND analytics.track
 * no-ops when !import.meta.env.PROD). So this test runs a minimal harness
 * page that injects the VERBATIM snippet+init <script> from index.html — the
 * test exercises the live config and passes once the transport/flush fix
 * lands in index.html, with no test change needed.
 *
 * NOTE: if the fix is implemented per-call-site (e.g. a flush-aware helper in
 * src/lib/mixpanel.ts) instead of init config, this harness will NOT see it —
 * extend the harness to load the helper, or adjust the canary accordingly.
 *
 * Network: requires access to cdn.mxpnl.com (real library). All
 * api-eu.mixpanel.com calls are intercepted and recorded — nothing
 * reaches Mixpanel.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const HARNESS_ORIGIN = 'https://p881-harness.claritypledge.test';

// The vulnerability window: a critical event (profile_created) must leave the
// browser within this budget after track(), because the page can die without
// pagehide at any moment after the user-visible flow completes. Default
// batching flushes at ~5s, so this FAILS before the fix.
const DELIVERY_BUDGET_MS = 2000;

/**
 * Extract the verbatim Mixpanel snippet+init <script> block from index.html.
 * The hostname gate inside it passes on the harness origin (not localhost),
 * so the snippet runs exactly as in prod.
 */
function extractMixpanelInit(): string {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf-8');
  const scripts = html.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/g) ?? [];
  const snippet = scripts.find((s) => s.includes('mixpanel.init'));
  if (!snippet) throw new Error('P881 harness: mixpanel snippet not found in index.html');
  return snippet.replace(/<\/?script[^>]*>/g, '');
}

function harnessHtml(initCall: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <script type="text/javascript">
      // Verbatim snippet + init from index.html — the test exercises the live config.
      ${initCall}
    </script>
  </head>
  <body>
    <button id="track">track critical event</button>
    <script>
      // Mirrors AuthCallbackPage.tsx: identify() then track('profile_created')
      // followed only by SPA navigation (no unload, no pagehide flush).
      document.getElementById('track').addEventListener('click', () => {
        mixpanel.identify('p881-canary-user');
        mixpanel.track('p881_canary_event', { source: 'p881-reproduce' });
        history.pushState({}, '', '/after-spa-navigate'); // SPA navigate — no unload
      });
    </script>
  </body>
</html>`;
}

/** Decode a /track request body enough to search for an event name. */
function bodyContainsEvent(postData: string | null, eventName: string): boolean {
  if (!postData) return false;
  const candidates = [postData];
  try {
    candidates.push(decodeURIComponent(postData));
  } catch {
    /* not url-encoded */
  }
  for (const c of [...candidates]) {
    const m = c.match(/data=([^&]+)/);
    if (m) {
      candidates.push(m[1]);
      try {
        candidates.push(Buffer.from(m[1], 'base64').toString('utf-8'));
      } catch {
        /* not base64 */
      }
    }
  }
  return candidates.some((c) => c.includes(eventName));
}

async function setupHarness(page: Page) {
  const trackBodies: string[] = [];

  await page.route('https://api-eu.mixpanel.com/**', async (route) => {
    const req = route.request();
    if (req.url().includes('/track')) {
      trackBodies.push(req.postData() ?? req.url());
    }
    await route.fulfill({ status: 200, contentType: 'text/plain', body: '1' });
  });

  const html = harnessHtml(extractMixpanelInit());
  await page.route(`${HARNESS_ORIGIN}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: html })
  );

  await page.goto(`${HARNESS_ORIGIN}/`);
  await page.waitForFunction(
    () => typeof (window as never as { mixpanel?: { __loaded?: unknown } }).mixpanel?.__loaded !== 'undefined',
    { timeout: 15000 }
  );
  return trackBodies;
}

async function waitForEvent(page: Page, bodies: string[], eventName: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (bodies.some((b) => bodyContainsEvent(b, eventName))) return true;
    await page.waitForTimeout(100);
  }
  return bodies.some((b) => bodyContainsEvent(b, eventName));
}

test.describe('P881: critical Mixpanel events vs the batch flush window', () => {
  test(`CANARY (fails pre-fix): critical event must reach the API within ${DELIVERY_BUDGET_MS}ms of track()`, async ({
    page,
  }) => {
    const bodies = await setupHarness(page);

    await page.click('#track');
    const arrived = await waitForEvent(page, bodies, 'p881_canary_event', DELIVERY_BUDGET_MS);

    expect(
      arrived,
      `event still queued ${DELIVERY_BUDGET_MS}ms after track() — the page can die without pagehide ` +
        `in this window (mobile app-switch/OS kill) and the event is stranded forever for non-returning users`
    ).toBe(true);
  });

  test('REGRESSION GUARD (passes): pagehide flush — track → reload still delivers the event', async ({ page }) => {
    // Documents the mechanism that makes track-then-navigate call sites safe
    // (P881 audit originally flagged 7 sites as unsafe; this disproved it).
    // If a future config change breaks the pagehide sendBeacon flush, this fails.
    const bodies = await setupHarness(page);

    await page.evaluate(() => {
      (window as never as { mixpanel: { track: (e: string) => void } }).mixpanel.track('p881_reload_event');
      window.location.reload();
    });
    const arrived = await waitForEvent(page, bodies, 'p881_reload_event', 10000);

    expect(arrived, 'pagehide sendBeacon flush is broken — track→navigate sites are now genuinely unsafe').toBe(true);
  });
});
