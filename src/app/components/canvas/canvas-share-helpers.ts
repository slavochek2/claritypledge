/**
 * @file canvas-share-helpers.ts
 * @description Helpers for CanvasShareControl (canvas-share-control.tsx): the sheet/popover switch, the short
 * date, and P1545's outside-open signal and invisible trigger.
 */
import { useEffect, useId, useRef, useState } from 'react';

/** The ids the panel's parts point at (list, state line, title, invite field, people section, general access), one hook so the panel's own body stays short. */
export function useShareIds() {
  return { listId: useId(), stateId: useId(), titleId: useId(), inviteId: useId(), peopleId: useId(), generalId: useId() };
}

/** The timer behind the "Copied" status, cleared when the panel unmounts. */
export function useCopiedTimer() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return timer;
}

const SHEET_QUERY = '(max-width: 639px)';

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Below 640px the panel is a bottom sheet; above, a popover under the button. */
export function useIsSheet(): boolean {
  const read = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(SHEET_QUERY).matches;
  const [sheet, setSheet] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(SHEET_QUERY);
    const on = () => setSheet(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return sheet;
}

/** P1545: calls `open` each time `signal` grows past the last value seen (0 / undefined = never). */
export function useOpenSignal(signal: number | undefined, open: () => void): void {
  const value = signal ?? 0;
  const lastSignal = useRef(value);
  useEffect(() => {
    if (value > lastSignal.current) open();
    lastSignal.current = value;
    // open only resets state and calls load(), which is keyed on the canvas name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}

/** P1545: a hidden trigger stays in the layout (the popover anchors to it) but out of the tab order and a11y tree. */
export function hiddenTriggerProps(hidden: boolean | undefined): { 'aria-hidden'?: true; tabIndex?: number } {
  return hidden ? { 'aria-hidden': true, tabIndex: -1 } : {};
}

/** "Copied" shows this long, then the button reads "Copy link" again. */
export const COPIED_MS = 2000;

export function hiddenTriggerClass(hidden: boolean | undefined): string {
  return hidden ? 'pointer-events-none invisible ' : '';
}
