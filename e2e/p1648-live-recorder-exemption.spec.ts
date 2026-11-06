/**
 * P1648: browser-level controls for the /live recorder exemption in e2e/helpers/prod-health.ts.
 *
 * /live calls stop_session_recording() on mount (P1304), so whether a /record is ever posted there is a
 * race with the recorder bundle's arrival. The exemption lets 'timeout' pass on /live only when the
 * bundle finished loading ok, the bundle executed, and no recorder CSP violation was seen. These tests
 * drive the REAL helper against the deployed page:
 *   - delayed recorder start (80-250 ms, the window that reproduced the CI flake) -> must PASS
 *   - recorder ran but no /record (forced) -> PASS on /live, FAIL on / (CONTROL)
 *   - misspelled opt-in flag (bundle never requested)                            -> must FAIL
 *   - recorder CSP-blocked (bundle, or its blob:/data: worker)                   -> must FAIL
 *   - recorder bundle download aborted (requested, never loaded)                  -> must FAIL
 *   - recorder bundle answered 200 but empty (loaded, never ran)                  -> must FAIL
 *
 * Runs against a deployed URL only (the CSP lives in vercel.json headers; the dev server sends none),
 * and only when asked, so the default e2e run does not hit prod. P1648_SMOKE_URL also turns off the
 * local webServer (playwright.config.ts):
 *   P1648_SMOKE_URL=https://claritypledge.com npx playwright test --project=chromium e2e/p1648-live-recorder-exemption.spec.ts
 * Repeat the delayed case: add --grep "delayed" --repeat-each=10
 */
import { test, expect, type Page } from '@playwright/test';
import { keepRecorderWithoutStoringReplays } from './helpers/prod-health';

const RAW_URL = process.env.P1648_SMOKE_URL;
const BASE_URL = (RAW_URL || '').replace(/\/$/, '');
const ROUTE = '/live';
const RECORDER = '**/*mixpanel-recorder*';
const FLAG = '__p1628KeepRecorderForSmoke';

/** Serve the real /live document; `edit` may change its headers in place and return a replacement body. */
async function editDocument(page: Page, edit: (body: string, headers: Record<string, string>) => string | undefined) {
  await page.route(BASE_URL + ROUTE, async (route) => {
    const res = await route.fetch();
    const headers = { ...res.headers() };
    const body = await res.text();
    await route.fulfill({ response: res, headers, body: edit(body, headers) ?? body });
  });
}

test.describe('P1648: /live recorder exemption (browser-level)', () => {
  test.skip(!RAW_URL, 'set P1648_SMOKE_URL to a deployed URL to run');
  test.describe.configure({ timeout: 60_000 });

  // The founder's acceptance run: under the delay window that reproduced the CI flake, the smoke passes.
  // Timing decides which branch carries it (a normal flush, or the race and then the exemption), so the
  // branch is recorded, not asserted; the next test pins the exemption branch deterministically.
  test('delayed recorder start (80-250 ms) passes', async ({ page }) => {
    const delayMs = 80 + Math.floor(Math.random() * 171);
    const watch = await keepRecorderWithoutStoringReplays(page);
    await page.route(RECORDER, async (route) => {
      await new Promise((r) => setTimeout(r, delayMs));
      await route.continue();
    });
    await page.goto(BASE_URL + ROUTE);
    const state = await watch.waitForFirstFlush();
    const summary = `delay=${delayMs}ms state=${state} loaded=${watch.recorderBundleLoaded()} ran=${watch.recorderInitialised()} records=${watch.fulfilledRecordCount()}`;
    test.info().annotations.push({ type: 'state', description: summary });
    expect(() => watch.assertExercised(state, ROUTE), summary).not.toThrow();
  });

  // Deterministic exemption branch: the recorder loads and runs, but /record never succeeds (the outcome
  // the stop-on-mount race produces). Registered after the helper's /record route, so it takes precedence.
  for (const [route, mustPass] of [[ROUTE, true], ['/', false]] as const) {
    test(`exemption branch: recorder ran, no /record -> ${route} ${mustPass ? 'passes' : 'still fails (CONTROL)'}`, async ({ page }) => {
      const watch = await keepRecorderWithoutStoringReplays(page);
      await page.route('https://api-eu.mixpanel.com/record**', (r) => r.abort('failed'));
      await page.goto(BASE_URL + route);
      const state = await watch.waitForFirstFlush();
      const summary = `state=${state} loaded=${watch.recorderBundleLoaded()} ran=${watch.recorderInitialised()} records=${watch.fulfilledRecordCount()}`;
      expect(state, summary).toBe('timeout');
      expect(watch.recorderBundleLoaded(), summary).toBe(true);
      expect(watch.recorderInitialised(), summary).toBe(true);
      if (mustPass) expect(() => watch.assertExercised(state, route), summary).not.toThrow();
      else expect(() => watch.assertExercised(state, route), summary).toThrow(/recorder never reached/);
    });
  }

  test('CONTROL: misspelled opt-in flag fails', async ({ page }) => {
    const watch = await keepRecorderWithoutStoringReplays(page);
    // A typo where the page READS the flag: the helper still sets the real name, the page looks up another.
    // Editing the document avoids relying on init-script order, which Playwright leaves undefined.
    await editDocument(page, (body) => {
      expect(body.includes(FLAG), 'deployed /live no longer reads the opt-in flag').toBe(true);
      return body.split(FLAG).join('__p1628KeepRecorderForSmok');
    });
    await page.goto(BASE_URL + ROUTE);
    const state = await watch.waitForFirstFlush();
    expect(watch.recorderBundleRequested()).toBe(false);
    expect(() => watch.assertExercised(state, ROUTE)).toThrow(/recorder never reached/);
  });

  test('CONTROL: recorder CSP-blocked fails', async ({ page }) => {
    const watch = await keepRecorderWithoutStoringReplays(page);
    // script-src allows the main Mixpanel lib by path, not the recorder bundle. Reporting directives are
    // dropped so this injected violation never reaches prod's CSP report endpoint.
    await editDocument(page, (_body, headers): undefined => {
      const csp = headers['content-security-policy'];
      expect(csp, 'deployed /live has no CSP header to tighten').toBeTruthy();
      const tightened = csp
        .split(';')
        .map((d) => d.trim())
        .filter((d) => !/^report-(uri|to)\b/.test(d))
        .map((d) => (d.startsWith('script-src ')
          ? d.replace('https://cdn.mxpnl.com', 'https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js')
          : d))
        .join('; ');
      expect(tightened, 'script-src rewrite did nothing: the prod CSP shape changed').toContain('https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js');
      headers['content-security-policy'] = tightened;
    });
    await page.goto(BASE_URL + ROUTE);
    const state = await watch.waitForFirstFlush();
    expect(state).toBe('blocked');
    expect(() => watch.assertExercised(state, ROUTE)).toThrow(/recorder never reached/);
  });

  test('CONTROL: recorder worker CSP-blocked fails', async ({ page }) => {
    const watch = await keepRecorderWithoutStoringReplays(page);
    // The recorder starts its worker from blob: (data: as fallback). Drop both from worker-src; the bundle
    // itself still loads and runs. Reporting directives dropped as in the control above.
    await editDocument(page, (_body, headers): undefined => {
      const csp = headers['content-security-policy'];
      expect(csp, 'deployed /live has no CSP header to tighten').toBeTruthy();
      const tightened = csp
        .split(';')
        .map((d) => d.trim())
        .filter((d) => !/^report-(uri|to)\b/.test(d))
        .map((d) => (d.startsWith('worker-src ') ? d.split(/\s+/).filter((t) => t !== 'blob:' && t !== 'data:').join(' ') : d))
        .join('; ');
      expect(tightened, 'worker-src rewrite did nothing: the prod CSP shape changed').not.toMatch(/worker-src[^;]*\b(blob|data):/);
      headers['content-security-policy'] = tightened;
    });
    await page.goto(BASE_URL + ROUTE);
    const state = await watch.waitForFirstFlush();
    const summary = `state=${state} loaded=${watch.recorderBundleLoaded()} ran=${watch.recorderInitialised()} violations=${watch.recorderViolations().join(' | ')}`;
    expect(state, summary).toBe('blocked');
    expect(() => watch.assertExercised(state, ROUTE)).toThrow(/recorder never reached/);
  });

  test('CONTROL: recorder bundle download aborted fails (requested is not loaded)', async ({ page }) => {
    const watch = await keepRecorderWithoutStoringReplays(page);
    await page.route(RECORDER, (route) => route.abort('failed'));
    await page.goto(BASE_URL + ROUTE);
    const state = await watch.waitForFirstFlush();
    expect(watch.recorderBundleRequested()).toBe(true);
    expect(watch.recorderBundleLoaded()).toBe(false);
    expect(() => watch.assertExercised(state, ROUTE)).toThrow(/recorder never reached/);
  });

  test('CONTROL: recorder bundle answered 200 but empty fails (loaded is not running)', async ({ page }) => {
    const watch = await keepRecorderWithoutStoringReplays(page);
    await page.route(RECORDER, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await page.goto(BASE_URL + ROUTE);
    const state = await watch.waitForFirstFlush();
    expect(watch.recorderBundleLoaded()).toBe(true);
    expect(watch.recorderInitialised()).toBe(false);
    expect(() => watch.assertExercised(state, ROUTE)).toThrow(/ran=false/);
  });
});
