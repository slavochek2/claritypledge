/**
 * @file p1536-x3-undo.spec.ts
 * @description P1536 3c X3 (S3c.3) and D7 Undo (S1.8, J6, D15), driven in a real Chromium on hosted TEST as a signed-in TEST owner.
 *
 *  X3 (no model call): a published v1 is made with RPCs; at 1440, 375 and 320 the mirror chat's composer has the + beside the paperclip with no horizontal overflow, its menu
 *  reads New canvas / Clone a version, the paperclip dialog has no Canvases tab, the "..." menu has no New canvas, Clone a version -> pick v1 -> the pending Clone ("New draft"),
 *  Cancel writes NOTHING (row counts and max revision of the owner's drafts, versions, messages and runs before and after), a canvas thread's upload is the Upload icon (P1618).
 *
 *  Undo (real model, two updates): New canvas from the + menu, send material, send a second update, Undo twice, and read the boxes, Changed, the Publish spot, the replies and the
 *  marks after each tap; the second Undo leaves no Undo.
 *
 * Every step is recorded to RESULTS (one JSON line) and screenshotted into DIR. Refuses to load against anything but a TEST project.
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, TEST_PASSWORD } from './helpers/test-user';
import { isTestProjectUrl } from '../scripts/sweep-e2e-test-users';

import { pacLaunchOptions } from './helpers/pac-launch';

test.skip(!isTestProjectUrl(process.env.VITE_SUPABASE_URL ?? ''), 'p1536-x3-undo: VITE_SUPABASE_URL is not a TEST project. Nothing was run.');
test.use({ launchOptions: pacLaunchOptions() }); // P1536_PAC: send the hosted TEST host through a proxy auto-config file; unset, the project's own options

const BASE = process.env.P1536_BASE ?? 'http://localhost:5102';
const DIR = process.env.P1536_X3_DIR ?? 'test-results/p1536-x3-undo';
fs.mkdirSync(DIR, { recursive: true });
const RESULTS = `${DIR}/results.jsonl`;
test.use({ baseURL: BASE, actionTimeout: 20_000 });
test.setTimeout(420_000);
test.describe.configure({ retries: 0 });

function rec(vp: number, step: string, ok: boolean | null, note = '', shotFile?: string) {
  fs.appendFileSync(RESULTS, JSON.stringify({ vp, step, ok, note, shot: shotFile }) + '\n');
  if (ok === false) expect.soft(false, `[${vp}] ${step}: ${note}`).toBe(true);
}
async function shot(page: Page, vp: number, name: string): Promise<string> {
  const file = `${DIR}/${vp}-${name}.png`;
  await page.waitForTimeout(500);
  await page.screenshot({ path: file });
  return file;
}
async function ownerApi(email: string): Promise<SupabaseClient> {
  const api = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await api.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw new Error(`owner sign-in failed: ${error.message}`);
  return api;
}
async function seedPoints(ownerId: string, draftId: string, versionName: string, items: Array<[string, string]>) {
  for (const [box, statement] of items) {
    const { data, error } = await supabaseAdmin.from('points').insert({ statement, first_validator_id: ownerId, visibility: 'private', tags: [], system_tags: [box, `canvas_${versionName}`] }).select('id').single();
    if (error) throw new Error(`seed point: ${error.message}`);
    const { error: e2 } = await supabaseAdmin.from('canvas_draft_points').insert({ draft_id: draftId, point_id: data.id });
    if (e2) throw new Error(`seed draft point: ${e2.message}`);
  }
}
type DraftRow = { id: string; version_id: string; version_name: string; revision: number; canvas_id: string; canvas_name: string; conversation_id: string; thread_root_id: string };
const COLS = 'id,version_id,version_name,revision,canvas_id,canvas_name,conversation_id,thread_root_id';

/** Row counts and the newest revision/update of everything a Clone could write for this owner (S3b.4's table compare). */
async function tableState(ownerId: string, conversationId: string) {
  const count = async (table: string, col: string, val: string) => (await supabaseAdmin.from(table).select('id', { count: 'exact', head: true }).eq(col, val)).count ?? -1;
  const drafts = (await supabaseAdmin.from('canvas_drafts').select('id,revision,state').eq('owner_id', ownerId)).data ?? [];
  return {
    drafts: drafts.length, openDrafts: drafts.filter(d => d.state === 'open').length, maxRevision: Math.max(0, ...drafts.map(d => Number(d.revision))),
    versions: (await supabaseAdmin.from('canvas_versions').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId)).count ?? -1,
    messages: await count('chat_messages', 'conversation_id', conversationId),
    runs: await count('canvas_draft_runs', 'owner_id', ownerId),
  };
}

/** The draft's points as the DATABASE has them (service role): what the page must show. */
async function serverStatements(ownerId: string): Promise<string> {
  const d = (await supabaseAdmin.from('canvas_drafts').select('id,version_name').eq('owner_id', ownerId).eq('state', 'open').limit(1).maybeSingle()).data;
  if (!d) return '';
  const pts = (await supabaseAdmin.from('points').select('statement,system_tags').eq('first_validator_id', ownerId).contains('system_tags', [`canvas_${d.version_name}`])).data ?? [];
  return pts.map(p => `${(p.system_tags as string[]).find(t => t.startsWith('canvas:'))}: ${p.statement}`).sort().join(' || ');
}

const overflow = (page: Page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));

test('X3: the + on the mirror chat (1440, 375, 320), Clone a version, Cancel writes nothing', async ({ browser }) => {
  const user = await createTestUser({ name: 'P1536 X3' });
  const ownerId = user.user.id;
  try {
    const api = await ownerApi(user.email);
    const o = await api.rpc('canvas_draft_open', { p_from_version: null });
    if (o.error) throw new Error(`open: ${o.error.message}`);
    const d1 = (await supabaseAdmin.from('canvas_drafts').select(COLS).eq('owner_id', ownerId).eq('state', 'open').limit(1).maybeSingle()).data as DraftRow;
    await seedPoints(ownerId, d1.id, d1.version_name, [['canvas:segments', 'Office managers at companies with 20 to 200 staff (SEEDED)'], ['canvas:problem', 'Offices order catering late (SEEDED)']]);
    const pub1 = await api.rpc('canvas_draft_publish', { p_draft: d1.id, p_expected_revision: d1.revision });
    if (pub1.error) throw new Error(`publish v1: ${pub1.error.message}`);
    const v1Name = (await supabaseAdmin.from('canvas_versions').select('name').eq('id', d1.version_id).single()).data!.name as string;

    for (const [vp, height, touch] of ([[1440, 900, false], [375, 812, true], [320, 700, true]] as const).filter(v => !process.env.P1536_X3_VP || String(v[0]) === process.env.P1536_X3_VP)) {
      const ctx = await browser.newContext({ viewport: { width: vp, height }, baseURL: BASE, ...(touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
      await ctx.addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } });
      const page = await ctx.newPage();
      try {
        await setTestSession(page, user.email);
        const real = await page.evaluate(() => window.innerWidth).catch(() => vp);
        await page.goto(`/chats/c/${d1.conversation_id}`);
        const plus = page.getByTestId('composer-plus');
        await plus.waitFor({ timeout: 40_000 });
        rec(vp, 'resize took effect', (await page.evaluate(() => window.innerWidth)) === vp, `innerWidth=${await page.evaluate(() => window.innerWidth)} (before nav ${real})`);

        // the + sits right after the paperclip, in the main composer, and nothing overflows
        const geometry = await page.evaluate(() => {
          const comp = document.querySelector('[data-testid="composer"]') as HTMLElement;
          const clip = comp.querySelector('button[aria-label="Attach a point or story"]') as HTMLElement | null;
          const p = comp.querySelector('[data-testid="composer-plus"]') as HTMLElement | null;
          const field = comp.querySelector('textarea') as HTMLElement | null;
          const r = (e: HTMLElement | null) => (e ? e.getBoundingClientRect() : null);
          return { clip: r(clip), plus: r(p), field: r(field), comp: r(comp), inComposerCount: comp.querySelectorAll('[data-testid="composer-plus"]').length };
        });
        const g = geometry;
        rec(vp, '+ is in the main composer, right of the paperclip, left of the field', !!g.clip && !!g.plus && !!g.field && g.plus.left >= g.clip.right - 1 && g.plus.right <= g.field.left + 2 && Math.abs(g.plus.top - g.clip.top) < 3,
          `clip=${JSON.stringify(g.clip)} plus=${JSON.stringify(g.plus)} field=${JSON.stringify(g.field)}`);
        rec(vp, '+ is at least 40px', !!g.plus && g.plus.width >= 40 && g.plus.height >= 40, `${g.plus?.width}x${g.plus?.height}`);
        const ov = await overflow(page);
        rec(vp, 'no horizontal overflow on the mirror chat', ov.sw <= ov.iw, `scrollWidth=${ov.sw} innerWidth=${ov.iw}`, await shot(page, vp, 'mirror-chat-plus'));

        // the menu
        await plus.click();
        await page.getByRole('menu').waitFor();
        const items = await page.getByRole('menuitem').allTextContents();
        rec(vp, 'the + menu reads New canvas, Clone a version', JSON.stringify(items.map(s => s.trim())) === JSON.stringify(['New canvas', 'Clone a version']), JSON.stringify(items), await shot(page, vp, 'plus-menu'));
        await page.keyboard.press('Escape');

        // the paperclip: Points and Stories only
        await page.getByRole('button', { name: 'Attach a point or story' }).click();
        const tabs = await page.getByRole('tab').allTextContents();
        rec(vp, 'the paperclip dialog has no Canvases tab', JSON.stringify(tabs.map(s => s.trim())) === JSON.stringify(['Points', 'Stories']), JSON.stringify(tabs), await shot(page, vp, 'paperclip-dialog'));
        await page.keyboard.press('Escape');

        // the "..." menu
        await page.getByRole('button', { name: 'More', exact: true }).first().click(); // the conversation header's, first in the page
        await page.getByRole('menu').waitFor();
        const more = await page.getByRole('menuitem').allTextContents();
        rec(vp, 'the "..." menu has no New canvas', !more.some(t => /New canvas/.test(t)) && more.length > 0, JSON.stringify(more), await shot(page, vp, 'more-menu'));
        await page.keyboard.press('Escape');

        // Clone a version: pick v1 -> the pending Clone; nothing is written until a first Send
        const before = await tableState(ownerId, d1.conversation_id);
        await plus.click();
        await page.getByRole('menuitem', { name: 'Clone a version' }).click();
        const dialog = page.getByRole('dialog', { name: 'Clone a version' });
        await dialog.waitFor();
        await dialog.getByRole('button').filter({ hasText: /^\s*v\d/ }).first().waitFor({ timeout: 20_000 }); // the list loads after the dialog opens
        const rows = await dialog.getByRole('button').filter({ hasText: /^\s*v\d/ }).allTextContents();
        rec(vp, 'Clone a version lists the published version', rows.length === 1 && /^v1/.test(rows[0]!.trim()), JSON.stringify(rows), await shot(page, vp, 'clone-version-dialog'));
        const dov = await overflow(page);
        rec(vp, 'no overflow with the dialog open', dov.sw <= dov.iw, `scrollWidth=${dov.sw} innerWidth=${dov.iw}`);
        await dialog.getByRole('button').filter({ hasText: /^v1/ }).click();
        await page.waitForURL(u => u.pathname === `/p/${user.slug}/canvas/${d1.canvas_name}` && u.searchParams.get('v') === v1Name && u.searchParams.get('ws') === '1', { timeout: 40_000 }).catch(() => undefined);
        const pendingLine = page.getByTestId('agent-line');
        await pendingLine.waitFor({ timeout: 30_000 }).catch(() => undefined);
        const url = new URL(page.url());
        rec(vp, 'picking v1 lands on v1 as a PENDING Clone (ws=1, the mirror agent line, "New draft", "Nothing to publish yet")',
          url.searchParams.get('ws') === '1' && url.searchParams.get('v') === v1Name && (await pendingLine.count()) === 1 && /new draft from v1/.test((await pendingLine.textContent()) ?? '')
            && /New draft/.test((await page.getByTestId('canvas-state').textContent().catch(() => '')) ?? '') && /Nothing to publish yet/.test((await page.getByTestId('publish-spot').textContent().catch(() => '')) ?? ''),
          `url=${page.url()} line=${(await pendingLine.textContent().catch(() => '')) ?? ''}`, await shot(page, vp, 'pending-clone'));
        const stateKeys = await page.evaluate(() => JSON.stringify(history.state?.usr ?? null));
        rec(vp, 'the Clone intent was consumed (not left in the history state)', !/cloneThisVersion/.test(stateKeys), stateKeys);

        // the canvas thread's upload is the paperclip
        const up = page.getByTestId('canvas-upload');
        const upInfo = await up.evaluate(el => ({ icon: !!el.querySelector('svg.lucide-upload'), plus: !!el.querySelector('svg.lucide-plus'), text: (el.textContent ?? '').trim(), name: el.getAttribute('aria-label') })).catch(() => null);
        rec(vp, 'a canvas thread\'s upload is the paperclip icon named Upload (no plus, no word)', !!upInfo && upInfo.icon && !upInfo.plus && upInfo.text === '' && upInfo.name === 'Upload', JSON.stringify(upInfo), await shot(page, vp, 'canvas-thread-upload-paperclip'));
        const noPlusInThread = await page.getByTestId('composer-plus').count();
        rec(vp, 'the canvas thread\'s composer has no +', noPlusInThread === 0, `count=${noPlusInThread}`);
        const pov = await overflow(page);
        rec(vp, 'no overflow on the pending Clone', pov.sw <= pov.iw, `scrollWidth=${pov.sw} innerWidth=${pov.iw}`);

        // Cancel: back to v1, nothing written
        await page.getByTestId('canvas-cancel-clone').click();
        await page.waitForURL(u => u.searchParams.get('ws') === null, { timeout: 20_000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
        const after = await tableState(ownerId, d1.conversation_id);
        rec(vp, 'tap then cancel writes nothing (counts and max revision of drafts, versions, messages, runs)', JSON.stringify(before) === JSON.stringify(after), `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`, await shot(page, vp, 'after-cancel'));
        rec(vp, 'Cancel returns to the published view and the Clone button is back', (await page.getByTestId('canvas-clone').count()) === 1, `url=${page.url()}`);
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await deleteTestUser(ownerId).catch(() => undefined);
  }
});

type Counts = { undoInView: boolean | null; texts: string; points: number; changed: number; removed: number; spot: string | null; spotText: string; undo: number; undoUnder: string | null; undone: number; replies: string[] };
async function readCounts(page: Page): Promise<Counts> {
  return page.evaluate(() => {
    const q = (id: string) => [...document.querySelectorAll(`[data-testid="${id}"]`)] as HTMLElement[];
    const undo = q('canvas-undo');
    const under = undo[0]?.closest('li')?.previousElementSibling as HTMLElement | null;
    const undoEl = undo[0] ?? null;
    const comp = document.querySelector('[data-testid="composer"]') as HTMLElement | null;
    const ur = undoEl?.getBoundingClientRect();
    const cr = comp?.getBoundingClientRect();
    return {
      undoInView: ur && cr ? ur.height > 0 && ur.bottom <= cr.top + 1 && ur.top >= 0 : null,
      texts: [...document.querySelectorAll('[data-testid^="canvas-point-card"]')].map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim()).sort().join(' || '), // textContent: the hidden tab's boxes count too
      points: document.querySelectorAll('[data-testid^="canvas-point-card"]').length,
      changed: q('canvas-box-changed').length,
      removed: q('canvas-box-removed').length,
      spot: document.querySelector('[data-testid="publish-spot"]')?.getAttribute('data-state') ?? null,
      spotText: (document.querySelector('[data-testid="publish-spot"]') as HTMLElement | null)?.innerText?.replace(/\s+/g, ' ').trim() ?? '',
      undo: undo.length,
      undoUnder: under ? under.innerText.replace(/\s+/g, ' ').slice(0, 80) : null,
      undone: q('canvas-undone-mark').length,
      replies: [...document.querySelectorAll('[data-testid="thread-panel"] li[data-testid="message"]')].map(l => (l as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 70)),
    };
  });
}

const MATERIAL =
  'Acme Test Bakery sells sourdough loaves and pastries to office managers at companies with 20 to 200 staff in Tallinn. ' +
  'The problem is that offices order catering late and get cold, generic food. ' +
  'Our solution is a weekly standing order delivered fresh at 9am. ' +
  'We charge 12 euros per person per week.';
const SECOND = 'Acme Test Bakery now also offers a gluten-free line for 14 euros per person per week to the same office managers.';

for (const [vp, height, touch] of [[1440, 900, false], [375, 812, true]] as const) {
  test(`Undo (real model) at ${vp}: restores the boxes, Changed and Publish update, the second Undo walks back, no redo`, async ({ browser }) => {
    const user = await createTestUser({ name: `P1536 Undo ${vp}` });
    const ctx = await browser.newContext({ viewport: { width: vp, height }, baseURL: BASE, ...(touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
    await ctx.addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    const undoRpcs: Array<{ status: number }> = [];
    page.on('response', r => { if (/rpc\/canvas_draft_undo/.test(r.url())) undoRpcs.push({ status: r.status() }); });
    const stateReads: number[] = [];
    page.on('request', r => { if (/rpc\/get_canvas_draft_state/.test(r.url())) stateReads.push(Date.now()); });
    try {
      await setTestSession(page, user.email);
      await page.goto('/chats');
      await page.getByText('Your mirror agent').first().waitFor({ timeout: 40_000 });
      await page.getByText('Your mirror agent').first().click();
      await page.getByTestId('composer-plus').waitFor({ timeout: 40_000 });

      // New canvas from the + menu lands as J-W1 (the workspace, a new canvas on the Thread tab below 1280)
      await page.getByTestId('composer-plus').click();
      await page.getByRole('menuitem', { name: 'New canvas' }).click();
      await page.waitForURL(u => /\/canvas\//.test(u.pathname) && u.searchParams.get('ws') === '1', { timeout: 40_000 });
      const composer = page.getByTestId('composer').getByRole('textbox').first();
      await composer.waitFor({ timeout: 30_000 });
      const opener = await expect.poll(async () => /Give your mirror agent anything/.test(await page.getByTestId('thread-panel').innerText().catch(() => '')), { timeout: 20_000 }).toBe(true).then(() => true, () => false);
      rec(vp, 'New canvas from + lands in the workspace (ws=1), opener visible', opener, `url=${page.url()}`, await shot(page, vp, 'new-canvas-landing'));

      const send = async (text: string) => {
        await composer.click();
        await composer.fill(text);
        await page.locator('[data-composer-send]').first().click();
      };
      const settleReply = async (re: RegExp) => {
        await expect.poll(async () => (await readCounts(page)).replies.some(r => re.test(r)), { timeout: 150_000, intervals: [1000] }).toBe(true);
        await expect.poll(async () => (await readCounts(page)).undo, { timeout: 60_000, intervals: [500] }).toBe(1);
      };

      // update 1
      await send(MATERIAL);
      await settleReply(/Draft ready|Updated/);
      // the canvas page re-reads what the run changed a beat after the thread settles: wait for the Publish spot to say so before reading the boxes
      await expect.poll(async () => (await readCounts(page)).spot, { timeout: 60_000, intervals: [500] }).toBe('publish');
      const afterOne = await readCounts(page);
      const serverOneRef = { value: await serverStatements(user.user.id) };
      const underOne = afterOne.undoUnder;
      rec(vp, 'after update 1: boxes drafted, ONE Undo, under the mirror reply, Publish offered', afterOne.points > 0 && afterOne.undo === 1 && /Draft ready|Updated/.test(underOne ?? '') && afterOne.spot === 'publish', JSON.stringify(afterOne), await shot(page, vp, 'update-1'));

      // update 2
      await send(SECOND);
      await expect.poll(async () => { const c = await readCounts(page); return c.replies.length; }, { timeout: 150_000, intervals: [1000] }).toBeGreaterThanOrEqual(4); // owner 1, reply 1, owner 2, reply 2 (the root card is hidden)
      await expect.poll(async () => /Updated/.test((await readCounts(page)).undoUnder ?? ''), { timeout: 90_000, intervals: [500] }).toBe(true); // Undo is under the NEW reply
      await expect.poll(async () => (await readCounts(page)).spot, { timeout: 60_000, intervals: [500] }).toBe('publish');
      await expect.poll(async () => (await readCounts(page)).texts !== afterOne.texts, { timeout: 30_000, intervals: [500] }).toBe(true).catch(() => undefined); // the page re-reads what update 2 changed
      const afterTwo = await readCounts(page);
      const srvTwo = await serverStatements(user.user.id);
      rec(vp, 'after update 2 Undo is in view (above the composer, not scrolled out)', touch ? afterTwo.undoInView !== false : afterTwo.undoInView === true, `undoInView=${afterTwo.undoInView}`);
      rec(vp, 'after update 2: Undo moved to the newest reply (only one Undo)', afterTwo.undo === 1 && afterTwo.undoUnder !== underOne, `one=${underOne} two=${afterTwo.undoUnder} points one=${afterOne.points} two=${afterTwo.points}`, await shot(page, vp, 'update-2'));
      const readsBeforeUndo = stateReads.length;
      const srvOne = serverOneRef.value;

      // Undo 1 (undoes update 2)
      await page.getByTestId('canvas-undo').click();
      await expect.poll(async () => undoRpcs.length, { timeout: 30_000 }).toBe(1);
      await expect.poll(async () => (await readCounts(page)).replies.some(r => /^.*Undone\./.test(r)), { timeout: 30_000, intervals: [500] }).toBe(true);
      await expect.poll(async () => { const c = await readCounts(page); return c.undo === 1 && c.undone === 1; }, { timeout: 30_000, intervals: [500] }).toBe(true);
      await page.waitForTimeout(1200);
      const afterU1 = await readCounts(page);
      rec(vp, 'Undo 1: the call succeeded, the reply reads Undone., the owner message is marked, Undo is under the previous reply', undoRpcs[0]?.status === 200 && afterU1.undone === 1 && afterU1.undo === 1 && afterU1.undoUnder === underOne, JSON.stringify({ status: undoRpcs[0], afterU1, expectUnder: underOne }), await shot(page, vp, 'undo-1'));
      const srvU1 = await serverStatements(user.user.id);
      rec(vp, 'Undo 1: the DATABASE\'s points are exactly those after update 1 (update 2\'s point is gone)', srvU1 === srvOne && srvTwo !== srvOne, `afterTwo has ${srvTwo.split(' || ').length} points, after Undo 1 ${srvU1.split(' || ').length}, after update 1 ${srvOne.split(' || ').length}; equal to one: ${srvU1 === srvOne}`);
      rec(vp, 'Undo 1: the boxes went back to the state after update 1 (same number of points), Changed and the Publish spot follow', afterU1.texts === afterOne.texts && afterU1.points === afterOne.points && afterU1.changed === afterOne.changed && afterU1.removed === afterOne.removed && afterU1.spot === afterOne.spot,
        `after one=${JSON.stringify({ p: afterOne.points, c: afterOne.changed, r: afterOne.removed, s: afterOne.spot })} after undo=${JSON.stringify({ p: afterU1.points, c: afterU1.changed, r: afterU1.removed, s: afterU1.spot })} (the grid shows one card per box; restored texts equal: ${afterU1.texts === afterOne.texts})`);
      rec(vp, 'update 2 really changed the boxes (so restoring them is a real check)', afterTwo.texts !== afterOne.texts || srvTwo !== srvOne, `page changed=${afterTwo.texts !== afterOne.texts} server changed=${srvTwo !== srvOne} :: serverOne=${srvOne.slice(0, 700)} :: serverTwo=${srvTwo.slice(0, 700)}`);
      if (touch) {
        // below 1280 the boxes are on the Canvas tab: look there too
        await page.getByTestId('workspace-view-canvas').click().catch(() => undefined);
        await page.waitForTimeout(500);
        const canvasTab = await readCounts(page);
        rec(vp, 'Undo 1, Canvas tab: the boxes are the state after update 1', canvasTab.texts === afterOne.texts, `canvas tab points=${canvasTab.points} after one=${afterOne.points}`, await shot(page, vp, 'undo-1-canvas-tab'));
        await page.getByTestId('workspace-view-chat').click().catch(() => undefined);
        await page.waitForTimeout(500);
      }

      // Undo 2 (undoes update 1): nothing is left; the new canvas has no points; no Undo at all
      await page.getByTestId('canvas-undo').click();
      await expect.poll(async () => undoRpcs.length, { timeout: 30_000 }).toBe(2);
      await expect.poll(async () => { const c = await readCounts(page); return c.undo === 0 && c.undone === 2; }, { timeout: 30_000, intervals: [500] }).toBe(true);
      await page.waitForTimeout(1200);
      const afterU2 = await readCounts(page);
      rec(vp, 'Undo 2: succeeded; no Undo is left (no redo); both owner messages marked; the boxes are empty; Publish gives way to "Nothing to publish yet"', undoRpcs[1]?.status === 200 && afterU2.undo === 0 && afterU2.undone === 2 && afterU2.points === 0 && afterU2.spot === 'nothing' && /Nothing to publish yet/.test(afterU2.spotText), JSON.stringify(afterU2), await shot(page, vp, 'undo-2'));
      const srvU2 = await serverStatements(user.user.id);
      rec(vp, 'Undo 2: the DATABASE has no points in the draft any more', srvU2 === '', `points=${srvU2.split(' || ').filter(Boolean).length}`);
      rec(vp, 'no "Redo" anywhere', !/redo/i.test(await page.locator('body').innerText()), '');
      rec(vp, 'reads of get_canvas_draft_state: one per change of the draft (bounded, no timer)', stateReads.length - readsBeforeUndo <= 4, `total=${stateReads.length} since before the first Undo=${stateReads.length - readsBeforeUndo}`);
      const ov = await overflow(page);
      rec(vp, 'no horizontal overflow', ov.sw <= ov.iw, `scrollWidth=${ov.sw} innerWidth=${ov.iw}`);
      rec(vp, 'no page error', errors.length === 0, errors.join(' | ').slice(0, 300));
    } finally {
      await ctx.close();
      await deleteTestUser(user.user.id).catch(() => undefined);
    }
  });
}

test('Undo (real model) at 1440: a failed read of where Undo goes is said with Try again, retried once on tab return, and Try again recovers', async ({ browser }) => {
  const vp = 1440;
  const user = await createTestUser({ name: 'P1536 Undo read' });
  const ctx = await browser.newContext({ viewport: { width: vp, height: 900 }, baseURL: BASE });
  await ctx.addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } });
  const page = await ctx.newPage();
  let failing = true;
  const reads: Array<{ aborted: boolean }> = [];
  await page.route('**/rest/v1/rpc/get_canvas_draft_state', route => { reads.push({ aborted: failing }); return failing ? route.abort('failed') : route.continue(); });
  try {
    await setTestSession(page, user.email);
    await page.goto('/chats');
    await page.getByText('Your mirror agent').first().waitFor({ timeout: 40_000 });
    await page.getByText('Your mirror agent').first().click();
    await page.getByTestId('composer-plus').waitFor({ timeout: 40_000 });
    await page.getByTestId('composer-plus').click();
    await page.getByRole('menuitem', { name: 'New canvas' }).click();
    await page.waitForURL(u => /\/canvas\//.test(u.pathname) && u.searchParams.get('ws') === '1', { timeout: 40_000 });
    const composer = page.getByTestId('composer').getByRole('textbox').first();
    await composer.waitFor({ timeout: 30_000 });
    await composer.fill(MATERIAL);
    await page.locator('[data-composer-send]').first().click();
    await expect.poll(async () => page.getByTestId('canvas-undo-retry').count(), { timeout: 150_000, intervals: [1000] }).toBe(1);
    const afterFail = { retry: await page.getByTestId('canvas-undo-retry').innerText(), undo: await page.getByTestId('canvas-undo').count(), reads: reads.length };
    rec(vp, 'a failed read: no Undo, but "Undo did not load." with Try again, under the mirror reply', /Undo did not load\./.test(afterFail.retry) && /Try again/.test(afterFail.retry) && afterFail.undo === 0, JSON.stringify(afterFail), await shot(page, vp, 'undo-read-failed'));
    await page.waitForTimeout(6000); // let the run's own settling (a new draft revision is a legitimate new read) finish
    const quiet = reads.length;
    await page.waitForTimeout(10_000);
    rec(vp, 'no retry on a timer (no loop): once the draft stopped changing, the read count did not move in 10 s', reads.length === quiet, `at the failure=${afterFail.reads} settled=${quiet} 10 s later=${reads.length}`);
    afterFail.reads = reads.length;

    // tab return: the read is asked once more (still failing here: the Try again stays)
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(() => reads.length, { timeout: 10_000 }).toBe(afterFail.reads + 1);
    rec(vp, 'tab return asks once more (and only once)', true, `reads=${reads.length}`);

    // the network is back: Try again recovers
    failing = false;
    await page.getByTestId('canvas-undo-retry-button').click();
    await expect.poll(async () => page.getByTestId('canvas-undo').count(), { timeout: 20_000 }).toBe(1);
    rec(vp, 'Try again recovers: Undo shows and the retry line is gone', (await page.getByTestId('canvas-undo-retry').count()) === 0, `reads=${reads.length}`, await shot(page, vp, 'undo-read-recovered'));
  } finally {
    await ctx.close();
    await deleteTestUser(user.user.id).catch(() => undefined);
  }
});

/** One applied run made the way the engine makes it (send, begin, complete with a point in a scoped box); no model is called. */
async function appliedRun(api: SupabaseClient, ownerId: string, ws: { canvas: string | null; draft: string | null; rev: number | null }, statement: string) {
  const sent = await api.rpc('canvas_workspace_send', { p_canvas: ws.canvas, p_from_version: null, p_expected_draft: ws.draft, p_expected_revision: ws.rev, p_replace: false, p_body: statement, p_box_refs: null, p_attachment: null, p_client_id: crypto.randomUUID() });
  if (sent.error || sent.data?.status !== 'ok') throw new Error(`send: ${JSON.stringify(sent.error ?? sent.data)}`);
  const b = await supabaseAdmin.rpc('_canvas_draft_run_begin', { p_run: sent.data.run_id, p_owner: ownerId, p_has_file: false, p_cap_reply: null });
  if (b.error || b.data?.status !== 'run') throw new Error(`begin: ${JSON.stringify(b.error ?? b.data)}`);
  const c = await supabaseAdmin.rpc('_canvas_draft_run_complete', { p_run: sent.data.run_id, p_owner: ownerId, p_actions: [{ action: 'new', box: 'canvas:segments', statement }], p_questions: {}, p_scope: ['canvas:segments'], p_focus: null, p_other_canvases: [], p_note: null, p_reply: `Updated: ${statement}`, p_usd: 0.001 });
  if (c.error || c.data?.status !== 'ok') throw new Error(`complete: ${JSON.stringify(c.error ?? c.data)}`);
  ws.canvas = sent.data.canvas_id; ws.draft = sent.data.draft_id;
  const st = await api.rpc('get_canvas_draft_state', { p_canvas: ws.canvas });
  ws.rev = st.data.draft.revision;
  return { run: sent.data.run_id as string, conv: sent.data.conversation_id as string, root: sent.data.thread_root_id as string };
}

test('J6 at 1440: after Undo and Publish the closed thread still marks the undone message, with no Undo, one read when opened', async ({ browser }) => {
  const vp = 1440;
  const user = await createTestUser({ name: 'P1536 Undo closed' });
  const ctx = await browser.newContext({ viewport: { width: vp, height: 900 }, baseURL: BASE });
  await ctx.addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } });
  const page = await ctx.newPage();
  const reads: number[] = [];
  page.on('request', r => { if (/rpc\/get_canvas_draft_state/.test(r.url())) reads.push(Date.now()); });
  try {
    const api = await ownerApi(user.email);
    const ws = { canvas: null as string | null, draft: null as string | null, rev: null as number | null };
    await appliedRun(api, user.user.id, ws, 'First segment SEEDED');
    const r2 = await appliedRun(api, user.user.id, ws, 'Second segment SEEDED');
    const u = await api.rpc('canvas_draft_undo', { p_draft: ws.draft, p_expected_run: r2.run, p_expected_revision: ws.rev });
    if (u.error || u.data?.status !== 'ok') throw new Error(`undo: ${JSON.stringify(u.error ?? u.data)}`);
    const st = await api.rpc('get_canvas_draft_state', { p_canvas: ws.canvas });
    const pub = await api.rpc('canvas_draft_publish', { p_draft: ws.draft, p_expected_revision: st.data.draft.revision });
    if (pub.error || pub.data?.status !== 'ok') throw new Error(`publish: ${JSON.stringify(pub.error ?? pub.data)}`);
    const answer = await api.rpc('get_canvas_draft_state', { p_canvas: ws.canvas });
    rec(vp, 'the server answer after Publish carries the undone owner message under the published draft', JSON.stringify(answer.data.closed_undone) === JSON.stringify({ [ws.draft!]: [(await supabaseAdmin.from('canvas_draft_runs').select('trigger_message_id').eq('id', r2.run).single()).data!.trigger_message_id] }), JSON.stringify(answer.data.closed_undone));

    await setTestSession(page, user.email);
    reads.length = 0;
    await page.goto(`/chats/c/${r2.conv}/t/${r2.root}`);
    await expect.poll(async () => page.getByTestId('canvas-undone-mark').count(), { timeout: 40_000, intervals: [500] }).toBe(1);
    await page.waitForTimeout(3000);
    const info = await page.evaluate(() => {
      const mark = document.querySelector('[data-testid="canvas-undone-mark"]');
      const under = mark?.closest('li')?.previousElementSibling as HTMLElement | null;
      return { under: under?.innerText.replace(/\s+/g, ' ').slice(0, 90) ?? null, undo: document.querySelectorAll('[data-testid="canvas-undo"]').length, retry: document.querySelectorAll('[data-testid="canvas-undo-retry"]').length, waits: document.querySelectorAll('[data-testid="canvas-undo-waits"]').length };
    });
    rec(vp, 'the closed thread marks the undone owner message "Undone" (and only that one), with no Undo, no retry line, no waiting status', /Second segment/.test(info.under ?? '') && info.undo === 0 && info.retry === 0 && info.waits === 0, JSON.stringify(info), await shot(page, vp, 'closed-thread-undone-mark'));
    rec(vp, 'a closed thread makes one get_canvas_draft_state read when opened, no more (3 s later)', reads.length === 1, `reads=${reads.length}`);
  } finally {
    await ctx.close();
    await deleteTestUser(user.user.id).catch(() => undefined);
  }
});
