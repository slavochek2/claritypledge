const MENU_VIEWPORT_MARGIN = 8;

/** Clamp a centered menu's x (viewport coords) so [x - w/2, x + w/2] stays within the viewport. */
export function clampMenuCenter(centerX: number, menuWidth: number): number {
  const half = menuWidth / 2;
  const min = MENU_VIEWPORT_MARGIN + half;
  const max = window.innerWidth - MENU_VIEWPORT_MARGIN - half;
  return max < min ? window.innerWidth / 2 : Math.min(Math.max(centerX, min), max);
}
