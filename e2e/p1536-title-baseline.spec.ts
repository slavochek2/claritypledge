/**
 * @file p1536-title-baseline.spec.ts
 * @description P1536 section 3c, build step 0: how many characters of the canvas title a person can SEE, per width and view.
 *
 * One fixed title, long enough to be cut at every width: "Acme Bakery Plan for the Northern Region" (40 characters). Default
 * browser font, zoom 100%. Two views of an owner who has a published v1 and an open draft from it: the draft view
 * (`?v=<draft>&ws=1`) and the published view (`?v=<v1>`). The fixture (a published v1, a draft from it, renamed) is made by RPCs and
 * service-role points, as in `p1536-walkthrough.spec.ts` (`widthsWalk`); it is not the thing under test.
 *
 * "Visible characters" is NOT string length: every character of the title gets its own Range rect, and a character counts only when
 * that rect lies inside the title's visible box (its own box, clipped by every ancestor that clips, and by the viewport's right edge;
 * when the text is cut by an ellipsis, the ellipsis's own width is taken off the right edge, since the characters under it are hidden).
 *
 * CONTROLS (run through the identical probe, in the same page, before any number is trusted):
 *   known-bad  a 90px clipped box of a known text must read under its length and above 0;
 *   known-good an unclipped box of the same text must read all of it;
 *   and, when RECORDING, at least one measured cell must be cut (visible < total), or the probe is blind to the real title. Compare mode
 *   does not require a cut: a header that shows every character at every width is a better result than the baseline.
 *
 * Two modes:
 *   record   (default)           measures, prints the table, writes DIR/measured.json. Asserts only the controls.
 *   compare  P1536_COMPARE=1     the same measurement after the header change; asserts, per cell, visible >= BASELINE (S3c.10:
 *                                "the fixed title shows no fewer characters than step 0's baseline at any width").
 *
 *   P1536_BASE=http://localhost:5102 P1536_BASELINE_DIR=<abs dir> npx playwright test e2e/p1536-title-baseline.spec.ts --project=chromium
 *
 * The measured element is `[data-testid="canvas-title"]`: later steps must keep that hook on the fixed title.
 */
import { test, expect, type Page, type Browser } from '@playwright/test';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, TEST_PASSWORD } from './helpers/test-user';
import { isTestProjectUrl } from '../scripts/sweep-e2e-test-users';

import { pacLaunchOptions } from './helpers/pac-launch';

test.skip(!isTestProjectUrl(process.env.VITE_SUPABASE_URL ?? ''), 'p1536-title-baseline: VITE_SUPABASE_URL is not a TEST project. Nothing was run.');
test.use({ launchOptions: pacLaunchOptions() }); // P1536_PAC: send the hosted TEST host through a proxy auto-config file; unset, the project's own options

const BASE = process.env.P1536_BASE ?? 'http://localhost:5101';
const COMPARE = process.env.P1536_COMPARE === '1';
const DIR = process.env.P1536_BASELINE_DIR ?? (COMPARE ? '.private/evidence/p1536-s3c/compare' : '.private/evidence/p1536-s3c/baseline');
fs.mkdirSync(DIR, { recursive: true });

test.use({ baseURL: BASE, actionTimeout: 20_000 });

const TITLE = 'Acme Bakery Plan for the Northern Region';
const WIDTHS = [1440, 1280, 1279, 1024, 768, 390, 375, 320];
/** Phone widths use a touch, mobile-emulated context (overlay scrollbars), as `renameWidths` does for w <= 641. */
const isPhone = (w: number) => w <= 641;
const VIEWS = ['draft', 'published'] as const;
type View = (typeof VIEWS)[number];

/**
 * The stored baseline (step 0): visible characters of TITLE (40 characters) per view and width, measured on commit
 * 738418664fd844392ac38016d840b979df71aa4f, before the header change. The same table is in the spec, section 3c "Baseline".
 * `null` would make compare mode fail loudly rather than pass on nothing.
 */
const BASELINE: Record<View, Record<number, number>> | null = {
  draft: { 1440: 40, 1280: 40, 1279: 40, 1024: 40, 768: 40, 390: 7, 375: 5, 320: 3 },
  published: { 1440: 40, 1280: 40, 1279: 40, 1024: 40, 768: 40, 390: 12, 375: 10, 320: 7 },
};

/** Source of the probe. It runs in the page; the controls call this very function on synthetic elements. */
const PROBE_SRC = `(el) => {
  const cs = getComputedStyle(el);
  const er = el.getBoundingClientRect();
  if (cs.display === 'none' || cs.visibility === 'hidden' || er.width === 0 || er.height === 0) return { shown: false, total: (el.textContent || '').length, visible: 0 };
  // the visible box: the element's own box, clipped by every ancestor that clips, and by the viewport's right edge
  let L = er.left, R = er.right, T = er.top, B = er.bottom;
  for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
    const pcs = getComputedStyle(p);
    if (pcs.overflowX !== 'visible' || pcs.overflowY !== 'visible') {
      const pr = p.getBoundingClientRect();
      if (pcs.overflowX !== 'visible') { L = Math.max(L, pr.left); R = Math.min(R, pr.right); }
      if (pcs.overflowY !== 'visible') { T = Math.max(T, pr.top); B = Math.min(B, pr.bottom); }
    }
  }
  R = Math.min(R, window.innerWidth);
  L = Math.max(L, 0);
  // own clipping: overflow on the element itself (truncate) clips to its own box, which L/R already are; an ellipsis hides what it covers
  const cut = el.scrollWidth > el.clientWidth + 1;
  let ellW = 0;
  if (cut && cs.textOverflow === 'ellipsis') {
    const s = document.createElement('span');
    s.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:' + cs.font + ';letter-spacing:' + cs.letterSpacing;
    s.textContent = '\\u2026';
    document.body.appendChild(s);
    ellW = s.getBoundingClientRect().width;
    s.remove();
  }
  const right = R - ellW;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let total = 0, visible = 0, n;
  while ((n = walker.nextNode())) {
    const t = n.textContent || '';
    for (let i = 0; i < t.length; i++) {
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
      const c = r.getBoundingClientRect(); total++;
      if (c.width > 0 && c.left >= L - 0.5 && c.right <= right + 0.5 && c.top >= T - 1 && c.bottom <= B + 1) visible++;
    }
  }
  return { shown: true, total, visible, boxW: Math.round(er.width * 10) / 10, boxLeft: Math.round(er.left * 10) / 10, cut, ellipsis: cs.textOverflow === 'ellipsis', ellW: Math.round(ellW * 10) / 10, font: cs.fontSize + ' ' + cs.fontWeight + ' ' + cs.fontFamily.split(',')[0] };
}`;

interface Probe { shown: boolean; total: number; visible: number; boxW?: number; boxLeft?: number; cut?: boolean; ellipsis?: boolean; ellW?: number; font?: string }

async function probeTitle(page: Page): Promise<Probe & { innerWidth: number; scrollWidth: number; text: string }> {
  return page.evaluate((src) => {
    const el = document.querySelector('[data-testid="canvas-title"]') as HTMLElement | null;
    const fn = (0, eval)(src) as (e: Element) => unknown;
    const base = { innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth };
    if (!el) return { ...base, shown: false, total: 0, visible: 0, text: '' };
    return { ...base, ...(fn(el) as object), text: (el.textContent ?? '') } as never;
  }, PROBE_SRC);
}

const CONTROL_TEXT = '0123456789 0123456789 0123456789 012345';

/** Known-bad and known-good elements, measured by the identical probe in the same page. */
async function controls(page: Page): Promise<{ bad: Probe; good: Probe }> {
  return page.evaluate(({ src, text }) => {
    const fn = (0, eval)(src) as (e: Element) => Probe;
    const mk = (css: string) => {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;font:16px sans-serif;background:#fff;' + css;
      d.textContent = text;
      document.body.appendChild(d);
      return d;
    };
    const bad = mk('width:90px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;');
    const good = mk('white-space:nowrap;');
    const out = { bad: fn(bad), good: fn(good) };
    bad.remove(); good.remove();
    return out;
  }, { src: PROBE_SRC, text: CONTROL_TEXT });
}

async function ownerApi(email: string): Promise<SupabaseClient> {
  const api = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await api.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`owner sign-in failed: ${error?.message}`);
  return api;
}

/** Two requests for any number of points (metered-services rule 1): one insert of the points, one insert of their ledger rows. */
async function seedDraftPoints(ownerId: string, draftId: string, versionName: string, items: Array<[string, string]>) {
  const { data, error } = await supabaseAdmin.from('points').insert(items.map(([box, statement]) => ({
    statement, first_validator_id: ownerId, visibility: 'private', tags: [], system_tags: [box, `canvas_${versionName}`],
  }))).select('id');
  if (error || !data || data.length !== items.length) throw new Error(`seed points: ${error?.message ?? 'wrong row count'}`);
  const { error: e2 } = await supabaseAdmin.from('canvas_draft_points').insert(data.map((r) => ({ draft_id: draftId, point_id: r.id })));
  if (e2) throw new Error(`seed draft points: ${e2.message}`);
}
const SEED_FIRST: Array<[string, string]> = [
  ['canvas:segments', 'Office managers at companies with 20 to 200 staff in Tallinn (SEEDED)'],
  ['canvas:problem', 'Offices order catering late and get cold, generic food (SEEDED)'],
  ['canvas:solution', 'A weekly standing order delivered fresh at 9am (SEEDED)'],
  ['canvas:revenue', '12 euros per person per week (SEEDED)'],
  ['canvas:metrics', 'Ten office customers signed by March (SEEDED)'],
];

/** A published v1 and an open draft from it (the draft holds v1's points, from the opener, plus one more), renamed TITLE. */
async function fixture(email: string, ownerId: string) {
  const api = await ownerApi(email);
  const { data: opened, error } = await api.rpc('canvas_draft_open', { p_from_version: null });
  if (error) throw new Error(`canvas_draft_open: ${error.message}`);
  const name = (opened as { canvas_name: string }).canvas_name;
  const d1 = (await supabaseAdmin.from('canvas_drafts').select('id,version_name,version_id,revision,canvas_id').eq('owner_id', ownerId).eq('state', 'open').limit(1).maybeSingle()).data!;
  await seedDraftPoints(ownerId, d1.id, d1.version_name, SEED_FIRST);
  const pub = await api.rpc('canvas_draft_publish', { p_draft: d1.id, p_expected_revision: d1.revision });
  if (pub.error) throw new Error(`publish: ${pub.error.message}`);
  // the draft from v1: the opener starts it as its base (B5), so it already holds v1's points; assert that instead of tagging them by hand
  const { error: oe } = await api.rpc('canvas_draft_open', { p_from_version: d1.version_id });
  if (oe) throw new Error(`canvas_draft_open from v1: ${oe.message}`);
  const draft = (await supabaseAdmin.from('canvas_drafts').select('id,version_name').eq('owner_id', ownerId).eq('state', 'open').eq('base_version_id', d1.version_id).limit(1).maybeSingle()).data!;
  const held = await supabaseAdmin.from('points').select('id', { count: 'exact', head: true }).eq('first_validator_id', ownerId).contains('system_tags', [`canvas_${draft.version_name}`]);
  if (held.count !== SEED_FIRST.length) throw new Error(`the draft opened from v1 holds ${held.count} points, expected ${SEED_FIRST.length}: B5 is not applied on this database`);
  await seedDraftPoints(ownerId, draft.id, draft.version_name, [['canvas:channels', 'Direct emails to office managers (SEEDED)']]);
  const ren = await api.rpc('canvas_rename', { p_canvas: d1.canvas_id, p_title: TITLE });
  if (ren.error) throw new Error(`rename: ${ren.error.message}`);
  return { name, publishedVersion: d1.version_name as string, draftVersion: draft.version_name as string };
}

/** Re-measure until two reads 400ms apart agree (fonts loaded, data arrived, layout settled). */
async function measureStable(page: Page, view: View, w: number) {
  try {
    await expect.poll(async () => (await probeTitle(page)).text, { timeout: 40_000, intervals: [300] }).toBe(TITLE);
    await expect(page.getByTestId('publish-spot')).toBeVisible({ timeout: 30_000 });
  } catch (e) {
    // the page the failure is about, not Playwright's blank default page
    await page.screenshot({ path: `${DIR}/FAILED-${view}-${w}.png` }).catch(() => undefined);
    throw new Error(`[${view} ${w}] the page never showed the fixed title (${page.url()}): ${(e as Error).message.split('\n')[0]}`);
  }
  await page.evaluate(() => document.fonts.ready.then(() => true));
  let prev = '';
  let cur = await probeTitle(page);
  for (let i = 0; i < 25; i++) {
    prev = JSON.stringify(cur);
    await page.waitForTimeout(400);
    cur = await probeTitle(page);
    if (JSON.stringify(cur) === prev) break;
  }
  expect(cur.innerWidth, `[${view} ${w}] the resize took effect (window.innerWidth)`).toBe(w);
  return cur;
}

async function viewPage(browser: Browser, email: string, w: number) {
  const phone = isPhone(w);
  const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 800 : 900 }, baseURL: BASE, ...(phone ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
  await ctx.addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } });
  const page = await ctx.newPage();
  await setTestSession(page, email);
  return { ctx, page };
}

test('P1536 step 0: visible characters of the fixed title, per width and view', async ({ browser }) => {
  test.setTimeout(480_000);
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const user = await createTestUser({ name: 'P1536 Title Baseline' });
  const measured: Record<View, Record<number, Probe & { innerWidth: number }>> = { draft: {}, published: {} };
  let controlsDone = false;
  try {
    const fx = await fixture(user.email, user.user.id);
    const path = `/p/${user.slug}/canvas/${fx.name}`;
    for (const w of WIDTHS) {
      const { ctx, page } = await viewPage(browser, user.email, w);
      try {
        for (const view of VIEWS) {
          await page.goto(view === 'draft' ? `${path}?v=${fx.draftVersion}&ws=1` : `${path}?v=${fx.publishedVersion}`);
          const m = await measureStable(page, view, w);
          measured[view][w] = m;
          await page.screenshot({ path: `${DIR}/${view}-${w}.png` });
          if (!controlsDone) {
            const c = await controls(page);
            expect(c.good, 'CONTROL known-good: an unclipped box reads every character of its text').toMatchObject({ shown: true, total: CONTROL_TEXT.length, visible: CONTROL_TEXT.length });
            expect(c.bad.visible, `CONTROL known-bad: a 90px clipped box reads under ${CONTROL_TEXT.length} (got ${JSON.stringify(c.bad)})`).toBeLessThan(CONTROL_TEXT.length);
            expect(c.bad.visible, 'CONTROL known-bad: and above 0').toBeGreaterThan(0);
            controlsDone = true;
          }
        }
      } finally {
        await ctx.close().catch(() => undefined);
      }
    }

    const rows = WIDTHS.map((w) => `| ${w} | ${measured.draft[w]?.visible ?? 'n/a'} of ${measured.draft[w]?.total ?? 'n/a'} | ${measured.published[w]?.visible ?? 'n/a'} of ${measured.published[w]?.total ?? 'n/a'} |`);
    const table = ['| width | draft view | published view |', '|---|---|---|', ...rows].join('\n');
    console.log(`P1536 title baseline (${COMPARE ? 'compare' : 'record'}) commit ${commit}\n${table}`);
    fs.writeFileSync(`${DIR}/measured.json`, JSON.stringify({ commit, title: TITLE, mode: COMPARE ? 'compare' : 'record', measured }, null, 2));

    // Recording the baseline: the probe must see the real title cut somewhere, or it is blind to it. In compare mode the synthetic controls
    // above are the blindness check, and a header that shows all 40 characters at every width is a better result, not a failure.
    if (!COMPARE) {
      const anyCut = WIDTHS.some((w) => VIEWS.some((v) => measured[v][w] && measured[v][w]!.visible < measured[v][w]!.total));
      expect(anyCut, 'CONTROL: at least one width cuts the real title (a probe that reads the full length everywhere is blind)').toBe(true);
    }
    for (const v of VIEWS) for (const w of WIDTHS) expect(measured[v][w]!.shown && measured[v][w]!.total === TITLE.length, `[${v} ${w}] the title is on screen and complete in the DOM`).toBe(true);

    if (COMPARE) {
      expect(BASELINE, 'compare mode needs the stored BASELINE object filled in by the record run').not.toBeNull();
      for (const v of VIEWS) {
        for (const w of WIDTHS) {
          expect(measured[v][w]!.visible, `S3c.10 [${v} ${w}]: visible ${measured[v][w]!.visible} of ${TITLE.length}, baseline ${BASELINE![v][w]}`).toBeGreaterThanOrEqual(BASELINE![v][w]!);
        }
      }
    }
  } finally {
    await deleteTestUser(user.user.id).catch((e) => console.error('cleanup: delete user failed', e));
  }
});
