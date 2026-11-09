/**
 * @file p1529-publish-return.spec.ts
 * @description P1529: Publish from the canvas workspace returns to /events/<slug>/prepare, on the canvas step, with the step header and the share state.
 * Two routes into the workspace from step 4: (a) "Continue your draft", (b) "Create your canvas" (the real start: canvas_draft_open, chat refresh, workspace).
 * Only the draft's content is seeded by the service role (points + links, as the other P1529 helpers do): no model call is made. The canvas-draft
 * function's availability answer is stubbed as in p1613 (the TEST function may not boot); nothing else is.
 *
 *   P1529_OUT=<abs dir> npx playwright test e2e/p1529-publish-return.spec.ts --project=chromium --workers=1
 */
import { test, expect, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { supabaseAdmin } from './helpers/supabase-admin';
import { setTestSession } from './helpers/test-user';
import { assertSelfHostedTest, newLedger, makeUser, makeEvent, register, cleanup, leftovers, RUN, type Person } from './helpers/p1529-mastermind';

test.describe.configure({ mode: 'serial', timeout: 300_000, retries: 0 });
test.use({ actionTimeout: 30_000, navigationTimeout: 90_000, viewport: { width: 1280, height: 900 } });

const OUT = process.env.P1529_OUT ?? 'test-results/p1529-publish-return';
mkdirSync(OUT, { recursive: true });
const ledger = newLedger();
const log = (s: string) => { console.log(`[publish-return] ${s}`); appendFileSync(`${OUT}/publish-return.log`, `${s}\n`); };

let host: Person;
const POINTS: Array<[string, string]> = [
  ['canvas:segments', 'Small teams that sell by referral'],
  ['canvas:problem', 'Referrals dry up between projects'],
  ['canvas:solution', 'A monthly intro ritual'],
];

async function seedDraftContent(owner: Person, draftId: string, versionName: string) {
  for (const [box, statement] of POINTS) {
    const pt = await supabaseAdmin.from('points').insert({ statement: `${statement} (${RUN})`, first_validator_id: owner.user.user.id, visibility: 'private', tags: [], system_tags: [box, `canvas_${versionName}`] }).select('id').single();
    if (pt.error) throw new Error(`seed point: ${pt.error.message}`);
    ledger.points.push(pt.data.id as string);
    const l = await supabaseAdmin.from('canvas_draft_points').insert({ draft_id: draftId, point_id: pt.data.id });
    if (l.error) throw new Error(`seed draft point: ${l.error.message}`);
  }
}
const openDraftOf = async (owner: Person) => (await supabaseAdmin.from('canvas_drafts').select('id,version_name,canvas_id,canvas_name').eq('owner_id', owner.user.user.id).eq('state', 'open').order('created_at', { ascending: false }).limit(1).maybeSingle()).data;

async function ownerOnStep4(page: Page, owner: Person, slug: string, eventId: string) {
  const seed = await supabaseAdmin.from('event_preparations').insert({ event_id: eventId, profile_id: owner.user.user.id, started_at: new Date().toISOString(), steps_done: ['story', 'principle', 'cmp7'] });
  expect(seed.error, 'prep seed').toBeNull();
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
  await page.route('**/functions/v1/canvas-draft', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (req.method() === 'POST' && (req.postData() ?? '').includes('"availability"')) return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true }) });
    return route.continue();
  });
  await page.context().addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } });
  await setTestSession(page, owner.user.email);
  await page.goto(`/events/${slug}/prepare`);
  await expect(page.getByTestId('prep-canvas-step')).toBeVisible({ timeout: 90_000 });
}

async function publishAndRecord(page: Page, route: string, slug: string) {
  const banner = page.getByTestId('preparation-banner');
  await expect(banner).toBeVisible({ timeout: 40_000 });
  const before = { url: page.url(), banner: await banner.isVisible().catch(() => false), bannerText: (await banner.textContent().catch(() => '')) ?? '' };
  await page.screenshot({ path: `${OUT}/${route}-before-publish.png` });
  await expect(page.getByTestId('canvas-draft-publish')).toBeEnabled({ timeout: 60_000 });
  await page.getByTestId('canvas-draft-publish').click();
  await page.waitForTimeout(4000);
  const after = { url: page.url(), header: await page.getByTestId('step-header').isVisible().catch(() => false), stepName: (await page.getByTestId('step-name').textContent().catch(() => '')) ?? '', canvasStep: await page.getByTestId('prep-canvas-step').isVisible().catch(() => false), bannerStill: await banner.isVisible().catch(() => false) };
  await page.screenshot({ path: `${OUT}/${route}-after-publish.png` });
  log(`${route}: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  expect(before.banner, `${route}: the banner shows in the workspace`).toBe(true);
  expect(new URL(after.url).pathname, `${route}: final path`).toBe(`/events/${slug}/prepare`);
  expect(after.header, `${route}: the step header shows after Publish`).toBe(true);
  expect(after.canvasStep, `${route}: the canvas step is shown`).toBe(true);
}

test.beforeAll(async () => {
  assertSelfHostedTest();
  host = await makeUser(ledger, 'Hana Qpr');
});
test.afterAll(async () => {
  const report = await cleanup(ledger);
  const left = await leftovers(ledger);
  log(`CLEANUP ${JSON.stringify(report)}`);
  log(`LEFTOVERS ${JSON.stringify(left)}`);
  expect(Object.values(left).every((n) => n === 0), `leftovers ${JSON.stringify(left)}`).toBe(true);
});

for (const [route, width] of [['a-continue-draft', 1280], ['b-create', 1280], ['a-continue-draft', 375], ['b-create', 375]] as const) {
  test(`Publish returns to the preparation: route ${route} at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width >= 1280 ? 900 : 812 });
    const owner = await makeUser(ledger, `Olga ${route.slice(0, 1)}qpr`);
    const ev = await makeEvent(ledger, host.user, `P1529 publish return ${RUN} ${route}`, { startsInMs: 2 * 86_400_000 });
    await register(owner, ev.slug);
    if (route === 'a-continue-draft') {
      const opened = await owner.client.rpc('canvas_draft_open', { p_from_version: null });
      expect(opened.error).toBeNull();
      const d = (await openDraftOf(owner))!;
      ledger.canvases.push(d.canvas_id as string);
      await seedDraftContent(owner, d.id as string, d.version_name as string);
    }
    await ownerOnStep4(page, owner, ev.slug, ev.id);
    if (route === 'a-continue-draft') {
      await page.getByRole('button', { name: 'Continue your draft' }).click();
    } else {
      await page.getByRole('button', { name: 'Create your canvas' }).click();
    }
    await expect(page).toHaveURL(/\/p\/.+\/canvas\//, { timeout: 90_000 });
    if (route === 'b-create') {
      const d = (await openDraftOf(owner))!;
      ledger.canvases.push(d.canvas_id as string);
      await seedDraftContent(owner, d.id as string, d.version_name as string);
      await page.reload(); // the real Create makes an EMPTY draft (no model here): reload so the page reads the seeded content; history state survives a reload
    }
    log(`${route}: workspace url ${page.url()} state=${JSON.stringify(await page.evaluate(() => history.state?.usr ?? null))}`);
    await publishAndRecord(page, `${route}-${width}`, ev.slug);
  });
}
