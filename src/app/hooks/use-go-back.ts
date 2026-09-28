/**
 * @file use-go-back.ts
 * @description "Go back" that returns to wherever the person came from — including a page
 * outside this app — and never strands someone who arrived cold.
 *
 * The logic is /stake's (P1296 + P1311), extracted so pages share it instead of copying it.
 * P1364: every Back control uses it — FocusHeader and BottomBackButton call it themselves from
 * their `fallback` prop, so a page declares where a cold arrival goes and nothing else.
 *
 * Two questions decide it:
 *   1. Is there an earlier entry OF THIS APP in the tab? Then pop.
 *      - `navigation.canGoBack` (Navigation API) answers it exactly where it exists.
 *      - Otherwise the router's history index: `history.state.idx > 0`. Never `location.key`
 *        alone — react-router mints a new key on every navigation, `replace` included
 *        (decisions.md 2026-09-11).
 *   2. At the app's first entry: was there a page BEFORE the app in this tab (P1311 — an
 *      outside page that linked here)? Then pop, back to that page; otherwise go to the
 *      fallback with `replace`.
 *      - That is a fact about the TAB's first app entry, recorded ONCE PER TAB at the app's
 *        first boot (`stampHistoryBoot`) as `history.length > 1` — the only moment
 *        `history.length` means "entries before me". Read later it also counts FORWARD
 *        entries: cold /story → push /point → browser back leaves length 2 at index 0, and the
 *        old `length <= 1` test popped at index 0, which does nothing (P1364 review: a dead
 *        Back button).
 *      - It lives in sessionStorage (per tab, survives reload). Every FRESH ARRIVAL into the
 *        app (Navigation Timing `navigate`, no history index > 0 in state) recomputes it and
 *        overwrites the stored value: leaving for an outside site and following a link back
 *        is a new arrival with a new answer (P1364 review 3). Only a `reload` or
 *        `back_forward` boot reuses the stored value — and must never re-derive it: there
 *        `history.length` counts the app's own earlier entries, reads "true", and made Back at
 *        index 0 pop into nothing (P1364 review 2, D1). Without sessionStorage such a boot
 *        records "no predecessor" — the fallback route, never a dead button.
 *      - A `back_forward` (or reload) boot into an OLDER app document reuses the NEWEST
 *        arrival's stored answer, which may be wrong for it. That case is identifiable — first
 *        app entry, the answer came from storage, the decision is "pop" — and ONLY there the
 *        pop is watched (P1364 review 4): if within DEAD_BACK_TIMEOUT_MS no popstate, pagehide
 *        or beforeunload shows the pop went anywhere, it was a dead button, and the fallback
 *        route is taken instead. Every other path pops or falls back exactly as before.
 *
 * Robust to a wiped history state (a page that called `replaceState(null, …)` drops the
 * router's `{ key, idx }`): with no index and no Navigation API, `history.length <= 1` is the
 * only safe signal — fallback — and anything else pops.
 *
 * Under an in-memory router (tests) window.history is not the router's history; the mount-time
 * `location.key === 'default'` answers "first entry" there, as before.
 */
import { useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** sessionStorage key: per tab, survives reload. */
export const TAB_HAD_PREDECESSOR_STORAGE_KEY = 'p1364:tabFirstEntryHadPredecessor';

let bootHadPredecessor: boolean | null = null;
/** True when this document's answer was READ from storage (a reload / back_forward boot), not measured. */
let bootAnswerFromStorage = false;

function readStored(): boolean | null {
  try {
    const v = window.sessionStorage.getItem(TAB_HAD_PREDECESSOR_STORAGE_KEY);
    return v === 'true' ? true : v === 'false' ? false : null;
  } catch {
    return null; // storage blocked (private mode, sandboxed frame)
  }
}

/** Is this document load a fresh arrival into the app (not a reload or a back/forward)? */
function isFreshArrival(): boolean {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  if (typeof idx === 'number' && idx > 0) return false; // a later entry of an earlier app session
  try {
    const nav = performance.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined;
    if (nav && nav.type !== 'navigate') return false; // reload / back_forward: not an arrival
  } catch {
    // no Navigation Timing — the index check above is all there is
  }
  return true;
}

/**
 * Call once at app boot, before the router mounts. A fresh arrival records whether the tab held
 * a page before it (overwriting any older answer); a reload or back/forward reuses the stored one.
 */
export function stampHistoryBoot(): void {
  if (!isFreshArrival()) {
    // history.length can no longer tell; the stored answer, else the one that is never dead.
    const stored = readStored();
    bootHadPredecessor = stored ?? false;
    bootAnswerFromStorage = stored !== null;
    return;
  }
  bootAnswerFromStorage = false;
  bootHadPredecessor = window.history.length > 1;
  try {
    window.sessionStorage.setItem(TAB_HAD_PREDECESSOR_STORAGE_KEY, String(bootHadPredecessor));
  } catch {
    // storage blocked: module memory still answers for this document
  }
}

/** Test-only. */
export function __resetHistoryBootForTest(): void {
  bootHadPredecessor = null;
  bootAnswerFromStorage = false;
}

function firstEntryHadPredecessor(): boolean {
  if (bootHadPredecessor !== null) return bootHadPredecessor;
  return window.history.length > 1; // never booted (tests, embeds): the pre-P1364 rule
}

type NavigationApi = { canGoBack?: unknown };

function safeDecode(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path; // a malformed escape: compare as-is
  }
}

/**
 * Is the router driving window.history (a BrowserRouter), or an in-memory router? The router's
 * own key on the current history entry is the direct signal; the path comparison — decoded on
 * both sides, so `ai%20safety` and `ai safety`, `caf%C3%A9` and `café` agree — covers a state
 * that was wiped. (P1364 review 2, D3. In react-router 7.13 both sides are measured to be
 * percent-encoded and equal, so this guards a future change rather than a present bug.)
 */
export function isBrowserBacked(routerLocation: { key: string; pathname: string }): boolean {
  const stateKey = (window.history.state as { key?: unknown } | null)?.key;
  if (typeof stateKey === 'string' && stateKey === routerLocation.key) return true;
  return safeDecode(window.location.pathname) === safeDecode(routerLocation.pathname);
}

/** 'pop' | 'fallback' for a router backed by window.history. Exported for tests. */
export type BackDecision = 'pop' | 'fallback' | 'pop-watched';

/**
 * 'pop-watched' = pop, but the pop rests on a stored (possibly stale) answer at the first app
 * entry, so the caller must watch it and fall back if it goes nowhere.
 */
export function decideBrowserBackDetailed(): BackDecision {
  const nav = (window as unknown as { navigation?: NavigationApi }).navigation;
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  let atFirstAppEntry: boolean;
  if (nav && typeof nav.canGoBack === 'boolean') atFirstAppEntry = !nav.canGoBack;
  else if (typeof idx === 'number') atFirstAppEntry = idx === 0;
  else return window.history.length <= 1 ? 'fallback' : 'pop'; // state wiped, no Navigation API
  if (!atFirstAppEntry) return 'pop';
  if (!firstEntryHadPredecessor()) return 'fallback';
  return bootAnswerFromStorage ? 'pop-watched' : 'pop';
}

/** 'pop' | 'fallback' — a watched pop is still a pop. */
export function decideBrowserBack(): 'pop' | 'fallback' {
  return decideBrowserBackDetailed() === 'fallback' ? 'fallback' : 'pop';
}

/** How long a watched pop may take to show any sign of leaving before it is called dead. */
export const DEAD_BACK_TIMEOUT_MS = 500;

/**
 * After a watched pop: if neither popstate (a same-document traversal) nor pagehide /
 * beforeunload (a cross-document one) arrives within DEAD_BACK_TIMEOUT_MS, the pop went
 * nowhere — call `onDead`. Returns a cancel function.
 */
export function watchForDeadBack(onDead: () => void): () => void {
  const events = ['popstate', 'pagehide', 'beforeunload'] as const;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    for (const e of events) window.removeEventListener(e, cancel, true);
  };
  // Capture phase: a capture listener elsewhere (the story guard) may stop propagation.
  for (const e of events) window.addEventListener(e, cancel, true);
  timer = setTimeout(() => {
    cancel();
    onDead();
  }, DEAD_BACK_TIMEOUT_MS);
  return cancel;
}

export function useGoBack(fallbackPath: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const arrivedColdRef = useRef<boolean | null>(null);
  if (arrivedColdRef.current === null) arrivedColdRef.current = location.key === 'default';
  const locationRef = useRef(location);
  locationRef.current = location;

  return useCallback(() => {
    const browserBacked = isBrowserBacked(locationRef.current);
    let decision: BackDecision;
    if (browserBacked) decision = decideBrowserBackDetailed();
    else decision = arrivedColdRef.current === true && window.history.length <= 1 ? 'fallback' : 'pop';
    if (decision === 'fallback') {
      navigate(fallbackPath, { replace: true });
      return;
    }
    if (decision === 'pop-watched') watchForDeadBack(() => navigate(fallbackPath, { replace: true }));
    navigate(-1);
  }, [navigate, fallbackPath]);
}
