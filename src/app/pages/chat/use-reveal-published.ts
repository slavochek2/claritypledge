/**
 * P1631: after a publish the address becomes the chat (or the thread) with the new card focused (?m=). The new address has no ?clarify=, so the Clarify panel closes in the same move.
 * It swaps the entry in place ('redirect'): the panel's own entry is not left behind.
 * The open views then re-read (the provider's resync), which brings the new card to the chat, its thread and "Points in this chat (N)" without waiting for
 * Realtime; until it is there the chat waits for it at the bottom (published-cards.ts).
 */
import { useCallback, useContext } from 'react';
import type { PublishResult } from '@/app/data/clarify-service';
import { useChatNavigate } from './chat-hooks';
import { ChatContext } from './chat-state';
import { chatPath } from './chat-view-model';
import { notePublishedCard } from './published-cards';

export function useRevealPublished(): (result: PublishResult) => void {
  const goTo = useChatNavigate();
  const resync = useContext(ChatContext)?.resync;
  return useCallback((r: PublishResult) => {
    if (r.status === 'refused') return;
    // only a card made by this publish is waited for: an 'already' card existed before and may lie anywhere in the history, so it is paged for as usual
    if (r.status === 'published') notePublishedCard(r.messageId);
    goTo(chatPath(r.conversationId, { rootId: r.threadRootId ?? undefined, messageId: r.messageId }), 'redirect');
    resync?.();
  }, [goTo, resync]);
}
