/**
 * @file use-intensity-preview-seen.tsx
 * @description P852 Round-E: one-time "intensity mechanic" preview gate.
 *
 * Stores a localStorage timestamp the first time the user sees the inline pictogram
 * that demonstrates tap-again-to-refine. Subsequent encounters skip the animation.
 *
 * Pattern mirrors `use-pwa-install.tsx` (timestamp + try/catch on storage).
 * Write happens via `markSeen()` — call only AFTER the animation completes so a
 * StrictMode double-mount during initial render doesn't burn the gate.
 */
import { useState, useCallback } from 'react';

const SEEN_KEY = 'letter_intensity_preview_seen_at';

function readIsSeen(): boolean {
  try {
    return !!localStorage.getItem(SEEN_KEY);
  } catch {
    // Safari private mode / disabled storage — treat as "always show preview".
    return false;
  }
}

export function useIntensityPreviewSeen() {
  const [isSeen, setIsSeen] = useState<boolean>(readIsSeen);

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(SEEN_KEY, String(Date.now()));
    } catch {
      // Storage write failed — still mark in-memory so this session doesn't replay.
    }
    setIsSeen(true);
  }, []);

  return { isSeen, markSeen } as const;
}
