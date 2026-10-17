/**
 * @file state.ts
 * @description P1509 v13 pure state: who sees which chat, who may message whom, search, unread, archive,
 * send/reply/comment/forward, voice notes and the live transcript. No React, no network: every function takes the
 * state and returns the next one, so the rules the backend spec must enforce (visibility, the messaging rule,
 * search scope) are testable here.
 */
import { arePartners, EVENTS, GROUPS, PEOPLE, SHAREABLE, type PersonId, type Shareable, type ViewerId } from './mock-data';

/** A channel belongs to a group: its `# general` (no eventId, members only) or one event's closed channel. */
export interface Chat { id: string; kind: 'dm' | 'channel'; members?: [PersonId, PersonId]; groupId?: string; eventId?: string }

export interface Msg {
  id: string;
  chatId: string;
  who: PersonId;
  text: string;
  time: string;
  /** "Forwarded from <name>": the ORIGINAL author, kept through re-forwards. */
  fwdFrom?: PersonId;
  /** A reply quotes the message it answers, in a 1:1 and in a channel alike. */
  quote?: { who: PersonId; text: string };
  /** A point or story posted from the 📎 dialog, rendered in its production frame. */
  share?: Shareable;
  /** A voice note: its length in seconds. */
  voice?: number;
  /** Posted by Transcribe on the speaker's behalf during a live event. */
  transcribed?: boolean;
  /** A table's opening post in an event channel: its conversation is the thread under it. */
  table?: string;
  failed?: boolean;
}

export interface State {
  viewer: ViewerId;
  chats: Chat[];
  msgs: Msg[];
  /** Channel threads, keyed by the post they hang under. People only, no agent. */
  comments: Record<string, Msg[]>;
  unread: Record<ViewerId, Record<string, number>>;
  /** Per viewer, archived chat ids in the order they were archived. */
  archived: Record<ViewerId, string[]>;
  /** Groups I have left (mock): their channels disappear for me. */
  left: Record<ViewerId, string[]>;
  /** `?state=fail`: every send fails until retried. */
  failSends: boolean;
  /** `?state=nopartners`: no agreements exist, so the Partners folder shows its invite state. */
  noPartners: boolean;
  seq: number;
}

export type Tab = 'all' | 'unread' | 'partners' | 'groups';

const pair = (a: PersonId, b: PersonId): [PersonId, PersonId] => [a, b];

const SEED_CHATS: Chat[] = [
  { id: 'dm-bob-alice', kind: 'dm', members: pair('bob', 'alice') },
  { id: 'dm-bob-carol', kind: 'dm', members: pair('bob', 'carol') },
  { id: 'dm-bob-dana', kind: 'dm', members: pair('bob', 'dana') },
  { id: 'dm-bob-eli', kind: 'dm', members: pair('bob', 'eli') },
  { id: 'dm-dana-alice', kind: 'dm', members: pair('dana', 'alice') },
  ...GROUPS.map((g): Chat => ({ id: `gen-${g.id}`, kind: 'channel', groupId: g.id })),
  ...EVENTS.map((e): Chat => ({ id: `ch-${e.id}`, kind: 'channel', groupId: e.groupId, eventId: e.id })),
];

const m = (id: string, chatId: string, who: PersonId, text: string, time: string, extra: Partial<Msg> = {}): Msg => ({ id, chatId, who, text, time, ...extra });

const SEED_MSGS: Msg[] = [
  /* Chronological: the list sorts chats by their newest message's position here. */
  m('m20', 'gen-bc', 'eli', 'Berlin circle starts in November. Ideas for a first venue?', 'Sept 20'),
  m('m12', 'ch-fc-sept', 'eli', 'Dinner notes: three of us want a monthly format.', 'Sept 28'),
  m('m21', 'gen-fc', 'bob', 'Monthly it is. First Tuesday?', 'Sept 29'),
  m('m11', 'ch-night-oct02', 'carol', 'Slides from the evening are in the group drive.', 'Oct 2'),
  m('m6', 'dm-bob-eli', 'eli', 'Dinner notes are in the channel.', 'Mon'),
  m('m22', 'gen-cm', 'carol', 'Who is bringing the timer tonight?', '11:00'),
  m('m8', 'ch-night-oct16', 'alice', 'Welcome to the channel for tonight. Post here before, during and after.', '12:00'),
  m('m9', 'ch-night-oct16', 'bob', 'Bring one disagreement you would like to understand better.', '12:30'),
  /* The live part: Transcribe posts each speaker's lines as their own message; a table is a thread. */
  m('m30', 'ch-night-oct16', 'alice', 'Welcome everyone. Tonight we pair up and try to state the other person’s view so well they say “yes, exactly”.', '19:02', { transcribed: true }),
  m('m31', 'ch-night-oct16', 'alice', 'Table 1 · round 1', '19:10', { table: 'Table 1', transcribed: true }),
  m('m7', 'dm-dana-alice', 'alice', 'See you at 7. Bring a question you care about.', '14:00'),
  m('m4', 'dm-bob-carol', 'carol', 'Can you send the slides from Oct 2?', '15:40'),
  m('m5', 'dm-bob-dana', 'dana', 'Thanks for inviting me tonight!', '16:10'),
  m('m1', 'dm-bob-alice', 'bob', 'Ready for tonight?', '17:02'),
  m('m2', 'dm-bob-alice', 'alice', 'Ask what they would need to hear to change their mind.', '17:05', { fwdFrom: 'sam' }),
  m('m3', 'dm-bob-alice', 'alice', 'This is the exercise I want to try.', '17:05'),
];

const SEED_COMMENTS: Record<string, Msg[]> = {
  m9: [m('c1', 'ch-night-oct16', 'carol', 'I will bring one about remote work.', '12:41')],
  m31: [
    m('t1', 'ch-night-oct16', 'bob', 'My claim is that most arguments at work are about definitions, not facts.', '19:11', { transcribed: true }),
    m('t2', 'ch-night-oct16', 'dana', 'Can I repeat it back? People agree on what happened but use the same word for different things.', '19:12', { transcribed: true }),
    m('t3', 'ch-night-oct16', 'bob', 'Close. More that they never check which meaning the other person holds.', '19:12', { transcribed: true }),
  ],
};

export function initialState(opts: { viewer?: ViewerId; empty?: boolean; fail?: boolean; noPartners?: boolean } = {}): State {
  const msgs = opts.empty ? [] : [...SEED_MSGS];
  if (opts.fail) msgs.push(m('m-failed', 'dm-bob-alice', 'bob', 'Running ten minutes late.', 'now', { failed: true }));
  return {
    viewer: opts.viewer ?? 'bob',
    chats: opts.empty ? [] : [...SEED_CHATS],
    msgs,
    comments: opts.empty ? {} : { ...SEED_COMMENTS },
    unread: opts.empty ? { bob: {}, dana: {} } : {
      bob: { 'dm-bob-alice': 2, 'dm-bob-carol': 1, 'dm-bob-dana': 1, 'ch-night-oct16': 2, 'gen-cm': 1 },
      dana: { 'dm-dana-alice': 1, 'ch-night-oct16': 3 },
    },
    archived: { bob: [], dana: [] },
    left: { bob: [], dana: [] },
    failSends: !!opts.fail,
    noPartners: !!opts.noPartners,
    seq: 100,
  };
}

/* ---------- the rules (the backend spec enforces these in the database) ---------- */

export const eventOf = (c: Chat) => EVENTS.find((e) => e.id === c.eventId);
export const groupOf = (c: Chat) => GROUPS.find((g) => g.id === c.groupId);
export const partners = (st: State, a: PersonId, b: PersonId) => !st.noPartners && arePartners(a, b);

/** A dm: its two people. `# general`: the group's members. An event channel: the group's members and that event's attendees. */
export function canSee(viewer: PersonId, c: Chat): boolean {
  if (c.kind === 'dm') return !!c.members?.includes(viewer);
  const group = groupOf(c);
  if (!group) return false;
  if (group.members.includes(viewer)) return true;
  return !!eventOf(c)?.attendees.includes(viewer);
}

/** canSee, minus groups this viewer has left. */
const sees = (st: State, v: ViewerId, c: Chat) => canSee(v, c) && !(c.groupId && st.left[v].includes(c.groupId));

/** I can message someone only if we share a group as members, or an event. */
export function canMessage(a: PersonId, b: PersonId): boolean {
  if (a === b) return false;
  return GROUPS.some((g) => g.members.includes(a) && g.members.includes(b)) || EVENTS.some((e) => e.attendees.includes(a) && e.attendees.includes(b));
}

/** What two people share, for a new chat's opener: "attend Clarity Night, Oct 16" / "are in Chiang Mai Clarity". */
export function sharedWith(a: PersonId, b: PersonId): string {
  const g = GROUPS.find((x) => x.members.includes(a) && x.members.includes(b));
  if (g) return `are in ${g.name}`;
  const e = EVENTS.find((x) => x.attendees.includes(a) && x.attendees.includes(b));
  return e ? `attend ${e.name}` : '';
}

export const channelMembers = (c: Chat): PersonId[] => {
  const group = groupOf(c);
  return [...new Set([...(group?.members ?? []), ...(eventOf(c)?.attendees ?? [])])];
};
/** The group's whole circle: members plus everyone who attended one of its events. */
export const groupPeople = (groupId: string): PersonId[] =>
  [...new Set([...(GROUPS.find((g) => g.id === groupId)?.members ?? []), ...EVENTS.filter((e) => e.groupId === groupId).flatMap((e) => e.attendees)])];

/* ---------- reading ---------- */

export const otherOf = (st: State, c: Chat): PersonId => c.members!.find((p) => p !== st.viewer)!;
export const chatTitle = (st: State, c: Chat): string => (c.kind === 'dm' ? PEOPLE[otherOf(st, c)].name : eventOf(c)?.name ?? COPY_GENERAL);
const COPY_GENERAL = 'general';
/** A failed send never left its author's device: only the author sees it (with Retry). */
export const shownTo = (st: State, x: Msg) => !x.failed || x.who === st.viewer;
export const msgsOf = (st: State, chatId: string) => st.msgs.filter((x) => x.chatId === chatId && shownTo(st, x));
export const repliesOf = (st: State, postId: string) => (st.comments[postId] ?? []).filter((x) => shownTo(st, x));
export const lastMsg = (st: State, chatId: string) => msgsOf(st, chatId).at(-1);
export const unreadOf = (st: State, chatId: string) => st.unread[st.viewer][chatId] ?? 0;
export const isArchived = (st: State, chatId: string) => st.archived[st.viewer].includes(chatId);
export const chatById = (st: State, id: string) => st.chats.find((c) => c.id === id);

/** Chats I can see, most recent message first (a chat with no messages sorts last). */
export function visibleChats(st: State): Chat[] {
  /* Only messages I can see order my list: someone else's unsent message must not move a chat up. */
  const order = (c: Chat) => st.msgs.filter((x) => shownTo(st, x)).map((x) => x.chatId).lastIndexOf(c.id);
  return st.chats.filter((c) => sees(st, st.viewer, c)).sort((a, b) => order(b) - order(a));
}

export function chatsInTab(st: State, tab: Tab): Chat[] {
  const live = visibleChats(st).filter((c) => !isArchived(st, c.id));
  if (tab === 'all') return live;
  if (tab === 'unread') return live.filter((c) => unreadOf(st, c.id) > 0);
  if (tab === 'partners') return live.filter((c) => c.kind === 'dm' && partners(st, st.viewer, otherOf(st, c)));
  return live.filter((c) => c.kind === 'channel');
}

/** The Groups folder: one section per group I can see a channel of, `# general` first, then its events newest first. */
export function groupSections(st: State): { groupId: string; name: string; chats: Chat[] }[] {
  const chs = visibleChats(st).filter((c) => c.kind === 'channel' && !isArchived(st, c.id));
  return GROUPS.filter((g) => chs.some((c) => c.groupId === g.id)).map((g) => ({
    groupId: g.id,
    name: g.name,
    chats: [
      ...chs.filter((c) => c.groupId === g.id && !c.eventId),
      ...EVENTS.filter((e) => e.groupId === g.id).map((e) => chs.find((c) => c.eventId === e.id)).filter((c): c is Chat => !!c),
    ],
  }));
}

export const archivedChats = (st: State): Chat[] => st.archived[st.viewer].map((id) => chatById(st, id)).filter((c): c is Chat => !!c && sees(st, st.viewer, c));

/** Four fixed folders: All, Unread, Partners (always, so it can invite), Groups (once I see any channel). */
export function tabsFor(st: State): { id: Tab; label: string; unread: number }[] {
  const sum = (cs: Chat[]) => cs.reduce((n, c) => n + unreadOf(st, c.id), 0);
  const hasGroups = visibleChats(st).some((c) => c.kind === 'channel');
  return [
    { id: 'all', label: 'All chats', unread: sum(chatsInTab(st, 'all')) },
    { id: 'unread', label: 'Unread', unread: sum(chatsInTab(st, 'unread')) },
    { id: 'partners', label: 'Partners', unread: sum(chatsInTab(st, 'partners')) },
    ...(hasGroups ? [{ id: 'groups' as Tab, label: 'Groups', unread: sum(chatsInTab(st, 'groups')) }] : []),
  ];
}

/**
 * Search: chat names, and people I share a group or event with by name or slug; by email only on an exact
 * full match. Nobody I share nothing with is ever returned. Message text is not searched.
 */
export function search(st: State, q: string): { chats: Chat[]; people: PersonId[] } {
  const s = q.trim().toLowerCase();
  if (!s) return { chats: [], people: [] };
  const chats = visibleChats(st).filter((c) => chatTitle(st, c).toLowerCase().includes(s) || (c.kind === 'channel' && groupOf(c)?.name.toLowerCase().includes(s)));
  const people = (Object.keys(PEOPLE) as PersonId[]).filter((id) => {
    if (!canMessage(st.viewer, id)) return false;
    const p = PEOPLE[id];
    return p.name.toLowerCase().includes(s) || p.slug.toLowerCase().includes(s) || p.email.toLowerCase() === s;
  });
  return { chats, people };
}

/**
 * The 📎 dialog's search: my own items and those of people I can message. Words match the title; `#tag` words must
 * all match (multi-tag is AND). `kind` narrows to points or stories.
 */
export function findShareable(st: State, q: string, kind: 'all' | 'point' | 'story' = 'all'): Shareable[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const tags = words.filter((w) => w.startsWith('#')).map((w) => w.slice(1)).filter(Boolean);
  const text = words.filter((w) => !w.startsWith('#'));
  return SHAREABLE.filter((x) => (x.author === st.viewer || canMessage(st.viewer, x.author))
    && (kind === 'all' || x.kind === kind)
    && tags.every((t) => x.tags.some((xt) => xt.startsWith(t)))
    && text.every((w) => x.title.toLowerCase().includes(w) || x.tags.some((xt) => xt.includes(w))));
}

/* ---------- writing ---------- */

const NOW = 'now';
const nextId = (st: State, prefix: string): [string, number] => [`${prefix}${st.seq}`, st.seq + 1];

export const openChat = (st: State, chatId: string): State => ({ ...st, unread: { ...st.unread, [st.viewer]: { ...st.unread[st.viewer], [chatId]: 0 } } });

/**
 * A message lands in a chat: every persona who sees the chat gets it out of the archive, and everyone but the
 * author gets it as unread. One path for sends, forwards and transcript lines, so the backend's fan-out has one model.
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
    if (!sees(st, v, c)) continue;
    archived[v] = archived[v].filter((x) => x !== msg.chatId);
    if (v !== msg.who) unread[v] = { ...unread[v], [msg.chatId]: (unread[v][msg.chatId] ?? 0) + 1 };
  }
  return { ...st, unread, archived };
}

/** A message or comment I may read: it sits in a chat I can see. */
function readable(st: State, msgId: string): Msg | undefined {
  const x = st.msgs.find((y) => y.id === msgId) ?? Object.values(st.comments).flat().find((y) => y.id === msgId);
  const c = x && chatById(st, x.chatId);
  return x && c && sees(st, st.viewer, c) && shownTo(st, x) ? x : undefined;
}

/** What a quote or preview shows for a message: its text, else the point/story title, else "Voice message". */
export const summary = (x: Msg) => x.text || x.share?.title || (x.voice ? 'Voice message' : '');

export function send(st: State, chatId: string, text: string, extra: Partial<Msg> = {}): State {
  const c = chatById(st, chatId);
  if (!c || !sees(st, st.viewer, c)) return st;
  const [id, seq] = nextId(st, 'm');
  const msg = m(id, chatId, st.viewer, text, NOW, { ...extra, failed: st.failSends || undefined });
  /* A failed send never left this device: nobody else receives it until Retry. */
  return msg.failed ? { ...st, seq, msgs: [...st.msgs, msg] } : deliver({ ...st, seq }, msg);
}

/** A voice note under one second is a slip of the finger (WhatsApp): it is dropped, not sent. */
export const sendVoice = (st: State, chatId: string, secs: number, extra: Partial<Msg> = {}): State => (secs < 1 ? st : send(st, chatId, '', { ...extra, voice: Math.round(secs) }));

/** Retry a failed send or comment: in the prototype the retry always succeeds and later sends do too. */
export function retry(st: State, msgId: string): State {
  const target = st.msgs.find((x) => x.id === msgId) ?? Object.values(st.comments).flat().find((x) => x.id === msgId);
  if (!target || target.who !== st.viewer) return st; // only the author can resend
  const fix = (x: Msg) => (x.id === msgId ? { ...x, failed: undefined, time: NOW } : x);
  const inMsgs = st.msgs.find((x) => x.id === msgId);
  const comments = Object.fromEntries(Object.entries(st.comments).map(([k, v]) => [k, v.map(fix)]));
  const next: State = { ...st, failSends: false, comments, msgs: st.msgs.map(fix) };
  const inComments = Object.values(st.comments).flat().find((x) => x.id === msgId);
  const failed = inMsgs?.failed ? inMsgs : inComments?.failed ? inComments : undefined;
  return failed ? fanOut(next, fix(failed)) : next;
}

/** Comment under a post in a channel I can see. People only, no agent. */
export function comment(st: State, postId: string, text: string, extra: Partial<Msg> = {}): State {
  const post = st.msgs.find((x) => x.id === postId);
  if (!post || post.failed || !readable(st, postId)) return st; // no thread under a post that never left
  const [id, seq] = nextId(st, 'c');
  const c = m(id, post.chatId, st.viewer, text, NOW, { ...extra, failed: st.failSends || undefined });
  const next = { ...st, seq, comments: { ...st.comments, [postId]: [...(st.comments[postId] ?? []), c] } };
  /* A thread reply reaches the channel's other readers like a post does (unread, out of the archive); a failed one waits for Retry. */
  return c.failed ? next : fanOut(next, c);
}

/** Forward a message I can read into a chat I see, with an optional note sent after it; the copy names the original author. */
export function forward(st: State, msgId: string, toChatId: string, note = ''): State {
  const src = readable(st, msgId);
  const to = chatById(st, toChatId);
  if (!src || !to || !sees(st, st.viewer, to)) return st;
  const [id, seq] = nextId(st, 'm');
  const copy = m(id, toChatId, st.viewer, src.text, NOW, { fwdFrom: src.fwdFrom ?? src.who, share: src.share, voice: src.voice, failed: st.failSends || undefined });
  /* A forward is a send: under `?state=fail` it fails like one and reaches nobody until Retry. */
  const after = copy.failed ? { ...st, seq, msgs: [...st.msgs, copy] } : deliver({ ...st, seq }, copy);
  return note.trim() ? send(after, toChatId, note.trim()) : after;
}

export const archive = (st: State, chatId: string): State =>
  isArchived(st, chatId) ? st : { ...st, archived: { ...st.archived, [st.viewer]: [...st.archived[st.viewer], chatId] } };
export const unarchive = (st: State, chatId: string): State => ({ ...st, archived: { ...st.archived, [st.viewer]: st.archived[st.viewer].filter((id) => id !== chatId) } });

/** Leave a group (mock): its `# general` and event channels leave my list. Only a member can leave. */
export const leaveGroup = (st: State, groupId: string): State =>
  !GROUPS.find((g) => g.id === groupId)?.members.includes(st.viewer) || st.left[st.viewer].includes(groupId)
    ? st
    : { ...st, left: { ...st.left, [st.viewer]: [...st.left[st.viewer], groupId] } };

/**
 * The live event: Transcribe posts the next line of whoever is speaking. A line said at a table lands in that
 * table's thread; anything else is a post in the event channel. The speaker is the author (they post, not a bot).
 */
const LIVE_SCRIPT: { who: PersonId; text: string; table?: string }[] = [
  { who: 'alice', text: 'Dana, rate how sure you are that you got it, then Bob rates how well you got it.', table: 'm31' },
  { who: 'dana', text: 'I’d say seven out of ten.', table: 'm31' },
  { who: 'bob', text: 'Eight. The part about never checking is what I meant.', table: 'm31' },
  { who: 'alice', text: 'Two minutes left in this round. Then everyone moves one table to the left.' },
];
export function nextLiveLine(st: State, chatId: string): State {
  const done = [...st.msgs, ...Object.values(st.comments).flat()].filter((x) => x.chatId === chatId && x.transcribed && x.id.startsWith('L')).length;
  const line = LIVE_SCRIPT[done];
  if (!line) return st;
  const [, seq] = nextId(st, 'L');
  const id = `L${st.seq}`;
  const msg = m(id, chatId, line.who, line.text, NOW, { transcribed: true });
  if (line.table) {
    const next = { ...st, seq, comments: { ...st.comments, [line.table]: [...(st.comments[line.table] ?? []), msg] } };
    return fanOut(next, msg);
  }
  return deliver({ ...st, seq }, msg);
}
export const liveLinesLeft = (st: State, chatId: string) =>
  LIVE_SCRIPT.length - [...st.msgs, ...Object.values(st.comments).flat()].filter((x) => x.chatId === chatId && x.id.startsWith('L')).length;

/** The Message button: the existing 1:1, or a new empty one. Only when the messaging rule allows. */
export function dmWith(st: State, other: PersonId): { next: State; chatId: string } | null {
  if (!canMessage(st.viewer, other)) return null;
  const found = st.chats.find((c) => c.kind === 'dm' && c.members!.includes(st.viewer) && c.members!.includes(other));
  if (found) return { next: unarchive(st, found.id), chatId: found.id };
  /* One id per pair whoever starts it, so two sides never create two chats. */
  const chat: Chat = { id: `dm-${[st.viewer, other].sort().join('-')}`, kind: 'dm', members: pair(st.viewer, other) };
  return { next: { ...st, chats: [...st.chats, chat] }, chatId: chat.id };
}
