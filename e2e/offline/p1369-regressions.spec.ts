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
 *
 * Pre-ship review (R-numbers match src/tests/p1369-review-fixes.test.tsx):
 *   R1  /stake and /feed card votes: blocked / reverted offline, a hanging save is bounded.
 *   R2  after a deploy, the offline pack re-runs for the new build (stamp carries the build).
 *   R5  signed in, an offline reload (the profile never loads) still finds the cached point / list.
 *   R6  story page: a vote that did not land restores the selection AND the count.
 *   R7  letter: when the browser says offline, the stored copy shows at once, not after 5 s.
 *   R8  event-room check-in: a stored check-in renders offline with the strip; an uncached room
 *       shows the nothing-stored body.
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory, type TestStory } from '../helpers/test-story';
import { createTestPoint, createTestPosition, deleteTestPoint, type TestPoint } from '../helpers/test-point';
import { createTestEvent, deleteTestEvent, type TestEvent } from '../helpers/test-event';
import {
  createTestDoc,
  createTestLetter,
  createTestStorySnapshot,
  deleteTestLetter,
  getTestStoryVersionId,
  sealTestLetter,
} from '../helpers/test-letter';
import { supabaseAdmin } from '../helpers/supabase-admin';
import {
  NEEDS_CONNECTION,
  STRIP_CACHED,
  CHUNK_ERROR,
  deploy,
  goOffline,
  runningBuild,
  settleServiceWorker,
  gotoOffline,
  newAppContext,
  setServerDown,
  authStorageKey,
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
const events: TestEvent[] = [];
const letters: string[] = [];
const docs: string[] = [];

test.beforeAll(async () => {
  author = await createTestUser({ name: 'P1369 Reg Author' });
  voter = await createTestUser({ name: 'P1369 Reg Voter' });
});

test.afterAll(async () => {
  for (const e of events) await deleteTestEvent(e.id);
  for (const l of letters) await deleteTestLetter(l);
  for (const d of docs) {
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', d);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', d);
  }
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


// ─── Pre-ship review ────────────────────────────────────────────────────────

/**
 * Open `url` by an in-app navigation after the signed-in profile has loaded — the common way a
 * page is visited (from the feed, a link). A cold `goto` also runs one read before the profile
 * loads, which stored an extra anonymous-keyed copy and hid the R5 miss.
 */
async function visitInApp(page: Page, url: string, visibleText: string | RegExp) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2_000);
  await page.evaluate((u) => {
    history.pushState({}, '', u);
    dispatchEvent(new PopStateEvent('popstate'));
  }, url);
  await expect(page.getByText(visibleText).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1_000);
}

/** Record whether the nothing-stored body is EVER shown from the next load on. */
async function watchForNeedsConnection(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __sawNeedsConnection: boolean };
    w.__sawNeedsConnection = false;
    new MutationObserver(() => {
      if (/hasn't been saved yet/i.test(document.body?.innerText ?? '')) w.__sawNeedsConnection = true;
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  return () => page.evaluate(() => (window as unknown as { __sawNeedsConnection: boolean }).__sawNeedsConnection);
}

/** Make the stored session's access token expired: offline, supabase-js then keeps retrying a refresh. */
async function expireStoredSession(page: Page) {
  await page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    if (!raw) throw new Error('no stored session');
    const s = JSON.parse(raw);
    s.expires_at = Math.floor(Date.now() / 1000) - 60;
    localStorage.setItem(k, JSON.stringify(s));
  }, authStorageKey());
}

/** A point on its own tag with one position (an unstaked point is hidden from /stake, P543). */
async function stakedPoint(label: string) {
  const tag = `p1369r${label}${RUN}`;
  const p = await createTestPoint(author.user.id, { statement: `P1369 reg ${label} staked ${RUN}`, tags: [tag] });
  points.push(p);
  await createTestPosition(p.id, author.user.id, 'agree');
  return { tag, point: p };
}

test('R1: captive portal, a vote on a /stake card — needs-internet message, not left selected', async ({ browser }) => {
  const { tag, point } = await stakedPoint('stakecap');
  const { context, page } = await freshPage(browser);
  await signIn(page, voter.email);
  await visitOnline(page, `/stake/${tag}`, point.statement);
  const toasts = await collectToasts(page);
  await context.route(SUPABASE, (route) => route.abort('internetdisconnected'));
  const agree = page.getByTestId('agree-group').first();
  await expect(agree).toHaveAttribute('aria-pressed', 'false');
  await agree.click();
  await expect.poll(toasts, { timeout: 15_000 }).toEqual(expect.arrayContaining([expect.stringMatching(NEEDS_INTERNET)]));
  await page.waitForTimeout(2_000);
  await expect(agree).toHaveAttribute('aria-pressed', 'false');
  expect((await toasts()).filter((t) => /failed to save/i.test(t))).toEqual([]);
  await context.close();
});

test('R1: the save hangs (no answer, nothing fails) on a /feed card — the vote does not stay looking saved', async ({ browser }) => {
  test.setTimeout(120_000);
  const { tag, point } = await stakedPoint('feedhang');
  const { context, page } = await freshPage(browser);
  await signIn(page, voter.email);
  // The feed filtered to this point's tag, so the card is on the first screen.
  await visitOnline(page, `/feed?tag=${tag}`, point.statement);
  const toasts = await collectToasts(page);
  // Only the write hangs: a captive portal that swallows the POST and never answers.
  await context.route(
    (url) => /\.supabase\.co\/rest\//.test(url.href),
    (route) => (route.request().method() === 'GET' ? route.continue() : new Promise(() => {})),
  );
  const card = page.getByTestId(`feed-point-card-${point.id}`);
  const agree = card.getByTestId('agree-group').first();
  await expect(agree).toHaveAttribute('aria-pressed', 'false');
  await agree.click();
  await expect(agree).toHaveAttribute('aria-pressed', 'true'); // optimistic while in flight
  await expect(agree).toHaveAttribute('aria-pressed', 'false', { timeout: 25_000 });
  expect(await toasts()).toEqual(expect.arrayContaining([expect.stringMatching(NEEDS_INTERNET)]));
  await context.close();
});

test('R5: signed in, a visited point reopens offline even though the profile never loads', async ({ browser }) => {
  const point = await createTestPoint(author.user.id, { statement: `P1369 reg signed-in point ${RUN}` });
  points.push(point);
  const { context, page } = await freshPage(browser);
  await signIn(page, voter.email);
  await visitInApp(page, `/point/${point.id}`, point.statement);
  const sawNeedsConnection = await watchForNeedsConnection(page);
  await goOffline(context);
  await gotoOffline(page, `/point/${point.id}`);
  await expect(page.getByText(point.statement).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(STRIP_CACHED).first()).toBeVisible();
  expect(await sawNeedsConnection(), 'the nothing-stored body never showed for a stored page').toBe(false);
  await context.close();
});

test('R5: signed in, offline on a stored point page, a vote is the needs-internet message (not an anonymous vote)', async ({ browser }) => {
  const point = await createTestPoint(author.user.id, { statement: `P1369 reg offline point vote ${RUN}` });
  points.push(point);
  const { context, page } = await freshPage(browser);
  await signIn(page, voter.email);
  await visitInApp(page, `/point/${point.id}`, point.statement);
  await goOffline(context);
  await gotoOffline(page, `/point/${point.id}`);
  await expect(page.getByText(point.statement).first()).toBeVisible({ timeout: 10_000 });
  const toasts = await collectToasts(page);
  const agree = page.getByTestId('agree-group').first();
  await agree.click();
  await expect.poll(toasts, { timeout: 10_000 }).toEqual(expect.arrayContaining([expect.stringMatching(NEEDS_INTERNET)]));
  await expect(agree).toHaveAttribute('aria-pressed', 'false');
  await context.close();
});

test('R5: signed in, a visited /stake list reopens offline', async ({ browser }) => {
  const { tag, point } = await stakedPoint('stakeoff');
  const { context, page } = await freshPage(browser);
  await signIn(page, voter.email);
  await visitInApp(page, `/stake/${tag}`, point.statement);
  const sawNeedsConnection = await watchForNeedsConnection(page);
  await goOffline(context);
  await gotoOffline(page, `/stake/${tag}`);
  await expect(page.getByText(point.statement).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(STRIP_CACHED).first()).toBeVisible();
  expect(await sawNeedsConnection(), 'the nothing-stored body never showed for a stored list').toBe(false);
  await context.close();
});

test('R6: story page, captive portal — the selection AND the count are back to what they were', async ({ browser }) => {
  const { story, point } = await storyWithPoint('counts');
  await createTestPosition(point.id, author.user.id, 'agree');
  const { context, page } = await freshPage(browser);
  await signIn(page, voter.email);
  await visitOnline(page, `/story/${story.id}`, point.statement);
  const agree = page.getByTestId('agree-group').first();
  const before = (await agree.innerText()).trim();
  const toasts = await collectToasts(page);
  await context.route(SUPABASE, (route) => route.abort('internetdisconnected'));
  await agree.click();
  await expect.poll(toasts, { timeout: 15_000 }).toEqual(expect.arrayContaining([expect.stringMatching(NEEDS_INTERNET)]));
  await page.waitForTimeout(2_000);
  await expect(agree).toHaveAttribute('aria-pressed', 'false');
  expect((await agree.innerText()).trim(), 'the agree count after the failed vote').toBe(before);
  await context.close();
});

test('R7: signed in, the browser offline — a visited letter shows its stored copy at once, not after the 5 s deadline', async ({ browser }) => {
  const story = await createTestStory(author.user.id, { content: `P1369 reg letter story ${RUN}` });
  stories.push(story);
  const doc = await createTestDoc(author.user.id, `P1369 reg doc ${RUN}`);
  docs.push(doc.id);
  await supabaseAdmin.from('doc_stories').insert({ doc_id: doc.id, story_id: story.id, position: 0 });
  const letter = await createTestLetter(author.user.id, doc.id, { mode: 'one-to-many' });
  letters.push(letter.id);
  await createTestStorySnapshot(letter.id, story.id, await getTestStoryVersionId(story.id), {
    position: 0,
    pointConfig: { storyTitle: undefined, storyText: story.content, points: [] },
  });
  await sealTestLetter(letter.id);

  const { context, page } = await freshPage(browser);
  await signIn(page, voter.email);
  await visitOnline(page, `/letter/${letter.id}`, /open.*letter/i);
  // Offline past the token's lifetime: auth does not settle (supabase-js retries the refresh), and
  // the letter's load is gated on auth settling.
  await expireStoredSession(page);
  await goOffline(context);
  await gotoOffline(page, `/letter/${letter.id}`);
  const t0 = Date.now();
  await expect(page.getByText(STRIP_CACHED).first()).toBeVisible({ timeout: 10_000 });
  const ms = Date.now() - t0;
  console.log(`P1369 R7: stored letter shown ${ms} ms after the offline load`);
  expect(ms, 'stored copy shown well before the 5 s deadline').toBeLessThan(3_000);
  await expect(page.getByText(/open.*letter/i).first()).toBeVisible();
  await context.close();
});

test('R8: event-room check-in — a stored check-in renders offline with the strip', async ({ browser }) => {
  const event = await createTestEvent(author.user.id, new Date(Date.now() + 2 * 86400_000), { title: `P1369 reg room ${RUN}` });
  events.push(event);
  const { context, page } = await freshPage(browser);
  await signIn(page, author.email); // the host: always granted
  await visitOnline(page, `/events/${event.slug}/ready`, /Go deep/);
  await goOffline(context);
  await gotoOffline(page, `/events/${event.slug}/ready`);
  await expect(page.getByTestId('room-ready')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(STRIP_CACHED).first()).toBeVisible();
  await expect(page.getByText(NEEDS_CONNECTION)).toHaveCount(0);
  await context.close();
});

test('R8: event-room check-in never opened — offline it shows the nothing-stored body', async ({ browser }) => {
  const event = await createTestEvent(author.user.id, new Date(Date.now() + 2 * 86400_000), { title: `P1369 reg room cold ${RUN}` });
  events.push(event);
  const { context, page } = await freshPage(browser);
  await signIn(page, author.email);
  await goOffline(context);
  await gotoOffline(page, `/events/${event.slug}/ready`);
  await expect(page.getByText(NEEDS_CONNECTION).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('room-ready')).toHaveCount(0);
  await context.close();
});

test('R2: after a deploy, the offline pack runs again for the new build (within the refresh window)', async ({ browser }) => {
  test.setTimeout(150_000);
  const PACK = 'clarity-offline-pack:anon';
  const { context, page } = await freshPage(browser);
  // Build A's pack run (anonymous owner), finished (the result is written at the end of a run).
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('clarity-offline-pack:result')), { timeout: 90_000 })
    .not.toBeNull();
  const stampA = await page.evaluate((k) => localStorage.getItem(k), PACK);

  deploy('b');
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await settleServiceWorker(page);
  // The update's takeover reload can race a fixed wait: re-load until the page runs build B
  // (still required — the assertion is unchanged, only the wait is bounded by polling).
  await expect
    .poll(async () => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      return runningBuild(page);
    }, { timeout: 45_000, intervals: [2_000] })
    .toBe('b');
  // The stamp is re-written for build B (the chunk step re-ran), without waiting hours.
  await expect
    .poll(() => page.evaluate((k) => localStorage.getItem(k), PACK), { timeout: 60_000 })
    .toMatch(/-b\.js/);
  console.log(`P1369 R2: stamp A ${stampA} → B ${await page.evaluate((k) => localStorage.getItem(k), PACK)}`);

  // Build B, offline: a pack page boots from B's code and answers (the list or needs-connection),
  // never the chunk-error screen.
  await goOffline(context);
  await gotoOffline(page, '/stake/cmp7');
  await expect(page.getByRole('heading', { name: 'cmp7' }).or(page.getByText(NEEDS_CONNECTION)).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(CHUNK_ERROR)).toHaveCount(0);
  await context.close();
});

// /finish review (P1369): a cache delete from another tab (sign-out clear fallback) must never be
// blocked by this tab's open connection — connections close themselves on versionchange.
test('cache delete from another tab is not blocked by an open connection', async ({ browser }) => {
  deploy('a');
  setServerDown(false);
  const context = await newAppContext(browser);
  const holder = await context.newPage();
  await warmServiceWorker(holder);
  await holder.goto('/stake/cmp7');
  await holder.waitForLoadState('networkidle');
  // Make sure this tab really holds a connection to the offline cache.
  const opened = await holder.evaluate(async () => (await indexedDB.databases()).some((d) => d.name === 'clarity-offline-reads'));
  expect(opened, 'probe sanity: the app opened its offline cache').toBe(true);
  const other = await context.newPage();
  await other.goto('/__bench/health');
  const outcome = await other.evaluate(() => new Promise<string>((resolve) => {
    const req = indexedDB.deleteDatabase('clarity-offline-reads');
    req.onsuccess = () => resolve('deleted');
    req.onerror = () => resolve('error');
    req.onblocked = () => setTimeout(() => resolve('blocked'), 1500);
  }));
  expect(outcome).toBe('deleted');
  await context.close();
});
