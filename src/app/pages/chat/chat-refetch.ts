/**
 * @file chat-refetch.ts
 * @description Applying one Realtime message event to the chat list (patchRow, from chat-provider.tsx) and
 * P1592 Cost Budget: an append to a transcription message arrives as a Realtime UPDATE
 * of a top-level message, up to ~1,000 per event. Each one used to schedule a chat-list refetch
 * (get_my_chats, which also runs _chat_ensure_for_user) on every connected client. An append
 * changes only the body of a message the list already shows, which the local patch covers, so it
 * must not cost a list read. Every other UPDATE (a typed message, a delete) keeps refetching.
 */
import { listBody, type ChatMessageEvent, type ChatSummary } from '@/app/data/chat-service';
import { compareMessages } from './chat-view-model';

export function isTranscriptionAppend(event: ChatMessageEvent): boolean {
  return event.type === 'UPDATE' && event.message.isTranscription === true && event.message.threadRootId === null && !event.message.isDeleted;
}

/** Applies one message event to the list row it belongs to. `unknown` means the list has no such chat. */
export function patchRow(
  chats: ChatSummary[],
  event: ChatMessageEvent,
  me: string,
  viewing: string | null,
  authorName: string | null,
): { chats: ChatSummary[]; unknown: boolean } {
  const m = event.message;
  const i = chats.findIndex((c) => c.conversationId === m.conversationId);
  if (i < 0) return { chats, unknown: true };
  const chat = chats[i] as ChatSummary;
  let next = chat;
  if (event.type === 'INSERT') {
    const isNewest = !chat.lastMessage || compareMessages(m, { id: chat.lastMessage.id, createdAt: chat.lastMessage.createdAt }) >= 0;
    if (isNewest) {
      next = {
        ...chat,
        lastMessage: {
          id: m.id,
          authorId: m.authorId,
          authorName,
          body: listBody(m),
          kind: m.kind,
          isDeleted: m.isDeleted,
          createdAt: m.createdAt,
          isTranscription: m.isTranscription === true,
          systemKind: m.systemKind ?? null,
        },
        unreadCount: m.authorId !== me && viewing !== m.conversationId ? chat.unreadCount + 1 : chat.unreadCount,
      };
    }
  } else if (chat.lastMessage?.id === m.id) {
    next = {
      ...chat,
      lastMessage: { ...chat.lastMessage, body: listBody(m), isDeleted: m.isDeleted },
    };
  }
  if (next === chat) return { chats, unknown: false };
  const copy = chats.slice();
  copy[i] = next;
  return { chats: copy, unknown: false };
}
