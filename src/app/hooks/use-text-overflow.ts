import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * P1259 change 6 — "does this clamped element actually have more text?", measured.
 *
 * THE DEFECT THIS REPLACES. `profile-page-v2.tsx` decided whether to render "Show more"
 * from `strippedContent.length > 400` while the truncation was done (or, as it turned out,
 * NOT done — see below) by a CSS class. A character count and a line clamp are two
 * different measures of the same thing and they never agree, so the control appeared on
 * stories that were fully visible and toggling it changed nothing. That is the
 * dead-control defect the visual-QA checklist blocks by name.
 *
 * The spec's instruction is literal: "Decide visibility by measured overflow
 * (`scrollHeight > clientHeight` on the text element, re-measured on resize), not by a
 * character count."
 *
 * THE FAILURE MODE OF GETTING THIS WRONG IS QUIETER THAN THE BUG IT FIXES, which is why
 * this is a hook and not four copies of one `useEffect`. A `scrollHeight`/`clientHeight`
 * comparison run while the element is hidden, off-screen, or before the web font loads
 * reads 0 > 0 = false and suppresses the control PERMANENTLY — a missing control, with
 * nothing on screen to notice. So this re-measures on:
 *
 *   - mount and whenever `deps` change (the text itself)
 *   - element resize (ResizeObserver — covers viewport changes AND container reflow,
 *     which a window `resize` listener misses)
 *   - `document.fonts.ready` (a fallback metric font gives a different line count)
 *   - the element becoming visible (IntersectionObserver — a collapsed tab, a
 *     virtualized row, `display:none` behind a toggle)
 *
 * and it treats a zero-height measurement as UNKNOWN rather than as "no overflow": the
 * previous answer is kept until a real measurement arrives.
 */
export function useTextOverflow<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  deps: unknown[] = []
): boolean {
  const [overflowing, setOverflowing] = useState(false);
  // Read inside the callback rather than closing over it, so `measure` stays stable and
  // the observers below are not torn down and rebuilt on every measurement.
  const overflowingRef = useRef(false);
  overflowingRef.current = overflowing;

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Laid out yet? A hidden or not-yet-painted element reports 0 for both, and 0 > 0 is
    // false — indistinguishable from "fits", and permanent if we believed it.
    if (el.clientHeight === 0) return;
    // +1 absorbs sub-pixel rounding: a fitting element can measure scrollHeight 97.6 vs
    // clientHeight 97 on a fractional line-height.
    const next = el.scrollHeight > el.clientHeight + 1;
    if (next !== overflowingRef.current) setOverflowing(next);
  }, [ref]);

  useEffect(() => {
    measure();
    // deps is the caller's content identity; measure is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, ...deps]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observers: Array<{ disconnect: () => void }> = [];

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => measure());
      ro.observe(el);
      observers.push(ro);
    }

    if (typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver((entries) => {
        // Only a transition INTO view can change the answer; leaving view cannot.
        if (entries.some((e) => e.isIntersecting)) measure();
      });
      io.observe(el);
      observers.push(io);
    }

    // A metric fallback font lays out at a different line count than the real one, so a
    // measurement taken before the webfont swaps can be wrong in either direction.
    let cancelled = false;
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    fonts?.ready?.then(() => {
      if (!cancelled) measure();
    }).catch(() => {
      /* Font loading is best-effort; the other triggers still fire. */
    });

    return () => {
      cancelled = true;
      observers.forEach((o) => o.disconnect());
    };
  }, [ref, measure]);

  return overflowing;
}

export default useTextOverflow;
