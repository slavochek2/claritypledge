/**
 * P1512: pure view logic for the chat UI — titles, tabs, the list's visibility rules, day grouping
 * and the route shape. No React, no network, so every rule here is unit-tested directly.
 */

import { EVENT_GRACE_HOURS } from '@/app/data/events-service-real';
import { isChatUnread, type ChatMessage, type ChatSummary } from '@/app/data/chat-mappers';

export type ChatTab = 'all' | 'unread' | 'partners' | 'channels';

export const CHAT_TABS: Array<{ id: ChatTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'partners', label: 'Partners' },
  { id: 'channels', label: 'Channels' },
];

export const isChannel = (c: Pick<ChatSummary, 'kind'>) => c.kind === 'group' || c.kind === 'event';

// ---------------------------------------------------------------------------
// Routes: /home, /home/c/:conversationId, /home/c/:conversationId/t/:rootId
// ---------------------------------------------------------------------------
export const HOME = '/home';
export const chatPath = (conversationId: string, opts: { rootId?: string; messageId?: string } = {}) => {
  const base = `${HOME}/c/${conversationId}${opts.rootId ? `/t/${opts.rootId}` : ''}`;
  return opts.messageId ? `${base}?m=${opts.messageId}` : base;
};

export interface ChatRoute {
  conversationId: string | null;
  rootId: string | null;
}

export function parseChatRoute(pathname: string): ChatRoute {
  const m = /^\/home\/c\/([^/]+)(?:\/t\/([^/]+))?\/?$/.exec(pathname);
  return { conversationId: m?.[1] ?? null, rootId: m?.[2] ?? null };
}

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

/** "Ada's mirror" for a mirror that has not been renamed; "<title> · Ada's mirror" once it has. */
export function mirrorLabel(chat: Pick<ChatSummary, 'title' | 'ownerFirstName'>): string {
  const role = chat.ownerFirstName ? `${chat.ownerFirstName}'s mirror` : 'Your mirror';
  return chat.title ? `${chat.title} · ${role}` : role;
}

/** The one-line name of a chat in the list, forward picker and search. */
export function chatTitle(chat: ChatSummary): string {
  switch (chat.kind) {
    case 'dm':
      return chat.other?.name ?? 'Deleted user';
    case 'group':
      return `${chat.org?.name ?? 'Group'} · General`;
    case 'event':
      return chat.event?.title ?? 'Event';
    case 'mirror':
      return mirrorLabel(chat);
  }
}

/** Where a clarified copy came from, as the clarifier saw it: "Builders · General", "a chat with Ada", or just the kind. */
export function sourceLabel(kind: string | null, title: string | null): string {
  if (title) return kind === 'dm' ? `a chat with ${title}` : title;
  switch (kind) {
    case 'dm':
      return 'a direct message';
    case 'group':
      return 'a group chat';
    case 'event':
      return 'an event chat';
    case 'mirror':
      return 'a mirror chat';
    default:
      return 'a chat';
  }
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

/**
 * Event channels show while the event is upcoming or within the grace window after it starts, or
 * once they have messages — so past events do not pile up as dead rows. Every other kind always shows.
 */
export function isChatVisibleInList(chat: ChatSummary, now: Date = new Date()): boolean {
  if (chat.kind !== 'event') return true;
  if (chat.lastMessage) return true;
  if (!chat.event) return false;
  const start = new Date(chat.event.datetime).getTime();
  return now.getTime() < start + EVENT_GRACE_HOURS * 60 * 60 * 1000;
}

/** Newest activity first. Ties fall back to the title so the order is stable between refetches. */
export function sortByActivity(chats: ChatSummary[]): ChatSummary[] {
  const at = (c: ChatSummary) => (c.lastMessage ? Date.parse(c.lastMessage.createdAt) : c.membersSince ? Date.parse(c.membersSince) : 0);
  return [...chats].sort((a, b) => at(b) - at(a) || chatTitle(a).localeCompare(chatTitle(b)));
}

export function matchesTab(chat: ChatSummary, tab: ChatTab): boolean {
  switch (tab) {
    case 'all':
      return true;
    case 'unread':
      return isChatUnread(chat);
    case 'partners':
      return chat.kind === 'dm' && chat.isPartner;
    case 'channels':
      return isChannel(chat);
  }
}

export interface ListSplit {
  /** Not archived, matching the tab, newest activity first. */
  active: ChatSummary[];
  archived: ChatSummary[];
}

export function splitChats(chats: ChatSummary[], tab: ChatTab, now: Date = new Date()): ListSplit {
  const shown = sortByActivity(chats.filter((c) => isChatVisibleInList(c, now)));
  return {
    active: shown.filter((c) => !c.archived && matchesTab(c, tab)),
    archived: shown.filter((c) => c.archived && matchesTab(c, tab)),
  };
}

/** Unread chats the person has not archived: the number on the Home entry. */
export function unreadChatCount(chats: ChatSummary[], now: Date = new Date()): number {
  return chats.filter((c) => !c.archived && isChatVisibleInList(c, now) && isChatUnread(c)).length;
}

/** Client-side title match for the search box. */
export function searchChats(chats: ChatSummary[], query: string): ChatSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return sortByActivity(chats).filter((c) => chatTitle(c).toLowerCase().includes(q));
}

/** The last-message line: "You: …", the author's first name in channels, "Message deleted". */
export function previewLine(chat: ChatSummary, viewerId: string | null): { prefix: string; text: string } {
  const last = chat.lastMessage;
  if (!last) return { prefix: '', text: '' };
  const text = last.isDeleted
    ? 'Message deleted'
    : last.body || (last.kind === 'forward' ? 'Forwarded message' : last.kind === 'clarify' ? 'Clarified message' : 'Attachment');
  if (last.isDeleted) return { prefix: '', text };
  if (viewerId && last.authorId === viewerId) return { prefix: 'You: ', text };
  if (isChannel(chat) && last.authorName) return { prefix: `${last.authorName.split(' ')[0]}: `, text };
  return { prefix: '', text };
}

/** "Now", "5m", "3h", "Yesterday" and a short date: the stamp on a list row. */
export function listTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const t = new Date(iso);
  const mins = Math.floor((now.getTime() - t.getTime()) / 60000);
  if (mins < 1) return 'Now';
  if (mins < 60) return `${mins}m`;
  if (isSameDay(t, now)) return t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(t, yesterday)) return 'Yesterday';
  return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Today", "Yesterday" or "Monday, October 19". */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (isSameDay(d, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

export const messageTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** Messages by the same author within this gap share one avatar + name header. */
export const GROUP_GAP_MS = 5 * 60 * 1000;

export interface MessageGroupInfo {
  /** Show the day divider above this message. */
  dayBreak: boolean;
  /** Same author as the row above, close in time, same day: hide avatar and name. */
  compact: boolean;
}

export function describeGrouping(messages: ChatMessage[]): MessageGroupInfo[] {
  return messages.map((m, i) => {
    const prev = messages[i - 1];
    const dayBreak = !prev || !isSameDay(new Date(prev.createdAt), new Date(m.createdAt));
    const compact =
      !dayBreak &&
      !!prev &&
      prev.authorId === m.authorId &&
      prev.authorId !== null &&
      m.kind === 'message' &&
      prev.kind === 'message' &&
      Date.parse(m.createdAt) - Date.parse(prev.createdAt) < GROUP_GAP_MS;
    return { dayBreak, compact };
  });
}

/** Inserts or replaces by id, keeping createdAt order (id breaks ties). */
export function upsertMessage<T extends ChatMessage>(list: T[], next: T): T[] {
  const i = list.findIndex((m) => m.id === next.id);
  if (i >= 0) {
    const copy = list.slice();
    copy[i] = next;
    return copy;
  }
  const out = [...list, next];
  out.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return out;
}

/** One line for a quote bar or a forward preview. */
export function messageSummary(m: Pick<ChatMessage, 'body' | 'isDeleted' | 'attachmentKind' | 'kind'>): string {
  if (m.isDeleted) return 'Message deleted';
  if (m.body) return m.body;
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
