/** A going run is re-read every `intervalMs` while the tab is on screen; `enabled` false (no run, or a refused start: nothing is about to change) polls nothing. */
import { useEffect } from 'react';

export function useRunPoll(enabled: boolean, visible: boolean, load: () => Promise<void>, intervalMs: number): void {
  useEffect(() => {
    if (!enabled || !visible) return;
    const t = setInterval(() => void load(), intervalMs);
    return () => clearInterval(t);
  }, [enabled, visible, load, intervalMs]);
}
