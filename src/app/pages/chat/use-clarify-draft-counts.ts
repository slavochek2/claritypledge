/**
 * P1631: how many drafts each Clarify root of one open Mirror conversation holds, read ONCE for the conversation (not once per row).
 * Read again (once, not per row) when a run this tab started ends, when a Clarify thread is touched (a draft typed, started, retried
 * or deleted), and whenever the tab is shown again. A hidden tab does not read; it catches up when shown. Only the newest read's
 * answer is applied, so a slow earlier answer cannot overwrite a newer count.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getClarifyDraftCounts } from '@/app/data/clarify-service';
import { onClarifyRunEnded, onClarifyThreadTouched } from './clarify-run';

/** null until the first read has answered (or failed): the link then waits instead of flashing a zero. */
export const ClarifyCountsContext = createContext<Record<string, number> | null>({});

/** The drafts count of one Clarify root: 0 when it has none or the read failed, null while the first read is still out. */
export function useClarifyDraftCount(rootId: string): number | null {
  const counts = useContext(ClarifyCountsContext);
  return counts === null ? null : (counts[rootId] ?? 0);
}

export function useClarifyDraftCounts(conversationId: string, enabled: boolean): Record<string, number> | null {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const seq = useRef(0);
  useEffect(() => () => { seq.current += 1; }, []);
  const load = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    const mine = ++seq.current;
    try {
      const next = await getClarifyDraftCounts(conversationId);
      if (mine === seq.current) setCounts(next);
    } catch {
      // settle on "none known": the row still offers a way into its thread
      if (mine === seq.current) setCounts((prev) => prev ?? {});
    }
  }, [conversationId]);
  useEffect(() => {
    if (!enabled) return;
    void load();
    const off = onClarifyRunEnded(() => void load());
    const offTouch = onClarifyThreadTouched(() => void load());
    const onVisible = () => { if (document.visibilityState !== 'hidden') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      seq.current += 1;
      off();
      offTouch();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, load]);
  return counts;
}
