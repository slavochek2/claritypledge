/**
 * @file p1536-s5-walk.spec.ts
 * @description P1536 S5 (offer rows, focus switch, fork, dismiss, the publish reply) walked in a real browser with the REAL model, as a signed-in owner, at 1440x900 and 375x812.
 * Every step is recorded to RESULTS (one JSON line each) and screenshotted into DIR; nothing throws on an app defect, so one failing step does not hide the rest.
 *
 *  1440: (A) material with THREE businesses (J8: one row per other group); switch focus; Undo of the switch; dismiss; Publish with an open offer (J10: the toast carries the
 *        retention sentence and See offer); See offer opens the closed thread with a live row; Start from the CLOSED thread lands in the new canvas; Open on the started row lands
 *        in the SAME canvas (never a second fork).
 *  375:  (B) material with TWO businesses (J7: one row); Start from the OPEN draft; Open on the started row; (C) a second business appears later (J9: the focus stays, a new row);
 *        Publish; the closed thread's rows at the phone width.
 * Refuses to load against anything but a TEST project. Env: P1536_BASE (the dev server on hosted TEST), P1536_S5_DIR (evidence).
 */
import { test, expect, chromium, type Browser, type Page } from '@playwright/test';
import * as fs from 'fs';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { isTestProjectUrl } from '../scripts/sweep-e2e-test-users';

import { pacLaunchOptions } from './helpers/pac-launch';

test.skip(!isTestProjectUrl(process.env.VITE_SUPABASE_URL ?? ''), 'p1536-s5-walk: VITE_SUPABASE_URL is not a TEST project. Nothing was run.');
test.use({ launchOptions: pacLaunchOptions() }); // P1536_PAC: send the hosted TEST host through a proxy auto-config file; unset, the project's own options

const BASE = process.env.P1536_BASE ?? 'http://localhost:5104';
const DIR = process.env.P1536_S5_DIR ?? 'test-results/p1536-s5';
fs.mkdirSync(DIR, { recursive: true });
const RESULTS = `${DIR}/results.jsonl`;
test.setTimeout(1_800_000);

const BAKERY =
  'Acme Test Bakery sells weekly standing orders of sourdough and pastries to office managers at companies with 20 to 200 staff in Tallinn. ' +
  'They already pay me 12 euros per person per week, and ten offices are customers today. ' +
  'The problem is that offices order catering late and get cold, generic food. Our solution is a fresh delivery at 9am. ' +
  'My next milestone is signing ten more offices by March. ';
const STUDIO = 'I also run a small side business building websites for dental clinics at 3000 euros per site, with no clients yet. ';
const POTTERY = 'And I have started teaching evening pottery classes for retired teachers at 40 euros per class, one class so far. ';
const FOCUS = 'My focus is the bakery because the office managers already pay me.';
const MIX3 = BAKERY + STUDIO + POTTERY + FOCUS;
const MIX2 = BAKERY + STUDIO + FOCUS;
const LATER = 'Update: I have also started giving short talks about food waste to school canteens, 200 euros per talk. That is a different business from the bakery.';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function rec(vp: number, j: string, name: string, ok: boolean | null, note = '', shot?: string) {
  fs.appendFileSync(RESULTS, JSON.stringify({ vp, j, name, ok, note, shot }) + '\n');
  if (ok === false) expect.soft(false, `[${vp}] ${j} / ${name}: ${note}`).toBe(true);
}
async function step<T>(vp: number, j: string, name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try { return await fn(); } catch (e) {
    // eslint-disable-next-line no-control-regex -- strips ANSI colour codes from Playwright's error text
    rec(vp, j, name, false, `ERROR ${(e as Error).message.replace(/\u001b\[[0-9;]*m/g, '').replace(/\s+/g, ' ').slice(0, 900)}`);
    return undefined;
  }
}
async function shot(page: Page, vp: number, name: string, ms = 600): Promise<string> {
  await page.waitForTimeout(ms);
  const file = `${DIR}/${vp}-${name}.png`;
  await page.screenshot({ path: file }).catch(() => undefined);
  return file;
}

const spotState = (page: Page) => page.getByTestId('publish-spot').getAttribute('data-state').catch(() => null);
async function toView(page: Page, wide: boolean, view: 'canvas' | 'chat') {
  if (wide) return;
  await page.getByTestId(`workspace-view-${view}`).click();
  await page.waitForTimeout(250);
}
async function waitRun(page: Page) {
  await expect.poll(() => spotState(page), { timeout: 45_000, intervals: [150] }).toBe('updating').catch(() => undefined);
  await expect.poll(() => spotState(page), { timeout: 180_000, intervals: [500] }).not.toBe('updating');
  await page.waitForTimeout(3000); // the thread and the offer rows re-read what the run changed
}
interface Row { group: string; state: string; buttons: string[]; text: string; hasDismiss: boolean }
async function rows(page: Page): Promise<Row[]> {
  return page.evaluate(() => [...document.querySelectorAll('[data-testid="canvas-offer-row"]')].map(li => ({
    group: (li.querySelector('[data-testid="canvas-offer-group"]') as HTMLElement | null)?.innerText.trim() ?? '',
    state: (li as HTMLElement).dataset.offerState ?? '',
    buttons: [...li.querySelectorAll('button')].filter(b => b.dataset.testid !== 'canvas-offer-dismiss').map(b => (b as HTMLElement).innerText.trim()),
    text: (li as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
    hasDismiss: !!li.querySelector('[data-testid="canvas-offer-dismiss"]'),
  })));
}
/** The nine boxes' points as one string per box (what a person reads), without the controls. */
async function boxText(page: Page, tag: string): Promise<string> {
  return page.evaluate((t) => {
    const el = document.querySelector(`[data-testid="canvas-box-${t}"]`) as HTMLElement | null;
    const c = el?.cloneNode(true) as HTMLElement | undefined;
    c?.querySelectorAll('[data-testid^="canvas-add-to-chat-"], [data-testid="canvas-box-changed"], [data-testid="canvas-box-removed"]').forEach(n => n.remove());
    return (c?.innerText ?? '').replace(/\s+/g, ' ').trim();
  }, tag);
}
const geometry = (page: Page, vp: number) => page.evaluate((w) => {
  const hs = [...document.querySelectorAll('[data-testid="canvas-offers"] button, [data-testid="canvas-offers"] a')].map(b => { const r = b.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width), inView: r.left >= 0 && r.right <= w }; });
  return { targets: hs, scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth };
}, vp);

/** Waits for the offer rows to show (the read follows the run's settling by a moment), at most `ms`; returns whatever is there. */
async function rowsSettled(page: Page, want: (r: Row[]) => boolean, ms = 25_000): Promise<Row[]> {
  const until = Date.now() + ms;
  let r = await rows(page);
  while (!want(r) && Date.now() < until) { await page.waitForTimeout(500); r = await rows(page); }
  return r;
}

/** The first message of a canvas is a FILE (the owner's own AI's answer, uploaded): a fork copies the owner's files and links, so the material has to be one. */
async function startMaterial(page: Page, vp: number, wide: boolean, material: string): Promise<string> {
  await page.goto('/artifacts');
  await page.getByRole('tab', { name: 'Canvases' }).click();
  await page.getByTestId('artifacts-new-canvas').click();
  await page.waitForURL(/\/p\/[^/]+\/canvas\/canvas(?:_\d+)?\?/, { timeout: 45_000 });
  await expect(page.getByTestId('canvas-opener')).toBeVisible({ timeout: 40_000 });
  await page.waitForTimeout(800);
  await page.getByTestId('canvas-upload-input').setInputFiles({ name: 'acme-notes.md', mimeType: 'text/markdown', buffer: Buffer.from(`# Acme notes\n\n${material}\n`) });
  await waitRun(page);
  await toView(page, wide, 'chat');
  return page.url();
}

/** A workspace address, once its thread is there to read: the thread beside the canvas on a wide screen, the Canvas/Thread switch on a phone. */
async function openWorkspace(page: Page, wide: boolean, url: string) {
  await page.goto(url);
  await expect(wide ? page.getByTestId('thread-panel') : page.getByTestId('workspace-view-chat')).toBeVisible({ timeout: 40_000 });
}

async function walk(browser: Browser, vp: number, height: number, closedOnly = false) {
  const wide = vp >= 1280;
  const user: TestUser = await createTestUser({ name: `P1536 S5 ${vp}` });
  const ctx = await browser.newContext({ viewport: { width: vp, height }, baseURL: BASE, ...(wide ? {} : { hasTouch: true, isMobile: true, deviceScaleFactor: 2 }) });
  await ctx.addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } });
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
  const rpcs: string[] = [];
  page.on('request', r => { const m = /rest\/v1\/rpc\/(\w+)/.exec(r.url()); if (m && r.method() === 'POST') rpcs.push(m[1]); });
  await setTestSession(page, user.email);
  try {
    rec(vp, 'env', 'viewport really took effect', await page.evaluate(() => window.innerWidth) === vp, `innerWidth=${await page.evaluate(() => window.innerWidth)}`);
    if (wide) await walk1440(page, vp, rpcs); else await walk375(page, vp, closedOnly);
    rec(vp, 'env', 'console errors during the walk', consoleErrors.length === 0 ? true : null, JSON.stringify([...new Set(consoleErrors)].slice(0, 8)));
  } finally {
    await ctx.close();
    await deleteTestUser(user.user.id).catch(() => undefined);
    await sleep(200);
  }
}

/**
 * The publish toast: its text, the See offer action, and which of the page's top-bar controls (buttons and links in the bar: the top 110px below 1280px where it is two rows, the top 56px above) it sits on top of. A control whose centre is
 * inside the toast cannot be tapped while the toast shows: `elementFromPoint` there is the toast, not the control. Settled first: a toast is mid-slide for its first moments.
 */
async function toastInfo(page: Page) {
  const t = page.locator('[data-sonner-toast]').first();
  await t.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(800);
  const covered = await page.evaluate(() => {
    const toast = document.querySelector('[data-sonner-toast]');
    if (!toast) return [];
    const r = toast.getBoundingClientRect();
    return [...document.querySelectorAll('button, a, [role="button"]')]
      .filter((el) => !toast.contains(el))
      .map((el) => { const b = el.getBoundingClientRect(); return { name: (el.getAttribute('data-testid') || el.textContent || '').trim().slice(0, 30), top: b.top, cx: b.left + b.width / 2, cy: b.top + b.height / 2, w: b.width, h: b.height }; })
      .filter((c) => c.w > 0 && c.h > 0 && c.top >= 0 && c.top < (window.innerWidth < 1280 ? 110 : 56) && c.cx >= r.left && c.cx <= r.right && c.cy >= r.top && c.cy <= r.bottom)
      .filter((c) => !!document.elementFromPoint(c.cx, c.cy)?.closest('[data-sonner-toast]'))
      .map((c) => c.name);
  });
  const rect = await t.evaluate((e) => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; });
  return { text: ((await t.innerText()) || '').replace(/\s+/g, ' ').trim(), hasSeeOffer: (await t.getByRole('button', { name: 'See offer' }).count()) > 0, covered, rect };
}

async function walk1440(page: Page, vp: number, rpcs: string[]) {
  const wide = true;
  let first: string[] = [];
  let srcUrl = '';
  await step(vp, 'J8', 'three businesses: the first reply, then one row per other group (max 3)', async () => {
    srcUrl = await startMaterial(page, vp, wide, MIX3);
    const r = await rowsSettled(page, x => x.length >= 2);
    first = r.map(x => x.group);
    const f = await shot(page, vp, 'A1-three-businesses-thread');
    rec(vp, 'J8', 'two offer rows (three businesses found, one is the focus)', r.length === 2 && r.every(x => x.state === 'offered' && x.buttons.join('|') === 'Make it about this|Start a canvas' && x.hasDismiss), JSON.stringify(r), f);
    const reply = (await page.getByTestId('thread-panel').innerText()).replace(/\s+/g, ' ');
    rec(vp, 'J8', 'the mirror reply names what it found', /I found .*(Draft ready|I drafted)/.test(reply), reply.slice(-500), f);
    const g = await geometry(page, vp);
    rec(vp, 'J8', 'targets at least 40px tall, nothing past the viewport, no page overflow', g.targets.every(t => t.h >= 40 && t.inView) && g.scrollWidth <= vp, JSON.stringify(g), f);
    rec(vp, 'J8', 'the focus segment box has points', (await boxText(page, 'canvas:segments')).length > 20, await boxText(page, 'canvas:segments'));
  });
  if (first.length === 0) return;

  const before = await boxText(page, 'canvas:segments');
  const first0 = [...first];
  await step(vp, 'switch', 'Make it about this: one focus run; the old focus becomes an offer; the target leaves the rows', async () => {
    const target = (await rows(page))[0].group;
    await page.getByTestId('canvas-offer-row').first().getByTestId('canvas-offer-switch').click();
    await expect(page.getByTestId('canvas-offer-status').first()).toBeVisible({ timeout: 15_000 }).catch(() => undefined);
    const f0 = await shot(page, vp, 'A2-switch-in-flight', 200);
    await waitRun(page);
    const r = await rowsSettled(page, x => x.length >= 2 && !x.some(y => y.group === target));
    const f = await shot(page, vp, 'A2-after-switch-thread');
    const other = first.find(g => g !== target) ?? '';
    rec(vp, 'switch', 'rows after the switch: the target is gone, the other offer stays, the previous focus is a new offer', r.length >= 2 && !r.some(x => x.group === target) && r.some(x => x.group === other) && r.every(x => x.state === 'offered'), `target=${target} before=${JSON.stringify(first)} after=${JSON.stringify(r.map(x => x.group))}`, f);
    rec(vp, 'switch', 'INFO: exactly two rows after a switch (a model that words the old focus differently adds a second offer: the server merge matches names only)', r.length === 2 ? true : null, `rows=${r.length} ${JSON.stringify(r.map(x => x.group))}`, f);
    const after = await boxText(page, 'canvas:segments');
    rec(vp, 'switch', 'the customer segments now read about the new focus', after !== before, `before="${before.slice(0, 200)}" after="${after.slice(0, 200)}"`, f0);
    first = r.map(x => x.group);
  });
  const switched = await boxText(page, 'canvas:segments');
  await step(vp, 'switch', 'Undo of the switch restores the focus, the rows and the points', async () => {
    await page.getByTestId('canvas-undo').click();
    await expect.poll(async () => await boxText(page, 'canvas:segments'), { timeout: 30_000 }).toBe(before);
    await page.waitForTimeout(1500);
    const r = await rowsSettled(page, x => x.length === first0.length, 15_000);
    const f = await shot(page, vp, 'A3-after-undo-thread');
    const restored = await boxText(page, 'canvas:segments');
    rec(vp, 'switch', 'after Undo the original offers are back (the previous focus row the switch added is gone) and the segments are back', JSON.stringify(r.map(x => x.group).sort()) === JSON.stringify([...first0].sort()) && restored === before && restored !== switched, `rows=${JSON.stringify(r.map(x => x.group))} original=${JSON.stringify(first0)} restoredSame=${restored === before}`, f);
    first = r.map(x => x.group);
  });

  await step(vp, 'dismiss', 'the × dismisses one offer and it stays dismissed after a reload', async () => {
    const n0 = (await rows(page)).length;
    if (n0 < 2) { rec(vp, 'dismiss', 'skipped: the model offered only one group, and the next step needs an open offer', null, `rows=${n0}`); return; }
    const gone = (await rows(page))[0].group;
    await page.getByTestId('canvas-offer-row').first().getByTestId('canvas-offer-dismiss').click();
    await expect.poll(async () => (await rows(page)).length, { timeout: 15_000 }).toBe(n0 - 1);
    await page.reload();
    await expect(page.getByTestId('thread-panel')).toBeVisible({ timeout: 40_000 });
    const r = await rowsSettled(page, x => x.length >= 1, 25_000);
    const f = await shot(page, vp, 'A4-after-dismiss-and-reload');
    rec(vp, 'dismiss', 'after a reload the dismissed offer is still gone and the others stay', r.length === n0 - 1 && !r.some(x => x.group === gone), `dismissed=${gone} left=${JSON.stringify(r.map(x => x.group))}`, f);
  });

  let closedUrl = '';
  await step(vp, 'J10', 'Publish with an open offer: the toast says what happens to the material and carries See offer', async () => {
    await page.getByTestId('canvas-draft-publish').click();
    const t = await toastInfo(page);
    const f = await shot(page, vp, 'A5-publish-toast', 200);
    rec(vp, 'toast', 'the toast sits on no top-bar control (nothing to tap is under it)', t.covered.length === 0, `covered=${JSON.stringify(t.covered)} rect=${JSON.stringify(t.rect)}`, f);
    rec(vp, 'J10', 'the toast is the publish reply: Published v1, the group, the retention sentence, See offer', /^Published v1\./.test(t.text) && /I keep the text of your uploads/.test(t.text) && /30 days/.test(t.text) && t.hasSeeOffer, t.text, f);
    await page.locator('[data-sonner-toast]').first().getByRole('button', { name: 'See offer' }).click();
    await expect(page.getByTestId('canvas-closed-line')).toBeVisible({ timeout: 30_000 });
    closedUrl = page.url();
    const r = await rowsSettled(page, x => x.length >= 1);
    const f2 = await shot(page, vp, 'A5-see-offer-closed-thread');
    rec(vp, 'J10', 'See offer opens the closed thread: Published as v1, one row with Start only', r.length === 1 && r[0].buttons.join('|') === 'Start a canvas' && /\/chats\/c\//.test(closedUrl), `url=${closedUrl} rows=${JSON.stringify(r)}`, f2);
  });
  if (!closedUrl) return;

  let newUrl = '';
  await step(vp, 'fork', 'Start a canvas from the CLOSED thread: the new workspace opens and drafts', async () => {
    const nCanvasBefore = rpcs.filter(x => x === 'canvas_draft_fork').length;
    await page.getByTestId('canvas-offer-start').click();
    await page.waitForURL(/\/p\/[^/]+\/canvas\/canvas(?:_\d+)?\?.*ws=1/, { timeout: 60_000 });
    newUrl = page.url();
    await waitRun(page);
    const f = await shot(page, vp, 'A6-forked-canvas-workspace');
    const seg = await boxText(page, 'canvas:segments');
    rec(vp, 'fork', 'the owner lands in a NEW canvas, a first draft was made from the material', newUrl !== srcUrl && !newUrl.startsWith(srcUrl.split('?')[0] + '?') && seg.length > 20, `url=${newUrl} segments="${seg.slice(0, 160)}" forkCalls=${rpcs.filter(x => x === 'canvas_draft_fork').length - nCanvasBefore}`, f);
    const reply = (await page.getByTestId('thread-panel').innerText()).replace(/\s+/g, ' ');
    rec(vp, 'fork', 'the new thread has its own reply, the focus is the offered group', /Draft ready|Updated/.test(reply), reply.slice(-300));
  });
  await step(vp, 'fork', 'the started row reads "… canvas started" with Open, and Open lands in the SAME canvas (no second fork)', async () => {
    await page.goto(closedUrl);
    await expect(page.getByTestId('canvas-closed-line')).toBeVisible({ timeout: 40_000 });
    const r = await rowsSettled(page, x => x.length >= 1);
    const f = await shot(page, vp, 'A7-closed-thread-started-row');
    rec(vp, 'fork', 'one row, "<group> canvas started", an Open button, no ×', r.length === 1 && r[0].state === 'started' && /canvas started/.test(r[0].text) && r[0].buttons.join('|') === 'Open' && !r[0].hasDismiss, JSON.stringify(r), f);
    await page.getByTestId('canvas-offer-open').click();
    await page.waitForURL(/\/p\/[^/]+\/canvas\/canvas(?:_\d+)?\?/, { timeout: 40_000 });
    const here = new URL(page.url());
    const was = new URL(newUrl);
    rec(vp, 'fork', 'Open lands in the canvas the fork made (same canvas path), and no second canvas was made', here.pathname === was.pathname, `open=${here.pathname} fork=${was.pathname}`);
    await page.goto('/artifacts');
    await page.getByRole('tab', { name: 'Canvases' }).click();
    await page.waitForTimeout(2500);
    const f2 = await shot(page, vp, 'A7-artifacts-two-canvases');
    const n = await page.locator('[data-testid^="artifacts-canvas-row"], [data-testid="artifact-row"]').count();
    rec(vp, 'fork', 'Artifacts lists the source canvas and one new canvas (info: rows counted)', null, `rows=${n}`, f2);
  });
}

async function walk375(page: Page, vp: number, closedOnly = false) {
  const wide = false;
  let srcUrl = '';
  await step(vp, 'J7', 'two businesses: one row under the reply', async () => {
    srcUrl = await startMaterial(page, vp, wide, MIX2);
    const r = await rowsSettled(page, x => x.length >= 1);
    const f = await shot(page, vp, 'B1-two-businesses-thread');
    rec(vp, 'J7', 'exactly one offer row, both buttons, a ×', r.length === 1 && r[0].state === 'offered' && r[0].buttons.join('|') === 'Make it about this|Start a canvas' && r[0].hasDismiss, JSON.stringify(r), f);
    const g = await geometry(page, vp);
    rec(vp, 'J7', 'targets at least 40px tall, nothing past the viewport, no page overflow', g.targets.every(t => t.h >= 40 && t.inView) && g.scrollWidth <= vp, JSON.stringify(g), f);
  });
  if (!srcUrl) return;
  await sleep(100);

  let rows0 = 0;
  if (!closedOnly) {
  await step(vp, 'J9', 'a second business appears later, in a file added to the open draft: the focus stays and a new row is added', async () => {
    await toView(page, wide, 'canvas');
    const seg0 = await boxText(page, 'canvas:segments');
    await toView(page, wide, 'chat');
    await page.getByTestId('canvas-upload-input').setInputFiles({ name: 'school-talks.md', mimeType: 'text/markdown', buffer: Buffer.from(`# School talks\n\n${LATER}\n`) });
    await waitRun(page);
    const r = await rowsSettled(page, x => x.length >= 2);
    rows0 = r.length;
    const f = await shot(page, vp, 'C1-later-business-thread');
    rec(vp, 'J9', 'a new offered row appears beside the first (two rows, both offered)', r.length === 2 && r.every(x => x.state === 'offered'), JSON.stringify(r), f);
    await toView(page, wide, 'canvas');
    const seg1 = await boxText(page, 'canvas:segments');
    rec(vp, 'J9', 'the customer segments do not move toward the new business (the focus stays)', seg1 === seg0, `before="${seg0.slice(0, 160)}" after="${seg1.slice(0, 160)}"`);
    await toView(page, wide, 'chat');
  });

  let forkUrl = '';
  await step(vp, 'fork', 'Start a canvas from the OPEN draft: the new workspace opens', async () => {
    await page.getByTestId('canvas-offer-row').first().getByTestId('canvas-offer-start').click();
    await page.waitForURL(u => /\/canvas\/canvas(?:_\d+)?\?.*ws=1/.test(u.href) && u.href !== srcUrl, { timeout: 60_000 });
    forkUrl = page.url();
    await waitRun(page);
    await toView(page, wide, 'canvas');
    const f = await shot(page, vp, 'B2-forked-canvas-tab');
    rec(vp, 'fork', 'a different canvas than the source, with a first draft', new URL(forkUrl).pathname !== new URL(srcUrl).pathname && (await boxText(page, 'canvas:segments')).length > 20, `fork=${forkUrl} src=${srcUrl}`, f);
    await toView(page, wide, 'chat');
    await shot(page, vp, 'B2-forked-thread-tab');
  });
  await step(vp, 'fork', 'back in the source draft the tapped row says started, with Open to the same canvas; the other row is still offered', async () => {
    await openWorkspace(page, wide, srcUrl);
    await toView(page, wide, 'chat');
    const r = await rowsSettled(page, x => x.some(y => y.state === 'started'));
    const f = await shot(page, vp, 'B3-source-started-row');
    rec(vp, 'fork', 'one started row with Open, and the other offer unchanged', r.length === rows0 && r.filter(x => x.state === 'started').length === 1 && r.find(x => x.state === 'started')?.buttons.join('|') === 'Open' && r.filter(x => x.state === 'offered').length === rows0 - 1, JSON.stringify(r), f);
    await page.getByTestId('canvas-offer-open').click();
    await page.waitForURL(u => /\/canvas\/canvas(?:_\d+)?\?/.test(u.href) && u.pathname !== new URL(srcUrl).pathname, { timeout: 40_000 });
    rec(vp, 'fork', 'Open lands in the canvas the fork made', new URL(page.url()).pathname === new URL(forkUrl).pathname, `url=${page.url()}`);
    await openWorkspace(page, wide, srcUrl);
    await toView(page, wide, 'chat');
  });
  }

  let closedUrl = '';
  await step(vp, 'J10', 'Publish with an open offer, See offer, and the closed thread\'s rows at 375', async () => {
    await page.getByTestId('canvas-draft-publish').click();
    const t = await toastInfo(page);
    const f = await shot(page, vp, 'C2-publish-toast', 200);
    rec(vp, 'toast', 'the toast sits on no top-bar control (nothing to tap is under it)', t.covered.length === 0, `covered=${JSON.stringify(t.covered)} rect=${JSON.stringify(t.rect)}`, f);
    rec(vp, 'J10', 'the toast carries the retention sentence and See offer', /^Published v1\./.test(t.text) && /30 days/.test(t.text) && t.hasSeeOffer, t.text, f);
    if (!t.hasSeeOffer) return;
    await page.locator('[data-sonner-toast]').first().getByRole('button', { name: 'See offer' }).click();
    await expect(page.getByTestId('canvas-closed-line')).toBeVisible({ timeout: 30_000 });
    closedUrl = page.url();
    const r = await rowsSettled(page, x => x.length >= (closedOnly ? 1 : 2));
    const f2 = await shot(page, vp, 'C2-closed-thread-rows');
    const g = await geometry(page, vp);
    rec(vp, 'J10', closedOnly ? 'closed thread: one offered row (Start only), nothing past the viewport' : 'closed thread: a started row (Open) and an offered row (Start), nothing past the viewport', r.length === (closedOnly ? 1 : 2) && (!closedOnly || r[0].buttons.join('|') === 'Start a canvas') && g.targets.every(x => x.h >= 40 && x.inView) && g.scrollWidth <= vp, `${JSON.stringify(r)} geometry=${JSON.stringify(g)}`, f2);
  });
  if (!closedUrl) return;
  if (closedOnly) {
    await step(vp, 'fork', 'Start from the closed thread at 375 lands in the new workspace; the closed thread then reads started with Open', async () => {
      await page.getByTestId('canvas-offer-start').click();
      await page.waitForURL(u => /\/canvas\/canvas(?:_\d+)?\?.*ws=1/.test(u.href), { timeout: 60_000 });
      await waitRun(page);
      await toView(page, wide, 'canvas');
      const f = await shot(page, vp, 'D1-closed-start-lands');
      rec(vp, 'fork', 'a new canvas with a first draft', (await boxText(page, 'canvas:segments')).length > 20, await boxText(page, 'canvas:segments'), f);
      await page.goto(closedUrl);
      await expect(page.getByTestId('canvas-closed-line')).toBeVisible({ timeout: 40_000 });
      const r = await rowsSettled(page, x => x.some(y => y.state === 'started'));
      const f2 = await shot(page, vp, 'D2-closed-thread-started');
      rec(vp, 'fork', 'one started row with Open, no ×', r.length === 1 && r[0].state === 'started' && r[0].buttons.join('|') === 'Open' && !r[0].hasDismiss, JSON.stringify(r), f2);
    });
    return;
  }
  await step(vp, 'dismiss', 'dismissing the last open offer from the closed thread leaves the started row and the line', async () => {
    const offered = page.locator('[data-testid="canvas-offer-row"][data-offer-state="offered"]');
    await offered.getByTestId('canvas-offer-dismiss').click();
    await expect(offered).toHaveCount(0, { timeout: 15_000 });
    const f = await shot(page, vp, 'C3-after-dismiss-last-offer');
    const r = await rows(page);
    rec(vp, 'dismiss', 'only the started row remains, the closed line stays', r.length === 1 && r[0].state === 'started' && (await page.getByTestId('canvas-closed-line').isVisible()), JSON.stringify(r), f);
  });
}

test.describe.configure({ mode: 'serial' });
let browser: Browser;
test.beforeAll(async () => { browser = await chromium.launch(pacLaunchOptions()); });
test.afterAll(async () => { await browser.close(); });

test('S5 walk at 1440', async () => { await walk(browser, 1440, 900); });
test('S5 walk at 375', async () => { await walk(browser, 375, 812); });
test('S5 closed thread at 375', async () => { await walk(browser, 375, 812, true); });
