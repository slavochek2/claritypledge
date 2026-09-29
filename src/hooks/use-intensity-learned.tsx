/**
 * @file use-intensity-learned.tsx
 * @description P1374: has this reader ever picked a Somewhat/Strongly level in a letter?
 *
 * One flag governs both letter intensity hints: once set, the forced tutorial modal no
 * longer auto-opens and the inline tip text stops showing. Per browser, like
 * `use-intensity-preview-seen.tsx` (same storage pattern). Set only from the reader's own
 * engage-phase selection — the tutorial demo's buttons have a no-op click handler.
 */
import { useState, useCallback } from 'react';
import type { PositionType } from '@/app/types';

const LEARNED_KEY = 'letter_intensity_learned_at_v1';

function readIsLearned(): boolean {
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

export function useIntensityLearned() {
  const [isLearned, setIsLearned] = useState<boolean>(readIsLearned);

  const markLearned = useCallback(() => {
    try {
      localStorage.setItem(LEARNED_KEY, String(Date.now()));
    } catch {
      // Storage write failed — still mark in-memory so this session stops hinting.
    }
    setIsLearned(true);
  }, []);

  return { isLearned, markLearned } as const;
}
