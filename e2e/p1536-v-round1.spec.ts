/**
 * @file p1536-v-round1.spec.ts
 * @description P1536 3c stage V, round 1: the screenshot set. One PNG per state and width (1440, 1280, 1279, 1024, 768, 390, 375, 320; device scale 1; the resize verified with
 * window.innerWidth before every shot) of the owner surface in a real Chromium on hosted TEST, with TEST fixture accounts only. A cell that cannot be reached is RECORDED as not reached
 * with the reason; a screenshot of a different state is never saved under a state's name (a failed wait leaves the picture in DIR/debug/, never in the set).
 *
 * Every cell appends one line to DIR/cells.jsonl: { state, width, file, how_reached, innerWidth, reached, reason }. The manifest and the state table are built from that file.
 *
 * Groups (run each with -g, each under 10 minutes):
 *   A  the X4 header table's rows a fixture can reach without the model
 *   B1 workspace chrome on a draft: panel closed, tabs, picker, Discard confirm, rename, stance control, Changed and Removed
 *   B2 keyboard-sized viewports on phones, rename saved
 *   C  stalled and seeded: Publishing, Updating, busy elsewhere, a failed run, the cap, drafting off
 *   D  the real model: reply chips with Undo, Add to chat with tags, a chip tap, Undone
 *   E  the real model, mixed material: offer rows, the closed thread with a live offer row, the Publish toast
 *   F1 mirror chat: chat list, the + menu, cards (draft, published, discarded), read-only threads, the J4 sheet
 *   F2 Artifacts tabs and rows, sidebar, avatar menu, reader and signed-out views
 *
 *   P1536_BASE=http://localhost:5102 P1536_V_DIR=<abs dir> npx playwright test e2e/p1536-v-round1.spec.ts --project=chromium -g "A header"
 */
import { test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import * as fs from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, TEST_PASSWORD, type TestUser } from './helpers/test-user';
import { isTestProjectUrl } from '../scripts/sweep-e2e-test-users';

import { pacLaunchOptions } from './helpers/pac-launch';

test.skip(!isTestProjectUrl(process.env.VITE_SUPABASE_URL ?? ''), 'p1536-v-round1: VITE_SUPABASE_URL is not a TEST project. Nothing was run.');
test.use({ launchOptions: pacLaunchOptions() }); // P1536_PAC: send the hosted TEST host through a proxy auto-config file; unset, the project's own options

const BASE = process.env.P1536_BASE ?? 'http://localhost:5102';
// The one backend this run may talk to. Asserted from the browsers' own network traffic (every request to a Supabase path), never from env values alone.
const SELFHOSTED_HOST = '136-85-1-126.sslip.io';
test.skip(new URL(process.env.VITE_SUPABASE_URL ?? 'http://none').host !== SELFHOSTED_HOST, 'p1536-v-round1: the test process (service-role client) is not pointed at the self-hosted TEST server. Nothing was run.');
const DIR = process.env.P1536_V_DIR ?? 'test-results/p1536-v-round-1';
fs.mkdirSync(`${DIR}/debug`, { recursive: true });
const CELLS = `${DIR}/cells.jsonl`;
test.use({ baseURL: BASE, actionTimeout: 20_000 });
test.setTimeout(1_100_000);
test.describe.configure({ retries: 0 });

const TITLE = 'Acme Bakery Plan for the Northern Region';
const WIDTHS = [1440, 1280, 1279, 1024, 768, 390, 375, 320];
const isPhone = (w: number) => w <= 641;
const FIRST: Array<[string, string]> = [
  ['canvas:segments', 'Office managers at companies with 20 to 200 staff (SEEDED)'],
  ['canvas:problem', 'Offices order catering late and get cold food (SEEDED)'],
  ['canvas:solution', 'A weekly standing order delivered fresh (SEEDED)'],
];
const MATERIAL =
  'Acme Test Bakery sells sourdough loaves and pastries to office managers at companies with 20 to 200 staff in Tallinn. ' +
  'The problem is that offices order catering late and get cold, generic food. Our solution is a weekly standing order delivered fresh at 9am. ' +
  'We charge 12 euros per person per week. My next milestone is signing ten office customers by March.';
const SECOND = 'Acme Test Bakery now also offers a gluten-free line for 14 euros per person per week to the same office managers.';
const BAKERY =
  'Acme Test Bakery sells weekly standing orders of sourdough and pastries to office managers at companies with 20 to 200 staff in Tallinn. ' +
  'They already pay me 12 euros per person per week, and ten offices are customers today. The problem is that offices order catering late and get cold, generic food. ' +
  'Our solution is a fresh delivery at 9am. My next milestone is signing ten more offices by March. ';
const STUDIO = 'I also run a small side business building websites for dental clinics at 3000 euros per site, with no clients yet. ';
const MIX2 = BAKERY + STUDIO + 'My focus is the bakery because the office managers already pay me.';

type Cell = { state: string; width: number; file: string | null; how_reached: string; innerWidth: number | null; reached: boolean; reason?: string };
function put(c: Cell) { fs.appendFileSync(CELLS, JSON.stringify(c) + '\n'); }

interface Ctx { w: number; ctx: BrowserContext; page: Page; hosts: Map<string, number> }
const BACKEND_PATH = /\/(rest|auth|functions|storage|realtime)\/v1\//;
async function mkCtxs(browser: Browser, user: TestUser | null, widths = WIDTHS, heightOf?: (w: number) => number): Promise<Ctx[]> {
  const out: Ctx[] = [];
  const only = process.env.P1536_WIDTHS ? process.env.P1536_WIDTHS.split(',').map(Number) : null; // split a >10 min group over two foreground calls
  for (const w of only ? widths.filter((x) => only.includes(x)) : widths) {
    const phone = isPhone(w);
    const ctx = await browser.newContext({ viewport: { width: w, height: heightOf ? heightOf(w) : phone ? 800 : 900 }, baseURL: BASE, deviceScaleFactor: 1, ...(phone ? { hasTouch: true, isMobile: true } : {}) });
    await ctx.addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } });
    const page = await ctx.newPage();
    const hosts = new Map<string, number>();
    page.on('request', (r) => { try { const u = new URL(r.url()); if (BACKEND_PATH.test(u.pathname) || /supabase\.(co|in)$/.test(u.host)) hosts.set(u.host, (hosts.get(u.host) ?? 0) + 1); } catch { /* not a URL */ } });
    if (user) await setTestSession(page, user.email);
    out.push({ w, ctx, page, hosts });
  }
  return out;
}
const closeAll = async (cs: Ctx[]) => { for (const c of cs) await c.ctx.close().catch(() => undefined); };

function assertBackend(c: Ctx, label: string) {
  const seen = Object.fromEntries(c.hosts);
  const bad = [...c.hosts.keys()].filter((h) => h !== SELFHOSTED_HOST);
  fs.appendFileSync(`${DIR}/backend-proof.jsonl`, JSON.stringify({ at: new Date().toISOString(), label, width: c.w, backendHosts: seen, ok: bad.length === 0 && c.hosts.size > 0 }) + '\n');
  if (bad.length || c.hosts.size === 0) { fs.writeFileSync(`${DIR}/BACKEND-MISMATCH.json`, JSON.stringify({ label, width: c.w, seen })); throw new Error(`BACKEND-MISMATCH: ${label}@${c.w} saw ${JSON.stringify(seen)}`); }
}

type Step = (page: Page, w: number) => Promise<void>;
interface CapOpts { only?: (w: number) => boolean; skipReason?: string; serial?: boolean; after?: Step }

/** One state at every width: go, wait for the state to be true, verify the resize, screenshot. A wait that fails is a not-reached cell, with its picture in debug/. */
async function cap(cs: Ctx[], state: string, how: string, go: Step, ready: Step, o: CapOpts = {}) {
  if (process.env.P1536_STATES && !new RegExp(process.env.P1536_STATES).test(state)) return; // re-run only some states of a group
  const one = async (c: Ctx) => {
    if (o.only && !o.only(c.w)) { put({ state, width: c.w, file: null, how_reached: how, innerWidth: null, reached: false, reason: o.skipReason ?? 'not applicable at this width' }); return; }
    let iw: number | null = null;
    try {
      await go(c.page, c.w);
      await ready(c.page, c.w);
      await c.page.evaluate(() => document.fonts.ready.then(() => true));
      await c.page.waitForTimeout(700);
      iw = await c.page.evaluate(() => window.innerWidth);
      if (iw !== c.w) throw new Error(`the resize did not take effect: innerWidth ${iw}`);
      assertBackend(c, state);
      const file = `${DIR}/${state}__${c.w}.png`;
      await c.page.screenshot({ path: file });
      put({ state, width: c.w, file, how_reached: how, innerWidth: iw, reached: true });
      if (o.after) await o.after(c.page, c.w).catch(() => undefined);
    } catch (e) {
      if (String((e as Error).message).startsWith('BACKEND-MISMATCH')) throw e; // a mixed run is impossible: stop the whole run
      await c.page.screenshot({ path: `${DIR}/debug/${state}__${c.w}.png` }).catch(() => undefined);
      put({ state, width: c.w, file: null, how_reached: how, innerWidth: iw, reached: false, reason: String((e as Error).message ?? e).replace(/\s+/g, ' ').slice(0, 260) });
    }
  };
  if (o.serial) { for (const c of cs) await one(c); return; }
  for (let i = 0; i < cs.length; i += 2) await Promise.all(cs.slice(i, i + 2).map(one)); // two at a time: TEST is the smallest size
}
const notReached = (state: string, how: string, reason: string, widths = WIDTHS) => widths.forEach((w) => put({ state, width: w, file: null, how_reached: how, innerWidth: null, reached: false, reason }));

async function ownerApi(email: string): Promise<SupabaseClient> {
  const api = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await api.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`owner sign-in failed: ${error?.message}`);
  return api;
}
type DraftRow = { id: string; version_id: string; version_name: string; revision: number; canvas_id: string; canvas_name: string; conversation_id: string; thread_root_id: string };
const COLS = 'id,version_id,version_name,revision,canvas_id,canvas_name,conversation_id,thread_root_id';
async function seed(ownerId: string, d: { id: string; version_name: string }, items: Array<[string, string]>) {
  for (const [box, statement] of items) {
    const { data, error } = await supabaseAdmin.from('points').insert({ statement, first_validator_id: ownerId, visibility: 'private', tags: [], system_tags: [box, `canvas_${d.version_name}`] }).select('id').single();
    if (error) throw new Error(`seed point: ${error.message}`);
    const { error: e2 } = await supabaseAdmin.from('canvas_draft_points').insert({ draft_id: d.id, point_id: data.id });
    if (e2) throw new Error(`seed draft point: ${e2.message}`);
  }
}
async function openNew(api: SupabaseClient, ownerId: string): Promise<DraftRow> {
  const { error } = await api.rpc('canvas_draft_open', { p_from_version: null });
  if (error) throw new Error(`canvas_draft_open: ${error.message}`);
  return (await supabaseAdmin.from('canvas_drafts').select(COLS).eq('owner_id', ownerId).eq('state', 'open').is('base_version_id', null).order('created_at', { ascending: false }).limit(1).maybeSingle()).data as DraftRow;
}
async function cloneOf(api: SupabaseClient, ownerId: string, baseVersionId: string): Promise<DraftRow> {
  const { error } = await api.rpc('canvas_draft_open', { p_from_version: baseVersionId });
  if (error) throw new Error(`canvas_draft_open from base: ${error.message}`);
  return (await supabaseAdmin.from('canvas_drafts').select(COLS).eq('owner_id', ownerId).eq('state', 'open').eq('base_version_id', baseVersionId).order('created_at', { ascending: false }).limit(1).maybeSingle()).data as DraftRow;
}
async function publish(api: SupabaseClient, d: DraftRow) {
  const { error } = await api.rpc('canvas_draft_publish', { p_draft: d.id, p_expected_revision: d.revision });
  if (error) throw new Error(`publish: ${error.message}`);
}
async function rename(api: SupabaseClient, canvasId: string, title: string) {
  const { error } = await api.rpc('canvas_rename', { p_canvas: canvasId, p_title: title });
  if (error) throw new Error(`rename: ${error.message}`);
}
/** A published v1 (three seeded points) with a title; returns the draft row that was published (its version_id is v1's id) and v1's address name. */
async function publishedV1(api: SupabaseClient, user: TestUser, title = TITLE) {
  const d = await openNew(api, user.user.id);
  await seed(user.user.id, d, FIRST);
  await publish(api, d);
  await rename(api, d.canvas_id, title);
  const v1 = (await supabaseAdmin.from('canvas_versions').select('name').eq('id', d.version_id).single()).data!.name as string;
  return { d, v1, path: `/p/${user.slug}/canvas/${d.canvas_name}` };
}

const q = (page: Page, id: string) => page.getByTestId(id);
// below 360px the pencil gives way to the name itself (canvas-rename-name), so a tap on the pencil would never land at 320
const startRename = async (p: Page) => { const pen = q(p, 'canvas-rename'); if (await pen.isVisible()) await pen.click(); else await q(p, 'canvas-rename-name').click(); };
const vis = (page: Page, id: string, timeout = 40_000) => q(page, id).first().waitFor({ state: 'visible', timeout });
const barReady: Step = (p) => vis(p, 'publish-spot');
const titleReady = async (p: Page, title = TITLE) => { const t0 = Date.now(); while (Date.now() - t0 < 40_000) { if (((await q(p, 'canvas-title').textContent().catch(() => '')) ?? '') === title) return; await p.waitForTimeout(300); } throw new Error(`title never read "${title}"`); };
const inWorkspace: Step = async (p) => { await barReady(p, 0); await titleReady(p); await p.getByTestId('workspace-chat-pane').waitFor({ state: 'attached', timeout: 40_000 }); };
const spotIs = async (p: Page, state: string, timeout = 40_000) => { await p.waitForFunction((s) => document.querySelector('[data-testid="publish-spot"]')?.getAttribute('data-state') === s, state, { timeout }); };
const goTo = (url: string): Step => async (p) => { await p.goto(url); };
const toTab = async (p: Page, w: number, tab: 'canvas' | 'chat') => { if (w >= 1280) return; await q(p, `workspace-view-${tab}`).click(); await p.waitForTimeout(300); };
const composer = (p: Page) => p.getByTestId('composer').getByRole('textbox').first();

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// A: the X4 header rows
test('A header: the X4 table rows a fixture reaches', async ({ browser }) => {
  const user = await createTestUser({ name: 'P1536 V A' });
  let cs: Ctx[] = [];
  try {
    const api = await ownerApi(user.email);
    const { d: d1, v1, path: path1 } = await publishedV1(api, user);
    const dr = await cloneOf(api, user.user.id, d1.version_id);
    cs = await mkCtxs(browser, user);
    const via = 'fixture: RPCs canvas_draft_open/publish/rename and service-role seeded points; no model call';
    await cap(cs, 'x4-draft-base-nothing-to-publish', `${via}; a draft from v1 with no difference; ?v=<draft>&ws=1`, goTo(`${path1}?v=${dr.version_name}&ws=1`), async (p, w) => { await inWorkspace(p, w); await spotIs(p, 'nothing'); });
    await cap(cs, 'x4-published-picked-from-draft', `${via}; the published v1 reached with ws=1 while the draft is open (the state the picker produces)`, goTo(`${path1}?v=${v1}&ws=1`), async (p, w) => { await inWorkspace(p, w); await spotIs(p, 'share'); });
    await cap(cs, 'x4-published-draft-open-view', `${via}; v1 reached by View (no ws=1) while the draft is open`, goTo(`${path1}?v=${v1}`), async (p) => { await barReady(p, 0); await titleReady(p); await vis(p, 'canvas-clone'); });
    await seed(user.user.id, dr, [['canvas:channels', 'Direct emails to office managers (SEEDED)']]);
    await cap(cs, 'x4-draft-base-publish', `${via}; the draft has one extra seeded point, so it differs from v1`, goTo(`${path1}?v=${dr.version_name}&ws=1`), async (p, w) => { await inWorkspace(p, w); await vis(p, 'canvas-draft-publish'); });
    const rev = (await supabaseAdmin.from('canvas_drafts').select('revision').eq('id', dr.id).single()).data!.revision as number;
    const disc = await api.rpc('canvas_draft_discard', { p_draft: dr.id, p_expected_revision: rev });
    if (disc.error) throw new Error(`discard: ${disc.error.message}`);
    await cap(cs, 'x4-published-no-draft', `${via}; the draft was discarded through canvas_draft_discard`, goTo(`${path1}?v=${v1}`), async (p) => { await barReady(p, 0); await titleReady(p); await vis(p, 'canvas-clone'); });
    await cap(cs, 'x4-pending-clone', 'Clone tapped on the published v1 with no draft open (nothing written)', async (p) => { await p.goto(`${path1}?v=${v1}`); await vis(p, 'canvas-clone'); await q(p, 'canvas-clone').click(); }, async (p) => { await vis(p, 'agent-line'); await titleReady(p); });
    const d2 = await openNew(api, user.user.id);
    await rename(api, d2.canvas_id, TITLE);
    const path2 = `/p/${user.slug}/canvas/${d2.canvas_name}`;
    await cap(cs, 'x4-never-published-no-points', `${via}; a new canvas, nothing in it`, goTo(`${path2}?v=${d2.version_name}&ws=1`), async (p, w) => { await inWorkspace(p, w); await spotIs(p, 'nothing'); });
    await seed(user.user.id, d2, FIRST);
    await cap(cs, 'x4-never-published-with-points', `${via}; the new canvas with three seeded points`, goTo(`${path2}?v=${d2.version_name}&ws=1`), async (p, w) => { await inWorkspace(p, w); await vis(p, 'canvas-draft-publish'); });
  } finally {
    await closeAll(cs);
    await deleteTestUser(user.user.id).catch((e) => console.error('cleanup failed', e));
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// B1: chrome on a draft
test('B1 chrome: panel, tabs, picker, Discard, rename, stance, Changed and Removed', async ({ browser }) => {
  const user = await createTestUser({ name: 'P1536 V B1' });
  let cs: Ctx[] = [];
  try {
    const api = await ownerApi(user.email);
    const { d: d1, path } = await publishedV1(api, user);
    const dr = await cloneOf(api, user.user.id, d1.version_id);
    await seed(user.user.id, dr, [['canvas:channels', 'Direct emails to office managers (SEEDED)']]);
    cs = await mkCtxs(browser, user);
    const fx = 'fixture: a published v1 and an open draft from it with one extra seeded point (RPCs and service-role points; no model call)';
    const ws = goTo(`${path}?v=${dr.version_name}&ws=1`);
    await cap(cs, 'panel-closed', `${fx}; the thread panel's × tapped`, async (p, w) => { await p.goto(`${path}?v=${dr.version_name}&ws=1`); await inWorkspace(p, w); await p.getByRole('button', { name: 'Close thread' }).first().click(); }, async (p) => { await vis(p, 'workspace-thread-button'); }, { only: (w) => w >= 1280, skipReason: 'the Thread panel and its close × exist only at 1280 and above; below it the Canvas | Thread switcher replaces them' });
    await cap(cs, 'tab-canvas', `${fx}; the Canvas tab selected`, async (p, w) => { await p.goto(`${path}?v=${dr.version_name}&ws=1`); await inWorkspace(p, w); await toTab(p, w, 'canvas'); }, async (p) => { await p.waitForFunction(() => document.querySelector('[data-testid="workspace-view-canvas"]')?.getAttribute('aria-selected') === 'true'); }, { only: (w) => w < 1280, skipReason: 'no tabs at 1280 and above: the canvas and the thread are both shown' });
    await cap(cs, 'tab-thread', `${fx}; the Thread tab selected`, async (p, w) => { await p.goto(`${path}?v=${dr.version_name}&ws=1`); await inWorkspace(p, w); await toTab(p, w, 'chat'); }, async (p) => { await p.waitForFunction(() => document.querySelector('[data-testid="workspace-view-chat"]')?.getAttribute('aria-selected') === 'true'); }, { only: (w) => w < 1280, skipReason: 'no tabs at 1280 and above: the canvas and the thread are both shown' });
    await cap(cs, 'picker-open', `${fx}; the version picker tapped`, async (p, w) => { await p.goto(`${path}?v=${dr.version_name}&ws=1`); await inWorkspace(p, w); await q(p, 'canvas-version-picker').click(); }, async (p) => { await p.getByRole('listbox').or(p.getByRole('menu')).or(p.getByTestId('canvas-version-select')).or(p.getByTestId('canvas-version-results')).first().waitFor({ state: 'visible', timeout: 15_000 }); });
    await cap(cs, 'discard-confirm', `${fx}; Discard tapped (the confirm is open, nothing discarded)`, async (p, w) => { await p.goto(`${path}?v=${dr.version_name}&ws=1`); await inWorkspace(p, w); await q(p, 'canvas-discard').click(); }, async (p) => { await p.getByRole('alertdialog').or(p.getByRole('dialog')).first().waitFor({ state: 'visible', timeout: 15_000 }); }, { after: async (p) => { await p.keyboard.press('Escape'); } });
    await cap(cs, 'rename-editing', `${fx}; the ✎ tapped (the name field open, nothing saved)`, async (p, w) => { await p.goto(`${path}?v=${dr.version_name}&ws=1`); await inWorkspace(p, w); await startRename(p); }, async (p) => { await vis(p, 'canvas-title-input', 15_000); });
    await cap(cs, 'stance-control-d20', `${fx}; the first point card tapped: its panel with the owner's position control`, async (p, w) => { await p.goto(`${path}?v=${dr.version_name}&ws=1`); await inWorkspace(p, w); await toTab(p, w, 'canvas'); await p.locator('[data-testid^="canvas-point-card-"]').first().click(); }, async (p) => { await vis(p, 'canvas-point-panel', 15_000); await p.getByRole('button', { name: /agree|position/i }).first().waitFor({ state: 'visible', timeout: 8_000 }).catch(async () => { throw new Error('point panel open, no point-positions-block; panel text: ' + ((await q(p, 'canvas-point-panel').innerText()).replace(/\s+/g, ' ').slice(0, 160))); }); });
    // Removed: take one base point out of the draft, so a box that had a point in v1 reads Empty against it
    const prob = (await supabaseAdmin.from('points').select('id,system_tags').eq('first_validator_id', user.user.id).contains('system_tags', ['canvas:problem', `canvas_${dr.version_name}`]).limit(1).maybeSingle()).data;
    if (!prob) notReached('changed-and-removed-boxes', fx, 'fixture: the draft holds no problem point to remove');
    else {
      // a draft's points are those tagged with its version name: dropping that tag takes the point out of the draft (the base's tag stays)
      const del = await supabaseAdmin.from('points').update({ system_tags: (prob.system_tags as string[]).filter((t) => t !== `canvas_${dr.version_name}`) }).eq('id', prob.id);
      if (del.error) notReached('changed-and-removed-boxes', fx, `fixture: ${del.error.message}`);
      else await cap(cs, 'changed-and-removed-boxes', `${fx}; then the base's problem point taken out of the draft by the service role: that box is Empty with Removed, the extra point's box Changed`, async (p, w) => { await p.goto(`${path}?v=${dr.version_name}&ws=1`); await inWorkspace(p, w); await toTab(p, w, 'canvas'); }, async (p) => { await vis(p, 'canvas-box-removed', 20_000).catch(async () => { throw new Error(`no Removed marker; removed=${await q(p, 'canvas-box-removed').count()} changed=${await q(p, 'canvas-box-changed').count()} points=${await p.locator('[data-testid^="canvas-point-card-"]').count()}`); }); await vis(p, 'canvas-box-changed', 20_000); await q(p, 'canvas-box-removed').first().scrollIntoViewIfNeeded(); });
    }
    void ws;
  } finally {
    await closeAll(cs);
    await deleteTestUser(user.user.id).catch((e) => console.error('cleanup failed', e));
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// B2: keyboard-sized viewports on phones; rename saved
test('B2 keyboard and rename saved', async ({ browser }) => {
  const user = await createTestUser({ name: 'P1536 V B2' });
  let cs: Ctx[] = [];
  let ks: Ctx[] = [];
  try {
    const api = await ownerApi(user.email);
    const { d: d1, v1, path } = await publishedV1(api, user);
    const dr = await cloneOf(api, user.user.id, d1.version_id);
    await seed(user.user.id, dr, [['canvas:channels', 'Direct emails to office managers (SEEDED)']]);
    const fx = 'fixture: a published v1 and an open draft from it (RPCs and seeded points; no model call)';
    // a keyboard-sized viewport: what a phone leaves above its on-screen keyboard (a real keyboard cannot be raised in this Chromium; the layout viewport is cut to 420px high)
    ks = await mkCtxs(browser, user, [390, 375, 320], () => 420);
    await cap(ks, 'keyboard-open-thread', `${fx}; the viewport cut to 420px high as a keyboard leaves it, the Thread tab, the composer focused. A real keyboard was not raised`, async (p, w) => { await p.goto(`${path}?v=${dr.version_name}&ws=1`); await inWorkspace(p, w); await toTab(p, w, 'chat'); await composer(p).click(); }, async (p) => { await composer(p).waitFor({ state: 'visible' }); });
    await cap(ks, 'keyboard-open-pending-clone', `${fx}; Clone tapped on v1, the viewport cut to 420px high, composer focused (no real keyboard)`, async (p, w) => { await p.goto(`${path}?v=${v1}`); await vis(p, 'canvas-clone'); await q(p, 'canvas-clone').click(); await p.waitForFunction(() => new URL(location.href).searchParams.get('ws') === '1', undefined, { timeout: 40_000 }); await p.waitForTimeout(4000); const comp = await p.evaluate(() => { const c = document.querySelector('[data-testid="composer"]'); const r = c?.getBoundingClientRect(); const tb = c?.querySelector('textarea,[role="textbox"]'); const tr = tb?.getBoundingClientRect(); return { composer: !!c, composerRect: r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) } : null, textbox: !!tb, textboxH: tr ? Math.round(tr.height) : null, threadTab: document.querySelector('[data-testid="workspace-view-chat"]')?.getAttribute('aria-selected') }; }); fs.appendFileSync(`${DIR}/findings.jsonl`, JSON.stringify({ finding: 'pending Clone 420px composer', width: w, comp }) + '\n'); const line = await q(p, 'agent-line').evaluate((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { exists: true, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom), innerHeight: window.innerHeight, display: cs.display, visibility: cs.visibility, parentOverflow: e.parentElement ? getComputedStyle(e.parentElement).overflow : null, focused: document.activeElement?.tagName }; }).catch(() => ({ exists: false })); fs.appendFileSync(`${DIR}/findings.jsonl`, JSON.stringify({ finding: 'pending Clone, (composer NOT tapped) in a 420px-high phone viewport: the mirror agent line', width: w, line }) + '\n'); }, async (p) => { await p.waitForTimeout(100); });
    notReached('keyboard-open-thread', fx, 'a keyboard is a phone state: the desktop widths have none', [1440, 1280, 1279, 1024, 768]);
    notReached('keyboard-open-pending-clone', fx, 'a keyboard is a phone state: the desktop widths have none', [1440, 1280, 1279, 1024, 768]);
    cs = await mkCtxs(browser, user);
    await cap(cs, 'rename-saved', `${fx}; the ✎ tapped, a new name typed, Enter: the toast "Name updated for everyone." is up`, async (p, w) => { await p.goto(`${path}?v=${dr.version_name}&ws=1`); await barReady(p, w); await vis(p, 'canvas-title'); await p.getByTestId('workspace-chat-pane').waitFor({ state: 'attached', timeout: 40_000 }); await startRename(p); const i = q(p, 'canvas-title-input'); await i.fill(`Acme Bakery Plan ${w}`); await i.press('Enter'); }, async (p) => { await p.locator('[data-sonner-toast]').filter({ hasText: /Name updated for everyone/ }).first().waitFor({ state: 'visible', timeout: 15_000 }); }, { serial: true });
  } finally {
    await closeAll(cs); await closeAll(ks);
    await deleteTestUser(user.user.id).catch((e) => console.error('cleanup failed', e));
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// C: stalled and seeded
test('C stalled: Publishing, Updating, busy elsewhere, failed run, cap, drafting off', async ({ browser }) => {
  const user = await createTestUser({ name: 'P1536 V C' });
  let cs: Ctx[] = [];
  try {
    const api = await ownerApi(user.email);
    const { d: d1, v1, path: path1 } = await publishedV1(api, user);
    const dY = await cloneOf(api, user.user.id, d1.version_id);
    await seed(user.user.id, dY, [['canvas:channels', 'Direct emails to office managers (SEEDED)']]);
    const d2 = await openNew(api, user.user.id);
    await seed(user.user.id, d2, FIRST);
    await rename(api, d2.canvas_id, 'Second canvas for the stalled states');
    const path2 = `/p/${user.slug}/canvas/${d2.canvas_name}`;
    cs = await mkCtxs(browser, user);
    const fx = 'fixture: RPCs and seeded points';
    const inWs: Step = async (p) => { await barReady(p, 0); await vis(p, 'canvas-title'); await p.getByTestId('workspace-chat-pane').waitFor({ state: 'attached', timeout: 40_000 }); }; // the second and third canvases have other titles
    // hold every run start (the canvas-draft call with a run_id): the run stays queued in the database, which is what Updating… reads. Availability questions pass.
    for (const c of cs) await c.page.route(/functions\/v1\/canvas-draft/, async (r) => { if (/"run_id"/.test(r.request().postData() ?? '')) return; await r.continue(); });

    // Publishing…: the publish call held, so the spot reads Publishing…
    await cap(cs, 'publishing', `${fx}; Publish tapped with the publish call held in the network layer (never sent), so the spot reads Publishing…`, async (p, w) => {
      await p.unroute(/rest\/v1\/rpc\/canvas_draft_publish/).catch(() => undefined);
      await p.goto(`${path1}?v=${dY.version_name}&ws=1`); await inWs(p, w); await vis(p, 'canvas-draft-publish');
      await p.route(/rest\/v1\/rpc\/canvas_draft_publish/, () => undefined);
      await q(p, 'canvas-draft-publish').click();
    }, async (p) => { await spotIs(p, 'publishing', 15_000); }, { after: async (p) => { await p.unroute(/rest\/v1\/rpc\/canvas_draft_publish/); } });

    // Updating…: send a message on canvas 2 at 1440 with run starts held; the run is queued in the database
    const send = cs[0]!;
    await send.page.goto(`${path2}?v=${d2.version_name}&ws=1`);
    await inWs(send.page, send.w);
    await composer(send.page).click();
    await send.page.keyboard.type('Please make the problem sharper.');
    await send.page.locator('[data-composer-send]').first().click();
    await spotIs(send.page, 'updating', 30_000).catch(async (e) => { const runs = (await supabaseAdmin.from('canvas_draft_runs').select('state,error_code,kind').eq('draft_id', d2.id)).data; const sp = await send.page.getByTestId('publish-spot').getAttribute('data-state'); fs.appendFileSync(`${DIR}/findings.jsonl`, JSON.stringify({ finding: 'updating never reached after Send with the run start held', spot: sp, runs, field: await composer(send.page).inputValue().catch(() => null) }) + '\n'); throw e; });
    await cap(cs, 'updating', `${fx}; a typed message sent at 1440 with the run start held in the network layer (the run is queued in the database, the model is not called); each width loads that draft`, goTo(`${path2}?v=${d2.version_name}&ws=1`), async (p, w) => { await inWs(p, w); await spotIs(p, 'updating', 20_000).catch(async () => { const runs = (await supabaseAdmin.from('canvas_draft_runs').select('state,error_code,kind').eq('draft_id', d2.id)).data; throw new Error(`spot never read updating; spot=${await p.getByTestId('publish-spot').getAttribute('data-state').catch(() => 'absent')} text=${await p.getByTestId('publish-spot').innerText().catch(() => '')} runs=${JSON.stringify(runs)}`); }); });
    await cap(cs, 'busy-elsewhere', `${fx}; the OTHER canvas's draft while canvas 2 has a queued run (the composer says why Send waits)`, goTo(`${path1}?v=${dY.version_name}&ws=1`), async (p, w) => { await inWs(p, w); await vis(p, 'canvas-draft-publish'); await toTab(p, w, 'chat'); await p.waitForTimeout(500); });

    // the queued run is marked failed by the service role: the newest run failed
    const run = (await supabaseAdmin.from('canvas_draft_runs').select('id').eq('draft_id', d2.id).in('state', ['queued', 'running']).limit(1).maybeSingle()).data;
    if (!run) notReached('failed-run', `${fx}; the queued run marked failed by the service role`, 'fixture: no queued run to mark failed');
    else {
      const up = await supabaseAdmin.from('canvas_draft_runs').update({ state: 'failed', error_code: 'abandoned', finished_at: new Date().toISOString() }).eq('id', run.id);
      if (up.error) notReached('failed-run', `${fx}; the queued run marked failed by the service role`, `fixture: ${up.error.message}`);
      else await cap(cs, 'failed-run', `${fx}; a message sent with the run start held, then that run row set to failed by the service role (SEEDED failure, the real model never failed here)`, goTo(`${path2}?v=${d2.version_name}&ws=1`), async (p, w) => { await inWs(p, w); await toTab(p, w, 'chat'); await vis(p, 'canvas-retry', 20_000); });
    }

    // the 30-update cap: 30 finished runs by the service role
    const rows = Array.from({ length: 30 }, () => ({ draft_id: d2.id, owner_id: user.user.id, kind: 'draft', speed: 'fast', state: 'done' }));
    const ins = await supabaseAdmin.from('canvas_draft_runs').insert(rows);
    const upd = ins.error ? ins : await supabaseAdmin.from('canvas_drafts').update({ run_count: 30 }).eq('id', d2.id);
    if (upd.error) notReached('cap-with-points', `${fx}; 30 finished runs seeded`, `fixture: ${upd.error.message}`);
    else await cap(cs, 'cap-with-points', `${fx}; 30 finished runs seeded by the service role on a draft that has points (the cap line, Publish still offered)`, goTo(`${path2}?v=${d2.version_name}&ws=1`), async (p, w) => { await inWs(p, w); await toTab(p, w, 'chat'); await p.getByText(/30 updates/).first().waitFor({ timeout: 20_000 }); });
    const d3 = await openNew(api, user.user.id);
    const rows3 = Array.from({ length: 30 }, () => ({ draft_id: d3.id, owner_id: user.user.id, kind: 'draft', speed: 'fast', state: 'done' }));
    const i3 = await supabaseAdmin.from('canvas_draft_runs').insert(rows3);
    const u3 = i3.error ? i3 : await supabaseAdmin.from('canvas_drafts').update({ run_count: 30 }).eq('id', d3.id);
    const path3 = `/p/${user.slug}/canvas/${d3.canvas_name}`;
    if (u3.error) notReached('cap-nothing-to-publish', `${fx}; 30 finished runs seeded`, `fixture: ${u3.error.message}`);
    else await cap(cs, 'cap-nothing-to-publish', `${fx}; a new empty canvas with 30 finished runs seeded: the cap line, Start over, "Nothing to publish yet"`, goTo(`${path3}?v=${d3.version_name}&ws=1`), async (p, w) => { await inWs(p, w).catch(() => barReady(p, w)); await toTab(p, w, 'chat'); await p.getByText(/30 updates/).first().waitFor({ timeout: 20_000 }); });

    // drafting off: the availability answer replaced by enabled:false in the network layer
    for (const c of cs) {
      await c.page.unroute(/functions\/v1\/canvas-draft/);
      await c.page.route(/functions\/v1\/canvas-draft/, async (r) => { if (/"availability"/.test(r.request().postData() ?? '')) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ enabled: false }) }); return r.continue(); });
    }
    const off = `${fx}; the availability answer replaced with {enabled:false} in the network layer (a mocked server flag)`;
    await cap(cs, 'drafting-off-published-owner', off, goTo(`${path1}?v=${v1}`), async (p) => { await barReady(p, 0); await titleReady(p); await vis(p, 'canvas-share-control'); await p.waitForTimeout(1500); });
    await cap(cs, 'drafting-off-draft-owner', off, goTo(`${path1}?v=${dY.version_name}`), async (p) => { await vis(p, 'canvas-title'); await p.waitForTimeout(3500); });
  } finally {
    await closeAll(cs);
    await deleteTestUser(user.user.id).catch((e) => console.error('cleanup failed', e));
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// D: the real model: chips, Undo, Add to chat with tags, a chip tap, Undone
test('D model: reply chips with Undo, Add to chat with tags, a chip tap, Undone', async ({ browser }) => {
  // P1536_D_KEEP=<file>: the fixture user and canvas URL persist in that file across foreground calls (a >10 min group), so the two real model runs are made once, not once per call.
  // The user is deleted only when P1536_D_CLEAN=1; P1536_D_UNDO=1 taps Undo (it changes the thread, so it is the last step).
  const KEEP = process.env.P1536_D_KEEP;
  const saved: { user: TestUser; url: string } | null = KEEP && fs.existsSync(KEEP) ? JSON.parse(fs.readFileSync(KEEP, 'utf8')) : null;
  const user = saved ? saved.user : await createTestUser({ name: 'P1536 V D' });
  if (KEEP && !saved) fs.writeFileSync(KEEP, JSON.stringify({ user, url: '' }));
  let cs: Ctx[] = [];
  try {
    cs = await mkCtxs(browser, user);
    const lead = cs[0]!;
    let url = saved?.url ?? '';
    const fx = 'the real model (canvas-draft on TEST): a new canvas, material uploaded as a file, then a typed update';
    if (!saved) {
    await lead.page.goto('/artifacts');
    await lead.page.getByRole('tab', { name: 'Canvases' }).click();
    await q(lead.page, 'artifacts-new-canvas').click();
    await lead.page.waitForURL(/\/p\/[^/]+\/canvas\/canvas(?:_\d+)?\?/, { timeout: 45_000 });
    await vis(lead.page, 'canvas-opener');
    url = lead.page.url();
    if (KEEP) fs.writeFileSync(KEEP, JSON.stringify({ user, url }));
    await cap(cs, 'new-canvas-opener', 'a new canvas just opened from Artifacts New canvas (no model call yet): the opener and Copy prompt', goTo(url), async (p, w) => { await inWorkspace(p, w).catch(() => barReady(p, w)); await toTab(p, w, 'chat'); await vis(p, 'canvas-opener'); });
    await q(lead.page, 'canvas-upload-input').setInputFiles({ name: 'acme-notes.md', mimeType: 'text/markdown', buffer: Buffer.from(`# Acme notes\n\n${MATERIAL}\n`) });
    await spotIs(lead.page, 'updating', 45_000).catch(() => undefined);
    await lead.page.waitForFunction(() => document.querySelector('[data-testid="publish-spot"]')?.getAttribute('data-state') !== 'updating', undefined, { timeout: 180_000 });
    await lead.page.waitForTimeout(2500);
    // a second update, typed: its reply names the boxes it changed
    if (lead.w < 1280) await toTab(lead.page, lead.w, 'chat');
    await composer(lead.page).click();
    await lead.page.keyboard.type(SECOND);
    await lead.page.locator('[data-composer-send]').first().click();
    await spotIs(lead.page, 'updating', 45_000).catch(() => undefined);
    await lead.page.waitForFunction(() => document.querySelector('[data-testid="publish-spot"]')?.getAttribute('data-state') !== 'updating', undefined, { timeout: 180_000 });
    await lead.page.waitForTimeout(3000);
    }
    await cap(cs, 'run-done-publish-spot', `${fx}; two real runs done: boxes filled, the spot reads Publish`, goTo(url), async (p, w) => { await inWorkspace(p, w).catch(() => barReady(p, w)); await vis(p, 'canvas-draft-publish'); await toTab(p, w, 'canvas'); });
    await cap(cs, 'reply-chips-with-undo', `${fx}; the thread after the second run: "Updated: [boxes] Undo" (the chips and Undo are one reply)`, goTo(url), async (p, w) => { await inWorkspace(p, w).catch(() => barReady(p, w)); await toTab(p, w, 'chat'); await vis(p, 'canvas-undo', 30_000); });
    await cap(cs, 'chip-tap-highlight', `${fx}; the first reply chip tapped: the box it names shows with its 2-second highlight ring`, async (p, w) => { await p.goto(url); await inWorkspace(p, w).catch(() => barReady(p, w)); await toTab(p, w, 'chat'); await vis(p, 'canvas-undo', 30_000); await p.locator('[data-box]').last().click(); }, async (p) => { await p.waitForFunction(() => !!document.querySelector('[data-highlight]'), undefined, { timeout: 5000 }); });
    await cap(cs, 'add-to-chat-tags', `${fx}; Add to chat tapped on two boxes: both tags sit in the composer (on a phone the view switches to Thread)`, async (p, w) => {
      await p.goto(url); await inWorkspace(p, w).catch(() => barReady(p, w)); await toTab(p, w, 'canvas');
      for (const t of ['canvas:segments', 'canvas:problem']) { const b = q(p, `canvas-add-to-chat-${t}`); await b.scrollIntoViewIfNeeded(); await b.click(); await p.waitForTimeout(400); if (w < 1280 && t === 'canvas:segments') await toTab(p, w, 'canvas'); }
    }, async (p) => { await p.waitForFunction(() => /\[[^\]]+\].*\[[^\]]+\]/s.test((document.querySelector('[data-testid="composer"] textarea, [data-testid="composer"] [role="textbox"]') as HTMLTextAreaElement | null)?.value ?? (document.querySelector('[data-testid="composer"]') as HTMLElement | null)?.innerText ?? ''), undefined, { timeout: 10_000 }); });
    // Undo the second run once: the reply reads Undone., and the first run's reply carries Undo
    if (KEEP && process.env.P1536_D_UNDO !== '1' && !(process.env.P1536_STATES ?? '').includes('undone')) return;
    await lead.page.goto(url);
    await inWorkspace(lead.page, lead.w).catch(() => barReady(lead.page, lead.w));
    await toTab(lead.page, lead.w, 'chat');
    await q(lead.page, 'canvas-undo').first().click();
    await lead.page.getByText('Undone.').first().waitFor({ timeout: 40_000 });
    await cap(cs, 'undone-reply', `${fx}; Undo tapped once at 1440: the newest reply reads Undone., the first run's reply carries Undo`, goTo(url), async (p, w) => { await inWorkspace(p, w).catch(() => barReady(p, w)); await toTab(p, w, 'chat'); await p.getByText('Undone.').first().waitFor({ timeout: 30_000 }); });
  } finally {
    await closeAll(cs);
    if (!KEEP || process.env.P1536_D_CLEAN === '1') await deleteTestUser(user.user.id).catch((e) => console.error('cleanup failed', e));
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// E: the real model, mixed material: offers
test('E offers: offer rows, the closed thread, the Publish toast', async ({ browser }) => {
  const user = await createTestUser({ name: 'P1536 V E' });
  let cs: Ctx[] = [];
  try {
    cs = await mkCtxs(browser, user);
    const lead = cs[0]!;
    await lead.page.goto('/artifacts');
    await lead.page.getByRole('tab', { name: 'Canvases' }).click();
    await q(lead.page, 'artifacts-new-canvas').click();
    await lead.page.waitForURL(/\/p\/[^/]+\/canvas\/canvas(?:_\d+)?\?/, { timeout: 45_000 });
    await vis(lead.page, 'canvas-opener');
    await lead.page.waitForTimeout(800);
    await q(lead.page, 'canvas-upload-input').setInputFiles({ name: 'acme-notes.md', mimeType: 'text/markdown', buffer: Buffer.from(`# Acme notes\n\n${MIX2}\n`) });
    await spotIs(lead.page, 'updating', 45_000).catch(() => undefined);
    await lead.page.waitForFunction(() => document.querySelector('[data-testid="publish-spot"]')?.getAttribute('data-state') !== 'updating', undefined, { timeout: 180_000 });
    await lead.page.waitForTimeout(3500);
    const url = lead.page.url();
    const fx = 'the real model: mixed material (a bakery and a website side business) uploaded as a file to a new canvas';
    await cap(cs, 'offer-rows', `${fx}; the thread after the run: the first line naming what was found and the offer row with Make it about this / Start a canvas / ×`, goTo(url), async (p, w) => { await inWorkspace(p, w).catch(() => barReady(p, w)); await toTab(p, w, 'chat'); await vis(p, 'canvas-offer-row', 30_000); });
    // Publish at 1440 with the offer open: the toast
    await lead.page.goto(url);
    await inWorkspace(lead.page, lead.w).catch(() => barReady(lead.page, lead.w));
    await vis(lead.page, 'canvas-draft-publish');
    await q(lead.page, 'canvas-draft-publish').click();
    const toast = lead.page.locator('[data-sonner-toast]').filter({ hasText: /Published v/ }).first();
    await toast.waitFor({ timeout: 40_000 });
    await lead.page.waitForTimeout(500);
    const toastText = ((await toast.textContent()) ?? '').trim();
    const toastFile = `${DIR}/publish-toast-with-offer__1440.png`;
    await lead.page.screenshot({ path: toastFile });
    put({ state: 'publish-toast-with-offer', width: 1440, file: toastFile, how_reached: `${fx}; Publish tapped at 1440 with the offer open; toast text: ${toastText.slice(0, 160)}`, innerWidth: await lead.page.evaluate(() => window.innerWidth), reached: true });
    notReached('publish-toast-with-offer', `${fx}; the toast is raised once, at the one Publish tap`, 'the fixture publishes once (a real-model run per canvas), at 1440; the toast cannot be re-raised for the other widths without a second mixed canvas per width', WIDTHS.filter((w) => w !== 1440));
    // the closed thread of that canvas: its read-only panel with the live offer row
    await toast.getByRole('button', { name: 'See offer' }).click().catch(() => undefined);
    await q(lead.page, 'canvas-closed-line').waitFor({ timeout: 30_000 });
    const closedUrl = lead.page.url();
    await cap(cs, 'closed-thread-with-offer-row', `${fx}; after Publish, the thread opened from the toast's See offer: the closed line (no composer) and the live offer row`, goTo(closedUrl), async (p) => { await vis(p, 'canvas-closed-line', 40_000); await vis(p, 'canvas-offer-row', 30_000); });
  } finally {
    await closeAll(cs);
    await deleteTestUser(user.user.id).catch((e) => console.error('cleanup failed', e));
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// F1: mirror chat
test('F1 chat: chat list, + menu, cards, read-only threads, J4 sheet', async ({ browser }) => {
  const user = await createTestUser({ name: 'P1536 V F1' });
  let cs: Ctx[] = [];
  try {
    const api = await ownerApi(user.email);
    const ownerId = user.user.id;
    const { d: d1 } = await publishedV1(api, user);
    const reply = async (d: DraftRow, body: string) => { const { error } = await supabaseAdmin.from('chat_messages').insert({ conversation_id: d.conversation_id, author_id: ownerId, body, thread_root_id: d.thread_root_id, kind: 'message' }); if (error) throw new Error(`reply: ${error.message}`); };
    const withPoint = async (base: string, extra: string) => { const d = await cloneOf(api, ownerId, base); const b = (await supabaseAdmin.from('canvas_versions').select('name').eq('id', base).single()).data!.name as string; const pts = (await supabaseAdmin.from('points').select('id,system_tags').eq('first_validator_id', ownerId).contains('system_tags', [`canvas_${b}`])).data ?? []; for (const pt of pts) await supabaseAdmin.from('points').update({ system_tags: [...(pt.system_tags as string[]), `canvas_${d.version_name}`] }).eq('id', pt.id); await seed(ownerId, d, [['canvas:channels', `${extra} (SEEDED)`]]); return d; };
    const A = await withPoint(d1.version_id, 'A: direct emails');
    await publish(api, A);
    const B = await withPoint(d1.version_id, 'B: a thing');
    const disB = await api.rpc('canvas_draft_discard', { p_draft: B.id, p_expected_revision: B.revision });
    if (disB.error) throw new Error(`discard B: ${disB.error.message}`);
    const C = await withPoint(d1.version_id, 'C: partnerships');
    await reply(A, 'a note in A 1'); await reply(A, 'a note in A 2'); await reply(B, 'a note in B'); await reply(C, 'a note in C 1');
    const chat = `/chats/c/${A.conversation_id}`;
    cs = await mkCtxs(browser, user);
    const fx = 'fixture: RPCs and seeded points: canvas 1 v1 published; clone A published as v2; clone B discarded; clone C open; replies seeded by the service role';
    const cardsReady = async (p: Page) => { await p.waitForFunction(() => document.querySelectorAll('[data-testid="attachment-canvas_version"]').length >= 4, undefined, { timeout: 40_000 }); await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="canvas-version-state"]')].filter((e) => /\w/.test(e.textContent ?? '')).length >= 4, undefined, { timeout: 20_000 }); await p.waitForTimeout(1200); };
    await cap(cs, 'chat-list', 'the chat list (/chats) of the owner with a mirror chat', goTo('/chats'), async (p) => { await p.locator('main, [role="main"]').first().waitFor({ state: 'visible', timeout: 30_000 }); await p.waitForTimeout(3500); });
    await cap(cs, 'plus-menu', `${fx}; the mirror chat's composer + tapped: New canvas, Clone a version`, async (p) => { await p.goto(chat); await q(p, 'composer-plus').waitFor({ timeout: 40_000 }); await q(p, 'composer-plus').click(); }, async (p) => { await p.getByRole('menu').waitFor({ timeout: 10_000 }); });
    const card = (state: string, nth: number) => async (p: Page) => { await p.goto(chat); await cardsReady(p); const el = p.locator(`[data-testid="attachment-canvas_version"][data-state="${state}"]`).nth(nth); await el.scrollIntoViewIfNeeded(); await el.evaluate((n) => (n as HTMLElement).scrollIntoView({ block: 'center' })); };
    await cap(cs, 'card-draft', `${fx}; the open clone C's card in the mirror chat, centred`, card('draft', 0), async (p) => { await p.waitForTimeout(300); });
    await cap(cs, 'card-published', `${fx}; the published clone A's card in the mirror chat, centred`, card('published', 1), async (p) => { await p.waitForTimeout(300); });
    await cap(cs, 'card-discarded', `${fx}; the discarded clone B's card in the mirror chat, centred`, card('discarded', 0), async (p) => { await p.waitForTimeout(300); });
    const rowOf = (n: number) => (p: Page) => p.getByTestId('message').filter({ has: p.getByTestId('attachment-canvas_version') }).nth(n);
    await cap(cs, 'read-only-thread-published', `${fx}; A's "N replies" tapped: its thread opens in the chat's own panel with the closed line "Published as v2" and no composer`, async (p) => { await p.goto(chat); await cardsReady(p); await rowOf(1)(p).getByTestId('replies-link').click(); }, async (p) => { await vis(p, 'canvas-closed-line', 30_000); });
    await cap(cs, 'read-only-thread-discarded', `${fx}; B's "N replies" tapped: the closed line "This draft was discarded." and no composer`, async (p) => { await p.goto(chat); await cardsReady(p); await rowOf(2)(p).getByTestId('replies-link').click(); }, async (p) => { await vis(p, 'canvas-closed-line', 30_000); });
    // J4: a canvas with v1, v2 published and a draft from v2 holding a message; Add to chat on v1
    const e1 = await publishedV1(api, user, 'Third canvas for the sheet');
    const e2 = await withPoint(e1.d.version_id, 'E2: a second version');
    await publish(api, e2);
    const e3 = await withPoint(e2.version_id, 'E3: a third version');
    await reply(e3, 'a message in the draft from v2');
    await cap(cs, 'j4-sheet', 'fixture: a canvas with v1 and v2 published and an open draft from v2 holding one message (service-role reply); v1 opened and Add to chat tapped on a box', async (p) => { await p.goto(`${e1.path}?v=${e1.v1}`); const b = q(p, 'canvas-add-to-chat-canvas:problem'); await b.waitFor({ timeout: 40_000 }); await b.scrollIntoViewIfNeeded(); await b.click(); }, async (p) => { await vis(p, 'clone-draft-sheet', 15_000); }, { after: async (p) => { await p.keyboard.press('Escape'); } });
  } finally {
    await closeAll(cs);
    await deleteTestUser(user.user.id).catch((e) => console.error('cleanup failed', e));
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// F2: Artifacts, sidebar, avatar menu, reader and signed-out
test('F2 artifacts: tabs, rows, sidebar, avatar menu, reader, signed out', async ({ browser }) => {
  const user = await createTestUser({ name: 'P1536 V F2' });
  const reader = await createTestUser({ name: 'P1536 V F2 Reader' });
  let cs: Ctx[] = [];
  let rs: Ctx[] = [];
  let os: Ctx[] = [];
  try {
    const api = await ownerApi(user.email);
    const { d: d1, v1, path } = await publishedV1(api, user);
    const dr = await cloneOf(api, user.user.id, d1.version_id);
    await seed(user.user.id, dr, [['canvas:channels', 'Direct emails to office managers (SEEDED)']]);
    const d2 = await openNew(api, user.user.id);
    await rename(api, d2.canvas_id, 'A canvas that was never published');
    cs = await mkCtxs(browser, user);
    const fx = 'fixture: RPCs and seeded points (a published canvas with an open draft from it; a second, never-published canvas)';
    await cap(cs, 'artifacts-bare-default', `${fx}; bare /artifacts (X14: Canvases first, the Mine list)`, goTo('/artifacts'), async (p) => { await vis(p, 'artifact-row', 40_000); await p.waitForTimeout(800); });
    await cap(cs, 'artifacts-canvases-mine', `${fx}; Artifacts, Canvases tab, Mine`, async (p) => { await p.goto('/artifacts?tab=canvases'); await p.getByRole('tab', { name: 'Canvases' }).first().click(); const m = p.getByRole('tab', { name: /^Mine/ }).or(p.getByRole('button', { name: /^Mine/ })).first(); if (await m.count()) await m.click(); }, async (p) => { await vis(p, 'artifact-row', 30_000); });
    await cap(cs, 'artifacts-canvases-drafts', `${fx}; Artifacts, Canvases tab, Drafts`, async (p) => { await p.goto('/artifacts?tab=canvases'); await p.getByRole('tab', { name: 'Canvases' }).first().click(); await p.getByRole('tab', { name: /^Drafts/ }).or(p.getByRole('button', { name: /^Drafts/ })).first().click(); }, async (p) => { await vis(p, 'artifact-row', 30_000); });
    await cap(cs, 'artifacts-canvases-shared-with-me', `${fx}; Artifacts, Canvases tab, Shared with me (this owner has nothing shared: the empty state)`, async (p) => { await p.goto('/artifacts?tab=canvases'); await p.getByRole('tab', { name: 'Canvases' }).first().click(); await p.getByRole('tab', { name: /Shared with me/ }).or(p.getByRole('button', { name: /Shared with me/ })).first().click(); }, async (p) => { await p.waitForTimeout(1500); });
    await cap(cs, 'artifacts-letters-tab', `${fx}; Artifacts, Letters tab`, async (p) => { await p.goto('/artifacts?tab=letters'); }, async (p) => { await p.getByRole('tab', { name: 'Letters' }).first().waitFor({ timeout: 30_000 }); await p.waitForTimeout(1500); });
    await cap(cs, 'sidebar', `${fx}; /home with the desktop sidebar (visible only where the shell shows one)`, goTo('/artifacts'), async (p) => { await p.locator('nav[data-nav="sidebar"]').first().waitFor({ state: 'visible', timeout: 20_000 }); await p.waitForTimeout(800); }, { only: (w) => w >= 1024, skipReason: 'the sidebar is hidden below the lg breakpoint (1024px): a phone/tablet shows the bottom bar' });
    await cap(cs, 'avatar-menu', `${fx}; the sidebar avatar (≥1024) or the bottom bar's Me sheet (below) opened`, async (p, w) => { await p.goto('/artifacts'); if (w >= 1024) { await p.getByRole('button', { name: /^Menu/ }).last().click(); } else { await q(p, 'bottom-nav-me').click(); } }, async (p, w) => { if (w >= 1024) await p.getByRole('menu').waitFor({ timeout: 10_000 }); else await vis(p, 'me-sheet', 10_000); });
    await cap(cs, 'bottom-nav', `${fx}; the phone/tablet bottom bar on Artifacts`, goTo('/artifacts'), async (p) => { await q(p, 'bottom-nav-me').waitFor({ timeout: 20_000 }); await p.waitForTimeout(500); }, { only: (w) => w < 1024, skipReason: 'the bottom bar is replaced by the sidebar at 1024 and above' });
    // share the published canvas by link, then a reader and a signed-out visitor
    const ownerPage = cs[0]!.page;
    await ownerPage.goto(`${path}?v=${v1}`);
    await q(ownerPage, 'canvas-share-control').click();
    await q(ownerPage, 'canvas-share-panel').getByTestId('canvas-share-general').selectOption('link');
    await ownerPage.getByRole('button', { name: 'Share with link' }).click();
    await ownerPage.waitForTimeout(2500);
    await cs[0]!.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => undefined);
    await q(ownerPage, 'canvas-share-copy').click();
    await ownerPage.waitForTimeout(800);
    const copied = await ownerPage.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    const link = copied.startsWith('http') ? new URL(copied) : null;
    const linkPath = link ? `${link.pathname}${link.search}${link.hash}` : `${path}?v=${v1}`;
    fs.appendFileSync(`${DIR}/findings.jsonl`, JSON.stringify({ finding: 'share link copied', pathShape: link ? link.pathname.replace(/[^/]+$/, '<name>') : null, hasQuery: link ? link.search.length > 0 : null, hasHash: link ? link.hash.length > 0 : null }) + '\n');
    fs.appendFileSync(`${DIR}/findings.jsonl`, JSON.stringify({ finding: 'owner share panel after Share with link', text: (await q(ownerPage, 'canvas-share-control').innerText().catch(() => '')).replace(/\s+/g, ' ') }) + '\n');
    rs = await mkCtxs(browser, reader);
    os = await mkCtxs(browser, null);
    await cap(rs, 'reader-published', 'a second signed-in TEST account opened the owner\'s share link (copied from the Share panel, Anyone with the link): a reader, no owner controls', goTo(linkPath), async (p, w) => { await p.waitForFunction(() => !!document.querySelector('[data-testid="canvas-grid"], [data-testid="canvas-title"]'), undefined, { timeout: 40_000 }); await p.waitForTimeout(2500); const info = await p.evaluate(() => ({ title: document.querySelector('[data-testid="canvas-title"]')?.textContent ?? null, rename: !!document.querySelector('[data-testid="canvas-rename"]'), clone: !!document.querySelector('[data-testid="canvas-clone"]'), share: !!document.querySelector('[data-testid="canvas-share-control"]'), picker: document.querySelector('[data-testid="canvas-version-picker"]')?.textContent ?? null, spot: document.querySelector('[data-testid="publish-spot"]')?.textContent ?? null, points: document.querySelectorAll('[data-testid^="canvas-point-card-"]').length, body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 240) })); fs.appendFileSync(`${DIR}/findings.jsonl`, JSON.stringify({ finding: 'reader-published view', width: w, info }) + '\n'); });
    await cap(os, 'signed-out-published', 'a context with no session opened the owner\'s share link (copied from the Share panel)', goTo(linkPath), async (p, w) => { await p.waitForFunction(() => !!document.querySelector('[data-testid="canvas-grid"], [data-testid="canvas-title"]'), undefined, { timeout: 40_000 }); await p.waitForTimeout(2500); const info = await p.evaluate(() => ({ title: document.querySelector('[data-testid="canvas-title"]')?.textContent ?? null, rename: !!document.querySelector('[data-testid="canvas-rename"]'), clone: !!document.querySelector('[data-testid="canvas-clone"]'), share: !!document.querySelector('[data-testid="canvas-share-control"]'), picker: document.querySelector('[data-testid="canvas-version-picker"]')?.textContent ?? null, spot: document.querySelector('[data-testid="publish-spot"]')?.textContent ?? null, points: document.querySelectorAll('[data-testid^="canvas-point-card-"]').length, body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 240) })); fs.appendFileSync(`${DIR}/findings.jsonl`, JSON.stringify({ finding: 'signed-out-published view', width: w, info }) + '\n'); });
    void d2;
  } finally {
    await closeAll(cs); await closeAll(rs); await closeAll(os);
    await deleteTestUser(user.user.id).catch((e) => console.error('cleanup failed', e));
    await deleteTestUser(reader.user.id).catch((e) => console.error('cleanup failed', e));
  }
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// R: targeted re-checks with DOM measurements (a) rename pencil at 320, (b) pending Clone at 390/375/320 x 420/800px high, (c) the Publish toast at every width, (d) the Clone's first Send at 375
const rec = (o: Record<string, unknown>) => fs.appendFileSync(`${DIR}/recheck.jsonl`, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
const rectOf = (p: Page, sel: string) => p.evaluate((s) => {
  const e = document.querySelector(s) as HTMLElement | null; if (!e) return null;
  const b = e.getBoundingClientRect(); const cs = getComputedStyle(e);
  const cx = Math.min(Math.max(b.left + b.width / 2, 0), innerWidth - 1), cy = Math.min(Math.max(b.top + b.height / 2, 0), innerHeight - 1);
  const hit = document.elementFromPoint(cx, cy);
  return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height), display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
    insideViewport: b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight, hitIsSelfOrChild: !!hit && (hit === e || e.contains(hit)), hitTestId: hit?.closest('[data-testid]')?.getAttribute('data-testid') ?? null, text: (e.textContent ?? '').trim().slice(0, 60) };
}, sel);
const pageFacts = (p: Page) => p.evaluate(() => ({ innerWidth, innerHeight, vvHeight: window.visualViewport ? Math.round(window.visualViewport.height) : null, docScrollWidth: document.documentElement.scrollWidth, overflowX: document.documentElement.scrollWidth > innerWidth,
  active: document.activeElement ? `${document.activeElement.tagName.toLowerCase()}${document.activeElement.closest('[data-testid]') ? '@' + document.activeElement.closest('[data-testid]')!.getAttribute('data-testid') : ''}` : null,
  chatSelected: document.querySelector('[data-testid="workspace-view-chat"]')?.getAttribute('aria-selected') ?? null, canvasSelected: document.querySelector('[data-testid="workspace-view-canvas"]')?.getAttribute('aria-selected') ?? null }));

test('R recheck: rename pencil, pending Clone, Publish toast, first Send', async ({ browser }) => {
  const user = await createTestUser({ name: 'P1536 V R' });
  const all: Ctx[] = [];
  try {
    const api = await ownerApi(user.email);
    const { d: d1, v1, path } = await publishedV1(api, user);
    const dr = await cloneOf(api, user.user.id, d1.version_id);
    await seed(user.user.id, dr, [['canvas:channels', 'Direct emails to office managers (SEEDED)']]);
    const only = process.env.P1536_R ?? 'abcd';

    // (a) the rename pencil: draft view and published-owner view, phone widths
    if (only.includes('a')) for (const w of [390, 375, 320]) {
      const [c] = await mkCtxs(browser, user, [w]); all.push(c!); const p = c!.page;
      for (const [view, url] of [['draft', `${path}?v=${dr.version_name}&ws=1`], ['published', `${path}?v=${v1}`]] as const) {
        await p.goto(url); await barReady(p, w); await vis(p, 'canvas-title'); await p.waitForTimeout(2500);
        assertBackend(c!, `recheck-a-${view}`);
        const facts = await pageFacts(p); const title = await rectOf(p, '[data-testid="canvas-title"]'); const pencil = await rectOf(p, '[data-testid="canvas-rename"]');
        const row = await p.evaluate(() => { const t = document.querySelector('[data-testid="canvas-title"]') as HTMLElement | null; const r = t?.parentElement?.getBoundingClientRect(); return { titleParent: t?.parentElement?.getAttribute('data-testid') ?? t?.parentElement?.tagName ?? null, parentRight: r ? Math.round(r.right) : null, titleScrollWidth: t?.scrollWidth ?? null, titleClientWidth: t?.clientWidth ?? null, titleTextOverflow: t ? getComputedStyle(t).textOverflow : null }; });
        let clickedOpensInput: boolean | string = 'no pencil';
        if (pencil) { try { await q(p, 'canvas-rename').click({ timeout: 8000 }); await vis(p, 'canvas-title-input', 8000); clickedOpensInput = true; } catch (e) { clickedOpensInput = `click failed: ${String((e as Error).message).split('\n')[0].slice(0, 140)}`; } }
        const input = await rectOf(p, '[data-testid="canvas-title-input"]');
        rec({ check: 'a rename pencil', view, width: w, facts, title, pencil, row, clickedOpensInput, input });
        await p.screenshot({ path: `${DIR}/recheck-a-rename-${view}__${w}.png` });
        await p.keyboard.press('Escape').catch(() => undefined);
      }
    }
    // leave v1 with no open draft: the pending Clone needs that
    const rev = (await supabaseAdmin.from('canvas_drafts').select('revision').eq('id', dr.id).single()).data!.revision as number;
    const disc = await api.rpc('canvas_draft_discard', { p_draft: dr.id, p_expected_revision: rev }); if (disc.error) throw new Error(`discard: ${disc.error.message}`);

    // (b) pending Clone, 3 widths x 2 heights
    if (only.includes('b')) for (const w of [390, 375, 320]) for (const h of [420, 800]) {
      const [c] = await mkCtxs(browser, user, [w], () => h); all.push(c!); const p = c!.page;
      await p.goto(`${path}?v=${v1}`); await vis(p, 'canvas-clone'); await q(p, 'canvas-clone').click();
      await p.waitForFunction(() => new URL(location.href).searchParams.get('ws') === '1', undefined, { timeout: 40_000 }).catch(() => undefined);
      await p.waitForTimeout(4000);
      assertBackend(c!, `recheck-b-${w}x${h}`);
      const openDrafts = (await supabaseAdmin.from('canvas_drafts').select('id').eq('owner_id', user.user.id).eq('state', 'open').eq('base_version_id', d1.version_id)).data?.length ?? null;
      rec({ check: 'b pending clone', width: w, height: h, url: new URL(p.url()).search, openDraftsInDbAfterClone: openDrafts, facts: await pageFacts(p), agentLine: await rectOf(p, '[data-testid="agent-line"]'), composer: await rectOf(p, '[data-testid="composer"]'), composerTextbox: await rectOf(p, '[data-testid="composer"] textarea, [data-testid="composer"] [role="textbox"]') });
      await p.screenshot({ path: `${DIR}/recheck-b-pending-clone__${w}x${h}.png` });
      await c!.ctx.close();
    }

    // (c) the Publish toast, every width, seeded canvas per width (no model; no offer row)
    if (only.includes('c')) for (const w of WIDTHS) {
      const [c] = await mkCtxs(browser, user, [w]); all.push(c!); const p = c!.page;
      const d = await openNew(api, user.user.id); await seed(user.user.id, d, FIRST); await rename(api, d.canvas_id, `Toast canvas ${w}`);
      await p.goto(`/p/${user.slug}/canvas/${d.canvas_name}?v=${d.version_name}&ws=1`); await barReady(p, w); await vis(p, 'canvas-title'); await p.getByTestId('workspace-chat-pane').waitFor({ state: 'attached', timeout: 40_000 }); await vis(p, 'canvas-draft-publish');
      await q(p, 'canvas-draft-publish').click();
      const toast = p.locator('[data-sonner-toast]').filter({ hasText: /Published v/ }).first();
      try {
        await toast.waitFor({ timeout: 40_000 }); await p.waitForTimeout(500);
        const iw = await p.evaluate(() => innerWidth); assertBackend(c!, `recheck-c-${w}`);
        const t = await rectOf(p, '[data-sonner-toast]'); const file = `${DIR}/publish-toast-seeded__${w}.png`; await p.screenshot({ path: file });
        rec({ check: 'c publish toast', width: w, innerWidth: iw, toast: t, toastText: ((await toast.textContent()) ?? '').trim().slice(0, 160), facts: await pageFacts(p) });
        put({ state: 'publish-toast-seeded', width: w, file, how_reached: 'fixture: a new canvas with three seeded points, Publish tapped in the browser; the toast is the app\'s own. No offer row (no model run), so this is the plain toast', innerWidth: iw, reached: iw === w });
      } catch (e) { await p.screenshot({ path: `${DIR}/debug/publish-toast-seeded__${w}.png` }).catch(() => undefined); put({ state: 'publish-toast-seeded', width: w, file: null, how_reached: 'fixture: seeded canvas, Publish tapped', innerWidth: null, reached: false, reason: String((e as Error).message).split('\n')[0].slice(0, 200) }); }
      await c!.ctx.close();
    }

    // (d) the Clone's first Send at 375: ONE real model run, timed
    if (only.includes('d')) {
      const [c] = await mkCtxs(browser, user, [375]); all.push(c!); const p = c!.page; const t0 = Date.now(); const ev = (name: string, extra: Record<string, unknown> = {}) => rec({ check: 'd first send 375', name, ms: Date.now() - t0, ...extra });
      await p.goto(`${path}?v=${v1}`); await vis(p, 'canvas-clone'); await q(p, 'canvas-clone').click();
      await p.waitForFunction(() => new URL(location.href).searchParams.get('ws') === '1', undefined, { timeout: 40_000 }); ev('landed ws=1', { facts: await pageFacts(p) });
      await composer(p).waitFor({ state: 'visible', timeout: 20_000 }); await composer(p).click(); await p.keyboard.type('Please add a channel: direct emails to office managers.');
      assertBackend(c!, 'recheck-d');
      const tSend = Date.now(); await p.locator('[data-composer-send]').first().click(); ev('send tapped');
      const waits: Array<[string, () => Promise<unknown>]> = [
        ['draft row exists in db', async () => { for (let i = 0; i < 120; i++) { const n = (await supabaseAdmin.from('canvas_drafts').select('id').eq('owner_id', user.user.id).eq('state', 'open').eq('base_version_id', d1.version_id)).data?.length ?? 0; if (n) return; await p.waitForTimeout(500); } throw new Error('no draft row in 60s'); }],
        ['url left pending (v= is a draft)', async () => { await p.waitForFunction((v1n) => { const v = new URL(location.href).searchParams.get('v'); return !!v && v !== v1n; }, v1, { timeout: 60_000 }); }],
        ['spot = updating', async () => spotIs(p, 'updating', 60_000)],
        ['run finished (spot != updating)', async () => { await p.waitForFunction(() => document.querySelector('[data-testid="publish-spot"]')?.getAttribute('data-state') !== 'updating', undefined, { timeout: 180_000 }); }],
      ];
      for (const [name, fn] of waits) { try { await fn(); ev(name, { ok: true, sinceSendMs: Date.now() - tSend }); } catch (e) { ev(name, { ok: false, error: String((e as Error).message).split('\n')[0].slice(0, 160), sinceSendMs: Date.now() - tSend }); } }
      const runs = (await supabaseAdmin.from('canvas_draft_runs').select('state,error_code,kind').eq('owner_id', user.user.id)).data;
      ev('final', { runs, facts: await pageFacts(p), spot: await p.getByTestId('publish-spot').getAttribute('data-state').catch(() => null) });
      await p.screenshot({ path: `${DIR}/recheck-d-first-send__375.png` });
    }
  } finally {
    for (const c of all) await c.ctx.close().catch(() => undefined);
    await deleteTestUser(user.user.id).catch((e) => console.error('cleanup failed', e));
  }
});
