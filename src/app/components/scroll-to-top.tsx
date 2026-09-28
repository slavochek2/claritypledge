import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { getSavedPosition, rememberPosition, scrollEntryKey } from "@/lib/scroll-positions";

/** How long a POP keeps re-applying the saved position while the page's content arrives. */
export const RESTORE_WINDOW_MS = 1500;
const RESTORE_RETRY_MS = 16;
/**
 * Any of these means the reader has taken over — the restore stops at once. `scroll` is
 * deliberately NOT one of them: the restore's own `scrollTo` fires scroll events.
 */
const READER_INPUT_EVENTS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/**
 * Scroll manager for route changes. Must be placed inside Router context.
 *
 * - PUSH, or a REPLACE to a different pathname → start at top (the app's "every route starts
 *   at top" contract).
 * - REPLACE that keeps the pathname (a search-param change: a feed tab, sort, the search box)
 *   → stay where the reader is (P1364).
 * - POP (back/forward) → restore the position that history entry had. The page usually
 *   remounts and fetches, so at the first frame the document is only a spinner tall and the
 *   browser clamps the scroll to ~0. P1364: the restore is re-applied every frame until it
 *   lands, for up to RESTORE_WINDOW_MS, and stops at the reader's first wheel / touch / key /
 *   pointer input. A value clamped mid-restore is never saved as the entry's position.
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
  /** True while a POP restore is still re-applying its target. */
  const restoringRef = useRef(false);
  /** The current entry's last settled scroll position (never a mid-restore value). */
  const currentYRef = useRef(0);

  useLayoutEffect(() => {
    window.history.scrollRestoration = "manual";
  }, []);

  // Track the settled position continuously, so leaving an entry saves where the reader WAS,
  // not whatever the window reads after the next page's DOM has already replaced this one.
  useEffect(() => {
    const onScroll = () => {
      if (!restoringRef.current) currentYRef.current = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    const prevPathname = prevPathnameRef.current;
    prevPathnameRef.current = location.pathname;

    let restore: RestoreHandle | null = null;
    let restoreTarget: number | null = null;

    // /live has its own inner scrollable container; global scroll reset doesn't reach it
    if (!location.pathname.startsWith("/live")) {
      if (navigationType === "POP") {
        // back/forward (initial load is also POP — map is empty, falls back to top)
        const target = getSavedPosition(entry) ?? 0;
        if (target > 0) {
          restoreTarget = target;
          restore = restoreScroll(target, restoringRef, currentYRef);
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

interface RestoreHandle {
  cancel: () => void;
  isActive: () => boolean;
}

/**
 * Re-apply `target` until the page is tall enough for it to hold, the window runs out, or the
 * reader takes over. Returns a handle the effect cleanup uses to cancel it.
 */
function restoreScroll(
  target: number,
  restoringRef: { current: boolean },
  currentYRef: { current: number },
): RestoreHandle {
  const deadline = Date.now() + RESTORE_WINDOW_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = true;
  restoringRef.current = true;

  const finish = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (active) {
      active = false;
      restoringRef.current = false;
      currentYRef.current = window.scrollY;
    }
    for (const type of READER_INPUT_EVENTS) window.removeEventListener(type, finish, true);
  };

  const attempt = () => {
    timer = null;
    window.scrollTo(0, target);
    if (Math.abs(window.scrollY - target) <= 1 || Date.now() >= deadline) {
      finish();
      return;
    }
    timer = setTimeout(attempt, RESTORE_RETRY_MS);
  };

  for (const type of READER_INPUT_EVENTS) {
    window.addEventListener(type, finish, { capture: true, passive: true });
  }
  attempt();
  return { cancel: finish, isActive: () => active };
}
