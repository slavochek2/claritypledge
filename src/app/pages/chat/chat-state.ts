/**
 * P1512: the chat context's shape and its hooks. The provider component lives in chat-provider.tsx
 * (a .ts file for the context object keeps Fast Refresh working: components and non-components
 * must not share a file).
 */
import { createContext, useContext } from 'react';
import type { ChatMessageEvent, ChatSummary } from '@/app/data/chat-service';
import type { ChatAuthor } from '@/app/data/chat-ui-helpers';

/** What the provider tells a listening conversation. `resync` means "refetch, you may have missed events". */
export type ChatEvent = { type: 'message'; event: ChatMessageEvent } | { type: 'resync' };

export interface ChatContextValue {
  userId: string;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  /** Every chat the user can read (archived included, event windows NOT applied: see chat-view-model). */
  chats: ChatSummary[];
  /** Unread, non-archived chats: the number on the Home entry. */
  unreadCount: number;
  refresh: () => Promise<void>;
  setArchived: (conversationId: string, archived: boolean) => Promise<void>;
  setManualUnread: (conversationId: string, manualUnread: boolean) => Promise<void>;
  /** Marks read up to `at` (an ISO time: the newest message seen), or now. */
  markRead: (conversationId: string, at?: string) => Promise<void>;
  subscribe: (listener: (event: ChatEvent) => void) => () => void;
  authors: Record<string, ChatAuthor>;
  /** Authors whose profile could not be read (or whose lookups kept failing): "Unknown", not a loading shimmer. */
  missingAuthors: ReadonlySet<string>;
  ensureAuthors: (ids: string[]) => void;
  block: (profileId: string) => Promise<void>;
  unblock: (profileId: string) => Promise<void>;
}

export const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside ChatProvider');
  return ctx;
}

/** For the shell: the Home badge. 0 outside the provider (signed out, or a test that does not mount it). */
export function useChatUnreadCount(): number {
  return useContext(ChatContext)?.unreadCount ?? 0;
}
