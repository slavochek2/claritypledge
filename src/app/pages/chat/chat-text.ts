/**
 * @file chat-text.ts
 * @description P1512: the sentences the chat shows for a message and for a failure. Pure.
 */
import type { ChatMessage } from '@/app/data/chat-mappers';

/** One line for a quote bar or a forward preview. */
export function messageSummary(m: Pick<ChatMessage, 'body' | 'isDeleted' | 'attachmentKind' | 'kind' | 'audio'>): string {
  if (m.isDeleted) return 'Message deleted';
  if (m.body) return m.body;
  if (m.audio) return 'Voice message';
  if (m.attachmentKind) return m.attachmentKind === 'point' ? 'A point' : 'A story';
  return m.kind === 'message' ? '' : 'Forwarded message';
}

/** Turns the RPCs' "chat: …" errors into a sentence for a toast or an inline notice. */
export function chatErrorText(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const m = /chat: ([^"]+?)(?:["\n]|$)/.exec(raw) ?? /: (cannot message this person|conversation not available)/.exec(raw);
  const reason = m?.[1]?.trim() ?? '';
  if (/cannot message this person|cannot start a conversation/.test(reason)) return 'You cannot message this person.';
  if (/no longer available/.test(reason)) return 'This person is no longer available.';
  if (/too many new conversations/.test(reason)) return 'You have started too many new conversations today. Try again tomorrow.';
  if (/message too long/.test(reason)) return 'That message is too long (4,000 characters at most).';
  if (/not available|not found/.test(reason)) return 'That is no longer available.';
  if (/offline|fetch|network/i.test(raw)) return 'You seem to be offline. Try again when you are back.';
  return fallback;
}
