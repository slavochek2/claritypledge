/**
 * @file p1536-x10-x11.spec.ts
 * @description P1536 3c X10 + X11 (S3c.7, S3c.8, S3c.15), driven in a real Chromium on hosted TEST at 1440 and 375, as a signed-in TEST owner.
 *
 * Fixture (RPCs and service-role points; the drafting model is not under test and is not called):
 *   canvas 1: a new canvas, published as v1
 *   thread A: Clone v1 -> published as v2        (2 replies)
 *   thread B: Clone v1 -> discarded              (1 reply)
 *   thread C: Clone v1 -> still OPEN             (2 replies)   [so A's View is checked while another draft is open]
 *   canvas 2's root: the new canvas's own root, published v1 (no replies)
 *
 * Asserts (recorded, then soft-failed): each card's state, tag, button and address; the "N replies" link (singular, hidden at 0); the open draft's link
 * lands on the workspace with the thread showing; a published / discarded link opens the chat's own panel in place with the closed line and no
 * composer, upload or voice; the Publish reply's Open canvas goes to the version that thread's draft became.
 * Refuses to load against anything but a TEST project.
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, TEST_PASSWORD } from './helpers/test-user';
import { isTestProjectUrl } from '../scripts/sweep-e2e-test-users';

if (!isTestProjectUrl(process.env.VITE_SUPABASE_URL ?? '')) throw new Error('p1536-x10-x11: VITE_SUPABASE_URL is not a TEST project. Nothing was run.');

const BASE = process.env.P1536_BASE ?? 'http://localhost:5102';
const DIR = process.env.P1536_X10_DIR ?? 'test-results/p1536-x10-x11';
fs.mkdirSync(DIR, { recursive: true });
const RESULTS = `${DIR}/results.jsonl`;
test.use({ baseURL: BASE, actionTimeout: 20_000 });
test.setTimeout(300_000);

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

async function ownerApi(email: string) {
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

/** A draft cloned from `baseVersionId`: opened by the RPC, the base's points tagged for it (what the first Send does), and one new point so it differs. */
async function cloneOf(api: SupabaseClient, ownerId: string, baseVersionId: string, extra: string): Promise<DraftRow> {
  const { data: base } = await supabaseAdmin.from('canvas_versions').select('name').eq('id', baseVersionId).single();
  const { error } = await api.rpc('canvas_draft_open', { p_from_version: baseVersionId });
  if (error) throw new Error(`canvas_draft_open from base: ${error.message}`);
  const row = (await supabaseAdmin.from('canvas_drafts').select(COLS).eq('owner_id', ownerId).eq('state', 'open').eq('base_version_id', baseVersionId).order('created_at', { ascending: false }).limit(1).maybeSingle()).data as DraftRow;
  const { data: pts } = await supabaseAdmin.from('points').select('id,system_tags').eq('first_validator_id', ownerId).contains('system_tags', [`canvas_${base!.name}`]);
  for (const pt of pts ?? []) {
    const { error: e } = await supabaseAdmin.from('points').update({ system_tags: [...(pt.system_tags as string[]), `canvas_${row.version_name}`] }).eq('id', pt.id);
    if (e) throw new Error(`tag base point: ${e.message}`);
  }
  await seedPoints(ownerId, row.id, row.version_name, [['canvas:channels', `${extra} (SEEDED)`]]);
  return row;
}

async function reply(ownerId: string, d: DraftRow, body: string) {
  const { error } = await supabaseAdmin.from('chat_messages').insert({ conversation_id: d.conversation_id, author_id: ownerId, body, thread_root_id: d.thread_root_id, kind: 'message' });
  if (error) throw new Error(`reply: ${error.message}`);
}

test('X10 + X11: the mirror chat card by thread state, "N replies", the open draft and the closed panel', async ({ browser }) => {
  const user = await createTestUser({ name: 'P1536 X10X11' });
  const ownerId = user.user.id;
  try {
    const api = await ownerApi(user.email);
    // canvas 1: new canvas, published v1
    const o = await api.rpc('canvas_draft_open', { p_from_version: null });
    if (o.error) throw new Error(`open: ${o.error.message}`);
    const d1 = (await supabaseAdmin.from('canvas_drafts').select(COLS).eq('owner_id', ownerId).eq('state', 'open').limit(1).maybeSingle()).data as DraftRow;
    await seedPoints(ownerId, d1.id, d1.version_name, [['canvas:segments', 'Office managers at companies with 20 to 200 staff (SEEDED)'], ['canvas:problem', 'Offices order catering late (SEEDED)']]);
    const pub1 = await api.rpc('canvas_draft_publish', { p_draft: d1.id, p_expected_revision: d1.revision });
    if (pub1.error) throw new Error(`publish v1: ${pub1.error.message}`);
    const path = `/p/${user.slug}/canvas/${d1.canvas_name}`;
    const v1 = d1.version_id;

    // A: clone, published as v2.  B: clone, discarded.  C: clone, open.
    const A = await cloneOf(api, ownerId, v1, 'A: direct emails');
    const pubA = await api.rpc('canvas_draft_publish', { p_draft: A.id, p_expected_revision: A.revision });
    if (pubA.error) throw new Error(`publish A: ${pubA.error.message}`);
    const B = await cloneOf(api, ownerId, v1, 'B: a thing');
    const disB = await api.rpc('canvas_draft_discard', { p_draft: B.id, p_expected_revision: B.revision });
    if (disB.error) throw new Error(`discard B: ${disB.error.message}`);
    const C = await cloneOf(api, ownerId, v1, 'C: partnerships');
    await reply(ownerId, A, 'a note in A 1'); await reply(ownerId, A, 'a note in A 2');
    await reply(ownerId, B, 'a note in B');
    await reply(ownerId, C, 'a note in C 1'); await reply(ownerId, C, 'a note in C 2');
    // canvas 2: a brand-new canvas whose draft is open: its root has no reply (no link) and attaches its own draft's version
    const o2 = await api.rpc('canvas_draft_open', { p_from_version: null });
    if (o2.error) throw new Error(`open canvas 2: ${o2.error.message}`);
    const D = (await supabaseAdmin.from('canvas_drafts').select(COLS).eq('owner_id', ownerId).eq('state', 'open').is('base_version_id', null).order('created_at', { ascending: false }).limit(1).maybeSingle()).data as DraftRow;
    const rootOf = new Map([['A', A.thread_root_id], ['B', B.thread_root_id], ['C', C.thread_root_id], ['canvas1', d1.thread_root_id], ['D', D.thread_root_id]]);
    const rootA = (await supabaseAdmin.from('chat_messages').select('attachment_id').eq('id', A.thread_root_id).single()).data;
    rec(0, 'fixture: a clone\'s root attaches the BASE version', rootA?.attachment_id === v1, `A root attachment_id=${rootA?.attachment_id} base v1=${v1} A own version=${A.version_id}`);

    for (const [vp, height, touch] of [[1440, 900, false], [375, 812, true]] as const) {
      const ctx = await browser.newContext({ viewport: { width: vp, height }, baseURL: BASE, ...(touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
      await ctx.addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('response', (r) => { if (r.status() >= 400 && !/auth\/v1\/health/.test(r.url())) errors.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 120)}`); });
      try {
        await setTestSession(page, user.email);
        const chat = `/chats/c/${A.conversation_id}`;
        await page.goto(chat);
        await expect.poll(async () => page.getByTestId('attachment-canvas_version').count(), { timeout: 40_000, intervals: [500] }).toBeGreaterThanOrEqual(5);
        await expect.poll(async () => page.getByTestId('canvas-version-state').filter({ hasText: /\w/ }).count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(5);
        await page.waitForTimeout(1500);

        // which card is which: by its place in the chat (creation order: canvas1 root, A, B, C)
        const cards = page.getByTestId('attachment-canvas_version');
        // the "N replies" link of the message that holds a given thread's card (a published thread gets the Publish reply too, so counts include it)
        const cardRows = page.getByTestId('message').filter({ has: page.getByTestId('attachment-canvas_version') });
        const rowOf = (n: number) => cardRows.nth(n);
        const linkOf = (n: number) => rowOf(n).getByTestId('replies-link');
        const inPanel = (id: string) => page.getByTestId('thread-panel').getByTestId(id);
        const info = await cards.evaluateAll((els) => els.map((e) => ({
          state: e.getAttribute('data-state'),
          text: (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
          tag: !!e.querySelector('[data-testid="canvas-draft-tag"]'),
          links: [...e.querySelectorAll('a')].map((a) => ({ text: a.textContent?.trim(), href: a.getAttribute('href') })),
        })));
        const f1 = await shot(page, vp, 'mirror-chat-cards');
        rec(vp, 'five cards (canvas 1 root, A, B, C, canvas 2 root)', info.length === 5, JSON.stringify(info), f1);
        const [c0, cA, cB, cC, cD] = info;
        rec(vp, 'canvas 2\'s root (a new canvas, open draft): the (Draft) tag, v1, Open draft', cD?.state === 'draft' && cD.tag && /v1/.test(cD.text) && cD.links[0]?.text === 'Open draft', JSON.stringify(cD), f1);
        rec(vp, 'canvas 1\'s own root (a published v1, no draft left): "v1 · date", View, no tag, no state word', c0?.state === 'published' && !c0.tag && /^Canvas.*v1 · /.test(c0.text) && !/Published|Draft/.test(c0.text) && c0.links[0]?.text === 'View', JSON.stringify(c0), f1);
        rec(vp, 'S3c.7 A (clone, published as v2): reads "v2 · date", View goes to A\'s version with NO ws=1, while C is open', cA?.state === 'published' && !cA.tag && /v2 · /.test(cA.text) && cA.links[0]?.text === 'View' && cA.links[0].href === `${path}?v=${A.version_name}` && !cA.links[0].href?.includes('ws=1'), JSON.stringify(cA), f1);
        rec(vp, 'S3c.7 B (clone, discarded): says Discarded draft, no button, no tag', cB?.state === 'discarded' && /Discarded draft/.test(cB.text) && cB.links.length === 0 && !cB.tag, JSON.stringify(cB), f1);
        rec(vp, 'S3c.7 C (clone, open): the (Draft) tag, v3, Open draft going to the workspace', cC?.state === 'draft' && cC.tag && /v3/.test(cC.text) && cC.links[0]?.text === 'Open draft' && cC.links[0].href === `${path}?v=${C.version_name}&ws=1`, JSON.stringify(cC), f1);

        // "N replies" links, by message
        const linkTexts = async () => Promise.all([0, 1, 2, 3, 4].map(async (n) => (await linkOf(n).count()) === 0 ? null : ((await linkOf(n).textContent()) ?? '').replace(/^[A-Z]+(?=\d)/, '').trim()));
        const links = await linkTexts();
        rec(vp, 'S3c.8 "N replies": canvas 1 root 1 (its Publish reply), A 3 (2 + Publish reply), B 1 (singular), C 2, canvas 2 root none (0 replies, hidden)', JSON.stringify(links) === JSON.stringify(['1 reply', '3 replies', '1 reply', '2 replies', null]), `links=${JSON.stringify(links)}`, f1);

        // published A: opens the chat's own panel in place
        await linkOf(1).click();
        const closed = page.getByTestId('canvas-closed-line');
        await closed.waitFor({ timeout: 20_000 });
        await page.waitForTimeout(800);
        const panelA = {
          url: new URL(page.url()).pathname,
          line: ((await closed.textContent()) ?? '').trim(),
          open: await page.getByTestId('canvas-closed-open').getAttribute('href'),
          composer: await inPanel('composer').count(),
          textbox: await page.getByTestId('thread-panel').getByRole('textbox').count(),
          upload: await inPanel('canvas-upload').count(),
          voice: await page.getByTestId('thread-panel').getByRole('button', { name: /voice|record/i }).count(),
          replies: await page.getByTestId('thread-panel').getByText(/a note in A/).count(),
          overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
        };
        const fA = await shot(page, vp, 'published-thread-in-place');
        rec(vp, 'S3c.8 published thread opens in place (still the chat\'s route), history shown, closed line "Published as v2." + Open canvas (no ws=1), no composer / upload / voice',
          panelA.url.startsWith('/chats/c/') && panelA.line.startsWith('Published as v2.') && panelA.open === `${path}?v=${A.version_name}` && panelA.composer === 0 && panelA.textbox === 0 && panelA.upload === 0 && panelA.voice === 0 && panelA.replies >= 2 && !panelA.overflow, JSON.stringify(panelA), fA);
        const replyOpen = page.getByTestId('publish-reply-open');
        const replyOpenHref = await replyOpen.getAttribute('href', { timeout: 10_000 }).catch(() => null);
        rec(vp, 'S3c.15 the Publish reply ("Published v2.") carries Open canvas to the version this thread\'s draft became (v2, not the base v1), no ws=1', replyOpenHref === `${path}?v=${A.version_name}`, `href=${replyOpenHref} v1=${d1.version_name}`, fA);
        // S3c.15: Open canvas from the closed line goes to that version, no ws
        await page.getByTestId('canvas-closed-open').click();
        await expect.poll(() => page.url(), { timeout: 20_000 }).toContain(`v=${A.version_name}`);
        rec(vp, 'S3c.15 Open canvas (closed line) lands on the published version with no ws=1', !page.url().includes('ws=1'), page.url());
        await shot(page, vp, 'open-canvas-published-v2');

        // discarded B
        await page.goto(chat);
        await expect.poll(async () => page.getByTestId('attachment-canvas_version').count(), { timeout: 40_000, intervals: [500] }).toBeGreaterThanOrEqual(5);
        await expect(linkOf(2)).toBeVisible({ timeout: 30_000 });
        await linkOf(2).click();
        await closed.waitFor({ timeout: 20_000 });
        await page.waitForTimeout(800);
        const panelB = { line: ((await closed.textContent()) ?? '').trim(), button: await page.getByTestId('canvas-closed-open').count(), composer: await inPanel('composer').count(), url: new URL(page.url()).pathname };
        const fB = await shot(page, vp, 'discarded-thread-in-place');
        rec(vp, 'S3c.8 discarded thread opens in place: "This draft was discarded.", no button, no composer', panelB.url.startsWith('/chats/c/') && panelB.line === 'This draft was discarded.' && panelB.button === 0 && panelB.composer === 0, JSON.stringify(panelB), fB);

        // open draft C: the workspace, thread showing
        await page.goto(chat);
        await expect.poll(async () => page.getByTestId('attachment-canvas_version').count(), { timeout: 40_000, intervals: [500] }).toBeGreaterThanOrEqual(5);
        await expect(linkOf(3)).toBeVisible({ timeout: 30_000 });
        await linkOf(3).click();
        await expect.poll(() => page.url(), { timeout: 30_000 }).toContain('ws=1');
        await expect.poll(async () => (await page.getByTestId('thread-panel').innerText().catch(() => '')).includes('a note in C 1'), { timeout: 20_000, intervals: [400] }).toBe(true).catch(() => undefined); // the replies load after the panel mounts
        const ws = await page.evaluate(() => {
          const vis = (id: string) => { const e = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null; if (!e) return false; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && r.right > 0 && r.left < innerWidth; };
          const sw = document.querySelector('[data-testid="workspace-view-chat"]');
          return { url: location.pathname + location.search, composer: vis('composer'), thread: vis('thread-panel'), threadTab: sw?.getAttribute('aria-selected') === 'true' || sw?.getAttribute('data-state') === 'active', switcher: vis('workspace-view-switch'), replies: document.body.innerText.includes('a note in C 1') };
        });
        const fC = await shot(page, vp, 'open-draft-workspace-thread');
        rec(vp, `S3c.8 open draft's link lands on the workspace with the thread showing (${vp >= 1280 ? 'panel open' : 'Thread tab selected'})`,
          ws.url.includes(`v=${C.version_name}`) && ws.url.includes('ws=1') && ws.thread && ws.composer && ws.replies && (vp >= 1280 || ws.threadTab), JSON.stringify(ws), fC);

        // the old address of an open draft still redirects; published / discarded stay readable
        await page.goto(`/chats/c/${A.conversation_id}/t/${rootOf.get('C')}`);
        await expect.poll(() => page.url(), { timeout: 30_000 }).toContain('ws=1');
        rec(vp, 'S3c.8 an open draft\'s old thread address still redirects to its workspace', page.url().includes(`v=${C.version_name}`), page.url());
        await page.goto(`/chats/c/${A.conversation_id}/t/${rootOf.get('A')}`);
        await closed.waitFor({ timeout: 30_000 });
        rec(vp, 'S3c.8 a published thread\'s old address stays readable (no redirect)', page.url().includes(`/t/${rootOf.get('A')}`), page.url());
        await page.goto(`/chats/c/${A.conversation_id}/t/${rootOf.get('B')}`);
        await closed.waitFor({ timeout: 30_000 });
        rec(vp, 'S3c.8 a discarded thread\'s old address stays readable (no redirect)', page.url().includes(`/t/${rootOf.get('B')}`), page.url());

        rec(vp, 'no page error and no HTTP >= 400 during the walk', errors.length === 0, JSON.stringify(errors.slice(0, 6)));
      } finally {
        await ctx.close().catch(() => undefined);
      }
    }
    // ---- review fix 1, in the real browser: published ELSEWHERE while the mirror chat stays mounted (1440)
    {
      const vp = 1440;
      const ctx = await browser.newContext({ viewport: { width: vp, height: 900 }, baseURL: BASE });
      await ctx.addInitScript(() => { try { localStorage.setItem('letter_intensity_preview_seen_at_v2', String(Date.now())); } catch { /* none */ } });
      const page = await ctx.newPage();
      const requests: string[] = [];
      page.on('request', (r) => { if (/\/rest\/v1\/(canvas_drafts|profiles)|list_my_canvas_versions/.test(r.url())) requests.push(`${r.method()} ${r.url().split('/rest/v1/')[1]?.slice(0, 60) ?? r.url().slice(-40)}`); });
      try {
        await setTestSession(page, user.email);
        const chat = `/chats/c/${A.conversation_id}`;
        await page.goto(chat);
        const cardRows = page.getByTestId('message').filter({ has: page.getByTestId('attachment-canvas_version') });
        await expect.poll(async () => cardRows.count(), { timeout: 40_000, intervals: [500] }).toBeGreaterThanOrEqual(5);
        await expect(cardRows.nth(3).getByTestId('replies-link')).toBeVisible({ timeout: 30_000 });
        await expect(cardRows.nth(3).getByTestId('canvas-draft-tag')).toBeVisible();
        // C is published in "another tab" (RPC); this page sees no signal. The tap reads the current state: the chat's own panel, not the workspace.
        const cRev = (await supabaseAdmin.from('canvas_drafts').select('revision').eq('id', C.id).single()).data!.revision as number;
        const pubC = await api.rpc('canvas_draft_publish', { p_draft: C.id, p_expected_revision: cRev });
        if (pubC.error) throw new Error(`publish C elsewhere: ${pubC.error.message}`);
        await cardRows.nth(3).getByTestId('replies-link').click();
        await page.getByTestId('canvas-closed-line').waitFor({ timeout: 20_000 });
        await page.waitForTimeout(600);
        const fT = await shot(page, vp, 'tap-after-published-elsewhere');
        rec(vp, 'item 1 click safety: C was published elsewhere; the link still drawn for an open draft, the TAP opens the chat\'s own panel (closed line "Published as v3."), not the workspace',
          /\/chats\/c\//.test(new URL(page.url()).pathname) && !page.url().includes('ws=1') && ((await page.getByTestId('canvas-closed-line').textContent()) ?? '').startsWith('Published as v3.'), page.url(), fT);
        // D (canvas 2) is published elsewhere; the page learns when the tab comes back (visibilitychange), and its card reads published
        await page.goto(chat);
        await expect.poll(async () => cardRows.count(), { timeout: 40_000, intervals: [500] }).toBeGreaterThanOrEqual(5);
        await expect(cardRows.nth(4).getByTestId('canvas-draft-tag')).toBeVisible({ timeout: 30_000 });
        await seedPoints(ownerId, D.id, D.version_name, [['canvas:segments', 'Founders of small agencies (SEEDED)']]);
        const dRev = (await supabaseAdmin.from('canvas_drafts').select('revision').eq('id', D.id).single()).data!.revision as number;
        const pubD = await api.rpc('canvas_draft_publish', { p_draft: D.id, p_expected_revision: dRev });
        if (pubD.error) throw new Error(`publish D elsewhere: ${pubD.error.message}`);
        const before = requests.length;
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await expect.poll(async () => cardRows.nth(4).getByTestId('canvas-draft-tag').count(), { timeout: 20_000, intervals: [400] }).toBe(0);
        const fD = await shot(page, vp, 'card-after-tab-return');
        const dText = ((await cardRows.nth(4).getByTestId('attachment-canvas_version').innerText()) ?? '').replace(/\s+/g, ' ');
        rec(vp, 'item 1: D was published elsewhere; the tab returns; the mounted card reads published (View, no tag) without a reload', /v1 · /.test(dText) && (await cardRows.nth(4).getByRole('link', { name: /^View/ }).count()) === 1, `${dText}; requests after the signal=${requests.length - before} (${requests.slice(before).join(' | ')})`, fD);
      } finally {
        await ctx.close().catch(() => undefined);
      }
    }
  } finally {
    await deleteTestUser(ownerId).catch((e) => rec(0, 'cleanup: delete user', false, String(e)));
  }
});
