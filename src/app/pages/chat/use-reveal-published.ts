/**
 * P1631: after a publish the address becomes the chat (or the thread) with the new card focused (?m=). The new address has no ?clarify=, so the Clarify panel closes in the same move.
 * It swaps the entry in place ('redirect'): the panel's own entry is not left behind.
 */
import { useCallback } from 'react';
import type { PublishResult } from '@/app/data/clarify-service';
import { useChatNavigate } from './chat-hooks';
import { chatPath } from './chat-view-model';

export function useRevealPublished(): (result: PublishResult) => void {
  const goTo = useChatNavigate();
  return useCallback((r: PublishResult) => {
    if (r.status === 'refused') return;
    goTo(chatPath(r.conversationId, { rootId: r.threadRootId ?? undefined, messageId: r.messageId }), 'redirect');
  }, [goTo]);
}
