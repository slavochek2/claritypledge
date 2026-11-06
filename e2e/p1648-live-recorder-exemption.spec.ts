/**
 * P1648: browser-level controls for the /live recorder exemption in e2e/helpers/prod-health.ts.
 *
 * /live calls stop_session_recording() on mount (P1304), so whether a /record is ever posted there is a
 * race with the recorder bundle's arrival. The exemption lets 'timeout' pass on /live only when the
 * bundle finished loading ok and no recorder CSP violation was seen. These tests drive the REAL helper
 * against the deployed page:
 *   - delayed recorder start (80-250 ms, the window that reproduced the CI flake) -> must PASS
 *   - misspelled opt-in flag (bundle never requested)                            -> must FAIL
 *   - recorder CSP-blocked                                                       -> must FAIL
 *   - recorder bundle download aborted (requested, never loaded)                  -> must FAIL
 *
 * Runs against a deployed URL only (the CSP lives in vercel.json headers; the dev server sends none),
 * and only when asked, so the default e2e run does not hit prod:
 *   P1648_SMOKE_URL=https://claritypledge.com npx playwright test --project=chromium e2e/p1648-live-recorder-exemption.spec.ts
 * Repeat the delayed case: add --grep "delayed" --repeat-each=10
 */
import { test, expect, type Page } from '@playwright/test';
import { keepRecorderWithoutStoringReplays } from './helpers/prod-health';

const RAW_URL = process.env.P1648_SMOKE_URL;
const BASE_URL = (RAW_URL || '').replace(/\/$/, '');
const ROUTE = '/live';
const RECORDER = '**/*mixpanel-recorder*';

test.describe('P1648: /live recorder exemption (browser-level)', () => {
  test.skip(!RAW_URL, 'set P1648_SMOKE_URL to a deployed URL to run');
  test.describe.configure({ timeout: 60_000 });

  async function run(page: Page) {
    const watch = await keepRecorderWithoutStoringReplays(page);
    return watch;
  }

  test('delayed recorder start (80-250 ms) passes', async ({ page }) => {
    const delayMs = 80 + Math.floor(Math.random() * 171);
    test.info().annotations.push({ type: 'bundle-delay-ms', description: String(delayMs) });
    const watch = await run(page);
    await page.route(RECORDER, async (route) => {
      await new Promise((r) => setTimeout(r, delayMs));
      await route.continue();
    });
    await page.goto(BASE_URL + ROUTE);
    const state = await watch.waitForFirstFlush();
    test.info().annotations.push({ type: 'state', description: `${state} loaded=${watch.recorderBundleLoaded()} records=${watch.fulfilledRecordCount()}` });
    expect(watch.recorderBundleLoaded()).toBe(true);
    expect(() => watch.assertExercised(state, ROUTE)).not.toThrow();
  });

  test('CONTROL: misspelled opt-in flag fails', async ({ page }) => {
    const watch = await run(page);
    // Runs after the helper's init script: undo the real flag, set a misspelled one (what a typo would do).
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      delete w.__p1628KeepRecorderForSmoke;
      w.__p1628KeepRecorderForSmok = true;
    });
    await page.goto(BASE_URL + ROUTE);
    const state = await watch.waitForFirstFlush();
    expect(watch.recorderBundleRequested()).toBe(false);
    expect(() => watch.assertExercised(state, ROUTE)).toThrow(/recorder never reached/);
  });

  test('CONTROL: recorder CSP-blocked fails', async ({ page }) => {
    const watch = await run(page);
    // Serve the real document with a CSP whose script-src allows the main Mixpanel lib by path but not the
    // recorder bundle. Reporting directives are dropped so this injected violation never reaches prod's
    // CSP report endpoint.
    await page.route(BASE_URL + ROUTE, async (route) => {
      const res = await route.fetch();
      const headers = { ...res.headers() };
      const csp = headers['content-security-policy'];
      expect(csp, 'deployed /live has no CSP header to tighten').toBeTruthy();
      headers['content-security-policy'] = csp
        .split(';')
        .map((d) => d.trim())
        .filter((d) => !/^report-(uri|to)\b/.test(d))
        .map((d) => (d.startsWith('script-src ')
          ? d.replace('https://cdn.mxpnl.com', 'https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js')
          : d))
        .join('; ');
      await route.fulfill({ response: res, headers });
    });
    await page.goto(BASE_URL + ROUTE);
    const state = await watch.waitForFirstFlush();
    expect(state).toBe('blocked');
    expect(() => watch.assertExercised(state, ROUTE)).toThrow(/recorder never reached/);
  });

  test('CONTROL: recorder bundle download aborted fails (requested is not loaded)', async ({ page }) => {
    const watch = await run(page);
    await page.route(RECORDER, (route) => route.abort('failed'));
    await page.goto(BASE_URL + ROUTE);
    const state = await watch.waitForFirstFlush();
    expect(watch.recorderBundleRequested()).toBe(true);
    expect(watch.recorderBundleLoaded()).toBe(false);
    expect(() => watch.assertExercised(state, ROUTE)).toThrow(/recorder never reached/);
  });
});
