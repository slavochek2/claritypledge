/**
 * @file room-head-offset.ts
 * @description P1429 A4: where the event room's pinned step bar sits below the fixed nav.
 *
 * Below the nav there may be, stacked: the offline strip's push (the nav moves down 1.75rem while
 * it shows — simple-navigation.tsx; the capture bar slot follows the same signal), and the running
 * capture bar, pinned under the nav. The bar's height is MEASURED rather than assumed — on its slot
 * (`room-capture-slot`), so every form counts: the short form is 49px, but offline it becomes the
 * two-line "Transcribing, but offline" bar with its own test id, and a fixed number (or a measure
 * of one form only) left the step bar sliding under it.
 */
import { useLayoutEffect, useState } from 'react';

/** The extra offset below the nav row, as a CSS length for `calc()`. */
export function roomHeadOffset(offlineStrip: boolean, barPx: number): string {
  return offlineStrip ? `calc(1.75rem + ${barPx}px)` : `${barPx}px`;
}

/** The current rendered height of the first element matching `selector`, while `active`; 0 otherwise. */
export function useMeasuredHeight(selector: string, active: boolean): number {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    if (!active) {
      setHeight(0);
      return;
    }
    const el = document.querySelector(selector);
    if (!el) {
      setHeight(0);
      return;
    }
    const read = () => setHeight(Math.round(el.getBoundingClientRect().height));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [selector, active]);
  return height;
}
