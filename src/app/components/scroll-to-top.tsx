import { useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// Per-history-entry scroll positions (location.key → scrollY). In-memory only:
// survives SPA back/forward, intentionally resets on reload (reload starts at top).
const savedPositions = new Map<string, number>();

/**
 * Scroll manager for route changes. Must be placed inside Router context.
 *
 * - PUSH/REPLACE navigation → start at top (the app's "every route starts at top" contract)
 * - POP (back/forward) → restore the scroll position that history entry had
 *   (scrollRestoration is "manual", so the browser won't do it for us)
 * - Reload → top, deterministically: scrollRestoration "manual" stops the browser's
 *   late async restore from overriding the mount-time scrollTo, and the in-memory
 *   position map is empty on a fresh load
 */
export function ScrollToTop() {
  const location = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    window.history.scrollRestoration = "manual";
  }, []);

  useLayoutEffect(() => {
    // /live has its own inner scrollable container; global scroll reset doesn't reach it
    if (!location.pathname.startsWith("/live")) {
      if (navigationType === "POP") {
        // back/forward (initial load is also POP — map is empty, falls back to top)
        window.scrollTo(0, savedPositions.get(location.key) ?? 0);
      } else {
        window.scrollTo(0, 0);
      }
    }
    const key = location.key;
    return () => {
      // leaving this entry — remember where the user was for a future back/forward
      savedPositions.set(key, window.scrollY);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  return null;
}
