/**
 * @file useRevealDwellTracker.ts
 * @description P849 — Letter reveal dwell instrumentation.
 *
 * Fires a single `letter_reveal_viewed` Mixpanel event when a reveal panel in
 * the letter flow is viewed and the reader advances past it (or leaves the
 * page). Visibility is confirmed via IntersectionObserver (≥50% in viewport
 * for ≥200ms) so off-screen mounts don't count as "viewed". The dwell timer
 * pauses while the tab is hidden so background tab time doesn't inflate.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { analytics } from '@/lib/mixpanel';

export type RevealStageType = 'anti-point' | 'story' | 'point';

export interface UseRevealDwellTrackerOptions {
  /** Track only when in a reveal phase. */
  enabled: boolean;
  /** Changes per reveal stage (phase + story + point) to force tracker reset. */
  stageKey: string;
  letterId: string | null;
  stageType: RevealStageType | null;
  /** 1-based story-unit position within the letter. */
  stageIndex: number;
  /** Signed delta between reader estimate and author actual (null if not computable). */
  gap: number | null;
}

export interface UseRevealDwellTrackerReturn {
  /** Attach to the reveal panel root element. */
  containerRef: (el: HTMLDivElement | null) => void;
  /** Call from the advance button's onClick before triggering the phase transition. */
  markAdvance: () => void;
}

const VISIBILITY_THRESHOLD = 0.5;
const VISIBILITY_DWELL_MS = 200;

export function useRevealDwellTracker(
  opts: UseRevealDwellTrackerOptions
): UseRevealDwellTrackerReturn {
  const { enabled, stageKey, letterId, stageType, stageIndex, gap } = opts;

  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const containerRef = useCallback((el: HTMLDivElement | null) => setElement(el), []);

  const propsRef = useRef({ letterId, stageType, stageIndex, gap });
  propsRef.current = { letterId, stageType, stageIndex, gap };

  const startMsRef = useRef<number | null>(null);
  const hiddenAccumMsRef = useRef(0);
  const hiddenSinceRef = useRef<number | null>(null);
  const visibleDwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const fire = useCallback((via: 'advance' | 'pagehide') => {
    if (firedRef.current) return;
    if (startMsRef.current === null) return;
    const { letterId: lid, stageType: st, stageIndex: si, gap: g } = propsRef.current;
    if (!lid || !st) return;

    firedRef.current = true;

    let totalHidden = hiddenAccumMsRef.current;
    if (hiddenSinceRef.current !== null) {
      totalHidden += performance.now() - hiddenSinceRef.current;
    }
    const elapsedMs = Math.max(
      0,
      Math.round(performance.now() - startMsRef.current - totalHidden)
    );

    analytics.track('letter_reveal_viewed', {
      letter_id: lid,
      stage_type: st,
      stage_index: si,
      time_to_next_click_ms: elapsedMs,
      gap: g,
      flush_via: via,
    });
  }, []);

  const markAdvance = useCallback(() => {
    fire('advance');
  }, [fire]);

  useEffect(() => {
    if (!enabled || !element) return undefined;

    firedRef.current = false;
    startMsRef.current = null;
    hiddenAccumMsRef.current = 0;
    hiddenSinceRef.current = null;
    if (visibleDwellTimerRef.current !== null) {
      clearTimeout(visibleDwellTimerRef.current);
      visibleDwellTimerRef.current = null;
    }

    if (typeof IntersectionObserver === 'undefined') {
      startMsRef.current = performance.now();
    } else {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const meetsThreshold = entry.intersectionRatio >= VISIBILITY_THRESHOLD;
            if (meetsThreshold && startMsRef.current === null) {
              if (visibleDwellTimerRef.current === null) {
                visibleDwellTimerRef.current = setTimeout(() => {
                  if (startMsRef.current === null) {
                    startMsRef.current = performance.now();
                  }
                  visibleDwellTimerRef.current = null;
                }, VISIBILITY_DWELL_MS);
              }
            } else if (!meetsThreshold && startMsRef.current === null) {
              if (visibleDwellTimerRef.current !== null) {
                clearTimeout(visibleDwellTimerRef.current);
                visibleDwellTimerRef.current = null;
              }
            }
          }
        },
        { threshold: [0, VISIBILITY_THRESHOLD, 1] }
      );
      observer.observe(element);

      const onVisibilityChange = () => {
        if (document.hidden) {
          if (startMsRef.current !== null && hiddenSinceRef.current === null) {
            hiddenSinceRef.current = performance.now();
          }
        } else if (hiddenSinceRef.current !== null) {
          hiddenAccumMsRef.current += performance.now() - hiddenSinceRef.current;
          hiddenSinceRef.current = null;
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);

      const onPageHide = () => fire('pagehide');
      window.addEventListener('pagehide', onPageHide);

      return () => {
        observer.disconnect();
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('pagehide', onPageHide);
        if (visibleDwellTimerRef.current !== null) {
          clearTimeout(visibleDwellTimerRef.current);
          visibleDwellTimerRef.current = null;
        }
      };
    }

    return undefined;
  }, [enabled, stageKey, element, fire]);

  return { containerRef, markAdvance };
}
