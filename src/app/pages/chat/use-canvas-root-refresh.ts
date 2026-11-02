/**
 * @file use-canvas-root-refresh.ts
 * @description P1536 3c X11: the REAL signals that tell what a canvas thread root shows (its card and its "N replies" link) may be out of date. No timer, no polling
 * (metered-services rules 2 and 3):
 *  - the same-tab canvas event for THIS draft: 'published' or 'discarded' ('updated' changes points, not what the draft is, and another draft's events say nothing);
 *  - the tab becoming visible again (a draft published or discarded in another tab or window);
 *  - a new reply arriving in the thread (`refreshKey`, the reply count: the Publish reply is one). Never read while the tab is hidden: it reads when the tab returns.
 * `refresh` is the caller's own (quiet) read. `listen` false: nothing is listened for at all (a card that is not a draft's thread has nothing to follow).
 */
import { useEffect, useRef } from 'react';
import { subscribeCanvasDraftEvents } from '@/app/data/canvas-draft-events';

const tabIsVisible = (): boolean => typeof document === 'undefined' || document.visibilityState !== 'hidden';

export function useCanvasRootRefresh(draftId: string | null | undefined, refresh: () => void, refreshKey?: number, listen = true): void {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (!draftId) return;
    return subscribeCanvasDraftEvents((e) => {
      if (e.draftId === draftId && e.kind !== 'updated' && tabIsVisible()) latest.current();
    });
  }, [draftId]);
  useEffect(() => {
    if (!listen) return;
    const onChange = () => {
      if (tabIsVisible()) latest.current();
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, [listen]);
  const seen = useRef(refreshKey);
  useEffect(() => {
    if (seen.current === refreshKey) return; // the first value is not a change
    seen.current = refreshKey;
    if (listen && tabIsVisible()) latest.current();
  }, [refreshKey, listen]);
}
