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

const SEEN_KEY = 'letter_intensity_preview_seen_at_v2';

// Session memory (P1374): a failed storage write must not let the 5-plain-picks rule reopen
// the pop-up on every later pick.
let seenThisSession = false;

/** Tests only: forget the session memory (storage is cleared separately). */
export function resetIntensityPreviewSeenMemory(): void {
  seenThisSession = false;
}

export function readIntensityPreviewSeen(): boolean {
  if (seenThisSession) return true;
  try {
    return !!localStorage.getItem(SEEN_KEY);
  } catch {
    // Safari private mode / disabled storage — treat as "always show preview".
    return false;
  }
}

/** P1374: the tutorial pop-up is shown at most once per browser, whether it opened in a
 *  letter or from the shared buttons' 5-plain-picks trigger — one flag for both. */
export function writeIntensityPreviewSeen(): void {
  seenThisSession = true;
  try {
    localStorage.setItem(SEEN_KEY, String(Date.now()));
  } catch {
    // Storage write failed — callers close the pop-up in memory regardless.
  }
}

export function useIntensityPreviewSeen() {
  const [isSeen, setIsSeen] = useState<boolean>(readIntensityPreviewSeen);

  const markSeen = useCallback(() => {
    writeIntensityPreviewSeen();
    setIsSeen(true);
  }, []);

  return { isSeen, markSeen } as const;
}
