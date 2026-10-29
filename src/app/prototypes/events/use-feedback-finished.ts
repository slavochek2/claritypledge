/**
 * @file use-feedback-finished.ts
 * @description P1542 round 6 (B, decision 40): has this person finished this event's feedback (F)? The same read the
 * close page makes (`get_event_close(...).finished`), so the room stops offering "Start now" once it is done and
 * ticks its Give feedback step. undefined while the read is out; false when it fails (the offer stays, never a false tick).
 */
import { useEffect, useState } from 'react';
import { getEventClose } from '@/app/data/event-close-service';
import { whenVisible } from './when-visible';

export function useFeedbackFinished(eventId: string | null | undefined, enabled: boolean): boolean | undefined {
  const [finished, setFinished] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (!eventId || !enabled) { setFinished(false); return; }
    let cancelled = false;
    setFinished(undefined);
    // Round 7e (metered-services rule 3): no request from a hidden tab — the read waits until it is visible.
    const cancelWait = whenVisible(() => {
      getEventClose(eventId)
        .then((c) => { if (!cancelled) setFinished(c.finished === true); })
        .catch(() => { if (!cancelled) setFinished(false); });
    });
    return () => { cancelled = true; cancelWait(); };
  }, [eventId, enabled]);
  return finished;
}
