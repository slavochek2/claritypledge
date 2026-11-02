/**
 * @file p1536-x4-header.spec.ts
 * @description P1536 3c X4 to X8, X13 (S3c.4, S3c.10): the owner's header in a real Chromium on hosted TEST, at 1440, 1280, 1279, 1024, 768, 390, 375 and 320, in
 * every state the header table has that a fixture can reach without the drafting model. The jsdom tests pin WHAT is drawn (p1536-x4-header-bar.test.tsx); this pins what only
 * a browser can: that the Publish/Share/status spot is ONE box that does not move or resize across states, that nothing overflows, that Share/Publish is the one filled control and
 * furthest right, that Discard is labelled, that the header is two rows (or one) as X13 says with equal height for a draft and a published version, and the one-row measurement.
 *
 * States (RPCs and service-role points; the model is not called):
 *   draft-nothing    a draft with a base and no difference          (Thread, Discard, "Nothing to publish yet")
 *   picked-ws        the published v1 picked from the draft (ws=1)  (Thread, or Go to draft on a phone; Share)
 *   published-view   the published v1 reached by View, draft open   (Clone, Share)
 *   draft-publish    the draft with a difference                    (Thread, Discard, Publish)
 *   published-clean  the published v1, no draft                     (Clone, Share)
 *   pending-clone    Clone tapped                                   ((New draft), Cancel, "Nothing to publish yet")
 *   new-empty        a new canvas, no points                        ((Draft), no picker, Discard, "Nothing to publish yet")
 *   new-points       a new canvas with points                       ((Draft), no picker, Discard, Publish)
 * Every cell: screenshot to DIR, the measurements to DIR/measured.json, and soft assertions for the checks above. Refuses to run against anything but a TEST project.
 *
 *   P1536_BASE=http://localhost:5102 P1536_HEADER_DIR=<abs dir> npx playwright test e2e/p1536-x4-header.spec.ts --project=chromium
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, TEST_PASSWORD } from './helpers/test-user';
import { isTestProjectUrl } from '../scripts/sweep-e2e-test-users';

if (!isTestProjectUrl(process.env.VITE_SUPABASE_URL ?? '')) throw new Error('p1536-x4-header: VITE_SUPABASE_URL is not a TEST project. Nothing was run.');

const BASE = process.env.P1536_BASE ?? 'http://localhost:5102';
const DIR = process.env.P1536_HEADER_DIR ?? 'test-results/p1536-x4-header';
fs.mkdirSync(DIR, { recursive: true });
test.use({ baseURL: BASE, actionTimeout: 20_000 });
test.setTimeout(1_500_000);

const TITLE = 'Acme Bakery Plan for the Northern Region';
const WIDTHS = [1440, 1280, 1279, 1024, 768, 390, 375, 320];
const isPhone = (w: number) => w <= 641;

async function ownerApi(email: string): Promise<SupabaseClient> {
  const api = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await api.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`owner sign-in failed: ${error?.message}`);
  return api;
}
async function seedDraftPoints(ownerId: string, draftId: string, versionName: string, items: Array<[string, string]>) {
  const { data, error } = await supabaseAdmin.from('points').insert(items.map(([box, statement]) => ({
    statement, first_validator_id: ownerId, visibility: 'private', tags: [], system_tags: [box, `canvas_${versionName}`],
  }))).select('id');
  if (error || !data || data.length !== items.length) throw new Error(`seed points: ${error?.message ?? 'wrong row count'}`);
  const { error: e2 } = await supabaseAdmin.from('canvas_draft_points').insert(data.map((r) => ({ draft_id: draftId, point_id: r.id })));
  if (e2) throw new Error(`seed draft points: ${e2.message}`);
}
const FIRST: Array<[string, string]> = [
  ['canvas:segments', 'Office managers at companies with 20 to 200 staff (SEEDED)'],
  ['canvas:problem', 'Offices order catering late and get cold food (SEEDED)'],
  ['canvas:solution', 'A weekly standing order delivered fresh (SEEDED)'],
];

/** What the header looks like right now: every number the checks need, read in the page. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const vis = (el: Element | null): el is HTMLElement => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[inert]');
    };
    const rect = (el: Element | null) => (el ? (({ x, y, width, height, right }) => ({ x: +x.toFixed(1), y: +y.toFixed(1), w: +width.toFixed(1), h: +height.toFixed(1), right: +right.toFixed(1) }))(el.getBoundingClientRect()) : null);
    const bar = q('workspace-bar');
    const spot = q('publish-spot');
    const title = q('canvas-title');
    const controls = bar ? [...bar.querySelectorAll<HTMLElement>('button, a[href], select, [role="tab"]')].filter(vis) : [];
    const blue = (el: Element) => { const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g); if (!m) return false; const [r, , b, a] = m.map(Number); return (a === undefined || a > 0.5) && b! - r! > 80 && b! > 150; };
    const filled = controls.filter(blue).map((el) => el.getAttribute('data-testid') || el.textContent?.trim().slice(0, 20) || '?');
    const actions = q('canvas-bar-actions');
    const items = actions ? [...actions.querySelectorAll<HTMLElement>('[data-testid]')].filter(vis).filter((e) => ['canvas-clone', 'workspace-thread-button', 'workspace-go-to-draft-bar', 'canvas-cancel-clone', 'canvas-discard', 'publish-spot'].includes(e.getAttribute('data-testid')!)) : [];
    const row1 = q('workspace-bar-row1');
    // visible characters of the fixed title (per-character Range rects inside its visible box)
    let visible = 0, total = 0;
    if (title && vis(title)) {
      const er = title.getBoundingClientRect();
      let R = Math.min(er.right, window.innerWidth), L = Math.max(er.left, 0);
      for (let p = title.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        const pcs = getComputedStyle(p);
        if (pcs.overflowX !== 'visible') { const pr = p.getBoundingClientRect(); L = Math.max(L, pr.left); R = Math.min(R, pr.right); }
      }
      const cut = title.scrollWidth > title.clientWidth + 1;
      let ell = 0;
      if (cut && getComputedStyle(title).textOverflow === 'ellipsis') {
        const s = document.createElement('span'); s.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${getComputedStyle(title).font}`; s.textContent = '…'; document.body.appendChild(s); ell = s.getBoundingClientRect().width; s.remove();
      }
      const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const t = n.textContent ?? '';
        for (let i = 0; i < t.length; i++) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const c = r.getBoundingClientRect(); total++; if (c.width > 0 && c.left >= L - 0.5 && c.right <= R - ell + 0.5) visible++; }
      }
    }
    const docRows = new Set(controls.map((el) => Math.round(el.getBoundingClientRect().top / 8))); // coarse: distinct row bands
    return {
      innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth,
      url: location.pathname + location.search,
      bar: rect(bar), row1: rect(row1), actions: rect(actions), spot: rect(spot), spotState: spot?.getAttribute('data-state') ?? null, spotText: spot?.textContent?.trim() ?? null,
      tag: vis(q('canvas-state')) ? q('canvas-state')!.textContent : null, picker: vis(q('canvas-version-picker')), pickerText: q('canvas-version-picker')?.textContent?.trim() ?? null,
      switcher: vis(q('workspace-view-switch')), thread: vis(q('workspace-thread-button')), goToDraft: vis(q('workspace-go-to-draft-bar')),
      discard: vis(q('canvas-discard')), discardText: q('canvas-discard')?.textContent?.trim() ?? null, cancel: vis(q('canvas-cancel-clone')), clone: vis(q('canvas-clone')), share: vis(q('canvas-share-control')),
      items: items.map((el) => ({ id: el.getAttribute('data-testid'), ...rect(el)! })),
      filled, controlHeights: controls.map((el) => ({ id: el.getAttribute('data-testid') || el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 16) || '?', h: +el.getBoundingClientRect().height.toFixed(1), w: +el.getBoundingClientRect().width.toFixed(1) })),
      rowBands: docRows.size, titleVisible: visible, titleTotal: total, titleText: title?.textContent ?? null,
      agentLine: vis(q('agent-line')), barText: bar?.innerText.replace(/\s+/g, ' ').trim() ?? null,
    };
  });
}
type M = Awaited<ReturnType<typeof measure>>;

async function settle(page: Page, stateReady: () => Promise<void>) {
  await stateReady();
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForTimeout(700);
}

test('P1536 X4 header: every state at every width', async ({ browser }) => {
  const user = await createTestUser({ name: 'P1536 Header' });
  const cells: Array<{ state: string; width: number; m: M; shot: string }> = [];
  const ctxs: Array<{ w: number; ctx: BrowserContext; page: Page }> = [];
  try {
    const api = await ownerApi(user.email);
    // canvas 1: published v1, then a draft from it
    const opened = (await api.rpc('canvas_draft_open', { p_from_version: null })).data as { canvas_name: string };
    const c1 = opened.canvas_name;
    const d1 = (await supabaseAdmin.from('canvas_drafts').select('id,version_name,version_id,revision,canvas_id').eq('owner_id', user.user.id).eq('state', 'open').limit(1).maybeSingle()).data!;
    await seedDraftPoints(user.user.id, d1.id, d1.version_name, FIRST);
    const pub = await api.rpc('canvas_draft_publish', { p_draft: d1.id, p_expected_revision: d1.revision });
    if (pub.error) throw new Error(`publish: ${pub.error.message}`);
    const v1 = d1.version_name as string;
    const o2 = await api.rpc('canvas_draft_open', { p_from_version: d1.version_id });
    if (o2.error) throw new Error(`open from v1: ${o2.error.message}`);
    const dr = (await supabaseAdmin.from('canvas_drafts').select('id,version_name,revision').eq('owner_id', user.user.id).eq('state', 'open').eq('base_version_id', d1.version_id).limit(1).maybeSingle()).data!;
    const ren = await api.rpc('canvas_rename', { p_canvas: d1.canvas_id, p_title: TITLE });
    if (ren.error) throw new Error(`rename: ${ren.error.message}`);
    const path1 = `/p/${user.slug}/canvas/${c1}`;

    for (const w of WIDTHS) {
      const phone = isPhone(w);
      const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 800 : 900 }, baseURL: BASE, ...(phone ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
      await ctx.addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } });
      const page = await ctx.newPage();
      await setTestSession(page, user.email);
      ctxs.push({ w, ctx, page });
    }

    const capture = async (state: string, go: (page: Page, w: number) => Promise<void>, ready: (page: Page) => Promise<void>) => {
      for (const { w, page } of ctxs) {
        await go(page, w);
        await settle(page, () => ready(page));
        const m = await measure(page);
        expect.soft(m.innerWidth, `[${state} ${w}] the resize took effect`).toBe(w);
        const file = `${DIR}/${state}-${w}.png`;
        await page.screenshot({ path: file });
        cells.push({ state, width: w, m, shot: file });
      }
    };
    const barReady = (page: Page) => expect(page.getByTestId('publish-spot')).toBeVisible({ timeout: 40_000 });
    const titleReady = (page: Page) => expect.poll(async () => (await page.getByTestId('canvas-title').textContent()) ?? '', { timeout: 40_000, intervals: [300] }).toBe(TITLE);
    const both = async (page: Page) => { await barReady(page); await titleReady(page); };
    // the workspace marker settles after the first paint (the bar first draws as a plain page, then the switcher and panel arrive): measure only once the panel is there
    const inWorkspace = async (page: Page) => { await both(page); await expect(page.getByTestId('workspace-chat-pane')).toBeAttached({ timeout: 40_000 }); };

    await capture('draft-nothing', (p) => p.goto(`${path1}?v=${dr.version_name}&ws=1`).then(() => undefined), inWorkspace);
    await capture('picked-ws', (p) => p.goto(`${path1}?v=${v1}&ws=1`).then(() => undefined), async (p) => { await inWorkspace(p); await expect(p.getByTestId('publish-spot')).toHaveAttribute('data-state', 'share', { timeout: 40_000 }); });
    await capture('published-view', (p) => p.goto(`${path1}?v=${v1}`).then(() => undefined), async (p) => { await both(p); await expect(p.getByTestId('canvas-clone')).toBeVisible({ timeout: 40_000 }); });
    await seedDraftPoints(user.user.id, dr.id, dr.version_name, [['canvas:channels', 'Direct emails to office managers (SEEDED)']]);
    await capture('draft-publish', (p) => p.goto(`${path1}?v=${dr.version_name}&ws=1`).then(() => undefined), async (p) => { await inWorkspace(p); await expect(p.getByTestId('canvas-draft-publish')).toBeVisible({ timeout: 40_000 }); });
    // discard the draft: v1 with no draft, then a pending Clone
    const rev = (await supabaseAdmin.from('canvas_drafts').select('revision').eq('id', dr.id).single()).data!.revision as number;
    const disc = await api.rpc('canvas_draft_discard', { p_draft: dr.id, p_expected_revision: rev });
    if (disc.error) throw new Error(`discard: ${disc.error.message}`);
    await capture('published-clean', (p) => p.goto(`${path1}?v=${v1}`).then(() => undefined), async (p) => { await both(p); await expect(p.getByTestId('canvas-clone')).toBeVisible({ timeout: 40_000 }); });
    await capture('pending-clone', async (p) => { await p.goto(`${path1}?v=${v1}`); await expect(p.getByTestId('canvas-clone')).toBeVisible({ timeout: 40_000 }); await p.getByTestId('canvas-clone').click(); }, async (p) => { await expect(p.getByTestId('agent-line')).toBeVisible({ timeout: 40_000 }); await titleReady(p); });
    // canvas 2: a new canvas, empty then with points
    const o3 = (await api.rpc('canvas_draft_open', { p_from_version: null })).data as { canvas_name: string };
    const c2 = o3.canvas_name;
    const d2 = (await supabaseAdmin.from('canvas_drafts').select('id,version_name,canvas_id').eq('owner_id', user.user.id).eq('state', 'open').is('base_version_id', null).limit(1).maybeSingle()).data!;
    const ren2 = await api.rpc('canvas_rename', { p_canvas: d2.canvas_id, p_title: TITLE });
    if (ren2.error) throw new Error(`rename 2: ${ren2.error.message}`);
    const path2 = `/p/${user.slug}/canvas/${c2}`;
    await capture('new-empty', (p) => p.goto(`${path2}?v=${d2.version_name}&ws=1`).then(() => undefined), async (p) => { await inWorkspace(p); await expect(p.getByTestId('publish-spot')).toHaveAttribute('data-state', 'nothing', { timeout: 40_000 }); });
    await seedDraftPoints(user.user.id, d2.id, d2.version_name, FIRST);
    await capture('new-points', (p) => p.goto(`${path2}?v=${d2.version_name}&ws=1`).then(() => undefined), async (p) => { await inWorkspace(p); await expect(p.getByTestId('canvas-draft-publish')).toBeVisible({ timeout: 40_000 }); });

    // ---- checks --------------------------------------------------------------------------------------------------------------------------------------------------
    const by = (s: string, w: number) => cells.find((c) => c.state === s && c.width === w)!.m;
    const WITH_SPOT = ['draft-nothing', 'picked-ws', 'published-view', 'draft-publish', 'published-clean', 'pending-clone', 'new-empty', 'new-points'];
    for (const w of WIDTHS) {
      const first = by(WITH_SPOT[0]!, w).spot!;
      for (const s of WITH_SPOT) {
        const m = by(s, w);
        const tag = `[${s} ${w}]`;
        expect.soft(m.scrollWidth <= m.innerWidth, `${tag} no horizontal overflow (scrollWidth ${m.scrollWidth} vs ${m.innerWidth})`).toBe(true);
        // ONE box for the spot in every state: same size and the same right edge (nothing beside it moves)
        expect.soft(Math.abs(m.spot!.w - first.w) <= 1 && Math.abs(m.spot!.h - first.h) <= 1, `${tag} spot box ${JSON.stringify(m.spot)} vs ${JSON.stringify(first)}`).toBe(true);
        expect.soft(Math.abs(m.spot!.right - first.right) <= 1, `${tag} spot right edge ${m.spot!.right} vs ${first.right}`).toBe(true);
        // the one filled control is the spot's (Share or Publish), or none (a status)
        const wantFilled = m.spotState === 'share' ? ['canvas-share-control'] : m.spotState === 'publish' ? ['canvas-draft-publish'] : [];
        expect.soft(m.filled, `${tag} filled controls`).toEqual(wantFilled);
        // furthest right: no item's right edge is beyond the spot's
        expect.soft(m.items.every((i) => i.right <= m.spot!.right + 1), `${tag} the spot is the furthest-right item`).toBe(true);
        // labelled Discard, never icon-only
        if (m.discard) expect.soft(m.discardText, `${tag} Discard is labelled`).toBe('Discard');
        // the item row reads left to right in the table's order
        const xs = m.items.map((i) => i.x);
        expect.soft(xs, `${tag} items are left to right`).toEqual([...xs].sort((a, b) => a - b));
      }
      // tags and pickers, per row of the table
      expect.soft(by('draft-nothing', w).tag, `[draft-nothing ${w}] tag`).toBe('Draft');
      expect.soft(by('draft-nothing', w).picker, `[draft-nothing ${w}] picker (it has a base)`).toBe(true);
      expect.soft(by('picked-ws', w).tag, `[picked-ws ${w}] no tag on a published version`).toBeNull();
      expect.soft(by('published-view', w).tag, `[published-view ${w}] no tag`).toBeNull();
      expect.soft(by('published-view', w).clone && by('published-view', w).share, `[published-view ${w}] Clone and Share`).toBe(true);
      expect.soft(by('pending-clone', w).tag, `[pending-clone ${w}] tag`).toBe('New draft');
      expect.soft(by('pending-clone', w).picker, `[pending-clone ${w}] no picker`).toBe(false);
      expect.soft(by('pending-clone', w).cancel && !by('pending-clone', w).discard, `[pending-clone ${w}] Cancel, no Discard`).toBe(true);
      expect.soft(by('new-empty', w).tag, `[new-empty ${w}] tag`).toBe('Draft');
      expect.soft(by('new-empty', w).picker, `[new-empty ${w}] a never-published canvas has no picker`).toBe(false);
      expect.soft(by('new-empty', w).spotText, `[new-empty ${w}] spot`).toBe('Nothing to publish yet');
      expect.soft(by('draft-publish', w).spotText, `[draft-publish ${w}] spot`).toBe('Publish');
      expect.soft(by('picked-ws', w).spotText?.startsWith('Share'), `[picked-ws ${w}] Share`).toBe(true);
      if (w < 1280) {
        // X13: row 2 holds the switcher and the spot; a draft's and a published version's bars are equal height when both are two rows
        expect.soft(Math.abs(by('draft-publish', w).bar!.h - by('published-view', w).bar!.h) <= 1, `[${w}] equal header height: draft ${by('draft-publish', w).bar!.h} vs published ${by('published-view', w).bar!.h}`).toBe(true);
        expect.soft(by('pending-clone', w).switcher, `[pending-clone ${w}] switcher`).toBe(true);
        expect.soft(by('picked-ws', w).goToDraft, `[picked-ws ${w}] Go to draft in row 2`).toBe(true);
        expect.soft(by('picked-ws', w).bar!.h, `[picked-ws ${w}] switcher, Go to draft and Share fit TWO rows labelled (bar ${by('picked-ws', w).bar!.h}px vs ${by('published-view', w).bar!.h}px)`).toBe(by('published-view', w).bar!.h);
        expect.soft(by('published-clean', w).switcher, `[published-clean ${w}] no switcher`).toBe(false);
        // the spot is on the second row, below the name's row
        expect.soft(by('draft-publish', w).spot!.y > by('draft-publish', w).row1!.y + by('draft-publish', w).row1!.h - 2, `[draft-publish ${w}] spot is on row 2`).toBe(true);
      } else {
        expect.soft(by('draft-publish', w).thread, `[draft-publish ${w}] no Thread button while the panel is open`).toBe(false);
      }
    }

    // ---- the one-row question (X13) at 375 and the others: name + picker + Clone + Share on one row ---------------------------------------------------------------
    const oneRow: Array<{ width: number; visible: number; total: number; scrollOverflow: boolean }> = [];
    for (const { w, page } of ctxs.filter((c) => c.w < 1280)) {
      await page.goto(`${path1}?v=${v1}`);
      await expect(page.getByTestId('canvas-clone')).toBeVisible({ timeout: 40_000 });
      await titleReady(page);
      await page.addStyleTag({ content: '[data-testid=workspace-bar]{flex-wrap:nowrap !important}[data-testid=workspace-bar-row1]{display:contents !important}[data-testid=canvas-bar-actions]{order:10 !important;margin-left:auto !important}' });
      await page.waitForTimeout(600);
      const m = await measure(page);
      oneRow.push({ width: w, visible: m.titleVisible, total: m.titleTotal, scrollOverflow: m.scrollWidth > m.innerWidth });
      await page.screenshot({ path: `${DIR}/one-row-trial-${w}.png` });
    }
    fs.writeFileSync(`${DIR}/one-row.json`, JSON.stringify(oneRow, null, 2));

    // ---- the table ---------------------------------------------------------------------------------------------------------------------------------------------
    fs.writeFileSync(`${DIR}/measured.json`, JSON.stringify(cells.map((c) => ({ state: c.state, width: c.width, ...c.m })), null, 2));
    const head = `| state | ${WIDTHS.join(' | ')} |\n|---|${WIDTHS.map(() => '---').join('|')}|`;
    const rowsOut = WITH_SPOT.map((s) => `| ${s} | ${WIDTHS.map((w) => { const m = by(s, w); return `${m.titleVisible}/${m.titleTotal} spot ${m.spot!.w}x${m.spot!.h}@${m.spot!.right} bar ${m.bar!.h}`; }).join(' | ')} |`);
    console.log(`P1536 X4 header: title chars visible / total, spot box, bar height\n${head}\n${rowsOut.join('\n')}`);
    console.log(`P1536 X13 one-row trial (name + picker + Clone + Share on ONE row, published): ${JSON.stringify(oneRow)}`);
  } finally {
    for (const c of ctxs) await c.ctx.close().catch(() => undefined);
    await deleteTestUser(user.user.id).catch((e) => console.error('cleanup: delete user failed', e));
  }
});

/**
 * X13: a pending Clone opens on Thread, and the mirror agent's line must stay visible, or the composer must not take focus on landing. This build takes the second branch below 1280px
 * (workspace-chat.tsx: `autoFocus={focusable && wide}`). Checked in Chromium with touch emulation at 375, 390 and 320, and again in a keyboard-sized viewport (375x420: what a phone
 * leaves above its keyboard). WebKit is not installed on this machine and a real iOS keyboard cannot be emulated, so the WebKit shot the spec asks for is NOT produced here.
 */
test('P1536 X13: a pending Clone on a phone lands on Thread with the line visible and the composer unfocused', async ({ browser }) => {
  const user = await createTestUser({ name: 'P1536 Header Keyboard' });
  try {
    const api = await ownerApi(user.email);
    const opened = (await api.rpc('canvas_draft_open', { p_from_version: null })).data as { canvas_name: string };
    const d1 = (await supabaseAdmin.from('canvas_drafts').select('id,version_name,version_id,revision,canvas_id').eq('owner_id', user.user.id).eq('state', 'open').limit(1).maybeSingle()).data!;
    await seedDraftPoints(user.user.id, d1.id, d1.version_name, FIRST);
    const pub = await api.rpc('canvas_draft_publish', { p_draft: d1.id, p_expected_revision: d1.revision });
    if (pub.error) throw new Error(`publish: ${pub.error.message}`);
    const path = `/p/${user.slug}/canvas/${opened.canvas_name}`;
    for (const [w, h] of [[375, 800], [390, 800], [320, 700], [375, 420]] as const) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, baseURL: BASE, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      await ctx.addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } });
      const page = await ctx.newPage();
      try {
        await setTestSession(page, user.email);
        await page.goto(`${path}?v=${d1.version_name}`);
        await expect(page.getByTestId('canvas-clone')).toBeVisible({ timeout: 40_000 });
        await page.getByTestId('canvas-clone').click();
        await expect(page.getByTestId('agent-line')).toBeVisible({ timeout: 40_000 });
        await page.waitForTimeout(800);
        const r = await page.evaluate(() => {
          const line = document.querySelector<HTMLElement>('[data-testid="agent-line"]')!.getBoundingClientRect();
          const a = document.activeElement as HTMLElement | null;
          return {
            innerHeight: window.innerHeight, lineTop: Math.round(line.top), lineBottom: Math.round(line.bottom), inView: line.top >= 0 && line.bottom <= window.innerHeight,
            focused: a ? `${a.tagName}${a.getAttribute('role') ? `[${a.getAttribute('role')}]` : ''}` : null,
            threadActive: document.querySelector('[data-testid="workspace-view-chat"]')?.getAttribute('data-state'),
          };
        });
        await page.screenshot({ path: `${DIR}/pending-keyboard-${w}x${h}.png` });
        expect.soft(r.threadActive, `[${w}x${h}] opens on Thread`).toBe('active');
        expect.soft(r.inView, `[${w}x${h}] the mirror agent's line is in view (${JSON.stringify(r)})`).toBe(true);
        expect.soft(r.focused === 'TEXTAREA' || r.focused === 'DIV[textbox]', `[${w}x${h}] the composer did not take focus (${r.focused})`).toBe(false);
      } finally {
        await ctx.close().catch(() => undefined);
      }
    }
  } finally {
    await deleteTestUser(user.user.id).catch((e) => console.error('cleanup: delete user failed', e));
  }
});
