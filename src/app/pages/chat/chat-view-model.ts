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
/** Where "Invite a Clarity Partner" goes (the new-message picker, the list's empty hint). */
export const INVITE_PARTNER_PATH = '/agreements/new/create';
export const chatPath = (conversationId: string, opts: { rootId?: string; messageId?: string } = {}) => {
  const base = `${HOME}/c/${conversationId}${opts.rootId ? `/t/${opts.rootId}` : ''}`;
  return opts.messageId ? `${base}?m=${opts.messageId}` : base;
};

// ---------------------------------------------------------------------------
// History: what each entry knows about the entries below it
// ---------------------------------------------------------------------------
//
// Every chat-area entry carries `below`: what the entries directly under it are, nearest first.
//   'list' the chat list;  'conv' a chat or thread that is a real way back (a thread's own chat, the chat a
//   Clarify came from);  'from' where a link took the person into ANOTHER chat's thread: a way back for the chat
//   that thread's Back lands on, never for the thread itself;  'skip' an entry left behind by a swap, never a way back.
// It is derived from the ACTUAL predecessor when an entry is created (chatNav), never inherited blindly, so:
//   Back (backPlan)   pops to the nearest real way back, else replaces with the parent;
//   Leave (leavePlan) pops to the list, else clears the conversation entries it can see, so no chat is left behind.
// react-router cannot read the entries below, so this is the only place the answer can live.

export type NavLevel = 'list' | 'conv' | 'from' | 'skip';
export interface ChatNavState {
  below: NavLevel[];
}
type RouteLevel = 'list' | 'chat' | 'thread';

/** What a chat-area path is: the list, a chat (the mirror included), a thread; null anywhere else. */
export function routeLevel(pathname: string): RouteLevel | null {
  if (pathname === HOME || pathname === `${HOME}/`) return 'list';
  const r = parseChatRoute(pathname);
  if (!r.conversationId) return null;
  return r.rootId ? 'thread' : 'chat';
}

const belowOf = (state: unknown): NavLevel[] => {
  const below = (state as ChatNavState | null)?.below;
  return Array.isArray(below) ? below : [];
};
/** Entries that were ways back for what sat on top of them are not for what replaces it. */
const stale = (below: NavLevel[]): NavLevel[] => below.map((l) => (l === 'conv' || l === 'from' ? 'skip' : l));

/** 'open' a list or switch move; 'redirect' swaps a chat for its own thread (a search hit); 'follow' goes from here to somewhere else and wants Back to return (Clarify, a link to an original). */
export type NavIntent = 'open' | 'redirect' | 'follow';
export interface NavPlan {
  mode: 'push' | 'replace' | 'none';
  state: ChatNavState | undefined;
}

/**
 * The one rule for moving inside Home. `from` is the entry the person is on; `to` the path they go to (a search
 * string is ignored). A list pick pushes. Opening a thread on its chat pushes. Everything else inside Home swaps the
 * entry in place, keeping the slot's own predecessors, so history never piles up chats nobody can go back to.
 */
export function chatNav(from: { pathname: string; state: unknown }, to: string, intent: NavIntent = 'open'): NavPlan {
  const toPath = to.split('?')[0] ?? to;
  const below = belowOf(from.state);
  // Already there: nothing to do, unless the address adds a message to scroll to (?m=): same entry, new address.
  if (from.pathname === toPath) return to.includes('?') ? { mode: 'replace', state: { below } } : { mode: 'none', state: undefined };
  const fl = routeLevel(from.pathname);
  const tl = routeLevel(toPath);
  const sameConv = !!parseChatRoute(from.pathname).conversationId && parseChatRoute(from.pathname).conversationId === parseChatRoute(toPath).conversationId;
  if (intent === 'follow') {
    if (fl === 'chat' || fl === 'thread') return { mode: 'push', state: { below: [tl === 'thread' && !(fl === 'chat' && sameConv) ? 'from' : 'conv', ...below] } };
    return { mode: 'push', state: { below: fl === 'list' ? ['list'] : [] } };
  }
  if (intent === 'redirect') return { mode: 'replace', state: { below: stale(below) } };
  if (fl === 'list') return { mode: 'push', state: { below: ['list'] } };
  if (fl === 'chat' && tl === 'thread' && sameConv) return { mode: 'push', state: { below: ['conv', ...below] } };
  if (fl === 'thread' && tl === 'thread' && sameConv) return { mode: 'replace', state: { below } };
  if (fl === null) return { mode: 'push', state: { below: [] } };
  return { mode: 'replace', state: { below: stale(below) } };
}

export type BackStep = { kind: 'pop'; steps: number } | { kind: 'replace'; to: string; state: ChatNavState | undefined };

/**
 * Back: a thread pops only when ITS OWN chat is directly below it; otherwise (whatever else is below) it replaces
 * itself with that chat. A chat pops to the nearest real way back, else replaces with the list.
 */
export function backPlan(pathname: string, state: unknown): BackStep {
  const below = belowOf(state);
  const j = below.findIndex((l) => l !== 'skip');
  if (routeLevel(pathname) === 'thread') {
    if (below[0] === 'conv') return { kind: 'pop', steps: 1 };
    return { kind: 'replace', to: chatPath(parseChatRoute(pathname).conversationId ?? ''), state: { below } };
  }
  if (j >= 0) return { kind: 'pop', steps: j + 1 };
  return { kind: 'replace', to: HOME, state: undefined };
}

export type LeaveStep = { kind: 'pop'; steps: number } | { kind: 'replace'; to: string } | { kind: 'pop-replace'; steps: number; to: string };

/** Leave for good (archive, mark unread): pop to the list; without one in sight, pop what is known of the conversation and replace what is left. */
export function leavePlan(_pathname: string, state: unknown): LeaveStep {
  const below = belowOf(state);
  const list = below.indexOf('list');
  if (list >= 0) return { kind: 'pop', steps: list + 1 };
  if (below.length === 0) return { kind: 'replace', to: HOME };
  return { kind: 'pop-replace', steps: below.length, to: HOME };
}

/** A group's General channel in Home, from the chat list; /home while the channel is not in the list (yet). */
export function groupChatPath(chats: ChatSummary[], orgId: string): string {
  const channel = chats.find((c) => c.kind === 'group' && c.org?.id === orgId);
  return channel ? chatPath(channel.conversationId) : HOME;
}

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
export function mirrorRole(chat: Pick<ChatSummary, 'ownerFirstName'>): string {
  return chat.ownerFirstName ? `${chat.ownerFirstName}'s mirror` : 'Your mirror';
}
export function mirrorLabel(chat: Pick<ChatSummary, 'title' | 'ownerFirstName'>): string {
  const role = mirrorRole(chat);
  return chat.title ? `${chat.title} · ${role}` : role;
}

/**
 * The mirror's own name, for a sentence: the custom title once renamed, else "<First>'s mirror"
 * ("your mirror" when the first name is unknown). "Clarify with Ada's mirror", "Sent to Ada's mirror to clarify".
 */
export function mirrorName(chat: Pick<ChatSummary, 'title' | 'ownerFirstName'> | null | undefined): string {
  if (chat?.title) return chat.title;
  return chat?.ownerFirstName ? `${chat.ownerFirstName}'s mirror` : 'your mirror';
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

/**
 * Where a clarified copy came from, as the clarifier saw it, to follow "from ": "your chat with Ada" for a 1:1,
 * the channel or event title for a channel.
 */
export function sourceLabel(kind: string | null, title: string | null): string {
  if (kind === 'dm') return title ? `your chat with ${title}` : 'your chat';
  if (title) return title;
  switch (kind) {
    case 'group':
      return 'a group chat';
    case 'event':
      return 'an event chat';
    case 'mirror':
      return 'your mirror';
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

/** The last-message line: "You: …", the author's first name in channels, "Clarify: …", "Message deleted". */
export function previewLine(chat: ChatSummary, viewerId: string | null): { prefix: string; text: string } {
  const last = chat.lastMessage;
  if (!last) return { prefix: '', text: '' };
  // A clarified message reads "Clarify: <its first words>" (just "Clarify" when there are none), whoever sent it.
  if (last.kind === 'clarify' && !last.isDeleted) {
    const words = (last.body ?? '').replace(/\s+/g, ' ').trim();
    return words ? { prefix: 'Clarify: ', text: words } : { prefix: '', text: 'Clarify' };
  }
  const text = last.isDeleted ? 'Message deleted' : last.body || (last.kind === 'forward' ? 'Forwarded message' : 'Attachment');
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

const ISO_PARTS = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/;

/**
 * A timestamp as [whole milliseconds since the epoch, extra microseconds 0-999]. Postgres writes
 * microseconds and Date.parse keeps only milliseconds, so two messages a few microseconds apart
 * would compare equal; the fraction is read from the string instead, and the offset is applied, so
 * "…:00.1234+07:00" and "…:00.1235Z" compare as the instants they are.
 */
export function timestampParts(iso: string): [number, number] | null {
  const m = ISO_PARTS.exec(iso);
  if (!m) {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : [t, 0];
  }
  const base = m[1] as string;
  const fraction = (m[2] ?? '').padEnd(6, '0').slice(0, 6);
  const zone = m[3] ?? 'Z';
  const offset = zone === 'Z' ? 'Z' : zone.length === 3 ? `${zone}:00` : zone.includes(':') ? zone : `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const ms = Date.parse(`${base}.${fraction.slice(0, 3)}${offset}`);
  return Number.isNaN(ms) ? null : [ms, Number(fraction.slice(3))];
}

/** Full-precision order of two ISO timestamps (negative: a is earlier). */
export function compareTimestamps(a: string, b: string): number {
  const pa = timestampParts(a);
  const pb = timestampParts(b);
  if (!pa || !pb) return a.localeCompare(b);
  return pa[0] - pb[0] || pa[1] - pb[1];
}

/** Orders two messages the way the server pages them: by created_at (to the microsecond), then id. */
export function compareMessages(a: Pick<ChatMessage, 'createdAt' | 'id'>, b: Pick<ChatMessage, 'createdAt' | 'id'>): number {
  return compareTimestamps(a.createdAt, b.createdAt) || a.id.localeCompare(b.id);
}

/**
 * Of two copies of one message, the newer version: a delete beats everything (the words are gone),
 * then the later edit. A fetch that started before an edit or delete must never undo it.
 */
export function newerVersion<T extends ChatMessage>(have: T, incoming: T): T {
  if (have.isDeleted && !incoming.isDeleted) return have;
  if (incoming.isDeleted) return incoming;
  if (!have.editedAt) return incoming;
  if (!incoming.editedAt) return have;
  return compareTimestamps(have.editedAt, incoming.editedAt) > 0 ? have : incoming;
}

/** Inserts or merges by id (newer version wins), keeping the server's order. */
export function upsertMessage<T extends ChatMessage>(list: T[], next: T): T[] {
  const i = list.findIndex((m) => m.id === next.id);
  if (i >= 0) {
    const merged = newerVersion(list[i] as T, next);
    if (merged === list[i]) return list;
    const copy = list.slice();
    copy[i] = merged;
    return copy;
  }
  const out = [...list, next];
  out.sort(compareMessages);
  return out;
}

/** Replaces a loaded message with a newer version; a message that is not loaded is left alone. */
export function replaceLoaded<T extends ChatMessage>(list: T[], next: T): T[] {
  return list.some((m) => m.id === next.id) ? upsertMessage(list, next) : list;
}

/** Adds a newly arrived message at the end, but never one older than what is loaded (that would punch a hole in paging). */
export function appendIfNewer<T extends ChatMessage>(list: T[], next: T): T[] {
  if (list.some((m) => m.id === next.id)) return upsertMessage(list, next);
  const oldest = list[0];
  if (oldest && compareMessages(next, oldest) < 0) return list;
  return upsertMessage(list, next);
}

/**
 * The loaded window after a re-read of everything from `fetched[0]` up to now: rows older than the
 * re-read are kept (earlier pages), and everything in between is exactly what the server returned,
 * merged by version. A row the server no longer returns inside that range is dropped, and so is a
 * row NEWER than everything it returned if it was already loaded when the read began (`startIds`);
 * only rows that arrived after the read started are kept on top. When the read reached the start of
 * the conversation (`reachedStart`), loaded rows older than its first row are dropped as well.
 */
export function reconcileWindow<T extends ChatMessage>(loaded: T[], fetched: T[], startIds: ReadonlySet<string>, reachedStart = false): T[] {
  const lo = fetched[0];
  const hi = fetched[fetched.length - 1];
  // Nothing came back: the conversation is empty now, so everything that was loaded when the read began goes.
  if (!lo || !hi) return loaded.filter((m) => !startIds.has(m.id));
  const byId = new Map(loaded.map((m) => [m.id, m]));
  const middle = fetched.map((m) => {
    const have = byId.get(m.id);
    return have ? newerVersion(have, m) : m;
  });
  // Reaching the start of the conversation means nothing older exists: loaded rows older than it are gone.
  const older = reachedStart ? [] : loaded.filter((m) => compareMessages(m, lo) < 0);
  const arrived = loaded.filter((m) => compareMessages(m, hi) > 0 && !startIds.has(m.id));
  return [...older, ...middle, ...arrived];
}

/**
 * The window after a re-read that could not reach back to what was loaded: the pages just read ARE the
 * window (gluing them to older rows would hide the gap), plus rows that arrived after the read began.
 */
export function replaceWindow<T extends ChatMessage>(loaded: T[], fetched: T[], startIds: ReadonlySet<string>): T[] {
  const byId = new Map(loaded.map((m) => [m.id, m]));
  const middle = fetched.map((m) => {
    const have = byId.get(m.id);
    return have ? newerVersion(have, m) : m;
  });
  const fetchedIds = new Set(fetched.map((m) => m.id));
  const arrived = loaded.filter((m) => !startIds.has(m.id) && !fetchedIds.has(m.id));
  const out = [...middle, ...arrived];
  out.sort(compareMessages);
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
