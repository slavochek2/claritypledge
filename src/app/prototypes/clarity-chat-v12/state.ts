/**
 * @file state.ts
 * @description P1509 v12 pure state: who sees which chat, who may message whom, search, unread, archive,
 * send/reply/comment/forward. No React, no network: every function takes the state and returns the next one,
 * so the rules the backend spec must enforce (visibility, the messaging rule, search scope) are testable here.
 */
import { arePartners, EVENTS, GROUPS, PEOPLE, type PersonId, type Shareable, type ViewerId, TRANSCRIPT_TEXT } from './mock-data';

export interface Chat { id: string; kind: 'dm' | 'channel'; members?: [PersonId, PersonId]; eventId?: string }

export interface Msg {
  id: string;
  chatId: string;
  who: PersonId;
  text: string;
  time: string;
  /** "Forwarded from <name>": the ORIGINAL author, kept through re-forwards. */
  fwdFrom?: PersonId;
  /** A 1:1 reply quotes the message it answers. */
  quote?: { who: PersonId; text: string };
  /** A point or story posted from the picker, shown as a plain link card. */
  share?: Shareable;
  /** The P1500 placeholder: a collapsed long transcript nothing acts on yet. */
  transcript?: boolean;
  failed?: boolean;
}

export interface State {
  viewer: ViewerId;
  chats: Chat[];
  msgs: Msg[];
  /** Channel comment threads, keyed by the post they hang under. People only, no agent. */
  comments: Record<string, Msg[]>;
  unread: Record<ViewerId, Record<string, number>>;
  /** Per viewer, archived chat ids in the order they were archived. */
  archived: Record<ViewerId, string[]>;
  /** `?state=fail`: every send fails until retried. */
  failSends: boolean;
  seq: number;
}

export type Tab = 'all' | 'unread' | 'partners' | string; // or a group id

const pair = (a: PersonId, b: PersonId): [PersonId, PersonId] => [a, b];

const SEED_CHATS: Chat[] = [
  { id: 'dm-bob-alice', kind: 'dm', members: pair('bob', 'alice') },
  { id: 'dm-bob-carol', kind: 'dm', members: pair('bob', 'carol') },
  { id: 'dm-bob-dana', kind: 'dm', members: pair('bob', 'dana') },
  { id: 'dm-bob-eli', kind: 'dm', members: pair('bob', 'eli') },
  { id: 'dm-dana-alice', kind: 'dm', members: pair('dana', 'alice') },
  ...EVENTS.map((e): Chat => ({ id: `ch-${e.id}`, kind: 'channel', eventId: e.id })),
];

const m = (id: string, chatId: string, who: PersonId, text: string, time: string, extra: Partial<Msg> = {}): Msg => ({ id, chatId, who, text, time, ...extra });

const SEED_MSGS: Msg[] = [
  /* Chronological: the list sorts chats by their newest message's position here. */
  m('m12', 'ch-fc-sept', 'eli', 'Dinner notes: three of us want a monthly format.', 'Sept 28'),
  m('m11', 'ch-night-oct02', 'carol', 'Slides from the evening are in the group drive.', 'Oct 2'),
  m('m6', 'dm-bob-eli', 'eli', 'Dinner notes are in the channel.', 'Mon'),
  m('m8', 'ch-night-oct16', 'alice', 'Welcome to the channel for tonight. Post here before, during and after.', '12:00'),
  m('m9', 'ch-night-oct16', 'bob', 'Bring one disagreement you would like to understand better.', '12:30'),
  m('m10', 'ch-night-oct16', 'alice', TRANSCRIPT_TEXT, '13:00', { transcript: true }),
  m('m7', 'dm-dana-alice', 'alice', 'See you at 7. Bring a question you care about.', '14:00'),
  m('m4', 'dm-bob-carol', 'carol', 'Can you send the slides from Oct 2?', '15:40'),
  m('m5', 'dm-bob-dana', 'dana', 'Thanks for inviting me tonight!', '16:10'),
  m('m1', 'dm-bob-alice', 'bob', 'Ready for tonight?', '17:02'),
  m('m2', 'dm-bob-alice', 'alice', 'Ask what they would need to hear to change their mind.', '17:05', { fwdFrom: 'sam' }),
  m('m3', 'dm-bob-alice', 'alice', 'This is the exercise I want to try.', '17:05'),
];

export function initialState(opts: { viewer?: ViewerId; empty?: boolean; fail?: boolean } = {}): State {
  const msgs = opts.empty ? [] : [...SEED_MSGS];
  if (opts.fail) msgs.push(m('m-failed', 'dm-bob-alice', 'bob', 'Running ten minutes late.', 'now', { failed: true }));
  return {
    viewer: opts.viewer ?? 'bob',
    chats: opts.empty ? [] : [...SEED_CHATS],
    msgs,
    comments: opts.empty ? {} : { m9: [m('c1', 'ch-night-oct16', 'carol', 'I will bring one about remote work.', '12:41')] },
    unread: opts.empty ? { bob: {}, dana: {} } : {
      bob: { 'dm-bob-alice': 2, 'dm-bob-carol': 1, 'dm-bob-dana': 1, 'ch-night-oct16': 1 },
      dana: { 'dm-dana-alice': 1, 'ch-night-oct16': 3 },
    },
    archived: { bob: [], dana: [] },
    failSends: !!opts.fail,
    seq: 100,
  };
}

/* ---------- the rules (the backend spec enforces these in the database) ---------- */

export const eventOf = (c: Chat) => EVENTS.find((e) => e.id === c.eventId);

/** A dm: its two people. A channel: every member of the event's group, and every attendee of that one event. */
export function canSee(viewer: PersonId, c: Chat): boolean {
  if (c.kind === 'dm') return !!c.members?.includes(viewer);
  const ev = eventOf(c);
  if (!ev) return false;
  const group = GROUPS.find((g) => g.id === ev.groupId);
  return !!group?.members.includes(viewer) || ev.attendees.includes(viewer);
}

/** I can message someone only if we share a group as members, or an event. */
export function canMessage(a: PersonId, b: PersonId): boolean {
  if (a === b) return false;
  return GROUPS.some((g) => g.members.includes(a) && g.members.includes(b)) || EVENTS.some((e) => e.attendees.includes(a) && e.attendees.includes(b));
}

export const channelMembers = (c: Chat): PersonId[] => {
  const ev = eventOf(c);
  if (!ev) return [];
  const group = GROUPS.find((g) => g.id === ev.groupId);
  return [...new Set([...(group?.members ?? []), ...ev.attendees])];
};

/* ---------- reading ---------- */

export const otherOf = (st: State, c: Chat): PersonId => c.members!.find((p) => p !== st.viewer)!;
export const chatTitle = (st: State, c: Chat): string => (c.kind === 'dm' ? PEOPLE[otherOf(st, c)].name : eventOf(c)?.name ?? c.id);
export const msgsOf = (st: State, chatId: string) => st.msgs.filter((x) => x.chatId === chatId);
export const lastMsg = (st: State, chatId: string) => msgsOf(st, chatId).at(-1);
export const unreadOf = (st: State, chatId: string) => st.unread[st.viewer][chatId] ?? 0;
export const isArchived = (st: State, chatId: string) => st.archived[st.viewer].includes(chatId);
export const chatById = (st: State, id: string) => st.chats.find((c) => c.id === id);

/** Chats I can see, most recent message first (a chat with no messages sorts last). */
export function visibleChats(st: State): Chat[] {
  const order = (c: Chat) => st.msgs.map((x) => x.chatId).lastIndexOf(c.id);
  return st.chats.filter((c) => canSee(st.viewer, c)).sort((a, b) => order(b) - order(a));
}

export function chatsInTab(st: State, tab: Tab): Chat[] {
  const live = visibleChats(st).filter((c) => !isArchived(st, c.id));
  if (tab === 'all') return live;
  if (tab === 'unread') return live.filter((c) => unreadOf(st, c.id) > 0);
  if (tab === 'partners') return live.filter((c) => c.kind === 'dm' && arePartners(st.viewer, otherOf(st, c)));
  return live.filter((c) => c.kind === 'channel' && eventOf(c)?.groupId === tab);
}

export const archivedChats = (st: State): Chat[] => st.archived[st.viewer].map((id) => chatById(st, id)).filter((c): c is Chat => !!c && canSee(st.viewer, c));

/** All, Unread, Partners (only once I have one), then one tab per group I am in, as a member or through an event channel I can see. */
export function tabsFor(st: State): { id: Tab; label: string; unread: number }[] {
  const sum = (cs: Chat[]) => cs.reduce((n, c) => n + unreadOf(st, c.id), 0);
  const groups = GROUPS.filter((g) => g.members.includes(st.viewer) || st.chats.some((c) => c.kind === 'channel' && eventOf(c)?.groupId === g.id && canSee(st.viewer, c)));
  return [
    { id: 'all', label: 'All chats', unread: sum(chatsInTab(st, 'all')) },
    { id: 'unread', label: 'Unread', unread: sum(chatsInTab(st, 'unread')) },
    ...(st.chats.some((c) => c.kind === 'dm' && canSee(st.viewer, c) && arePartners(st.viewer, otherOf(st, c))) ? [{ id: 'partners', label: 'Partners', unread: sum(chatsInTab(st, 'partners')) }] : []),
    ...groups.map((g) => ({ id: g.id, label: g.name, unread: sum(chatsInTab(st, g.id)) })),
  ];
}

/**
 * Search: chat names, and people I share a group or event with by name or nickname; by email only on an exact
 * full match. Nobody I share nothing with is ever returned. Message text is not searched.
 */
export function search(st: State, q: string): { chats: Chat[]; people: PersonId[] } {
  const s = q.trim().toLowerCase();
  if (!s) return { chats: [], people: [] };
  const chats = visibleChats(st).filter((c) => chatTitle(st, c).toLowerCase().includes(s));
  const people = (Object.keys(PEOPLE) as PersonId[]).filter((id) => {
    if (!canMessage(st.viewer, id)) return false;
    const p = PEOPLE[id];
    return p.name.toLowerCase().includes(s) || p.nickname.toLowerCase().includes(s) || p.email.toLowerCase() === s;
  });
  return { chats, people };
}

/* ---------- writing ---------- */

const NOW = 'now';
const nextId = (st: State, prefix: string): [string, number] => [`${prefix}${st.seq}`, st.seq + 1];

export const openChat = (st: State, chatId: string): State => ({ ...st, unread: { ...st.unread, [st.viewer]: { ...st.unread[st.viewer], [chatId]: 0 } } });

/**
 * A message lands in a chat: every persona who sees the chat gets it out of the archive, and everyone but the
 * author gets it as unread. One path for sends, forwards and mock arrivals, so the backend's fan-out has one model.
 */
function deliver(st: State, msg: Msg): State {
  return { ...fanOut(st, msg), msgs: [...st.msgs, msg] };
}

/** The fan-out half of delivery, for a message already in the list (a retried send resolves in place). */
function fanOut(st: State, msg: Msg): State {
  const c = chatById(st, msg.chatId);
  if (!c) return st;
  const unread = { ...st.unread };
  const archived = { ...st.archived };
  for (const v of ['bob', 'dana'] as ViewerId[]) {
    if (!canSee(v, c)) continue;
    archived[v] = archived[v].filter((x) => x !== msg.chatId);
    if (v !== msg.who) unread[v] = { ...unread[v], [msg.chatId]: (unread[v][msg.chatId] ?? 0) + 1 };
  }
  return { ...st, unread, archived };
}

/** A message or comment I may read: it sits in a chat I can see. */
function readable(st: State, msgId: string): Msg | undefined {
  const x = st.msgs.find((y) => y.id === msgId) ?? Object.values(st.comments).flat().find((y) => y.id === msgId);
  const c = x && chatById(st, x.chatId);
  return x && c && canSee(st.viewer, c) ? x : undefined;
}

export function send(st: State, chatId: string, text: string, extra: Partial<Msg> = {}): State {
  const c = chatById(st, chatId);
  if (!c || !canSee(st.viewer, c)) return st;
  const [id, seq] = nextId(st, 'm');
  const msg = m(id, chatId, st.viewer, text, NOW, { ...extra, failed: st.failSends || undefined });
  /* A failed send never left this device: nobody else receives it until Retry. */
  return msg.failed ? { ...st, seq, msgs: [...st.msgs, msg] } : deliver({ ...st, seq }, msg);
}

/** Retry a failed send or comment: in the prototype the retry always succeeds and later sends do too. */
export function retry(st: State, msgId: string): State {
  const fix = (x: Msg) => (x.id === msgId ? { ...x, failed: undefined, time: NOW } : x);
  const inMsgs = st.msgs.find((x) => x.id === msgId);
  const comments = Object.fromEntries(Object.entries(st.comments).map(([k, v]) => [k, v.map(fix)]));
  const next: State = { ...st, failSends: false, comments, msgs: st.msgs.map(fix) };
  const inComments = Object.values(st.comments).flat().find((x) => x.id === msgId);
  const failed = inMsgs?.failed ? inMsgs : inComments?.failed ? inComments : undefined;
  return failed ? fanOut(next, fix(failed)) : next;
}

/** Comment under a post in a channel I can see. People only, no agent. */
export function comment(st: State, postId: string, text: string): State {
  const post = st.msgs.find((x) => x.id === postId);
  if (!post || !readable(st, postId)) return st;
  const [id, seq] = nextId(st, 'c');
  const c = m(id, post.chatId, st.viewer, text, NOW, { failed: st.failSends || undefined });
  const next = { ...st, seq, comments: { ...st.comments, [postId]: [...(st.comments[postId] ?? []), c] } };
  /* A thread reply reaches the channel's other readers like a post does (unread, out of the archive); a failed one waits for Retry. */
  return c.failed ? next : fanOut(next, c);
}

/** Forward a message I can read into a chat I belong to; the copy names the original author. */
export function forward(st: State, msgId: string, toChatId: string): State {
  const src = readable(st, msgId);
  const to = chatById(st, toChatId);
  if (!src || !to || !canSee(st.viewer, to)) return st;
  const [id, seq] = nextId(st, 'm');
  return deliver({ ...st, seq }, m(id, toChatId, st.viewer, src.text, NOW, { fwdFrom: src.fwdFrom ?? src.who, share: src.share, transcript: src.transcript }));
}

export const archive = (st: State, chatId: string): State =>
  isArchived(st, chatId) ? st : { ...st, archived: { ...st.archived, [st.viewer]: [...st.archived[st.viewer], chatId] } };
export const unarchive = (st: State, chatId: string): State => ({ ...st, archived: { ...st.archived, [st.viewer]: st.archived[st.viewer].filter((id) => id !== chatId) } });

/** A new message arrives from someone else (the strip's mock): unread and out of the archive for whoever sees it. */
export function incoming(st: State, chatId: string, who: PersonId, text: string): State {
  if (!chatById(st, chatId)) return st;
  const [id, seq] = nextId(st, 'm');
  return deliver({ ...st, seq }, m(id, chatId, who, text, NOW));
}

/** The strip's "Mock new message": into my most recently archived chat, else my first chat, from someone else in it. */
export function mockIncoming(st: State): { next: State; chatId: string } | null {
  const target = archivedChats(st).at(-1) ?? visibleChats(st).find((c) => c.kind === 'dm');
  if (!target) return null;
  const from = target.kind === 'dm' ? otherOf(st, target) : channelMembers(target).find((p) => p !== st.viewer)!;
  return { next: incoming(st, target.id, from, 'A new message (mock).'), chatId: target.id };
}

/** The Message button: the existing 1:1, or a new empty one. Only when the messaging rule allows. */
export function dmWith(st: State, other: PersonId): { next: State; chatId: string } | null {
  if (!canMessage(st.viewer, other)) return null;
  const found = st.chats.find((c) => c.kind === 'dm' && c.members!.includes(st.viewer) && c.members!.includes(other));
  if (found) return { next: unarchive(st, found.id), chatId: found.id };
  /* One id per pair whoever starts it, so two sides never create two chats. */
  const chat: Chat = { id: `dm-${[st.viewer, other].sort().join('-')}`, kind: 'dm', members: pair(st.viewer, other) };
  return { next: { ...st, chats: [...st.chats, chat] }, chatId: chat.id };
}
