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
 *      - That is recorded ONCE, at boot (`stampHistoryBoot`), as `history.length > 1` — the only
 *        moment `history.length` means "entries before me". Read later it also counts FORWARD
 *        entries: cold /story → push /point → browser back leaves length 2 at index 0, and the
 *        old `length <= 1` test popped at index 0, which does nothing (P1364 review: a dead
 *        Back button).
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

/** The field stamped onto the boot entry's history state. */
export const HAD_PREDECESSOR_FIELD = 'p1364HadPredecessor';

let bootHadPredecessor: boolean | null = null;

/**
 * Call once at app boot, before the router mounts. Records whether the tab held a page before
 * this app's first entry — on the entry's own state (merged, so react-router's fields survive)
 * and in module memory (a router `replace` at index 0 rewrites the state and drops the stamp).
 */
export function stampHistoryBoot(): void {
  try {
    const state = (window.history.state ?? {}) as Record<string, unknown>;
    const stamped = state[HAD_PREDECESSOR_FIELD];
    if (typeof stamped === 'boolean') {
      bootHadPredecessor = stamped; // a reload of an entry stamped earlier keeps its answer
      return;
    }
    bootHadPredecessor = window.history.length > 1;
    window.history.replaceState({ ...state, [HAD_PREDECESSOR_FIELD]: bootHadPredecessor }, '');
  } catch {
    // history unavailable (sandboxed frame) — the length heuristic below still applies
  }
}

/** Test-only. */
export function __resetHistoryBootForTest(): void {
  bootHadPredecessor = null;
}

function firstEntryHadPredecessor(): boolean {
  const stamped = (window.history.state as Record<string, unknown> | null)?.[HAD_PREDECESSOR_FIELD];
  if (typeof stamped === 'boolean') return stamped;
  if (bootHadPredecessor !== null) return bootHadPredecessor;
  return window.history.length > 1; // never stamped (tests, embeds): the pre-P1364 rule
}

type NavigationApi = { canGoBack?: unknown };

/** 'pop' | 'fallback' for a router backed by window.history. Exported for tests. */
export function decideBrowserBack(): 'pop' | 'fallback' {
  const nav = (window as unknown as { navigation?: NavigationApi }).navigation;
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  let atFirstAppEntry: boolean;
  if (nav && typeof nav.canGoBack === 'boolean') atFirstAppEntry = !nav.canGoBack;
  else if (typeof idx === 'number') atFirstAppEntry = idx === 0;
  else return window.history.length <= 1 ? 'fallback' : 'pop'; // state wiped, no Navigation API
  if (!atFirstAppEntry) return 'pop';
  return firstEntryHadPredecessor() ? 'pop' : 'fallback';
}

export function useGoBack(fallbackPath: string): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const arrivedColdRef = useRef<boolean | null>(null);
  if (arrivedColdRef.current === null) arrivedColdRef.current = location.key === 'default';
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  return useCallback(() => {
    const browserBacked = window.location.pathname === pathnameRef.current;
    let decision: 'pop' | 'fallback';
    if (browserBacked) decision = decideBrowserBack();
    else decision = arrivedColdRef.current === true && window.history.length <= 1 ? 'fallback' : 'pop';
    if (decision === 'fallback') navigate(fallbackPath, { replace: true });
    else navigate(-1);
  }, [navigate, fallbackPath]);
}
