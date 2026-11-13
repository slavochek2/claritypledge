/**
 * P1669: visit length. Mixpanel measures a session from its first to its last event, so a visitor
 * who reads without clicking produced a one-event, zero-second session (the 1-second median).
 *
 * Visible time is measured from timestamps, per page (pathname):
 * - `page_engaged` each time the visible time on this page passes another HEARTBEAT_SECONDS, up to
 *   CAP_SECONDS (an idle open tab cannot run up volume);
 * - `page_left` when the page is left (another route, a hidden tab, or closing), only with new
 *   visible time; hides count against MAX_LEAVES, the leave for another route always goes. Each carries
 *   the running visible total for this page view, and both events carry `view_id` (random per page
 *   view): the visit length is the largest `seconds_visible` per `view_id`, including a visit shorter than one interval, and the path it was on (the
 *   SDK's $current_url is already the next page after an in-app navigation). Hiding uses the beacon.
 * A local check every CHECK_MS notices route changes (no request: metered-services rule 3).
 *
 * Why a timer (rule 2): there is no push signal for "still reading"; without an event while the tab
 * is visible, a reader's session has no length. A hidden tab sends nothing (rule 3). Volume is
 * budgeted in the P1669 spec's Cost Budget.
 *
 * Tagged bots (index.html's P1669 block sets window.__p1669Bot) send nothing, except `webdriver`:
 * that is our own smokes and tests, which need it to prove the session length end to end.
 * The page path goes through the same before_send redaction as every event (room codes, chat ids).
 * Sent straight to the SDK rather than through analytics.track, so heartbeats never enter the
 * live-session ML event collector.
 */

export const HEARTBEAT_SECONDS = 30;
export const CAP_SECONDS = 10 * 60;
export const CHECK_MS = 1000;
/** A page reports its leave at most this many times (app switching on a phone hides and shows it). */
export const MAX_LEAVES = 3;

declare global {
  interface Window {
    __p1669Bot?: string;
  }
}

type Send = (event: string, props: Record<string, unknown>, beacon: boolean) => void;

export interface EngagementDeps {
  send: Send;
  isVisible: () => boolean;
  pathname: () => string;
  now: () => number;
  /** A random id per page view, so repeat visits to one path can be told apart. Not tied to a person. */
  newViewId: () => string;
  setInterval: (fn: () => void, ms: number) => unknown;
  /** Called with true when the tab becomes visible, false when hidden; `closing` is true on pagehide. */
  onVisibility: (fn: (visible: boolean, closing?: boolean) => void) => void;
}

/** Testable core: returns the handlers it registered. */
export function createEngagement(deps: EngagementDeps) {
  let path = deps.pathname();
  let visibleMs = 0;
  let visibleSince: number | null = deps.isVisible() ? deps.now() : null;
  let viewId = deps.newViewId();
  let beats = 0;
  let leaves = 0;
  let lastLeftSeconds = 0;

  /** Visible seconds on this page view, never above the cap. */
  const seconds = () => Math.min(CAP_SECONDS, Math.floor((visibleMs + (visibleSince === null ? 0 : deps.now() - visibleSince)) / 1000));

  /**
   * A hide counts against MAX_LEAVES; leaving for another route is the final leave of this view and
   * is always sent when there is new time, so the closing total is not lost after app switching.
   */
  const leave = (beacon: boolean, final: boolean) => {
    const s = seconds();
    if (s < 1 || s <= lastLeftSeconds) return;
    if (!final && leaves >= MAX_LEAVES) return;
    if (!final) leaves += 1;
    lastLeftSeconds = s;
    deps.send('page_left', { seconds_visible: s, page_path: path, view_id: viewId }, beacon);
  };

  const check = () => {
    const now = deps.pathname();
    if (now !== path) {
      // A hidden tab makes no requests (rule 3): a route change while hidden only starts the new view.
      if (deps.isVisible()) leave(false, true);
      path = now;
      viewId = deps.newViewId();
      visibleMs = 0;
      visibleSince = deps.isVisible() ? deps.now() : null;
      beats = 0;
      leaves = 0;
      lastLeftSeconds = 0;
      return;
    }
    if (visibleSince === null) return;
    const due = Math.floor(seconds() / HEARTBEAT_SECONDS);
    if (due <= beats) return;
    beats = due;
    deps.send('page_engaged', { seconds_visible: beats * HEARTBEAT_SECONDS, view_id: viewId }, false);
  };

  const visibility = (visible: boolean, closing = false) => {
    if (visible) {
      if (visibleSince === null) visibleSince = deps.now();
      return;
    }
    if (visibleSince !== null) {
      visibleMs += deps.now() - visibleSince;
      visibleSince = null;
    }
    // Closing the page is the final leave of this view, like leaving for another route.
    leave(true, closing);
  };

  deps.setInterval(check, CHECK_MS);
  deps.onVisibility(visibility);
  return { check, visibility };
}

/** People and our own webdriver smokes send heartbeats; every other tagged bot sends none. */
export function heartbeatAllowed(botReason: string | undefined): boolean {
  return !botReason || botReason === 'webdriver';
}

type TrackWithOptions = (event: string, props?: Record<string, unknown>, options?: Record<string, unknown>) => void;

/** Calls the SDK as a method: `track` needs its own `this` (a detached reference loses it). */
export function sendToMixpanel(event: string, props: Record<string, unknown>, beacon: boolean): void {
  const mp = typeof window === 'undefined' ? undefined : window.mixpanel;
  if (!mp) return;
  const track = mp.track as TrackWithOptions;
  if (beacon) track.call(mp, event, props, { transport: 'sendBeacon', send_immediately: true });
  else track.call(mp, event, props);
}

export function startEngagementTracking(): void {
  if (!import.meta.env.PROD || typeof window === 'undefined') return;
  if (!heartbeatAllowed(window.__p1669Bot)) return;
  createEngagement({
    send: sendToMixpanel,
    isVisible: () => document.visibilityState === 'visible',
    pathname: () => window.location.pathname,
    now: () => Date.now(),
    newViewId: () => Math.random().toString(36).slice(2, 10),
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    onVisibility: (fn) => {
      document.addEventListener('visibilitychange', () => fn(document.visibilityState === 'visible'));
      window.addEventListener('pagehide', () => fn(false, true));
    },
  });
}
