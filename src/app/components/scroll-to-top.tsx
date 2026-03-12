import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolls to top of page on route change.
 * Must be placed inside Router context.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    // /live has its own inner scrollable container; global scroll reset doesn't reach it
    if (!pathname.startsWith('/live')) {
      window.scrollTo(0, 0);
    }
  }, [pathname]);

  return null;
}
