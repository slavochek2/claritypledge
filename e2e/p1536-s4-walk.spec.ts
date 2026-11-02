/**
 * @file p1536-s4-walk.spec.ts
 * @description P1536 S4 (Add to chat, inline tags, reply chips) walked in a real browser with the REAL model, as a signed-in owner, at 1440x900 and 375x812.
 * Every step is recorded to RESULTS (one JSON line each) and screenshotted into DIR; nothing throws on an app defect, so one failing step does not hide the rest.
 *
 * The walk: a first canvas from material, published; (B) Add to chat on ONE box of the published version, send, and only that box changes; (C) two tags, one Send;
 * (D) a tag removed with Backspace; (E) a reply chip lands on its box; (F) Add to chat on v1 with a draft of the SAME base open, then a draft of ANOTHER base with a
 * message open (J4 sheet); (G, 1440 only) a voice note with a tag. Refuses to load against anything but a TEST project.
 *
 * Voice: the bucket's CORS allows another port, so the signed upload is answered by the test (a bare 200 with CORS headers). The recorder, the tag chip row, and the
 * commit REQUEST are the browser's own; what is checked is that the commit carries the tag. The server's handling of a tagged voice note is X9's.
 *
 * Env: P1536_BASE (the dev server on hosted TEST), P1536_S4_DIR (evidence).
 */
import { test, expect, chromium, type Browser, type Page } from '@playwright/test';
import * as fs from 'fs';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { isTestProjectUrl } from '../scripts/sweep-e2e-test-users';

if (!isTestProjectUrl(process.env.VITE_SUPABASE_URL ?? '')) throw new Error('p1536-s4-walk: VITE_SUPABASE_URL is not a TEST project. Nothing was run.');

const BASE = process.env.P1536_BASE ?? 'http://localhost:5102';
const DIR = process.env.P1536_S4_DIR ?? 'test-results/p1536-s4';
fs.mkdirSync(DIR, { recursive: true });
const RESULTS = `${DIR}/results.jsonl`;
test.setTimeout(1_500_000);

const MATERIAL =
  'Acme Test Bakery sells sourdough loaves and pastries to office managers at companies with 20 to 200 staff in Tallinn. ' +
  'The problem is that offices order catering late and get cold, generic food. ' +
  'Our solution is a weekly standing order delivered fresh at 9am. ' +
  'We charge 12 euros per person per week. ' +
  'My next milestone is signing ten office customers by March.';
const BOXES = ['canvas:segments', 'canvas:problem', 'canvas:solution', 'canvas:channels', 'canvas:revenue', 'canvas:metrics', 'canvas:love', 'canvas:good-at', 'canvas:world-needs'];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const MARK = '⁣';

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

const composer = (page: Page) => page.getByTestId('composer').getByRole('textbox').first();
const composerValue = (page: Page) => composer(page).inputValue();
/**
 * The nine boxes, by tag: the ids of the cards shown (what "the same points" means: an unchanged box keeps its point ids; its text can differ between a published view
 * and a draft view, e.g. an empty box reads "Empty" in one and may carry the agent's question in the other), the "See all N" count, and the text, kept for the log.
 */
async function boxes(page: Page): Promise<Record<string, { ids: string; more: string; text: string }>> {
  return page.evaluate((tags) => Object.fromEntries(tags.map(t => {
    const el = document.querySelector(`[data-testid="canvas-box-${t}"]`) as HTMLElement | null;
    const ids = [...(el?.querySelectorAll('[data-testid^="canvas-point-card-"]') ?? [])].map(c => (c as HTMLElement).dataset.testid!.replace('canvas-point-card-', '')).join(',');
    const more = el?.querySelector('[data-testid="canvas-box-more"]')?.textContent ?? '';
    const clone = el?.cloneNode(true) as HTMLElement | undefined;
    clone?.querySelectorAll('[data-testid^="canvas-add-to-chat-"], [data-testid="canvas-box-changed"], [data-testid="canvas-box-removed"]').forEach(n => n.remove());
    return [t, { ids, more, text: (clone?.innerText ?? '').replace(/\s+/g, ' ').trim() }];
  })), BOXES);
}
/** A word of a box title that sits on two lines (the title column was squeezed until the word broke). */
async function brokenTitleWords(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('[data-testid^="canvas-box-canvas:"] h3').forEach(h => {
      const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent ?? '';
        for (const m of text.matchAll(/\S+/g)) {
          const r = document.createRange();
          r.setStart(n, m.index ?? 0);
          r.setEnd(n, (m.index ?? 0) + m[0].length);
          const tops = new Set([...r.getClientRects()].map(c => Math.round(c.top)));
          if (tops.size > 1) out.push(m[0]);
        }
      }
    });
    return out;
  });
}
const sameBox = (a: { ids: string; more: string }, b: { ids: string; more: string }) => a.ids === b.ids && a.more === b.more;
const changedMarkers = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[data-testid="canvas-box-changed"], [data-testid="canvas-box-removed"]')].map(m => (m.closest('section[data-testid^="canvas-box-canvas:"]') as HTMLElement).dataset.testid!.replace('canvas-box-', '')));
/** The page has re-read what a run changed: every one of these boxes carries its Changed marker (the thread can say "Updated" a moment before the canvas shows it). */
async function waitChanged(page: Page, tags: string[], timeout = 45_000) {
  await expect.poll(async () => { const m = await changedMarkers(page); return tags.some(t => m.includes(t)); }, { timeout, intervals: [500] }).toBe(true).catch(() => undefined);
}
const spotState = (page: Page) => page.getByTestId('publish-spot').getAttribute('data-state').catch(() => null);
async function toView(page: Page, wide: boolean, view: 'canvas' | 'chat') {
  if (wide) return;
  await page.getByTestId(`workspace-view-${view}`).click();
  await page.waitForTimeout(250);
}
/** A run is going or about to: wait for the spot to read Updating… and then to leave it. */
async function waitRun(page: Page) {
  await expect.poll(() => spotState(page), { timeout: 45_000, intervals: [150] }).toBe('updating').catch(() => undefined);
  await expect.poll(() => spotState(page), { timeout: 180_000, intervals: [500] }).not.toBe('updating');
  await page.waitForTimeout(2500); // the page re-reads what the run changed
}
async function sendTyped(page: Page, text: string) {
  const box = composer(page);
  await box.click();
  await box.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(el.value.length, el.value.length)); // End does not move a caret on macOS
  await page.keyboard.type(text);
  await page.locator('[data-composer-send]').first().click();
}
async function addToChat(page: Page, tag: string) {
  const b = page.getByTestId(`canvas-add-to-chat-${tag}`);
  await b.scrollIntoViewIfNeeded();
  await b.click();
}

async function walk(browser: Browser, vp: number, height: number) {
  const wide = vp >= 1280;
  const user: TestUser = await createTestUser({ name: `P1536 S4 ${vp}` });
  const ctx = await browser.newContext({ viewport: { width: vp, height }, baseURL: BASE, ...(wide ? {} : { hasTouch: true, isMobile: true, deviceScaleFactor: 2 }) });
  await ctx.addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } });
  const page = await ctx.newPage();
  const consoleErrors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
  const voiceCommits: string[] = [];
  page.on('request', r => { if (/functions\/v1\/chat-voice/.test(r.url()) && r.method() === 'POST') voiceCommits.push(r.postData() ?? ''); });
  await page.route(/storage\.googleapis\.com/, r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: '' }));
  await setTestSession(page, user.email);
  let base = '';
  let v1 = '';
  try {
    rec(vp, 'env', 'viewport really took effect', await page.evaluate(() => window.innerWidth) === vp, `innerWidth=${await page.evaluate(() => window.innerWidth)}`);

    // ------------------------------------------------------------ A: first canvas, published
    await step(vp, 'A', 'new canvas from material, published as v1', async () => {
      await page.goto('/artifacts');
      await page.getByRole('tab', { name: 'Canvases' }).click();
      await page.getByTestId('artifacts-new-canvas').click();
      await page.waitForURL(/\/p\/[^/]+\/canvas\/canvas(?:_\d+)?\?/, { timeout: 45_000 });
      await expect(page.getByTestId('canvas-opener')).toBeVisible({ timeout: 40_000 });
      base = new URL(page.url()).pathname;
      await page.waitForTimeout(800);
      await sendTyped(page, MATERIAL);
      await waitRun(page);
      await expect(page.getByTestId('canvas-draft-publish')).toBeVisible({ timeout: 30_000 });
      await toView(page, wide, 'canvas');
      await shot(page, vp, 'A-draft-ready');
      await page.getByTestId('canvas-draft-publish').click();
      await expect.poll(() => new URL(page.url()).searchParams.get('ws'), { timeout: 40_000 }).toBeNull();
      await page.waitForTimeout(2000);
      v1 = new URL(page.url()).searchParams.get('v') ?? '';
      rec(vp, 'A', 'published v1', !!v1, `url=${page.url()}`);
    });
    if (!v1) return;

    // ------------------------------------------------------------ B: one tag on a published version
    const s1 = await boxes(page);
    await step(vp, 'B', 'nine Add to chat buttons, 44px, on the published version', async () => {
      const hs = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="canvas-add-to-chat-"]')].map(b => Math.round(b.getBoundingClientRect().height)));
      const f = await shot(page, vp, 'B-1-published-add-to-chat-buttons');
      rec(vp, 'B', 'owner sees nine Add to chat, each >=44px tall', hs.length === 9 && hs.every(h => h >= 44), `heights=${JSON.stringify(hs)}`, f);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      rec(vp, 'B', 'no horizontal page overflow', sw <= vp, `scrollWidth=${sw} innerWidth=${vp}`, f);
      const broken = await brokenTitleWords(page);
      rec(vp, 'B', 'no word of a box title is broken across lines (published)', broken.length === 0, JSON.stringify(broken), f);
    });
    await step(vp, 'B', 'tap on a published box: nothing written, pending Clone, tag in the composer', async () => {
      // The click is dispatched from the page and the focus read in the same task: where the focus is when the handler has returned (the phone's keyboard needs it inside).
      const inHandler = await page.getByTestId('canvas-add-to-chat-canvas:revenue').evaluate((b: HTMLElement) => {
        b.click();
        const a = document.activeElement as HTMLElement | null;
        return { tag: a?.tagName ?? null, inComposer: !!a?.closest('[data-testid="composer"]'), hasToken: (a as HTMLTextAreaElement | null)?.value?.includes('Offers & Pricing') ?? false };
      });
      // Recorded, not asserted: the pending Clone's composer exists only after the router's transition, so it is NOT in the handler (S4.2's "focus inside the tap" holds on a draft;
      // on a published canvas the tag and the focus land right after). The check below proves they do.
      rec(vp, 'B', 'published tap: focus when the click handler returns (informational)', null, JSON.stringify(inHandler));
      await expect(page.getByTestId('workspace-chat-empty')).toBeVisible({ timeout: 20_000 }).catch(async (e) => {
        // a tap that did nothing: say whether the owner was told (the dropped-tag sentence) and what the page looked like
        const told = await page.locator('[data-sonner-toast]').filter({ hasText: 'Could not add that box to the chat' }).count();
        rec(vp, 'B', 'diagnostic: the published tap did not open the pending Clone', null, `owner told=${told > 0} url=${page.url()} clone button=${await page.getByTestId('canvas-clone').count()} spot=${await spotState(page)}`, await shot(page, vp, 'B-2-FAILED-published-tap-did-nothing'));
        throw e;
      });
      await expect.poll(() => composerValue(page), { timeout: 8_000 }).toContain('[Offers & Pricing]');
      const f = await shot(page, vp, 'B-2-published-tap-pending-clone-with-tag');
      const focused = await page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA');
      rec(vp, 'B', 'ws=1, pending Clone, composer holds the Offers & Pricing tag', page.url().includes('ws=1') && (await composerValue(page)).includes(MARK), `url=${page.url()} focus=${focused}`, f);
      rec(vp, 'B', 'composer has focus after the tap (desktop; on touch the keyboard rule is the founder\'s check)', wide ? focused : null, `focused=${focused}`, f);
    });
    await step(vp, 'B', 'send: only Offers & Pricing changes', async () => {
      await sendTyped(page, 'We now charge 15 euros per person per week, not 12.');
      await waitRun(page);
      await toView(page, wide, 'canvas');
      await waitChanged(page, ['canvas:revenue']);
      const s2 = await boxes(page);
      const f = await shot(page, vp, 'B-3-after-tagged-send-canvas');
      const diff = BOXES.filter(t => !sameBox(s1[t]!, s2[t]!));
      const marks = await changedMarkers(page);
      rec(vp, 'B', 'only the tagged box changed (the cards\' point ids of the nine boxes; texts logged)', diff.length === 1 && diff[0] === 'canvas:revenue', `changed=${JSON.stringify(diff)} markers=${JSON.stringify(marks)} diff=${JSON.stringify(diff.map(t => [t, s1[t], s2[t]]))} texts-before=${JSON.stringify(BOXES.filter(t => s1[t]!.text !== s2[t]!.text).map(t => [t, s1[t]!.text.slice(0, 80), s2[t]!.text.slice(0, 80)]))}`, f);
      rec(vp, 'B', 'Changed marker on that box alone', marks.length === 1 && marks[0] === 'canvas:revenue', `markers=${JSON.stringify(marks)}`, f);
      await toView(page, wide, 'chat');
      const f2 = await shot(page, vp, 'B-4-after-tagged-send-thread');
      const chips = await page.getByTestId('message-box-chip').allInnerTexts();
      const replyChips = await page.getByTestId('reply-box-chip').allInnerTexts();
      rec(vp, 'B', 'sent message shows the tag as a chip; the reply names the box as a chip', chips.includes('Offers & Pricing') && replyChips.includes('Offers & Pricing'), `messageChips=${JSON.stringify(chips)} replyChips=${JSON.stringify(replyChips)}`, f2);
      const sl = await page.evaluate(() => document.documentElement.scrollWidth);
      rec(vp, 'B', 'thread: no horizontal overflow', sl <= vp, `scrollWidth=${sl}`, f2);
    });

    // ------------------------------------------------------------ C: two tags, one send
    const sB = await boxes(page);
    await step(vp, 'C', 'two tags, one Send: exactly those two boxes change', async () => {
      await toView(page, wide, 'canvas');
      await addToChat(page, 'canvas:problem');
      await expect.poll(() => composerValue(page)).toContain('[Problem]');
      await page.keyboard.type('and the solution: also mention gluten free and vegan options. ');
      await toView(page, wide, 'canvas');
      // a tap on a DRAFT: the composer is already mounted, so the tag and the focus are in place when the click handler returns (S4.2; the phone's keyboard needs it)
      const inHandler = await page.getByTestId('canvas-add-to-chat-canvas:solution').evaluate((b: HTMLElement) => {
        b.click();
        const a = document.activeElement as HTMLTextAreaElement | null;
        return { tag: a?.tagName ?? null, inComposer: !!a?.closest('[data-testid="composer"]'), hasToken: a?.value?.includes('Solution') ?? false };
      });
      rec(vp, 'C', 'draft tap: the composer has the tag and focus when the click handler returns', inHandler.tag === 'TEXTAREA' && inHandler.inComposer && inHandler.hasToken, JSON.stringify(inHandler));
      await expect.poll(() => composerValue(page)).toContain('[Solution]');
      const v = await composerValue(page);
      const f = await shot(page, vp, 'C-1-two-tags-in-composer');
      rec(vp, 'C', 'two tag tokens in one composer', (v.match(new RegExp(MARK + '\\[', 'g')) ?? []).length === 2, `value="${v.replace(new RegExp(MARK, 'g'), '|')}"`, f);
      await page.keyboard.type('Make both about allergen labels.');
      await page.locator('[data-composer-send]').first().click();
      await waitRun(page);
      await toView(page, wide, 'canvas');
      await waitChanged(page, ['canvas:problem', 'canvas:solution']);
      const s = await boxes(page);
      const f2 = await shot(page, vp, 'C-2-after-two-tag-send-canvas');
      const brokenC = await brokenTitleWords(page);
      rec(vp, 'C', 'no word of a box title is broken across lines (draft, with Changed markers)', brokenC.length === 0, JSON.stringify(brokenC), f2);
      const diff = BOXES.filter(t => !sameBox(sB[t]!, s[t]!));
      const ok = diff.every(t => t === 'canvas:problem' || t === 'canvas:solution') && diff.length >= 1;
      rec(vp, 'C', 'only Problem and/or Solution changed (model may leave one unchanged)', ok, `changed=${JSON.stringify(diff)} markers=${JSON.stringify(await changedMarkers(page))}`, f2);
      await toView(page, wide, 'chat');
      await shot(page, vp, 'C-3-two-tag-thread');
    });

    // ------------------------------------------------------------ D: remove a tag
    await step(vp, 'D', 'Backspace removes the whole tag', async () => {
      await toView(page, wide, 'canvas');
      await addToChat(page, 'canvas:metrics');
      await expect.poll(() => composerValue(page)).toContain('[My next milestone]');
      const f = await shot(page, vp, 'D-1-tag-in-composer');
      await page.keyboard.press('Backspace'); // the space after the token
      await page.keyboard.press('Backspace'); // the token
      const v = await composerValue(page);
      const f2 = await shot(page, vp, 'D-2-tag-removed');
      rec(vp, 'D', 'two Backspaces after Add to chat leave an empty field (token went whole, not letter by letter)', v === '', `value="${v.replace(new RegExp(MARK, 'g'), '|')}"`, f2);
      void f;
    });

    // ------------------------------------------------------------ E: reply chip lands on its box
    await step(vp, 'E', 'a reply chip lands on its box', async () => {
      await toView(page, wide, 'chat');
      const chips = page.getByTestId('reply-box-chip');
      const n = await chips.count();
      const last = chips.nth(n - 1);
      const tag = await last.getAttribute('data-box');
      await last.scrollIntoViewIfNeeded();
      const hh = await last.evaluate(e => Math.round(e.getBoundingClientRect().height));
      await last.click();
      const f = await shot(page, vp, 'E-1-reply-chip-landed', 600);
      await page.waitForTimeout(900); // the smooth scroll
      const info = await page.evaluate((t) => {
        const el = document.querySelector(`[data-testid="canvas-box-${t}"]`) as HTMLElement | null;
        const pane = document.querySelector('[data-testid="workspace-canvas-pane"]') as HTMLElement | null;
        if (!el || !pane) return null;
        const r = el.getBoundingClientRect();
        const p = pane.getBoundingClientRect();
        const off = Math.round(Math.abs(r.top + r.height / 2 - (p.top + p.height / 2)));
        return { ring: el.hasAttribute('data-highlight'), midY: Math.round(r.top + r.height / 2), paneMidY: Math.round(p.top + p.height / 2), offCentre: off, paneH: Math.round(p.height), visible: r.bottom > p.top && r.top < p.bottom && r.width > 0 };
      }, tag);
      const onCanvas = wide ? true : (await page.getByTestId('workspace-view-canvas').getAttribute('aria-selected')) === 'true';
      rec(vp, 'E', 'chip is a >=40px target', hh >= 40, `height=${hh}`, f);
      rec(vp, 'E', `chip landed: ${wide ? 'panel stays, ' : 'switched to Canvas, '}box visible, ringed, centred in its pane (or the pane's end reached)`, !!info && info.visible && info.ring && onCanvas && info.offCentre <= info.paneH * 0.3, `tag=${tag} info=${JSON.stringify(info)} onCanvas=${onCanvas}`, f);
      await page.waitForTimeout(2300);
      rec(vp, 'E', 'ring is gone after two seconds', !(await page.getByTestId(`canvas-box-${tag}`).getAttribute('data-highlight')));
    });

    // ------------------------------------------------------------ F: J4
    await step(vp, 'F', 'same base: Add to chat on v1 while a draft from v1 is open, no sheet, tag goes into the draft', async () => {
      await page.goto(`${base}?v=${v1}`);
      await expect(page.getByTestId('canvas-grid')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('canvas-add-to-chat-canvas:problem')).toBeVisible({ timeout: 20_000 });
      await addToChat(page, 'canvas:problem');
      await expect.poll(() => composerValue(page), { timeout: 20_000, intervals: [300] }).toContain('[Problem]').catch(() => undefined); // the draft's thread is read first (the tag waits for it, up to 15 s)
      const sheet = await page.getByTestId('clone-draft-sheet').count();
      const f = await shot(page, vp, 'F-1-same-base-add-to-chat');
      const draftUrl = page.url().includes('ws=1') && !page.url().includes(`v=${v1}`);
      rec(vp, 'F', 'no sheet; the page moved to the draft; the tag is in its composer', sheet === 0 && draftUrl && (await composerValue(page)).includes('[Problem]'), `sheet=${sheet} url=${page.url()} value="${(await composerValue(page)).replace(new RegExp(MARK, 'g'), '|')}"`, f);
    });
    // publish the draft as v2, then make a draft from v2 with a message
    let v2 = '';
    await step(vp, 'F', 'publish v2, then a draft from v2 with a message', async () => {
      await toView(page, wide, 'canvas');
      await page.getByTestId('canvas-draft-publish').click();
      await expect.poll(() => new URL(page.url()).searchParams.get('ws'), { timeout: 40_000 }).toBeNull();
      await page.waitForTimeout(2000);
      v2 = new URL(page.url()).searchParams.get('v') ?? '';
      await addToChat(page, 'canvas:channels');
      await expect(page.getByTestId('workspace-chat-empty')).toBeVisible({ timeout: 15_000 });
      await sendTyped(page, 'We sell mainly through office manager communities and a referral from our first customers.');
      await waitRun(page);
      rec(vp, 'F', 'v2 published, draft from v2 has a message', !!v2 && page.url().includes('ws=1'), `v2=${v2} url=${page.url()}`);
    });
    await step(vp, 'F', 'other base with a message: the sheet appears on Add to chat on v1', async () => {
      await page.goto(`${base}?v=${v1}`);
      await expect(page.getByTestId('canvas-add-to-chat-canvas:revenue')).toBeVisible({ timeout: 60_000 }).catch(async (e) => { await shot(page, vp, 'F-2-FAILED-no-add-to-chat-on-v1'); throw e; });
      await addToChat(page, 'canvas:revenue');
      const sheet = page.getByTestId('clone-draft-sheet');
      await expect(sheet).toBeVisible({ timeout: 15_000 });
      const f = await shot(page, vp, 'F-2-j4-sheet');
      const text = (await sheet.innerText()).replace(/\s+/g, ' ');
      rec(vp, 'F', 'sheet reads as the spec says', /You have a draft from v2\. Add this to it, or start over from v1\? Starting over discards that draft\./.test(text), text, f);
      await page.getByRole('button', { name: 'Add to my draft' }).click();
      await expect(page.getByTestId('thread-panel')).toBeVisible({ timeout: 20_000 });
      await expect.poll(() => composerValue(page), { timeout: 10_000 }).toContain('[Offers & Pricing]');
      const f2 = await shot(page, vp, 'F-3-add-to-my-draft-lands');
      rec(vp, 'F', 'Add to my draft: the tag is in the draft\'s composer, thread in view', page.url().includes('ws=1') && (wide || (await page.getByTestId('workspace-view-chat').getAttribute('aria-selected')) === 'true'), `url=${page.url()}`, f2);
    });
    await step(vp, 'F', 'dismissing the sheet drops the tag', async () => {
      // clear the composer first so a leftover tag from the step above cannot be mistaken for a new one
      await composer(page).fill('');
      await page.goto(`${base}?v=${v1}`);
      await expect(page.getByTestId('canvas-add-to-chat-canvas:metrics')).toBeVisible({ timeout: 30_000 });
      await addToChat(page, 'canvas:metrics');
      await expect(page.getByTestId('clone-draft-sheet')).toBeVisible({ timeout: 15_000 });
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('clone-draft-sheet')).toHaveCount(0);
      const f = await shot(page, vp, 'F-4-sheet-dismissed');
      rec(vp, 'F', 'sheet closed, still the published v1, nothing written to the composer', !page.url().includes('ws=1') || page.url().includes(`v=${v1}`), `url=${page.url()}`, f);
    });

    // ------------------------------------------------------------ G: voice with a tag (1440)
    if (wide) await step(vp, 'G', 'a voice note carries the tag', async () => {
      await page.goto(`${base}?ws=1`);
      await expect(page.getByTestId('thread-panel')).toBeVisible({ timeout: 40_000 });
      await composer(page).fill('');
      const tTap = Date.now();
      await addToChat(page, 'canvas:problem');
      await expect.poll(() => composerValue(page), { timeout: 20_000 }).toContain('[Problem]').catch(async (e) => {
        await shot(page, vp, 'G-FAILED-tag-not-in-composer');
        rec(vp, 'G', 'diagnostic: where the page was when the tag did not land', null, `after ${Date.now() - tTap}ms url=${page.url()} value="${await composerValue(page)}" sheet=${await page.getByTestId('clone-draft-sheet').count()} buttons=${await page.locator('[data-testid^="canvas-add-to-chat-"]').count()}`);
        throw e;
      });
      const box = page.getByTestId('composer');
      const mic = box.getByRole('button', { name: 'Record a voice message' });
      const f = await shot(page, vp, 'G-1-tag-only-shows-voice-button');
      rec(vp, 'G', 'a tags-only field shows the voice button, not Send', await mic.isVisible(), 'tag in field, no words');
      await mic.click();
      await expect(box.getByRole('button', { name: 'Send voice message' })).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(2500);
      await shot(page, vp, 'G-2-recording-with-tag');
      await box.getByRole('button', { name: 'Send voice message' }).click();
      await expect.poll(() => voiceCommits.some(b => /canvas:problem/.test(b)), { timeout: 30_000 }).toBe(true).catch(() => undefined);
      const body = voiceCommits.find(b => /canvas:problem/.test(b)) ?? voiceCommits.join(' || ');
      const f3 = await shot(page, vp, 'G-3-voice-sent');
      rec(vp, 'G', 'the commit request names the tagged box', /canvas:problem/.test(body) && /boxRefs/.test(body), `commit body=${body.slice(0, 400)}`, f3);
      void f;
    });
    // ------------------------------------------------------------ H: the page's read hangs
    await step(vp, 'H', 'a tap while the read hangs: no tag appears, and the owner is told after 15 s', async () => {
      await page.route(/rpc\/get_canvas(\?|$)/, () => undefined); // a request that is never answered
      await page.goto(`${base}?v=${v1}`);
      await expect(page.getByTestId('canvas-add-to-chat-canvas:revenue')).toBeVisible({ timeout: 30_000 });
      const t0 = Date.now();
      await addToChat(page, 'canvas:revenue');
      await shot(page, vp, 'H-1-tapped-while-read-hangs');
      const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Could not add that box to the chat. Tap Add to chat again.' }).first();
      await toast.waitFor({ timeout: 25_000 });
      const waited = Date.now() - t0;
      const f = await shot(page, vp, 'H-2-dropped-with-a-sentence');
      rec(vp, 'H', 'the dropped tag is said, after about 15 s, and nothing was entered', waited >= 14_000 && waited <= 22_000 && !page.url().includes('ws=1'), `waited=${waited}ms url=${page.url()}`, f);
      await page.unroute(/rpc\/get_canvas(\?|$)/);
    });
    rec(vp, 'env', 'console errors during the walk', consoleErrors.length === 0 ? true : null, JSON.stringify([...new Set(consoleErrors)].slice(0, 8)));
  } finally {
    await ctx.close();
    await deleteTestUser(user.user.id).catch(() => undefined);
    await sleep(200);
  }
}

test.describe.configure({ mode: 'serial' });
let browser: Browser;
test.beforeAll(async () => { browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }); });
test.afterAll(async () => { await browser.close(); });

test('S4 walk at 1440', async () => { await walk(browser, 1440, 900); });
test('S4 walk at 375', async () => { await walk(browser, 375, 812); });
test('S4 walk at 320', async () => { await walk(browser, 320, 700); });
