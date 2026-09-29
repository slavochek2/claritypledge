/**
 * P1369 — offline-readable pages and the offline bar. Acceptance Criteria as executable checks.
 *
 * Runs against a PRODUCTION build served like Vercel (see serve.mjs), because the service worker
 * only exists in a build:
 *
 *   npx playwright test --config e2e/offline/playwright.config.ts
 *
 * Copy is matched loosely on the spec's UI Contract ("showing what you saw", "needs a connection")
 * because the exact strings are still founder decisions.
 *
 * NOT covered here (judged by review, not automated): the write-blocked message (AC "A write action
 * offline..."), the merged session-bar state (AC "Offline with a /live session..."), online speed
 * (measured separately), and the `scope: 'local'` sign-out path.
 */
import { test, expect, type Browser } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory, type TestStory } from '../helpers/test-story';
import { createTestPoint, deleteTestPoint, type TestPoint } from '../helpers/test-point';
import { createTestEvent, deleteTestEvent, type TestEvent } from '../helpers/test-event';
import {
  CHUNK_ERROR,
  NEEDS_CONNECTION,
  STRIP_CACHED,
  authStorageKey,
  cachedUrls,
  deploy,
  goOffline,
  gotoOffline,
  newAppContext,
  runningBuild,
  setServerDown,
  settleServiceWorker,
  signIn,
  signOutViaUi,
  visitOnline,
  warmServiceWorker,
} from './harness';

const RUN = Date.now();
let author: TestUser;
let userA: TestUser;
let userB: TestUser;
let story: TestStory;
let point: TestPoint;
let event: TestEvent;

test.beforeAll(async () => {
  author = await createTestUser({ name: 'P1369 Author' });
  userA = await createTestUser({ name: 'P1369 Reader A' });
  userB = await createTestUser({ name: 'P1369 Reader B' });
  story = await createTestStory(author.user.id, { content: `P1369 offline story ${RUN}` });
  point = await createTestPoint(author.user.id, { statement: `P1369 offline point ${RUN}` });
  event = await createTestEvent(author.user.id, new Date(Date.now() + 3 * 86400_000), {
    title: `P1369 offline event ${RUN}`,
  });
});

test.afterAll(async () => {
  if (event?.id) await deleteTestEvent(event.id);
  if (point?.id) await deleteTestPoint(point.id);
  if (story?.id) await deleteTestStory(story.id);
  for (const u of [author, userA, userB]) if (u?.user?.id) await deleteTestUser(u.user.id);
});

test.beforeEach(() => {
  deploy('a');
  setServerDown(false);
});

async function freshPage(browser: Browser) {
  const context = await newAppContext(browser);
  const page = await context.newPage();
  await warmServiceWorker(page);
  return { context, page };
}

test('AC1: a visited story, point and event reopen offline with their content and the strip', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await visitOnline(page, `/story/${story.id}`, story.content);
  await visitOnline(page, `/point/${point.id}`, point.statement);
  await visitOnline(page, `/events/${event.slug}`, event.title);

  await goOffline(context);
  for (const [url, text] of [
    [`/story/${story.id}`, story.content],
    [`/point/${point.id}`, point.statement],
    [`/events/${event.slug}`, event.title],
  ] as const) {
    await gotoOffline(page, url);
    await expect(page.getByText(text).first(), `${url}: cached content`).toBeVisible();
    await expect(page.getByText(STRIP_CACHED).first(), `${url}: strip with age`).toBeVisible();
    await expect(page.getByText(CHUNK_ERROR)).toHaveCount(0);
  }
  await context.close();
});

test('AC2/AC9: a never-visited story deep link offline boots the app and shows needs-connection', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await goOffline(context);
  await gotoOffline(page, `/story/00000000-0000-4000-8000-${String(RUN).slice(-12).padStart(12, '0')}`);
  await expect(page.getByText(NEEDS_CONNECTION).first()).toBeVisible();
  await expect(page.getByText(CHUNK_ERROR)).toHaveCount(0);
  await context.close();
});

test('AC3: /meet and /ready offline show needs-connection', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await page.goto('/ready');
  await page.waitForLoadState('networkidle');
  await page.goto('/meet');
  await page.waitForLoadState('networkidle');
  await goOffline(context);
  for (const url of ['/ready', '/meet']) {
    await gotoOffline(page, url);
    await expect(page.getByText(NEEDS_CONNECTION).first(), url).toBeVisible();
  }
  await context.close();
});

test('AC7 (P838): after a deploy, an installed PWA runs the new build on the next online load', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await page.goto('/');
  expect(await runningBuild(page)).toBe('a');
  deploy('b');
  await page.goto('/');
  // "Next online load" includes the service worker update it triggers and any automatic reload
  // that update performs (vite-plugin-pwa autoUpdate reloads on takeover). What must never
  // happen is the page settling on build A — the P838 stale-shell failure.
  await page.waitForLoadState('networkidle');
  await settleServiceWorker(page);
  await page.waitForTimeout(2_000);
  await page.waitForLoadState('networkidle');
  expect(await runningBuild(page), 'after the first online load settles, the page runs build B').toBe('b');
  await context.close();
});

test('AC8: shell and chunks come from one build — story opened under A, only home under B, then offline', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await visitOnline(page, `/story/${story.id}`, story.content);
  deploy('b');
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Let build B's service worker install and take control.
  await page.waitForTimeout(3_000);
  await settleServiceWorker(page);

  await goOffline(context);
  await gotoOffline(page, `/story/${story.id}`);
  await expect(
    page.getByText(story.content).or(page.getByText(NEEDS_CONNECTION)).first(),
    'either the cached story or needs-connection',
  ).toBeVisible();
  await expect(page.getByText(CHUNK_ERROR), 'never the chunk-error "Refresh" screen offline').toHaveCount(0);
  await context.close();
});

test('AC10: two accounts on one device — B offline never sees what A had cached', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await signIn(page, userA.email);
  await visitOnline(page, `/story/${story.id}`, story.content);
  await signOutViaUi(page);
  await signIn(page, userB.email);
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await goOffline(context);
  await gotoOffline(page, `/story/${story.id}`);
  await expect(page.getByText(NEEDS_CONNECTION).first()).toBeVisible();
  await expect(page.getByText(story.content)).toHaveCount(0);
  await context.close();
});

test('AC11: after sign-out, the previous user’s cached data is not shown offline', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await signIn(page, userA.email);
  await visitOnline(page, `/point/${point.id}`, point.statement);
  await signOutViaUi(page);

  await goOffline(context);
  await gotoOffline(page, `/point/${point.id}`);
  await expect(page.getByText(NEEDS_CONNECTION).first()).toBeVisible();
  await expect(page.getByText(point.statement)).toHaveCount(0);
  await context.close();
});

test('AC12: captive portal (browser says online, Supabase unreachable) — cached page shows with the strip', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await visitOnline(page, `/story/${story.id}`, story.content);
  await context.route(/\.supabase\.co\//, (route) => route.abort('internetdisconnected'));
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  await page.goto(`/story/${story.id}`);
  await expect(page.getByText(story.content).first()).toBeVisible();
  await expect(page.getByText(STRIP_CACHED).first()).toBeVisible();
  await context.close();
});

test('AC13: offline past the access-token lifetime, cached pages still open', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await signIn(page, userA.email);
  await visitOnline(page, `/story/${story.id}`, story.content);
  await goOffline(context);
  // Age the stored session so the client considers the access token expired.
  await page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    if (!raw) throw new Error('no session to expire');
    const s = JSON.parse(raw);
    s.expires_at = Math.floor(Date.now() / 1000) - 7200;
    localStorage.setItem(k, JSON.stringify(s));
  }, authStorageKey());
  await gotoOffline(page, `/story/${story.id}`);
  await expect(page.getByText(story.content).first()).toBeVisible();
  await expect(page.getByText(STRIP_CACHED).first()).toBeVisible();
  await context.close();
});

test('Invariant: the service worker never stores Supabase responses', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await signIn(page, userA.email);
  await visitOnline(page, `/story/${story.id}`, story.content);
  await visitOnline(page, `/point/${point.id}`, point.statement);
  const urls = await cachedUrls(page);
  expect(urls.length, 'probe sanity: the service worker cached something').toBeGreaterThan(0);
  expect(urls.filter((u) => /supabase\.co/.test(u))).toEqual([]);
  await context.close();
});

test('Invariant: online, a normal page shows no offline strip', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await visitOnline(page, `/story/${story.id}`, story.content);
  await page.reload();
  await expect(page.getByText(story.content).first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(STRIP_CACHED)).toHaveCount(0);
  await expect(page.getByText(NEEDS_CONNECTION)).toHaveCount(0);
  await context.close();
});
