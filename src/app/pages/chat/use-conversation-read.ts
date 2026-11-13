/**
 * @file use-conversation-read.ts
 * @description Read state of the open conversation: while it is in front AND on screen, everything up to the newest message is read.
 */
import { useEffect } from 'react';
import type { ChatSummary } from '@/app/data/chat-service';
import { readThroughId } from './conversation-derived';
import { isLeavingChat, usePageVisible } from './chat-hooks';
import { useChat } from './chat-state';
import type { useConversationMessages } from './use-conversation';

export function useConversationRead(summary: ChatSummary, conv: ReturnType<typeof useConversationMessages>, paneVisible: boolean) {
  const conversationId = summary.conversationId;
  const visible = usePageVisible();
  const through = readThroughId(conv.server, summary.lastMessage);
  const { markRead, setViewing } = useChat();
  const unread = summary.unreadCount > 0 || summary.manualUnread;
  const seen = visible && paneVisible;
  useEffect(() => {
    if (!seen || isLeavingChat()) return;
    setViewing(conversationId);
    return () => setViewing(null);
  }, [seen, conversationId, setViewing]);
  useEffect(() => {
    // Not while it is being left for good: that is exactly when it was just marked unread.
    if (conv.status !== 'ready' || !seen || !unread || isLeavingChat()) return;
    void markRead(conversationId, through);
  }, [conv.status, seen, unread, markRead, conversationId, through]);
}
