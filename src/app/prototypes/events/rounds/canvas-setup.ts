/**
 * @file canvas-setup.ts
 * @description P1529: the Canvas tab of a sales mastermind whose canvas is made at the event: its words, where the canvas is made, and
 * whether mine is shared. The tab is open from arrival (no host step). Every sentence is a draft: [FOUNDER DECISION: copy, proposed].
 */
import { useEffect, useState } from 'react';
import { getMyEventCanvas } from '@/app/data/event-mastermind-service';
import { canvasTimingOf } from '@/app/types/event-fields';
import { whenVisible } from '../when-visible';

/** [FOUNDER DECISION: copy, proposed] */
export const CANVAS_SETUP_COPY = {
  title: 'Make your Clarity Canvas',
  open: 'Open your mirror agent',
  shared: 'Your Clarity Canvas is shared with this event \u2713',
  observer: 'Help the people next to you make their canvas',
  retry: 'Retry',
  loading: 'Loading\u2026',
};

/** Where the Clarity Canvas is made, from the event (the canonical reading of the column). */
export const eventCanvasTiming = (event: { canvasTiming?: string | null } | null | undefined): 'before' | 'at_event' => canvasTimingOf(event?.canvasTiming);

/** Whether my canvas is shared with the event (the Canvas tab's tick). Read when it is turned on and each time `again` changes; a failed read keeps what is shown. */
export function useMyCanvasShared(eventId: string | undefined, enabled: boolean, again: unknown): [boolean, (shared: boolean) => void] {
  const [shared, setShared] = useState(false);
  useEffect(() => {
    if (!enabled || !eventId) return;
    let cancelled = false;
    // A hidden tab makes no request: the read waits until the tab is seen.
    const cancelWait = whenVisible(() => {
      getMyEventCanvas(eventId).then(c => { if (!cancelled) setShared(!!c?.shared); }).catch(() => undefined);
    });
    return () => { cancelled = true; cancelWait(); };
  }, [enabled, eventId, again]);
  return [shared, setShared];
}
