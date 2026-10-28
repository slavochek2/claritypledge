/**
 * @file p1586-loading-continuity.spec.ts
 * @description P1586 Done-When item 1: the per-frame loading continuity check.
 *
 * For each route the test holds the backend's data responses for 1.5s so the loader is certain to be
 * on screen, samples the page on EVERY animation frame from navigation until that route's main-content
 * marker appears, and then asserts the five properties the spec names:
 *   1. the mark was visible at least once (so the rest is not vacuous);
 *   2. the mark's centre moved at most 8px while visible (the "jumping" the founder saw);
 *   3. no frame showed "Loading" text;
 *   4. no blank content frame between the first mark frame and the marker;
 *   5. at most one mark episode (visible -> hidden -> visible again is two).
 *
 * WHAT IS HELD: every response from `<VITE_SUPABASE_URL>/rest/v1/*` (table reads and RPCs), each fetched
 * from the real backend and then withheld for HOLD_MS before the page sees it. NOT held: `/auth/v1/*`
 * (the session restore must succeed or there is no signed-in shell to measure), realtime websockets and
 * edge functions (`/functions/v1/*`). A route whose first paint waits on one of those is not slowed by it.
 *
 * WHAT COUNTS AS A MARK: an `svg[aria-label="Loading"]` (ClarityLoader) or the `#app-shell-loader svg`
 * splash from index.html, with computed visibility, a non-zero box, and an effective opacity (own
 * opacity times every ancestor's) above MARK_MIN_OPACITY. The 5% floor is below anything a person can
 * see; it exists so a CSS fade that has only just started does not count as a visible mark. The
 * `[data-testid="content-loader"]` box is NOT sampled as a mark: it is a min-height wrapper and its
 * centre is not the mark's. Several marks visible in one frame (the splash cross-fading into the page
 * loader) are all recorded, and the centre-movement check runs across all of them.
 *
 * WHAT COUNTS AS BLANK: a frame with no visible mark, no visible skeleton (`.animate-pulse`, or a
 * `[role=status][aria-label=Loading]` block) and no visible text in the page outside nav/aside/header/
 * footer chrome. `contentFramesWhileMark` in the summary is the sanity check on that definition: if the
 * chrome leaked into the text count it would be non-zero on shell routes.
 *
 * ROUTES THAT ARE NOT HERE (need fixtures this file cannot create safely, or are listed in the spec's
 * Done-When but not in this batch's brief): see the `test.skip` entries at the bottom, each with its reason.
 */

import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';
import { supabaseAdmin } from './helpers/supabase-admin';

const HOLD_MS = 1500;
const MARK_MIN_OPACITY = 0.05;
const MAX_CENTRE_MOVE_PX = 8;
/** Probe gives up this long after install; a route that never reaches its marker fails loudly. */
const PROBE_GIVE_UP_MS = 40_000;

// ---------------------------------------------------------------------------------------------------
// The probe. Runs in the page, before any page script (addInitScript). Self-contained: Playwright
// serialises the function body, so it may not reference anything from this module.
// ---------------------------------------------------------------------------------------------------

interface Marker {
  /** CSS selector; the marker is present when an element matching it is visible (and its text matches). */
  selector: string;
  /** Regex source tested against the element's trimmed textContent. Omit to accept any text. */
  text?: string;
}

interface ProbeConfig {
  markers: Marker[];
  markMinOpacity: number;
  giveUpMs: number;
}

interface MarkSample {
  cx: number;
  cy: number;
  w: number;
  h: number;
  opacity: number;
  /** Which loader drew it: the splash, the in-shell content loader, the boot loader, or a bare mark. */
  owner: string;
}

interface FrameSample {
  t: number;
  marks: MarkSample[];
  loadingText: string[];
  skeletons: number;
  contentChars: number;
  markerPresent: boolean;
}

interface ProbeResult {
  done: boolean;
  gaveUp: boolean;
  samples: FrameSample[];
}

function installProbe(cfg: ProbeConfig): void {
  // Sub-frames (iframes) share the init script; only the top document is measured.
  if (window.top !== window) return;
  const w = window as unknown as { __p1586?: ProbeResult };
  const state: ProbeResult = { done: false, gaveUp: false, samples: [] };
  w.__p1586 = state;
  const startedAt = performance.now();

  const CHROME = 'nav, aside, header, footer, [role="navigation"], [role="banner"], [role="contentinfo"]';
  const MARK_SELECTOR = 'svg[aria-label="Loading"], #app-shell-loader svg';
  const LOADING = /Loading/;

  /** Own opacity times every ancestor's: what the eye gets. 0 when anything on the way is not rendered. */
  function effectiveOpacity(el: Element): number {
    let o = 1;
    for (let n: Element | null = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none') return 0;
      o *= parseFloat(cs.opacity);
    }
    return o;
  }

  function isVisible(el: Element): boolean {
    const cv = (el as Element & { checkVisibility?: (o: object) => boolean }).checkVisibility;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (cv && !cv.call(el, { checkOpacity: true, checkVisibilityCSS: true })) return false;
    return true;
  }

  function sample(): FrameSample {
    const marks: MarkSample[] = [];
    for (const el of Array.from(document.querySelectorAll(MARK_SELECTOR))) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      const opacity = effectiveOpacity(el);
      if (opacity <= cfg.markMinOpacity) continue;
      marks.push({
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2,
        w: rect.width,
        h: rect.height,
        opacity,
        owner: el.closest('#app-shell-loader')
          ? 'splash'
          : el.closest('[data-testid="content-loader"]')
            ? 'content-loader'
            : el.closest('.clarity-page-loader')
              ? 'boot-loader'
              : 'bare-mark',
      });
    }

    const loadingText: string[] = [];
    let contentChars = 0;
    const visCache = new Map<Element, boolean>();
    const chromeCache = new Map<Element, boolean>();
    const root = document.body;
    if (root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = (n.nodeValue ?? '').trim();
        if (!text) continue;
        const parent = n.parentElement;
        if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(parent.tagName)) continue;
        let visible = visCache.get(parent);
        if (visible === undefined) {
          visible = isVisible(parent) && !parent.closest('.sr-only');
          visCache.set(parent, visible);
        }
        if (!visible) continue;
        if (LOADING.test(text)) loadingText.push(text.slice(0, 80));
        let inChrome = chromeCache.get(parent);
        if (inChrome === undefined) {
          inChrome = !!parent.closest(CHROME);
          chromeCache.set(parent, inChrome);
        }
        if (!inChrome) contentChars += text.length;
      }
    }

    let skeletons = 0;
    // #app-shell-loader is itself a div[role=status][aria-label=Loading]: it is the splash, a mark, not a skeleton.
    for (const el of Array.from(document.querySelectorAll('.animate-pulse, div[role="status"][aria-label="Loading"]'))) {
      if (el.closest('#app-shell-loader')) continue;
      if (isVisible(el)) skeletons += 1;
    }

    let markerPresent = false;
    for (const m of cfg.markers) {
      const re = m.text ? new RegExp(m.text) : null;
      for (const el of Array.from(document.querySelectorAll(m.selector))) {
        if (!isVisible(el)) continue;
        if (re && !re.test((el.textContent ?? '').trim())) continue;
        markerPresent = true;
        break;
      }
      if (markerPresent) break;
    }

    return { t: performance.now() - startedAt, marks, loadingText, skeletons, contentChars, markerPresent };
  }

  function tick(): void {
    if (state.done) return;
    const s = sample();
    state.samples.push(s);
    if (s.markerPresent) {
      state.done = true;
      return;
    }
    if (s.t > cfg.giveUpMs) {
      state.done = true;
      state.gaveUp = true;
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------------------------------
// Analysis (runs in Node, on the samples read back).
// ---------------------------------------------------------------------------------------------------

interface Summary {
  frames: number;
  markFrames: number;
  firstMarkFrame: number;
  markerFrame: number;
  episodes: number;
  centreRangeX: number;
  centreRangeY: number;
  loadingTextFrames: { frame: number; text: string }[];
  blankFrames: number[];
  /** Frames where a mark was visible AND text outside the chrome was visible: a leak check on "blank". */
  contentFramesWhileMark: number;
  skeletonFrames: number;
  maxMarksInOneFrame: number;
  gaveUp: boolean;
}

function summarise(result: ProbeResult): Summary {
  const { samples } = result;
  const markerFrame = samples.findIndex((s) => s.markerPresent);
  const markFrames = samples.map((s, i) => (s.marks.length > 0 ? i : -1)).filter((i) => i >= 0);
  const firstMarkFrame = markFrames.length ? markFrames[0] : -1;

  let episodes = 0;
  let prevVisible = false;
  for (const s of samples) {
    const visible = s.marks.length > 0;
    if (visible && !prevVisible) episodes += 1;
    prevVisible = visible;
  }

  const centres = samples.flatMap((s) => s.marks.map((m) => ({ x: m.cx, y: m.cy })));
  const xs = centres.map((c) => c.x);
  const ys = centres.map((c) => c.y);
  const range = (v: number[]) => (v.length ? Math.max(...v) - Math.min(...v) : 0);

  const blankFrames: number[] = [];
  if (firstMarkFrame >= 0) {
    const end = markerFrame >= 0 ? markerFrame : samples.length;
    for (let i = firstMarkFrame; i < end; i++) {
      const s = samples[i];
      if (s.marks.length === 0 && s.skeletons === 0 && s.contentChars === 0) blankFrames.push(i);
    }
  }

  return {
    frames: samples.length,
    markFrames: markFrames.length,
    firstMarkFrame,
    markerFrame,
    episodes,
    centreRangeX: Math.round(range(xs) * 100) / 100,
    centreRangeY: Math.round(range(ys) * 100) / 100,
    loadingTextFrames: samples.flatMap((s, i) => s.loadingText.map((text) => ({ frame: i, text }))),
    blankFrames,
    contentFramesWhileMark: samples.filter((s) => s.marks.length > 0 && s.contentChars > 0).length,
    skeletonFrames: samples.filter((s) => s.skeletons > 0).length,
    maxMarksInOneFrame: Math.max(0, ...samples.map((s) => s.marks.length)),
    gaveUp: result.gaveUp,
  };
}

/** Compress the blank-frame list into ranges so a failure message stays readable. */
function ranges(frames: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < frames.length; ) {
    let j = i;
    while (j + 1 < frames.length && frames[j + 1] === frames[j] + 1) j++;
    out.push(frames[i] === frames[j] ? `${frames[i]}` : `${frames[i]}-${frames[j]}`);
    i = j + 1;
  }
  return out.join(',');
}

// ---------------------------------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------------------------------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Hold every PostgREST response (reads and RPCs) for HOLD_MS. Auth, realtime and functions pass straight through. */
async function holdBackendReads(page: Page): Promise<{ held: () => number }> {
  const origin = process.env.VITE_SUPABASE_URL;
  if (!origin) throw new Error('VITE_SUPABASE_URL is not set; .env.test.local should provide it');
  const restPrefix = new RegExp(`^${escapeRe(origin.replace(/\/$/, ''))}/rest/v1/`);
  let count = 0;
  await page.route(restPrefix, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.continue();
    try {
      const response = await route.fetch();
      await new Promise((r) => setTimeout(r, HOLD_MS));
      count += 1;
      await route.fulfill({ response });
    } catch {
      // The page navigated away or the request was aborted; nothing left to hold.
      await route.continue().catch(() => undefined);
    }
  });
  return { held: () => count };
}

async function measureRoute(
  page: Page,
  testInfo: TestInfo,
  name: string,
  url: string,
  markers: Marker[],
): Promise<{ summary: Summary; heldRequests: number }> {
  const hold = await holdBackendReads(page);
  const cfg: ProbeConfig = { markers, markMinOpacity: MARK_MIN_OPACITY, giveUpMs: PROBE_GIVE_UP_MS };
  await page.addInitScript(installProbe, cfg);

  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction(
    () => (window as unknown as { __p1586?: ProbeResult }).__p1586?.done === true,
    null,
    { timeout: PROBE_GIVE_UP_MS + 5000, polling: 100 },
  );
  const result = await page.evaluate(() => (window as unknown as { __p1586: ProbeResult }).__p1586);
  const summary = summarise(result);

  // Evidence for a failure: the frames where the set of visible marks (count or rounded centres) changed.
  let last = '';
  const timeline: string[] = [];
  result.samples.forEach((s, i) => {
    const sig = s.marks.map((m) => `${m.owner}(${Math.round(m.cx)},${Math.round(m.cy)})`).join('');
    if (sig !== last) {
      timeline.push(`f${i}@${Math.round(s.t)}ms:${sig || 'none'}${s.skeletons ? '+skel' : ''}`);
      last = sig;
    }
  });
  console.log(`[P1586 ${name}] timeline ${timeline.join(' ')}`);

  await testInfo.attach(`${name}-samples.json`, { body: JSON.stringify(result.samples), contentType: 'application/json' });
  console.log(`[P1586 ${name}] ${JSON.stringify(summary)} heldRequests=${hold.held()} finalUrl=${page.url()}`);
  return { summary, heldRequests: hold.held() };
}

function assertContinuity(name: string, s: Summary, heldRequests: number): void {
  // The probe must have reached the marker, else every check below is about a page that never loaded.
  expect(s.gaveUp, `${name}: marker never appeared within ${PROBE_GIVE_UP_MS}ms`).toBe(false);
  expect(heldRequests, `${name}: no backend response was held, so the loader was not forced`).toBeGreaterThan(0);

  // 1. Not vacuous.
  expect(s.markFrames, `${name}: the loader mark was never visible (${s.frames} frames sampled)`).toBeGreaterThan(0);
  // 2. The mark does not move.
  expect(s.centreRangeX, `${name}: mark centre moved ${s.centreRangeX}px horizontally`).toBeLessThanOrEqual(MAX_CENTRE_MOVE_PX);
  expect(s.centreRangeY, `${name}: mark centre moved ${s.centreRangeY}px vertically`).toBeLessThanOrEqual(MAX_CENTRE_MOVE_PX);
  // 3. No "Loading" text on any frame.
  expect(s.loadingTextFrames, `${name}: "Loading" text visible`).toEqual([]);
  // 4. No blank content between the first mark frame and the marker.
  expect(ranges(s.blankFrames), `${name}: blank content frames after the mark first showed (frame ${s.firstMarkFrame}, marker at ${s.markerFrame})`).toBe('');
  // 5. One episode.
  expect(s.episodes, `${name}: the mark showed ${s.episodes} separate times`).toBeLessThanOrEqual(1);
}

// ---------------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------------

test.describe('P1586: per-frame loading continuity', () => {
  test.describe.configure({ timeout: 90_000 });

  let user: TestUser;
  let event: TestEvent;
  let cmName: string | null = null;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P1586 Continuity' });
    // Upcoming, a week out, so it is listed whatever the list's time window is.
    event = await createTestEvent(user.user.id, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), {
      title: `P1586 Continuity Event ${Date.now()}`,
    });
    const { data } = await supabaseAdmin.from('organization').select('name').eq('slug', 'cm').maybeSingle();
    cmName = data?.name ?? null;
  });

  test.afterAll(async () => {
    if (event?.id) await deleteTestEvent(event.id);
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  // Smoke assertions live in the first test (tests.md): the pages the rest of the file measures load at
  // all, un-throttled, without an uncaught error.
  test('smoke: page loads and has no console errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto('/events');
    await expect(page.getByTestId('event-card').first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  // Gate-7 controls for the analyser itself: synthetic frame lists, one per property, each of which must be
  // caught. Without these a green run on the real routes could mean "the analyser cannot see this".
  test('analyser controls: each failure shape is detected', () => {
    const mark = (cx: number, cy: number): MarkSample => ({ cx, cy, w: 64, h: 64, opacity: 1, owner: 'bare-mark' });
    const frame = (over: Partial<FrameSample>): FrameSample => ({
      t: 0, marks: [], loadingText: [], skeletons: 0, contentChars: 0, markerPresent: false, ...over,
    });
    const run = (samples: FrameSample[]) => summarise({ done: true, gaveUp: false, samples });
    const done = frame({ markerPresent: true, contentChars: 10 });

    // Clean: one mark, then the marker.
    const clean = run([frame({ marks: [mark(640, 360)] }), frame({ marks: [mark(640, 360)] }), done]);
    expect(clean).toMatchObject({ episodes: 1, centreRangeY: 0, blankFrames: [], markFrames: 2 });
    // Jump: second mark 80px lower.
    expect(run([frame({ marks: [mark(640, 360)] }), frame({ marks: [mark(640, 440)] }), done]).centreRangeY).toBe(80);
    // Two episodes: visible, hidden (with a skeleton, so not blank), visible again.
    expect(run([frame({ marks: [mark(640, 360)] }), frame({ skeletons: 1 }), frame({ marks: [mark(640, 360)] }), done]).episodes).toBe(2);
    // Blank: visible, then an empty frame, then the marker.
    expect(run([frame({ marks: [mark(640, 360)] }), frame({}), frame({}), done]).blankFrames).toEqual([1, 2]);
    // Blank frames BEFORE the first mark are not counted (the page was never loading yet).
    expect(run([frame({}), frame({ marks: [mark(640, 360)] }), done]).blankFrames).toEqual([]);
    // Loading text is reported with its frame.
    expect(run([frame({ marks: [mark(640, 360)], loadingText: ['Loading events…'] }), done]).loadingTextFrames).toEqual([
      { frame: 0, text: 'Loading events…' },
    ]);
    // Vacuous: no mark at all.
    expect(run([frame({ contentChars: 5 }), done]).markFrames).toBe(0);
  });

  test.describe('signed out', () => {
    // The default context carries any saved auth state from .private/test-auth; these routes must be measured signed out.
    test.use({ storageState: { cookies: [], origins: [] } });

    test('/groups/cm', async ({ page }, testInfo) => {
      test.skip(!cmName, 'the seeded group "cm" does not exist on this database');
      const { summary, heldRequests } = await measureRoute(page, testInfo, 'groups-cm', '/groups/cm', [
        { selector: 'h1', text: `^${escapeRe(cmName!)}$` },
      ]);
      assertContinuity('/groups/cm', summary, heldRequests);
    });

    test('/events', async ({ page }, testInfo) => {
      const { summary, heldRequests } = await measureRoute(page, testInfo, 'events', '/events', [
        { selector: '[data-testid="event-card"]' },
      ]);
      assertContinuity('/events', summary, heldRequests);
    });

    test('/events/:slug', async ({ page }, testInfo) => {
      const { summary, heldRequests } = await measureRoute(page, testInfo, 'event-detail', `/events/${event.slug}`, [
        { selector: 'h1', text: `^${escapeRe(event.title)}$` },
      ]);
      assertContinuity('/events/:slug', summary, heldRequests);
    });
  });

  test.describe('signed in (verified test user)', () => {
    test('/feed', async ({ page }, testInfo) => {
      await setTestSession(page, user.email);
      const { summary, heldRequests } = await measureRoute(page, testInfo, 'feed', '/feed', [
        // Content arrived: a story or point card, or the feed's own empty state.
        { selector: '[data-testid^="feed-story-card-"], [data-testid^="feed-point-card-"]' },
        { selector: 'h2', text: '^No public content yet$' },
      ]);
      assertContinuity('/feed', summary, heldRequests);
    });

    test('/settings', async ({ page }, testInfo) => {
      await setTestSession(page, user.email);
      const { summary, heldRequests } = await measureRoute(page, testInfo, 'settings', '/settings', [
        { selector: 'h1', text: '^Settings$' },
      ]);
      assertContinuity('/settings', summary, heldRequests);
    });

    test('/letters (redirects to /artifacts)', async ({ page }, testInfo) => {
      await setTestSession(page, user.email);
      const { summary, heldRequests } = await measureRoute(page, testInfo, 'letters', '/letters', [
        // The list under the Artifacts tabs has drawn: a row, or the list's empty line.
        { selector: '[data-testid="artifact-row"]' },
        { selector: 'p', text: '^(Nothing has been shared with you yet\\.|No letters sent yet\\.|No canvases here yet\\.|Nothing here yet\\.)' },
      ]);
      assertContinuity('/letters', summary, heldRequests);
    });

    test('/groups/cm/join', async ({ page }, testInfo) => {
      test.skip(!cmName, 'the seeded group "cm" does not exist on this database');
      await setTestSession(page, user.email);
      const { summary, heldRequests } = await measureRoute(page, testInfo, 'groups-cm-join', '/groups/cm/join', [
        { selector: 'h1', text: `^Join ${escapeRe(cmName!)}$` },
      ]);
      assertContinuity('/groups/cm/join', summary, heldRequests);
    });
  });

  // Routes named in the spec's Done-When that this file does not measure. Each is a skip with its reason, not a pass.
  test.skip('/events/:slug/room', () => {
    // Needs a live room: an RSVP'd, started event plus a room-access grant. e2e/helpers/test-event-room.ts builds that, but
    // the room gate redirects by event state and time window; a fixture that holds still long enough to sample is out of this batch's scope.
  });
  test.skip('/compare/:slug', () => {
    // Needs a compare fixture (two positions on a point). No helper exists for it in e2e/helpers; not created here.
  });
  test.skip('/transcribe', () => {
    // Needs a transcribe room; the page's loading state depends on a room row this file cannot seed safely.
  });
});
