/**
 * @file canvas-draft-reread.ts
 * @description The page's follow-up re-read after a hand edit, add or removal on a canvas draft (P1614, P1621).
 */
import { emitCanvasDraftEvent } from './canvas-draft-events';
import { whenVisible } from '@/app/prototypes/events/when-visible';

/**
 * Waits for a visible tab (metered-services rule 3, decisions.md 2026-10-30 [technical]; the helper is the one the event room uses). Several outcomes
 * for one draft while the tab is hidden coalesce into one re-read when it returns.
 */
const pendingReReads = new Set<string>();
export function reReadWhenVisible(draftId: string): void {
  if (pendingReReads.has(draftId)) return;
  pendingReReads.add(draftId);
  whenVisible(() => {
    pendingReReads.delete(draftId);
    emitCanvasDraftEvent({ kind: 'updated', draftId });
  });
}
