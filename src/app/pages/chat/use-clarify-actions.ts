/**
 * P1631: what the buttons of a Clarify thread do (Another point, a tapped suggestion, Try again, an edit or delete having happened), once for the whole thread
 * however many places in the conversation draw them. One action at a time; busy is a value and changes nothing on screen. Anything else that goes wrong says so.
 */
import { useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { anotherPoint, retryClarify, type ClarifyDraft } from '@/app/data/clarify-service';
import { CLARIFY_FAILED_TOAST } from './clarify-copy';
import { forgetClarifyRun, runClarifyDraft, touchClarifyThread } from './clarify-run';

export interface ClarifyActions {
  onPick: (text: string) => void;
  onRetry: (draft: ClarifyDraft) => void;
  onAnother: () => void;
  onChanged: () => void;
}

type Start = () => Promise<{ status: string; draftId?: string | null }>;

/** `onRetryStarted`: told when the server has queued a failed draft again, so the screen can show it being made at once. */
export function useClarifyActions(rootId: string, onRetryStarted?: (draftId: string) => void): ClarifyActions {
  // a ref, not state: a second press in the same tick must see the first
  const pending = useRef(false);
  const act = useCallback(async (start: Start) => {
    if (pending.current) return;
    pending.current = true;
    try {
      const r = await start();
      if (r.status === 'started') {
        if (r.draftId) void runClarifyDraft(r.draftId);
        // one signal: this thread reloads (its own listener) and the conversation's reply counts follow
        touchClarifyThread(rootId);
      } else if (r.status !== 'busy') {
        toast.error(CLARIFY_FAILED_TOAST); // refused: not started
      }
    } catch {
      toast.error(CLARIFY_FAILED_TOAST);
    } finally {
      pending.current = false;
    }
  }, [rootId]);

  return useMemo(() => ({
    onPick: (text) => void act(() => anotherPoint(rootId, text)),
    onRetry: (d) => void act(async () => {
      const r = await retryClarify(d.id);
      // a new run of the same draft may start again only once the server has queued it
      if (r.status === 'started') {
        forgetClarifyRun(d.id);
        onRetryStarted?.(d.id);
      }
      return { status: r.status, draftId: d.id };
    }),
    onAnother: () => void act(() => anotherPoint(rootId)),
    // an edit or delete: one signal reloads this thread (its own listener) and the conversation's reply counts
    onChanged: () => touchClarifyThread(rootId),
  }), [act, rootId, onRetryStarted]);
}
