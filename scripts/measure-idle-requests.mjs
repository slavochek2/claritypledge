#!/usr/bin/env node
/**
 * @file measure-idle-requests.mjs
 * @description P1522: count the Supabase requests an idle open tab makes, per endpoint and per
 * minute, so "before" and "after" come from one method.
 *
 * Method: headless Chromium, fresh context per page (empty storage, like a new visitor or an e2e
 * context). Load the page (counted only with --from-navigation), then record every request to the Supabase host for --minutes. With
 * --hidden, the page is told it is hidden after --settle seconds: document.visibilityState is
 * overridden to 'hidden' and a visibilitychange event fires (headless Chromium never hides a page
 * on its own; this exercises the app's own visibility handling, not the browser's throttling).
 * Bytes are the response body bytes Chromium reports (request.sizes()), compressed on the wire
 * where the server compressed. Realtime websocket frames are counted separately as frames.
 *
 * P1532: requests that FAIL (network error, abort, timeout, blocked) are counted too, and reported
 * separately. They never reach `requestfinished`, so the P1522 measurements could not see them,
 * yet each still costs gateway log lines: a failure storm read as zero. `--block <substring>` aborts
 * every Supabase request whose URL contains the substring, to simulate a failing endpoint and prove
 * the count.
 *
 * Usage: node scripts/measure-idle-requests.mjs --base http://localhost:5400 \
 *          --paths /,/feed,/events --minutes 5 [--hidden] [--settle 10] [--json out.json]
 *          [--local key=value] [--from-navigation] [--block <url-substring>]
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? dflt : args[i + 1];
};
const BASE = opt('base', 'http://localhost:5400');
const PATHS = opt('paths', '/feed').split(',');
const MINUTES = Math.max(1, Math.ceil(Number(opt('minutes', '5')) || 5));
const SETTLE_S = Number(opt('settle', '10'));
const HIDDEN = args.includes('--hidden');
/** Count from before navigation (a fresh load's full cost) instead of after load + settle. */
const FROM_NAV = args.includes('--from-navigation');
const JSON_OUT = opt('json', null);
/** --local key=value seeds localStorage before the app boots (e.g. to disable a feature). */
const LOCAL = opt('local', null);
/** --block substring: abort matching Supabase requests (simulated outage; P1532). */
const BLOCK = opt('block', null);

/** `/rest/v1/points?select=…` → `rest:points`, `/rest/v1/rpc/foo` → `rpc:foo`. */
function endpointOf(url) {
  const u = new URL(url);
  const p = u.pathname;
  let m = p.match(/^\/rest\/v1\/rpc\/([^/]+)/);
  if (m) return `rpc:${m[1]}`;
  m = p.match(/^\/rest\/v1\/([^/]+)/);
  if (m) return `rest:${m[1]}`;
  m = p.match(/^\/(auth|storage|functions|realtime)\/v1\/([^/?]+)/);
  if (m) return `${m[1]}:${m[2]}`;
  return p;
}

async function measure(browser, path) {
  const context = await browser.newContext();
  await context.addInitScript((local) => {
    if (local) { const i = local.indexOf('='); localStorage.setItem(local.slice(0, i), local.slice(i + 1)); }
    window.__p1522Hidden = false;
    Object.defineProperty(document, 'visibilityState', { get: () => (window.__p1522Hidden ? 'hidden' : 'visible'), configurable: true });
    Object.defineProperty(document, 'hidden', { get: () => window.__p1522Hidden, configurable: true });
  }, LOCAL);
  if (BLOCK) {
    await context.route((url) => /supabase\.co/.test(url.href) && url.href.includes(BLOCK), (route) => route.abort('failed'));
  }
  const page = await context.newPage();
  const rows = [];
  let wsFrames = 0;
  let t0 = 0;
  page.on('websocket', (ws) => {
    if (!/supabase/.test(ws.url())) return;
    ws.on('framereceived', () => { if (t0) wsFrames++; });
    ws.on('framesent', () => { if (t0) wsFrames++; });
  });
  page.on('requestfinished', async (req) => {
    if (!t0 || !/supabase\.co/.test(req.url())) return;
    const at = Date.now() - t0;
    let bytes = 0;
    try { bytes = (await req.sizes()).responseBodySize; } catch { /* closed */ }
    rows.push({ at, endpoint: `${req.method()} ${endpointOf(req.url())}`, bytes, failed: false });
  });
  page.on('requestfailed', (req) => {
    if (!t0 || !/supabase\.co/.test(req.url())) return;
    rows.push({ at: Date.now() - t0, endpoint: `${req.method()} ${endpointOf(req.url())}`, bytes: 0, failed: true });
  });
  if (FROM_NAV) t0 = Date.now();
  await page.goto(BASE + path, { waitUntil: 'load' });
  await page.waitForTimeout(SETTLE_S * 1000);
  if (HIDDEN) {
    await page.evaluate(() => { window.__p1522Hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
  }
  if (!FROM_NAV) t0 = Date.now();
  await page.waitForTimeout(MINUTES * 60_000);
  await context.close();
  return { path, rows, wsFrames };
}

function report({ path, rows, wsFrames }) {
  const byEp = new Map();
  for (const r of rows) {
    const e = byEp.get(r.endpoint) ?? { count: 0, failed: 0, bytes: 0, perMin: Array(MINUTES).fill(0) };
    e.count++;
    if (r.failed) e.failed++;
    e.bytes += r.bytes;
    e.perMin[Math.min(MINUTES - 1, Math.floor(r.at / 60_000))]++;
    byEp.set(r.endpoint, e);
  }
  const total = rows.length;
  const failed = rows.filter((r) => r.failed).length;
  const bytes = rows.reduce((s, r) => s + r.bytes, 0);
  const window = FROM_NAV ? `${MINUTES} min from navigation` : `${MINUTES} min after load + ${SETTLE_S}s settle`;
  console.log(`\n## ${path} — ${HIDDEN ? 'hidden' : 'visible'}, ${window}`);
  console.log(`total: ${total} requests (${(total / MINUTES).toFixed(1)}/min), of which ${failed} failed, ${(bytes / 1024).toFixed(1)} KiB, ws frames: ${wsFrames}`);
  console.log('| endpoint | total | failed | req/min | KiB | per minute |');
  console.log('|---|---|---|---|---|---|');
  for (const [ep, e] of [...byEp].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`| ${ep} | ${e.count} | ${e.failed} | ${(e.count / MINUTES).toFixed(1)} | ${(e.bytes / 1024).toFixed(1)} | ${e.perMin.join(' ')} |`);
  }
  return { path, hidden: HIDDEN, minutes: MINUTES, total, failed, bytes, wsFrames, endpoints: Object.fromEntries(byEp) };
}

const browser = await chromium.launch();
const results = await Promise.all(PATHS.map((p) => measure(browser, p)));
await browser.close();
const summary = results.map(report);
if (JSON_OUT) {
  const fs = await import('node:fs');
  fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
}
