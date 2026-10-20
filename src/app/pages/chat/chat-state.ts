/**
 * P1512: the chat context's shape and its hooks. The provider component lives in chat-provider.tsx
 * (a .ts file for the context object keeps Fast Refresh working: components and non-components
 * must not share a file).
 */
import { createContext, useContext } from 'react';
import type { ChatAttachmentKind, ChatMessage, ChatMessageEvent, ChatSummary } from '@/app/data/chat-service';
import type { ChatAuthor } from '@/app/data/chat-ui-helpers';
import type { NavIntent, NavPlan } from './chat-view-model';

/** What the provider tells a listening conversation. `resync` means "refetch, you may have missed events". */
export type ChatEvent =
  | { type: 'message'; event: ChatMessageEvent }
  | { type: 'resync' }
  /** My own send was confirmed by the RPC: the server's row, for whichever conversation has it open. */
  | { type: 'sent'; message: ChatMessage };

export interface SendInput {
  body: string | null;
  replyToId?: string;
  attachment?: { kind: ChatAttachmentKind; id: string };
}

/** An unconfirmed message of mine: sending, or failed with a Retry. Lives in the provider's outbox. */
export interface LocalMessage extends ChatMessage {
  localId: string;
  pending: boolean;
  failed: boolean;
  error?: string;
  input: SendInput;
}

export interface ChatContextValue {
  userId: string;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  /** Every chat the user can read (archived included, event windows NOT applied: see chat-view-model). */
  chats: ChatSummary[];
  /** Unread, non-archived chats: the number on the Home entry. */
  unreadCount: number;
  /** Reads the list again; resolves with it (null when the read failed). */
  refresh: () => Promise<ChatSummary[] | null>;
  setArchived: (conversationId: string, archived: boolean) => Promise<void>;
  setManualUnread: (conversationId: string, manualUnread: boolean) => Promise<void>;
  /** Marks read exactly through `throughMessageId` (a client clock cannot say a microsecond), else up to now. */
  markRead: (conversationId: string, throughMessageId?: string) => Promise<void>;
  subscribe: (listener: (event: ChatEvent) => void) => () => void;
  /** The conversation the person is looking at right now (open, tab in front, pane showing), or null. */
  setViewing: (conversationId: string | null) => void;
  /** Bumps on every edit / delete event and every resync: things derived from messages re-read. */
  revision: number;
  authors: Record<string, ChatAuthor>;
  /** Authors whose profile could not be read (or whose lookups kept failing): "Unknown", not a loading shimmer. */
  missingAuthors: ReadonlySet<string>;
  ensureAuthors: (ids: string[]) => void;
  /** Sends that are in flight or failed, for every conversation; they survive switching chats. */
  outbox: LocalMessage[];
  sendMessage: (conversationId: string, threadRootId: string | undefined, input: SendInput) => Promise<void>;
  retrySend: (localId: string) => Promise<void>;
  discardSend: (localId: string) => void;
  block: (profileId: string) => Promise<void>;
  unblock: (profileId: string) => Promise<void>;
  /** Opens a chat by the history rule (chatNav), from wherever the person is when it is called: for things that outlive a screen (a toast's Open). */
  goToChat: (to: string, intent?: NavIntent) => NavPlan['mode'];
  /** P1520: open conversations re-read now (used when a confirmed mirror reply has not arrived live). */
  resync: () => void;
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
