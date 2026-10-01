/**
 * P1369 Scope v2 (founder, 2026-09-30, after the phone test) — executable checks, same harness as
 * p1369-offline.spec.ts (production build, service worker, Vercel-like server):
 *
 *   npx playwright test --config e2e/offline/playwright.config.ts e2e/offline/p1369-scope-v2.spec.ts
 *
 *   1  Instant strip: "Offline" within 1 s of the browser reporting no network.
 *   2  No endless loading: a hanging network ends in the cached copy (with the strip) or the
 *      needs-connection body within 6 s — never a spinner.
 *   3  Readable offline once visited: /stake/<tag>, a letter, the feed, /groups, the slides,
 *      the event room.
 *   4  Offline pack: pre-loaded while online and idle, bounded, not repeated within hours; a
 *      pre-loaded stake list opens offline without ever having been visited.
 */
import { test, expect, type Browser, type BrowserContext, type Page, type Request } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint, type TestPoint } from '../helpers/test-point';
import { createTestStory, deleteTestStory, type TestStory } from '../helpers/test-story';
import { createTestLetter, createTestStorySnapshot, sealTestLetter, deleteTestLetter } from '../helpers/test-letter';
import { createTestOrganization, deleteTestOrganization, type TestOrganization } from '../helpers/test-organization';
import { createTestEvent, deleteTestEvent, type TestEvent } from '../helpers/test-event';
import {
  NEEDS_CONNECTION,
  STRIP_CACHED,
  cachedUrls,
  deploy,
  goOffline,
  gotoOffline,
  newAppContext,
  setServerDown,
  signIn,
  visitOnline,
  warmServiceWorker,
} from './harness';

const RUN = Date.now();
const SUPABASE = /\.supabase\.co\//;
const SUPABASE_DATA = /\.supabase\.co\/(rest|functions)\//;
const STRIP = /^Offline/;
const PACK_KEY_PREFIX = 'clarity-offline-pack:';

const TAG = `p1369v2${RUN}`;
let author: TestUser;
let point: TestPoint;
let cmp7Point: TestPoint;
let story: TestStory;
let letterId: string;
let docId: string;
let org: TestOrganization;
let event: TestEvent;
const LETTER_TEXT = `P1369 v2 letter story ${RUN}`;

test.beforeAll(async () => {
  author = await createTestUser({ name: 'P1369 v2 Author' });
  point = await createTestPoint(author.user.id, { statement: `P1369 v2 stake point ${RUN}`, tags: [TAG] });
  // A standing-instrument tag, so the offline pack (links-menu entries) covers it.
  cmp7Point = await createTestPoint(author.user.id, { statement: `P1369 v2 cmp7 point ${RUN}`, tags: ['cmp7'] });
  // A position on each: an unstaked point is hidden from /feed and non-standing /stake lists (P543).
  await createTestPosition(point.id, author.user.id, 'agree');
  await createTestPosition(cmp7Point.id, author.user.id, 'agree');
  story = await createTestStory(author.user.id, { content: LETTER_TEXT });

  const { data: doc } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ owner_id: author.user.id, title: `P1369 v2 doc ${RUN}` })
    .select('id')
    .single();
  docId = doc!.id;
  await supabaseAdmin.from('doc_stories').insert({ doc_id: docId, story_id: story.id, position: 0 });
  const letter = await createTestLetter(author.user.id, docId, { mode: 'one-to-many' });
  letterId = letter.id;
  const { data: version } = await supabaseAdmin
    .from('story_versions')
    .select('id')
    .eq('story_id', story.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  await createTestStorySnapshot(letterId, story.id, version!.id, {
    position: 0,
    pointConfig: { storyTitle: undefined, storyText: LETTER_TEXT, points: [] },
  });
  await sealTestLetter(letterId);

  org = await createTestOrganization({ name: `P1369 v2 Group ${RUN}`, slug: `p1369v2-${RUN}` });
  event = await createTestEvent(author.user.id, new Date(Date.now() + 2 * 86400_000), { title: `P1369 v2 event ${RUN}` });
});

test.afterAll(async () => {
  if (event?.id) await deleteTestEvent(event.id);
  if (org?.id) await deleteTestOrganization(org.id);
  if (letterId) await deleteTestLetter(letterId);
  if (docId) {
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
  }
  if (story?.id) await deleteTestStory(story.id);
  for (const p of [point, cmp7Point]) if (p?.id) await deleteTestPoint(p.id);
  if (author?.user?.id) await deleteTestUser(author.user.id);
});

test.beforeEach(() => {
  deploy('a');
  setServerDown(false);
});

async function freshPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await newAppContext(browser);
  // The pack stays off (so "visited" means visited and request counts are clean) until a test
  // calls allowPack().
  await context.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('__p1369_allow_pack')) localStorage.setItem('clarity-offline-pack:disabled', '1');
    } catch {
      /* ignore */
    }
  });
  const page = await context.newPage();
  await warmServiceWorker(page);
  return { context, page };
}

/** A warmed page with the pack still off; `allowPack` switches it on for the next load. */
async function allowPack(page: Page) {
  await page.evaluate((prefix) => {
    sessionStorage.setItem('__p1369_allow_pack', '1');
    for (const k of Object.keys(localStorage)) if (k.startsWith(prefix)) localStorage.removeItem(k);
  }, PACK_KEY_PREFIX);
}

async function packStamp(page: Page): Promise<string | null> {
  return page.evaluate((prefix) => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(prefix) && k !== `${prefix}disabled` && k !== `${prefix}result`) return localStorage.getItem(k);
    }
    return null;
  }, PACK_KEY_PREFIX);
}

// ─── 1. Instant strip ──────────────────────────────────────────────────────

test('1: the strip reads "Offline" within 1 s of the browser going offline', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await visitOnline(page, `/stake/${TAG}`, point.statement);
  await expect(page.getByTestId('offline-strip')).toHaveCount(0);
  const t0 = Date.now();
  await goOffline(context);
  await expect(page.getByTestId('offline-strip')).toHaveText(STRIP, { timeout: 1_000 });
  console.log(`P1369 v2: strip after ${Date.now() - t0} ms`);
  await context.close();
});

// ─── 3. Readable offline once visited ──────────────────────────────────────

test('3a: a visited /stake/<tag> list reopens offline with the strip', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await visitOnline(page, `/stake/${TAG}`, point.statement);
  await goOffline(context);
  await gotoOffline(page, `/stake/${TAG}`);
  await expect(page.getByText(point.statement).first()).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(STRIP_CACHED).first()).toBeVisible();
  await context.close();
});

test('3b: a visited letter reopens offline with the strip', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await visitOnline(page, `/letter/${letterId}`, /open.*letter/i);
  await goOffline(context);
  await gotoOffline(page, `/letter/${letterId}`);
  await expect(page.getByText(/open.*letter/i).first()).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(STRIP_CACHED).first()).toBeVisible();
  await context.close();
});

test('3c: the visited feed first page reopens offline with the strip', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await visitOnline(page, '/feed', cmp7Point.statement);
  await goOffline(context);
  await gotoOffline(page, '/feed');
  await expect(page.getByText(cmp7Point.statement).first()).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(STRIP_CACHED).first()).toBeVisible();
  await context.close();
});

test('3d: the visited groups directory reopens offline with the strip', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await visitOnline(page, '/groups', org.name);
  await goOffline(context);
  await gotoOffline(page, '/groups');
  await expect(page.getByText(org.name).first()).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(STRIP_CACHED).first()).toBeVisible();
  await context.close();
});

test('3e: the slides open offline once fetched (runtime-cached, not in the install precache)', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  // The harness server does not implement Vercel's /presi → /presi/ directory index, so the
  // deck is addressed by its file here.
  await visitOnline(page, '/presi/index.html', /Your team agreed on the strategy/);
  await goOffline(context);
  await gotoOffline(page, '/presi/index.html');
  await expect(page.getByText(/Your team agreed on the strategy/).first()).toBeVisible({ timeout: 8_000 });
  await context.close();
});

test('3f: the event room reopens offline for a registered person — not the register wall, not blank', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await signIn(page, author.email); // the host: always granted
  await visitOnline(page, `/events/${event.slug}/ready`, /Go deep/);
  await goOffline(context);
  await gotoOffline(page, `/events/${event.slug}/room`);
  await expect(page.getByTestId('offline-strip')).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(/Go deep/).or(page.getByText(NEEDS_CONNECTION)).first()).toBeVisible({ timeout: 8_000 });
  await expect(page.getByTestId('room-gate')).toHaveCount(0);
  await context.close();
});

// ─── 2. No endless loading ─────────────────────────────────────────────────

async function expectNoSpinnerWithin(page: Page, ms: number, expected: RegExp | string) {
  const t0 = Date.now();
  await expect(page.getByText(expected).first()).toBeVisible({ timeout: ms });
  return Date.now() - t0;
}

test('2a: Supabase hangs — a visited stake list shows its cached copy within 6 s', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await visitOnline(page, `/stake/${TAG}`, point.statement);
  await context.route(SUPABASE, () => new Promise(() => {}));
  const t0 = Date.now();
  await page.goto(`/stake/${TAG}`);
  await expect(page.getByText(STRIP_CACHED).first()).toBeVisible({ timeout: 6_000 });
  await expect(page.getByText(point.statement).first()).toBeVisible();
  console.log(`P1369 v2: hanging, cached stake after ${Date.now() - t0} ms`);
  await context.close();
});

test('2b: Supabase hangs — a never-visited stake list, letter and groups end in needs-connection within 6 s', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await context.route(SUPABASE, () => new Promise(() => {}));
  for (const url of [`/stake/never${RUN}`, `/letter/${letterId}`, '/groups']) {
    await page.goto(url);
    const took = await expectNoSpinnerWithin(page, 6_000, NEEDS_CONNECTION);
    console.log(`P1369 v2: hanging, ${url} needs-connection after ${took} ms`);
  }
  await context.close();
});

test('2c: Supabase hangs — a visited letter opened by its code shows the cached copy within 6 s', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await visitOnline(page, `/letter/${letterId}`, /open.*letter/i);
  await context.route(SUPABASE, () => new Promise(() => {}));
  await page.goto(`/letter/${letterId}`);
  await expect(page.getByText(/open.*letter/i).first()).toBeVisible({ timeout: 6_000 });
  await expect(page.getByText(STRIP_CACHED).first()).toBeVisible();
  await context.close();
});

// ─── 4. Offline pack ───────────────────────────────────────────────────────

test('4a: the offline pack pre-loads a bounded set once; a never-visited stake list then opens offline', async ({ browser }) => {
  test.setTimeout(150_000);
  const { context, page } = await freshPage(browser);
  await allowPack(page);
  const dataRequests: Request[] = [];
  const onRequest = (r: Request) => {
    if (SUPABASE_DATA.test(r.url())) dataRequests.push(r);
  };
  context.on('request', onRequest);
  await page.goto('/');
  // The pack writes its result when the run has finished.
  await expect
    .poll(() => page.evaluate((k) => localStorage.getItem(k), `${PACK_KEY_PREFIX}result`), { timeout: 90_000 })
    .not.toBeNull();
  console.log(`P1369 v2 offline pack result: ${await page.evaluate((k) => localStorage.getItem(k), `${PACK_KEY_PREFIX}result`)}`);
  await page.waitForTimeout(1_000);
  context.off('request', onRequest);

  let bytes = 0;
  for (const r of dataRequests) {
    const res = await r.response().catch(() => null);
    if (res) bytes += (await res.body().catch(() => Buffer.alloc(0))).length;
  }
  console.log(`P1369 v2 offline pack: ${dataRequests.length} Supabase data requests on first load (${bytes} bytes)`);
  // Home's own reads + the pack: a fixed number, never a loop.
  expect(dataRequests.length, 'Supabase data requests on the first load with the pack').toBeLessThanOrEqual(60);

  // The slides went into the service worker's cache, as a runtime entry.
  const urls = await cachedUrls(page);
  expect(urls.some((u) => /\/presi\/(index\.html)?$/.test(new URL(u).pathname))).toBe(true);

  // Not repeated within hours: a reload issues no pack request (the letter-code lookup is the
  // pack's tell — home never resolves letter codes).
  const again: string[] = [];
  const onAgain = (r: Request) => {
    if (/rpc\/resolve_letter_shortcode/.test(r.url())) again.push(r.url());
  };
  context.on('request', onAgain);
  await page.reload();
  await page.waitForTimeout(8_000);
  context.off('request', onAgain);
  expect(again, 'pack requests on a reload within the refresh window').toEqual([]);

  // Never visited, yet readable offline.
  await goOffline(context);
  await gotoOffline(page, '/stake/cmp7');
  await expect(page.getByText(cmp7Point.statement).first()).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(STRIP_CACHED).first()).toBeVisible();
  await context.close();
});

test('4b: the offline pack is skipped on Save-Data', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await allowPack(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
  });
  let packRequests = 0;
  context.on('request', (r) => {
    if (/rpc\/resolve_letter_shortcode/.test(r.url())) packRequests += 1;
  });
  await page.goto('/');
  await page.waitForTimeout(10_000);
  expect(packRequests).toBe(0);
  expect(await packStamp(page)).toBeNull();
  await context.close();
});
