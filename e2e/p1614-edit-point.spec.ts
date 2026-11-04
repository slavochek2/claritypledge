/**
 * @file p1614-edit-point.spec.ts
 * @description P1614: the owner edits a point's text on an open draft, driven in a real Chromium on TEST as a throwaway owner (1440, 375, 320).
 * Seeds with RPCs and the service-role worker calls (no model): a published v1, then a draft from it. Walks: Edit shown, open, Cancel writes nothing,
 * Save shows the new text at once and after a reload with no run made, Changed shows, Publish keeps v1's old text and shows the new text on v2, and
 * Discard of an edited draft leaves nothing. Screenshots go to P1614_DIR with the editor open and closed at each width.
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, TEST_PASSWORD } from './helpers/test-user';
import { isTestProjectUrl } from '../scripts/sweep-e2e-test-users';

test.skip(!isTestProjectUrl(process.env.VITE_SUPABASE_URL ?? '') && !/sslip\.io/.test(process.env.VITE_SUPABASE_URL ?? ''), 'p1614: not a TEST server. Nothing was run.');
const DIR = process.env.P1614_DIR ?? 'test-results/p1614';
fs.mkdirSync(DIR, { recursive: true });
test.use({ actionTimeout: 20_000 });
test.setTimeout(560_000);
test.describe.configure({ retries: 0 });

const SEG = 'canvas:segments';
const PROB = 'canvas:problem';
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
    p_body: 'P1614 walk', p_box_refs: o.refs ?? null, p_attachment: null, p_client_id: randomUUID(),
  });
  if (r.status !== 'ok') throw new Error(JSON.stringify(r));
  const adm = supabaseAdmin as unknown as SupabaseClient;
  await ok(adm, '_canvas_draft_run_begin', { p_run: r.run_id, p_owner: ownerId, p_has_file: false, p_cap_reply: null });
  await ok(adm, '_canvas_draft_run_complete', { p_run: r.run_id, p_owner: ownerId, p_actions: actions, p_questions: {}, p_scope: scope, p_focus: null, p_other_canvases: [], p_note: null, p_reply: 'Done.', p_usd: 0.001 });
  return r;
}
const pt = (box: string, statement: string): Row => ({ action: 'new', box, statement });
/** The page has finished loading: the grid is not busy and, on a draft, Publish is the real button, not its skeleton. */
async function settled(page: Page, draft: boolean) {
  await expect(page.getByTestId('canvas-grid')).toHaveAttribute('aria-busy', 'false', { timeout: 30_000 });
  if (draft) await expect(page.getByTestId('canvas-draft-publish')).toBeVisible({ timeout: 30_000 });
}
async function shot(page: Page, vp: number, name: string, draft = true) {
  await settled(page, draft);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${vp}-${name}.png`, fullPage: false });
}
const overflow = (page: Page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
async function showCanvas(page: Page) {
  const tab = page.getByTestId('workspace-view-canvas');
  if (await tab.isVisible().catch(() => false)) await tab.click();
}
async function draftState(ownerId: string) {
  const d = (await supabaseAdmin.from('canvas_drafts').select('id,version_name,revision,state,canvas_id').eq('owner_id', ownerId).eq('state', 'open').maybeSingle()).data as Row | null;
  const pts = d ? ((await supabaseAdmin.from('points').select('id,statement').eq('first_validator_id', ownerId).contains('system_tags', [`canvas_${d.version_name}`])).data ?? []) : [];
  const runs = d ? (await supabaseAdmin.from('canvas_draft_runs').select('id', { count: 'exact', head: true }).eq('draft_id', d.id)).count ?? -1 : -1;
  return { d, statements: pts.map(p => p.statement as string).sort(), runs };
}

for (const vp of [1440, 375, 320]) {
  test(`P1614 edit a point on a draft at ${vp}`, async ({ browser }) => {
    const user = await createTestUser({ name: `P1614 walk ${vp}` });
    const ownerId = user.user.id;
    const ctx = await browser.newContext({ viewport: { width: vp, height: vp > 500 ? 900 : 800 }, ...(vp < 500 ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
    try {
      const c = await api(user.email);
      // v1 published, then a draft from it
      const first = await cycle(c, ownerId, {}, [pt(SEG, 'Founders who cannot get a straight answer'), pt(PROB, 'Nobody says what they mean')], [SEG, PROB]);
      const v1name = first.version_name as string;
      const canvasName = first.canvas_name as string;
      await ok(c, 'canvas_draft_publish', { p_draft: first.draft_id, p_expected_revision: (await draftStateRevision(first.draft_id)) });
      const v1 = (await supabaseAdmin.from('canvas_versions').select('id').eq('canvas_id', first.canvas_id).eq('name', v1name).single()).data as Row;
      const second = await cycle(c, ownerId, { canvas: first.canvas_id, from: v1.id, refs: [PROB] }, [], []);
      const base = `/p/${user.slug}/canvas/${canvasName}`;

      const page = await ctx.newPage();
      await setTestSession(page, user.email);
      await page.goto(`${base}?v=${second.version_name}&ws=1`);
      await showCanvas(page);
      await expect(page.getByTestId('canvas-grid')).toBeVisible({ timeout: 30_000 });
      expect(await page.evaluate(() => window.innerWidth), 'the viewport is the width asked for').toBe(vp);
      const before = await draftState(ownerId);
      const target = before.d && (await supabaseAdmin.from('points').select('id,statement').eq('first_validator_id', ownerId).eq('statement', 'Founders who cannot get a straight answer').contains('system_tags', [`canvas_${second.version_name}`]).single()).data as Row;

      // 1. Edit is offered, editor closed
      const editBtn = page.getByTestId(`canvas-edit-point-${target.id}`);
      await expect(editBtn).toBeVisible({ timeout: 20_000 });
      const bb = (await editBtn.boundingBox())!;
      expect(bb.width, 'hit area at least 40px wide').toBeGreaterThanOrEqual(40);
      expect(bb.height, 'hit area at least 40px tall').toBeGreaterThanOrEqual(40);
      // it sits on the card (inside its box), never nested in the card button, and its icon clears the statement text
      const cardBox = (await page.getByTestId(`canvas-point-card-${target.id}`).boundingBox())!;
      const textBox = (await page.getByTestId(`canvas-point-card-${target.id}`).locator('p').first().boundingBox())!;
      const icon = (await editBtn.locator('svg').boundingBox())!;
      const inter = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
        Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      const measure = { vp, hitArea: { w: bb.width, h: bb.height }, hitAreaOverlapsStatementPx2: inter(bb, textBox), iconOverlapsStatementPx2: inter(icon, textBox), insideCardX: bb.x >= cardBox.x && bb.x + bb.width <= cardBox.x + cardBox.width };
      fs.writeFileSync(`${DIR}/${vp}-pencil.json`, JSON.stringify(measure));
      expect(measure.iconOverlapsStatementPx2, 'the icon never covers the statement').toBe(0);
      expect(measure.insideCardX, 'the hit area stays inside the card horizontally').toBe(true);
      expect(await editBtn.evaluate(el => !!el.closest('[data-testid^="canvas-point-card-"]')), 'a sibling of the card button, not nested').toBe(false);
      let ov = await overflow(page); expect(ov.sw, 'no horizontal overflow, editor closed').toBeLessThanOrEqual(ov.iw);
      await shot(page, vp, 'closed');

      // 2. open, Cancel writes nothing
      await editBtn.click();
      const area = page.getByTestId('canvas-point-editor-text');
      await expect(area).toBeFocused();
      await area.fill('Typed then cancelled');
      ov = await overflow(page); expect(ov.sw, 'no horizontal overflow, editor open').toBeLessThanOrEqual(ov.iw);
      await shot(page, vp, 'open');
      await page.getByTestId('canvas-point-editor-cancel').click();
      await expect(page.getByTestId('canvas-point-editor-text')).toHaveCount(0);
      expect(await draftState(ownerId)).toEqual(before);

      // 3. empty text is stopped with a sentence
      await editBtn.click();
      await page.getByTestId('canvas-point-editor-text').fill('   ');
      await page.getByTestId('canvas-point-editor-save').click();
      await expect(page.getByTestId('canvas-point-editor-problem')).toHaveText('A point needs some words.');
      await shot(page, vp, 'open-empty-error');

      // 4. Save: new text at once, no run, Changed shows; the same after a reload
      await page.getByTestId('canvas-point-editor-text').fill('Founders whose co-founder never says what they mean');
      await page.getByTestId('canvas-point-editor-save').click();
      await expect(page.getByText('Founders whose co-founder never says what they mean')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('canvas-point-editor-text')).toHaveCount(0);
      await expect(page.getByTestId('canvas-box-changed').first()).toBeVisible();
      const after = await draftState(ownerId);
      expect(after.runs, 'no run was made').toBe(before.runs);
      expect(after.statements).toContain('Founders whose co-founder never says what they mean');
      expect(after.statements).not.toContain('Founders who cannot get a straight answer');
      await shot(page, vp, 'saved');
      await page.reload();
      await showCanvas(page);
      await expect(page.getByText('Founders whose co-founder never says what they mean')).toBeVisible({ timeout: 30_000 });
      // reloading keeps the workspace: the draft's controls are all there at every width, not only the text
      await expect(page.getByTestId('canvas-discard'), 'Discard after reload').toBeVisible();
      await expect(page.getByTestId('canvas-draft-publish'), 'Publish after reload').toBeVisible();
      await expect(page.getByTestId(`canvas-add-to-chat-${SEG}`), 'Add to chat after reload').toBeVisible();
      if (vp < 1280) await expect(page.getByTestId('workspace-view-canvas'), 'the Canvas/Thread toggle after reload').toBeVisible();
      expect(page.url(), 'ws=1 survives the reload').toContain('ws=1');
      await shot(page, vp, 'saved-after-reload');

      // 5. Publish: v2 shows the new text, v1 keeps the old
      await page.getByTestId('canvas-draft-publish').click();
      await expect.poll(async () => (await supabaseAdmin.from('canvas_drafts').select('state').eq('owner_id', ownerId).eq('id', second.draft_id).single()).data?.state, { timeout: 40_000 }).toBe('published');
      const old = (await supabaseAdmin.from('points').select('superseded_by,statement').eq('id', target.id).single()).data as Row;
      expect(old.statement, 'v1 point unchanged').toBe('Founders who cannot get a straight answer');
      expect(old.superseded_by, 'the old point is superseded').toBeTruthy();
      await page.goto(`${base}?v=${v1name}`);
      await expect(page.getByText('Founders who cannot get a straight answer')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('canvas-edit-point-' + target.id)).toHaveCount(0);   // a published version offers no Edit
      await shot(page, vp, 'v1-published-no-edit', false);

      // 6. Discard of an edited draft leaves nothing
      const v2id = ((await supabaseAdmin.from('canvas_drafts').select('version_id').eq('id', second.draft_id).single()).data as Row).version_id as string;
      const third = await cycle(c, ownerId, { canvas: first.canvas_id, from: v2id, refs: [PROB] }, [], []);
      await page.goto(`${base}?v=${third.version_name}&ws=1`);
      await showCanvas(page);
      const t3 = (await supabaseAdmin.from('points').select('id').eq('first_validator_id', ownerId).contains('system_tags', [`canvas_${third.version_name}`]).eq('statement', 'Founders whose co-founder never says what they mean').single()).data as Row;
      await page.getByTestId(`canvas-edit-point-${t3.id}`).click();
      await page.getByTestId('canvas-point-editor-text').fill(`This edit will be discarded ${vp}`);
      await page.getByTestId('canvas-point-editor-save').click();
      await expect(page.getByTestId('canvas-point-editor-text')).toHaveCount(0, { timeout: 20_000 });   // the save finished
      await expect(page.getByText(`This edit will be discarded ${vp}`)).toBeVisible({ timeout: 20_000 });
      const madeRes = await supabaseAdmin.from('points').select('id').eq('statement', `This edit will be discarded ${vp}`).eq('first_validator_id', ownerId);
      expect(madeRes.data?.length, `the edit's point exists once: ${JSON.stringify(madeRes.error)}`).toBe(1);
      const made = madeRes.data![0] as Row;
      await page.getByTestId('canvas-discard').click();
      await page.getByRole('button', { name: 'Discard', exact: true }).last().click();
      await expect.poll(async () => (await supabaseAdmin.from('points').select('id').eq('id', made.id)).data?.length, { timeout: 30_000 }).toBe(0);
      const kept = (await supabaseAdmin.from('points').select('statement,superseded_by').eq('id', t3.id).single()).data as Row;
      expect(kept, 'Discard never deletes the reused v2 point, and leaves it unchanged and unsuperseded').toMatchObject({ statement: 'Founders whose co-founder never says what they mean', superseded_by: null });
    } finally {
      await ctx.close();
      await deleteTestUser(ownerId);
    }
  });
}
async function draftStateRevision(draftId: string): Promise<number> {
  return ((await supabaseAdmin.from('canvas_drafts').select('revision').eq('id', draftId).single()).data as Row).revision as number;
}

/**
 * Review fixes: a point beyond the box's first card is edited from the See all panel (Escape closes the editor, not the panel), and the typed text survives
 * an agent rewording the point underneath it (stale_view, then the re-read replaces the point): the editor moves onto the current point with a notice and Save lands there.
 */
for (const vp of [1440, 375, 320]) {
  test(`P1614 See all panel edit and a replaced point at ${vp}`, async ({ browser }) => {
    const user = await createTestUser({ name: `P1614 panel ${vp}` });
    const ownerId = user.user.id;
    const ctx = await browser.newContext({ viewport: { width: vp, height: vp > 500 ? 900 : 800 }, ...(vp < 500 ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
    try {
      const c = await api(user.email);
      const first = await cycle(c, ownerId, {}, [pt(SEG, 'Panel one'), pt(SEG, 'Panel two')], [SEG]);
      const pts = (await supabaseAdmin.from('points').select('id,statement').eq('first_validator_id', ownerId).contains('system_tags', [`canvas_${first.version_name}`])).data as Row[];
      const idOf = (t: string) => pts.find(p => p.statement === t)!.id as string;
      const page = await ctx.newPage();
      await setTestSession(page, user.email);
      await page.goto(`/p/${user.slug}/canvas/${first.canvas_name}?v=${first.version_name}&ws=1`);
      await showCanvas(page);
      const segBox = page.getByTestId(`canvas-box-${SEG}`);
      await expect(segBox).toBeVisible({ timeout: 30_000 });

      // the panel: both points have Edit; Escape in the editor closes the editor, not the panel
      await segBox.getByTestId('canvas-box-more').click();
      const list = page.getByTestId('canvas-panel-box-list');
      await expect(list).toBeVisible();
      await expect(list.locator('[data-testid^="canvas-edit-point-"]')).toHaveCount(2);
      await shot(page, vp, 'panel-closed');
      const second = list.getByTestId(`canvas-edit-point-${idOf('Panel two')}`);
      await second.click();
      await list.getByTestId('canvas-point-editor-text').fill('Panel two typed');
      await shot(page, vp, 'panel-open');
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('canvas-point-editor-text')).toHaveCount(0);
      await expect(list, 'Escape closed the editor only, the panel stays').toBeVisible();
      await second.click();
      await list.getByTestId('canvas-point-editor-text').fill('Panel two edited');
      await list.getByTestId('canvas-point-editor-save').click();
      await expect(page.getByTestId('canvas-point-editor-text')).toHaveCount(0, { timeout: 20_000 });
      await expect(list.getByText('Panel two edited')).toBeVisible({ timeout: 20_000 });
      expect((await draftState(ownerId)).statements).toContain('Panel two edited');
      await page.keyboard.press('Escape');
      await expect(list).toHaveCount(0);

      // a replaced point: type, an agent rewords the point underneath, Save is refused as stale; the text stays visible and selectable, with NO Save and no guess where it belongs
      // the point the grid shows first (an edit keeps its card in place, so which one that is depends on the draft's order)
      const editedId = (await supabaseAdmin.from('points').select('id').eq('first_validator_id', ownerId).eq('statement', 'Panel two edited').single()).data!.id as string;
      const shownTestId = (await segBox.locator('[data-testid^="canvas-edit-point-"]').first().getAttribute('data-testid'))!;
      const firstId = shownTestId.replace('canvas-edit-point-', '');
      const otherId = firstId === editedId ? idOf('Panel one') : editedId;
      await page.getByTestId(`canvas-edit-point-${firstId}`).click();
      await page.getByTestId('canvas-point-editor-text').fill('Typed while the agent rewrites');
      const st = (await draftState(ownerId)).d as Row;
      await cycle(c, ownerId, { canvas: first.canvas_id, draft: st.id, rev: st.revision }, [{ action: 'reword', point_id: firstId, box: SEG, statement: 'Agent rewrite' }, { action: 'keep', point_id: otherId }], [SEG]);
      await page.getByTestId('canvas-point-editor-save').click();
      await expect(page.getByTestId('canvas-point-editor-notice')).toContainText('changed while you were typing', { timeout: 30_000 });
      const kept = page.getByTestId('canvas-point-editor-text');
      await expect(kept).toHaveValue('Typed while the agent rewrites');
      await expect(kept).toHaveJSProperty('readOnly', true);
      await expect(page.getByTestId('canvas-point-editor-save'), 'no Save, on the agent\'s point or anywhere').toHaveCount(0);
      const ov = await overflow(page); expect(ov.sw, 'no horizontal overflow with the notice').toBeLessThanOrEqual(ov.iw);
      await shot(page, vp, 'replaced-notice');
      // the owner opens Edit on the current point themselves and pastes
      await page.getByTestId('canvas-point-editor-dismiss').click();
      await expect(page.getByTestId('canvas-point-editor-text')).toHaveCount(0);
      const agentId = (await supabaseAdmin.from('points').select('id').eq('first_validator_id', ownerId).eq('statement', 'Agent rewrite').single()).data!.id as string;
      await segBox.getByTestId('canvas-box-more').click();
      const list2 = page.getByTestId('canvas-panel-box-list');
      await list2.getByTestId(`canvas-edit-point-${agentId}`).click();
      await list2.getByTestId('canvas-point-editor-text').fill('Typed while the agent rewrites');
      await list2.getByTestId('canvas-point-editor-save').click();
      await expect(page.getByTestId('canvas-point-editor-text')).toHaveCount(0, { timeout: 20_000 });
      const final = (await draftState(ownerId)).statements;
      expect(final).toContain('Typed while the agent rewrites');
      expect(final).not.toContain('Agent rewrite');
    } finally {
      await ctx.close();
      await deleteTestUser(ownerId);
    }
  });
}

/** The agent removes the LAST point of a box while the owner holds typed text: the editor stays on screen beside the box's Empty state, with no Save. */
test('P1614 an emptied box keeps the typed text on screen at 375', async ({ browser }) => {
  const vp = 375;
  const user = await createTestUser({ name: 'P1614 emptied' });
  const ownerId = user.user.id;
  const ctx = await browser.newContext({ viewport: { width: vp, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  try {
    const c = await api(user.email);
    const first = await cycle(c, ownerId, {}, [pt(SEG, 'Only point')], [SEG]);
    const onlyId = ((await supabaseAdmin.from('points').select('id').eq('first_validator_id', ownerId).eq('statement', 'Only point').single()).data as Row).id as string;
    const page = await ctx.newPage();
    await setTestSession(page, user.email);
    await page.goto(`/p/${user.slug}/canvas/${first.canvas_name}?v=${first.version_name}&ws=1`);
    await showCanvas(page);
    await page.getByTestId(`canvas-edit-point-${onlyId}`).click();
    await page.getByTestId('canvas-point-editor-text').fill('Typed as the box emptied');
    const st = (await draftState(ownerId)).d as Row;
    await cycle(c, ownerId, { canvas: first.canvas_id, draft: st.id, rev: st.revision }, [], [SEG]);   // the run removes the last point
    await page.getByTestId('canvas-point-editor-save').click();
    const box = page.getByTestId(`canvas-box-${SEG}`);
    await expect(box.getByTestId('canvas-point-editor-notice')).toContainText('changed while you were typing', { timeout: 30_000 });
    await expect(box.getByTestId('canvas-point-editor-text')).toHaveValue('Typed as the box emptied');
    await expect(box.getByText('Empty', { exact: true })).toBeVisible();
    await expect(box.getByTestId('canvas-point-editor-save')).toHaveCount(0);
    const ov = await overflow(page); expect(ov.sw).toBeLessThanOrEqual(ov.iw);
    await shot(page, vp, 'emptied-box-orphan', false);   // nothing left to publish, so no Publish button to wait for
  } finally {
    await ctx.close();
    await deleteTestUser(ownerId);
  }
});

/** An edit keeps the card where it was: with the grid showing one card per box, editing the first must leave the edited card first, and See all in the same order. */
for (const vp of [1440, 375]) {
  test(`P1614 an edit keeps the card in place on a two-card board at ${vp}`, async ({ browser }) => {
    const user = await createTestUser({ name: `P1614 order ${vp}` });
    const ownerId = user.user.id;
    const ctx = await browser.newContext({ viewport: { width: vp, height: vp > 500 ? 900 : 800 }, ...(vp < 500 ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
    try {
      const c = await api(user.email);
      const first = await cycle(c, ownerId, {}, [pt(SEG, 'Order alpha'), pt(SEG, 'Order beta')], [SEG]);   // one run: both share a created_at
      const page = await ctx.newPage();
      await setTestSession(page, user.email);
      await page.goto(`/p/${user.slug}/canvas/${first.canvas_name}?v=${first.version_name}&ws=1`);
      await showCanvas(page);
      const segBox = page.getByTestId(`canvas-box-${SEG}`);
      await expect(segBox).toBeVisible({ timeout: 30_000 });
      const shownText = () => segBox.locator('[data-testid^="canvas-point-card-"]').first().innerText();
      const panelOrder = async () => {
        await segBox.getByTestId('canvas-box-more').click();
        const items = page.getByTestId('canvas-panel-box-list').locator('[data-testid^="canvas-point-card-"]');
        await expect(items).toHaveCount(2);
        const texts = (await items.allInnerTexts()).map(t => t.split('\n')[0]!.trim());
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('canvas-panel-box-list')).toHaveCount(0);
        return texts;
      };
      const firstShown = (await shownText()).split('\n')[0]!.trim();
      const order0 = await panelOrder();
      expect(order0[0], 'the grid shows the first of the See all list').toBe(firstShown);
      for (let round = 0; round < 3; round++) {
        const current = (await shownText()).split('\n')[0]!.trim();
        await segBox.locator('[data-testid^="canvas-edit-point-"]').first().click();
        const edited = `Edited first card ${round}`;
        await segBox.getByTestId('canvas-point-editor-text').fill(edited);
        await segBox.getByTestId('canvas-point-editor-save').click();
        await expect(page.getByTestId('canvas-point-editor-text')).toHaveCount(0, { timeout: 20_000 });
        await expect.poll(async () => (await shownText()).split('\n')[0]!.trim(), { timeout: 20_000 }).toBe(edited);
        const order = await panelOrder();
        expect(order, `round ${round} (was "${current}"): See all keeps the order, edited card first`).toEqual([edited, order0[1]]);
      }
      await shot(page, vp, 'order-kept');
    } finally {
      await ctx.close();
      await deleteTestUser(ownerId);
    }
  });
}
