/**
 * P1512: a search hit that is a thread reply opens its thread instead, in the chat's place.
 * (Moved out of ConversationPane unchanged.)
 */
import { useEffect } from 'react';
import { getMessage } from '@/app/data/chat-service';
import { chatPath } from './chat-view-model';
import type { useChatNavigate } from './chat-hooks';

export function useOpenHitThread(highlightId: string | null, conversationId: string, go: ReturnType<typeof useChatNavigate>): void {
  useEffect(() => {
    if (!highlightId) return;
    let live = true;
    getMessage(highlightId).then(
      (m) => {
        if (live && m?.threadRootId) go(chatPath(conversationId, { rootId: m.threadRootId, messageId: m.id }), 'redirect');
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [highlightId, conversationId, go]);
}
