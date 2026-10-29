/**
 * @file use-back-to-event.ts
 * @description P1562 §2: "Back to the event" from a view that sits `depth` entries above the event page's own entry
 * (the room's own entries, Ready below Meet, the room below /close). It never walks the room's history one entry at
 * a time: Back lands on the event page and leaves no room entry above it.
 *
 *  - depth 0: pop when the event page opened this view (`openedByEvent`), else replace with the event.
 *  - depth > 0 and the event page opened the room: return past every entry above it in one traversal
 *    (`navigate(-(depth + 1))`). Guarded like useGoBack: on a browser-backed router the pop is taken only when the
 *    history index says there are that many entries below, and it is watched — if it goes nowhere within
 *    DEAD_BACK_TIMEOUT_MS, the event is opened by replace instead.
 *  - otherwise (a cold entry, or a room nobody opened from the event page): replace with the event.
 */
import { useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isBrowserBacked, useReturnToParent, watchForDeadBack } from '@/app/hooks/use-go-back';

export function useBackToEvent(slug: string | undefined, openedByEvent: boolean, depth: number): () => void {
  return useBackPast(`/events/${slug}`, openedByEvent, depth);
}

/** The same traversal to any parent `depth` entries below this one's own (P1542 review C1: Clarity Night's "Back to
 *  readiness" from the room's in-page views). `replaceState` rides on the replace fallback (the parent's own marks). */
export function useBackPast(parent: string, openedByEvent: boolean, depth: number, replaceState?: unknown): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;
  const popOne = useReturnToParent(parent, openedByEvent, replaceState);
  const stateRef = useRef(replaceState);
  stateRef.current = replaceState;
  return useCallback(() => {
    if (depth <= 0) return popOne();
    const replace = () => navigate(parent, { replace: true, state: stateRef.current });
    if (!openedByEvent) return replace();
    const steps = depth + 1;
    if (isBrowserBacked(locationRef.current)) {
      const idx = (window.history.state as { idx?: unknown } | null)?.idx;
      if (typeof idx === 'number' && idx < steps) return replace();
      watchForDeadBack(replace);
    }
    navigate(-steps);
  }, [depth, popOne, navigate, parent, openedByEvent]);
}
