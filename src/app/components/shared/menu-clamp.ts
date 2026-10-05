const MENU_VIEWPORT_MARGIN = 8;

/**
 * Usable viewport width. `innerWidth` includes a classic (non-overlay) scrollbar,
 * and index.css reserves that gutter with `scrollbar-gutter: stable`, so prefer
 * the root's clientWidth; fall back where layout is unavailable (0 in jsdom).
 */
function usableViewportWidth(): number {
  return document.documentElement.clientWidth || window.innerWidth;
}

/** Clamp a centered menu's x (viewport coords) so [x - w/2, x + w/2] stays within the viewport. */
export function clampMenuCenter(centerX: number, menuWidth: number): number {
  const vw = usableViewportWidth();
  const half = menuWidth / 2;
  const min = MENU_VIEWPORT_MARGIN + half;
  const max = vw - MENU_VIEWPORT_MARGIN - half;
  return max < min ? vw / 2 : Math.min(Math.max(centerX, min), max);
}
