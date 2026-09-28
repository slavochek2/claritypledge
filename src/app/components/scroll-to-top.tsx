import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { forgetPosition, getSavedPosition, rememberPosition, scrollEntryKey } from "@/lib/scroll-positions";
import { migrateReturnState } from "@/lib/return-state";

/** How long a POP keeps re-applying the saved position while the page's content arrives. */
export const RESTORE_WINDOW_MS = 1500;
const RESTORE_RETRY_MS = 16;
/**
 * Any of these means the reader has taken over — the restore stops at once. `scroll` is
 * deliberately NOT one of them: the restore's own `scrollTo` fires scroll events. A wheel event
 * that is mostly HORIZONTAL is ignored too: a macOS two-finger swipe-back keeps delivering
 * momentum wheel events into the page it lands on, and those must not cancel its restore.
 */
const READER_INPUT_EVENTS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

function isReaderInput(e: Event): boolean {
  if (e.type !== "wheel") return true;
  const w = e as WheelEvent;
  return !(Math.abs(w.deltaY) < Math.abs(w.deltaX)); // ignore only |deltaY| < |deltaX|
}

/**
 * Scroll manager for route changes. Must be placed inside Router context.
 *
 * - PUSH, or a REPLACE to a different pathname → start at top (the app's "every route starts
 *   at top" contract).
 * - REPLACE that keeps the pathname (a search-param change: a feed tab, sort, the search box)
 *   → stay where the reader is (P1364).
 * - POP (back/forward) → restore the position that history entry had. The page usually
 *   remounts and fetches, so at the first frame the document is only a spinner tall and the
 *   browser clamps the scroll to ~0. P1364: for RESTORE_WINDOW_MS every animation frame checks
 *   the position and re-applies the target whenever it has drifted (still too short, or cards
 *   above it re-opened / swapped in after the first attempt), and it stops at the reader's first
 *   wheel / touch / key / pointer input. A value clamped mid-restore is never saved as the
 *   entry's position.
 * - Reload → top, deterministically: scrollRestoration "manual" stops the browser's late async
 *   restore from overriding the mount-time scrollTo, and the in-memory map is empty on a fresh
 *   load.
 */
export function ScrollToTop() {
  const location = useLocation();
  const navigationType = useNavigationType();
  // P1364: key + pathname + search — see scroll-positions.ts for why the key alone is not enough.
  const entry = scrollEntryKey(location.key, location.pathname, location.search);

  const prevPathnameRef = useRef<string | null>(null);
  const prevEntryRef = useRef<string | null>(null);
  /**
   * The current entry's last scroll position. While a restore is in flight it may hold a
   * clamped value — the cleanup saves the restore's TARGET in that case, never this.
   */
  const currentYRef = useRef(0);

  useLayoutEffect(() => {
    window.history.scrollRestoration = "manual";
  }, []);

  // Track the settled position continuously, so leaving an entry saves where the reader WAS,
  // not whatever the window reads after the next page's DOM has already replaced this one.
  useEffect(() => {
    const onScroll = () => {
      currentYRef.current = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    const prevPathname = prevPathnameRef.current;
    prevPathnameRef.current = location.pathname;
    const prevEntry = prevEntryRef.current;
    prevEntryRef.current = entry;
    // A REPLACE overwrote the previous entry: it can never be returned to, so its saved
    // position goes too — otherwise every search keystroke or tab switch (each a replace with a
    // new key) would take a slot and evict the entries a Back chain needs.
    if (navigationType === "REPLACE" && prevEntry !== null && prevEntry !== entry) {
      forgetPosition(prevEntry);
      // …but it is the same VISIT: the cards' open/expanded state moves to the new key.
      migrateReturnState(prevEntry, entry);
    }

    let restore: RestoreHandle | null = null;
    let restoreTarget: number | null = null;

    // /live has its own inner scrollable container; global scroll reset doesn't reach it
    if (!location.pathname.startsWith("/live")) {
      if (navigationType === "POP") {
        // back/forward (initial load is also POP — map is empty, falls back to top)
        const target = getSavedPosition(entry) ?? 0;
        if (target > 0) {
          restoreTarget = target;
          restore = restoreScroll(target, currentYRef);
        } else {
          window.scrollTo(0, 0);
        }
      } else if (navigationType === "REPLACE" && prevPathname === location.pathname) {
        // same page, new query — the reader has not gone anywhere
      } else {
        window.scrollTo(0, 0);
      }
    }
    if (restoreTarget === null) currentYRef.current = window.scrollY;

    return () => {
      // Leaving this entry — remember where the reader was for a future back/forward. A
      // restore still in flight means the window holds a clamped value; keep the target.
      const stillRestoring = restore?.isActive() ?? false;
      restore?.cancel();
      rememberPosition(
        entry,
        stillRestoring && restoreTarget !== null ? restoreTarget : currentYRef.current,
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);

  return null;
}

/** One animation frame (runs before the next paint); a timer where frames are unavailable. */
const schedule = (fn: () => void): number =>
  typeof window.requestAnimationFrame === "function"
    ? window.requestAnimationFrame(fn)
    : (window.setTimeout(fn, RESTORE_RETRY_MS) as unknown as number);
const unschedule = (id: number) => {
  if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(id);
  window.clearTimeout(id);
};

interface RestoreHandle {
  cancel: () => void;
  isActive: () => boolean;
}

/**
 * Re-apply `target` until the page is tall enough for it to hold, the window runs out, or the
 * reader takes over. Returns a handle the effect cleanup uses to cancel it.
 */
function restoreScroll(target: number, currentYRef: { current: number }): RestoreHandle {
  const deadline = Date.now() + RESTORE_WINDOW_MS;
  let timer: number | null = null;
  let active = true;

  function finish() {
    if (timer !== null) unschedule(timer);
    timer = null;
    if (active) {
      active = false;
      currentYRef.current = window.scrollY;
    }
    for (const type of READER_INPUT_EVENTS) window.removeEventListener(type, onInput, true);
  }
  function onInput(e: Event) {
    if (isReaderInput(e)) finish();
  }

  // P1364 review — the restore does NOT stop at the first frame that lands. Content can still
  // change above the target after it: on a same-route POP the cards re-open their remembered
  // state in their own layout effects (after this sibling's), and the list may swap in from the
  // cache in a passive effect. With scroll anchoring the browser then moves scrollY off target.
  // So until the window closes (or the reader takes over) every frame checks, and re-applies the
  // target only when the position has drifted — a settled page gets no further writes.
  const attempt = () => {
    timer = null;
    if (Math.abs(window.scrollY - target) > 1) window.scrollTo(0, target);
    if (Date.now() >= deadline) {
      finish();
      return;
    }
    timer = schedule(attempt);
  };

  for (const type of READER_INPUT_EVENTS) {
    window.addEventListener(type, onInput, { capture: true, passive: true });
  }
  attempt();
  return { cancel: finish, isActive: () => active };
}
