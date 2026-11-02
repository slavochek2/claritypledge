/**
 * @file canvas-box-highlight.ts
 * @description P1536 J2 step 4: a reply's box chip shows that box: it scrolls to the middle of its pane and rings for two seconds. A DOM attribute, not React state: the
 * ring is styled by `data-highlight` in the grid, and a repeated tap restarts the two seconds on the same box.
 */
export const HIGHLIGHT_MS = 2000;

let current: { el: Element; timer: ReturnType<typeof setTimeout> } | null = null;

/** Scrolls the box into the middle of its pane and rings it. False when no box with that tag is on screen. */
export function highlightBox(tag: string): boolean {
  const el = document.querySelector(`[data-testid="canvas-box-${tag}"]`);
  if (!el) return false;
  if (current) {
    clearTimeout(current.timer);
    current.el.removeAttribute('data-highlight');
  }
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
  el.scrollIntoView?.({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  el.setAttribute('data-highlight', 'true');
  current = { el, timer: setTimeout(() => { el.removeAttribute('data-highlight'); current = null; }, HIGHLIGHT_MS) };
  return true;
}
