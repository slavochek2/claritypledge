/**
 * @file ClarifyComposer.tsx
 * @description P1631: the composer of a Clarify thread, the product's own thread Composer. A message posts in the thread and starts a run in one
 * call; the model decides whether it refines the latest draft or adds another (the server applies it). While a draft is being made the send slot
 * waits and the field keeps its text. Voice notes are not offered here: the run reads words.
 */
import { useCallback } from 'react';
import { toast } from 'sonner';
import { clarifyMessage } from '@/app/data/clarify-service';
import { Composer } from './Composer';
import { CLARIFY_COMPOSER_HINT, CLARIFY_FAILED_TOAST, CLARIFY_MESSAGE_MAX, CLARIFY_TOO_LONG_TOAST, CLARIFY_WAITING_TEXT } from './clarify-copy';
import { runClarifyDraft, touchClarifyThread } from './clarify-run';

export function ClarifyComposer({ rootId, userId, working }: { rootId: string; userId: string; working: boolean }) {
  // resolving false means nothing was sent and the composer gives the words back
  const onSend = useCallback(async (body: string | null): Promise<boolean> => {
    const text = (body ?? '').trim();
    if (!text) return false;
    if (text.length > CLARIFY_MESSAGE_MAX) {
      toast.error(CLARIFY_TOO_LONG_TOAST);
      return false;
    }
    try {
      const r = await clarifyMessage(rootId, text);
      if (r.status !== 'started') return false; // busy: the send slot already says a draft is being made
      void runClarifyDraft(r.draftId);
      touchClarifyThread(rootId);
      return true;
    } catch {
      toast.error(CLARIFY_FAILED_TOAST);
      return false;
    }
  }, [rootId]);
  return (
    <Composer
      draftKey={`${userId}:clarify:${rootId}`}
      placeholder={CLARIFY_COMPOSER_HINT}
      waiting={working ? CLARIFY_WAITING_TEXT : undefined}
      onSend={onSend}
    />
  );
}
