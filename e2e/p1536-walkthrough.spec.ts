/**
 * @file p1536-walkthrough.spec.ts
 * @description P1536 section 3b founder walkthrough, J-W1 to J-W5, driven in a real browser as a signed-in owner with no canvases,
 * at 1440x900 and 375x812. One test per viewport (a failing cell is recorded and the walk goes on), plus an access test.
 *
 * Every step is recorded to RESULTS (one JSON line each) and screenshotted into DIR, so the report is built from evidence, not
 * from a green run. Nothing here throws on an app defect: `rec` records it and `expect.soft` marks the test failed.
 *
 * Real drafting (the canvas-draft edge function on TEST) is used for every Send; nothing is stubbed.
 */
import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, TEST_PASSWORD, type TestUser } from './helpers/test-user';

const BASE = process.env.P1536_BASE ?? 'http://localhost:5101';
const DIR = process.env.P1536_WALK_DIR ?? 'test-results/p1536-walk';
fs.mkdirSync(DIR, { recursive: true });
const RESULTS = `${DIR}/results.jsonl`;

test.use({ baseURL: BASE, actionTimeout: 20_000 });

const MATERIAL =
  'Acme Test Bakery sells sourdough loaves and pastries to office managers at companies with 20 to 200 staff in Tallinn. ' +
  'The problem is that offices order catering late and get cold, generic food. ' +
  'Our solution is a weekly standing order delivered fresh at 9am. ' +
  'We charge 12 euros per person per week. ' +
  'My next milestone is signing ten office customers by March.';
const SECOND = 'Acme Test Bakery now also offers a gluten-free line for 14 euros per person per week to the same office managers.';

type Rec = { vp: number; j: string; step: string; ok: boolean | null; note: string; shot?: string };

function rec(vp: number, j: string, step: string, ok: boolean | null, note = '', shot?: string) {
  const r: Rec = { vp, j, step, ok, note, shot };
  fs.appendFileSync(RESULTS, JSON.stringify(r) + '\n');
  if (ok === false) expect.soft(false, `[${vp}] ${j} / ${step}: ${note}`).toBe(true);
}

/** Run a step; an error (a locator that never appears, a timeout) is a recorded FAIL, never a thrown test. */
async function step<T>(vp: number, j: string, name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    // eslint-disable-next-line no-control-regex -- strips the ANSI colour codes out of Playwright's error text
    rec(vp, j, name, false, `ERROR ${(e as Error).message.replace(/\u001b\[[0-9;]*m/g, '').replace(/\s+/g, ' ').slice(0, 1400)}`);
    return undefined;
  }
}

/** Finite animations finished, plus a margin: a dialog, a toast or a panel is never captured mid-fade. */
async function settle(page: Page, ms = 450) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => undefined)))).catch(() => undefined);
  await page.waitForTimeout(ms);
}

async function shot(page: Page, vp: number, j: string, name: string, settleMs = 300): Promise<string> {
  const file = `${DIR}/${j}-${vp}-${name}.png`;
  await settle(page, settleMs);
  try { await page.screenshot({ path: file }); } catch { /* recorded by the caller's own checks */ }
  return file;
}

/** What the user can see and what the page claims, read in one evaluate. */
async function snap(page: Page) {
  return page.evaluate(() => {
    const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    const vis = (e: Element | null) => {
      if (!e) return false;
      const r = (e as HTMLElement).getBoundingClientRect();
      const cs = getComputedStyle(e as HTMLElement);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.right > 0 && r.left < window.innerWidth;
    };
    const box = (e: Element | null) => {
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
    };
    const spot = q('publish-spot');
    const bar = q('workspace-bar');
    // how many characters of an element's text sit inside its own box (the rest is cut off, with or without an ellipsis)
    const shownInfo = (el: HTMLElement | null) => {
      if (!el || !vis(el)) return null;
      const er = el.getBoundingClientRect();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let total = 0; let inside = 0; let n: Node | null;
      while ((n = walker.nextNode())) {
        const t = n.textContent ?? '';
        for (let i = 0; i < t.length; i++) {
          const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
          const cr = r.getBoundingClientRect(); total++;
          if (cr.width > 0 && cr.right <= er.right + 0.5 && cr.left >= er.left - 0.5) inside++;
        }
      }
      return { text: el.innerText.replace(/\s+/g, ' ').trim(), w: Math.round(er.width), total, inside, clipped: el.scrollWidth > el.clientWidth + 1 };
    };
    const blue = [...document.querySelectorAll('button, a')].filter(vis).filter(b => {
      const m = getComputedStyle(b).backgroundColor.match(/[\d.]+/g);
      if (!m) return false;
      const [r, , bl, a] = m.map(Number);
      return (a === undefined || a > 0.5) && bl - r > 80 && bl > 150;
    }).map(b => ((b.getAttribute('data-testid') || b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 30)));
    const sw = q('workspace-view-chat');
    return {
      url: location.pathname + location.search,
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      title: q('canvas-title')?.textContent ?? null,
      state: vis(q('canvas-state')) ? q('canvas-state')!.textContent : null,
      spotState: spot?.getAttribute('data-state') ?? null,
      spotText: spot?.textContent?.trim() ?? null,
      spotBox: box(spot),
      barBox: box(bar),
      barText: bar?.innerText?.replace(/\s+/g, ' ').trim() ?? null,
      panel: vis(q('thread-panel')) || vis(q('workspace-chat-pane')) || vis(q('workspace-chat-empty')),
      threadBtn: vis(q('workspace-thread-button')),
      switcher: vis(q('workspace-view-switch')),
      onThreadTab: sw ? sw.getAttribute('aria-selected') === 'true' || sw.getAttribute('data-state') === 'active' : null,
      clone: vis(q('canvas-clone')),
      discard: vis(q('canvas-discard')),
      rename: vis(q('canvas-rename')),
      share: vis(q('canvas-share-control')),
      shareText: q('canvas-share-control')?.textContent?.trim() ?? null,
      picker: vis(q('canvas-version-picker')),
      pickerText: q('canvas-version-picker')?.textContent?.trim() ?? null,
      copyPrompt: vis(q('canvas-copy-prompt')),
      points: document.querySelectorAll('[data-testid^="canvas-point-card"]').length,
      blue,
      clarityCanvasText: /Clarity Canvas/.test(bar?.innerText ?? ''),
      clarityCanvasOnPage: /Clarity Canvas/.test(document.body.innerText),
      // a message row inside the thread that shows nothing at all (no text, no card, no attachment)
      blankMessages: [...document.querySelectorAll('[data-testid="thread-panel"] li[data-testid="message"]')].filter(li => {
        const t = (li as HTMLElement).innerText.replace(/\s+/g, ' ').trim();
        const author = li.querySelector('[data-testid="mirror-author"]');
        const hasCard = !!li.querySelector('[data-testid^="attachment-"], [data-testid^="attach-card"], img, video, audio');
        return !hasCard && (t === '' || (author && t === (author as HTMLElement).innerText.replace(/\s+/g, ' ').trim()));
      }).length,
      // the band above the owner bar: where its top sits, and what is in that space
      barTop: bar ? Math.round(bar.getBoundingClientRect().top * 10) / 10 : null,
      aboveBar: (() => {
        if (!bar) return null;
        const top = bar.getBoundingClientRect().top;
        if (top < 2) return 'bar at the top of the viewport';
        const probe = document.elementFromPoint(Math.min(window.innerWidth - 4, bar.getBoundingClientRect().left + 40), Math.max(1, top / 2));
        const shell = probe?.closest('header, nav, [role="banner"], [role="navigation"]');
        return `${probe?.tagName.toLowerCase()}${probe?.getAttribute('data-testid') ? '[' + probe.getAttribute('data-testid') + ']' : ''} shell=${shell ? shell.tagName.toLowerCase() : 'none'} text="${((probe as HTMLElement)?.innerText ?? '').slice(0, 30)}"`;
      })(),
      updatingCount: (document.body.innerText.match(/Updating…/g) ?? []).length,
      firstHeadingY: (() => { const h = document.querySelector('[data-testid="canvas-layer-title"]'); return h ? Math.round(h.getBoundingClientRect().top * 10) / 10 : null; })(),
      barRows: (() => {
        if (!bar) return null;
        const tops: number[] = [];
        for (const c of Array.from(bar.children)) { if (!vis(c)) continue; const t = Math.round(c.getBoundingClientRect().top); if (!tops.some(x => Math.abs(x - t) < 6)) tops.push(t); }
        return tops.length;
      })(),
      titleInfo: shownInfo(q('canvas-title')),
      tagInfo: shownInfo(q('canvas-state')),
      versionShown: vis(q('canvas-version-picker')) || vis(q('canvas-version-label')) || vis(q('canvas-version-short')),
      backArrows: [...document.querySelectorAll('button[aria-label]')].filter(b => vis(b) && /^(go back|back to the conversation|back)$/i.test(b.getAttribute('aria-label') ?? '')).map(b => b.getAttribute('aria-label')),
      closeControls: [...document.querySelectorAll('button')].filter(b => vis(b) && /close thread|cancel/i.test(b.getAttribute('aria-label') ?? b.textContent ?? '')).map(b => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim()),
      panelText: ((q('thread-panel') ?? q('workspace-chat-pane') ?? q('workspace-chat-empty'))?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 700),
    };
  });
}
type Snap = Awaited<ReturnType<typeof snap>>;

/** Calls that matter to single checks (the mirror, the canvas function, the canvas send RPC), with the time and the status. */
const REQLOG: Array<{ t: number; vp: number; method: string; url: string; status: number }> = [];
const CONSOLE: Array<{ t: number; vp: number; text: string }> = [];
const HTTPERR: Array<{ t: number; vp: number; status: number; url: string }> = [];
const since = <T extends { t: number; vp: number }>(a: T[], t: number, vp: number) => a.filter(x => x.t >= t && x.vp === vp);

/** Every Supabase host the browsers talked to in this run (the proof of which project it was). */
const HOSTS = new Map<string, number>();

function attachWatchers(ctx: BrowserContext, vp: number, cur: { j: string }) {
  const log: Array<{ vp: number; j: string; kind: string; text: string }> = [];
  const add = (kind: string, text: string) => {
    const e = { vp, j: cur.j, kind, text: text.slice(0, 400) };
    log.push(e);
    fs.appendFileSync(`${DIR}/noise.jsonl`, JSON.stringify(e) + '\n');
  };
  ctx.on('page', p => {
    p.on('request', r => { try { const h = new URL(r.url()).hostname; if (/supabase\.co|sslip\.io/.test(h)) HOSTS.set(h, (HOSTS.get(h) ?? 0) + 1); } catch { /* ignore */ } });
    p.on('console', m => { if (m.type() === 'error') { add('console', m.text()); CONSOLE.push({ t: Date.now(), vp, text: m.text().slice(0, 200) }); } });
    p.on('pageerror', e => add('pageerror', String(e)));
    p.on('requestfailed', r => add('requestfailed', `${r.method()} ${r.url()} ${r.failure()?.errorText}`));
    p.on('response', r => {
      if (r.status() >= 400) { add('http' + r.status(), `${r.request().method()} ${r.url()}`); HTTPERR.push({ t: Date.now(), vp, status: r.status(), url: `${r.request().method()} ${r.url().replace(/apikey=[^&]+/, 'apikey=x')}`.slice(0, 200) }); }
      if (/mirror-reply|functions\/v1\/canvas-draft|rpc\/canvas_workspace_send/.test(r.url()) && !/availability/.test(r.request().postData() ?? '')) REQLOG.push({ t: Date.now(), vp, method: r.request().method(), url: r.url().split('/').slice(-1)[0], status: r.status() });
    });
  });
  return log;
}

async function newOwner(browser: Browser, vp: number, height: number, name: string, touch = false) {
  const user = await createTestUser({ name });
  const ctx = await browser.newContext({ viewport: { width: vp, height }, baseURL: BASE, ...(touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } });
  const cur = { j: 'setup' };
  attachWatchers(ctx, vp, cur);
  const page = await ctx.newPage();
  await setTestSession(page, user.email);
  return { user, ctx, page, cur };
}

async function toCanvasesTab(page: Page) {
  await page.goto('/artifacts');
  await page.getByRole('tab', { name: 'Canvases' }).click();
}

/** The composer of the thread, whichever pane it is in. */
function composerBox(page: Page) {
  return page.getByTestId('composer').getByRole('textbox').first();
}

async function sendText(page: Page, text: string) {
  const box = composerBox(page);
  await box.click();
  await box.fill(text);
  await page.locator('[data-composer-send]').first().click();
}

/** In-page 25ms sampler: every change of the Publish spot's state, and every moment a thread row shows nothing (a blank grey bubble). */
async function startLogs(page: Page, ownerName: string) {
  await page.evaluate((name) => {
    const w = window as unknown as { __log?: { stop: () => void } };
    w.__log?.stop();
    const t0 = performance.now();
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- Playwright's own route handler return
    const log = { spot: [] as Array<[number, string]>, blank: [] as Array<[number, number, number]>, stop: () => undefined as void };
    let last = '';
    let lastBlank = '';
    const timer = setInterval(() => {
      const t = Math.round(performance.now() - t0);
      const st = document.querySelector('[data-testid="publish-spot"]')?.getAttribute('data-state') ?? 'none';
      if (st !== last) { log.spot.push([t, st]); last = st; }
      let blank = 0; let skel = 0;
      for (const li of Array.from(document.querySelectorAll('[data-testid="thread-panel"] li[data-testid="message"], [data-testid="workspace-chat-pane"] li[data-testid="message"]'))) {
        const cardLike = li.querySelector('[data-testid^="attachment-"], [data-testid^="attach-card"], [class*="animate-pulse"], [data-testid*="skeleton"]');
        if (cardLike) { if (li.querySelector('[class*="animate-pulse"], [data-testid*="skeleton"]')) skel++; continue; }
        const txt = (li as HTMLElement).innerText.replace(/\s+/g, ' ').replace(name, '').replace(/\d{1,2}:\d{2}\s?(AM|PM)?/i, '').trim();
        if (txt === '') blank++;
      }
      const key = `${blank}/${skel}`;
      if (key !== lastBlank) { log.blank.push([t, blank, skel]); lastBlank = key; }
    }, 25);
    log.stop = () => clearInterval(timer);
    w.__log = log;
  }, ownerName);
}
async function readLogs(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __log?: { spot: Array<[number, string]>; blank: Array<[number, number, number]>; stop: () => void } };
    w.__log?.stop();
    return { spot: w.__log?.spot ?? [], blank: w.__log?.blank ?? [] };
  });
}

async function composerState(page: Page) {
  return page.evaluate(() => {
    const comp = document.querySelector('[data-testid="composer"]') as HTMLElement | null;
    if (!comp) return null;
    const btns = [...comp.querySelectorAll('button')].map(b => ({
      label: b.getAttribute('aria-label') || (b.textContent ?? '').trim().slice(0, 20), testid: b.getAttribute('data-testid'), send: b.hasAttribute('data-composer-send'),
      disabled: (b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true',
    }));
    return { text: comp.innerText.replace(/\s+/g, ' ').trim(), btns };
  });
}

async function boxText(page: Page): Promise<string> {
  const box = composerBox(page);
  return (await box.inputValue().catch(async () => (await box.textContent()) ?? '')) ?? '';
}

/** Does the owner's message that holds `snippet` carry its own author line (the owner's name)? */
async function ownerMsgAuthor(page: Page, snippet: string, name: string) {
  return page.evaluate(([sn, nm]) => [...document.querySelectorAll('li[data-testid="message"]')]
    .filter(l => (l as HTMLElement).innerText.includes(sn))
    .map(l => ({ hasAuthor: (l as HTMLElement).innerText.includes(nm), text: (l as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 110) })), [snippet, name]);
}

/** The spot's state changes between the first Updating and the final state, and which of them break the rule. */
function spotVerdict(spot: Array<[number, string]>) {
  const i = spot.findIndex(x => x[1] === 'updating');
  const after = i < 0 ? [] : spot.slice(i + 1);
  const last = after.length ? after[after.length - 1][1] : '';
  const bad = after.filter((x, k) => (x[1] === 'not-published') || (x[1] === 'loading') || (x[1] === 'no-changes' && k !== after.length - 1));
  return { sawUpdating: i >= 0, last, bad, text: spot.map(x => `${x[1]}@${x[0]}ms`).join(' → ') };
}

const OPENER = 'Give your mirror agent anything about your business: files, links, a few lines. It drafts your canvas.';

/** In-page 20ms sampler of the composer: [t, slot reads Updating…, the field's text, how many toasts, Upload-waits shown, Upload shown]. */
type ComposerRow = [number, boolean, string, number, boolean, boolean, string, boolean, string];
async function startComposerLog(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __clog?: { rows: ComposerRow[]; stop: () => void; tap?: number } };
    w.__clog?.stop();
    const t0 = performance.now();
    const rows: ComposerRow[] = [];
    const onDown = (e: Event) => { if ((e.target as Element | null)?.closest?.('[data-composer-send]') && w.__clog && w.__clog.tap === undefined) w.__clog.tap = Math.round(performance.now() - t0); };
    document.addEventListener('pointerdown', onDown, true);
    const timer = setInterval(() => {
      const comps = [...document.querySelectorAll('[data-testid="composer"]')] as HTMLElement[];
      const comp = comps.find(c => c.getBoundingClientRect().width > 0 && c.closest('[data-testid="thread-panel"]')) ?? comps.find(c => c.getBoundingClientRect().width > 0) ?? null;
      const tb = comp?.querySelector('textarea, [contenteditable="true"], [role="textbox"], input[type="text"]') as (HTMLInputElement | HTMLElement | null);
      const val = tb ? (typeof (tb as HTMLInputElement).value === 'string' ? (tb as HTMLInputElement).value : (tb.textContent ?? '')) : '';
      rows.push([Math.round(performance.now() - t0), !!comp && /Updating…/.test(comp.innerText), val, document.querySelectorAll('[data-sonner-toast]').length,
        !!document.querySelector('[data-testid="canvas-upload-waits"]'), !!document.querySelector('[data-testid="canvas-upload"]'),
        document.querySelector('[data-testid="publish-spot"]')?.getAttribute('data-state') ?? 'none',
        /Draft ready:|Updated:|I couldn.t update|I left out/.test((document.querySelector('[data-testid="thread-panel"]') as HTMLElement | null)?.innerText ?? ''),
        (document.querySelector('[data-sonner-toast]') as HTMLElement | null)?.innerText?.replace(/\s+/g, ' ').slice(0, 120) ?? '']);
    }, 20);
    w.__clog = { rows, stop: () => { clearInterval(timer); document.removeEventListener('pointerdown', onDown, true); } };
  });
}
async function readComposerLogFull(page: Page): Promise<{ rows: ComposerRow[]; tap: number | null }> {
  return page.evaluate(() => {
    const w = window as unknown as { __clog?: { rows: ComposerRow[]; stop: () => void; tap?: number } };
    w.__clog?.stop();
    return { rows: w.__clog?.rows ?? [], tap: w.__clog?.tap ?? null };
  });
}
async function readComposerLog(page: Page): Promise<ComposerRow[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __clog?: { rows: ComposerRow[]; stop: () => void } };
    w.__clog?.stop();
    return w.__clog?.rows ?? [];
  });
}
const composerVerdict = (rows: ComposerRow[]) => ({
  slotUpdatingFieldEmpty: rows.some(r => r[1] && r[2].trim() === ''),
  slotUpdatingFirstAt: rows.find(r => r[1])?.[0] ?? null,
  maxToasts: rows.reduce((m, r) => Math.max(m, r[3]), 0),
  uploadWaitsNoUpload: rows.some(r => r[4] && !r[5]),
  uploadBoth: rows.some(r => r[4] && r[5]),
  samples: rows.length,
});

/** The "This chat edits your draft" line and its Go to draft button (their own test ids), whichever tab the thread hides behind on a phone. */
async function draftLine(page: Page, wide: boolean) {
  if (!wide) { await page.getByTestId('workspace-view-chat').click().catch(() => undefined); await page.waitForTimeout(600); }
  const line = await page.getByTestId('workspace-draft-line').isVisible().catch(() => false);
  const goTo = await page.getByTestId('workspace-go-to-draft').isVisible().catch(() => false);
  const text = ((await page.getByTestId('workspace-draft-line').textContent().catch(() => '')) ?? '').trim();
  if (!wide) await page.getByTestId('workspace-view-canvas').click().catch(() => undefined);
  return { line, goTo, text };
}

/** The text of the thread pane, whichever tab it hides behind on a phone. */
async function _paneText(page: Page, wide: boolean): Promise<string> {
  if (!wide) { await page.getByTestId('workspace-view-chat').click().catch(() => undefined); await page.waitForTimeout(600); }
  const t = (await snap(page)).panelText;
  if (!wide) await page.getByTestId('workspace-view-canvas').click().catch(() => undefined);
  return t;
}

const THREAD_READS = /\/rest\/v1\/(canvas_drafts|chat_messages)\?.*thread_root_id=eq\./;
const DRAFT_THREAD_READ = /\/rest\/v1\/canvas_drafts\?.*thread_root_id=eq\./;

async function _waitSpot(page: Page, states: string[], timeout: number) {
  await expect.poll(async () => (await snap(page)).spotState, { timeout, intervals: [1000] }).toBeTruthy();
  await expect.poll(async () => states.includes((await snap(page)).spotState ?? ''), { timeout, intervals: [1000] }).toBe(true);
}


/** The owner's own anon-key client (what the app's client is), signed in with the test password. */
async function ownerApi(email: string) {
  const api = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await api.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`owner sign-in failed: ${error?.message}`);
  return { api, token: data.session.access_token };
}

/** The server's own answer: is canvas drafting on for this project (the same call the app makes)? */
async function draftingEnabled(token: string): Promise<{ enabled: boolean | null; raw: string }> {
  const res = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/canvas-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: process.env.VITE_SUPABASE_ANON_KEY! },
    body: JSON.stringify({ availability: true }),
  });
  const raw = await res.text();
  try { return { enabled: (JSON.parse(raw) as { enabled?: boolean }).enabled === true, raw }; } catch { return { enabled: null, raw: `${res.status} ${raw.slice(0, 100)}` }; }
}

/** SEEDED: stands in for a finished run. Points a run would have written, kept by the draft (service role). */
async function seedDraftPoints(ownerId: string, draftId: string, versionName: string, items: Array<[string, string]>) {
  for (const [box, statement] of items) {
    const { data, error } = await supabaseAdmin.from('points').insert({
      statement, first_validator_id: ownerId, visibility: 'private', tags: [], system_tags: [box, `canvas_${versionName}`],
    }).select('id').single();
    if (error) throw new Error(`seed point: ${error.message}`);
    const { error: e2 } = await supabaseAdmin.from('canvas_draft_points').insert({ draft_id: draftId, point_id: data.id });
    if (e2) throw new Error(`seed draft point: ${e2.message}`);
  }
}

const SEED_FIRST: Array<[string, string]> = [
  ['canvas:segments', 'Office managers at companies with 20 to 200 staff in Tallinn (Acme Test Bakery, SEEDED)'],
  ['canvas:problem', 'Offices order catering late and get cold, generic food (SEEDED)'],
  ['canvas:solution', 'A weekly standing order delivered fresh at 9am (SEEDED)'],
  ['canvas:revenue', '12 euros per person per week (SEEDED)'],
  ['canvas:metrics', 'Ten office customers signed by March (SEEDED)'],
];
const SEED_SECOND: Array<[string, string]> = [['canvas:channels', 'Direct emails to office managers (SEEDED)']];

/**
 * SEEDED clone: canvas_draft_open(p_from_version) is the legacy opener and does not copy the base (the v6 `_canvas_draft_new`, reached by the
 * first Send, does). So the draft is opened by the RPC and the base's points are given the draft's tag by the service role, which is what
 * `_canvas_draft_new` does ("the draft starts as its base"); then one new point is added to a box the base left empty.
 */
async function seedCloneDraft(api: SupabaseClient, ownerId: string, baseVersionId: string): Promise<{ id: string; version_name: string }> {
  const { data: base } = await supabaseAdmin.from('canvas_versions').select('name').eq('id', baseVersionId).single();
  const { error } = await api.rpc('canvas_draft_open', { p_from_version: baseVersionId });
  if (error) throw new Error(`canvas_draft_open from v1: ${error.message}`);
  const row = (await supabaseAdmin.from('canvas_drafts').select('id,version_name').eq('owner_id', ownerId).eq('state', 'open').eq('base_version_id', baseVersionId).limit(1).maybeSingle()).data!;
  const { data: pts } = await supabaseAdmin.from('points').select('id,system_tags').eq('first_validator_id', ownerId).contains('system_tags', [`canvas_${base!.name}`]);
  for (const pt of pts ?? []) {
    const { error: e } = await supabaseAdmin.from('points').update({ system_tags: [...(pt.system_tags as string[]), `canvas_${row.version_name}`] }).eq('id', pt.id);
    if (e) throw new Error(`tag base point: ${e.message}`);
  }
  await seedDraftPoints(ownerId, row.id, row.version_name, SEED_SECOND);
  return row;
}

const samples: Array<{ vp: number; label: string; s: Snap }> = [];

async function sample(page: Page, vp: number, label: string) {
  const s = await snap(page);
  samples.push({ vp, label, s });
  fs.appendFileSync(`${DIR}/samples.jsonl`, JSON.stringify({ vp, label, s }) + '\n');
  return s;
}

/** Only the buttons that are filled blue, minus the composer's round Send. */
/** The Publish spot's place relative to the bar: its right-edge gap, its top and its size. (An absolute x moves by the page scrollbar's 15px.) */
const spotSig = (s: Snap) => (s.barBox && s.spotBox ? { gap: Math.round(((s.barBox.x + s.barBox.w) - (s.spotBox.x + s.spotBox.w)) * 10) / 10, y: s.spotBox.y, w: s.spotBox.w, h: s.spotBox.h } : null);
const sameSig = (a: ReturnType<typeof spotSig>, b: ReturnType<typeof spotSig>) => !!a && !!b && (['gap', 'y', 'w', 'h'] as const).every(k => Math.abs(a[k] - b[k]) <= 1);
const primariesOf = (s: Snap) => s.blue.filter(n => n !== 'Send' && n !== 'Record a voice message');

async function walk(browser: Browser, vp: number, height: number) {
  const { user, ctx, page, cur } = await newOwner(browser, vp, height, `P1536 Walk ${vp}`);
  const wide = vp >= 1280;
  const J1 = wide ? 'J-W1' : 'J-W2';
  let canvasPath = '';
  let canvasName = '';
  let vName = '';
  let viaButton = false;
  let ownerSlug = user.slug;
  try {
    const { api, token } = await ownerApi(user.email);
    const avail = await draftingEnabled(token);
    const enabled = avail.enabled === true;
    rec(vp, 'env', 'canvas-draft availability on this server', enabled ? true : null, `POST {availability:true} answered ${avail.raw.slice(0, 120)}. ${enabled ? 'Real drafting runs.' : 'DRAFTING IS OFF: the New canvas button is not rendered, no Send can run. Cells that need a run are NOT REACHED and use SEEDED points (service role) where noted.'}`);
    const openRow = async () => (await supabaseAdmin.from('canvas_drafts').select('id,version_id,version_name,canvas_id,canvas_name,conversation_id,thread_root_id,revision').eq('owner_id', user.user.id).eq('state', 'open').order('created_at', { ascending: false }).limit(1).maybeSingle()).data;
    // ---------------------------------------------------------------- J-W1 / J-W2
    cur.j = J1;
    await step(vp, J1, 'artifacts-new-canvas', async () => {
      await toCanvasesTab(page);
      const btn = page.getByTestId('artifacts-new-canvas');
      const there = await btn.waitFor({ state: 'visible', timeout: enabled ? 30_000 : 8_000 }).then(() => true).catch(() => false);
      const f = await shot(page, vp, J1, 'artifacts-canvases-empty');
      rec(vp, J1, 'Artifacts Canvases tab shows New canvas', there, there ? '' : `NEW CANVAS BUTTON ABSENT (useCanvasDraftAvailability is not true: ${avail.raw.slice(0, 80)})`, f);
      if (there) {
        viaButton = true;
        await btn.click();
        await page.waitForURL(/\/p\/[^/]+\/canvas\/canvas(?:_\d+)?\?/, { timeout: 45_000 });
      } else {
        // FALLBACK (not the user's path): the same server call the button makes, then the workspace address.
        const { data, error } = await api.rpc('canvas_draft_open', { p_from_version: null });
        if (error) throw new Error(`canvas_draft_open: ${error.message}`);
        const d = data as { canvas_name: string };
        await page.goto(`/p/${user.slug}/canvas/${d.canvas_name}?ws=1`);
        rec(vp, J1, 'FALLBACK: canvas made through the canvas_draft_open RPC, opened by deep link ?ws=1', null, `canvas=${d.canvas_name}`, f);
      }
    });
    const s0 = await step(vp, J1, 'new-canvas-state', async () => {
      await expect(page.getByTestId('publish-spot')).toBeVisible({ timeout: 30_000 });
      const tSpot = Date.now();
      // The composer is usable before the canvas thread has read; a Send in that window is a known loss (see the probe finding), so
      // the walk waits for the opener (the panel's first read) like a patient person would, and records how long that took.
      const tOpener = await page.getByTestId('canvas-opener').waitFor({ state: 'visible', timeout: 30_000 }).then(() => Date.now() - tSpot).catch(() => -1);
      rec(vp, J1, 'the panel opener (first read) appears after the header', tOpener >= 0, `opener visible ${tOpener}ms after the Publish spot`);
      await page.waitForTimeout(800);
      const f = await shot(page, vp, J1, 'new-canvas-draft-empty');
      const s = await sample(page, vp, 'new-canvas-empty');
      const u = new URL(page.url());
      canvasPath = u.pathname;
      canvasName = canvasPath.split('/').pop()!;
      ownerSlug = canvasPath.split('/')[2];
      rec(vp, J1, 'path is /p/:handle/canvas/canvas_N with ws=1', /^\/p\/[^/]+\/canvas\/canvas(?:_\d+)?$/.test(u.pathname) && u.searchParams.get('ws') === '1', `${s.url}`, f);
      rec(vp, J1, 'header "Canvas N" + Draft (first canvas of an owner is named canvas, header reads Canvas)', /^Canvas(?: \d+)?$/.test(s.title ?? '') && s.state === 'Draft', `title=${s.title} state=${s.state}`, f);
      rec(vp, J1, 'rename pencil visible', s.rename, '', f);
      rec(vp, J1, 'boxes empty', s.points === 0, `points=${s.points}`, f);
      rec(vp, J1, 'spot "Not published yet"', s.spotText === 'Not published yet', `spot=${s.spotText} (${s.spotState})`, f);
      if (wide) rec(vp, J1, 'panel open, no Thread button', s.panel && !s.threadBtn, `panel=${s.panel} threadBtn=${s.threadBtn}`, f);
      else rec(vp, J1, 'opens on Thread tab with Canvas|Thread switcher', viaButton ? (s.switcher && s.panel && s.onThreadTab === true) : null, `${viaButton ? '' : 'NOT REACHED via the button (opened by deep link, which does not carry the new-canvas Thread-tab hint): '}switcher=${s.switcher} panel=${s.panel} onThreadTab=${s.onThreadTab}`, f);
      rec(vp, J1, 'Copy prompt visible and the ONE primary', enabled ? (s.copyPrompt && primariesOf(s).length === 1 && primariesOf(s)[0] === 'canvas-copy-prompt') : null, `${enabled ? '' : 'NOT REACHED: the opener and Copy prompt mount only while drafting is on (use-canvas-parts.tsx live=canvasOn===true); with it off the panel shows the plain thread and the empty root as a blank bubble. '}copyPrompt=${s.copyPrompt} blue=${JSON.stringify(s.blue)}`, f);
      rec(vp, J1, 'opener reads "Give your mirror agent anything about your business: files, links, a few lines. It drafts your canvas."', enabled ? s.panelText.includes(OPENER) : null, `panel text="${s.panelText.slice(0, 260)}"`, f);
      rec(vp, J1, 'no "Clarity Canvas" label in the header', !s.clarityCanvasText, `header text="${s.barText}"`, f);
      rec(vp, J1, 'OBSERVATION: the opener copy itself says "draft your Clarity Canvas"', null, `"Clarity Canvas" appears on the page (outside the header): ${s.clarityCanvasOnPage}`, f);
      rec(vp, J1, 'no blank grey message bubble in the thread', s.blankMessages === 0, `blankMessages=${s.blankMessages} (look at the screenshot too)`, f);
      rec(vp, J1, 'band above the header: owner bar top sits at the top of the viewport or under a real shell bar', s.barTop !== null && (s.barTop < 2 || /shell=(header|nav)/.test(s.aboveBar ?? '')), `bar top y=${s.barTop}px; ${s.aboveBar}`, f);
      rec(vp, J1, 'no Clone / Discard on an untouched empty draft', !s.clone, `clone=${s.clone} discard=${s.discard} (spec W6: Discard sits in the panel header beside the state)`, f);
      return s;
    });

    // unsent text kept across closing the panel (W1, 1440 only)
    if (wide) {
      await step(vp, J1, 'panel-close-reopen', async () => {
        const box = composerBox(page);
        await box.click();
        await box.fill('unsent words that must survive');
        await page.getByRole('button', { name: 'Close thread' }).click();
        await expect(page.getByTestId('thread-panel')).toBeHidden();
        const f1 = await shot(page, vp, J1, 'panel-closed');
        const s1 = await snap(page);
        rec(vp, J1, 'x closes the panel; Thread button appears; URL keeps ws=1', !s1.panel && s1.threadBtn && s1.url.includes('ws=1'), `panel=${s1.panel} threadBtn=${s1.threadBtn} url=${s1.url}`, f1);
        await page.getByTestId('workspace-thread-button').click();
        await expect(page.getByTestId('thread-panel')).toBeVisible();
        const f2 = await shot(page, vp, J1, 'panel-reopened');
        const kept = await composerBox(page).inputValue().catch(async () => (await composerBox(page).textContent()) ?? '');
        rec(vp, J1, 'Thread button reopens, unsent text kept', kept.includes('unsent words that must survive'), `composer="${kept.slice(0, 60)}"`, f2);
        await composerBox(page).fill('');
      });
    }

    // Send the first material: real model
    const pathBefore = canvasPath;
    if (!enabled) await step(vp, J1, 'send-material', async () => {
      rec(vp, J1, 'Send material -> Updating… -> boxes fill in place', null, 'NOT REACHED: drafting is off on this server, so no run can start. SEEDED: the draft is given 5 points by the service role (as a finished run would) and the page reloaded.');
      const row = await openRow();
      await seedDraftPoints(user.user.id, row!.id, row!.version_name, SEED_FIRST);
      await page.reload();
      await expect(page.getByTestId('publish-spot')).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(2500);
      const sD = await snap(page);
      const fD = await shot(page, vp, J1, 'seeded-run-done');
      await sample(page, vp, 'run-done-publish');
      rec(vp, J1, 'SEEDED: boxes show the points; spot is Publish (primary), Copy prompt secondary', sD.points > 0 && sD.spotState === 'publish' && primariesOf(sD).length === 1 && primariesOf(sD)[0] === 'canvas-draft-publish', `points=${sD.points} spot=${sD.spotState} blue=${JSON.stringify(sD.blue)} copyPrompt=${sD.copyPrompt}`, fD);
      rec(vp, J1, 'SEEDED: path unchanged', new URL(page.url()).pathname === pathBefore && page.url().includes('ws=1'), page.url(), fD);
    });
    if (enabled) await step(vp, J1, 'send-material', async () => {
      await startLogs(page, user.name);
      const tSend = Date.now();
      await sendText(page, MATERIAL);
      const t0 = Date.now();
      await expect.poll(async () => (await snap(page)).spotState, { timeout: 30_000, intervals: [100] }).toBe('updating').then(() => true).catch(() => false);
      const sU = await snap(page);
      const fU = await shot(page, vp, J1, 'updating');
      await sample(page, vp, 'updating');
      rec(vp, J1, 'spot shows Updating…', sU.spotText === 'Updating…', `spot=${sU.spotText} (${sU.spotState}) after ${Date.now() - t0}ms`, fU);
      rec(vp, J1, 'path unchanged while sending', new URL(page.url()).pathname === pathBefore, page.url(), fU);
      rec(vp, J1, 'Updating: no primary button other than Send', primariesOf(sU).length === 0, `blue=${JSON.stringify(sU.blue)} (W7: none)`, fU);
      // the send slot during the run (spec §2: status "Updating…" in the slot; the field keeps working; Send and Upload wait)
      const slot = await composerState(page);
      rec(vp, J1, 'during the run the send slot shows "Updating…"', !!slot && /Updating…/.test(slot.text), `composer="${slot?.text}" buttons=${JSON.stringify(slot?.btns)}`, fU);
      const box = composerBox(page);
      await box.click();
      await box.fill('kept while the run goes');
      const keptDuring = await boxText(page);
      const slot2 = await composerState(page);
      rec(vp, J1, 'during the run the field still accepts typing and keeps the text', keptDuring.includes('kept while the run goes'), `field="${keptDuring}"`, fU);
      rec(vp, J1, 'during the run Send waits (absent or disabled)', !!slot2 && slot2.btns.filter(b => b.send).every(b => b.disabled), `buttons=${JSON.stringify(slot2?.btns)}`, fU);
      rec(vp, J1, 'during the run Upload waits (absent or disabled)', !!slot2 && slot2.btns.filter(b => b.testid === 'canvas-upload').every(b => b.disabled), `buttons=${JSON.stringify(slot2?.btns)}`, fU);
      // follow the run to Publish (fine interval, in the page)
      await expect.poll(async () => (await snap(page)).spotState, { timeout: 240_000, intervals: [200] }).toBe('publish').catch(() => undefined);
      await page.waitForTimeout(600);
      const logs = await readLogs(page);
      const v = spotVerdict(logs.spot);
      const sD = await snap(page);
      const fD = await shot(page, vp, J1, 'run-done');
      await sample(page, vp, 'run-done-publish');
      rec(vp, J1, 'a real run started and finished (Updating… then Publish)', v.sawUpdating && v.last === 'publish', `${v.text} (${Math.round((Date.now() - tSend) / 1000)}s incl. checks)`, fD);
      rec(vp, J1, 'the spot never shows not-published or no-changes between Updating… and Publish (25ms sampler)', v.sawUpdating && v.bad.length === 0, `${v.text}`, fD);
      rec(vp, J1, 'boxes filled in place', sD.points > 0, `points=${sD.points}`, fD);
      rec(vp, J1, 'path never changed', new URL(page.url()).pathname === pathBefore && page.url().includes('ws=1'), page.url(), fD);
      rec(vp, J1, 'spot is Publish (primary), Copy prompt secondary', sD.spotState === 'publish' && primariesOf(sD).length === 1 && primariesOf(sD)[0] === 'canvas-draft-publish', `spot=${sD.spotState} blue=${JSON.stringify(sD.blue)} copyPrompt=${sD.copyPrompt}`, fD);
      const au = await ownerMsgAuthor(page, 'Acme Test Bakery sells sourdough', user.name);
      rec(vp, J1, "the owner's message after the opener has its own author line", au.length > 0 && au.every(m => m.hasAuthor), JSON.stringify(au), fD);
      // after the run the kept text is still there and can be sent
      const keptAfter = await boxText(page);
      const slot3 = await composerState(page);
      rec(vp, J1, 'after the run the kept text is still in the field and Send is available', keptAfter.includes('kept while the run goes') && !!slot3 && slot3.btns.some(b => b.send && !b.disabled), `field="${keptAfter}" buttons=${JSON.stringify(slot3?.btns)}`, fD);
      await startLogs(page, user.name);
      await page.locator('[data-composer-send]').first().click();
      const second = await expect.poll(async () => (await snap(page)).spotState, { timeout: 30_000, intervals: [100] }).toBe('updating').then(() => true).catch(() => false);
      await expect.poll(async () => (await snap(page)).spotState, { timeout: 240_000, intervals: [200] }).toMatch(/publish|no-changes/).catch(() => undefined);
      await page.waitForTimeout(500);
      const l2 = await readLogs(page);
      const v2 = spotVerdict(l2.spot);
      const fS = await shot(page, vp, J1, 'kept-text-sent');
      rec(vp, J1, 'the kept text can be sent after the run: a second real run', second && /publish|no-changes/.test(v2.last), v2.text, fS);
      rec(vp, J1, 'second run: no not-published between Updating… and the end', v2.bad.length === 0, v2.text, fS);
    });

    if (!wide && !enabled) rec(vp, J1, 'first reply box chips flip to Canvas', null, 'NOT REACHED: no run, so no first reply with box chips');
    if (!wide && enabled) {
      await step(vp, J1, 'reply-chips-flip-to-canvas', async () => {
        const panel = page.getByTestId('thread-panel');
        const f = await shot(page, vp, J1, 'first-reply-with-chips');
        const chips = panel.locator('[data-testid*="chip"], [data-testid*="box-link"], a[href*="#"], button').filter({ hasText: /Customer Segments|Problem|Solution|Offers|Unique|Milestone|Channels|Revenue|Values|Hypotheses|Positioning/i });
        const n = await chips.count();
        if (n === 0) { const txt = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400); rec(vp, J1, 'first reply box chips flip to Canvas', null, `NO CHIPS FOUND in the thread (spec: "box chips, if present"). thread text="${txt}"`, f); return; }
        await chips.first().click();
        await page.waitForTimeout(600);
        const s = await snap(page);
        const f2 = await shot(page, vp, J1, 'after-chip-tap');
        rec(vp, J1, 'first reply box chips flip to Canvas', s.onThreadTab === false, `chips=${n} onThreadTab=${s.onThreadTab} url=${s.url}`, f2);
        // back to the thread for the rest of the flow
        await page.getByTestId('workspace-view-chat').click().catch(() => undefined);
      });
    }

    // Publish
    await step(vp, J1, 'publish', async () => {
      await expect(page.getByTestId('canvas-draft-publish')).toBeVisible();
      const before = await snap(page);
      const spotBefore = before.spotBox;
      await page.getByTestId('canvas-draft-publish').click();
      const toast = page.locator('[data-sonner-toast]').filter({ hasText: /Published v/ }).first();
      await toast.waitFor({ timeout: 60_000 }).catch(() => undefined);
      const toastText = ((await toast.textContent().catch(() => '')) ?? '').trim();
      const fT = await shot(page, vp, J1, 'publish-toast', 900);
      await expect.poll(() => new URL(page.url()).searchParams.get('ws'), { timeout: 30_000 }).toBeNull();
      await page.waitForTimeout(1200);
      const s = await sample(page, vp, 'published-v1');
      const f = await shot(page, vp, J1, 'published-v1');
      const u = new URL(page.url());
      rec(vp, J1, 'toast "Published v1…"', /Published v1/.test(toastText), `toast="${toastText.slice(0, 120)}"`, fT);
      vName = u.searchParams.get('v') ?? '';
      rec(vp, J1, 'same path, ?v=<version>, no ws=1', u.pathname === pathBefore && vName !== '' && !u.searchParams.has('ws'), `${s.url} (spec says "?v=v1-style"; the address carries the version's immutable internal name "${vName}", the display label is v1)`, f);
      rec(vp, J1, 'panel closed, no Thread button, no switcher', !s.panel && !s.threadBtn && !s.switcher, `panel=${s.panel} threadBtn=${s.threadBtn} switcher=${s.switcher}`, f);
      rec(vp, J1, 'header Published', s.state === 'Published' || (!wide && /Published/.test(s.barText ?? '')), `state=${s.state} bar="${s.barText}"`, f);
      rec(vp, J1, 'spot "Published · v1"', s.spotText === 'Published · v1', `spot=${s.spotText}`, f);
      rec(vp, J1, 'Clone shown, Share shown, no Discard', enabled ? (s.clone && s.share && !s.discard) : (s.share && !s.discard ? null : false), `${enabled ? '' : 'Clone NOT REACHED (not rendered while drafting is off); Share/Discard checked: '}clone=${s.clone} share=${s.share} discard=${s.discard}`, f);
      rec(vp, J1, 'Publish spot did not move or resize (±1px)', !!spotBefore && !!s.spotBox && Math.abs(spotBefore.x + spotBefore.w - (s.spotBox.x + s.spotBox.w)) <= 1 && Math.abs(spotBefore.w - s.spotBox.w) <= 1 && Math.abs(spotBefore.h - s.spotBox.h) <= 1, `before=${JSON.stringify(spotBefore)} after=${JSON.stringify(s.spotBox)}`, f);
      rec(vp, J1, 'published view: no primary', primariesOf(s).length === 0, `blue=${JSON.stringify(s.blue)}`, f);
      rec(vp, J1, 'no horizontal overflow', s.scrollWidth <= s.innerWidth, `scrollWidth=${s.scrollWidth} innerWidth=${s.innerWidth}`, f);
    });

    // ---------------------------------------------------------------- J-W3
    cur.j = 'J-W3';
    const v1Url = new URL(page.url());
    if (!enabled) rec(vp, 'J-W3', 'Clone on published v1 (pending state, x cancels, Clone again)', null, 'NOT REACHED: the Clone button is not rendered (canvas-clone-button.tsx returns null unless the server says drafting is on). The pending-Clone cells (same path + ws=1, empty thread, "New draft from v1", "No changes yet", nothing written, x cancels) were not exercised.');
    if (enabled) await step(vp, 'J-W3', 'clone', async () => {
      await page.getByTestId('canvas-clone').click();
      await expect.poll(() => new URL(page.url()).searchParams.get('ws'), { timeout: 20_000 }).toBe('1');
      await page.waitForTimeout(1500);
      const s = await sample(page, vp, 'clone-pending');
      const f = await shot(page, vp, 'J-W3', 'clone-pending');
      const u = new URL(page.url());
      const text = await page.locator('[data-testid="workspace-chat-pane"], [data-testid="thread-panel"], [data-testid="workspace-chat-empty"]').first().innerText().catch(() => '');
      rec(vp, 'J-W3', 'same path + ws=1', u.pathname === v1Url.pathname, s.url, f);
      rec(vp, 'J-W3', 'thread empty with "Clone v1. Nothing changes for readers until you publish."', /Clone v1\. Nothing changes for readers until you publish\./.test(text), `thread="${text.replace(/\s+/g, ' ').slice(0, 160)}"`, f);
      rec(vp, 'J-W3', wide ? 'header "[v1 ▾] New draft from v1"' : '375 header: a v1 label and "New draft" (the tail "from v1" gives way on a phone)', wide ? /New draft from v1/.test(s.barText ?? '') : (/New draft/.test(s.barText ?? '') && s.versionShown), `bar="${s.barText}" picker="${s.pickerText}" versionShown=${s.versionShown}`, f);
      rec(vp, 'J-W3', 'spot "No changes yet"', s.spotText === 'No changes yet', `spot=${s.spotText}`, f);
      rec(vp, 'J-W3', 'no Discard; no Clone', !s.discard && !s.clone, `discard=${s.discard} clone=${s.clone}`, f);
      rec(vp, 'J-W3', 'nothing written (no open draft row)', true, 'checked below', f);
      const { count } = await supabaseAdmin.from('canvas_drafts').select('id', { count: 'exact', head: true }).eq('owner_id', user.user.id).eq('state', 'open');
      rec(vp, 'J-W3', 'nothing written on Clone (0 open drafts in DB)', (count ?? -1) === 0, `open drafts=${count}`, f);
      rec(vp, 'J-W3', 'pending header shows [v1 ▾] or the v1 label', s.versionShown, `picker="${s.pickerText}" versionShown=${s.versionShown} bar="${s.barText}"`, f);
      rec(vp, 'J-W3', 'pending: the thread has no onboarding and no Copy prompt', !s.copyPrompt && !/Want to save time|Give your mirror agent|Copy prompt/.test(s.panelText), `copyPrompt=${s.copyPrompt} panel="${s.panelText.slice(0, 200)}"`, f);
      rec(vp, 'J-W3', 'pending: the panel has a × (or Cancel) to cancel', s.closeControls.length > 0, `controls=${JSON.stringify(s.closeControls)} backArrows=${JSON.stringify(s.backArrows)}`, f);
      rec(vp, 'J-W3', 'pending: exactly one back arrow in Thread view', wide ? null : s.backArrows.length === 1, `backArrows=${JSON.stringify(s.backArrows)} (visible buttons labelled back)`, f);
      rec(vp, 'J-W3', `pending header @${vp}: at most two rows; name not one letter`, (s.barRows ?? 9) <= 2 && (s.titleInfo ? s.titleInfo.inside >= 3 || !s.titleInfo.clipped : false), `rows=${s.barRows} name=${JSON.stringify(s.titleInfo)} tag=${JSON.stringify(s.tagInfo)} barH=${s.barBox?.h}`, f);
      if (wide) rec(vp, 'J-W3', 'panel open at 1440', s.panel, '', f);
      else rec(vp, 'J-W3', 'OBSERVATION 375: Clone opens on the Thread tab (W1 says everything but a new canvas opens on Canvas; W3 says the thread opens empty)', null, `onThreadTab=${s.onThreadTab} panel=${s.panel}`, f);
    });
    // x cancels back to the published view
    if (enabled) await step(vp, 'J-W3', 'cancel-x', async () => {
      if (!wide) { await page.getByTestId('workspace-view-chat').click(); await page.waitForTimeout(500); await shot(page, vp, 'J-W3', 'clone-pending-thread-tab'); }
      const closer = page.getByRole('button', { name: /Close thread|Cancel/i }).first();
      if (await closer.isVisible().catch(() => false)) {
        rec(vp, 'J-W3', 'cancel the pending Clone with the panel × / Cancel', true, `used "${await closer.getAttribute('aria-label') ?? await closer.textContent()}"`);
        await closer.click();
      } else {
        const back = page.getByRole('button', { name: 'Back to the conversation' });
        if (!(await back.isVisible().catch(() => false))) { rec(vp, 'J-W3', 'a way to cancel the Clone from the Thread view', false, 'no × / Cancel / back arrow visible'); return; }
        rec(vp, 'J-W3', 'cancel the pending Clone with the panel × / Cancel', false, 'no × or Cancel visible; only the back arrow');
        await back.click();
      }
      await page.waitForTimeout(1500);
      const s = await snap(page);
      const f = await shot(page, vp, 'J-W3', 'after-cancel');
      rec(vp, 'J-W3', 'x cancels: back to the published view (no ws=1), Clone shown', !s.url.includes('ws=1') && s.clone, `url=${s.url} clone=${s.clone} panel=${s.panel}`, f);
    });
    // Clone again; first Send creates the draft
    if (!enabled) await step(vp, 'J-W3', 'clone-again-first-send', async () => {
      rec(vp, 'J-W3', 'Clone again, first Send creates the draft', null, 'NOT REACHED: the first Send needs a run (drafting is off). FALLBACK: the draft is opened by the canvas_draft_open RPC from v1 (what the first Send starts from; the legacy opener does not copy the base, so the base points are tagged into the draft by the service role) and given 1 SEEDED point in a new box.');
      const { data: pubRow } = await supabaseAdmin.from('canvas_drafts').select('version_id').eq('owner_id', user.user.id).eq('state', 'published').limit(1).maybeSingle();
      await seedCloneDraft(api, user.user.id, pubRow!.version_id);
      // (a) the literal W0 address, bare ?ws=1: what does an owner with a published v1 AND an open draft land on?
      await page.goto(`${v1Url.pathname}?ws=1`);
      await expect(page.getByTestId('publish-spot')).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(2500);
      const sb = await snap(page);
      const fb = await shot(page, vp, 'J-W3', 'bare-ws1-with-open-draft');
      rec(vp, 'J-W3', 'bare ?ws=1 with a published v1 and an open draft ends on the draft (state Draft)', /^Draft/.test(sb.state ?? ''), `lands on url=${sb.url} state=${sb.state} spot=${sb.spotText}`, fb);
      // (b) the address the Drafts row itself builds
      const dRow = await openRow();
      await page.goto(`${v1Url.pathname}?v=${dRow!.version_name}&ws=1`);
      await expect(page.getByTestId('publish-spot')).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(2500);
      const s = await sample(page, vp, 'clone-draft-after-send');
      const f = await shot(page, vp, 'J-W3', 'draft-from-v1-seeded');
      rec(vp, 'J-W3', 'SEEDED draft from v1: header Draft, Clone gone, Publish offered', s.state === 'Draft' && !s.clone && s.spotState === 'publish', `state=${s.state} clone=${s.clone} spot=${s.spotText}/${s.spotState} bar="${s.barText}" discard=${s.discard}`, f);
      rec(vp, 'J-W3', 'SEEDED draft from v1: ws=1 kept, header names "from v1" (spec: "Draft · from v1")', s.url.includes('ws=1') && /from v1/i.test(s.barText ?? ''), `url=${s.url} bar="${s.barText}"`, f);
    });
    if (enabled) await step(vp, 'J-W3', 'clone-again-first-send', async () => {
      if (!(await page.getByTestId('canvas-clone').isVisible().catch(() => false))) { await page.goto(`${v1Url.pathname}?v=${vName}`); await expect(page.getByTestId('canvas-clone')).toBeVisible(); }
      await page.getByTestId('canvas-clone').click();
      await expect.poll(() => new URL(page.url()).searchParams.get('ws'), { timeout: 20_000 }).toBe('1');
      if (!wide) await page.getByTestId('workspace-view-chat').click();
      await page.getByText(/Clone v\d+\. Nothing changes for readers/).waitFor({ timeout: 30_000 }).catch(() => undefined);
      await startLogs(page, user.name);
      await startComposerLog(page);
      const tClone = Date.now();
      await sendText(page, SECOND);
      const t0 = Date.now();
      await expect.poll(async () => (await snap(page)).spotState, { timeout: 30_000, intervals: [100] }).toBe('updating').catch(() => undefined);
      await shot(page, vp, 'J-W3', 'first-send-updating');
      await expect.poll(async () => (await snap(page)).spotState, { timeout: 240_000, intervals: [200] }).toMatch(/publish|no-changes/).catch(() => undefined);
      await page.waitForTimeout(1000);
      const logs = await readLogs(page);
      const cl = composerVerdict(await readComposerLog(page));
      const s = await sample(page, vp, 'clone-draft-after-send');
      const f = await shot(page, vp, 'J-W3', 'draft-after-first-send');
      const { data: drafts } = await supabaseAdmin.from('canvas_drafts').select('id,state,version_name,conversation_id,thread_root_id').eq('owner_id', user.user.id).eq('state', 'open');
      rec(vp, 'J-W3', 'first Send creates the draft (1 open draft)', (drafts?.length ?? 0) === 1, `drafts=${JSON.stringify(drafts)} run ${Math.round((Date.now() - t0) / 1000)}s spot=${s.spotText}`, f);
      rec(vp, 'J-W3', 'header Draft; Clone gone; Discard in the panel header', /^Draft/.test(s.state ?? '') && !s.clone && (s.discard || !wide), `state=${s.state} clone=${s.clone} discard=${s.discard} bar="${s.barText}"`, f);
      rec(vp, 'J-W3', 'ws=1 kept', s.url.includes('ws=1'), s.url, f);
      const ph = (await page.getByTestId('thread-panel').locator('header').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
      rec(vp, 'J-W3', wide ? 'header reads "Draft · from v1" on the clone\'s draft (1440 wireframe)' : '375: header row 1 reads "Draft" only (375 wireframe has no "from")', wide ? /Draft\s*·\s*from v1/.test(s.barText ?? '') : null, `bar="${s.barText}"`, f);
      rec(vp, 'J-W3', 'thread panel header reads "Draft · vN"', /Draft\s*·\s*v\d+/.test(ph), `panel header="${ph}" panelVisible=${s.panel}`, f);
      rec(vp, 'J-W3', 'no blank message bubble in the thread', s.blankMessages === 0, `blankMessages=${s.blankMessages}`, f);
      // re-checks of the fixes
      rec(vp, 'J-W3', "during the Clone's first Send, canvas-upload-waits shows and canvas-upload is gone (20ms sampler)", cl.uploadWaitsNoUpload && !cl.uploadBoth, `uploadWaitsShownWithoutUpload=${cl.uploadWaitsNoUpload} uploadAndWaitsTogether=${cl.uploadBoth} samples=${cl.samples}`, f);
      rec(vp, 'J-W3', "the Clone's first Send shows no toast", cl.maxToasts === 0, `max toasts=${cl.maxToasts}`, f);
      const mr = since(REQLOG, tClone, vp).filter(r => /mirror-reply/.test(r.url));
      const ce = since(CONSOLE, tClone, vp);
      rec(vp, 'J-W3', "the Clone's first Send makes no mirror-reply request and no console error", mr.length === 0 && ce.length === 0, `mirror-reply=${JSON.stringify(mr.map(r => r.status))} console=${JSON.stringify(ce.map(c => c.text.slice(0, 80)))} canvas calls=${JSON.stringify(since(REQLOG, tClone, vp).map(r => `${r.url}:${r.status}`))}`, f);
      const vc = spotVerdict(logs.spot);
      rec(vp, 'J-W3', 'the clone run: no not-published / mid-run no-changes between Updating… and the end (25ms sampler)', vc.sawUpdating && vc.bad.length === 0, vc.text, f);
      const blankSamples = logs.blank.filter(b => b[1] > 0);
      rec(vp, 'J-W3', "no blank grey bubble after the Clone's first Send (25ms sampler: a card or a card-shaped skeleton only)", blankSamples.length === 0, `blank/skeleton changes=${JSON.stringify(logs.blank)}`, f);
      rec(vp, 'J-W3', "the Clone's thread has no onboarding and no Copy prompt after its first Send", !s.copyPrompt && !/Want to save time|Give your mirror agent|Copy prompt/.test(s.panelText), `copyPrompt=${s.copyPrompt} panel="${s.panelText.slice(0, 220)}"`, f);
      const au = await ownerMsgAuthor(page, 'gluten-free line', user.name);
      rec(vp, 'J-W3', "OBSERVATION: in the Clone's thread (no opener) the owner's message follows the root card of the same author and shares its author line", null, JSON.stringify(au), f);
      rec(vp, 'J-W3', 'one back arrow in Thread view (draft)', wide ? null : s.backArrows.length === 1, `backArrows=${JSON.stringify(s.backArrows)} onThreadTab=${s.onThreadTab}`, f);
    });
    // the header with a version picker present, at the native width (and at a real 320 from the 1440 walk), with a realistic name
    if (enabled) await step(vp, 'J-W3', 'draft-header-measure', async () => {
      const a = await snap(page);
      rec(vp, 'J-W3', `draft header @${vp} with a picker, name "Canvas": rows, name and state tag`, (a.barRows ?? 9) <= 2, `rows=${a.barRows} barH=${a.barBox?.h} name=${JSON.stringify(a.titleInfo)} tag=${JSON.stringify(a.tagInfo)} picker="${a.pickerText}"`);
      await page.getByTestId('canvas-rename').click();
      await page.getByTestId('canvas-title-input').fill('Acme Bakery Plan');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
      const b = await snap(page);
      const fb = await shot(page, vp, 'J-W3', 'draft-with-picker-named');
      rec(vp, 'J-W3', `draft header @${vp}, name "Acme Bakery Plan" with a picker: the name stays usable (3+ characters or whole), at most two rows`, !!b.titleInfo && (b.titleInfo.inside >= 3 || !b.titleInfo.clipped) && (b.barRows ?? 9) <= 2, `rows=${b.barRows} barH=${b.barBox?.h} name=${JSON.stringify(b.titleInfo)} tag=${JSON.stringify(b.tagInfo)} picker="${b.pickerText}" bar="${b.barText}"`, fb);
      rec(vp, 'J-W3', `draft header @${vp}: what the state tag really shows`, null, `tag=${JSON.stringify(b.tagInfo)}`, fb);
    });
    // a bare ?ws=1 with a published v1 and an open draft ends on the draft; an explicit ?v=<published>&ws=1 still shows the published view
    if (enabled) await step(vp, 'J-W3', 'bare-ws1', async () => {
      const dRow = await openRow();
      await page.goto(`${v1Url.pathname}?ws=1`);
      await expect.poll(() => page.url(), { timeout: 30_000, intervals: [300] }).toContain(`v=${dRow!.version_name}`).catch(() => undefined);
      await page.waitForTimeout(2500);
      const a1 = await snap(page);
      const l1 = await draftLine(page, wide);
      const fa = await shot(page, vp, 'J-W3', 'bare-ws1-lands-on-draft');
      rec(vp, 'J-W3', 'bare ?ws=1 with a published v1 and an open draft ends on the draft: ?v=<draft>&ws=1, state Draft', a1.url.includes(`v=${dRow!.version_name}`) && a1.url.includes('ws=1') && /^Draft/.test(a1.state ?? ''), `url=${a1.url} state=${a1.state} spot=${a1.spotText}`, fa);
      rec(vp, 'J-W3', 'bare ?ws=1: the "This chat edits your draft" line (workspace-draft-line) is not shown', !l1.line && !l1.goTo, `line=${l1.line} goToDraft=${l1.goTo}`, fa);
      await page.goto(`${v1Url.pathname}?v=${vName}&ws=1`);
      await expect.poll(async () => (await snap(page)).spotText, { timeout: 30_000, intervals: [300] }).toBe('Published · v1').catch(() => undefined);
      await page.waitForTimeout(2000);
      const b1 = await snap(page);
      const l2 = await draftLine(page, wide);
      const fb = await shot(page, vp, 'J-W3', 'explicit-published-ws1');
      rec(vp, 'J-W3', 'an explicit ?v=<published>&ws=1 still shows the published view with the line and Go to draft', b1.spotText === 'Published · v1' && l2.line && l2.goTo, `url=${b1.url} spot=${b1.spotText} line=${l2.line} "${l2.text}" goToDraft=${l2.goTo}`, fb);
      await page.goto(`${v1Url.pathname}?ws=1`);
      await expect.poll(() => page.url(), { timeout: 30_000, intervals: [300] }).toContain(`v=${dRow!.version_name}`).catch(() => undefined);
      await page.waitForTimeout(1500);
      await page.getByTestId('canvas-version-select').selectOption(vName);
      await expect.poll(async () => (await snap(page)).spotText, { timeout: 25_000, intervals: [400] }).toBe('Published · v1').catch(() => undefined);
      await page.waitForTimeout(3000);
      const c1 = await snap(page);
      const fc = await shot(page, vp, 'J-W3', 'picked-v1-stays');
      rec(vp, 'J-W3', 'picking v1 from the picker afterwards stays on v1 (no bounce back to the draft)', c1.url.includes(`v=${vName}`) && c1.spotText === 'Published · v1', `url=${c1.url} spot=${c1.spotText}`, fc);
      if (!(c1.url.includes(`v=${vName}`) && c1.spotText === 'Published · v1')) {
        // CAPTURE for a failure that has recurred: does the page recover by itself, what does it show, does a reload fix it
        const t0 = Date.now();
        const recoveredAfter = await expect.poll(async () => (await snap(page)).spotText, { timeout: 40_000, intervals: [500] }).toBe('Published · v1').then(() => Date.now() - t0).catch(() => null);
        const st = await page.evaluate(() => ({ picker: (document.querySelector('[data-testid="canvas-version-select"]') as HTMLSelectElement | null)?.selectedOptions[0]?.textContent ?? null, pulses: document.querySelectorAll('[class*="animate-pulse"]').length, url: location.href, bar: (document.querySelector('[data-testid="canvas-owner-bar"]') as HTMLElement | null)?.innerText?.replace(/\s+/g, ' ') ?? null }));
        const fs2 = await shot(page, vp, 'J-W3', 'picked-v1-stuck-after-40s');
        rec(vp, 'J-W3', 'CAPTURE: after the failed "picking v1" the page recovered by itself within 40s more', null, `recoveredAfter=${recoveredAfter}ms; picker shows="${st.picker}"; skeleton pulses=${st.pulses}; url=${st.url}; bar="${st.bar}"`, fs2);
        await page.reload();
        await page.waitForTimeout(6000);
        const c3 = await snap(page);
        const fr = await shot(page, vp, 'J-W3', 'picked-v1-after-reload');
        rec(vp, 'J-W3', 'CAPTURE: after a reload of that address', null, `url=${c3.url} spot=${c3.spotText} state=${c3.state} points=${c3.points}`, fr);
      }
    });

    // ---------------------------------------------------------------- J-W4 (a draft is open now)
    cur.j = 'J-W4';
    await step(vp, 'J-W4', 'drafts-tab', async () => {
      await toCanvasesTab(page);
      await page.getByRole('button', { name: 'Drafts' }).or(page.getByRole('tab', { name: 'Drafts' })).first().click();
      await page.waitForTimeout(1500);
      const f = await shot(page, vp, 'J-W4', 'canvases-drafts-list');
      const rows = await page.getByTestId('artifact-row').allInnerTexts();
      rec(vp, 'J-W4', 'Drafts tab lists the canvas with an open draft', rows.length >= 1, `rows=${JSON.stringify(rows.map(r => r.replace(/\s+/g, ' ')))}`, f);
      await page.getByTestId('artifact-row').first().getByRole('link').first().click();
      await page.waitForURL(/\/canvas\/canvas(?:_\d+)?/, { timeout: 20_000 });
      await page.waitForTimeout(2000);
      const s = await snap(page);
      const f2 = await shot(page, vp, 'J-W4', 'draft-row-opened');
      rec(vp, 'J-W4', 'row opens ?ws=1', s.url.includes('ws=1'), s.url, f2);
      if (wide) rec(vp, 'J-W4', 'on Canvas, panel open at 1440', s.panel, `panel=${s.panel}`, f2);
      else rec(vp, 'J-W4', 'on Canvas tab at 375 (not Thread)', s.switcher && s.onThreadTab === false, `switcher=${s.switcher} onThreadTab=${s.onThreadTab}`, f2);
    });
    await step(vp, 'J-W4', 'mine-tab', async () => {
      await toCanvasesTab(page);
      await page.getByRole('button', { name: 'Mine' }).or(page.getByRole('tab', { name: 'Mine' })).first().click();
      await page.waitForTimeout(1500);
      const f = await shot(page, vp, 'J-W4', 'canvases-mine-list');
      const rows = await page.getByTestId('artifact-row').allInnerTexts();
      const badge = await page.getByTestId('artifact-badge').allInnerTexts();
      rec(vp, 'J-W4', 'Mine lists the published canvas with a "Draft open" badge', rows.length === 1 && badge.some(b => /Draft open/i.test(b)), `rows=${JSON.stringify(rows.map(r => r.replace(/\s+/g, ' ')))} badges=${JSON.stringify(badge)}`, f);
      await page.getByTestId('artifact-row').first().getByRole('link').first().click();
      await page.waitForURL(/\/canvas\/canvas(?:_\d+)?/, { timeout: 20_000 });
      await page.waitForTimeout(2000);
      const s = await snap(page);
      const f2 = await shot(page, vp, 'J-W4', 'mine-row-opened');
      rec(vp, 'J-W4', 'Mine opens the published view (no ws=1, no panel)', !s.url.includes('ws=1') && !s.panel && !s.switcher, `url=${s.url} panel=${s.panel} switcher=${s.switcher} state=${s.state}`, f2);
    });

    // ---------------------------------------------------------------- J-W5
    cur.j = 'J-W5';
    let allDrafts: Array<{ id: string; state: string; version_name: string; conversation_id: string; thread_root_id: string; canvas_name: string }> | null = null;
    for (let attempt = 0; attempt < 4 && !allDrafts; attempt++) {
      const r = await supabaseAdmin.from('canvas_drafts').select('id,state,version_name,conversation_id,thread_root_id,canvas_name').eq('owner_id', user.user.id);
      if (r.error) { rec(vp, 'J-W5', 'fixture read retry', null, `attempt ${attempt + 1}: ${r.error.message}`); await new Promise(res => setTimeout(res, 2000)); } else allDrafts = r.data;
    }
    const openDraft = allDrafts?.find(d => d.state === 'open');
    const pubDraft = allDrafts?.find(d => d.state === 'published');
    rec(vp, 'J-W5', 'fixture: one open and one published draft thread', !!openDraft && !!pubDraft, JSON.stringify(allDrafts));
    // a never-published new canvas draft too (through the real New canvas button), so the mirror chat holds a card whose version is a Draft
    await step(vp, 'J-W5', 'second-new-canvas', async () => {
      await toCanvasesTab(page);
      await page.getByTestId('artifacts-new-canvas').click();
      await page.waitForURL(/\/canvas\/canvas_2/, { timeout: 45_000 });
      await page.waitForTimeout(1500);
      const sN = await snap(page);
      const fN = await shot(page, vp, 'J-W5', 'second-new-canvas');
      rec(vp, 'J-W5', 'fixture: a second, never-published canvas draft (New canvas button)', sN.url.includes('canvas_2') && sN.url.includes('ws=1'), sN.url, fN);
      rec(vp, 'J-W5', 'no blank message bubble in the new canvas thread', sN.blankMessages === 0, `blankMessages=${sN.blankMessages}`, fN);
    });
    await step(vp, 'J-W5', 'mirror-chat-cards', async () => {
      await page.goto('/feed');
      const nav = page.getByRole('link', { name: 'Chats' }).first();
      if (await nav.isVisible().catch(() => false)) await nav.click(); else await page.goto('/chats');
      await page.waitForTimeout(2000);
      const f0 = await shot(page, vp, 'J-W5', 'chats-list');
      await page.getByText('Your mirror agent').first().waitFor({ timeout: 40_000 });
      await page.getByText('Your mirror agent').first().click();
      await expect.poll(async () => page.getByTestId('attachment-canvas_version').count(), { timeout: 40_000, intervals: [500] }).toBeGreaterThan(0).catch(() => undefined);
      await page.waitForTimeout(1500);
      const f = await shot(page, vp, 'J-W5', 'mirror-chat-cards');
      const cards = page.getByTestId('attachment-canvas_version');
      const texts = (await cards.allInnerTexts()).map(t => t.replace(/\s+/g, ' '));
      const states = await cards.evaluateAll(els => els.map(e => e.getAttribute('data-state')));
      const clipped = await cards.getByTestId('canvas-version-state').evaluateAll(els => els.map(e => ({ text: e.textContent, clipped: (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth })));
      rec(vp, 'J-W5', 'one card per thread root (3 expected: published, update draft, new draft)', texts.length === 3, `cards=${JSON.stringify(texts)} states=${JSON.stringify(states)}`, f0 && f);
      rec(vp, 'J-W5', 'a card names its state as "Canvas N · vN · Draft|Published" (spec wording)', texts.some(t => /Draft/.test(t)) && texts.some(t => /Published/.test(t)), `cards=${JSON.stringify(texts)}`, f);
      rec(vp, 'J-W5', 'the state word is fully readable (not clipped by an ellipsis)', clipped.every(c => !c.clipped), `state lines=${JSON.stringify(clipped)}`, f);
      for (let i = 0; i < texts.length; i++) {
        await page.goto(page.url());
        await page.waitForTimeout(2500);
        const c = page.getByTestId('attachment-canvas_version').nth(i);
        const label = (await c.innerText()).replace(/\s+/g, ' ');
        await c.getByTestId('canvas-card-open').or(c.getByRole('button', { name: /^Open/ })).or(c.getByRole('link', { name: /^Open/ })).first().click();
        await page.waitForTimeout(3500);
        const sO = await snap(page);
        const fO = await shot(page, vp, 'J-W5', `card-${i}-open`);
        rec(vp, 'J-W5', `card ${i + 1} "${label.slice(0, 50)}": Open lands where its version resolves`, null, `url=${sO.url} state=${sO.state} panel=${sO.panel} switcher=${sO.switcher} spot=${sO.spotText} (for a Draft card the spec says ?ws=1 on Canvas, as J-W4; for Published, ?v=<version> with no ws=1)`, fO);
        const isDraft = /Draft/.test(label);
        if (isDraft) rec(vp, 'J-W5', `Draft card Open lands on ?ws=1, as J-W4`, sO.url.includes('ws=1') && (wide ? sO.panel : sO.switcher), `url=${sO.url} panel=${sO.panel} switcher=${sO.switcher}`, fO);
        else rec(vp, 'J-W5', `Published card whose canvas has an open draft: Open lands in the workspace (W1: a card's Open lands in workspace mode only when a draft is open)`, sO.url.includes('ws=1') && /Draft/.test(sO.state ?? ''), `url=${sO.url} state=${sO.state} panel=${sO.panel} switcher=${sO.switcher} (the card says Published but Open shows the Draft)`, fO);
        await page.goBack().catch(() => undefined);
      }
    });
    // old canvas-thread addresses
    const oldAddr = async (label: string, d: { conversation_id: string; thread_root_id: string } | undefined, check: (s: Snap, u: string) => boolean, expectText: string, shotName: string) =>
      step(vp, 'J-W5', label, async () => {
        if (!d) { rec(vp, 'J-W5', label, null, 'NOT REACHED: no such draft row'); return; }
        await page.goto(`/chats/c/${d.conversation_id}/t/${d.thread_root_id}`);
        await page.waitForURL(u => !/\/chats\//.test(u.pathname), { timeout: 25_000 }).catch(() => undefined);
        await page.waitForTimeout(2500);
        const s = await snap(page);
        const f = await shot(page, vp, 'J-W5', shotName);
        const okk = check(s, page.url()); rec(vp, 'J-W5', label, okk ? true : (enabled ? false : null), `${enabled ? '' : 'NOT REACHED with drafting off (spec: drafting off, the thread stays readable as today; W0 resolution is gated on drafting being on). '}${expectText} | got url=${s.url}`, f);
      });
    await oldAddr('old address, open draft -> /canvas/:tag?ws=1', openDraft, (s, u) => /\/canvas\/canvas(?:_\d+)?/.test(u) && u.includes('ws=1') && /^Draft/.test(s.state ?? ''), 'expect /canvas/:tag?ws=1 showing the draft', 'old-address-open-draft');
    await oldAddr('old address, published version -> ?v=<version>', pubDraft, (s, u) => /\/canvas\/canvas(?:_\d+)?/.test(u) && u.includes(`v=${vName}`) && !u.includes('ws=1') && !s.panel, 'expect ?v=<version name>, no ws, no panel', 'old-address-published');

    // ---------------------------------------------------------------- Discard (W6) on the open clone draft
    cur.j = 'J-W3';
    await step(vp, 'J-W3', 'discard', async () => {
      await page.goto(`${v1Url.pathname}?ws=1`);
      await page.waitForTimeout(2500);
      let s = await snap(page);
      if (!wide) { await page.getByTestId('workspace-view-chat').click(); await page.waitForTimeout(500); }
      const discard = page.getByTestId('canvas-discard');
      await expect(discard).toBeVisible({ timeout: 30_000 });
      const sd = await snap(page);
      const f0 = await shot(page, vp, 'J-W3', 'discard-visible');
      rec(vp, 'J-W3', 'Discard sits in the thread panel header', sd.discard, 'secondary destructive pill; blue buttons=' + JSON.stringify(sd.blue), f0);
      await discard.click();
      await page.getByRole('dialog').waitFor({ state: 'visible' });
      const f1 = await shot(page, vp, 'J-W3', 'discard-confirm', 900);
      await page.getByRole('dialog').getByRole('button', { name: /^Discard/ }).click();
      await expect.poll(() => new URL(page.url()).searchParams.get('ws'), { timeout: 30_000 }).toBeNull();
      await page.waitForTimeout(1500);
      s = await snap(page);
      const f = await shot(page, vp, 'J-W3', 'after-discard');
      rec(vp, 'J-W3', 'Discard (confirm) returns to v1 published view', s.url.includes(`v=${vName}`) && !s.url.includes('ws=1') && !s.panel && (enabled ? s.clone : true), `url=${s.url} state=${s.state} clone=${s.clone}`, f0 && f1 && f);
      void f1;
    });
    cur.j = 'J-W5';
    await oldAddr('old address, discarded draft -> newest published version', openDraft, (s, u) => /\/canvas\/canvas(?:_\d+)?/.test(u) && !u.includes('ws=1') && s.spotText === 'Published · v1', 'expect the canvas page at its newest published version (Published · v1), no ws', 'old-address-discarded');

    // ---------------------------------------------------------------- Rename
    cur.j = 'Rename';
    await step(vp, 'Rename', 'rename', async () => {
      await page.goto(`${v1Url.pathname}?v=${vName}`);
      await expect(page.getByTestId('canvas-rename')).toBeVisible();
      const before = (await snap(page)).title;
      const NEW = 'Acme Bakery Plan Two';
      await page.getByTestId('canvas-rename').click();
      await shot(page, vp, 'Rename', 'editing');
      await page.getByTestId('canvas-title-input').fill(NEW);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
      let s = await snap(page);
      const f = await shot(page, vp, 'Rename', 'renamed');
      rec(vp, 'Rename', 'Enter saves: header shows the new name, URL unchanged', s.title === NEW && s.url === `${v1Url.pathname}?v=${vName}`, `title=${s.title} url=${s.url}`, f);
      // Escape reverts
      await page.getByTestId('canvas-rename').click();
      await page.getByTestId('canvas-title-input').fill('Zzz discarded');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      s = await snap(page);
      rec(vp, 'Rename', 'Escape reverts', s.title === NEW, `title=${s.title}`);
      // empty reverts
      await page.getByTestId('canvas-rename').click();
      await page.getByTestId('canvas-title-input').fill('');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(800);
      s = await snap(page);
      rec(vp, 'Rename', 'empty name reverts', s.title === NEW, `title=${s.title}`);
      // reload keeps
      await page.reload();
      await expect(page.getByTestId('canvas-title')).toBeVisible();
      const first = (await snap(page)).title;
      const t1 = Date.now();
      await expect.poll(async () => (await snap(page)).title, { timeout: 15_000, intervals: [200] }).toBe(NEW).catch(() => undefined);
      s = await snap(page);
      rec(vp, 'Rename', 'reload keeps the name', s.title === NEW, `title=${s.title} (was ${before}); the header first painted "${first}" and showed the stored name after ${Date.now() - t1}ms`);
      rec(vp, 'Rename', 'OBSERVATION: first paint after reload shows the fallback name, not the stored one', null, `first paint="${first}"`);
      // Artifacts row + mirror card
      await toCanvasesTab(page);
      await expect.poll(async () => page.getByTestId('artifact-row').count(), { timeout: 40_000, intervals: [500] }).toBeGreaterThan(0).catch(() => undefined);
      await page.waitForTimeout(800);
      const rows = (await page.getByTestId('artifact-row').allInnerTexts()).map(r => r.replace(/\s+/g, ' '));
      const fa = await shot(page, vp, 'Rename', 'artifacts-row');
      rec(vp, 'Rename', 'Artifacts row shows the new name', rows.some(r => r.includes(NEW)), `rows=${JSON.stringify(rows)}`, fa);
      await page.goto(`/chats/c/${openDraft!.conversation_id}`);
      await expect.poll(async () => page.getByTestId('attachment-canvas_version').count(), { timeout: 40_000, intervals: [500] }).toBeGreaterThan(0).catch(() => undefined);
      const cards = (await page.getByTestId('attachment-canvas_version').allInnerTexts()).map(r => r.replace(/\s+/g, ' '));
      const fm = await shot(page, vp, 'Rename', 'mirror-card');
      rec(vp, 'Rename', 'mirror card shows the new name', cards.some(r => r.includes(NEW)), `cards=${JSON.stringify(cards)}`, fm);
    });

    // ---------------------------------------------------------------- ordinary mirror chat (shares Composer, ThreadPanel and the mirror provider with the canvas thread)
    cur.j = 'Mirror';
    await step(vp, 'Mirror', 'plain-message-and-thread-reply', () => mirrorPlain(page, user, vp, wide));

    // ---------------------------------------------------------------- Pixel checks at several widths (1440 test only; 375 native here)
    cur.j = 'Pixel';
    const widths = wide ? [1440, 320] : [375];
    const H: Record<number, { pub?: Snap; draft?: Snap }> = {};
    const band = (s: Snap, label: string, w: number, f: string) => rec(vp, 'Pixel', `${label} @${w}: owner bar top sits at the top of the viewport or directly under a real shell bar`, s.barTop !== null && (s.barTop < 2 || /shell=(header|nav)/.test(s.aboveBar ?? '')), `bar top y=${s.barTop}px; ${s.aboveBar}`, f);
    for (const w of widths) {
      await step(vp, 'Pixel', `published-${w}`, async () => {
        await page.setViewportSize({ width: w, height: w === 1440 ? 900 : 812 });
        await page.goto(`${v1Url.pathname}?v=${vName}`);
        await expect(page.getByTestId('publish-spot')).toBeVisible({ timeout: 20_000 });
        await page.waitForTimeout(1200);
        const s = await sample(page, vp, `pixel-published-${w}`);
        const f = await shot(page, w, 'Pixel', `published-${w}`);
        rec(vp, 'Pixel', `published @${w}: innerWidth is ${w}`, s.innerWidth === w, `innerWidth=${s.innerWidth}`, f);
        rec(vp, 'Pixel', `published @${w}: no horizontal overflow`, s.scrollWidth <= s.innerWidth, `scrollWidth=${s.scrollWidth}`, f);
        rec(vp, 'Pixel', `published @${w}: Share labelled "Share"`, /Share/.test(s.shareText ?? ''), `share="${s.shareText}"`, f);
        rec(vp, 'Pixel', `published @${w}: no "Clarity Canvas" text`, !s.clarityCanvasText, '', f);
        rec(vp, 'Pixel', `published @${w}: at most one primary`, primariesOf(s).length <= 1, `blue=${JSON.stringify(s.blue)}`, f);
        band(s, 'published', w, f);
        H[w] = { ...(H[w] ?? {}), pub: s };
      });
      await step(vp, 'Pixel', `draft-${w}`, async () => {
        if (enabled) {
          await page.goto(`${v1Url.pathname}?v=${vName}`);
          await page.getByTestId('canvas-clone').click();
        } else {
          // Clone is not rendered with drafting off: measure a SEEDED draft from v1 instead (opened once, by the RPC).
          const cloneRow = async () => (await supabaseAdmin.from('canvas_drafts').select('id,version_name').eq('owner_id', user.user.id).eq('state', 'open').not('base_version_id', 'is', null).limit(1).maybeSingle()).data;
          let cr = await cloneRow();
          if (!cr) {
            const { data: pubRow } = await supabaseAdmin.from('canvas_drafts').select('version_id').eq('owner_id', user.user.id).eq('state', 'published').limit(1).maybeSingle();
            cr = await seedCloneDraft(api, user.user.id, pubRow!.version_id);
          }
          await page.goto(`${v1Url.pathname}?v=${cr!.version_name}&ws=1`);
        }
        await expect.poll(() => new URL(page.url()).searchParams.get('ws'), { timeout: 20_000 }).toBe('1');
        await page.waitForTimeout(2500);
        const s = await sample(page, vp, `pixel-clone-pending-${w}`);
        const f = await shot(page, w, 'Pixel', `clone-pending-${w}`);
        rec(vp, 'Pixel', `workspace @${w}: no horizontal overflow`, s.scrollWidth <= s.innerWidth, `scrollWidth=${s.scrollWidth} innerWidth=${s.innerWidth}`, f);
        rec(vp, 'Pixel', `workspace @${w}: Share labelled "Share"`, /Share/.test(s.shareText ?? ''), `share="${s.shareText}"`, f);
        rec(vp, 'Pixel', `workspace @${w}: no "Clarity Canvas" text`, !s.clarityCanvasText, '', f);
        rec(vp, 'Pixel', `workspace @${w}: at most one primary`, primariesOf(s).length <= 1, `blue=${JSON.stringify(s.blue)}`, f);
        band(s, 'workspace', w, f);
        rec(vp, 'Pixel', `pending-Clone header @${w}: at most two rows; the name is usable (3+ characters or whole)`, (s.barRows ?? 9) <= 2 && !!s.titleInfo && (s.titleInfo.inside >= 3 || !s.titleInfo.clipped), `rows=${s.barRows} barH=${s.barBox?.h} name=${JSON.stringify(s.titleInfo)} tag=${JSON.stringify(s.tagInfo)} versionShown=${s.versionShown} picker="${s.pickerText}"`, f);
        H[w] = { ...(H[w] ?? {}), draft: s };
      });
      await step(vp, 'Pixel', `draft2-${w}`, async () => {
        await page.goto(`/p/${user.slug}/canvas/canvas_2?ws=1`);
        await expect(page.getByTestId('publish-spot')).toBeVisible({ timeout: 20_000 });
        await page.waitForTimeout(2500);
        const s = await sample(page, vp, `pixel-newdraft-${w}`);
        const f = await shot(page, w, 'Pixel', `new-draft-${w}`);
        rec(vp, 'Pixel', `real new draft @${w}: no horizontal overflow`, s.scrollWidth <= s.innerWidth, `scrollWidth=${s.scrollWidth} innerWidth=${s.innerWidth}`, f);
        band(s, 'real new draft', w, f);
        const hp2 = H[w]?.pub;
        if (hp2?.barBox && s.barBox) rec(vp, 'Pixel', `header height, real new draft vs published @${w} (±1px)`, Math.abs(hp2.barBox.h - s.barBox.h) <= 1, `published=${hp2.barBox.h} draft=${s.barBox.h}`, f);
        if (hp2?.spotBox && s.spotBox) rec(vp, 'Pixel', `Publish spot place in the bar, real new draft vs published @${w} (±1px; right gap, top, size)`, sameSig(spotSig(hp2), spotSig(s)), `published=${JSON.stringify(spotSig(hp2))} draft=${JSON.stringify(spotSig(s))} (absolute x ${hp2.spotBox.x} vs ${s.spotBox.x})`, f);
      });
      const hp = H[w]?.pub; const hd = H[w]?.draft;
      if (hp?.barBox && hd?.barBox) {
        rec(vp, 'Pixel', `header height, workspace (Clone pending) vs published @${w} (±1px)`, Math.abs(hp.barBox.h - hd.barBox.h) <= 1, `published=${hp.barBox.h} workspace=${hd.barBox.h}`);
        if (hp.spotBox && hd.spotBox) rec(vp, 'Pixel', `Publish spot place in the bar, pending Clone vs published @${w} (±1px; right gap, top, size)`, sameSig(spotSig(hp), spotSig(hd)), `published=${JSON.stringify(spotSig(hp))} pending=${JSON.stringify(spotSig(hd))} (absolute x ${hp.spotBox.x} vs ${hd.spotBox.x})`);
      }
    }

    // header height / spot box equality across the samples taken at the native viewport
    const mine = samples.filter(x => x.vp === vp && !x.label.startsWith('pixel-'));
    const hs = mine.filter(x => x.s.barBox).map(x => `${x.label}:${x.s.barBox!.h}`);
    const draftH = mine.find(x => x.label === 'run-done-publish')?.s.barBox?.h;
    const pubH = mine.find(x => x.label === 'published-v1')?.s.barBox?.h;
    rec(vp, 'Pixel', 'header height equal draft vs published (±1px)', draftH !== undefined && pubH !== undefined && Math.abs(draftH - pubH) <= 1, `draft(run-done)=${draftH} published=${pubH} all=${hs.join(' ')}`);
    const spots = mine.filter(x => spotSig(x.s)).map(x => ({ l: x.label, b: spotSig(x.s)! }));
    const ref = spots[0]?.b;
    const bad = spots.filter(x => !sameSig(ref ?? null, x.b));
    rec(vp, 'Pixel', 'Publish spot place in the bar equal across states (±1px; right gap, top, size)', spots.length > 1 && bad.length === 0, `ref=${JSON.stringify(ref)} deviating=${JSON.stringify(bad)}`);
    const hY = (label: string) => mine.find(x => x.label === label)?.s.firstHeadingY;
    const yPub = hY('published-v1'); const yDraft = hY('clone-draft-after-send'); const yRun = hY('run-done-publish'); const yPend = hY('clone-pending');
    rec(vp, 'Pixel', `first section heading at the same y: published vs the Clone's draft @${vp} (±1px)`, yPub !== undefined && yDraft !== undefined && yPub !== null && yDraft !== null && Math.abs(yPub - yDraft) <= 1, `published=${yPub} clone draft=${yDraft} new-canvas draft with content=${yRun} pending clone=${yPend}`);
    rec(vp, 'Pixel', `first section heading at the same y: published vs the new canvas's draft with content @${vp} (±1px)`, yPub !== undefined && yRun !== undefined && yPub !== null && yRun !== null && Math.abs(yPub - yRun) <= 1, `published=${yPub} draft=${yRun}`);
    rec(vp, 'Pixel', `first section heading at the same y: published vs pending Clone @${vp} (±1px)`, yPub !== undefined && yPend !== undefined && yPub !== null && yPend !== null && Math.abs(yPub - yPend) <= 1, `published=${yPub} pending=${yPend}`);

    // ---------------------------------------------------------------- the 30-update cap (SEEDED: 30 finished runs written by the service role; the cap UI is what is under test)
    cur.j = 'Cap';
    await step(vp, 'Cap', 'cap-seeded', async () => {
      await page.setViewportSize({ width: vp, height });
      const dd = (await supabaseAdmin.from('canvas_drafts').select('id').eq('owner_id', user.user.id).eq('canvas_name', 'canvas_2').eq('state', 'open').maybeSingle()).data;
      if (!dd) { rec(vp, 'Cap', 'at the cap the composer gives way to the cap sentence (SEEDED)', null, 'NOT REACHED: the second canvas draft is not there'); return; }
      const rows = Array.from({ length: 30 }, () => ({ draft_id: dd.id, owner_id: user.user.id, kind: 'draft', speed: 'fast', state: 'done' }));
      let { error } = await supabaseAdmin.from('canvas_draft_runs').insert(rows);
      if (!error) ({ error } = await supabaseAdmin.from('canvas_drafts').update({ run_count: 30 }).eq('id', dd.id));
      if (error) { rec(vp, 'Cap', 'at the cap the composer gives way to the cap sentence (SEEDED)', null, `NOT REACHED: seeding 30 finished runs was refused: ${error.message}`); return; }
      await page.goto(`/p/${user.slug}/canvas/canvas_2?ws=1`);
      await expect(page.getByTestId('publish-spot')).toBeVisible({ timeout: 20_000 });
      if (!wide) await page.getByTestId('workspace-view-chat').click();
      await expect.poll(async () => (await snap(page)).panelText, { timeout: 15_000, intervals: [500] }).toMatch(/30 updates/).catch(() => undefined);
      const sC = await snap(page);
      const fC = await shot(page, vp, 'Cap', 'cap-line');
      const comp = await composerState(page);
      rec(vp, 'Cap', 'at 30 updates the composer gives way to the cap sentence (SEEDED runs, nothing to publish: sentence plus Start over)', /30 updates/.test(sC.panelText) && /Start over/.test(sC.panelText) && !comp, `panel="${sC.panelText.slice(-220)}" composerPresent=${!!comp}`, fC);
    });

    void s0;
    void canvasName;
    void ownerSlug;
  } finally {
    rec(vp, 'env', 'every Supabase request went to', [...HOSTS.keys()].every(h => h === new URL(process.env.VITE_SUPABASE_URL!).host), JSON.stringify(Object.fromEntries(HOSTS)));
    await ctx.close().catch(() => undefined);
    await deleteTestUser(user.user.id).catch(e => rec(vp, 'cleanup', 'delete user', false, String(e)));
  }
}


/** Access (W8 / the access paragraph): the owner surface exists for the owner and for nobody else. */
async function accessWalk(browser: Browser, vp: number, height: number) {
  const J = 'Access';
  const { user, ctx, page, cur } = await newOwner(browser, vp, height, `P1536 Walk Access Owner ${vp}`);
  let reader: TestUser | undefined;
  let rctx: BrowserContext | undefined;
  let actx: BrowserContext | undefined;
  cur.j = J;
  try {
    const { api, token } = await ownerApi(user.email);
    const avail = await draftingEnabled(token);
    // FIXTURE (not under test): a published canvas and an open draft of it, made through the RPCs and SEEDED points, to keep hosted budget for the walk itself.
    const { data: opened, error } = await api.rpc('canvas_draft_open', { p_from_version: null });
    if (error) throw new Error(`canvas_draft_open: ${error.message}`);
    const name = (opened as { canvas_name: string }).canvas_name;
    const d1 = (await supabaseAdmin.from('canvas_drafts').select('id,version_name,version_id,revision').eq('owner_id', user.user.id).eq('state', 'open').limit(1).maybeSingle()).data!;
    await seedDraftPoints(user.user.id, d1.id, d1.version_name, SEED_FIRST);
    const pub = await api.rpc('canvas_draft_publish', { p_draft: d1.id, p_expected_revision: d1.revision });
    rec(vp, J, 'fixture: owner canvas published through canvas_draft_publish', !pub.error && (pub.data as { status?: string })?.status !== 'refused', JSON.stringify(pub.data ?? pub.error).slice(0, 200));
    await api.rpc('canvas_draft_open', { p_from_version: d1.version_id });
    const d2 = (await supabaseAdmin.from('canvas_drafts').select('id,version_name').eq('owner_id', user.user.id).eq('state', 'open').limit(1).maybeSingle()).data!;
    await seedDraftPoints(user.user.id, d2.id, d2.version_name, SEED_SECOND);
    const path = `/p/${user.slug}/canvas/${name}`;

    // Owner: open the Share panel and make the link readable (the owner's own control)
    await page.goto(`${path}?v=${d1.version_name}`);
    await expect(page.getByTestId('canvas-share-control')).toBeVisible({ timeout: 20_000 });
    const ownerSnap = await snap(page);
    await shot(page, vp, J, 'owner-published-with-open-draft');
    rec(vp, J, 'control: owner sees Share, rename, picker (a draft is open)', ownerSnap.share && ownerSnap.rename, `share=${ownerSnap.share} rename=${ownerSnap.rename} picker=${ownerSnap.picker} "${ownerSnap.pickerText}" bar="${ownerSnap.barText}"`);
    await page.getByTestId('canvas-share-control').click();
    await page.getByTestId('canvas-share-panel').getByTestId('canvas-share-general').selectOption('link');
    await page.getByRole('button', { name: 'Share with link' }).click();
    await page.waitForTimeout(2500);
    await shot(page, vp, J, 'owner-share-panel');
    await page.keyboard.press('Escape');
    // Owner opens their own canvas with the handle's letter case changed: what do they get?
    const upper = user.slug.toUpperCase();
    await page.goto(`/p/${upper}/canvas/${name}?v=${d1.version_name}`);
    await page.waitForTimeout(4000);
    const cs = await snap(page);
    const csBody = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200);
    const csShot = await shot(page, vp, J, 'owner-handle-case-changed');
    rec(vp, J, 'CASE: the owner opens their canvas at /p/<HANDLE UPPER-CASED>/canvas/…: what they get', null, `url=${cs.url} title=${cs.title} rename=${cs.rename} share=${cs.share} state=${cs.state} points=${cs.points} panel=${cs.panel} switcher=${cs.switcher} clone=${cs.clone} body="${csBody}"`, csShot);
    const mixed = user.slug.replace(/^./, c => c.toUpperCase());
    await page.goto(`/p/${mixed}/canvas/${name}?v=${d1.version_name}`);
    await page.waitForTimeout(4000);
    const cs2 = await snap(page);
    const cs2Shot = await shot(page, vp, J, 'owner-handle-case-first-letter');
    rec(vp, J, 'CASE: the owner opens it with only the first letter of the handle upper-cased', null, `url=${cs2.url} title=${cs2.title} rename=${cs2.rename} share=${cs2.share} state=${cs2.state} points=${cs2.points} panel=${cs2.panel} clone=${cs2.clone}`, cs2Shot);
    const cv = (await supabaseAdmin.from('canvases').select('link_token,general_access').eq('owner_id', user.user.id).eq('name', name).maybeSingle()).data;
    rec(vp, J, 'fixture: owner set general access to "anyone with the link"', cv?.general_access === 'link' && !!cv?.link_token, `general_access=${cv?.general_access}`);
    const K = cv?.link_token ?? '';
    const withK = (q: string) => `${path}?${q}${q ? '&' : ''}k=${K}`;

    const readerView = async (label: string, pg: Page, url: string, who: string) => {
      await pg.goto(url);
      await pg.waitForTimeout(3500);
      // a link-token read can be slow on hosted TEST: when the address carries the token, give it up to 12s more before judging
      if (url.includes('k=')) await expect.poll(async () => (await snap(pg)).points, { timeout: 40_000, intervals: [500] }).toBeGreaterThan(0).catch(() => undefined);
      const s = await snap(pg);
      const body = await pg.locator('body').innerText();
      const f = await shot(pg, vp, J, label);
      const unavailable = /not found|isn.t available|unavailable|doesn.t exist/i.test(body) && s.points === 0;
      rec(vp, J, `${who}: ${url.replace(path, '…')}: none of panel, Thread, switcher, rename, Clone, Discard, Draft state`, !s.panel && !s.threadBtn && !s.switcher && !s.rename && !s.clone && !s.discard && s.state !== 'Draft', `panel=${s.panel} threadBtn=${s.threadBtn} switcher=${s.switcher} rename=${s.rename} clone=${s.clone} discard=${s.discard} state=${s.state} points=${s.points} unavailable=${unavailable} url=${s.url}`, f);
      const leak = /Direct emails to office managers/.test(body);
      rec(vp, J, `${who}: the open draft's own (unpublished) point is not readable`, !leak, `leak=${leak}`, f);
      return { s, body, unavailable };
    };

    // second signed-in user
    rctx = await browser.newContext({ viewport: { width: vp, height }, baseURL: BASE });
    await rctx.addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } });
    attachWatchers(rctx, vp, cur);
    reader = await createTestUser({ name: 'P1536 Walk Access Reader' });
    const rpage = await rctx.newPage();
    await setTestSession(rpage, reader.email);
    const r1 = await readerView('reader-published', rpage, withK(`v=${d1.version_name}`), 'signed-in reader');
    rec(vp, J, 'signed-in reader sees the published points (link share worked)', r1.s.points > 0, `points=${r1.s.points}`);
    await readerView('reader-ws1', rpage, withK('ws=1'), 'signed-in reader');
    await readerView('reader-open-draft-version', rpage, withK(`v=${d2.version_name}`), 'signed-in reader (open draft version by name)');
    const rr = await readerView('reader-bare', rpage, withK(''), 'signed-in reader (bare link)');
    rec(vp, J, 'signed-in reader: picker lists published versions only', !/Draft/.test(rr.s.pickerText ?? '') && !/Draft/.test(rr.s.barText ?? ''), `picker="${rr.s.pickerText}" bar="${rr.s.barText}"`);

    // signed-out visitor
    actx = await browser.newContext({ viewport: { width: vp, height }, baseURL: BASE });
    attachWatchers(actx, vp, cur);
    const apage = await actx.newPage();
    const a0 = await readerView('anon-no-token', apage, `${path}?v=${d1.version_name}`, 'signed-out visitor WITHOUT the link token (control)');
    rec(vp, J, 'control: without the link token a signed-out visitor reads nothing', a0.s.points === 0, `points=${a0.s.points}`);
    const a1 = await readerView('anon-published', apage, withK(`v=${d1.version_name}`), 'signed-out visitor');
    rec(vp, J, 'signed-out visitor sees the published points', a1.s.points > 0, `points=${a1.s.points}`);
    await readerView('anon-ws1', apage, withK('ws=1'), 'signed-out visitor');
    await readerView('anon-open-draft-version', apage, withK(`v=${d2.version_name}`), 'signed-out visitor (open draft version by name)');
    const ar = await readerView('anon-bare', apage, withK(''), 'signed-out visitor (bare link)');
    rec(vp, J, 'signed-out visitor: picker lists published versions only', !/Draft/.test(ar.s.pickerText ?? '') && !/Draft/.test(ar.s.barText ?? ''), `picker="${ar.s.pickerText}" bar="${ar.s.barText}"`);
    // the draft's seeded point must not be readable by either reader
    rec(vp, J, 'drafting availability on this server (context)', null, avail.raw.slice(0, 80));
  } finally {
    rec(vp, 'env', 'every Supabase request went to', [...HOSTS.keys()].every(h => h === new URL(process.env.VITE_SUPABASE_URL!).host), JSON.stringify(Object.fromEntries(HOSTS)));
    await rctx?.close().catch(() => undefined);
    await actx?.close().catch(() => undefined);
    await ctx.close().catch(() => undefined);
    if (reader) await deleteTestUser(reader.user.id).catch(e => rec(vp, 'cleanup', 'delete reader', false, String(e)));
    await deleteTestUser(user.user.id).catch(e => rec(vp, 'cleanup', 'delete owner', false, String(e)));
  }
}

/** Ordinary mirror chat: a plain message and a plain thread reply (they share Composer, ThreadPanel and the mirror provider with the canvas thread). */
async function mirrorPlain(page: Page, user: TestUser, vp: number, threadReply = true) {
  await page.goto('/feed');
  const nav = page.getByRole('link', { name: 'Chats' }).first();
  if (await nav.isVisible().catch(() => false)) await nav.click(); else await page.goto('/chats');
  const tList = Date.now();
  await page.getByText('Your mirror agent').first().waitFor({ timeout: 40_000 });
  await page.getByText('Your mirror agent').first().click();
  await page.getByTestId('composer').first().waitFor({ timeout: 40_000 });
  rec(vp, 'Mirror', 'the mirror chat opens (time to list and composer)', true, `${Date.now() - tList}ms`);
  await page.waitForTimeout(2500);
  const PLAIN = `plain hello from the walk ${vp}`;
  const tPlain = Date.now();
  const mainBox = page.getByTestId('composer').getByRole('textbox').first();
  await mainBox.click();
  await mainBox.fill(PLAIN);
  await page.locator('[data-composer-send]').first().click();
  let m1: Array<{ id: string; body: string | null; thread_root_id: string | null; canvas_run_id: string | null; conversation_id: string }> = [];
  for (let i = 0; i < 12 && m1.length === 0; i++) {
    await page.waitForTimeout(1500);
    m1 = (await supabaseAdmin.from('chat_messages').select('id,body,thread_root_id,canvas_run_id,conversation_id').eq('author_id', user.user.id).eq('body', PLAIN)).data ?? [];
  }
  const f1 = await shot(page, vp, 'Mirror', 'plain-message');
  rec(vp, 'Mirror', 'a plain message in the mirror chat is stored as an ordinary message (no thread, no canvas run)', m1.length === 1 && m1[0].thread_root_id === null && m1[0].canvas_run_id === null, JSON.stringify(m1), f1);
  let replied: unknown[] = [];
  for (let i = 0; i < 10 && replied.length === 0 && m1[0]; i++) {
    replied = (await supabaseAdmin.from('chat_messages').select('id,author_id,body,created_at').eq('conversation_id', m1[0].conversation_id).neq('author_id', user.user.id).gte('created_at', new Date(tPlain - 2000).toISOString())).data ?? [];
    if (replied.length === 0) await page.waitForTimeout(3000);
  }
  const mr1 = since(REQLOG, tPlain, vp).filter(r => /mirror-reply/.test(r.url));
  rec(vp, 'Mirror', 'a plain message is answered or attempted as before (mirror-reply request, or an agent message)', mr1.length > 0 || replied.length > 0, `mirror-reply requests=${JSON.stringify(mr1.map(r => `${r.method} ${r.status}`))} agent messages after it=${replied.length}`, f1);
  if (!m1[0]) return;
  if (!threadReply) { rec(vp, 'Mirror', 'plain thread reply (this walk is a desktop-style 375 context without touch)', null, 'NOT REACHED here: covered by the MirrorThread cells, which use a touch context'); return; }
  const row = page.locator('li[data-testid="message"]', { hasText: PLAIN }).first();
  await row.waitFor({ timeout: 15_000 });
  await row.hover();
  const direct = row.locator('button[aria-label="Thread"], button[aria-label="Reply in thread"]').first();
  if (await direct.count()) {
    await direct.click({ force: true });
  } else {
    const act = row.locator('[aria-label="Message actions"]').first();
    if (!(await act.count())) { rec(vp, 'Mirror', 'thread reply: a way to reply in thread on the plain message', false, `buttons in the row=${JSON.stringify(await row.locator('button').evaluateAll(bs => bs.map(b => b.getAttribute('aria-label') ?? b.textContent?.trim())))}`, await shot(page, vp, 'Mirror', 'no-actions')); return; }
    const toolbar = await row.locator('button').evaluateAll(bs => bs.map(b => b.getAttribute('aria-label') ?? b.textContent?.trim()));
    await act.click({ force: true });
    await page.waitForTimeout(600);
    const labels = await page.getByRole('menuitem').allInnerTexts();
    const fMenu = await shot(page, vp, 'Mirror', 'message-actions-menu');
    if (!labels.some(l => /Reply in thread/.test(l))) {
      rec(vp, 'Mirror', 'a plain mirror message offers "Reply in thread"', null, `NOT REACHED: the message actions offer no "Reply in thread" (menu items=${JSON.stringify(labels)}; row buttons=${JSON.stringify(toolbar)}; MessageRow.tsx offers it only when !ownerOnly, and the mirror's messages are the owner's alone). The plain thread reply was therefore not exercised.`, fMenu);
      return;
    }
    await page.getByRole('menuitem', { name: /Reply in thread/ }).click();
  }
  await page.getByTestId('thread-panel').waitFor({ timeout: 15_000 }).catch(async () => { rec(vp, 'Mirror', 'the thread panel opens from the Thread button', false, `no thread-panel after 15s; page text="${(await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200)}"`, await shot(page, vp, 'Mirror', 'no-thread-panel')); throw new Error('no thread panel'); });
  await page.waitForTimeout(1200);
  const REPLY = `plain thread reply from the walk ${vp}`;
  const tThread = Date.now();
  const tBox = page.getByTestId('thread-panel').getByTestId('composer').getByRole('textbox').first();
  await tBox.click();
  await tBox.fill(REPLY);
  const posts: string[] = [];
  const onResp = (r: import('@playwright/test').Response) => { if (r.request().method() === 'POST' && /supabase\.co\/(rest|functions)/.test(r.url())) posts.push(`${r.url().split('/').slice(-1)[0]}:${r.status()}`); };
  page.on('response', onResp);
  await page.getByTestId('thread-panel').locator('[data-composer-send]').first().click();
  await page.waitForTimeout(3000);
  const stillThere = (await tBox.inputValue().catch(async () => (await tBox.textContent()) ?? '')).includes(REPLY);
  const toast = ((await page.locator('[data-sonner-toast]').first().textContent().catch(() => '')) ?? '').trim();
  if (stillThere) {
    rec(vp, 'Mirror', 'the thread Send button sends the typed reply', false, `field still holds the text 3s after the click; toast="${toast}"; POSTs=${JSON.stringify(posts)}`, await shot(page, vp, 'Mirror', 'thread-send-did-nothing'));
    await tBox.press('Enter');
    await page.waitForTimeout(3000);
    const afterEnter = (await tBox.inputValue().catch(async () => (await tBox.textContent()) ?? '')).includes(REPLY);
    rec(vp, 'Mirror', 'pressing Enter in the thread field sends it', !afterEnter, `field still holds the text after Enter=${afterEnter}; POSTs=${JSON.stringify(posts)}`);
  }
  page.off('response', onResp);
  let m2: Array<{ id: string; body: string | null; thread_root_id: string | null; canvas_run_id: string | null }> = [];
  for (let i = 0; i < 12 && m2.length === 0; i++) {
    await page.waitForTimeout(1500);
    m2 = (await supabaseAdmin.from('chat_messages').select('id,body,thread_root_id,canvas_run_id').eq('author_id', user.user.id).eq('body', REPLY)).data ?? [];
  }
  const f2 = await shot(page, vp, 'Mirror', 'plain-thread-reply');
  rec(vp, 'Mirror', "a plain thread reply is stored in that message's thread with no canvas run", m2.length === 1 && m2[0].thread_root_id === m1[0].id && m2[0].canvas_run_id === null, JSON.stringify(m2), f2);
  let replied2: unknown[] = [];
  for (let i = 0; i < 10 && replied2.length === 0; i++) {
    replied2 = (await supabaseAdmin.from('chat_messages').select('id,author_id,body,thread_root_id').eq('thread_root_id', m1[0].id).neq('author_id', user.user.id)).data ?? [];
    if (replied2.length === 0) await page.waitForTimeout(3000);
  }
  const mr2 = since(REQLOG, tThread, vp).filter(r => /mirror-reply/.test(r.url));
  rec(vp, 'Mirror', 'a plain thread reply is answered or attempted as before', mr2.length > 0 || replied2.length > 0, `mirror-reply requests=${JSON.stringify(mr2.map(r => `${r.method} ${r.status}`))} agent replies in the thread=${replied2.length}`, f2);
  const sp = await snap(page);
  rec(vp, 'Mirror', 'the plain thread shows no canvas opener, Copy prompt or Updating…', !/Copy prompt|Want to save time|Give your mirror agent|Updating…/.test(sp.panelText), sp.panelText.slice(0, 200), f2);
}

/** A fresh user with no canvases: the same ordinary mirror chat cell on its own. */
async function _mirrorWalk(browser: Browser, vp: number, height: number) {
  const { user, ctx, page, cur } = await newOwner(browser, vp, height, `P1536 Walk Mirror ${vp}`);
  cur.j = 'Mirror';
  try {
    await step(vp, 'Mirror', 'plain-message-and-thread-reply (fresh user, no canvases)', () => mirrorPlain(page, user, vp));
  } finally {
    rec(vp, 'env', 'every Supabase request went to (Mirror)', [...HOSTS.keys()].every(h => h === new URL(process.env.VITE_SUPABASE_URL!).host), JSON.stringify(Object.fromEntries(HOSTS)));
    await ctx.close().catch(() => undefined);
    await deleteTestUser(user.user.id).catch(e => rec(vp, 'cleanup', 'delete user', false, String(e)));
  }
}

/**
 * The dedicated cell for a Send before the thread's first read, on a fresh New canvas: sent the moment the textbox exists. It must be HELD (the slot reads
 * "Updating…", the field is empty), then go as exactly one canvas_workspace_send, with no toast and no plain message, and end in Publish. `delayed` slows
 * the thread's own reads by 3s; `aborted` fails the draft's thread read, which must give ONE toast and the text back.
 */
async function immediateWalk(browser: Browser, vp: number, height: number, mode: 'natural' | 'delayed' | 'aborted') {
  const J = mode === 'natural' ? 'Immediate' : mode === 'delayed' ? 'Immediate-delayed' : 'Immediate-aborted';
  const TEXT = 'Acme Test Bakery sells sourdough loaves to office managers in Tallinn. We charge 12 euros per person per week.';
  const { user, ctx, page, cur } = await newOwner(browser, vp, height, `P1536 Walk ${J} ${vp}`);
  cur.j = J;
  try {
    const { token } = await ownerApi(user.email);
    const avail = await draftingEnabled(token);
    rec(vp, J, 'canvas-draft availability', avail.enabled === true ? true : false, avail.raw.slice(0, 80));
    if (mode === 'delayed') await page.route(THREAD_READS, async route => { await new Promise(r => setTimeout(r, 3000)); await route.continue().catch(() => undefined); });
    if (mode === 'aborted') await page.route(DRAFT_THREAD_READ, route => route.abort());
    await toCanvasesTab(page);
    await page.getByTestId('artifacts-new-canvas').click();
    await page.waitForURL(/\/canvas\/canvas/, { timeout: 45_000 });
    const box = composerBox(page);
    await box.waitFor({ state: 'visible', timeout: 30_000 });
    const openerAtSend = await page.getByTestId('canvas-opener').isVisible().catch(() => false);
    const sends: Array<{ t: number; status: number }> = [];
    page.on('response', r => { if (/rpc\/canvas_workspace_send/.test(r.url())) sends.push({ t: Date.now(), status: r.status() }); });
    await startLogs(page, user.name);
    await startComposerLog(page);
    const tSend = Date.now();
    await box.click();
    await box.fill(TEXT);
    await page.locator('[data-composer-send]').first().click();
    await page.waitForTimeout(250);
    const slotNow = await composerState(page);
    const fieldNow = await boxText(page);
    const f0 = await shot(page, vp, J, 'just-sent', 100);
    rec(vp, J, 'the Send was clicked before the thread opener appeared (the window the defect lives in)', !openerAtSend, `openerVisibleAtSend=${openerAtSend}${openerAtSend ? ' (the window was not open this time)' : ''}`, f0);
    rec(vp, J, '250ms after the click: the slot reads Updating… and the field is empty (the text is held)', mode === 'aborted' ? null : !!slotNow && /Updating…/.test(slotNow.text) && fieldNow.trim() === '', `slot="${slotNow?.text}" field="${fieldNow.slice(0, 30)}"`, f0);
    if (mode === 'aborted') {
      await expect.poll(async () => (await readComposerLog(page)).reduce((m, r) => Math.max(m, r[3]), 0), { timeout: 40_000, intervals: [500] }).toBeGreaterThan(0).catch(() => undefined);
      await startComposerLog(page);
      await page.waitForTimeout(3000);
      const rows = await readComposerLog(page);
      const back = await boxText(page);
      const msgsA = (await supabaseAdmin.from('chat_messages').select('id').eq('author_id', user.user.id).not('body', 'is', null)).data ?? [];
      const fA = await shot(page, vp, J, 'failed-read-text-back', 300);
      rec(vp, J, 'reads aborted: exactly one toast, and the typed text comes back into the field', rows.reduce((m, r) => Math.max(m, r[3]), 0) === 1 && back.includes('Acme Test Bakery'), `toasts now=${rows.reduce((m, r) => Math.max(m, r[3]), 0)} field="${back.slice(0, 40)}" toast="${((await page.locator('[data-sonner-toast]').first().textContent().catch(() => '')) ?? '').trim()}"`, fA);
      rec(vp, J, 'reads aborted: no canvas_workspace_send and no message stored', sends.length === 0 && msgsA.length === 0, `sends=${sends.length} stored owner messages=${msgsA.length}`, fA);
      return;
    }
    await expect.poll(() => sends.length, { timeout: 40_000, intervals: [200] }).toBeGreaterThan(0).catch(() => undefined);
    await expect.poll(async () => (await snap(page)).spotState, { timeout: 240_000, intervals: [200] }).toBe('publish').catch(() => undefined);
    await page.waitForTimeout(800);
    const logs = await readLogs(page);
    const cv = composerVerdict(await readComposerLog(page));
    const v = spotVerdict(logs.spot);
    const sD = await snap(page);
    const fD = await shot(page, vp, J, 'run-done');
    rec(vp, J, 'exactly one canvas_workspace_send call goes out (status 200)', sends.length === 1 && sends[0].status === 200, `calls=${JSON.stringify(sends.map(x => ({ afterMs: x.t - tSend, status: x.status })))}`, fD);
    rec(vp, J, 'no toast at all during the Send and the run (20ms sampler)', cv.maxToasts === 0, `max toasts=${cv.maxToasts} samples=${cv.samples}`, fD);
    rec(vp, J, 'while it waits the composer slot reads Updating… and the field is empty (20ms sampler)', cv.slotUpdatingFieldEmpty, `first Updating… in the slot at ${cv.slotUpdatingFirstAt}ms; send call at ${sends[0] ? sends[0].t - tSend : 'none'}ms`, fD);
    rec(vp, J, 'the run ends in Publish with boxes filled', v.last === 'publish' && sD.points > 0, `${v.text} points=${sD.points}`, fD);
    rec(vp, J, 'the spot never shows not-published, no-changes or loading between Updating… and Publish (25ms sampler)', v.sawUpdating && v.bad.length === 0, v.text, fD);
    const msgs = (await supabaseAdmin.from('chat_messages').select('id,body,thread_root_id,canvas_run_id').eq('author_id', user.user.id).not('body', 'is', null)).data ?? [];
    const mine = msgs.filter(m => (m.body ?? '').includes('Acme Test Bakery sells sourdough'));
    const runs = mine[0] ? (await supabaseAdmin.from('canvas_draft_runs').select('id,state,kind,trigger_message_id').eq('trigger_message_id', mine[0].id)).data ?? [] : [];
    rec(vp, J, 'no plain message: exactly one owner message with text, in the draft thread, and one run triggered by it (done)', msgs.length === 1 && mine.length === 1 && !!mine[0].thread_root_id && runs.length === 1 && runs[0].state === 'done', `owner messages with text=${msgs.length} inThread=${mine.map(m => !!m.thread_root_id)} runs triggered=${JSON.stringify(runs.map(r => r.state))}`, fD);
    const au = await ownerMsgAuthor(page, 'Acme Test Bakery sells sourdough', user.name);
    rec(vp, J, "the owner's message has its own author line", au.length > 0 && au.every(m => m.hasAuthor), JSON.stringify(au), fD);
  } finally {
    rec(vp, 'env', `every Supabase request went to (${J})`, [...HOSTS.keys()].every(h => h === new URL(process.env.VITE_SUPABASE_URL!).host), JSON.stringify(Object.fromEntries(HOSTS)));
    await ctx.close().catch(() => undefined);
    await deleteTestUser(user.user.id).catch(e => rec(vp, 'cleanup', 'delete user', false, String(e)));
  }
}

/**
 * An ordinary mirror thread reply sent before the thread's first read (a fresh user, no canvases). At 375 the context is a touch one and the thread is
 * opened by a real tap on the message and a tap on its Thread button.
 */
async function mirrorThreadWalk(browser: Browser, vp: number, height: number, delayed: boolean) {
  const touch = vp < 768;
  const J = delayed ? 'MirrorThread-delayed' : 'MirrorThread';
  const { user, ctx, page, cur } = await newOwner(browser, vp, height, `P1536 Walk ${J} ${vp}`, touch);
  cur.j = J;
  try {
    await page.goto('/feed');
    const nav = page.getByRole('link', { name: 'Chats' }).first();
    if (await nav.isVisible().catch(() => false)) await (touch ? nav.tap() : nav.click()); else await page.goto('/chats');
    const mirror = page.getByText('Your mirror agent').first();
    await mirror.waitFor({ timeout: 40_000 });
    await (touch ? mirror.tap() : mirror.click());
    await page.getByTestId('composer').first().waitFor({ timeout: 40_000 });
    await page.waitForTimeout(1500);
    const PLAIN = `plain root message ${J} ${vp}`;
    const mainBox = page.getByTestId('composer').getByRole('textbox').first();
    await mainBox.click();
    await mainBox.fill(PLAIN);
    await page.locator('[data-composer-send]').first().click();
    let m1: Array<{ id: string; conversation_id: string }> = [];
    for (let i = 0; i < 15 && m1.length === 0; i++) {
      await page.waitForTimeout(1500);
      m1 = (await supabaseAdmin.from('chat_messages').select('id,conversation_id').eq('author_id', user.user.id).eq('body', PLAIN)).data ?? [];
    }
    if (!m1[0]) { rec(vp, J, 'the root message was stored', false, 'not stored'); return; }
    // let the mirror's first answer to the root message settle so the list is stable
    await expect.poll(async () => page.locator('li[data-testid="message"]').count(), { timeout: 45_000, intervals: [1000] }).toBeGreaterThanOrEqual(2).catch(() => undefined);
    await page.waitForTimeout(1500);
    if (delayed) await page.route(THREAD_READS, async route => { await new Promise(r => setTimeout(r, 3000)); await route.continue().catch(() => undefined); });
    // open the thread: a hover toolbar on desktop; on a phone a real tap on the message shows the toolbar, then a tap on Thread
    const row = page.locator('li[data-testid="message"]', { hasText: PLAIN }).first();
    await row.waitFor({ timeout: 15_000 });
    let opened = '';
    if (touch) {
      const tb = row.locator('button[aria-label="Thread"]').first();
      let toolbarShown = false;
      let taps = 0;
      for (; taps < 3 && !toolbarShown; taps++) {
        await row.getByText(PLAIN).first().tap();
        await page.waitForTimeout(700);
        toolbarShown = await tb.isVisible().catch(() => false);
      }
      opened = `tap on the message (${taps} tap${taps === 1 ? '' : 's'} until the toolbar showed); Thread button visible=${toolbarShown}`;
      await shot(page, vp, J, 'toolbar-after-tap', 300);
      await tb.tap({ timeout: 10_000 });
    } else {
      await row.hover();
      opened = 'hover, then click Thread';
      await row.locator('button[aria-label="Thread"]').first().click({ force: true });
    }
    const tComposer = page.getByTestId('thread-panel').getByTestId('composer').getByRole('textbox').first();
    const panelUp = await tComposer.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
    rec(vp, J, 'a person can open the thread of a mirror message here', panelUp, `${opened}; thread composer appeared=${panelUp}`, await shot(page, vp, J, 'thread-opened', 200));
    if (!panelUp) return;
    const REPLY = `plain thread reply ${J} ${vp}`;
    await startComposerLog(page);
    const tSend = Date.now();
    await tComposer.click();
    await tComposer.fill(REPLY);
    await page.getByTestId('thread-panel').locator('[data-composer-send]').first().click();
    let m2: Array<{ id: string; thread_root_id: string | null; canvas_run_id: string | null }> = [];
    for (let i = 0; i < 25 && m2.length === 0; i++) {
      await page.waitForTimeout(1000);
      m2 = (await supabaseAdmin.from('chat_messages').select('id,thread_root_id,canvas_run_id').eq('author_id', user.user.id).eq('body', REPLY)).data ?? [];
    }
    const sentIn = m2.length ? Date.now() - tSend : -1;
    await expect.poll(async () => page.getByTestId('thread-panel').locator('li[data-testid="message"]').count(), { timeout: 60_000, intervals: [1000] }).toBeGreaterThanOrEqual(3).catch(() => undefined);
    await page.waitForTimeout(1500);
    const rows = await readComposerLog(page);
    const fieldAfter = await tBoxValue(page);
    const uiCount = await page.getByTestId('thread-panel').locator('li[data-testid="message"]', { hasText: REPLY }).count();
    const mr = since(REQLOG, tSend, vp).filter(r => /mirror-reply/.test(r.url));
    const msgCount = ((await supabaseAdmin.from('chat_messages').select('id').eq('author_id', user.user.id).eq('body', REPLY)).data ?? []).length;
    const panelTxt = (await snap(page)).panelText;
    const fT = await shot(page, vp, J, 'reply-answered', 300);
    rec(vp, J, "the reply is stored in that message's thread (thread_root_id = the root, no canvas run)", m2.length === 1 && m2[0].thread_root_id === m1[0].id && m2[0].canvas_run_id === null, `stored after ${sentIn}ms ${JSON.stringify(m2)}`, fT);
    rec(vp, J, 'mirror-reply POST 200', mr.length > 0 && mr.every(r => r.status === 200), JSON.stringify(mr.map(r => `${r.method} ${r.status}`)), fT);
    rec(vp, J, 'the mirror answered in the thread', (await page.getByTestId('thread-panel').locator('li[data-testid="message"]').count()) >= 3, `thread rows=${await page.getByTestId('thread-panel').locator('li[data-testid="message"]').count()} text="${panelTxt.slice(-160)}"`, fT);
    rec(vp, J, 'no toast at all (20ms sampler)', composerVerdict(rows).maxToasts === 0, `max toasts=${composerVerdict(rows).maxToasts}`, fT);
    rec(vp, J, 'the field is empty afterwards', fieldAfter.trim() === '', `field="${fieldAfter.slice(0, 40)}"`, fT);
    rec(vp, J, 'one message only: no duplicate (database and screen)', msgCount === 1 && uiCount === 1, `database=${msgCount} screen=${uiCount}`, fT);
    rec(vp, J, 'the plain thread shows no canvas opener, Copy prompt or Updating…', !/Copy prompt|Want to save time|Give your mirror agent|Updating…/.test(panelTxt), panelTxt.slice(0, 160), fT);
  } finally {
    rec(vp, 'env', `every Supabase request went to (${J})`, [...HOSTS.keys()].every(h => h === new URL(process.env.VITE_SUPABASE_URL!).host), JSON.stringify(Object.fromEntries(HOSTS)));
    await ctx.close().catch(() => undefined);
    await deleteTestUser(user.user.id).catch(e => rec(vp, 'cleanup', 'delete user', false, String(e)));
  }
}

/**
 * S3b.4 and S3b.7, against the database itself. Clone tapped then cancelled changes no row of the owner's in canvas_drafts, canvas_versions, chat_messages or
 * canvas_draft_runs. The rename RPC refuses a non-owner, an empty title and one over 60 characters, and keeps the old title; it trims what it accepts.
 */
async function databaseProofs(browser: Browser) {
  const J = 'Proofs';
  const vp = 1440;
  const user = await createTestUser({ name: 'P1536 Walk Proofs Owner' });
  const other = await createTestUser({ name: 'P1536 Walk Proofs Other' });
  try {
    const { api } = await ownerApi(user.email);
    const { api: otherApi } = await ownerApi(other.email);
    const { data: opened, error } = await api.rpc('canvas_draft_open', { p_from_version: null });
    if (error) throw new Error(`canvas_draft_open: ${error.message}`);
    const name = (opened as { canvas_name: string }).canvas_name;
    const d1 = (await supabaseAdmin.from('canvas_drafts').select('id,version_name,version_id,revision,canvas_id,conversation_id').eq('owner_id', user.user.id).eq('state', 'open').limit(1).maybeSingle()).data!;
    await seedDraftPoints(user.user.id, d1.id, d1.version_name, SEED_FIRST);
    const pub = await api.rpc('canvas_draft_publish', { p_draft: d1.id, p_expected_revision: d1.revision });
    rec(vp, J, 'fixture: one published version, no open draft', !pub.error, JSON.stringify(pub.error ?? 'ok'));

    const titleNow = async () => (await supabaseAdmin.from('canvases').select('title').eq('id', d1.canvas_id).single()).data?.title ?? null;
    const refused = async (client: SupabaseClient, title: string) => (await client.rpc('canvas_rename', { p_canvas: d1.canvas_id, p_title: title })).error?.code ?? 'accepted';
    const before = await titleNow();
    const byOther = await refused(otherApi, 'Taken over');
    rec(vp, J, 'S3b.7 rename: a non-owner is refused (42501), title unchanged', byOther === '42501' && (await titleNow()) === before, `code=${byOther}`);
    const empty = await refused(api, '   ');
    rec(vp, J, 'S3b.7 rename: an empty title is refused (22023), title unchanged', empty === '22023' && (await titleNow()) === before, `code=${empty}`);
    const long = await refused(api, 'x'.repeat(61));
    rec(vp, J, 'S3b.7 rename: 61 characters are refused (22023), title unchanged', long === '22023' && (await titleNow()) === before, `code=${long}`);
    const ok = await api.rpc('canvas_rename', { p_canvas: d1.canvas_id, p_title: `  ${'y'.repeat(60)}  ` });
    rec(vp, J, 'S3b.7 rename: 60 characters are accepted and trimmed', !ok.error && (await titleNow()) === 'y'.repeat(60), JSON.stringify(ok.error ?? ok.data).slice(0, 90));
    const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const byAnon = await refused(anon, 'Signed out');
    rec(vp, J, 'S3b.7 rename: signed out is refused', byAnon !== 'accepted', `code=${byAnon}`);

    /** Every row of this owner's that S3b.4 names, with what would show a change. */
    const rows = async () => {
      const q = async (table: string, cols: string, column: string, value: string) => {
        const { data, error: e, count } = await supabaseAdmin.from(table).select(cols, { count: 'exact' }).eq(column, value).order('id');
        if (e) throw new Error(`${table}: ${e.message}`);
        return { count, data };
      };
      return JSON.stringify({
        canvas_drafts: await q('canvas_drafts', 'id,state,revision', 'owner_id', user.user.id),
        canvas_versions: await q('canvas_versions', 'id,name,published_seq', 'owner_id', user.user.id),
        chat_messages: await q('chat_messages', 'id,edited_at,deleted_at', 'conversation_id', d1.conversation_id),
        canvas_draft_runs: await q('canvas_draft_runs', 'id,state', 'owner_id', user.user.id),
      });
    };
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE });
    await ctx.addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } });
    attachWatchers(ctx, vp, { j: J });
    const page = await ctx.newPage();
    try {
      await setTestSession(page, user.email);
      await page.goto(`/p/${user.slug}/canvas/${name}?v=${d1.version_name}`);
      await expect(page.getByTestId('canvas-clone')).toBeVisible({ timeout: 45_000 });
      const pre = await rows();
      const preCounts = JSON.parse(pre) as Record<string, { count: number }>;
      rec(vp, J, 'S3b.4 fixture: rows read before the tap', true, Object.entries(preCounts).map(([k, v]) => `${k}=${v.count}`).join(' '));
      await page.getByTestId('canvas-clone').click();
      await expect(page).toHaveURL(/ws=1/, { timeout: 15_000 });
      await expect(page.getByTestId('canvas-clone-state')).toBeVisible({ timeout: 15_000 });
      const f1 = await shot(page, vp, J, 'clone-tapped');
      const tapped = await rows();
      rec(vp, J, 'S3b.4 Clone tapped: no row of the four tables created or changed', tapped === pre, tapped === pre ? 'identical' : `before=${pre.slice(0, 300)} after=${tapped.slice(0, 300)}`, f1);
      await page.getByRole('button', { name: /Close thread|Cancel/i }).first().click();
      await expect(page).not.toHaveURL(/ws=1/, { timeout: 15_000 });
      await page.waitForTimeout(1500);
      const f2 = await shot(page, vp, J, 'clone-cancelled');
      const cancelled = await rows();
      rec(vp, J, 'S3b.4 Clone cancelled: no row of the four tables created or changed', cancelled === pre, cancelled === pre ? 'identical' : `before=${pre.slice(0, 300)} after=${cancelled.slice(0, 300)}`, f2);
      // CONTROL: the comparison can see a change. A real write (opening a draft from the published version) must make it differ, or "identical" above proves nothing.
      const write = await api.rpc('canvas_draft_open', { p_from_version: d1.version_id });
      const wrote = await rows();
      rec(vp, J, 'S3b.4 CONTROL: a real write makes the comparison differ', !write.error && wrote !== pre, `write=${JSON.stringify(write.error ?? 'ok').slice(0, 80)} differs=${wrote !== pre}`);
    } finally {
      await ctx.close().catch(() => undefined);
    }
  } finally {
    await deleteTestUser(user.user.id).catch(e => rec(vp, 'cleanup', 'delete owner', false, String(e)));
    await deleteTestUser(other.user.id).catch(e => rec(vp, 'cleanup', 'delete other', false, String(e)));
  }
}

async function tBoxValue(page: Page): Promise<string> {
  const b = page.getByTestId('thread-panel').getByTestId('composer').getByRole('textbox').first();
  return (await b.inputValue().catch(async () => (await b.textContent()) ?? '')) ?? '';
}

/**
 * The header at REAL phone widths: touch, mobile-emulated contexts (overlay scrollbars) at 320, 360 and 400, on a draft with a picker and the name
 * "Acme Bakery Plan". The fixture (a published v1 and a draft from it) is made by RPCs and service-role points: it is not the thing under test.
 */
async function widthsWalk(browser: Browser) {
  const J = 'Widths';
  const user = await createTestUser({ name: 'P1536 Walk Widths' });
  try {
    const { api } = await ownerApi(user.email);
    const { data: opened, error } = await api.rpc('canvas_draft_open', { p_from_version: null });
    if (error) throw new Error(`canvas_draft_open: ${error.message}`);
    const name = (opened as { canvas_name: string }).canvas_name;
    const d1 = (await supabaseAdmin.from('canvas_drafts').select('id,version_name,version_id,revision,canvas_id').eq('owner_id', user.user.id).eq('state', 'open').limit(1).maybeSingle()).data!;
    await seedDraftPoints(user.user.id, d1.id, d1.version_name, SEED_FIRST);
    const pub = await api.rpc('canvas_draft_publish', { p_draft: d1.id, p_expected_revision: d1.revision });
    const clone = await seedCloneDraft(api, user.user.id, d1.version_id);
    const ren = await api.rpc('canvas_rename', { p_canvas: d1.canvas_id, p_title: 'Acme Bakery Plan' });
    rec(0, J, 'fixture: published v1, a draft from it, renamed "Acme Bakery Plan" (RPCs and service-role points)', !pub.error && !ren.error, `publish=${JSON.stringify(pub.data ?? pub.error).slice(0, 80)} rename=${JSON.stringify(ren.data ?? ren.error)}`);
    const path = `/p/${user.slug}/canvas/${name}`;
    for (const w of [320, 360, 400]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 700 }, baseURL: BASE, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      await ctx.addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } });
      const cur = { j: J };
      attachWatchers(ctx, w, cur);
      const page = await ctx.newPage();
      try {
        await setTestSession(page, user.email);
        await step(w, J, `width-${w}`, async () => {
          await page.goto(`${path}?v=${d1.version_name}`);
          await expect(page.getByTestId('publish-spot')).toBeVisible({ timeout: 30_000 });
          await expect.poll(async () => (await snap(page)).spotText, { timeout: 20_000, intervals: [300] }).toBe('Published · v1').catch(() => undefined);
          await page.waitForTimeout(1200);
          const sP = await snap(page);
          await shot(page, w, 'Pixel', 'touch-published');
          await page.goto(`${path}?v=${clone.version_name}&ws=1`);
          await expect(page.getByTestId('publish-spot')).toBeVisible({ timeout: 30_000 });
          await page.waitForTimeout(2500);
          const sD = await snap(page);
          const fD = await shot(page, w, 'Pixel', 'touch-draft-with-picker');
          rec(w, J, `real ${w}: innerWidth is ${w} (touch, mobile context)`, sD.innerWidth === w, `innerWidth=${sD.innerWidth} scrollWidth=${sD.scrollWidth}`, fD);
          rec(w, J, `real ${w}: no horizontal overflow`, sD.scrollWidth <= sD.innerWidth && sP.scrollWidth <= sP.innerWidth, `draft scrollWidth=${sD.scrollWidth} published scrollWidth=${sP.scrollWidth} innerWidth=${sD.innerWidth}`, fD);
          rec(w, J, `real ${w}: at most two rows`, (sD.barRows ?? 9) <= 2, `rows=${sD.barRows} barH=${sD.barBox?.h}`, fD);
          rec(w, J, `real ${w}: the word Draft is fully shown`, !!sD.tagInfo && sD.tagInfo.text.startsWith('Draft') && sD.tagInfo.inside >= 5, `tag=${JSON.stringify(sD.tagInfo)} picker="${sD.pickerText}"`, fD);
          rec(w, J, `real ${w}: the name "Acme Bakery Plan" shows at least 3 letters (plus an ellipsis when cut)`, !!sD.titleInfo && sD.titleInfo.inside >= 3 && (sD.titleInfo.clipped || sD.titleInfo.inside === sD.titleInfo.total), `name=${JSON.stringify(sD.titleInfo)}`, fD);
          rec(w, J, `real ${w}: the Publish spot's box is unchanged between the published view and the draft (right gap, top, size)`, sameSig(spotSig(sP), spotSig(sD)), `published=${JSON.stringify(spotSig(sP))} draft=${JSON.stringify(spotSig(sD))}`, fD);
          rec(w, J, `real ${w}: the pencil ${w >= 360 ? 'is shown' : 'gives way (tapping the name renames)'}`, w >= 360 ? sD.rename : !sD.rename, `pencil visible=${sD.rename}`, fD);
          rec(w, J, `real ${w}: the name and the tag fit (no clipped Draft, name 3+ letters)`, !!sD.tagInfo && !sD.tagInfo.clipped && !!sD.titleInfo && sD.titleInfo.inside >= 3, `tag=${JSON.stringify(sD.tagInfo)} name=${JSON.stringify(sD.titleInfo)}`, fD);
          const overlay = page.getByTestId('canvas-rename-name');
          const overlayShown = await overlay.isVisible().catch(() => false);
          const target = overlayShown ? overlay : page.getByTestId('canvas-rename');
          await target.tap({ timeout: 8000 });
          const input = page.getByTestId('canvas-title-input');
          const open = await input.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
          const fR = await shot(page, w, 'Pixel', 'touch-rename-open');
          rec(w, J, `real ${w}: tapping the name${overlayShown ? ' (its "Edit name" overlay button, which sits on top of the h1)' : ' / the pencil'} opens the rename input`, open, `overlay button shown=${overlayShown} pencil=${sD.rename} input visible=${open}`, fR);
          if (open) await page.keyboard.press('Escape');
        });
      } finally {
        rec(w, 'env', `every Supabase request went to (Widths ${w})`, [...HOSTS.keys()].every(h => h === new URL(process.env.VITE_SUPABASE_URL!).host), JSON.stringify(Object.fromEntries(HOSTS)));
        await ctx.close().catch(() => undefined);
      }
    }
  } finally {
    await deleteTestUser(user.user.id).catch(e => rec(0, 'cleanup', 'delete user', false, String(e)));
  }
}

// ======================================================================================================================
// Narrow re-check cells for the rename overlay, the name width, the send status from the tap, failed reads, the card after a
// rename, Clone on a fresh load and the ordinary mirror chat. Fixtures here are seeded (RPCs and service-role points) and are
// not what is under test.
// ======================================================================================================================

/** A published v1 and (optionally) a draft from it, named `title`. */
async function draftFixture(user: TestUser, title = 'Acme Bakery Plan', withClone = true) {
  const { api } = await ownerApi(user.email);
  const { data: opened, error } = await api.rpc('canvas_draft_open', { p_from_version: null });
  if (error) throw new Error(`canvas_draft_open: ${error.message}`);
  const name = (opened as { canvas_name: string }).canvas_name;
  const d1 = (await supabaseAdmin.from('canvas_drafts').select('id,version_name,version_id,revision,canvas_id,conversation_id,thread_root_id').eq('owner_id', user.user.id).eq('state', 'open').limit(1).maybeSingle()).data!;
  await seedDraftPoints(user.user.id, d1.id, d1.version_name, SEED_FIRST);
  const pub = await api.rpc('canvas_draft_publish', { p_draft: d1.id, p_expected_revision: d1.revision });
  if (pub.error) throw new Error(`publish: ${pub.error.message}`);
  const clone = withClone ? await seedCloneDraft(api, user.user.id, d1.version_id) : null;
  await api.rpc('canvas_rename', { p_canvas: d1.canvas_id, p_title: title });
  return { api, name, d1, clone, canvasId: d1.canvas_id as string, path: `/p/${user.slug}/canvas/${name}` };
}

async function sessionPage(browser: Browser, user: TestUser, w: number, h: number, touch: boolean, tag: string) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, baseURL: BASE, ...(touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } });
  attachWatchers(ctx, w, { j: tag });
  const page = await ctx.newPage();
  await setTestSession(page, user.email);
  return { ctx, page };
}

const hostOk = () => [...HOSTS.keys()].every(h => h === new URL(process.env.VITE_SUPABASE_URL!).host);
const alphaOf = (c: string) => { const m = c.match(/[\d.]+/g); return m && m.length >= 4 ? Number(m[3]) : 1; };

/** Items 1 and 2: the rename input and the name's width, with a picker and "Acme Bakery Plan", at real widths. */
async function renameWidths(browser: Browser) {
  const user = await createTestUser({ name: 'P1536 Walk N1' });
  try {
    const fx = await draftFixture(user);
    for (const w of [320, 360, 375, 390, 400, 639, 641, 1279, 1280, 1440]) {
      const touch = w <= 641;
      const rowsMax = w >= 1280 ? 1 : 2;
      await fx.api.rpc('canvas_rename', { p_canvas: fx.canvasId, p_title: 'Acme Bakery Plan' });
      const { ctx, page } = await sessionPage(browser, user, w, w >= 1279 ? 900 : 700, touch, 'N1');
      try {
        await step(w, 'N1', `rename-width-${w}`, async () => {
          await page.goto(`${fx.path}?v=${fx.d1.version_name}`);
          await expect.poll(async () => (await snap(page)).spotText, { timeout: 40_000, intervals: [300] }).toBe('Published · v1').catch(() => undefined);
          await page.waitForTimeout(800);
          const sP = await snap(page);
          await page.goto(`${fx.path}?v=${fx.clone!.version_name}&ws=1`);
          await expect.poll(async () => (await snap(page)).state ?? '', { timeout: 40_000, intervals: [300] }).toMatch(/^Draft/).catch(() => undefined);
          await page.waitForTimeout(1200);
          const sD = await snap(page);
          const f2 = await shot(page, w, 'N2', 'name-with-picker');
          const nm = sD.titleInfo;
          rec(w, 'N2', `@${w}: innerWidth is ${w}, no horizontal overflow, ${rowsMax === 1 ? 'one row' : 'two rows at most'}`, sD.innerWidth === w && sD.scrollWidth <= sD.innerWidth && (sD.barRows ?? 9) <= rowsMax, `innerWidth=${sD.innerWidth} scrollWidth=${sD.scrollWidth} rows=${sD.barRows} barH=${sD.barBox?.h}`, f2);
          rec(w, 'N2', `@${w}: "Draft" fully shown`, !!sD.tagInfo && sD.tagInfo.text.startsWith('Draft') && sD.tagInfo.inside >= 5, `tag=${JSON.stringify(sD.tagInfo)}`, f2);
          rec(w, 'N2', `@${w}: visible characters of "Acme Bakery Plan"`, null, nm ? `${nm.inside} of ${nm.total}: "${nm.text.slice(0, nm.inside)}${nm.clipped ? '…' : ''}" in a ${nm.w}px box (clipped=${nm.clipped})` : 'name not visible', f2);
          // open the rename input the way a person would (a finger on a phone)
          const overlay = page.getByTestId('canvas-rename-name');
          const useOverlay = await overlay.isVisible().catch(() => false);
          const opener = useOverlay ? overlay : page.getByTestId('canvas-rename');
          const open = async () => { if (touch) await opener.tap({ timeout: 8000 }); else await opener.click(); await page.getByTestId('canvas-title-input').waitFor({ timeout: 6000 }); await page.waitForTimeout(250); };
          await open();
          const m = await page.evaluate(() => {
            const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
            const r = (e: HTMLElement | null) => (e ? (b => ({ x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, left: b.left }))(e.getBoundingClientRect()) : null);
            const inp = q('canvas-title-input') as HTMLInputElement;
            const spot = q('publish-spot'); const back = q('workspace-back'); const picker = q('canvas-version-picker'); const tag = q('canvas-state');
            const centre = (e: HTMLElement | null) => { if (!e) return null; const b = e.getBoundingClientRect(); return b.width > 0 ? [b.x + b.width / 2, b.y + b.height / 2] : null; };
            const who = (pt: number[] | null) => {
              if (!pt) return null;
              const el = document.elementFromPoint(pt[0], pt[1]);
              if (!el) return null;
              if (el === inp) return 'input';
              if (spot?.contains(el)) return 'spot';
              if (picker?.contains(el)) return 'picker';
              if (tag?.contains(el)) return 'tag';
              return el.tagName.toLowerCase() + (el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : '');
            };
            return { input: r(inp), back: r(back), spot: r(spot), picker: r(picker), tag: r(tag), scrollW: inp?.scrollWidth, clientW: inp?.clientWidth, position: getComputedStyle(inp).position, bg: getComputedStyle(inp).backgroundColor,
              atSpot: who(centre(spot)), atPicker: who(centre(picker)), atTag: who(centre(tag)), value: inp?.value, innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth };
          });
          const fE = await shot(page, w, 'N1', 'rename-editing');
          const spotSame = !!m.spot && !!sD.spotBox && (['x', 'y', 'w', 'h'] as const).every(k => Math.abs((m.spot as Record<string, number>)[k] - (sD.spotBox as Record<string, number>)[k]) <= 1);
          const ib = m.input;
          const overlap = (a: { left: number; right: number } | null, b: { left: number; right: number } | null) => !!a && !!b && a.left < b.right - 1 && a.right > b.left + 1;
          rec(w, 'N1', `@${w}: input box ${ib ? `x ${Math.round(ib.left)}..${Math.round(ib.right)}, width ${Math.round(ib.w)}px, height ${Math.round(ib.h)}px` : 'missing'}; back arrow ends ${m.back ? Math.round(m.back.right) : '?'}, Publish spot starts ${m.spot ? Math.round(m.spot.left) : '?'}`, null, JSON.stringify({ input: ib, back: m.back, spot: m.spot }), fE);
          rec(w, 'N1', `@${w}: the whole name is readable in the input (scrollWidth - clientWidth is ${(m.scrollW ?? 0) - (m.clientW ?? 0)}px, up to 2px allowed)`, (m.scrollW ?? 0) - (m.clientW ?? 0) <= 2, `scrollWidth=${m.scrollW} clientWidth=${m.clientW} difference=${(m.scrollW ?? 0) - (m.clientW ?? 0)}px value="${m.value}"`, fE);
          rec(w, 'N1', `@${w}: the Publish spot is fully visible, not overlapped, and its box is unchanged`, m.atSpot === 'spot' && spotSame, `top element at the spot's centre=${m.atSpot} spot before=${JSON.stringify(sD.spotBox)} while editing=${JSON.stringify(m.spot)}`, fE);
          rec(w, 'N1', `@${w}: no horizontal overflow while editing`, m.scrollWidth <= m.innerWidth, `scrollWidth=${m.scrollWidth} innerWidth=${m.innerWidth}`, fE);
          if (w < 1280) {
            rec(w, 'N1', `@${w}: the input lies over row 1 from after the back arrow to before the Publish spot`, m.position === 'absolute' && !!ib && !!m.back && !!m.spot && ib.left >= m.back.right - 1 && ib.right <= m.spot.left + 1, `position=${m.position} input ${ib ? Math.round(ib.left) + '..' + Math.round(ib.right) : ''}`, fE);
            rec(w, 'N1', `@${w}: the picker and the state tag do not show through (the input is opaque and on top of them)`, alphaOf(m.bg) >= 0.99 && (m.atPicker === 'input' || m.picker === null) && (m.atTag === 'input' || m.atTag === null), `bg=${m.bg} top element at the picker's centre=${m.atPicker}, at the tag's centre=${m.atTag}`, fE);
          } else {
            rec(w, 'N1', `@${w}: the input stays inline, nothing overlaid`, m.position !== 'absolute' && !overlap(ib, m.picker) && !overlap(ib, m.tag) && m.atPicker !== 'input', `position=${m.position} top element at the picker's centre=${m.atPicker}, at the tag's centre=${m.atTag}`, fE);
          }
          const input = page.getByTestId('canvas-title-input');
          const rowOk = async (label: string, wantTitle: string) => {
            await expect.poll(async () => (await snap(page)).title, { timeout: 15_000, intervals: [300] }).toBe(wantTitle).catch(() => undefined);
            await page.waitForTimeout(600);
            const s2 = await snap(page);
            const inputGone = (await input.count()) === 0;
            const sig = !!s2.spotBox && !!sD.spotBox && (['x', 'y', 'w', 'h'] as const).every(k => Math.abs((s2.spotBox as Record<string, number>)[k] - (sD.spotBox as Record<string, number>)[k]) <= 1);
            const f = await shot(page, w, 'N1', label);
            rec(w, 'N1', `@${w}: ${label}: title "${wantTitle}", input gone, row back to normal (rows, spot box, no overflow)`, s2.title === wantTitle && inputGone && (s2.barRows ?? 9) <= rowsMax && sig && s2.scrollWidth <= s2.innerWidth, `title="${s2.title}" inputGone=${inputGone} rows=${s2.barRows} spotSame=${sig} scrollWidth=${s2.scrollWidth}`, f);
          };
          await input.fill(`Saved ${w}`);
          await page.keyboard.press('Enter');
          await rowOk('enter-saves', `Saved ${w}`);
          await open();
          await input.fill('zzz discarded');
          await page.keyboard.press('Escape');
          await rowOk('escape-reverts', `Saved ${w}`);
          await open();
          await input.fill(`Blur ${w}`);
          await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
          await rowOk('blur-saves', `Blur ${w}`);
          void sP;
        });
      } finally {
        await ctx.close().catch(() => undefined);
      }
    }
  } finally {
    rec(0, 'env', 'every Supabase request went to (N1)', hostOk(), JSON.stringify(Object.fromEntries(HOSTS)));
    await deleteTestUser(user.user.id).catch(e => rec(0, 'cleanup', 'delete user', false, String(e)));
  }
}

/** Item 3: the send status from the tap, natural timing (a fresh New canvas, Send as soon as the textbox exists). `double` sends twice quickly. */
async function sendStatus(browser: Browser, vp: number, height: number, double: boolean) {
  const J = double ? 'N3-double' : 'N3-status';
  const { user, ctx, page, cur } = await newOwner(browser, vp, height, `P1536 Walk ${J} ${vp}`);
  cur.j = J;
  try {
    await toCanvasesTab(page);
    await page.getByTestId('artifacts-new-canvas').click();
    await page.waitForURL(/\/canvas\/canvas/, { timeout: 45_000 });
    const box = composerBox(page);
    await box.waitFor({ state: 'visible', timeout: 30_000 });
    const sends: Array<{ t: number; status: number }> = [];
    page.on('response', r => { if (/rpc\/canvas_workspace_send/.test(r.url())) sends.push({ t: Date.now(), status: r.status() }); });
    await startLogs(page, user.name);
    const w0 = Date.now();
    await startComposerLog(page);
    const pageT0 = (w0 + Date.now()) / 2;
    // the reply's STORE time, from the database (created_at), and when the poller first saw it (an upper bound)
    const store: { createdAt: number | null; seenAt: number | null } = { createdAt: null, seenAt: null };
    let polling = true;
    const poller = (async () => {
      while (polling && store.seenAt === null) {
        try {
          const d = (await supabaseAdmin.from('canvas_drafts').select('thread_root_id').eq('owner_id', user.user.id).limit(1).maybeSingle()).data;
          if (d?.thread_root_id) {
            const m = (await supabaseAdmin.from('chat_messages').select('created_at').eq('thread_root_id', d.thread_root_id).not('canvas_run_id', 'is', null).order('created_at', { ascending: true }).limit(1).maybeSingle()).data;
            if (m?.created_at) { store.createdAt = Date.parse(m.created_at); store.seenAt = Date.now(); break; }
          }
        } catch { /* keep polling */ }
        await new Promise(r => setTimeout(r, 120));
      }
    })();
    await box.click();
    await box.fill('Acme Test Bakery sells sourdough loaves to office managers in Tallinn. We charge 12 euros per person per week.');
    const send = page.locator('[data-composer-send]').first();
    if (double) await send.click({ clickCount: 2, delay: 0 }); else await send.click();
    await expect.poll(async () => (await snap(page)).spotState, { timeout: 240_000, intervals: [200] }).toBe('publish').catch(() => undefined);
    await page.waitForTimeout(800);
    polling = false; await poller;
    const { rows, tap } = await readComposerLogFull(page);
    const logs = await readLogs(page);
    const v = spotVerdict(logs.spot);
    const f = await shot(page, vp, J, 'run-done');
    if (double) {
      rec(vp, J, 'two quick taps: exactly one canvas_workspace_send', sends.length === 1 && sends[0].status === 200, `calls=${JSON.stringify(sends.map(x => x.status))}`, f);
      const msgs = (await supabaseAdmin.from('chat_messages').select('id').eq('author_id', user.user.id).not('body', 'is', null)).data ?? [];
      rec(vp, J, 'two quick taps: one stored message', msgs.length === 1, `stored owner messages with text=${msgs.length}`, f);
      return;
    }
    const after = tap === null ? [] : rows.filter(r => r[0] >= tap);
    const firstUpd = after.find(r => r[1]);
    const shownAt = after.find(r => r[7])?.[0] ?? null;
    const storedAt = store.createdAt === null ? null : Math.round(store.createdAt - pageT0);
    const seenAtPage = store.seenAt === null ? null : Math.round(store.seenAt - pageT0);
    const replyAt = storedAt ?? shownAt;
    const window_ = replyAt === null ? after : after.filter(r => r[0] < replyAt);
    const bare = window_.filter(r => !r[1] && r[2].trim() === '');
    const bareToShown = after.filter(r => (shownAt === null || r[0] < shownAt) && !r[1] && r[2].trim() === '');
    rec(vp, J, 'the slot reads Updating… within 100 ms of the tap', !!firstUpd && firstUpd[0] - (tap ?? 0) <= 100, `tap at ${tap}ms; first Updating… at ${firstUpd?.[0]}ms; gap ${firstUpd && tap !== null ? firstUpd[0] - tap : 'none'}ms; send call ${sends[0] ? 'present' : 'missing'}`, f);
    rec(vp, J, 'from the tap until the reply is stored, every sample has the status or the text', bare.length === 0 && replyAt !== null, `samples in the window=${window_.length} (tap ${tap}ms .. reply STORED at ${storedAt}ms by the database's created_at [first seen by the poller at ${seenAtPage}ms], shown in the thread at ${shownAt}ms; samples after the store are dropped: ${after.length - window_.length}) with neither status nor text in the window=${bare.length} ${bare.slice(0, 6).map(r => `${r[0]}ms`).join(',')}; for comparison, bare samples before the reply was SHOWN=${bareToShown.length}`, f);
    rec(vp, J, 'one canvas_workspace_send (200), no toast', sends.length === 1 && sends[0].status === 200 && composerVerdict(rows).maxToasts === 0, `calls=${JSON.stringify(sends.map(x => x.status))} max toasts=${composerVerdict(rows).maxToasts}${rows.find(r => r[8]) ? ` first toast at ${rows.find(r => r[8])![0]}ms: "${rows.find(r => r[8])![8]}"` : ''}`, f);
    rec(vp, J, 'the spot never shows not-published, no-changes or loading between Updating… and Publish', v.sawUpdating && v.bad.length === 0 && v.last === 'publish', v.text, f);
  } finally {
    rec(vp, 'env', `every Supabase request went to (${J})`, hostOk(), JSON.stringify(Object.fromEntries(HOSTS)));
    await ctx.close().catch(() => undefined);
    await deleteTestUser(user.user.id).catch(e => rec(vp, 'cleanup', 'delete user', false, String(e)));
  }
}

/** Item 4: a failed read. `immediate`: the draft read is aborted from the start (Retry, then reads allowed and a Send goes through). `typed`: the read stalls 6s then fails; text typed meanwhile joins the sent text. */
async function failedRead(browser: Browser, vp: number, height: number, mode: 'immediate' | 'typed') {
  const J = mode === 'immediate' ? 'N4-failed-read' : 'N4-typed-while-waiting';
  const A = 'Acme Test Bakery sells sourdough loaves to office managers in Tallinn.';
  const B = 'second thought typed while waiting';
  const { user, ctx, page, cur } = await newOwner(browser, vp, height, `P1536 Walk ${J} ${vp}`);
  cur.j = J;
  try {
    const handler = mode === 'immediate'
      ? async (route: import('@playwright/test').Route) => { await route.abort(); }
      : async (route: import('@playwright/test').Route) => { await new Promise(r => setTimeout(r, 6000)); await route.abort().catch(() => undefined); };
    await page.route(DRAFT_THREAD_READ, handler);
    await toCanvasesTab(page);
    await page.getByTestId('artifacts-new-canvas').click();
    await page.waitForURL(/\/canvas\/canvas/, { timeout: 45_000 });
    const box = composerBox(page);
    await box.waitFor({ state: 'visible', timeout: 30_000 });
    const sends: number[] = [];
    page.on('response', r => { if (/rpc\/canvas_workspace_send/.test(r.url())) sends.push(r.status()); });
    await startComposerLog(page);
    await box.click();
    await box.fill(A);
    await page.locator('[data-composer-send]').first().click();
    if (mode === 'typed') {
      await page.waitForTimeout(700);
      const slot = await composerState(page);
      await box.click();
      await box.pressSequentially(B, { delay: 5 });
      rec(vp, J, 'while the Send waits the slot reads Updating… and typing is accepted', !!slot && /Updating…/.test(slot.text) && (await boxText(page)).includes(B), `slot="${slot?.text}" field now="${(await boxText(page)).slice(0, 60)}"`);
    }
    // wait for the toast (the failure), then read the field
    await expect.poll(async () => page.locator('[data-sonner-toast]').count(), { timeout: 45_000, intervals: [300] }).toBeGreaterThan(0).catch(() => undefined);
    await page.waitForTimeout(1500);
    const field = await boxText(page);
    const toasts = await page.locator('[data-sonner-toast]').count();
    const pane = (await snap(page)).panelText;
    const pageTxt = await page.locator('body').innerText();
    const fF = await shot(page, vp, J, 'failed-read');
    const retry = page.getByRole('button', { name: /^Retry$/ });
    const retryShown = await retry.first().isVisible().catch(() => false);
    rec(vp, J, 'one toast', toasts === 1, `toasts=${toasts} text="${((await page.locator('[data-sonner-toast]').first().textContent().catch(() => '')) ?? '').trim()}"`, fF);
    rec(vp, J, 'no "This thread is empty."', !/This thread is empty\./.test(pageTxt), `pane="${pane.slice(0, 160)}"`, fF);
    rec(vp, J, 'Retry is shown where the draft should be', retryShown, `Retry visible=${retryShown}; "${/Could not load[^.]*\./.exec(pageTxt)?.[0] ?? ''}"`, fF);
    if (mode === 'immediate') {
      rec(vp, J, 'the text comes back into the field', field.includes('Acme Test Bakery'), `field="${field.slice(0, 60)}"`, fF);
      rec(vp, J, 'no send, no stored message', sends.length === 0 && ((await supabaseAdmin.from('chat_messages').select('id').eq('author_id', user.user.id).not('body', 'is', null)).data ?? []).length === 0, `sends=${sends.length}`, fF);
      await page.unroute(DRAFT_THREAD_READ, handler);
      await startLogs(page, user.name);
      await retry.first().click();
      const draftShown = await page.getByTestId('canvas-opener').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
      const fR = await shot(page, vp, J, 'after-retry');
      rec(vp, J, 'Retry, once reads are allowed again, shows the draft (opener and composer back)', draftShown && !(await retry.first().isVisible().catch(() => false)), `opener visible=${draftShown}`, fR);
      await page.waitForTimeout(900);
      const fitR = await fieldFit(page);
      const fRt = await shot(page, vp, J, 'restored-after-retry');
      // eslint-disable-next-line @typescript-eslint/no-use-before-define -- a helper defined with its siblings below; it is only called at run time
      rec(vp, J, 'after Retry (Upload back) the restored text is not clipped: scrollHeight vs clientHeight', !clipped(fitR) && !!fitR?.uploadShown, JSON.stringify(fitR), fRt);
      await box.click();
      await page.locator('[data-composer-send]').first().click();
      await expect.poll(() => sends.length, { timeout: 40_000, intervals: [200] }).toBeGreaterThan(0).catch(() => undefined);
      await expect.poll(async () => (await snap(page)).spotState, { timeout: 240_000, intervals: [200] }).toBe('publish').catch(() => undefined);
      const fS = await shot(page, vp, J, 'send-after-retry');
      rec(vp, J, 'a Send after Retry goes through: one canvas_workspace_send, run ends in Publish', sends.length === 1 && sends[0] === 200 && (await snap(page)).spotState === 'publish', `calls=${JSON.stringify(sends)} spot=${(await snap(page)).spotText}`, fS);
    } else {
      const ia = field.indexOf(A.slice(0, 20));
      const ib = field.indexOf(B);
      rec(vp, J, 'both texts are in the field, the sent one first', ia >= 0 && ib > ia, `field="${field}"`, fF);
      rec(vp, J, 'no send, no stored message', sends.length === 0, `sends=${sends.length}`, fF);
    }
  } finally {
    rec(vp, 'env', `every Supabase request went to (${J})`, hostOk(), JSON.stringify(Object.fromEntries(HOSTS)));
    await ctx.close().catch(() => undefined);
    await deleteTestUser(user.user.id).catch(e => rec(vp, 'cleanup', 'delete user', false, String(e)));
  }
}


/** The message field's fit: is the text clipped (scrollHeight beyond clientHeight with no scrollbar)? And is Upload back beside it? */
async function fieldFit(page: Page) {
  return page.evaluate(() => {
    const tas = [...document.querySelectorAll('[data-testid="composer"] textarea')] as HTMLTextAreaElement[];
    const ta = tas.find(t => t.getBoundingClientRect().width > 0);
    if (!ta) return null;
    const up = document.querySelector('[data-testid="canvas-upload"]') as HTMLElement | null;
    return { scrollHeight: ta.scrollHeight, clientHeight: ta.clientHeight, width: Math.round(ta.getBoundingClientRect().width), overflowY: getComputedStyle(ta).overflowY, valueLen: ta.value.length, uploadShown: !!up && up.getBoundingClientRect().width > 0 };
  });
}
const clipped = (f: Awaited<ReturnType<typeof fieldFit>>) => !f || (f.scrollHeight > f.clientHeight + 1 && !/auto|scroll/.test(f.overflowY));

/** N4, 375: the failed Send's text is restored while the Canvas tab is showing (the thread pane hidden); then Thread is shown; then Retry. */
async function failedReadCanvasTab(browser: Browser) {
  const vp = 375;
  const J = 'N4-canvas-tab';
  const A = 'Acme Test Bakery sells sourdough loaves to office managers in Tallinn.';
  const { user, ctx, page, cur } = await newOwner(browser, vp, 812, `P1536 Walk ${J}`);
  cur.j = J;
  try {
    const handler = async (route: import('@playwright/test').Route) => { await new Promise(r => setTimeout(r, 6000)); await route.abort().catch(() => undefined); };
    await page.route(DRAFT_THREAD_READ, handler);
    await toCanvasesTab(page);
    await page.getByTestId('artifacts-new-canvas').click();
    await page.waitForURL(/\/canvas\/canvas/, { timeout: 45_000 });
    const box = composerBox(page);
    await box.waitFor({ state: 'visible', timeout: 30_000 });
    await box.click();
    await box.fill(A);
    await page.locator('[data-composer-send]').first().click();
    await page.getByTestId('workspace-view-canvas').click();
    const paneHidden = !(await page.getByTestId('thread-panel').isVisible().catch(() => false));
    await expect.poll(async () => page.locator('[data-sonner-toast]').count(), { timeout: 45_000, intervals: [300] }).toBeGreaterThan(0).catch(() => undefined);
    await page.waitForTimeout(1500);
    const stillCanvas = !(await page.getByTestId('thread-panel').isVisible().catch(() => false));
    rec(vp, J, 'the text was restored while the Canvas tab was showing (the thread pane hidden)', paneHidden && stillCanvas, `pane hidden at the Send=${paneHidden} still hidden at the toast=${stillCanvas}`, await shot(page, vp, J, 'canvas-tab-at-failure'));
    await page.getByTestId('workspace-view-chat').click();
    await page.waitForTimeout(900);
    const fit1 = await fieldFit(page);
    const f1 = await shot(page, vp, J, 'restored-after-switch-to-thread');
    rec(vp, J, 'after switching to Thread the restored text is not clipped', !clipped(fit1) && (fit1?.valueLen ?? 0) > 20, JSON.stringify(fit1), f1);
    await page.unroute(DRAFT_THREAD_READ, handler);
    await page.getByRole('button', { name: /^Retry$/ }).first().click();
    const draftShown = await page.getByTestId('canvas-opener').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(900);
    const fit2 = await fieldFit(page);
    const f2 = await shot(page, vp, J, 'restored-after-retry');
    rec(vp, J, 'after Retry (Upload back) the restored text is not clipped', draftShown && !clipped(fit2) && !!fit2?.uploadShown, `draft shown=${draftShown} ${JSON.stringify(fit2)}`, f2);
  } finally {
    rec(vp, 'env', `every Supabase request went to (${J})`, hostOk(), JSON.stringify(Object.fromEntries(HOSTS)));
    await ctx.close().catch(() => undefined);
    await deleteTestUser(user.user.id).catch(e => rec(vp, 'cleanup', 'delete user', false, String(e)));
  }
}

/** Item 5: the card in the thread and in the mirror chat after a rename, and cards on a fresh page. */
async function cardRename(browser: Browser) {
  const vp = 1440;
  const user = await createTestUser({ name: 'P1536 Walk N5' });
  try {
    const fx = await draftFixture(user, 'Acme Bakery Plan');
    // a never-published draft too, so a draft-version card exists in the mirror chat
    await fx.api.rpc('canvas_draft_open', { p_from_version: null });
    const { ctx, page } = await sessionPage(browser, user, vp, 900, false, 'N5');
    try {
      await step(vp, 'N5', 'card-after-rename', async () => {
        await page.goto(`${fx.path}?v=${fx.clone!.version_name}&ws=1`);
        const card = page.locator('[data-testid="thread-panel"] [data-testid="attachment-canvas_version"]').first();
        await card.waitFor({ timeout: 40_000 });
        await expect.poll(async () => (await card.innerText().catch(() => '')).includes('Acme Bakery Plan'), { timeout: 30_000, intervals: [300] }).toBe(true).catch(() => undefined);
        const before = (await card.innerText()).replace(/\s+/g, ' ');
        await page.evaluate(() => {
          const w = window as unknown as { __card?: { rows: Array<[number, string, number]>; stop: () => void } };
          w.__card?.stop();
          const t0 = performance.now();
          const rows: Array<[number, string, number]> = [];
          const timer = setInterval(() => {
            const c = document.querySelector('[data-testid="thread-panel"] [data-testid="attachment-canvas_version"]') as HTMLElement | null;
            rows.push([Math.round(performance.now() - t0), c ? c.innerText.replace(/\s+/g, ' ') : '(no card)', document.querySelectorAll('[data-testid="thread-panel"] [class*="animate-pulse"], [data-testid="thread-panel"] [data-testid*="skeleton"]').length]);
          }, 20);
          w.__card = { rows, stop: () => clearInterval(timer) };
        });
        const tEnter = Date.now();
        await page.getByTestId('canvas-rename').click();
        await page.getByTestId('canvas-title-input').fill('Renamed Card Name');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(6000);
        const rows = await page.evaluate(() => { const w = window as unknown as { __card?: { rows: Array<[number, string, number]>; stop: () => void } }; w.__card?.stop(); return w.__card?.rows ?? []; });
        const firstNew = rows.find(r => r[1].includes('Renamed Card Name'));
        const skeleton = rows.filter(r => r[2] > 0 || r[1] === '(no card)');
        const fC = await shot(page, vp, 'N5', 'card-after-rename');
        rec(vp, 'N5', 'the thread card shows the new name without a reload', !!firstNew, `before="${before}" first new text at ${firstNew?.[0]}ms after the sampler started (Enter pressed about ${Date.now() - tEnter - 6000}ms before the 6s wait began) "${firstNew?.[1]}"`, fC);
        rec(vp, 'N5', 'no skeleton or missing card in the thread at any 20ms sample after Enter', skeleton.length === 0, `samples=${rows.length} skeleton/absent samples=${skeleton.length} ${skeleton.slice(0, 5).map(r => `${r[0]}ms:${r[1].slice(0, 20)}`).join(' | ')}`, fC);
        // the mirror chat card, reached by in-app navigation (no reload)
        const nav = page.getByRole('link', { name: 'Chats' }).first();
        await nav.click();
        await page.getByText('Your mirror agent').first().click();
        await expect.poll(async () => page.getByTestId('attachment-canvas_version').count(), { timeout: 40_000, intervals: [400] }).toBeGreaterThan(0).catch(() => undefined);
        await page.waitForTimeout(1500);
        const mirrorCards = (await page.getByTestId('attachment-canvas_version').allInnerTexts()).map(t => t.replace(/\s+/g, ' '));
        const fM = await shot(page, vp, 'N5', 'mirror-card-after-rename');
        rec(vp, 'N5', 'the mirror chat card shows the new name (in-app navigation, no reload)', mirrorCards.some(t => t.includes('Renamed Card Name')) && !mirrorCards.some(t => t.includes('Acme Bakery Plan')), JSON.stringify(mirrorCards), fM);
        // a plain reload of the canvas
        await page.goto(`${fx.path}?v=${fx.clone!.version_name}&ws=1`);
        const card2 = page.locator('[data-testid="thread-panel"] [data-testid="attachment-canvas_version"]').first();
        await card2.waitFor({ timeout: 40_000 });
        await expect.poll(async () => (await card2.innerText().catch(() => '')).includes('Renamed Card Name'), { timeout: 30_000, intervals: [300] }).toBe(true).catch(() => undefined);
        const fL = await shot(page, vp, 'N5', 'card-after-reload');
        rec(vp, 'N5', 'a plain reload shows the same new name in the thread card', (await card2.innerText()).includes('Renamed Card Name'), (await card2.innerText()).replace(/\s+/g, ' '), fL);
        // fresh pages: published-version cards and a draft-version card, with no console or network error
        const t1 = Date.now();
        await page.goto(`/chats/c/${fx.d1.conversation_id}`);
        await expect.poll(async () => page.getByTestId('attachment-canvas_version').count(), { timeout: 40_000, intervals: [400] }).toBeGreaterThan(2).catch(() => undefined);
        await page.waitForTimeout(2500);
        const cards = (await page.getByTestId('attachment-canvas_version').allInnerTexts()).map(t => t.replace(/\s+/g, ' '));
        const states = await page.getByTestId('attachment-canvas_version').evaluateAll(els => els.map(e => e.getAttribute('data-state')));
        const errs = since(CONSOLE, t1, vp);
        const herr = since(HTTPERR, t1, vp).filter(e => !/auth\/v1\/health/.test(e.url));
        const fF = await shot(page, vp, 'N5', 'cards-fresh-page');
        rec(vp, 'N5', 'on a fresh page every card loads (a published-version card and a draft-version card), none left a skeleton', cards.length >= 3 && cards.every(c => c.length > 8) && states.includes('published') && states.includes('draft'), `cards=${JSON.stringify(cards)} states=${JSON.stringify(states)}`, fF);
        rec(vp, 'N5', 'no console error and no network error (status 400 or more) on that fresh page', errs.length === 0 && herr.length === 0, `console=${JSON.stringify(errs.map(e => e.text.slice(0, 80)))} http=${JSON.stringify(herr.map(e => `${e.status} ${e.url}`))}`, fF);
      });
    } finally {
      await ctx.close().catch(() => undefined);
    }
  } finally {
    rec(vp, 'env', 'every Supabase request went to (N5)', hostOk(), JSON.stringify(Object.fromEntries(HOSTS)));
    await deleteTestUser(user.user.id).catch(e => rec(vp, 'cleanup', 'delete user', false, String(e)));
  }
}

/** Item 6: Clone on a fresh published load at 1440: ms from navigation to Clone, three times, and whether Share moves. */
async function cloneFresh(browser: Browser) {
  const vp = 1440;
  const user = await createTestUser({ name: 'P1536 Walk N6' });
  try {
    const fx = await draftFixture(user, 'Acme Bakery Plan', false);
    const ctx = await browser.newContext({ viewport: { width: vp, height: 900 }, baseURL: BASE });
    await ctx.addInitScript(() => {
      try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ }
      const seen: { share?: { t: number; x: number; w: number }; shareXs: number[]; clone?: { t: number; x: number; w: number; shareX: number | null }; shareMaxShiftBeforeClone: number; shareAfterClone: number | null; reserve?: { t: number; tag: string; ariaHidden: string | null; tabindex: string | null; focusable: boolean; hit: boolean; w: number }; cloneButtonsWhileReserved: number; cloneInTabOrderWhileReserved: number; h1: string[]; reserveEver: boolean; cloneEver: boolean } = { h1: [], reserveEver: false, cloneEver: false, shareXs: [], shareMaxShiftBeforeClone: 0, shareAfterClone: null, cloneButtonsWhileReserved: 0, cloneInTabOrderWhileReserved: 0 };
      (window as unknown as { __seen: typeof seen }).__seen = seen;
      const vis = (e: Element | null) => { if (!e) return null; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? b : null; };
      const tick = () => {
        const share = vis(document.querySelector('[data-testid="canvas-share-control"]'));
        const clone = vis(document.querySelector('[data-testid="canvas-clone"]'));
        const reserve = document.querySelector('[data-testid="canvas-clone-reserve"]') as HTMLElement | null;
        const now = Math.round(performance.now());
        const h1 = document.querySelector('h1'); if (h1) { const hb = h1.getBoundingClientRect(); const k = `${Math.round(hb.x)},${Math.round(hb.y)}`; if (!seen.h1.length || seen.h1[seen.h1.length - 1].split('@')[0] !== k) seen.h1.push(`${k}@${now}ms`); }
        if (reserve) seen.reserveEver = true; if (clone) seen.cloneEver = true;
        if (share && !seen.share) seen.share = { t: now, x: share.x, w: share.width };
        if (share && seen.share && !seen.clone) {
          seen.shareMaxShiftBeforeClone = Math.max(seen.shareMaxShiftBeforeClone, Math.abs(share.x - seen.share.x));
          if (seen.shareXs[seen.shareXs.length - 1] !== Math.round(share.x * 10) / 10) seen.shareXs.push(Math.round(share.x * 10) / 10);
        }
        if (reserve && !seen.reserve) {
          const rb = reserve.getBoundingClientRect();
          reserve.focus();
          const hitEl = document.elementFromPoint(rb.x + rb.width / 2, rb.y + rb.height / 2);
          seen.reserve = { t: now, tag: reserve.tagName.toLowerCase(), ariaHidden: reserve.getAttribute('aria-hidden'), tabindex: reserve.getAttribute('tabindex'), focusable: document.activeElement === reserve, hit: hitEl === reserve || !!hitEl && reserve.contains(hitEl), w: Math.round(rb.width) };
        }
        if (reserve && !clone) {
          const buttons = [...document.querySelectorAll('button')].filter(b => /Clone/.test(b.textContent ?? ''));
          seen.cloneButtonsWhileReserved = Math.max(seen.cloneButtonsWhileReserved, buttons.length);
          const tabbable = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].filter(e => (e as HTMLElement).tabIndex >= 0 && /Clone/.test(e.textContent ?? '') && !(e as HTMLButtonElement).disabled);
          seen.cloneInTabOrderWhileReserved = Math.max(seen.cloneInTabOrderWhileReserved, tabbable.length);
        }
        if (clone && !seen.clone) seen.clone = { t: now, x: clone.x, w: clone.width, shareX: share ? share.x : null };
        if (seen.clone && share && seen.shareAfterClone === null) seen.shareAfterClone = share.x;
        if (now < 20000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    attachWatchers(ctx, vp, { j: 'N6' });
    const page = await ctx.newPage();
    await setTestSession(page, user.email);
    type Seen = { share?: { t: number; x: number; w: number }; shareXs: number[]; clone?: { t: number; x: number; w: number; shareX: number | null }; shareMaxShiftBeforeClone: number; shareAfterClone: number | null; reserve?: { t: number; tag: string; ariaHidden: string | null; tabindex: string | null; focusable: boolean; hit: boolean; w: number }; cloneButtonsWhileReserved: number; cloneInTabOrderWhileReserved: number; h1: string[]; reserveEver: boolean; cloneEver: boolean };
    let rctx: BrowserContext | undefined;
    let actx: BrowserContext | undefined;
    let reader: TestUser | undefined;
    try {
      for (let i = 1; i <= 5; i++) {
        await step(vp, 'N6', `fresh-load-${i}`, async () => {
          await page.goto(`${fx.path}?v=${fx.d1.version_name}`);
          await expect.poll(async () => page.evaluate(() => !!(window as unknown as { __seen: { clone?: unknown } }).__seen.clone), { timeout: 30_000, intervals: [200] }).toBe(true).catch(() => undefined);
          await page.waitForTimeout(1500);
          const seen = await page.evaluate(() => (window as unknown as { __seen: unknown }).__seen) as Seen;
          const f = await shot(page, vp, 'N6', `fresh-load-${i}`);
          rec(vp, 'N6', `fresh load ${i}: Clone appears; milliseconds from navigation until it does`, !!seen.clone, seen.clone ? `Clone at ${seen.clone.t}ms (x ${Math.round(seen.clone.x)}, ${Math.round(seen.clone.w)}px wide); Share first drawn at ${seen.share?.t}ms` : `Clone NEVER appeared within 30s (Share seen at ${seen.share?.t}ms)`, f);
          rec(vp, 'N6', `fresh load ${i}: Share does not move from when it is first drawn until Clone appears`, !!seen.share && seen.shareMaxShiftBeforeClone <= 0.5 && (seen.shareAfterClone === null || Math.abs(seen.shareAfterClone - seen.share.x) <= 0.5), `Share x first drawn=${seen.share?.x} at ${seen.share?.t}ms; distinct x values until Clone=${JSON.stringify(seen.shareXs)}; max shift=${seen.shareMaxShiftBeforeClone}px; x when Clone appeared=${seen.clone?.shareX}; x just after=${seen.shareAfterClone}; heading positions seen=${JSON.stringify(seen.h1)}`, f);
          rec(vp, 'N6', `fresh load ${i}: while Clone is reserved it cannot be tapped or focused and is not in the tab order`, seen.reserve ? (seen.reserve.tag === 'span' && seen.reserve.ariaHidden === 'true' && seen.reserve.tabindex === null && !seen.reserve.focusable && !seen.reserve.hit && seen.cloneButtonsWhileReserved === 0 && seen.cloneInTabOrderWhileReserved === 0) : null, seen.reserve ? `reserve first seen at ${seen.reserve.t}ms: <${seen.reserve.tag}> aria-hidden=${seen.reserve.ariaHidden} tabindex=${seen.reserve.tabindex} width=${seen.reserve.w}px; focus() took it=${seen.reserve.focusable}; a tap at its centre hits it=${seen.reserve.hit}; Clone buttons while reserved=${seen.cloneButtonsWhileReserved}; tabbable Clone elements while reserved=${seen.cloneInTabOrderWhileReserved}` : 'the reserve was never present (drafting answered before the first frame it could show)', f);
          rec(vp, 'N6', `fresh load ${i}: the reserve was in place no later than Share was first drawn`, seen.reserve && seen.share ? seen.reserve.t <= seen.share.t + 40 : null, `Share first drawn at ${seen.share?.t}ms; reserve first seen at ${seen.reserve?.t}ms`, f);
        });
      }

      // The same page as someone who is not the owner: no reserve, no Clone, nothing moves.
      await step(vp, 'N6', 'readers-setup', async () => {
        await page.goto(`${fx.path}?v=${fx.d1.version_name}`);
        await expect(page.getByTestId('canvas-share-control')).toBeVisible({ timeout: 40_000 });
        await page.getByTestId('canvas-share-control').click();
        await page.getByTestId('canvas-share-panel').getByTestId('canvas-share-general').selectOption('link');
        await page.getByRole('button', { name: 'Share with link' }).click();
        await page.waitForTimeout(2500);
      });
      const cv = (await supabaseAdmin.from('canvases').select('link_token,general_access').eq('owner_id', user.user.id).eq('name', fx.name).maybeSingle()).data;
      rec(vp, 'N6', 'fixture: owner set general access to "anyone with the link"', cv?.general_access === 'link' && !!cv?.link_token, `general_access=${cv?.general_access}`);
      const K = cv?.link_token ?? '';
      const readerUrl = `${fx.path}?v=${fx.d1.version_name}&k=${K}`;
      const init = async (c: BrowserContext) => { await c.addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } }); };
      rctx = await browser.newContext({ viewport: { width: vp, height: 900 }, baseURL: BASE });
      await init(rctx);
      reader = await createTestUser({ name: 'P1536 Walk N6 Reader' });
      actx = await browser.newContext({ viewport: { width: vp, height: 900 }, baseURL: BASE });
      await init(actx);
      attachWatchers(rctx, vp, { j: 'N6' });
      attachWatchers(actx, vp, { j: 'N6' });
      const rpage = await rctx.newPage();
      await setTestSession(rpage, reader.email);
      const apage = await actx.newPage();
      // the owner context's init script is per context, so the tracker is installed on each reader page before it navigates
      const track = async (pg: Page) => { await pg.addInitScript(`(() => { const seen = { shareXs: [], h1: [], reserveEver: false, cloneEver: false, shareSeen: false }; window.__seen2 = seen; const tick = () => { const sh = document.querySelector('[data-testid="canvas-share-control"]'); if (sh) { seen.shareSeen = true; const x = Math.round(sh.getBoundingClientRect().x * 10) / 10; if (seen.shareXs[seen.shareXs.length - 1] !== x) seen.shareXs.push(x); } const h1 = document.querySelector('h1'); if (h1) { const b = h1.getBoundingClientRect(); const k = Math.round(b.x) + ',' + Math.round(b.y); if (seen.h1[seen.h1.length - 1] !== k) seen.h1.push(k); } if (document.querySelector('[data-testid="canvas-clone-reserve"]')) seen.reserveEver = true; if (document.querySelector('[data-testid="canvas-clone"]') || [...document.querySelectorAll('button')].some(b => /Clone/.test(b.textContent || ''))) seen.cloneEver = true; if (performance.now() < 30000) requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()`); };
      await track(rpage); await track(apage);
      for (const [who, pg] of [['signed-in reader', rpage], ['signed-out visitor', apage]] as const) {
        for (let i = 1; i <= 2; i++) {
          await step(vp, 'N6', `${who.replace(/ /g, '-')}-load-${i}`, async () => {
            await pg.goto(readerUrl);
            await expect.poll(async () => (await snap(pg)).points, { timeout: 45_000, intervals: [500] }).toBeGreaterThan(0).catch(() => undefined);
            await pg.waitForTimeout(6000);
            const sn = await snap(pg);
            const sx = await pg.evaluate(() => (window as unknown as { __seen2: { shareXs: number[]; h1: string[]; reserveEver: boolean; cloneEver: boolean; shareSeen: boolean } }).__seen2);
            const f = await shot(pg, vp, 'N6', `${who.replace(/ /g, '-')}-load-${i}`);
            rec(vp, 'N6', `${who} load ${i}: the page loaded (published points shown)`, sn.points > 0, `points=${sn.points}`, f);
            rec(vp, 'N6', `${who} load ${i}: no Clone reserve and no Clone at any frame`, !sx.reserveEver && !sx.cloneEver, `reserveEver=${sx.reserveEver} cloneEver=${sx.cloneEver}`, f);
            rec(vp, 'N6', `${who} load ${i}: nothing moves (Share x values ${JSON.stringify(sx.shareXs)}; heading positions ${JSON.stringify(sx.h1)})`, sx.shareXs.length <= 1 && sx.h1.length <= 1, `Share drawn=${sx.shareSeen} distinct Share x=${JSON.stringify(sx.shareXs)} distinct heading positions=${JSON.stringify(sx.h1)}`, f);
          });
        }
      }
    } finally {
      await ctx.close().catch(() => undefined);
      await rctx?.close().catch(() => undefined);
      await actx?.close().catch(() => undefined);
      if (reader) await deleteTestUser(reader.user.id).catch(e => rec(vp, 'cleanup', 'delete N6 reader', false, String(e)));
    }
  } finally {
    rec(vp, 'env', 'every Supabase request went to (N6)', hostOk(), JSON.stringify(Object.fromEntries(HOSTS)));
    await deleteTestUser(user.user.id).catch(e => rec(vp, 'cleanup', 'delete user', false, String(e)));
  }
}

/** J-W3 picker: pick v1, then the draft, then v1 again, from a fresh bare ?ws=1 load, three times; every pick must settle (no skeletons) and the time is reported. */
async function pickerSettle(browser: Browser, vp: number, height: number) {
  const J = 'J-W3-picker';
  const user = await createTestUser({ name: `P1536 Walk picker ${vp}` });
  try {
    const fx = await draftFixture(user, 'Acme Bakery Plan', true);
    const vName = fx.d1.version_name as string;
    const dName = fx.clone!.version_name;
    const { ctx, page } = await sessionPage(browser, user, vp, height, false, J);
    try {
      const state = async () => {
        const sn = await snap(page);
        const pulses = await page.evaluate(() => document.querySelectorAll('[class*="animate-pulse"]').length);
        return { sn, pulses };
      };
      const settle = async (kind: 'published' | 'draft') => {
        const t0 = Date.now();
        let last = { spot: '', st: '', pulses: -1, points: -1, url: '' };
        const ok = await expect.poll(async () => {
          const { sn, pulses } = await state();
          last = { spot: sn.spotText ?? '', st: sn.state ?? '', pulses, points: sn.points, url: sn.url };
          return kind === 'published' ? sn.spotText === 'Published · v1' && pulses === 0 && sn.points > 0 : /^Draft/.test(sn.state ?? '') && pulses === 0 && sn.points > 0;
        }, { timeout: 25_000, intervals: [100] }).toBe(true).then(() => true).catch(() => false);
        return { ms: ok ? Date.now() - t0 : null, last };
      };
      for (let i = 1; i <= 3; i++) {
        await step(vp, J, `round-${i}`, async () => {
          await page.goto(`${fx.path}?ws=1`);
          await expect.poll(() => page.url(), { timeout: 45_000, intervals: [300] }).toContain(`v=${dName}`).catch(() => undefined);
          await expect.poll(async () => (await state()).sn.points, { timeout: 30_000, intervals: [300] }).toBeGreaterThan(0).catch(() => undefined);
          await page.waitForTimeout(1500);
          const sel = page.getByTestId('canvas-version-select');
          await sel.selectOption(vName);
          const a = await settle('published');
          const fa = await shot(page, vp, J, `round-${i}-picked-v1`);
          rec(vp, J, `round ${i}: picking v1 settles on the published view with no skeletons`, a.ms !== null && a.last.url.includes(`v=${vName}`), a.ms !== null ? `settled in ${a.ms}ms; url=${a.last.url}; points=${a.last.points}` : `NEVER settled in 25s: spot="${a.last.spot}" state="${a.last.st}" pulses=${a.last.pulses} url=${a.last.url}`, fa);
          await sel.selectOption(dName);
          const b = await settle('draft');
          const fb = await shot(page, vp, J, `round-${i}-picked-draft`);
          rec(vp, J, `round ${i}: going back to the draft settles on the draft with no skeletons`, b.ms !== null && b.last.url.includes(`v=${dName}`), b.ms !== null ? `settled in ${b.ms}ms; url=${b.last.url}; state=${b.last.st}` : `NEVER settled in 25s: spot="${b.last.spot}" state="${b.last.st}" pulses=${b.last.pulses} url=${b.last.url}`, fb);
          await sel.selectOption(vName);
          const c = await settle('published');
          const fcc = await shot(page, vp, J, `round-${i}-picked-v1-again`);
          rec(vp, J, `round ${i}: picking v1 again settles on the published view with no skeletons`, c.ms !== null && c.last.url.includes(`v=${vName}`), c.ms !== null ? `settled in ${c.ms}ms; url=${c.last.url}; points=${c.last.points}` : `NEVER settled in 25s: spot="${c.last.spot}" state="${c.last.st}" pulses=${c.last.pulses} url=${c.last.url}`, fcc);
        });
      }
    } finally {
      await ctx.close().catch(() => undefined);
    }
  } finally {
    rec(vp, 'env', `every Supabase request went to (${J})`, hostOk(), JSON.stringify(Object.fromEntries(HOSTS)));
    await deleteTestUser(user.user.id).catch(e => rec(vp, 'cleanup', 'delete user', false, String(e)));
  }
}

/** Item 7: an ordinary mirror chat send aborted once: the text comes back exactly once, and Retry then sends it. */
async function mirrorFailedSend(browser: Browser, vp: number, height: number) {
  const touch = vp < 768;
  const { user, ctx, page, cur } = await newOwner(browser, vp, height, `P1536 Walk N7 ${vp}`, touch);
  cur.j = 'N7';
  try {
    await page.goto('/feed');
    const nav = page.getByRole('link', { name: 'Chats' }).first();
    if (await nav.isVisible().catch(() => false)) await (touch ? nav.tap() : nav.click()); else await page.goto('/chats');
    await page.getByText('Your mirror agent').first().waitFor({ timeout: 40_000 });
    await (touch ? page.getByText('Your mirror agent').first().tap() : page.getByText('Your mirror agent').first().click());
    await page.getByTestId('composer').first().waitFor({ timeout: 40_000 });
    await page.waitForTimeout(1500);
    let aborted = 0;
    await page.route(/rpc\/send_chat_message/, async route => { if (aborted === 0) { aborted++; await route.abort(); } else await route.continue(); });
    const TXT = `failed send restore ${vp}`;
    const mainBox = page.getByTestId('composer').getByRole('textbox').first();
    await mainBox.click();
    await mainBox.fill(TXT);
    await page.locator('[data-composer-send]').first().click();
    await page.waitForTimeout(4000);
    const field = await boxText(page);
    const body = await page.locator('body').innerText();
    const occurrences = body.split(TXT).length - 1 + (field.includes(TXT) ? 0 : 0);
    const failedRow = await page.locator('[data-testid="send-failed"]').count();
    const fF = await shot(page, vp, 'N7', 'send-aborted-once');
    rec(vp, 'N7', 'an aborted ordinary send: the text is on screen exactly once (field or failed row, not both)', occurrences === 1, `occurrences in the page=${occurrences} field="${field.slice(0, 40)}" failed rows=${failedRow}`, fF);
    const retry = page.getByRole('button', { name: /^Retry$/ }).first();
    if (await retry.isVisible().catch(() => false)) {
      await (touch ? retry.tap() : retry.click());
      await page.waitForTimeout(4000);
      const stored = (await supabaseAdmin.from('chat_messages').select('id').eq('author_id', user.user.id).eq('body', TXT)).data ?? [];
      rec(vp, 'N7', 'Retry on the failed ordinary send stores it once', stored.length === 1, `stored=${stored.length}`, await shot(page, vp, 'N7', 'send-retried'));
    } else {
      rec(vp, 'N7', 'Retry on the failed ordinary send', null, `no Retry button visible (field="${field.slice(0, 40)}")`);
    }
  } finally {
    rec(vp, 'env', `every Supabase request went to (N7 ${vp})`, hostOk(), JSON.stringify(Object.fromEntries(HOSTS)));
    await ctx.close().catch(() => undefined);
    await deleteTestUser(user.user.id).catch(e => rec(vp, 'cleanup', 'delete user', false, String(e)));
  }
}

test.describe('P1536 walkthrough', () => {
  test('desktop 1440x900: J-W1, J-W3, J-W4, J-W5, rename, pixel', async ({ browser }) => {
    test.setTimeout(900_000);
    await walk(browser, 1440, 900);
  });
  test('phone 375x812: J-W2, J-W3, J-W4, J-W5, rename, pixel', async ({ browser }) => {
    test.setTimeout(900_000);
    await walk(browser, 375, 812);
  });
  test('access: owner surface absent for a signed-in reader and a signed-out visitor', async ({ browser }) => {
    test.setTimeout(600_000);
    await accessWalk(browser, 1440, 900);
  });
  test('access at 375: owner surface absent for a signed-in reader and a signed-out visitor', async ({ browser }) => {
    test.setTimeout(600_000);
    await accessWalk(browser, 375, 812);
  });
  test('immediate Send, natural timing, 1440', async ({ browser }) => {
    test.setTimeout(400_000);
    await immediateWalk(browser, 1440, 900, 'natural');
  });
  test('immediate Send, natural timing, 375', async ({ browser }) => {
    test.setTimeout(400_000);
    await immediateWalk(browser, 375, 812, 'natural');
  });
  test('immediate Send, thread reads delayed 3s, 1440', async ({ browser }) => {
    test.setTimeout(400_000);
    await immediateWalk(browser, 1440, 900, 'delayed');
  });
  test('immediate Send, thread reads delayed 3s, 375', async ({ browser }) => {
    test.setTimeout(400_000);
    await immediateWalk(browser, 375, 812, 'delayed');
  });
  test('immediate Send, the draft read aborted: one toast and the text comes back, 1440', async ({ browser }) => {
    test.setTimeout(200_000);
    await immediateWalk(browser, 1440, 900, 'aborted');
  });
  test('mirror thread reply, no delay, 1440', async ({ browser }) => {
    test.setTimeout(300_000);
    await mirrorThreadWalk(browser, 1440, 900, false);
  });
  test('mirror thread reply, thread read delayed 3s, 1440', async ({ browser }) => {
    test.setTimeout(300_000);
    await mirrorThreadWalk(browser, 1440, 900, true);
  });
  test('mirror thread reply, no delay, 375 touch', async ({ browser }) => {
    test.setTimeout(300_000);
    await mirrorThreadWalk(browser, 375, 812, false);
  });
  test('mirror thread reply, thread read delayed 3s, 375 touch', async ({ browser }) => {
    test.setTimeout(300_000);
    await mirrorThreadWalk(browser, 375, 812, true);
  });
  test('real widths 320, 360 and 400 (touch, overlay scrollbars): draft with a picker', async ({ browser }) => {
    test.setTimeout(400_000);
    await widthsWalk(browser);
  });
  test('N1+N2 rename input and name width with a picker at real widths', async ({ browser }) => {
    test.setTimeout(900_000);
    await renameWidths(browser);
  });
  test('N3 send status from the tap, natural, 1440', async ({ browser }) => {
    test.setTimeout(300_000);
    await sendStatus(browser, 1440, 900, false);
  });
  test('N3 send status from the tap, natural, 375', async ({ browser }) => {
    test.setTimeout(300_000);
    await sendStatus(browser, 375, 812, false);
  });
  test('N3 two quick sends, 1440', async ({ browser }) => {
    test.setTimeout(300_000);
    await sendStatus(browser, 1440, 900, true);
  });
  test('N3 two quick sends, 375', async ({ browser }) => {
    test.setTimeout(300_000);
    await sendStatus(browser, 375, 812, true);
  });
  test('N4 failed read, 1440', async ({ browser }) => {
    test.setTimeout(300_000);
    await failedRead(browser, 1440, 900, 'immediate');
  });
  test('N4 failed read, 375', async ({ browser }) => {
    test.setTimeout(300_000);
    await failedRead(browser, 375, 812, 'immediate');
  });
  test('N4 typed while the Send waits then the read fails, 1440', async ({ browser }) => {
    test.setTimeout(200_000);
    await failedRead(browser, 1440, 900, 'typed');
  });
  test('N4 typed while the Send waits then the read fails, 375', async ({ browser }) => {
    test.setTimeout(200_000);
    await failedRead(browser, 375, 812, 'typed');
  });
  test('N5 card after a rename', async ({ browser }) => {
    test.setTimeout(300_000);
    await cardRename(browser);
  });
  test('N6 Clone on a fresh published load, 1440', async ({ browser }) => {
    test.setTimeout(600_000);
    await cloneFresh(browser);
  });
  test('J-W3 picker: pick v1, the draft, v1 again, three rounds, 375', async ({ browser }) => {
    test.setTimeout(600_000);
    await pickerSettle(browser, 375, 812);
  });
  test('J-W3 picker: pick v1, the draft, v1 again, three rounds, 1440', async ({ browser }) => {
    test.setTimeout(600_000);
    await pickerSettle(browser, 1440, 900);
  });
  test('Proofs: Clone tapped and cancelled writes nothing; the rename RPC refuses what it must', async ({ browser }) => {
    test.setTimeout(240_000);
    await databaseProofs(browser);
  });
  test('N7 aborted ordinary send, 1440', async ({ browser }) => {
    test.setTimeout(200_000);
    await mirrorFailedSend(browser, 1440, 900);
  });
  test('N7 aborted ordinary send, 375', async ({ browser }) => {
    test.setTimeout(200_000);
    await mirrorFailedSend(browser, 375, 812);
  });
  test('N4 restored while the Canvas tab shows, then Thread, then Retry, 375', async ({ browser }) => {
    test.setTimeout(200_000);
    await failedReadCanvasTab(browser);
  });
});
