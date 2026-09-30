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
import { useState, useCallback, useEffect } from 'react';
import type { PositionType } from '@/app/types';

const LEARNED_KEY = 'intensity_learned_at_v1';
const PLAIN_PICKS_STORAGE_NAME = 'intensity_plain_picks_v1';

/** After this many plain Agree/Disagree picks with no level ever chosen, the shared buttons
 *  open the tutorial pop-up once (founder, 2026-09-30: first proposed 10, then "maybe lets
 *  say after 5? 10 too much?"). */
export const PLAIN_PICKS_BEFORE_TUTORIAL = 5;

// Session memory: storage persists the flag, but is not the only truth — with storage blocked
// or full, a reader who picked a level must still stop seeing hints for the rest of the visit.
let learnedThisSession = false;

/** Tests only: forget the session memory (storage is cleared separately). */
export function resetIntensityLearnedMemory(): void {
  learnedThisSession = false;
}

export function readIntensityLearned(): boolean {
  if (learnedThisSession) return true;
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

/** Fired on `window` when the learned flag is set, so every mounted hint and hook stops at
 *  once (not only the component that saw the pick). */
export const INTENSITY_LEARNED_EVENT = 'cp:intensity-learned';

/** Fired on `window` with the id of the PositionButtons instance now showing its hint, so
 *  every other instance hides — one hint on the page at a time. */
export const INTENSITY_HINT_SHOWN_EVENT = 'cp:intensity-hint-shown';

export function writeIntensityLearned(): void {
  learnedThisSession = true;
  try {
    localStorage.setItem(LEARNED_KEY, String(Date.now()));
  } catch {
    // Storage write failed — the event below still stops hinting for this session.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(INTENSITY_LEARNED_EVENT));
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

  // A pick in any other component on the page (e.g. the shared buttons' menu) counts too.
  useEffect(() => {
    const onLearned = () => setIsLearned(true);
    window.addEventListener(INTENSITY_LEARNED_EVENT, onLearned);
    return () => window.removeEventListener(INTENSITY_LEARNED_EVENT, onLearned);
  }, []);

  return { isLearned, markLearned } as const;
}
