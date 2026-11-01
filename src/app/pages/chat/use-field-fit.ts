/**
 * @file use-field-fit.ts
 * @description P1512: the message field grows with its text up to about five lines, then scrolls inside itself. The height is measured when the text
 * changes (as it always was) and, since the text can re-wrap without changing, also when the field's WIDTH changes (Upload coming back narrows it, a
 * pane that was hidden is shown, the panel opens). Setting the height itself fires the observer, so only a changed width measures again.
 */
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** Five 24px lines plus the field's 16px vertical padding. */
export const COMPOSER_MAX = 136;

/** Measures the field, and returns the width it was measured at (read after the styles are set: a scrollbar that appears narrows it). */
function fit(el: HTMLTextAreaElement): number {
  el.style.height = 'auto';
  const full = el.scrollHeight;
  el.style.height = `${Math.min(full || 40, COMPOSER_MAX)}px`;
  el.style.overflowY = full > COMPOSER_MAX ? 'auto' : 'hidden';
  return el.clientWidth;
}

export function useFieldFit(field: RefObject<HTMLTextAreaElement | null>, value: string): void {
  /** The width the field was last measured at (null: not measured since it was attached). */
  const measuredAt = useRef<number | null>(null);
  const watching = useRef<{ el: HTMLTextAreaElement; observer: ResizeObserver } | null>(null);
  useLayoutEffect(() => {
    const el = field.current;
    if (el) measuredAt.current = fit(el);
  }, [field, value]);
  // The field can come and go (the recorder bar takes its place), so every render checks that the element being watched is the one on screen.
  useEffect(() => {
    const el = field.current;
    if (watching.current?.el === el) return;
    watching.current?.observer.disconnect();
    watching.current = null;
    measuredAt.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== measuredAt.current) measuredAt.current = fit(el);
    });
    observer.observe(el);
    watching.current = { el, observer };
  });
  useEffect(() => () => watching.current?.observer.disconnect(), []);
}
