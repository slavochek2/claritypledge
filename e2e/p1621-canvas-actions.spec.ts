/**
 * @file p1621-canvas-actions.spec.ts
 * @description P1621: the canvas draft shows content first, and its actions when a box is selected. Driven in a real Chromium on TEST as a throwaway owner (1440, 375, 320), seeded
 * with RPCs and the service-role worker calls (no model), as p1614-edit-point.spec.ts is. Walks: the first visit opens a box and a later one does not; at rest no action shows; a
 * selected box shows its actions, each at least 40px tall, with no horizontal overflow; Add card writes a card that survives a reload with no run made and leaves the published
 * version unchanged; a box holds 3 and says so; two simultaneous saves cannot make a fourth; the keyboard reaches everything; Edit on the opened point keeps the panel open on the
 * new point; the owner can add a story on their own point with no position taken. Screenshots go to P1621_DIR.
 * NOT RUN where the author had no TEST server: the jsdom file (src/tests/p1621-canvas-actions.test.tsx) covers the same acceptance criteria except layout.
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, TEST_PASSWORD } from './helpers/test-user';
import { isTestProjectUrl } from '../scripts/sweep-e2e-test-users';

test.skip(!isTestProjectUrl(process.env.VITE_SUPABASE_URL ?? '') && !/sslip\.io/.test(process.env.VITE_SUPABASE_URL ?? ''), 'p1621: not a TEST server. Nothing was run.');
const DIR = process.env.P1621_DIR ?? 'test-results/p1621';
fs.mkdirSync(DIR, { recursive: true });
test.use({ actionTimeout: 20_000 });
test.setTimeout(560_000);
test.describe.configure({ retries: 0 });

const SEG = 'canvas:segments';
const PROB = 'canvas:problem';
const SOL = 'canvas:solution';
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function api(email: string): Promise<SupabaseClient> {
  const c = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw new Error(error.message);
  return c;
}
async function ok(c: SupabaseClient, fn: string, args: Row): Promise<Row> {
  const { data, error } = await c.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as Row;
}
/** One message begun and completed as the engine would (stub model). */
async function cycle(c: SupabaseClient, ownerId: string, o: { canvas?: string; from?: string; draft?: string; rev?: number; refs?: string[] }, actions: Row[], scope: string[]): Promise<Row> {
  const r = await ok(c, 'canvas_workspace_send', {
    p_canvas: o.canvas ?? null, p_from_version: o.from ?? null, p_expected_draft: o.draft ?? null, p_expected_revision: o.rev ?? null, p_replace: false,
    p_body: 'P1621 walk', p_box_refs: o.refs ?? null, p_attachment: null, p_client_id: randomUUID(),
  });
  if (r.status !== 'ok') throw new Error(JSON.stringify(r));
  const adm = supabaseAdmin as unknown as SupabaseClient;
  await ok(adm, '_canvas_draft_run_begin', { p_run: r.run_id, p_owner: ownerId, p_has_file: false, p_cap_reply: null });
  await ok(adm, '_canvas_draft_run_complete', { p_run: r.run_id, p_owner: ownerId, p_actions: actions, p_questions: {}, p_scope: scope, p_focus: null, p_other_canvases: [], p_note: null, p_reply: 'Done.', p_usd: 0.001 });
  return r;
}
const pt = (box: string, statement: string): Row => ({ action: 'new', box, statement });
async function revisionOf(draftId: string): Promise<number> {
  return ((await supabaseAdmin.from('canvas_drafts').select('revision').eq('id', draftId).single()).data as Row).revision as number;
}
async function settled(page: Page) {
  await expect(page.getByTestId('canvas-grid')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
  await expect(page.getByTestId('canvas-draft-publish')).toBeVisible({ timeout: 30_000 });
}
async function shot(page: Page, vp: number, name: string) {
  await settled(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${vp}-${name}.png`, fullPage: false });
}
const overflow = (page: Page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
async function showCanvas(page: Page) {
  const tab = page.getByTestId('workspace-view-canvas');
  if (await tab.isVisible().catch(() => false)) await tab.click();
}
/** Every control in a box is at least 40px tall. */
async function allTallEnough(page: Page, tag: string) {
  const boxes = await page.getByTestId(`canvas-box-${tag}`).locator('button').evaluateAll(els => els.filter(e => (e as HTMLElement).offsetParent !== null).map(e => ({ label: (e.textContent ?? '').trim() || e.getAttribute('aria-label') || '', h: e.getBoundingClientRect().height })));
  for (const b of boxes) expect(b.h, `${b.label} is at least 40px tall`).toBeGreaterThanOrEqual(39.5);
}
async function boxPoints(ownerId: string, versionName: string, box: string) {
  const rows = (await supabaseAdmin.from('points').select('id,statement').eq('first_validator_id', ownerId).contains('system_tags', [`canvas_${versionName}`, box])).data ?? [];
  return rows.map(r => r.statement as string).sort();
}
async function runCount(draftId: string) {
  return (await supabaseAdmin.from('canvas_draft_runs').select('id', { count: 'exact', head: true }).eq('draft_id', draftId)).count ?? -1;
}

for (const vp of [1440, 375, 320]) {
  test(`P1621 canvas actions on a draft at ${vp}`, async ({ browser }) => {
    const user = await createTestUser({ name: `P1621 walk ${vp}` });
    const ownerId = user.user.id;
    const ctx = await browser.newContext({ viewport: { width: vp, height: vp > 500 ? 900 : 800 }, ...(vp < 500 ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
    try {
      const c = await api(user.email);
      // v1 published (Customer Segments and Problem hold a card each), then a draft from it
      const first = await cycle(c, ownerId, {}, [pt(SEG, 'Founders who cannot get a straight answer'), pt(PROB, 'Nobody says what they mean')], [SEG, PROB]);
      const v1name = first.version_name as string;
      const canvasName = first.canvas_name as string;
      await ok(c, 'canvas_draft_publish', { p_draft: first.draft_id, p_expected_revision: await revisionOf(first.draft_id) });
      const v1 = (await supabaseAdmin.from('canvas_versions').select('id').eq('canvas_id', first.canvas_id).eq('name', v1name).single()).data as Row;
      const second = await cycle(c, ownerId, { canvas: first.canvas_id, from: v1.id, refs: ['canvas:love'] }, [pt('canvas:love', 'Say the true thing kindly')], ['canvas:love']);
      const base = `/p/${user.slug}/canvas/${canvasName}`;
      const draftUrl = `${base}?v=${second.version_name}&ws=1`;

      const page = await ctx.newPage();
      await setTestSession(page, user.email);
      await page.goto(draftUrl);
      await showCanvas(page);
      await settled(page);
      expect(await page.evaluate(() => window.innerWidth), 'the viewport is the width asked for').toBe(vp);

      // 1. first visit: the first box with a card opens selected (Customer Segments); the layer names and numbers are gone
      await expect(page.getByTestId(`canvas-box-title-${SEG}`)).toHaveAttribute('aria-pressed', 'true');
      // Round 2: a box holding a card mentions per card (the box keeps its own button only while empty)
      await expect(page.getByTestId(`canvas-box-${SEG}`).getByRole('button', { name: /^Mention in chat/ })).toBeVisible();
      await expect(page.getByText('Core assumptions')).toHaveCount(0);
      await expect(page.getByTestId('canvas-layer-title')).toHaveCount(0);
      const order = await page.locator('[data-canvas-box]').evaluateAll(els => els.map(e => e.getAttribute('data-testid')));
      expect(order.map(o => o?.replace('canvas-box-', ''))).toEqual([
        'canvas:segments', 'canvas:problem', 'canvas:solution', 'canvas:revenue', 'canvas:channels', 'canvas:metrics', 'canvas:good-at', 'canvas:world-needs', 'canvas:love',
      ]);
      await allTallEnough(page, SEG);
      let ov = await overflow(page); expect(ov.sw, 'no horizontal overflow, first visit').toBeLessThanOrEqual(ov.iw);
      await shot(page, vp, 'first-visit');

      // a later visit starts with nothing selected, and at rest no action shows
      await page.reload();
      await showCanvas(page);
      await settled(page);
      await expect(page.locator('[data-canvas-box][data-selected]')).toHaveCount(0);
      for (const label of ['Mention in chat', 'Edit:', 'Open:', 'Add card']) await expect(page.getByRole('button', { name: new RegExp(`^${label}`) })).toHaveCount(0);
      await shot(page, vp, 'at-rest');

      // 2. selecting by click shows the box's actions in order; Escape deselects and returns focus to the title
      await page.getByTestId(`canvas-box-${PROB}`).click({ position: { x: 6, y: 6 } });
      await expect(page.getByTestId(`canvas-box-title-${PROB}`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-canvas-box][data-selected]')).toHaveCount(1);
      const box = page.getByTestId(`canvas-box-${PROB}`);
      await expect(box.getByRole('button', { name: /^Mention in chat/ })).toBeVisible();
      await expect(box.getByTestId(`canvas-mention-in-chat-${PROB}`), 'the box has a card: no box-level Mention').toHaveCount(0);
      await expect(box.getByRole('button', { name: /^Remove/ }), 'Remove is in the point panel, not on the card').toHaveCount(0);
      await expect(box.getByRole('button', { name: /^Edit:/ })).toBeVisible();
      await expect(box.getByRole('button', { name: /^Open:/ })).toBeVisible();
      await expect(box.getByTestId(`canvas-box-add-${PROB}`)).toBeVisible();
      await allTallEnough(page, PROB);
      ov = await overflow(page); expect(ov.sw, 'no horizontal overflow, selected').toBeLessThanOrEqual(ov.iw);
      await shot(page, vp, 'selected');
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-canvas-box][data-selected]')).toHaveCount(0);
      await expect(page.getByTestId(`canvas-box-title-${PROB}`)).toBeFocused();

      // 3. keyboard alone: Enter selects, Tab walks Edit, Open, Mention in chat (per card), Add card
      await page.keyboard.press('Enter');
      await expect(page.getByTestId(`canvas-box-title-${PROB}`)).toHaveAttribute('aria-pressed', 'true');
      const seen: string[] = [];
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Tab');
        seen.push(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? ''));
      }
      expect(seen[0]).toMatch(/^canvas-card-edit-/);
      expect(seen[1]).toMatch(/^canvas-card-open-/);
      expect(seen[2]).toMatch(/^canvas-card-mention-/);
      expect(seen[3]).toBe(`canvas-box-add-${PROB}`);
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('canvas-new-card-text')).toBeFocused();

      // 4. Add card by keyboard: the card is written, no run is made, it survives a reload; the published version is unchanged
      const runsBefore = await runCount(second.draft_id);
      await page.getByTestId('canvas-new-card-text').fill(`They carry cash ${vp}`);
      ov = await overflow(page); expect(ov.sw, 'no horizontal overflow, editor open').toBeLessThanOrEqual(ov.iw);
      await shot(page, vp, 'new-card-open');
      await page.getByTestId('canvas-new-card-save').click();
      await expect(page.getByTestId('canvas-new-card-text')).toHaveCount(0, { timeout: 20_000 });
      await expect(page.getByTestId(`canvas-box-title-${PROB}`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId(`canvas-box-add-${PROB}`)).toBeFocused({ timeout: 20_000 });
      await expect(page.getByText(`They carry cash ${vp}`)).toBeVisible({ timeout: 30_000 });   // the box expanded to show it
      expect(await runCount(second.draft_id), 'no run was made').toBe(runsBefore);
      expect(await boxPoints(ownerId, second.version_name, PROB)).toContain(`They carry cash ${vp}`);
      expect(await boxPoints(ownerId, v1name, PROB), 'the published version is unchanged').toEqual(['Nobody says what they mean']);
      await page.reload();
      await showCanvas(page);
      await settled(page);
      await page.getByTestId(`canvas-box-title-${PROB}`).click();
      await page.getByTestId(`canvas-box-more`).first().click();   // See all 2
      await expect(page.getByText(`They carry cash ${vp}`)).toBeVisible({ timeout: 30_000 });
      await shot(page, vp, 'see-all');
      await page.getByTestId('canvas-box-less').click();

      // 5. a box holds 3: fill it, then it says so, Add card is absent, and two simultaneous saves cannot make a fourth
      await page.getByTestId(`canvas-box-add-${PROB}`).click();
      await page.getByTestId('canvas-new-card-text').fill(`A third card ${vp}`);
      await page.getByTestId('canvas-new-card-save').click();
      await expect(page.getByText('This box is full. It holds 3 cards.')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId(`canvas-box-add-${PROB}`)).toHaveCount(0);
      await shot(page, vp, 'full');
      const rev = await revisionOf(second.draft_id);
      const box2 = SOL;
      const racers = await Promise.all([1, 2].map(i => c.rpc('canvas_draft_add_point', { p_draft: second.draft_id, p_box: box2, p_statement: `racer ${i} ${vp}`, p_expected_revision: rev, p_client_id: randomUUID() })));
      expect(racers.every(r => !r.error)).toBe(true);
      expect((await boxPoints(ownerId, second.version_name, box2)).length, 'two simultaneous saves make at most one card from this revision').toBeLessThanOrEqual(1);
      // direct fourth into the full box is refused by the server, not just hidden by the page
      const fourth = await ok(c, 'canvas_draft_add_point', { p_draft: second.draft_id, p_box: PROB, p_statement: 'a fourth', p_expected_revision: await revisionOf(second.draft_id), p_client_id: randomUUID() });
      expect(fourth).toMatchObject({ status: 'refused', code: 'box_full' });
      expect((await boxPoints(ownerId, second.version_name, PROB)).length).toBe(3);

      // 6. Open still opens the panel (the sheet on phones); Edit there keeps the panel open on the new point; the owner can add a story with no position
      await page.reload();
      await showCanvas(page);
      await settled(page);
      await page.getByTestId(`canvas-box-title-${PROB}`).click();
      await page.getByTestId('canvas-box-more').first().click();
      await page.getByRole('button', { name: new RegExp(`^Open: They carry cash ${vp}`) }).click();
      const panel = page.getByTestId('canvas-point-panel');
      await expect(panel).toBeVisible();
      // the card is new to this draft (not kept from v1) and the owner holds no position on it: Add a story is offered
      await expect(panel.getByRole('button', { name: 'Add a story for this point' })).toBeVisible({ timeout: 30_000 });
      const editInPanel = panel.getByRole('button', { name: 'Edit' });
      await expect(editInPanel).toBeVisible();
      await shot(page, vp, 'panel');
      await editInPanel.click();
      await panel.getByTestId('canvas-point-editor-text').fill(`Edited in the panel ${vp}`);
      await panel.getByTestId('canvas-point-editor-save').click();
      await expect(panel.getByTestId('canvas-point-editor-text')).toHaveCount(0, { timeout: 20_000 });
      await expect(panel, 'the panel stays open on the new point').toBeVisible();
      await expect(panel.locator('p', { hasText: `Edited in the panel ${vp}` })).toBeVisible({ timeout: 30_000 });
      await expect(page).toHaveURL(/point=/);
      // Escape closes the panel; focus returns to that point's Open button because its box is selected (otherwise to the box title)
      const editedId = ((await supabaseAdmin.from('points').select('id').eq('first_validator_id', ownerId).eq('statement', `Edited in the panel ${vp}`).single()).data as Row).id as string;
      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
      await expect(page.getByTestId(`canvas-box-title-${PROB}`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId(`canvas-card-open-${editedId}`), 'focus is on the point\'s Open button').toBeFocused({ timeout: 10_000 });
    } finally {
      await ctx.close();
      await deleteTestUser(ownerId);
    }
  });
}

// ---- rounds 2 and 3 (founder decisions): real flows, by keyboard, at one width (1440) --------------------------------------------------------------------------------------------
const WIDE = 1440;
const key = async (page: Page, testId: string) => { const el = page.getByTestId(testId); await el.focus(); await expect(el).toBeFocused(); await page.keyboard.press('Enter'); };
/** A published v1 (Customer Segments and Problem hold a card each) and no open draft: its owner's `?v=<v1>&ws=1` page is the pending Clone. */
async function publishedCanvas(c: SupabaseClient, ownerId: string, slug: string) {
  const first = await cycle(c, ownerId, {}, [pt(SEG, 'Founders who cannot get a straight answer'), pt(PROB, 'Nobody says what they mean')], [SEG, PROB]);
  await ok(c, 'canvas_draft_publish', { p_draft: first.draft_id, p_expected_revision: await revisionOf(first.draft_id) });
  const v1 = (await supabaseAdmin.from('canvas_versions').select('id').eq('canvas_id', first.canvas_id).eq('name', first.version_name).single()).data as Row;
  return { canvasId: first.canvas_id as string, canvasName: first.canvas_name as string, v1Name: first.version_name as string, v1Id: v1.id as string, pendingUrl: `/p/${slug}/canvas/${first.canvas_name}?v=${first.version_name}&ws=1` };
}
async function openDrafts(canvasId: string): Promise<Row[]> {
  return ((await supabaseAdmin.from('canvas_drafts').select('id,version_name,revision').eq('canvas_id', canvasId).eq('state', 'open')).data ?? []) as Row[];
}
async function openWorkspace(page: Page, email: string, url: string) {
  await setTestSession(page, email);
  await page.goto(url);
  await showCanvas(page);
  await expect(page.getByTestId('canvas-grid')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
}

test(`P1621 round 2-3: the clone's pending page acts like a draft; the first hand save makes the draft and the page moves (keyboard, ${WIDE})`, async ({ browser }) => {
  const user = await createTestUser({ name: 'P1621 clone walk' });
  const ownerId = user.user.id;
  const ctx = await browser.newContext({ viewport: { width: WIDE, height: 900 } });
  try {
    const c = await api(user.email);
    const cv = await publishedCanvas(c, ownerId, user.slug);
    expect(await openDrafts(cv.canvasId), 'a clone is pending: no draft exists yet').toHaveLength(0);
    const page = await ctx.newPage();
    await openWorkspace(page, user.email, cv.pendingUrl);
    // Edit, Open, Mention in chat and Add card show on the pending page (no Remove on the card: it lives in the panel)
    await key(page, `canvas-box-title-${SEG}`).catch(async () => undefined);
    if ((await page.getByTestId(`canvas-box-title-${SEG}`).getAttribute('aria-pressed')) !== 'true') await key(page, `canvas-box-title-${SEG}`);
    const seg = page.getByTestId(`canvas-box-${SEG}`);
    await expect(seg.getByRole('button', { name: /^Edit:/ })).toBeVisible();
    await expect(seg.getByRole('button', { name: /^Open:/ })).toBeVisible();
    await expect(seg.getByRole('button', { name: /^Mention in chat/ })).toBeVisible();
    await expect(seg.getByTestId(`canvas-box-add-${SEG}`)).toBeVisible();
    // empty boxes ask: the fixed question of the box
    await expect(page.getByTestId(`canvas-box-${SOL}`).getByTestId('canvas-box-question')).toBeVisible();
    // Add card by keyboard: the FIRST hand save creates the draft (one), writes the card to it, and the page moves to the draft
    await key(page, `canvas-box-add-${SEG}`);
    await expect(page.getByTestId('canvas-new-card-text')).toBeFocused();
    await page.getByTestId('canvas-new-card-text').fill('They want one honest sentence');
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab');   // Cancel, then Save
    await expect(page.getByTestId('canvas-new-card-save')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/[?&]v=[^&]+/, { timeout: 40_000 });
    await expect.poll(async () => (await openDrafts(cv.canvasId)).length, { timeout: 40_000 }).toBe(1);
    const draft = (await openDrafts(cv.canvasId))[0]!;
    await expect(page, 'the page moved onto the new draft').toHaveURL(new RegExp(`[?&]v=${draft.version_name}(&|$)`), { timeout: 40_000 });
    expect(await boxPoints(ownerId, draft.version_name as string, SEG)).toContain('They want one honest sentence');
    expect(await boxPoints(ownerId, cv.v1Name, SEG), 'the published version is unchanged').toEqual(['Founders who cannot get a straight answer']);
    await expect(page.getByText('They want one honest sentence')).toBeVisible({ timeout: 30_000 });
    expect(await runCount(draft.id as string), 'no run was made').toBe(0);
    expect(await page.evaluate(() => document.activeElement !== document.body), 'focus is not on the page').toBe(true);
  } finally {
    await ctx.close();
    await deleteTestUser(ownerId);
  }
});

test(`P1621 round 3: Remove in the point panel on a clone (makes the draft first) and on a draft; focus follows (keyboard, ${WIDE})`, async ({ browser }) => {
  const user = await createTestUser({ name: 'P1621 remove walk' });
  const ownerId = user.user.id;
  const ctx = await browser.newContext({ viewport: { width: WIDE, height: 900 } });
  try {
    const c = await api(user.email);
    const cv = await publishedCanvas(c, ownerId, user.slug);
    const page = await ctx.newPage();
    await openWorkspace(page, user.email, cv.pendingUrl);
    // on the clone: select Problem, Open its card (Enter), Remove in the panel (Enter): the draft is made, the point is off it, the page moves, published v1 keeps it
    if ((await page.getByTestId(`canvas-box-title-${PROB}`).getAttribute('aria-pressed')) !== 'true') await key(page, `canvas-box-title-${PROB}`);
    const openBtn = page.getByTestId(`canvas-box-${PROB}`).getByRole('button', { name: /^Open:/ });
    await openBtn.focus();
    await page.keyboard.press('Enter');
    const panel = page.getByTestId('canvas-point-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId(`canvas-box-${PROB}`).getByRole('button', { name: /^Remove/ }), 'not on the card').toHaveCount(0);
    const remove = panel.getByRole('button', { name: /^Remove/ });
    await remove.focus();
    await page.keyboard.press('Enter');
    await expect(panel).toHaveCount(0, { timeout: 40_000 });
    await expect.poll(async () => (await openDrafts(cv.canvasId)).length, { timeout: 40_000 }).toBe(1);
    const draft = (await openDrafts(cv.canvasId))[0]!;
    await expect.poll(async () => boxPoints(ownerId, draft.version_name as string, PROB), { timeout: 40_000 }).toEqual([]);
    expect(await boxPoints(ownerId, cv.v1Name, PROB), 'a point of a published version stays there').toEqual(['Nobody says what they mean']);
    expect(await page.evaluate(() => document.activeElement !== document.body), 'focus never drops to the page').toBe(true);
    expect(await runCount(draft.id as string), 'no run was made').toBe(0);
    await expect(page, 'Remove on a clone moved the page onto the new draft').toHaveURL(new RegExp(`[?&]v=${draft.version_name}(&|$)`), { timeout: 40_000 });

    // on the draft now: add a second card to Customer Segments by the API, re-read, open the FIRST card and Remove: focus goes to the next card's first action (else Add card, else the title)
    await ok(c, 'canvas_draft_add_point', { p_draft: draft.id, p_box: SEG, p_statement: 'A second segment card', p_expected_revision: await revisionOf(draft.id as string), p_client_id: randomUUID() });
    await page.reload();
    await showCanvas(page);
    await expect(page.getByTestId('canvas-grid')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
    if ((await page.getByTestId(`canvas-box-title-${SEG}`).getAttribute('aria-pressed')) !== 'true') await key(page, `canvas-box-title-${SEG}`);
    await page.getByTestId('canvas-box-more').first().click();   // See all 2
    await page.getByTestId(`canvas-box-${SEG}`).getByRole('button', { name: /^Open: Founders/ }).focus();
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: /^Remove/ }).focus();
    await page.keyboard.press('Enter');
    await expect(panel).toHaveCount(0, { timeout: 40_000 });
    await expect.poll(async () => boxPoints(ownerId, draft.version_name as string, SEG), { timeout: 40_000 }).toEqual(['A second segment card']);
    await expect(page.locator(':focus')).toHaveAttribute('data-testid', /^(canvas-card-edit-|canvas-card-open-|canvas-box-add-|canvas-box-title-)/, { timeout: 15_000 });
  } finally {
    await ctx.close();
    await deleteTestUser(ownerId);
  }
});

test(`P1621 round 2-3: mention a point (pill, sent as [Box] "text") and Undo goes off after a hand save (keyboard, ${WIDE})`, async ({ browser }) => {
  const user = await createTestUser({ name: 'P1621 mention walk' });
  const ownerId = user.user.id;
  const ctx = await browser.newContext({ viewport: { width: WIDE, height: 900 } });
  try {
    const c = await api(user.email);
    const first = await cycle(c, ownerId, {}, [pt(SEG, 'Founders who cannot get a straight answer'), pt(PROB, 'Nobody says what they mean')], [SEG, PROB]);
    const page = await ctx.newPage();
    await openWorkspace(page, user.email, `/p/${user.slug}/canvas/${first.canvas_name}?v=${first.version_name}&ws=1`);
    await settled(page);
    // Undo is on the newest reply (the run applied two cards)
    await expect(page.getByTestId('canvas-undo')).toBeVisible({ timeout: 40_000 });
    // 1. Mention the Problem card by keyboard: a pill reads "Box · words"; sent, it is [Box] "words" and then what was typed (the send is intercepted: no run, no model)
    if ((await page.getByTestId(`canvas-box-title-${PROB}`).getAttribute('aria-pressed')) !== 'true') await key(page, `canvas-box-title-${PROB}`);
    const mention = page.getByTestId(`canvas-box-${PROB}`).getByRole('button', { name: /^(Mention in chat|Mentioned)/ });
    await mention.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('composer-tag-pill')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByTestId('composer-tag-pill-label')).toHaveText('Problem · Nobody says what they mean');
    await expect(mention).toHaveText('Mentioned');
    await mention.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('composer-tag-pill'), 'one pill per point').toHaveCount(1);
    const sent: string[] = [];
    await page.route('**/rest/v1/rpc/canvas_workspace_send', async route => {
      sent.push(route.request().postData() ?? '');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'refused', code: 'busy', revision: 0 }) });
    });
    const field = page.getByTestId('composer').getByRole('textbox');
    await field.fill('make this shorter');
    await field.press('Enter');
    await expect.poll(() => sent.length, { timeout: 20_000 }).toBeGreaterThan(0);
    const body = JSON.parse(sent[0]!) as Row;
    expect(String(body.p_body).split('⁣').join('')).toBe('[Problem] "Nobody says what they mean" make this shorter');
    expect(body.p_box_refs, 'the run scope stays the box').toEqual([PROB]);
    await page.unroute('**/rest/v1/rpc/canvas_workspace_send');
    await expect(page.getByTestId('composer-tag-pill'), 'the sent mention leaves the composer').toHaveCount(0);

    // 2. a hand save closes Undo: the button goes, and the same spot says why, with no reload
    await key(page, `canvas-box-add-${PROB}`);
    await page.getByTestId('canvas-new-card-text').fill('Hand written card');
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('canvas-undo-off')).toHaveText('Undo is off because you edited by hand.', { timeout: 40_000 });
    await expect(page.getByTestId('canvas-undo')).toHaveCount(0);
    expect(await page.getByTestId('canvas-undo-off').getAttribute('role') ?? await page.getByTestId('canvas-undo-off').evaluate(e => e.getAttribute('role'))).toBe('status');
  } finally {
    await ctx.close();
    await deleteTestUser(ownerId);
  }
});
