/**
 * P1369 — regressions for defects confirmed by review after the first implementation.
 * Each test reproduces one defect in a real production build with the service worker (same
 * harness as p1369-offline.spec.ts):
 *
 *   npx playwright test --config e2e/offline/playwright.config.ts e2e/offline/p1369-regressions.spec.ts
 *
 *   1  (Y-H1/A3) only the point's own request fails while its siblings succeed: the page must not
 *      say "not found" and must not delete the cached copy.
 *   2  (A6)      Supabase hangs silently on a never-visited story: needs-connection after the deadline.
 *   7  (Y-M3)    captive portal, first write: the needs-internet message, not "Failed to save".
 *   8            a write that did not reach the server leaves no optimistic state behind.
 *   9  (A8)      a cached page served by the DEADLINE (no failure recorded) refreshes after reconnect.
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory, type TestStory } from '../helpers/test-story';
import { createTestPoint, deleteTestPoint, type TestPoint } from '../helpers/test-point';
import {
  NEEDS_CONNECTION,
  STRIP_CACHED,
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
const NOT_FOUND = /not found|doesn't exist|does not exist/i;
const NEEDS_INTERNET = /needs internet/i;
const SUPABASE = /\.supabase\.co\//;
const SUPABASE_REST = /\.supabase\.co\/rest\//;

let author: TestUser;
let voter: TestUser;
const stories: TestStory[] = [];
const points: TestPoint[] = [];

test.beforeAll(async () => {
  author = await createTestUser({ name: 'P1369 Reg Author' });
  voter = await createTestUser({ name: 'P1369 Reg Voter' });
});

test.afterAll(async () => {
  for (const p of points) await deleteTestPoint(p.id);
  for (const s of stories) await deleteTestStory(s.id);
  for (const u of [author, voter]) if (u?.user?.id) await deleteTestUser(u.user.id);
});

test.beforeEach(() => {
  deploy('a');
  setServerDown(false);
});

async function freshPage(browser: import('@playwright/test').Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await newAppContext(browser);
  const page = await context.newPage();
  await warmServiceWorker(page);
  return { context, page };
}

async function storyWithPoint(label: string) {
  const story = await createTestStory(author.user.id, { content: `P1369 reg ${label} story ${RUN}` });
  const point = await createTestPoint(author.user.id, story.id, { statement: `P1369 reg ${label} point ${RUN}` });
  stories.push(story);
  points.push(point);
  return { story, point };
}

/** Record every toast text that appears from now on (toasts disappear, so collect them). */
async function collectToasts(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __toasts: string[] };
    w.__toasts = [];
    new MutationObserver(() => {
      document.querySelectorAll('[data-sonner-toast]').forEach((t) => {
        const txt = (t as HTMLElement).innerText.trim();
        if (txt && !w.__toasts.includes(txt)) w.__toasts.push(txt);
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  return () => page.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts);
}

test('control: online, a vote lands — the agree button is pressed and no error toast', async ({ browser }) => {
  const { story, point } = await storyWithPoint('control');
  const { context, page } = await freshPage(browser);
  await signIn(page, voter.email);
  await visitOnline(page, `/story/${story.id}`, point.statement);
  const toasts = await collectToasts(page);
  const agree = page.getByTestId('agree-group').first();
  await expect(agree).toHaveAttribute('aria-pressed', 'false');
  await agree.click();
  await expect(agree).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(3_000);
  await expect(agree).toHaveAttribute('aria-pressed', 'true');
  expect(await toasts()).toEqual([]);
  await context.close();
});

test('defect 1 (Y-H1): only the point request fails, siblings succeed — cached copy, no "not found", copy kept', async ({ browser }) => {
  const point = await createTestPoint(author.user.id, { statement: `P1369 reg partial point ${RUN}` });
  points.push(point);
  const { context, page } = await freshPage(browser);
  await visitOnline(page, `/point/${point.id}`, point.statement);

  let aborted = 0;
  await context.route(
    (url) => /\/rest\/v1\/points\?/.test(url.href) && url.href.includes(point.id),
    (route) => {
      aborted += 1;
      return route.abort('internetdisconnected');
    },
  );
  await page.goto(`/point/${point.id}`);
  await expect(page.getByText(point.statement).first()).toBeVisible();
  await expect(page.getByText(STRIP_CACHED).first()).toBeVisible();
  await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
  expect(aborted).toBeGreaterThan(0);

  // The cached copy must still be there: fully offline, it reopens.
  await context.unrouteAll({ behavior: 'ignoreErrors' });
  await goOffline(context);
  await gotoOffline(page, `/point/${point.id}`);
  await expect(page.getByText(point.statement).first()).toBeVisible();
  await expect(page.getByText(STRIP_CACHED).first()).toBeVisible();
  await context.close();
});

test('defect 2 (A6): never-visited story, Supabase hangs without an error — needs-connection after the deadline', async ({ browser }) => {
  const { context, page } = await freshPage(browser);
  await context.route(SUPABASE_REST, () => new Promise(() => {}));
  await page.goto('/story/00000000-0000-4000-8000-00000000a6a6').catch(() => {});
  await expect(page.getByText(NEEDS_CONNECTION).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
  await context.close();
});

test('defects 7+8: captive portal, first write on a story — needs-internet message, vote not left selected', async ({ browser }) => {
  const { story, point } = await storyWithPoint('captive');
  const { context, page } = await freshPage(browser);
  await signIn(page, voter.email);
  await visitOnline(page, `/story/${story.id}`, point.statement);
  const toasts = await collectToasts(page);
  // Captive portal: the browser still says online; nothing reaches Supabase. Nothing failed yet.
  await context.route(SUPABASE, (route) => route.abort('internetdisconnected'));
  const agree = page.getByTestId('agree-group').first();
  await expect(agree).toHaveAttribute('aria-pressed', 'false');
  await agree.click();
  await expect.poll(toasts, { timeout: 15_000 }).toEqual(expect.arrayContaining([expect.stringMatching(NEEDS_INTERNET)]));
  await page.waitForTimeout(3_000);
  await expect(agree).toHaveAttribute('aria-pressed', 'false');
  expect((await toasts()).filter((t) => /failed to save/i.test(t))).toEqual([]);
  await context.close();
});

test('defect 8: connection drops after load, a vote on a story — blocked and not left selected', async ({ browser }) => {
  const { story, point } = await storyWithPoint('drop');
  const { context, page } = await freshPage(browser);
  await signIn(page, voter.email);
  await visitOnline(page, `/story/${story.id}`, point.statement);
  const toasts = await collectToasts(page);
  await goOffline(context);
  const agree = page.getByTestId('agree-group').first();
  await expect(agree).toHaveAttribute('aria-pressed', 'false');
  await agree.click();
  await expect.poll(toasts, { timeout: 15_000 }).toEqual(expect.arrayContaining([expect.stringMatching(NEEDS_INTERNET)]));
  await page.waitForTimeout(3_000);
  await expect(agree).toHaveAttribute('aria-pressed', 'false');
  await context.close();
});

test('defects 7+8: captive portal, first write on a point page — needs-internet message, vote not left selected', async ({ browser }) => {
  const point = await createTestPoint(author.user.id, { statement: `P1369 reg captive point page ${RUN}` });
  points.push(point);
  const { context, page } = await freshPage(browser);
  await signIn(page, voter.email);
  await visitOnline(page, `/point/${point.id}`, point.statement);
  const toasts = await collectToasts(page);
  await context.route(SUPABASE, (route) => route.abort('internetdisconnected'));
  const agree = page.getByTestId('agree-group').first();
  await expect(agree).toHaveAttribute('aria-pressed', 'false');
  await agree.click();
  await expect.poll(toasts, { timeout: 15_000 }).toEqual(expect.arrayContaining([expect.stringMatching(NEEDS_INTERNET)]));
  await page.waitForTimeout(3_000);
  await expect(agree).toHaveAttribute('aria-pressed', 'false');
  expect((await toasts()).filter((t) => /failed to save/i.test(t))).toEqual([]);
  await context.close();
});

test('defect 9 (A8): a cached story served by the deadline refreshes itself once Supabase answers again', async ({ browser }) => {
  test.setTimeout(150_000);
  const { story, point } = await storyWithPoint('deadline');
  const { context, page } = await freshPage(browser);
  await visitOnline(page, `/story/${story.id}`, point.statement);

  // Every Supabase request hangs: nothing fails, so only the read deadline answers.
  await context.route(SUPABASE, () => new Promise(() => {}));
  await page.goto(`/story/${story.id}`);
  await expect(page.getByText(STRIP_CACHED).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(story.content).first()).toBeVisible();

  // Supabase answers again. No navigation: the page must refresh itself and drop the strip.
  await context.unrouteAll({ behavior: 'ignoreErrors' });
  await expect(page.getByText(STRIP_CACHED)).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByText(story.content).first()).toBeVisible();
  await context.close();
});

test('no request storm: one request failing persistently while its siblings succeed stays bounded over 15s', async ({ browser }) => {
  // Found by the orchestrator after the defect-1/9 fixes: a partial failure marked the app
  // unreachable, a sibling request's success (sent BEFORE that failure) counted as the reconnect,
  // the page re-read, the same request failed again — ~250 requests/s, unbounded.
  const point = await createTestPoint(author.user.id, { statement: `P1369 reg storm point ${RUN}` });
  points.push(point);
  const { context, page } = await freshPage(browser);
  await visitOnline(page, `/point/${point.id}`, point.statement);

  let pointRequests = 0;
  let supabaseRest = 0;
  page.on('request', (r) => {
    if (!SUPABASE_REST.test(r.url())) return;
    supabaseRest += 1;
    if (/\/rest\/v1\/points\?/.test(r.url()) && r.url().includes(point.id)) pointRequests += 1;
  });
  await context.route(
    (url) => /\/rest\/v1\/points\?/.test(url.href) && url.href.includes(point.id),
    (route) => route.abort('internetdisconnected'),
  );
  await page.goto(`/point/${point.id}`);
  await page.waitForTimeout(15_000);
  const counts = { pointRequests, supabaseRest };
  console.log(`P1369 storm regression: ${JSON.stringify(counts)} in 15s`);
  expect(counts.pointRequests, 'requests for the failing point row in 15s').toBeLessThanOrEqual(20);
  expect(counts.supabaseRest, 'all Supabase REST requests in 15s').toBeLessThanOrEqual(80);
  // The page still shows the cached copy with the strip — bounded, not given up.
  await expect(page.getByText(point.statement).first()).toBeVisible();
  await expect(page.getByText(STRIP_CACHED).first()).toBeVisible();
  await context.close();
});
