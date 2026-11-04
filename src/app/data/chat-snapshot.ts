/**
 * @file chat-snapshot.ts
 * @description P1512 / P1592: the copy a forward or a clarify keeps (author name, words, and for a
 * clarify the thread it sat in), and the two marks it now carries: whether the source was a
 * transcription, and whether it was a system post (a round thread's title, shown alone).
 * Split out of chat-mappers.ts, which re-exports all of it.
 */

import { displaySystemBody } from './session-thread-title';

export type ChatKind = 'dm' | 'group' | 'event' | 'mirror';

/** Shown for an author that no longer exists (account erased). */
export const DELETED_USER_NAME = 'Deleted user';

/** P1592: the title-only root of a thread the server opens: a round table's thread, or the event's "Outside rounds" thread. */
export type ChatSystemKind = 'round_thread' | 'outside_rounds';

export interface ForwardThreadEntry {
  authorName: string;
  body: string | null;
  createdAt: string;
  /** P1592: copied from the source so a forwarded transcription keeps its label. */
  isTranscription?: boolean;
  systemKind?: ChatSystemKind | null;
}

export interface ForwardSnapshot {
  authorName: string;
  body: string | null;
  createdAt: string;
  conversationKind: ChatKind | null;
  /** Clarify only: the source chat as the clarifier saw it (dm: the other person; group: "<Org> · General"; event: its title). */
  conversationTitle: string | null;
  /** P1592: the source was a transcription line / a system post (title alone, never "Deleted user"). */
  isTranscription?: boolean;
  systemKind?: ChatSystemKind | null;
  /** Clarify only: the replies of the thread the message sat in, oldest first. */
  thread: ForwardThreadEntry[];
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asSystemKind(v: unknown): ChatSystemKind | null {
  return v === 'round_thread' || v === 'outside_rounds' ? v : null;
}

function mapThread(raw: unknown): ForwardThreadEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => {
    const entry = (e ?? {}) as Record<string, unknown>;
    return {
      authorName: asString(entry.author_name) ?? DELETED_USER_NAME,
      body: displaySystemBody(asString(entry.body), asString(entry.system_kind)),
      createdAt: asString(entry.created_at) ?? '',
      isTranscription: entry.is_transcription === true,
      systemKind: asSystemKind(entry.system_kind),
    };
  });
}

export function mapForwardSnapshot(raw: Record<string, unknown> | null): ForwardSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const kind = asString(raw.conversation_kind);
  return {
    authorName: asString(raw.author_name) ?? DELETED_USER_NAME,
    body: displaySystemBody(asString(raw.body), asString(raw.system_kind)),
    createdAt: asString(raw.created_at) ?? '',
    conversationKind: kind === 'dm' || kind === 'group' || kind === 'event' || kind === 'mirror' ? kind : null,
    conversationTitle: asString(raw.conversation_title),
    isTranscription: raw.is_transcription === true,
    systemKind: asSystemKind(raw.system_kind),
    thread: mapThread(raw.thread),
  };
}
