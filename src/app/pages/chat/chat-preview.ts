/**
 * @file chat-preview.ts
 * @description P1592: the chat-list preview line. A system post (a round thread's title) has no
 * author, so it reads as its title alone: no "Deleted user: …" prefix. Everything else, including
 * a transcription line (an ordinary "Anna: …"), keeps the existing rule.
 */
import type { ChatSearchHit, ChatSummary } from '@/app/data/chat-service';
import { previewLine } from './chat-view-model';

export function listPreview(chat: ChatSummary, viewerId: string | null): { prefix: string; text: string } {
  const last = chat.lastMessage;
  if (last && last.systemKind && !last.isDeleted) return { prefix: '', text: last.body ?? '' };
  return previewLine(chat, viewerId);
}

/**
 * The line above a message search hit: "<author> · <chat>". A hit with no author is a system post
 * (a round thread's title): an erased account's messages lose their body, so they are never found
 * by text. It reads as the chat alone, never "Deleted user". (search_my_messages does not return
 * system_kind, so "no author and a body" is the signal.)
 */
export function searchHitHeading(hit: Pick<ChatSearchHit, 'authorId' | 'authorName'>, chat: string): string {
  if (!hit.authorId && !hit.authorName) return chat;
  return `${hit.authorName ?? 'Deleted user'} · ${chat}`;
}
