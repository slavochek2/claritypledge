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
import { createTestEvent, deleteTestEvent, rsvpToEvent, type TestEvent } from './helpers/test-event';
import { supabaseAdmin } from './helpers/supabase-admin';

const HOLD_MS = 1500;
const MARK_MIN_OPACITY = 0.05;
const MAX_CENTRE_MOVE_PX = 8;
/** Probe gives up this long after install; a route that never reaches its marker fails loudly. */
const PROBE_GIVE_UP_MS = 40_000;
/**
 * Every route keeps sampling this long after its marker first shows. Without it a loader that is still mounted
 * over loaded content (the marker and the mark both visible, for ever) passes, because sampling stopped on the
 * very frame the destination appeared.
 */
const POST_MARKER_MS = 1000;
/** After the marker shows, the mark may linger this long (a cross-fade); any mark frame later than this is a loader still covering content. */
const MARK_GONE_WITHIN_MS = 500;

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
  /** Keep sampling this long after the marker first shows (0 = stop at the marker). For "drawn once" checks. */
  afterMarkerMs: number;
  /** Selector for UI that exists only for a resolved signed-in person; reported per frame as `signedIn`. */
  signedInSelector?: string;
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
  /** Visible "taking longer than usual" lines (the page loader's 15s fallback, a section's 10s fallback). */
  slowLines: number;
  skeletons: number;
  contentChars: number;
  markerPresent: boolean;
  /** A visible element matching `signedInSelector` (false when none was configured). */
  signedIn: boolean;
}

interface ProbeResult {
  done: boolean;
  gaveUp: boolean;
  /** Wall-clock (epoch ms) of t=0, so Node can order page frames against events it observed itself. */
  startEpoch: number;
  samples: FrameSample[];
}

function installProbe(cfg: ProbeConfig): void {
  // Sub-frames (iframes) share the init script; only the top document is measured.
  if (window.top !== window) return;
  const w = window as unknown as { __p1586?: ProbeResult };
  const startedAt = performance.now();
  const state: ProbeResult = { done: false, gaveUp: false, startEpoch: performance.timeOrigin + startedAt, samples: [] };
  w.__p1586 = state;

  const CHROME = 'nav, aside, header, footer, [role="navigation"], [role="banner"], [role="contentinfo"]';
  const MARK_SELECTOR = 'svg[aria-label="Loading"], #app-shell-loader svg';
  const LOADING = /Loading/;
  // Not a "Loading" text: it is the deadline fallback (P1586). Counted on its own so a route that reaches it is visible.
  const SLOW = /taking longer than usual/i;

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
    let slowLines = 0;
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
        if (SLOW.test(text)) slowLines += 1;
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

    let signedIn = false;
    if (cfg.signedInSelector) {
      for (const el of Array.from(document.querySelectorAll(cfg.signedInSelector))) {
        if (isVisible(el)) {
          signedIn = true;
          break;
        }
      }
    }

    return { t: performance.now() - startedAt, marks, loadingText, slowLines, skeletons, contentChars, markerPresent, signedIn };
  }

  let markerAt: number | null = null;
  function tick(): void {
    if (state.done) return;
    const s = sample();
    state.samples.push(s);
    if (s.markerPresent && markerAt === null) markerAt = s.t;
    if (markerAt !== null && s.t >= markerAt + cfg.afterMarkerMs) {
      state.done = true;
      return;
    }
    if (markerAt === null && s.t > cfg.giveUpMs) {
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
  /** Mark episodes up to and including the first marker frame. */
  episodes: number;
  /** Skeleton episodes (visible -> none -> visible is two) up to and including the first marker frame. */
  skeletonEpisodes: number;
  centreRangeX: number;
  centreRangeY: number;
  loadingTextFrames: { frame: number; text: string }[];
  /** Frames showing a "taking longer than usual" line (a deadline fallback); a held-1.5s route must show none. */
  slowLineFrames: number;
  blankFrames: number[];
  /** Frames where a mark was visible AND text outside the chrome was visible: a leak check on "blank". */
  contentFramesWhileMark: number;
  skeletonFrames: number;
  maxMarksInOneFrame: number;
  gaveUp: boolean;
  /** Frames sampled AFTER the first marker frame (only non-zero when the route keeps sampling). */
  postFrames: number;
  /** After the marker: frames with a skeleton visible, with a mark visible, and with the marker gone again. */
  postSkeletonFrames: number;
  postMarkFrames: number;
  postMarkerLostFrames: number;
  /** Time from the first marker frame to the last sampled frame (how long the probe kept looking after the page showed). */
  postSpanMs: number;
  /** Frames after the marker, later than MARK_GONE_WITHIN_MS from it, that still show a loader mark. */
  lateMarkFrames: number;
  /** Frame index and time (ms since navigation) of the first frame showing signed-in-only UI; -1 when never. */
  signedInFrame: number;
  signedInMs: number;
}

/** Count visible -> hidden -> visible runs of any per-frame flag. */
function countEpisodes(flags: boolean[]): number {
  let episodes = 0;
  let prev = false;
  for (const f of flags) {
    if (f && !prev) episodes += 1;
    prev = f;
  }
  return episodes;
}

function summarise(result: ProbeResult): Summary {
  const all = result.samples;
  const markerFrame = all.findIndex((s) => s.markerPresent);
  // Everything about "loading" is judged up to the first frame the destination showed; what happens after is the
  // post* group. With no marker the whole run is the loading phase.
  const samples = markerFrame >= 0 ? all.slice(0, markerFrame + 1) : all;
  const post = markerFrame >= 0 ? all.slice(markerFrame + 1) : [];
  const markerMs = markerFrame >= 0 ? all[markerFrame].t : 0;
  const signedInFrame = all.findIndex((s) => s.signedIn);
  const markFrames = samples.map((s, i) => (s.marks.length > 0 ? i : -1)).filter((i) => i >= 0);
  const firstMarkFrame = markFrames.length ? markFrames[0] : -1;

  const episodes = countEpisodes(samples.map((s) => s.marks.length > 0));
  const skeletonEpisodes = countEpisodes(samples.map((s) => s.skeletons > 0));

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
    frames: all.length,
    markFrames: markFrames.length,
    firstMarkFrame,
    markerFrame,
    episodes,
    skeletonEpisodes,
    centreRangeX: Math.round(range(xs) * 100) / 100,
    centreRangeY: Math.round(range(ys) * 100) / 100,
    loadingTextFrames: all.flatMap((s, i) => s.loadingText.map((text) => ({ frame: i, text }))),
    slowLineFrames: all.filter((s) => s.slowLines > 0).length,
    blankFrames,
    contentFramesWhileMark: samples.filter((s) => s.marks.length > 0 && s.contentChars > 0).length,
    skeletonFrames: samples.filter((s) => s.skeletons > 0).length,
    maxMarksInOneFrame: Math.max(0, ...all.map((s) => s.marks.length)),
    gaveUp: result.gaveUp,
    postFrames: post.length,
    postSkeletonFrames: post.filter((s) => s.skeletons > 0).length,
    postMarkFrames: post.filter((s) => s.marks.length > 0).length,
    postMarkerLostFrames: post.filter((s) => !s.markerPresent).length,
    postSpanMs: post.length ? Math.round(post[post.length - 1].t - markerMs) : 0,
    lateMarkFrames: post.filter((s) => s.marks.length > 0 && s.t - markerMs > MARK_GONE_WITHIN_MS).length,
    signedInFrame,
    signedInMs: signedInFrame >= 0 ? all[signedInFrame].t : -1,
  };
}

/**
 * What the frames AFTER the marker must show, on every route: the probe kept looking for POST_MARKER_MS, the
 * destination never went away, and no loader mark is still up once the hand-over grace has passed. A loader that
 * stays mounted over loaded content fails the last two; a probe that stopped at the marker fails the first.
 */
function settleProblems(s: Summary): string[] {
  const problems: string[] = [];
  if (s.markerFrame < 0) return problems; // the gaveUp check reports this
  if (s.postSpanMs < POST_MARKER_MS) problems.push(`sampling stopped ${s.postSpanMs}ms after the marker (needs ${POST_MARKER_MS}ms), so a loader still covering the page could not be seen`);
  if (s.postMarkerLostFrames > 0) problems.push(`the destination went away again in ${s.postMarkerLostFrames} frame(s) after it showed`);
  if (s.lateMarkFrames > 0) problems.push(`a loader mark was still visible in ${s.lateMarkFrames} frame(s) more than ${MARK_GONE_WITHIN_MS}ms after the destination showed`);
  return problems;
}

/** One held PostgREST response, as the page was given it. */
interface HeldRead {
  /** Epoch ms at which it was released to the page. */
  at: number;
  status: number;
  /** `p_id` the request carried (RPCs), when its body was JSON. */
  pId?: unknown;
  /** `id` of the row the response carried, when its body was JSON. */
  bodyId?: unknown;
}

/**
 * Is a green "auth resolved late" result about what it claims? The held profile read must have succeeded for THIS
 * user (a 2xx carrying their id, not a failed or other-user read), have been released after the list was drawn, and the
 * signed-in UI must then have appeared, never before the profile reached the page.
 */
function lateAuthPreconditionProblems(
  reads: HeldRead[],
  userId: string,
  markerEpoch: number,
  signedInEpoch: number | null,
  minLateMs: number,
): string[] {
  const problems: string[] = [];
  const mine = reads.filter((r) => r.pId === userId);
  if (mine.length === 0) return [`no profile read for the test user was released (${reads.length} other profile read(s)), auth cannot have resolved`];
  const good = mine.filter((r) => r.status >= 200 && r.status < 300 && r.bodyId === userId);
  if (good.length === 0) {
    return [`no profile read succeeded for the test user: ${mine.map((r) => `status ${r.status} id ${String(r.bodyId)}`).join('; ')}`];
  }
  const profileAt = Math.min(...good.map((r) => r.at));
  const lateBy = profileAt - markerEpoch;
  if (lateBy <= minLateMs) problems.push(`the profile arrived ${Math.round(-lateBy)}ms BEFORE the list, so auth did not resolve after the page`);
  if (signedInEpoch === null) problems.push('the signed-in UI never appeared, so the person never resolved');
  else if (signedInEpoch < profileAt - 100) problems.push(`the signed-in UI showed ${Math.round(profileAt - signedInEpoch)}ms before the profile reached the page`);
  return problems;
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

interface HoldOptions {
  /** Paths (after `/rest/v1/`) held for longer than HOLD_MS, with their own hold. Used to make auth resolve late. */
  slow?: { path: string; ms: number }[];
  /** Hold per response (default HOLD_MS). The hold is paid by EVERY request, so a long sequential chain multiplies it. */
  holdMs?: number;
}

/**
 * Hold every PostgREST response (reads and RPCs) for HOLD_MS. Auth, realtime and functions pass straight through.
 * `fulfilled` logs when each response was released to the page (epoch ms), keyed by path, so a test can order
 * "the session's profile arrived" against "the list was drawn".
 */
async function holdBackendReads(page: Page, opts: HoldOptions = {}) {
  const origin = process.env.VITE_SUPABASE_URL;
  if (!origin) throw new Error('VITE_SUPABASE_URL is not set; .env.test.local should provide it');
  const restPrefix = new RegExp(`^${escapeRe(origin.replace(/\/$/, ''))}/rest/v1/`);
  let count = 0;
  const fulfilled: Record<string, number[]> = {};
  const reads: Record<string, HeldRead[]> = {};
  await page.route(restPrefix, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.continue();
    try {
      const path = new URL(route.request().url()).pathname.replace(/^.*\/rest\/v1\//, '');
      const hold = opts.slow?.find((x) => x.path === path)?.ms ?? opts.holdMs ?? HOLD_MS;
      const response = await route.fetch();
      // What the page is about to be given: status and identity, for the late-auth precondition.
      let pId: unknown;
      let bodyId: unknown;
      try {
        pId = (route.request().postDataJSON() as { p_id?: unknown } | null)?.p_id;
      } catch { /* not a JSON body */ }
      try {
        const body: unknown = await response.json();
        const row = Array.isArray(body) ? body[0] : body;
        bodyId = row && typeof row === 'object' ? (row as { id?: unknown }).id : undefined;
      } catch { /* empty or non-JSON body */ }
      await new Promise((r) => setTimeout(r, hold));
      count += 1;
      const at = Date.now();
      (fulfilled[path] ??= []).push(at);
      (reads[path] ??= []).push({ at, status: response.status(), pId, bodyId });
      await route.fulfill({ response });
    } catch {
      // The page navigated away or the request was aborted; nothing left to hold.
      await route.continue().catch(() => undefined);
    }
  });
  return { held: () => count, fulfilled, reads };
}

interface RouteOptions extends HoldOptions {
  /** Keep sampling this long after the marker first shows (never less than POST_MARKER_MS), to check the page is not redrawn. */
  afterMarkerMs?: number;
  /** Selector for UI only a resolved signed-in person sees; see ProbeConfig. */
  signedInSelector?: string;
}

interface Measured {
  summary: Summary;
  result: ProbeResult;
  heldRequests: number;
  fulfilled: Record<string, number[]>;
  reads: Record<string, HeldRead[]>;
}

async function measureRoute(
  page: Page,
  testInfo: TestInfo,
  name: string,
  url: string,
  markers: Marker[],
  opts: RouteOptions = {},
): Promise<Measured> {
  const hold = await holdBackendReads(page, opts);
  const cfg: ProbeConfig = {
    markers,
    markMinOpacity: MARK_MIN_OPACITY,
    giveUpMs: PROBE_GIVE_UP_MS,
    afterMarkerMs: Math.max(opts.afterMarkerMs ?? 0, POST_MARKER_MS),
    signedInSelector: opts.signedInSelector,
  };
  await page.addInitScript(installProbe, cfg);

  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction(
    () => (window as unknown as { __p1586?: ProbeResult }).__p1586?.done === true,
    null,
    { timeout: PROBE_GIVE_UP_MS + cfg.afterMarkerMs + 5000, polling: 100 },
  );
  const result = await page.evaluate(() => (window as unknown as { __p1586: ProbeResult }).__p1586);
  const summary = summarise(result);

  // Evidence for a failure: the frames where what is on screen changed (the visible marks and their rounded
  // centres, whether a skeleton is up, whether any text outside the chrome is up, whether the marker is up).
  let last = '';
  const timeline: string[] = [];
  result.samples.forEach((s, i) => {
    const marks = s.marks.map((m) => `${m.owner}(${Math.round(m.cx)},${Math.round(m.cy)})`).join('') || 'none';
    const sig = `${marks}${s.skeletons ? '+skel' : ''}${s.contentChars > 0 ? '+text' : ''}${s.markerPresent ? '+MARKER' : ''}${s.signedIn ? '+SIGNEDIN' : ''}`;
    if (sig !== last) {
      timeline.push(`f${i}@${Math.round(s.t)}ms:${sig}`);
      last = sig;
    }
  });
  console.log(`[P1586 ${name}] timeline ${timeline.join(' ')}`);

  await testInfo.attach(`${name}-samples.json`, { body: JSON.stringify(result.samples), contentType: 'application/json' });
  console.log(`[P1586 ${name}] ${JSON.stringify(summary)} heldRequests=${hold.held()} finalUrl=${page.url()}`);
  return { summary, result, heldRequests: hold.held(), fulfilled: hold.fulfilled, reads: hold.reads };
}

function assertContinuity(name: string, { summary: s, heldRequests }: Measured): void {
  // The probe must have reached the marker, else every check below is about a page that never loaded.
  expect(s.gaveUp, `${name}: marker never appeared within ${PROBE_GIVE_UP_MS}ms`).toBe(false);
  expect(heldRequests, `${name}: no backend response was held, so the loader was not forced`).toBeGreaterThan(0);

  // 1. Not vacuous.
  expect(s.markFrames, `${name}: the loader mark was never visible (${s.frames} frames sampled)`).toBeGreaterThan(0);
  // 2. The mark does not move.
  expect(s.centreRangeX, `${name}: mark centre moved ${s.centreRangeX}px horizontally`).toBeLessThanOrEqual(MAX_CENTRE_MOVE_PX);
  expect(s.centreRangeY, `${name}: mark centre moved ${s.centreRangeY}px vertically`).toBeLessThanOrEqual(MAX_CENTRE_MOVE_PX);
  // 3. No "Loading" text on any frame, and no deadline fallback line (these waits are 1.5s, far under 10s / 15s).
  expect(s.loadingTextFrames, `${name}: "Loading" text visible`).toEqual([]);
  expect(s.slowLineFrames, `${name}: a "taking longer than usual" line showed; the wait reached its deadline`).toBe(0);
  // 4. No blank content between the first mark frame and the marker.
  expect(ranges(s.blankFrames), `${name}: blank content frames after the mark first showed (frame ${s.firstMarkFrame}, marker at ${s.markerFrame})`).toBe('');
  // 5. One episode.
  expect(s.episodes, `${name}: the mark showed ${s.episodes} separate times`).toBeLessThanOrEqual(1);
  // 6. Hand-over: the loader is gone once the destination showed, and the destination stays (see settleProblems).
  expect(settleProblems(s), `${name}: the frames after the destination showed`).toEqual([]);
}

/**
 * "Drawn once": after the destination first showed, no skeleton and no mark came back and the destination never
 * went away. This is the flicker the session-verified identity fix removed: the list is read per group, never
 * per person, so a person arriving late must not put the list back to waiting.
 */
function assertDrawnOnce(name: string, m: Measured, expectLateAuthMs: number, userId: string): void {
  const s = m.summary;
  expect(s.postFrames, `${name}: no frames were sampled after the list showed, so redraw could not be seen`).toBeGreaterThan(20);
  expect(s.postSkeletonFrames, `${name}: a skeleton reappeared after the list was visible`).toBe(0);
  expect(s.postMarkFrames, `${name}: the loader mark reappeared after the list was visible`).toBe(0);
  expect(s.postMarkerLostFrames, `${name}: the list went away again after it was visible`).toBe(0);

  // Precondition, not an assertion about the app: the session's profile must have been READ SUCCESSFULLY for this
  // user and have arrived AFTER the list was drawn, and the signed-in UI must have appeared on the back of it, else
  // this run never had the "auth resolves late" shape (a failed or retried read would look the same) and green means nothing.
  const markerEpoch = m.result.startEpoch + m.result.samples[s.markerFrame].t;
  const signedInEpoch = s.signedInFrame >= 0 ? m.result.startEpoch + m.result.samples[s.signedInFrame].t : null;
  const profileReads = m.reads['rpc/get_profile_by_id'] ?? [];
  expect(lateAuthPreconditionProblems(profileReads, userId, markerEpoch, signedInEpoch, expectLateAuthMs), `${name}: late-auth precondition`).toEqual([]);
  // ...and the sampling window must still have been running well after it, or a redraw caused by the identity
  // change (the marks read, the profile follow-ups) would land after the probe stopped looking.
  const profileAt = Math.min(...profileReads.filter((r) => r.pId === userId && r.status >= 200 && r.status < 300).map((r) => r.at));
  const windowEndEpoch = m.result.startEpoch + m.result.samples[m.result.samples.length - 1].t;
  expect(windowEndEpoch - profileAt, `${name}: sampling stopped too soon after the profile arrived`).toBeGreaterThan(3000);
}

// ---------------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------------

interface Viewport {
  label: string;
  width: number;
  height: number;
  touch: boolean;
}

const VIEWPORTS: Viewport[] = [
  { label: '1440x900', width: 1440, height: 900, touch: false },
  { label: '375x812', width: 375, height: 812, touch: true },
  { label: '320x700', width: 320, height: 700, touch: true },
];

/**
 * Late-auth runs hold the session's profile this long. The list itself takes ~6-7s under a 1.5s hold per request (its
 * reads are sequential), so the profile must outlast that; assertDrawnOnce checks the ordering from the observed times.
 */
const LATE_PROFILE_MS = 11_000;
/**
 * /compare/:slug and /events/:slug/room reach first paint through a long sequential chain of reads (27 and 54-63 held
 * requests in the measured runs). The hold is paid by every request, so at HOLD_MS the wait stops being "the loader for
 * a moment" and becomes 17s (compare, past its own 15s deadline: the "taking longer than usual" line showed, correctly)
 * or 30-40s (room, past this probe's give-up). A shorter hold keeps those chains inside the deadlines while the loader
 * is still on screen for seconds, which is what the continuity properties need.
 */
const CHAIN_HOLD_MS = 500;

/**
 * UI that exists only once the signed-in person's profile has resolved: the phone's "You" tab, the desktop rail's
 * avatar, the expanded sidebar's account button, and the top bar's avatar button (the signed-out hamburger on the
 * same button has an icon, not an avatar, so it does not match). Until the profile arrives each is a placeholder.
 */
const SIGNED_IN_UI = [
  '[data-testid="bottom-nav-me"]',
  '[data-testid="rail-avatar"]',
  'nav[data-nav="sidebar"] button[aria-label="Menu"]',
  'button[aria-label="Menu"] [data-testid="gravatar-avatar"]',
].join(', ');

/** Sampling continues this long after the list shows: long enough for the profile, its follow-up reads and the marks read, each held. */
const LATE_AUTH_WINDOW_MS = 11_000;

test.describe('P1586: per-frame loading continuity', () => {
  test.describe.configure({ timeout: 120_000 });

  let user: TestUser;
  let other: TestUser;
  let event: TestEvent;
  let roomEvent: TestEvent;
  let cmName: string | null = null;
  // The group late-auth test needs an event card under /groups/cm, which lists only events of that organization.
  // Its own host (made an organizer of cm by the helper) and its own event, so the test never depends on what else
  // is on TEST, and the main test user is not turned into a member of cm (that would change /groups/cm/join).
  let cmHost: TestUser | null = null;
  let cmEvent: TestEvent | null = null;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P1586 Continuity' });
    // The other person: host of the room event and the person the compare page looks at.
    other = await createTestUser({ name: 'P1586 Other' });
    // Upcoming, a week out, so it is listed whatever the list's time window is.
    event = await createTestEvent(user.user.id, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), {
      title: `P1586 Continuity Event ${Date.now()}`,
    });
    // The room event: starting now, hosted by someone else, with `user` registered. The same fixture
    // e2e/p1114-event-room.spec.ts uses to reach /events/:slug/room as a registered visitor.
    roomEvent = await createTestEvent(other.user.id, new Date(), { title: `P1586 Room Event ${Date.now()}` });
    await rsvpToEvent(roomEvent.id, user.user.id);
    const { data } = await supabaseAdmin.from('organization').select('id, name').eq('slug', 'cm').maybeSingle();
    cmName = data?.name ?? null;
    if (data?.id) {
      cmHost = await createTestUser({ name: 'P1586 Group Host' });
      cmEvent = await createTestEvent(cmHost.user.id, new Date(Date.now() + 8 * 24 * 60 * 60 * 1000), {
        title: `P1586 Group Event ${Date.now()}`,
        orgId: data.id,
      });
    }
  });

  test.afterAll(async () => {
    if (event?.id) await deleteTestEvent(event.id);
    if (roomEvent?.id) await deleteTestEvent(roomEvent.id);
    if (cmEvent?.id) await deleteTestEvent(cmEvent.id);
    // Deleting the host removes its organizer membership with it (cascade path, which the last-organizer guard allows).
    if (cmHost?.user?.id) await deleteTestUser(cmHost.user.id);
    if (user?.user?.id) await deleteTestUser(user.user.id);
    if (other?.user?.id) await deleteTestUser(other.user.id);
  });

  // Smoke assertions live in the first test (tests.md): the pages the rest of the file measures load at
  // all, un-throttled, without an uncaught error.
  test('smoke: page loads and has no console errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    // 20s, not the 5s default: TEST is shared and the dev server cold-compiles these routes; this asks "does it load", not "how fast".
    await page.goto('/events/list');
    await expect(page.getByTestId('event-card').first()).toBeVisible({ timeout: 20_000 });
    await page.goto('/events');
    await expect(page.getByTestId('event-card').first()).toBeVisible({ timeout: 20_000 });
    expect(pageErrors).toEqual([]);
  });

  // Gate-7 controls for the analyser itself: synthetic frame lists, one per property, each of which must be
  // caught. Without these a green run on the real routes could mean "the analyser cannot see this".
  test('analyser controls: each failure shape is detected', () => {
    const mark = (cx: number, cy: number): MarkSample => ({ cx, cy, w: 64, h: 64, opacity: 1, owner: 'bare-mark' });
    const frame = (over: Partial<FrameSample>): FrameSample => ({
      t: 0, marks: [], loadingText: [], slowLines: 0, skeletons: 0, contentChars: 0, markerPresent: false, signedIn: false, ...over,
    });
    const run = (samples: FrameSample[]) => summarise({ done: true, gaveUp: false, startEpoch: 0, samples });
    const done = frame({ markerPresent: true, contentChars: 10 });

    // Clean: one mark, then the marker.
    const clean = run([frame({ marks: [mark(640, 360)] }), frame({ marks: [mark(640, 360)] }), done]);
    expect(clean).toMatchObject({ episodes: 1, skeletonEpisodes: 0, centreRangeY: 0, blankFrames: [], markFrames: 2, postFrames: 0 });
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
    // A deadline fallback line is counted, and is NOT "Loading" text.
    const slow = run([frame({ marks: [mark(640, 360)], slowLines: 1 }), done]);
    expect(slow.slowLineFrames).toBe(1);
    expect(slow.loadingTextFrames).toEqual([]);
    // Vacuous: no mark at all.
    expect(run([frame({ contentChars: 5 }), done]).markFrames).toBe(0);
    // Skeleton episodes: skeleton, gap, skeleton is two (the list flickered before it showed).
    expect(run([frame({ skeletons: 1 }), frame({ contentChars: 3 }), frame({ skeletons: 1 }), done]).skeletonEpisodes).toBe(2);
    // Redraw AFTER the marker: a skeleton, a mark, and the marker going away are each counted, and none of it
    // leaks into the loading-phase numbers.
    const redraw = run([
      frame({ marks: [mark(640, 360)] }),
      done,
      frame({ skeletons: 1 }),
      frame({ marks: [mark(640, 360)] }),
      frame({ contentChars: 4 }),
      done,
    ]);
    expect(redraw).toMatchObject({ postFrames: 4, postSkeletonFrames: 1, postMarkFrames: 1, postMarkerLostFrames: 3, episodes: 1, skeletonEpisodes: 0 });
    // A page that stays drawn after the marker has no post* findings.
    expect(run([frame({ marks: [mark(640, 360)] }), done, done, done])).toMatchObject({
      postFrames: 2, postSkeletonFrames: 0, postMarkFrames: 0, postMarkerLostFrames: 0,
    });
  });

  // Gate-7 controls for the hand-over check (settleProblems): a loader that never leaves must fail it, a clean
  // hand-over (including a short cross-fade) must pass it, and a probe that stopped at the marker must fail it.
  test('analyser controls: the loader still covering loaded content is detected', () => {
    const mark: MarkSample = { cx: 640, cy: 360, w: 64, h: 64, opacity: 1, owner: 'content-loader' };
    const at = (t: number, over: Partial<FrameSample> = {}): FrameSample => ({
      t, marks: [], loadingText: [], slowLines: 0, skeletons: 0, contentChars: 10, markerPresent: false, signedIn: false, ...over,
    });
    const run = (samples: FrameSample[]) => summarise({ done: true, gaveUp: false, startEpoch: 0, samples });
    // Frames every 100ms; the marker shows at t=200 and the probe keeps going to t=1300.
    const timeline = (perFrame: (t: number) => Partial<FrameSample>) => {
      const out: FrameSample[] = [at(0, { marks: [mark], contentChars: 0 }), at(100, { marks: [mark], contentChars: 0 })];
      for (let t = 200; t <= 1300; t += 100) out.push(at(t, { markerPresent: true, ...perFrame(t) }));
      return out;
    };

    // Clean: the mark fades out within the grace and the marker stays.
    expect(settleProblems(run(timeline((t) => (t <= 300 ? { marks: [mark] } : {}))))).toEqual([]);
    // BAD: the loader is mounted for ever alongside the marker. The old checks (stop at the marker) pass this shape.
    const permanent = run(timeline(() => ({ marks: [mark] })));
    expect(permanent).toMatchObject({ episodes: 1, blankFrames: [], centreRangeY: 0 });
    expect(settleProblems(permanent)).toEqual([expect.stringContaining('loader mark was still visible')]);
    // BAD: the loader lingers beyond the grace and then goes (still a loader over loaded content).
    expect(settleProblems(run(timeline((t) => (t <= 900 ? { marks: [mark] } : {}))))).toEqual([expect.stringContaining('loader mark was still visible')]);
    // BAD: the destination goes away again.
    expect(settleProblems(run(timeline((t) => (t >= 600 && t <= 700 ? { markerPresent: false } : {}))))).toEqual([expect.stringContaining('went away again')]);
    // BAD: sampling stopped at the marker (the old default), so nothing after it was seen.
    expect(settleProblems(run([at(0, { marks: [mark], contentChars: 0 }), at(100, { markerPresent: true })]))).toEqual([expect.stringContaining('sampling stopped')]);
    // BAD: sampling stopped 400ms after the marker.
    expect(settleProblems(run(timeline(() => ({})).filter((f) => f.t <= 600)))).toEqual([expect.stringContaining('sampling stopped')]);
  });

  // Gate-7 controls for the late-auth precondition: each way the profile read can fail to prove "auth resolved after the
  // page, successfully, for this person" must be reported.
  test('analyser controls: the late-auth precondition rejects a failed or foreign profile read', () => {
    const me = 'user-me';
    const ok: HeldRead = { at: 20_000, status: 200, pId: me, bodyId: me };
    const check = (reads: HeldRead[], signedInEpoch: number | null = 20_100) => lateAuthPreconditionProblems(reads, me, 5000, signedInEpoch, 500);
    expect(check([ok])).toEqual([]);
    // A failed read (the old code recorded it as "arrived").
    expect(check([{ ...ok, status: 500, bodyId: undefined }])).toEqual([expect.stringContaining('no profile read succeeded')]);
    // A 2xx that is somebody else's profile.
    expect(check([{ ...ok, bodyId: 'user-other' }])).toEqual([expect.stringContaining('no profile read succeeded')]);
    // A null body (no row for the id).
    expect(check([{ ...ok, bodyId: undefined }])).toEqual([expect.stringContaining('no profile read succeeded')]);
    // Only another person's read was released.
    expect(check([{ ...ok, pId: 'user-other', bodyId: 'user-other' }])).toEqual([expect.stringContaining('no profile read for the test user')]);
    // A failed read plus a success: timed on the success only. Here the success is before the list was drawn, so rejected...
    expect(check([{ ...ok, at: 6000, status: 503 }, { ...ok, at: 5100 }])).toEqual([expect.stringContaining('BEFORE the list')]);
    // ...and an early failure followed by a late success is accepted (the failure is not what is timed).
    expect(check([{ ...ok, at: 1000, status: 503 }, ok])).toEqual([]);
    // Arrived before the list was drawn.
    expect(check([{ ...ok, at: 4000 }], 4100)).toEqual([expect.stringContaining('BEFORE the list')]);
    // The signed-in UI never appeared.
    expect(check([ok], null)).toEqual([expect.stringContaining('signed-in UI never appeared')]);
    // The signed-in UI was already up before the profile reached the page (so it does not depend on it).
    expect(check([ok], 15_000)).toEqual([expect.stringContaining('before the profile reached the page')]);
    // The summary carries the first signed-in frame.
    const run = summarise({
      done: true, gaveUp: false, startEpoch: 0, samples: [
        { t: 0, marks: [], loadingText: [], slowLines: 0, skeletons: 0, contentChars: 3, markerPresent: true, signedIn: false },
        { t: 50, marks: [], loadingText: [], slowLines: 0, skeletons: 0, contentChars: 3, markerPresent: true, signedIn: true },
      ],
    });
    expect(run).toMatchObject({ signedInFrame: 1, signedInMs: 50 });
  });

  for (const vp of VIEWPORTS) {
    // 1440 runs every route. The narrow two run the signed-out pages, /feed (the shell's own route) and the
    // events list in both states: the widths where the page loader's centring and the skeletons' wrap can differ.
    const full = vp.width >= 1440;
    const at = (name: string) => `[${vp.label}] ${name}`;
    const tag = (name: string) => `${name}-${vp.width}`;

    test.describe(`at ${vp.label}`, () => {
      test.use({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.touch,
        hasTouch: vp.touch,
      });

      test.describe('signed out', () => {
        // The default context carries any saved auth state from .private/test-auth; these routes must be measured signed out.
        test.use({ storageState: { cookies: [], origins: [] } });

        test(at('/groups/cm'), async ({ page }, testInfo) => {
          test.skip(!cmName, 'the seeded group "cm" does not exist on this database');
          const m = await measureRoute(page, testInfo, tag('groups-cm'), '/groups/cm', [
            { selector: 'h1', text: `^${escapeRe(cmName!)}$` },
          ]);
          assertContinuity('/groups/cm', m);
        });

        test(at('/events (redirects to /groups/cm)'), async ({ page }, testInfo) => {
          const m = await measureRoute(page, testInfo, tag('events'), '/events', [
            { selector: '[data-testid="event-card"]' },
          ]);
          assertContinuity('/events', m);
        });

        test(at('/events/list (standalone list)'), async ({ page }, testInfo) => {
          const m = await measureRoute(page, testInfo, tag('events-list'), '/events/list', [
            { selector: '[data-testid="event-card"]' },
          ]);
          assertContinuity('/events/list', m);
        });

        test(at('/events/:slug'), async ({ page }, testInfo) => {
          test.skip(!full, 'narrow widths run the signed-out lists and /feed only');
          const m = await measureRoute(page, testInfo, tag('event-detail'), `/events/${event.slug}`, [
            { selector: 'h1', text: `^${escapeRe(event.title)}$` },
          ]);
          assertContinuity('/events/:slug', m);
        });
      });

      test.describe('signed in (verified test user)', () => {
        test(at('/feed'), async ({ page }, testInfo) => {
          await setTestSession(page, user.email);
          const m = await measureRoute(page, testInfo, tag('feed'), '/feed', [
            // Content arrived: a story or point card, or the feed's own empty state.
            { selector: '[data-testid^="feed-story-card-"], [data-testid^="feed-point-card-"]' },
            { selector: 'h2', text: '^No public content yet$' },
          ]);
          assertContinuity('/feed', m);
        });

        test(at('/events/list, signed in'), async ({ page }, testInfo) => {
          await setTestSession(page, user.email);
          const m = await measureRoute(page, testInfo, tag('events-list-in'), '/events/list', [
            { selector: '[data-testid="event-card"]' },
          ]);
          assertContinuity('/events/list (signed in)', m);
        });

        // The flicker case: the list is drawn first, the person's profile arrives seconds later. The list
        // must be drawn once. Run on the standalone list and on the group page (the org-scoped list).
        test(at('/events/list, signed in, auth resolves after the list'), async ({ page }, testInfo) => {
          await setTestSession(page, user.email);
          const m = await measureRoute(page, testInfo, tag('events-list-late-auth'), '/events/list', [
            { selector: '[data-testid="event-card"]' },
          ], { slow: [{ path: 'rpc/get_profile_by_id', ms: LATE_PROFILE_MS }], afterMarkerMs: LATE_AUTH_WINDOW_MS, signedInSelector: SIGNED_IN_UI });
          assertContinuity('/events/list (late auth)', m);
          assertDrawnOnce('/events/list (late auth)', m, 500, user.user.id);
        });

        test(at('/groups/cm, signed in, auth resolves after the list'), async ({ page }, testInfo) => {
          test.skip(!cmName || !cmEvent, 'the seeded group "cm" does not exist on this database');
          await setTestSession(page, user.email);
          // The marker is this test's own event under cm (seeded in beforeAll), not "any card".
          const m = await measureRoute(page, testInfo, tag('groups-cm-late-auth'), '/groups/cm', [
            { selector: '[data-testid="event-card"]', text: escapeRe(cmEvent!.title) },
          ], { slow: [{ path: 'rpc/get_profile_by_id', ms: LATE_PROFILE_MS }], afterMarkerMs: LATE_AUTH_WINDOW_MS, signedInSelector: SIGNED_IN_UI });
          assertContinuity('/groups/cm (late auth)', m);
          assertDrawnOnce('/groups/cm (late auth)', m, 500, user.user.id);
        });

        test(at('/settings'), async ({ page }, testInfo) => {
          test.skip(!full, 'narrow widths run the signed-out lists, /feed and the events lists only');
          await setTestSession(page, user.email);
          const m = await measureRoute(page, testInfo, tag('settings'), '/settings', [
            { selector: 'h1', text: '^Settings$' },
          ]);
          assertContinuity('/settings', m);
        });

        test(at('/letters (redirects to /artifacts)'), async ({ page }, testInfo) => {
          test.skip(!full, 'narrow widths run the signed-out lists, /feed and the events lists only');
          await setTestSession(page, user.email);
          const m = await measureRoute(page, testInfo, tag('letters'), '/letters', [
            // The list under the Artifacts tabs has drawn: a row, or the list's empty line.
            { selector: '[data-testid="artifact-row"]' },
            { selector: 'p', text: '^(Nothing has been shared with you yet\\.|No letters sent yet\\.|No canvases here yet\\.|Nothing here yet\\.)' },
          ]);
          assertContinuity('/letters', m);
        });

        test(at('/groups/cm/join'), async ({ page }, testInfo) => {
          test.skip(!full, 'narrow widths run the signed-out lists, /feed and the events lists only');
          test.skip(!cmName, 'the seeded group "cm" does not exist on this database');
          await setTestSession(page, user.email);
          const m = await measureRoute(page, testInfo, tag('groups-cm-join'), '/groups/cm/join', [
            { selector: 'h1', text: `^Join ${escapeRe(cmName!)}$` },
          ]);
          assertContinuity('/groups/cm/join', m);
        });

        // Registered for a room event that is open now: the gate shows the page loader while access, the
        // arrival/prep gates and the person's own seat resolve, then redirects to the readiness screen.
        test(at('/events/:slug/room'), async ({ page }, testInfo) => {
          test.skip(!full, 'narrow widths run the signed-out lists, /feed and the events lists only');
          await setTestSession(page, user.email);
          const m = await measureRoute(page, testInfo, tag('event-room'), `/events/${roomEvent.slug}/room`, [
            { selector: '[data-testid="room-ready"]' },
          ], { holdMs: CHAIN_HOLD_MS });
          assertContinuity('/events/:slug/room', m);
        });

        // ?tag= names the set, so the rows wait (section skeleton) is reached without seeding any answers:
        // the page loader first, then the page with a skeleton in place of the rows, then the empty line.
        test(at('/compare/:slug'), async ({ page }, testInfo) => {
          test.skip(!full, 'narrow widths run the signed-out lists, /feed and the events lists only');
          await setTestSession(page, user.email);
          const m = await measureRoute(page, testInfo, tag('compare'), `/compare/${other.slug}?tag=st1`, [
            { selector: 'p', text: '^(Nothing on .+ answered yet\\.|.+ hasn.t answered .+ yet\\.|.+ hasn.t answered any statements yet\\.)' },
            { selector: '[data-testid="compare-add-yours"]' },
            { selector: '[data-testid="compare-theirs-only"]' },
          ], { holdMs: CHAIN_HOLD_MS });
          assertContinuity('/compare/:slug', m);
        });

        test(at('/transcribe'), async ({ page }, testInfo) => {
          test.skip(!full, 'narrow widths run the signed-out lists, /feed and the events lists only');
          await setTestSession(page, user.email);
          const m = await measureRoute(page, testInfo, tag('transcribe'), '/transcribe', [
            { selector: '[data-testid="transcribe-consent-screen"]' },
          ]);
          assertContinuity('/transcribe', m);
        });
      });
    });
  }
});
