/**
 * @file use-intensity-learned.tsx
 * @description P1374: has this reader ever picked a Somewhat/Strongly level, on any page?
 *
 * One flag governs every intensity hint: once set, the letter tutorial modal no longer
 * auto-opens and the "Tap again…" line stops showing — in letters and under the shared
 * PositionButtons on /stake, feed, point, story and profile pages. Per browser, like
 * `use-intensity-preview-seen.tsx` (same storage pattern). Set only from a reader's own
 * pick — never from the tutorial demo (controlled PositionButtons, no-op click handler).
 */
import { useState, useCallback } from 'react';
import type { PositionType } from '@/app/types';

const LEARNED_KEY = 'intensity_learned_at_v1';
const PLAIN_PICKS_STORAGE_NAME = 'intensity_plain_picks_v1';

/** After this many plain Agree/Disagree picks with no level ever chosen, the shared buttons
 *  open the tutorial pop-up once (founder, 2026-09-30: "if they do something like 10 more
 *  without adjusting … should we show that?"). */
export const PLAIN_PICKS_BEFORE_TUTORIAL = 10;

export function readIntensityLearned(): boolean {
  try {
    return !!localStorage.getItem(LEARNED_KEY);
  } catch {
    // Storage unavailable — treat as not learned, so hints still teach.
    return false;
  }
}

/** A position is a non-default intensity when it carries a Somewhat/Strongly level. */
export function isIntensityLevel(position: PositionType | null): boolean {
  return !!position && (position.startsWith('somewhat_') || position.startsWith('strongly_'));
}

export function writeIntensityLearned(): void {
  try {
    localStorage.setItem(LEARNED_KEY, String(Date.now()));
  } catch {
    // Storage write failed — callers still stop hinting in memory for this session.
  }
}

/** Count one plain (default-level) Agree/Disagree pick; returns the new total. */
export function bumpIntensityPlainPicks(): number {
  try {
    const n = (parseInt(localStorage.getItem(PLAIN_PICKS_STORAGE_NAME) ?? '0', 10) || 0) + 1;
    localStorage.setItem(PLAIN_PICKS_STORAGE_NAME, String(n));
    return n;
  } catch {
    return 0; // Storage unavailable — never trigger the pop-up from a count we can't keep.
  }
}

export function useIntensityLearned() {
  const [isLearned, setIsLearned] = useState<boolean>(readIntensityLearned);

  const markLearned = useCallback(() => {
    writeIntensityLearned();
    setIsLearned(true);
  }, []);

  return { isLearned, markLearned } as const;
}
