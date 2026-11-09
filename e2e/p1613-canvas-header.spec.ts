/**
 * @file p1613-canvas-header.spec.ts
 * @description P1613 on the REAL route (the owner's canvas page, the workspace, the mirror chat), in Chromium on the self-hosted TEST server, with test accounts only:
 * Compare in the bar beside the version picker (no row of its own), the real Mention in chat (P1621 replaced P1613's Add to chat: on the selected box only, the label always shown, wrapping
 * in a narrow one; a tap puts the box's pill in the composer and the button reads Mentioned), Clone from a comparison (Compare and `with` gone, a real browser Back brings the comparison back) and Cancel's real class. Refuses to run against anything but a TEST project.
 *
 *   P1613_DIR=<abs dir for screenshots> npx playwright test e2e/p1613-canvas-header.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, TEST_PASSWORD } from './helpers/test-user';
import { isTestProjectUrl } from '../scripts/sweep-e2e-test-users';
import { pacLaunchOptions } from './helpers/pac-launch';

test.skip(!isTestProjectUrl(process.env.VITE_SUPABASE_URL ?? ''), 'p1613-canvas-header: VITE_SUPABASE_URL is not a TEST project. Nothing was run.');
test.use({ launchOptions: pacLaunchOptions(), viewport: { width: 1440, height: 900 }, actionTimeout: 20_000 });
test.setTimeout(300_000);

const DIR = process.env.P1613_DIR ?? 'test-results/p1613';
fs.mkdirSync(DIR, { recursive: true });
const TITLE = 'Acme Bakery Plan for the Northern Region';
const POINTS: Array<[string, string]> = [
  ['canvas:segments', 'Office managers at companies with 20 to 200 staff (SEEDED)'],
  ['canvas:problem', 'Offices order catering late and get cold food (SEEDED)'],
  ['canvas:world-needs', 'Nobody wants a weekly order (SEEDED)'],
];

test('P1613 real route: Compare in the bar, Mention in chat, Clone from a comparison, Back, Cancel', async ({ page }) => {
  const created: string[] = []; // every account made so far: a failed second create must not leak the first
  const pointIds: string[] = [];
  let canvasId: string | null = null;
  try {
    const owner = await createTestUser({ name: 'P1613 Owner' });
    created.push(owner.user.id);
    const other = await createTestUser({ name: 'P1613 Other' });
    created.push(other.user.id);
    const api = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signed, error: signErr } = await api.auth.signInWithPassword({ email: owner.email, password: TEST_PASSWORD });
    if (signErr || !signed.session) throw new Error(`owner sign-in failed: ${signErr?.message}`);
    const opened = (await api.rpc('canvas_draft_open', { p_from_version: null })).data as { canvas_name: string };
    const d1 = (await supabaseAdmin.from('canvas_drafts').select('id,version_name,version_id,revision,canvas_id').eq('owner_id', owner.user.id).eq('state', 'open').limit(1).maybeSingle()).data!;
    const ins = await supabaseAdmin.from('points').insert(POINTS.map(([box, statement]) => ({ statement, first_validator_id: owner.user.id, visibility: 'private', tags: [], system_tags: [box, `canvas_${d1.version_name}`] }))).select('id');
    if (ins.error || !ins.data) throw new Error(`seed points: ${ins.error?.message}`);
    pointIds.push(...ins.data.map(r => r.id as string));
    const link = await supabaseAdmin.from('canvas_draft_points').insert(pointIds.map(id => ({ draft_id: d1.id, point_id: id })));
    if (link.error) throw new Error(`seed draft points: ${link.error.message}`);
    canvasId = d1.canvas_id as string;
    const pub = await api.rpc('canvas_draft_publish', { p_draft: d1.id, p_expected_revision: d1.revision });
    if (pub.error) throw new Error(`publish: ${pub.error.message}`);
    const ren = await api.rpc('canvas_rename', { p_canvas: d1.canvas_id, p_title: TITLE });
    if (ren.error) throw new Error(`rename: ${ren.error.message}`);
    // someone to compare with: another account in the canvas's audience, with a position on a canvas point (the canvas read returns positions of the audience only)
    const aud = await supabaseAdmin.from('canvas_audience').insert({ canvas_id: d1.canvas_id, kind: 'person', profile_id: other.user.id });
    if (aud.error) throw new Error(`seed audience: ${aud.error.message}`);
    const pos = await supabaseAdmin.from('point_positions').insert({ point_id: pointIds[1]!, user_id: other.user.id, position: 'disagree' });
    if (pos.error) throw new Error(`seed position: ${pos.error.message}`);

    // The TEST server's `canvas-draft` function does not boot (its `_shared/canvas-material.ts` module is missing there: a 500 on every call), so the page could never learn that
    // drafting is on and would not draw Clone. Only the availability question is answered here, from the browser; every other call to the function goes through untouched.
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    await page.route('**/functions/v1/canvas-draft', async route => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      if (req.method() === 'POST' && (req.postData() ?? '').includes('"availability"')) return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true }) });
      return route.continue();
    });
    const path = `/p/${owner.slug}/canvas/${opened.canvas_name}`;
    const v1 = d1.version_name as string;
    await page.context().addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } });
    await setTestSession(page, owner.email);
    await page.goto(`${path}?v=${v1}`);
    await expect(page.getByTestId('canvas-clone')).toBeVisible({ timeout: 40_000 });
    await expect.poll(async () => (await page.getByTestId('canvas-title').textContent()) ?? '', { timeout: 40_000 }).toBe(TITLE);

    // 1. Compare beside the version picker, in the bar, with no row of its own
    const compare = page.getByTestId('canvas-compare-picker');
    await expect(compare).toBeVisible({ timeout: 40_000 });
    const bar = page.getByTestId('workspace-bar');
    expect(await bar.evaluate((b, id) => b.contains(document.querySelector(`[data-testid="${id}"]`)), 'canvas-compare-picker')).toBe(true);
    await expect(page.getByTestId('canvas-actions')).toHaveCount(0);
    const [pb, cb] = [await page.getByTestId('canvas-version-picker').boundingBox(), await compare.boundingBox()];
    expect(Math.abs(cb!.y - pb!.y) < 8, `Compare is on the picker's line (y ${cb!.y} vs ${pb!.y})`).toBe(true);
    expect(cb!.x >= pb!.x + pb!.width - 1, 'Compare is right of the picker').toBe(true);
    expect((await page.evaluate(() => document.documentElement.scrollWidth)) <= 1440).toBe(true);
    await page.screenshot({ path: `${DIR}/1-published-1440.png` });

    // 2. P1621: Mention in chat shows on the SELECTED box only; select Problem by its title. In a wide box the label is in the flow, never visually hidden
    await expect(page.getByTestId('canvas-mention-in-chat-canvas:problem'), 'nothing is mentioned at rest').toHaveCount(0);
    await page.getByTestId('canvas-box-title-canvas:problem').click();
    const addProblem = page.getByTestId('canvas-mention-in-chat-canvas:problem');
    await expect(addProblem).toBeVisible({ timeout: 40_000 });
    const wide = await addProblem.evaluate(b => ({ w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height, label: getComputedStyle(b.querySelector('span')!).position, text: b.textContent }));
    console.log('wide box', JSON.stringify(wide));
    expect(wide.label, 'the label is in flow in a wide box').toBe('static');
    expect(wide.text).toBe('Mention in chat');
    expect(wide.h).toBeGreaterThanOrEqual(39.5);
    expect(wide.w).toBeGreaterThan(60);

    // 3. pick someone: the address carries `with`
    await page.getByLabel('Compare positions with').selectOption(other.user.id);
    await expect(page).toHaveURL(/with=/);
    await expect(compare).toContainText('Comparing with');

    // 4. Clone from the comparison: Compare and `with` are gone, the workspace is on
    await page.getByTestId('canvas-clone').click();
    await expect(page).toHaveURL(/ws=1/);
    expect(page.url()).not.toContain('with=');
    await expect(page.getByTestId('canvas-compare-picker')).toHaveCount(0);
    await expect(page.getByTestId('canvas-cancel-clone')).toBeVisible();
    await expect(page.getByTestId('composer')).toBeVisible({ timeout: 40_000 });
    await page.screenshot({ path: `${DIR}/2-pending-clone-1440.png` });

    // 5. Cancel's real class: the shared secondary pill (a blue outline on a pale fill)
    const cancelClass = await page.getByTestId('canvas-cancel-clone').getAttribute('class');
    for (const t of ['border-blue-600', 'bg-blue-50', 'text-blue-700', 'rounded-full', 'h-10']) expect(cancelClass, `Cancel has ${t}`).toContain(t);
    const statusBorder = await page.getByTestId('publish-spot').evaluate(el => [el, ...el.querySelectorAll('*')].some(e => getComputedStyle(e).borderTopWidth !== '0px'));
    expect(statusBorder, 'the status text beside Cancel has no outline').toBe(false);

    // 6. the real (per-card) Mention in chat in a narrow box (the panel is open): P1621 removed the icon-only form; the label always shows and wraps, the button stays inside its box
    await page.getByTestId('canvas-box-title-canvas:world-needs').scrollIntoViewIfNeeded();
    await page.getByTestId('canvas-box-title-canvas:world-needs').click();
    // Round 2: on a pending Clone the box holds a card, and its Mention in chat is the card's own (the box keeps its button only while empty)
    const narrow = page.getByTestId(`canvas-card-mention-${pointIds[2]}`);
    await expect(narrow).toBeVisible();
    const n = await narrow.evaluate(b => {
      const r = b.getBoundingClientRect(); const box = b.closest('[data-canvas-box]')!.getBoundingClientRect(); const s = b.querySelector('span')!;
      return { w: r.width, h: r.height, insideBox: r.left >= box.left - 1 && r.right <= box.right + 1, box: box.width, pos: getComputedStyle(s).position, text: b.textContent, name: b.getAttribute('aria-label') };
    });
    console.log('narrow box', JSON.stringify(n));
    expect(n.h).toBeGreaterThanOrEqual(39.5);
    expect(n.insideBox, 'the button stays inside its box').toBe(true);
    expect(n.pos, 'the label is not visually hidden').toBe('static');
    expect(n.text).toBe('Mention in chat');
    expect(n.name).toContain('Mention in chat');
    await page.screenshot({ path: `${DIR}/3-mention-in-chat-narrow-1440.png` });

    // 7. a tap puts the card's pill (box, a dot, the card's words) in the composer; the button reads Mentioned; a repeat tap adds no second pill
    await narrow.click();
    await expect(page.getByTestId('composer-tag-pill')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByTestId('composer-tag-pill').first()).toContainText('Hypotheses');
    await expect(narrow).toHaveText('Mentioned');
    await narrow.click();
    await expect(page.getByTestId('composer-tag-pill')).toHaveCount(1);

    // 8. a real browser Back from the Clone brings the comparison back (the move pushed an entry)
    await page.goBack();
    await expect(page).toHaveURL(/with=/);
    await expect(page.getByTestId('canvas-compare-picker')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel('Compare positions with')).toHaveValue(other.user.id);
    await expect(page.getByTestId('canvas-cancel-clone')).toHaveCount(0);
    await page.screenshot({ path: `${DIR}/4-back-restores-comparison-1440.png` });
  } finally {
    if (canvasId) await supabaseAdmin.from('canvas_audience').delete().eq('canvas_id', canvasId).then(() => undefined, () => undefined);
    if (pointIds.length) await supabaseAdmin.from('point_positions').delete().in('point_id', pointIds).then(() => undefined, () => undefined);
    for (const id of created.reverse()) await deleteTestUser(id).catch(e => console.error(`cleanup of ${id} failed`, e));
  }
});
