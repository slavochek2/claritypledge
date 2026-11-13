/**
 * P1669 — bot tag on the wire, with the real Mixpanel SDK and a real headless browser.
 *
 * Same harness as e2e/p1628-automation-tag.spec.ts: a minimal page runs the VERBATIM snippet+init
 * from index.html, the SDK loads from cdn.mxpnl.com, and every api-eu.mixpanel.com call is
 * intercepted (nothing reaches Mixpanel).
 *
 * The second test hides navigator.webdriver (the prod bots P1628 does not catch) and checks the
 * headless window shape alone still tags every event — measured against the browser itself, not a
 * fixture. The unit fixtures in src/tests/p1669-bot-tag.test.ts carry the real-Chrome control.
 *
 * Network: requires access to cdn.mxpnl.com.
 */
import { test, expect, chromium, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HARNESS_ORIGIN = 'https://p1669-harness.claritypledge.test';

function extractMixpanelInit(): string {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf-8');
  const scripts = html.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/g) ?? [];
  const snippet = scripts.find((s) => s.includes('mixpanel.init'));
  if (!snippet) throw new Error('P1669 harness: mixpanel snippet not found in index.html');
  return snippet.replace(/<\/?script[^>]*>/g, '');
}

interface WireEvent {
  event: string;
  properties: Record<string, unknown>;
}

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
    for (const text of [raw, Buffer.from(raw, 'base64').toString('utf-8')]) {
      try {
        const parsed = JSON.parse(text);
        out.push(...(Array.isArray(parsed) ? parsed : [parsed]));
        break;
      } catch {
        /* next encoding */
      }
    }
  }
  return out;
}

async function run(page: Page, search = '') {
  const events: WireEvent[] = [];
  await page.route('https://api-eu.mixpanel.com/**', async (route) => {
    const req = route.request();
    if (req.url().includes('/track')) events.push(...decodeTrack(req.postData(), req.url()));
    await route.fulfill({ status: 200, contentType: 'text/plain', body: '1' });
  });
  const html = `<!DOCTYPE html><html><head><script type="text/javascript">${extractMixpanelInit()}</script></head><body><button id="b">b</button></body></html>`;
  await page.route(`${HARNESS_ORIGIN}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await page.goto(`${HARNESS_ORIGIN}/${search}`);
  await page.waitForFunction(() => typeof (window as never as { mixpanel?: { get_distinct_id?: unknown } }).mixpanel?.get_distinct_id === 'function', undefined, { timeout: 15000 });
  await page.evaluate(() => (window as never as { mixpanel: { track: (e: string) => void } }).mixpanel.track('p1669_before_tap'));
  await page.click('#b');
  await page.evaluate(() => (window as never as { mixpanel: { track: (e: string) => void } }).mixpanel.track('p1669_after_tap'));
  const deadline = Date.now() + 10000;
  const seen = (n: string) => events.some((e) => e.event === n);
  while (Date.now() < deadline && !(seen('$mp_web_page_view') && seen('p1669_after_tap'))) await page.waitForTimeout(250);
  return events;
}

test.describe('P1669: bot tag on the wire', () => {
  test('a Playwright browser: every event is_bot (webdriver); has_interacted only after the tap; UTM stored cleaned', async ({ page }) => {
    test.setTimeout(60000);
    const events = await run(page, '?utm_source=whats%20app&utm_campaign=cm-run');
    expect(events.length).toBeGreaterThan(0);
    expect(events.filter((e) => e.properties.is_bot !== true).map((e) => e.event)).toEqual([]);
    expect(events.find((e) => e.event === '$mp_web_page_view')?.properties.bot_reason).toBe('webdriver');
    expect(events.find((e) => e.event === 'p1669_before_tap')?.properties.has_interacted).toBeUndefined();
    expect(events.find((e) => e.event === 'p1669_after_tap')?.properties.has_interacted).toBe(true);
    for (const e of events) {
      for (const [k, v] of Object.entries(e.properties)) {
        if (/utm_/.test(k) && typeof v === 'string') expect(v, `${e.event}.${k}`).toMatch(/^[A-Za-z0-9._-]{0,64}$/);
      }
    }
    expect(await page.evaluate(() => localStorage.getItem('cp_first_touch_utm'))).toBe(JSON.stringify({ utm_source: 'whatsapp', utm_campaign: 'cm-run' }));
  });

  test('headless with webdriver hidden (the shape P1628 misses): still tagged, by the window shape', async () => {
    test.setTimeout(60000);
    const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
    try {
      // The prod bots send an ordinary Chrome user agent; spoof one so only the window shape is left
      // to catch this browser (a runner's own UA may or may not say HeadlessChrome).
      // The screen headless reports depends on the host, so pin it to the size the prod bots report
      // (Mixpanel, 2026-11-12: Windows Chrome 156 at 1920x1080).
      const page = await browser.newPage({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
        screen: { width: 1920, height: 1080 },
      });
      expect(await page.evaluate(() => navigator.webdriver)).toBe(false);
      expect(await page.evaluate(() => navigator.userAgent)).not.toMatch(/headless/i);
      const events = await run(page);
      expect(events.length).toBeGreaterThan(0);
      expect(events.filter((e) => e.properties.is_bot !== true).map((e) => e.event)).toEqual([]);
      expect(events.find((e) => e.event === '$mp_web_page_view')?.properties.bot_reason).toBe('headless_window');
      expect(events.some((e) => 'is_automation' in e.properties)).toBe(false);
    } finally {
      await browser.close();
    }
  });
});
