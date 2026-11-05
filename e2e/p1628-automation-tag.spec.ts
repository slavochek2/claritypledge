/**
 * P1628 Phase 0 — automation traffic is tagged `is_automation: true` on the wire and is not
 * session-recorded, unless a smoke opts back in to the recorder.
 *
 * Same harness as e2e/p881-reproduce.spec.ts: a minimal page injects the VERBATIM snippet+init
 * <script> from index.html (the real app cannot fire Mixpanel locally), the real SDK loads from
 * cdn.mxpnl.com, and every api-eu.mixpanel.com call is intercepted — nothing reaches Mixpanel.
 *
 * Playwright sets navigator.webdriver = true, so this page IS automation. The wire decode proves
 * the before_send_events hook really receives {event, properties} (the hook contract is the part
 * a unit test cannot see).
 *
 * Network: requires access to cdn.mxpnl.com.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS_ORIGIN = 'https://p1628-harness.claritypledge.test';

function extractMixpanelInit(): string {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf-8');
  const scripts = html.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/g) ?? [];
  const snippet = scripts.find((s) => s.includes('mixpanel.init'));
  if (!snippet) throw new Error('P1628 harness: mixpanel snippet not found in index.html');
  return snippet.replace(/<\/?script[^>]*>/g, '');
}

function harnessHtml(initCall: string): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <script type="text/javascript">
      ${initCall}
    </script>
  </head>
  <body><button id="track">track</button></body>
</html>`;
}

interface WireEvent {
  event: string;
  properties: Record<string, unknown>;
}

/** Decode a /track request (form body or query) into its events: data=<base64 JSON array|object>. */
function decodeTrack(postData: string | null, url: string): WireEvent[] {
  const out: WireEvent[] = [];
  for (const source of [postData ?? '', url.split('?')[1] ?? '']) {
    const m = source.match(/(?:^|&)data=([^&]+)/);
    if (!m) continue;
    let raw = m[1];
    try {
      raw = decodeURIComponent(raw);
    } catch {
      /* already decoded */
    }
    // The SDK posts `data=<url-encoded JSON>` (measured against the live CDN build); older
    // payload formats base64 it. Accept both so a format change cannot silently empty the proof.
    for (const text of [raw, Buffer.from(raw, 'base64').toString('utf-8')]) {
      try {
        const parsed = JSON.parse(text);
        out.push(...(Array.isArray(parsed) ? parsed : [parsed]));
        break;
      } catch {
        /* try the next encoding */
      }
    }
  }
  return out;
}

async function load(page: Page, keepRecorder: boolean) {
  const events: WireEvent[] = [];
  const undecodedTracks: string[] = [];
  const recordHits: string[] = [];
  let recorderBundleRequested = false;

  page.on('request', (req) => {
    if (req.url().includes('cdn.mxpnl.com') && /recorder/i.test(req.url())) recorderBundleRequested = true;
  });

  if (keepRecorder) {
    await page.addInitScript(() => {
      (window as unknown as { __p1628KeepRecorderForSmoke: boolean }).__p1628KeepRecorderForSmoke = true;
    });
  }

  await page.route('https://api-eu.mixpanel.com/**', async (route) => {
    const req = route.request();
    if (req.url().includes('/record')) recordHits.push(req.url());
    if (req.url().includes('/track')) {
      const decoded = decodeTrack(req.postData(), req.url());
      if (decoded.length === 0) undecodedTracks.push((req.postData() ?? req.url()).slice(0, 200));
      events.push(...decoded);
    }
    await route.fulfill({ status: 200, contentType: 'text/plain', body: '1' });
  });

  const html = harnessHtml(extractMixpanelInit());
  await page.route(`${HARNESS_ORIGIN}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: html }),
  );

  await page.goto(`${HARNESS_ORIGIN}/`);
  await page.waitForFunction(
    () => typeof (window as never as { mixpanel?: { get_distinct_id?: unknown } }).mixpanel?.get_distinct_id === 'function',
    { timeout: 15000 },
  );
  await page.evaluate(() => {
    (window as never as { mixpanel: { track: (e: string, p: object) => void } }).mixpanel.track('p1628_manual_event', { a: 1 });
  });

  const deadline = Date.now() + 10000;
  const seen = (name: string) => events.some((e) => e.event === name);
  while (Date.now() < deadline && !(seen('$mp_web_page_view') && seen('p1628_manual_event'))) {
    await page.waitForTimeout(250);
  }
  return { events, undecodedTracks, recordHits, recorderBundleRequested: () => recorderBundleRequested };
}

test.describe('P1628: automation tag on the wire', () => {
  test('automation without the smoke flag: tagged, SDK initialised, recorder never loads, no /record', async ({ page }) => {
    test.setTimeout(60000);
    const run = await load(page, false);
    // Give a recorder that was wrongly enabled time to load and flush.
    await page.waitForTimeout(8000);

    const pageview = run.events.find((e) => e.event === '$mp_web_page_view');
    const manual = run.events.find((e) => e.event === 'p1628_manual_event');
    expect(pageview, `no autocaptured pageview decoded; undecoded /track bodies: ${run.undecodedTracks.join(' | ')}`).toBeTruthy();
    expect(manual, 'no manual track() decoded').toBeTruthy();
    expect(pageview!.properties.is_automation).toBe(true);
    expect(manual!.properties.is_automation).toBe(true);

    expect(await page.evaluate(() => typeof (window as never as { mixpanel: { get_distinct_id: unknown } }).mixpanel.get_distinct_id)).toBe('function');
    expect(run.recorderBundleRequested(), 'recorder bundle was requested under automation').toBe(false);
    expect(run.recordHits, 'a /record request was made under automation').toHaveLength(0);
  });

  test('automation with the smoke flag: still tagged, SDK initialised, recorder loads and posts /record', async ({ page }) => {
    test.setTimeout(60000);
    const run = await load(page, true);

    const pageview = run.events.find((e) => e.event === '$mp_web_page_view');
    const manual = run.events.find((e) => e.event === 'p1628_manual_event');
    expect(pageview, `no autocaptured pageview decoded; undecoded /track bodies: ${run.undecodedTracks.join(' | ')}`).toBeTruthy();
    expect(manual, 'no manual track() decoded').toBeTruthy();
    expect(pageview!.properties.is_automation).toBe(true);
    expect(manual!.properties.is_automation).toBe(true);

    expect(await page.evaluate(() => typeof (window as never as { mixpanel: { get_distinct_id: unknown } }).mixpanel.get_distinct_id)).toBe('function');

    // User activity for rrweb to capture before the recorder's first flush (as in p881).
    for (let i = 0; i < 5; i++) {
      await page.click('#track');
      await page.waitForTimeout(200);
    }
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && run.recordHits.length === 0) await page.waitForTimeout(500);

    expect(run.recorderBundleRequested(), 'recorder bundle not requested with the smoke flag set').toBe(true);
    expect(run.recordHits.length, 'no /record payload with the smoke flag set').toBeGreaterThan(0);
  });
});
