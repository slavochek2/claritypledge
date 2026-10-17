/**
 * @file state.ts
 * @description P1509 v16: the CHAT MOCK's pure state. Chats, channels, threads, unread, archive and the mirror have no
 * tables, so they stay here; points, stories, letters, groups, events and partners are read through real-data.ts. The
 * viewer is whoever is signed in (a Bob or Dana test persona); a position taken on a real card is a local overlay
 * (no position write leaves the prototype). v15 header follows.
 * P1509 v15 pure state (v14's, plus: one mirror agent per viewer that is claimed by naming it and
 * receives Clarify forwards; joining a group; RSVP; partner invites that go pending then accepted; and the mock
 * positions shared point cards show). v14: who sees which chat, who may message whom, search, unread, archive,
 * send/reply/comment/forward, edit/delete my own message, voice notes and the live transcript. v14: threads in 1:1s
 * too (any readable post), search reaches everyone (strangers come back flagged so the UI can show "No chat yet"),
 * the Archived row counts archived chats with unread, and members-only channels are marked. No React, no network: every function takes the
 * state and returns the next one, so the rules the backend spec must enforce (visibility, the messaging rule,
 * search scope) are testable here.
 */
import type { PositionType } from '@/app/types';
import { COPY, EVENTS, GROUPS, PARTNERS, PEOPLE, type EventInfo, type PersonId, type Shareable, type ViewerId } from './mock-data';

/** A channel belongs to a group: its `# general` (no eventId, members only) or one event's closed channel. */
export interface Chat { id: string; kind: 'dm' | 'channel' | 'mirror'; members?: [PersonId, PersonId]; groupId?: string; eventId?: string; /** A mirror chat's one owner. */ owner?: ViewerId }

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
  /** v15 review #6: a Clarify copy remembers the chat it came from, so the mirror can link back. */
  from?: string;
  /** A table's opening post in an event channel: its conversation is the thread under it. */
  table?: string;
  failed?: boolean;
  /** Set once its author edits it: the row shows "edited". */
  edited?: boolean;
  /** v15 #10: said by the owner's mirror agent (`who` is the owner; the row shows the mirror's face and name). */
  agent?: boolean;
  /** v16: a forward (or Clarify) of a post that had a thread: it arrives as ONE card "Thread · N replies" whose thread is a copy of the original replies. */
  threadCard?: boolean;
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
  /** v15 #10: each viewer's ONE mirror agent, unclaimed (undefined) until they give it a name. */
  mirror: Record<ViewerId, string | undefined>;
  /** v15 #2: groups joined through the Join page (mock). */
  joined: Record<ViewerId, string[]>;
  /** v15 #3: events I reserved a seat at from the event page (mock). */
  rsvps: Record<ViewerId, string[]>;
  /** v15 review #2: seeded attendances I cancelled (Cancel RSVP works for a seeded attendee too). */
  cancelled: Record<ViewerId, string[]>;
  /** `?state=empty`: a viewer with nothing yet (no feed, no contacts). */
  empty: boolean;
  /** v15 #7: partner invites I sent and are not yet accepted, then the ones accepted. */
  invites: Record<ViewerId, PersonId[]>;
  accepted: [PersonId, PersonId][];
  /** v15 #8: my position on each point, as a LOCAL overlay on the real one (production writes it to point_positions; v16 never does). `null` = cleared here. */
  positions: Record<ViewerId, Record<string, PositionType | null>>;
  /** v16: the partner states the agreements service reported for the signed-in viewer (set by the prototype from the real read). */
  realPartners: Partial<Record<PersonId, 'pending' | 'partner'>>;
  /** v16: the viewer's real seats by chat-mock event id (true = going), read from the events service. Absent = not known: the roster stands in. */
  realGoing: Record<string, boolean>;
  /** v16: the real title and date of each seeded event, by chat-mock event id. Absent = the mock's own text stands in. */
  realEvents: Record<string, { name: string; when: string; day: string; today: boolean }>;
}

export type Tab = 'all' | 'unread' | 'partners' | 'groups';

const pair = (a: PersonId, b: PersonId): [PersonId, PersonId] => [a, b];

const SEED_CHATS: Chat[] = [
  { id: 'dm-bob-alice', kind: 'dm', members: pair('bob', 'alice') },
  { id: 'dm-bob-carol', kind: 'dm', members: pair('bob', 'carol') },
  { id: 'dm-bob-dana', kind: 'dm', members: pair('bob', 'dana') },
  { id: 'dm-bob-eli', kind: 'dm', members: pair('bob', 'eli') },
  { id: 'dm-dana-alice', kind: 'dm', members: pair('dana', 'alice') },
  { id: 'mirror-bob', kind: 'mirror', owner: 'bob' },
  { id: 'mirror-dana', kind: 'mirror', owner: 'dana' },
  ...GROUPS.map((g): Chat => ({ id: `gen-${g.id}`, kind: 'channel', groupId: g.id })),
  ...EVENTS.map((e): Chat => ({ id: `ch-${e.id}`, kind: 'channel', groupId: e.groupId, eventId: e.id })),
];

const m = (id: string, chatId: string, who: PersonId, text: string, time: string, extra: Partial<Msg> = {}): Msg => ({ id, chatId, who, text, time, ...extra });

const SEED_MSGS: Msg[] = [
  /* Chronological: the list sorts chats by their newest message's position here. */
  m('m20', 'gen-online', 'eli', 'Next online session is Oct 23. Bring someone from outside your field.', 'Sept 20'),
  m('m12', 'ch-online-sept', 'eli', 'Session notes: three of us want a monthly format.', 'Sept 28'),
  m('m21', 'ch-online-sept', 'bob', 'Monthly it is. First Tuesday?', 'Sept 29'),
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
  m9: [m('c1', 'ch-night-oct16', 'fay', 'I will bring one about remote work.', '12:41')],
  m31: [
    m('t1', 'ch-night-oct16', 'bob', 'My claim is that most arguments at work are about definitions, not facts.', '19:11', { transcribed: true }),
    m('t2', 'ch-night-oct16', 'dana', 'Can I repeat it back? People agree on what happened but use the same word for different things.', '19:12', { transcribed: true }),
    m('t3', 'ch-night-oct16', 'bob', 'Close. More that they never check which meaning the other person holds.', '19:12', { transcribed: true }),
  ],
};

export function initialState(opts: { viewer?: ViewerId; empty?: boolean; fail?: boolean; noPartners?: boolean; /** The prototype passes false: the partners come from the agreements service. Pure-state tests keep the mock pair. */ seedPartners?: boolean } = {}): State {
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
    mirror: { bob: undefined, dana: undefined },
    joined: { bob: [], dana: [] },
    rsvps: { bob: [], dana: [] },
    cancelled: { bob: [], dana: [] },
    empty: !!opts.empty,
    invites: { bob: [], dana: [] },
    accepted: [],
    positions: { bob: {}, dana: {} },
    realPartners: opts.seedPartners === false || opts.noPartners ? {} : Object.fromEntries(PARTNERS.flatMap(([x, y]) => (x === (opts.viewer ?? 'bob') ? [[y, 'partner']] : y === (opts.viewer ?? 'bob') ? [[x, 'partner']] : []))),
    realGoing: {},
    realEvents: {},
  };
}

/* ---------- the rules (the backend spec enforces these in the database) ---------- */

export const eventOf = (c: Chat) => EVENTS.find((e) => e.id === c.eventId);
export const groupOf = (c: Chat) => GROUPS.find((g) => g.id === c.groupId);
/** A partner of the viewer: ONE definition (partnerState), shared by the Partners folder, the badges and the headers. */
export const partners = (st: State, a: PersonId, b: PersonId) => partnerState(st, a === st.viewer ? b : a) === 'partner';

/** A dm: its two people. General: the group's members. An event channel (v16): exactly that event's RSVPs. */
export function canSee(viewer: PersonId, c: Chat): boolean {
  if (c.kind === 'mirror') return c.owner === viewer;
  if (c.kind === 'dm') return !!c.members?.includes(viewer);
  const ev = eventOf(c);
  if (ev) return ev.attendees.includes(viewer);
  return !!groupOf(c)?.members.includes(viewer);
}

/**
 * canSee, plus groups this viewer joined (v15), minus groups this viewer has left. An event channel IS that event's
 * RSVPs (v16): a seat reserved opens it, a cancelled seat closes it, and group membership alone never does.
 */
const sees = (st: State, v: ViewerId, c: Chat): boolean => {
  if (c.kind !== 'channel') return canSee(v, c);
  if (c.eventId) return isGoing(st, c.eventId, v);
  if (!c.groupId || st.left[v].includes(c.groupId)) return false;
  return (groupOf(c)?.members.includes(v) ?? false) || st.joined[v].includes(c.groupId);
};

/** A member of a group: on its roster or joined here, and not left. */
export const isMember = (st: State, v: ViewerId, groupId: string) =>
  ((GROUPS.find((g) => g.id === groupId)?.members.includes(v) ?? false) || st.joined[v].includes(groupId)) && !st.left[v].includes(groupId);
/** Groups I am a member of (the sidebar's "Your groups"). */
export const myGroups = (st: State) => GROUPS.filter((g) => isMember(st, st.viewer, g.id));

/** I can message someone only if we share a group as members, or an event. */
export function canMessage(a: PersonId, b: PersonId): boolean {
  if (a === b) return false;
  return GROUPS.some((g) => g.members.includes(a) && g.members.includes(b)) || EVENTS.some((e) => e.attendees.includes(a) && e.attendees.includes(b));
}

/** What two people share, for a new chat's opener: "attend Clarity Night, Oct 16" / "are in Chiang Mai Clarity". */
export function sharedWith(a: PersonId, b: PersonId, st?: State): string {
  const g = GROUPS.find((x) => x.members.includes(a) && x.members.includes(b));
  if (g) return `are in ${g.name}`;
  const e = EVENTS.find((x) => x.attendees.includes(a) && x.attendees.includes(b));
  return e ? `attend ${st ? eventName(st, e) : e.name}` : '';
}

/** General: the group's members. An event channel: that event's RSVPs (the Members screen reads the real attendees). */
/** An event's name, date line and day label: the REAL event's when it is seeded, else the chat mock's. */
export const eventName = (st: State, ev: EventInfo) => st.realEvents[ev.id]?.name ?? ev.name;
export const eventWhen = (st: State, ev: EventInfo) => st.realEvents[ev.id]?.when ?? ev.when;
export const eventDay = (st: State, ev: EventInfo) => {
  const real = st.realEvents[ev.id];
  return real ? (real.today ? 'Today' : real.day) : ev.today ? 'Today' : ev.when;
};

export const channelMembers = (c: Chat): PersonId[] => {
  const ev = eventOf(c);
  return ev ? [...ev.attendees] : [...(groupOf(c)?.members ?? [])];
};
/** The group's whole circle: members plus everyone who attended one of its events. */
export const groupPeople = (groupId: string): PersonId[] =>
  [...new Set([...(GROUPS.find((g) => g.id === groupId)?.members ?? []), ...EVENTS.filter((e) => e.groupId === groupId).flatMap((e) => e.attendees)])];

/* ---------- reading ---------- */

export const otherOf = (st: State, c: Chat): PersonId => c.members!.find((p) => p !== st.viewer)!;
export const mirrorChatId = (v: ViewerId) => `mirror-${v}`;
/** The mirror's name once claimed; "Your mirror" until then. */
export const mirrorName = (st: State, v: ViewerId = st.viewer) => st.mirror[v] ?? COPY.yourMirror;
/** The name the claim field is prefilled with, and the one Clarify claims under: "{FirstName}'s mirror". */
export const defaultMirrorName = (v: ViewerId) => `${PEOPLE[v].name.split(' ')[0]}'s mirror`;
/**
 * v16 (decisions.md 2026-10-12): the mirror's role is shown wherever its name is: "<Name> · <First>'s mirror".
 * When the name IS the default there is nothing to add, and an unclaimed mirror is still "Your mirror".
 */
export const mirrorLabel = (st: State, v: ViewerId = st.viewer): string => {
  const name = st.mirror[v];
  const role = defaultMirrorName(v);
  return !name ? COPY.yourMirror : name === role ? role : `${name} · ${role}`;
};
export const chatTitle = (st: State, c: Chat): string =>
  (c.kind === 'mirror' ? mirrorLabel(st, c.owner) : c.kind === 'dm' ? PEOPLE[otherOf(st, c)].name : (eventOf(c) ? eventName(st, eventOf(c)!) : COPY.general));
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
  /* v15 #10: my mirror is pinned first whatever its last message. */
  const pin = (c: Chat) => (c.kind === 'mirror' ? 1 : 0);
  return st.chats.filter((c) => sees(st, st.viewer, c)).sort((a, b) => pin(b) - pin(a) || order(b) - order(a));
}

export function chatsInTab(st: State, tab: Tab): Chat[] {
  const live = visibleChats(st).filter((c) => !isArchived(st, c.id));
  if (tab === 'all') return live;
  if (tab === 'unread') return live.filter((c) => unreadOf(st, c.id) > 0);
  /* The mirror is pinned in All only. */
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

/** A members-only channel (a group's # general): the list marks it with a lock. Event channels also admit attendees. */
export const membersOnly = (c: Chat) => c.kind === 'channel' && !c.eventId;

/** Every unread message in my live (not archived) chats: the sidebar's Chats badge. */
export const totalUnread = (st: State) => chatsInTab(st, 'all').reduce((n, c) => n + unreadOf(st, c.id), 0);

/** WhatsApp: the Archived row shows how many archived chats have unread messages (not the number archived). */
export const archivedUnreadCount = (st: State) => archivedChats(st).filter((c) => unreadOf(st, c.id) > 0).length;

/** Four fixed folders: All, Unread, Partners (always, so it can invite), Groups (once I see any channel). */
export function tabsFor(st: State): { id: Tab; label: string; unread: number }[] {
  const sum = (cs: Chat[]) => cs.reduce((n, c) => n + unreadOf(st, c.id), 0);
  const hasGroups = visibleChats(st).some((c) => c.kind === 'channel');
  return [
    { id: 'all', label: 'All chats', unread: sum(chatsInTab(st, 'all')) },
    { id: 'unread', label: 'Unread', unread: sum(chatsInTab(st, 'unread')) },
    { id: 'partners', label: 'Partners', unread: sum(chatsInTab(st, 'partners')) },
    ...(hasGroups ? [{ id: 'groups' as Tab, label: 'Channels', unread: sum(chatsInTab(st, 'groups')) }] : []),
  ];
}

/**
 * Search: chat names, and people I share a group or event with by name or slug; by email only on an exact
 * full match. Nobody I share nothing with is ever returned. Message text is not searched.
 */
export function search(st: State, q: string): { chats: Chat[]; people: PersonId[]; others: PersonId[] } {
  const s = q.trim().toLowerCase();
  if (!s) return { chats: [], people: [], others: [] };
  const chats = visibleChats(st).filter((c) => chatTitle(st, c).toLowerCase().includes(s) || (c.kind === 'channel' && groupOf(c)?.name.toLowerCase().includes(s)));
  const match = (id: PersonId) => {
    const p = PEOPLE[id];
    return p.name.toLowerCase().includes(s) || p.slug.toLowerCase().includes(s) || p.email.toLowerCase() === s;
  };
  const all = (Object.keys(PEOPLE) as PersonId[]).filter((id) => id !== st.viewer && match(id));
  /* v14 #11: everyone matching comes back; `others` are people I share nothing with (their "No chat yet" state cannot send). */
  return { chats, people: all.filter((id) => canMessage(st.viewer, id)), others: all.filter((id) => !canMessage(st.viewer, id)) };
}

/**
 * The 📎 dialog's search over MY real points and stories (real-data.ts loads them). Words match the title; `#tag` words
 * must all match (multi-tag is AND). `kind` narrows to points or stories.
 */
export function filterShareables(items: Shareable[], q: string, kind: 'all' | 'point' | 'story' = 'all'): Shareable[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const tags = words.filter((w) => w.startsWith('#')).map((w) => w.slice(1)).filter(Boolean);
  const text = words.filter((w) => !w.startsWith('#'));
  return items.filter((x) => (kind === 'all' || x.kind === kind)
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
    if (v !== msg.who && !msg.agent) unread[v] = { ...unread[v], [msg.chatId]: (unread[v][msg.chatId] ?? 0) + 1 };
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

/** Comment under a post in any chat I can see (v14: a 1:1 has threads too). People only, no agent. */
export function comment(st: State, postId: string, text: string, extra: Partial<Msg> = {}): State {
  const post = st.msgs.find((x) => x.id === postId);
  if (!post || post.failed || !readable(st, postId)) return st; // no thread under a post that never left
  const [id, seq] = nextId(st, 'c');
  const c = m(id, post.chatId, st.viewer, text, NOW, { ...extra, failed: st.failSends || undefined });
  const next = { ...st, seq, comments: { ...st.comments, [postId]: [...(st.comments[postId] ?? []), c] } };
  /* A thread reply reaches the channel's other readers like a post does (unread, out of the archive); a failed one waits for Retry. */
  return c.failed ? next : fanOut(next, c);
}

/**
 * v16: the replies of a post, copied under a new post in another chat (a forward or a Clarify of a post with a thread
 * arrives as ONE card that opens the full thread, so the copy keeps every reply, its author and its time).
 */
function copyThread(st: State, srcId: string, toMsgId: string, toChatId: string, seq: number): { comments: State['comments']; seq: number; count: number } {
  const replies = repliesOf(st, srcId).filter((r) => !r.failed);
  if (replies.length === 0) return { comments: st.comments, seq, count: 0 };
  let n = seq;
  const copies = replies.map((r): Msg => ({ ...r, id: `c${n++}`, chatId: toChatId }));
  return { comments: { ...st.comments, [toMsgId]: copies }, seq: n, count: copies.length };
}

/** Forward a message I can read into a chat I see, with an optional note sent after it; the copy names the original author. */
export function forward(st: State, msgId: string, toChatId: string, note = ''): State {
  const src = readable(st, msgId);
  const to = chatById(st, toChatId);
  if (!src || !to || !sees(st, st.viewer, to)) return st;
  const [id, seq0] = nextId(st, 'm');
  const thread = copyThread(st, src.id, id, toChatId, seq0);
  const copy = m(id, toChatId, st.viewer, src.text, NOW, { fwdFrom: src.fwdFrom ?? src.who, share: src.share, voice: src.voice, threadCard: thread.count > 0 || undefined, failed: st.failSends || undefined });
  const base = { ...st, seq: thread.seq, comments: thread.comments };
  /* A forward is a send: under `?state=fail` it fails like one and reaches nobody until Retry. */
  const after = copy.failed ? { ...base, msgs: [...st.msgs, copy] } : deliver(base, copy);
  return note.trim() ? send(after, toChatId, note.trim()) : after;
}

/** Edit my own message or thread reply in place; it is marked edited. Empty text is not an edit. */
export function editMsg(st: State, msgId: string, text: string): State {
  const t = text.trim();
  const own = (x: Msg) => x.id === msgId && x.who === st.viewer && !x.failed;
  const target = st.msgs.find(own) ?? Object.values(st.comments).flat().find(own);
  if (!target || !t || t === target.text) return st;
  const fix = (x: Msg) => (own(x) ? { ...x, text: t, edited: true } : x);
  return { ...st, msgs: st.msgs.map(fix), comments: Object.fromEntries(Object.entries(st.comments).map(([k, v]) => [k, v.map(fix)])) };
}

/** Delete my own message (with its thread) or thread reply. Anyone else's is untouchable. */
export function deleteMsg(st: State, msgId: string): State {
  const own = (x: Msg) => x.id === msgId && x.who === st.viewer;
  if (!st.msgs.some(own) && !Object.values(st.comments).flat().some(own)) return st;
  const comments = Object.fromEntries(Object.entries(st.comments).filter(([k]) => k !== msgId).map(([k, v]) => [k, v.filter((x) => !own(x))]));
  return { ...st, msgs: st.msgs.filter((x) => !own(x)), comments };
}

export const archive = (st: State, chatId: string): State =>
  isArchived(st, chatId) ? st : { ...st, archived: { ...st.archived, [st.viewer]: [...st.archived[st.viewer], chatId] } };
export const unarchive = (st: State, chatId: string): State => ({ ...st, archived: { ...st.archived, [st.viewer]: st.archived[st.viewer].filter((id) => id !== chatId) } });

/**
 * Leave a group (a local overlay, no membership write): its `# general` and event channels leave my list. Only a member
 * can leave. `member` defaults to the chat mock's roster; the Groups screens pass the real membership.
 */
export const leaveGroup = (st: State, groupId: string, member: boolean = !!GROUPS.find((g) => g.id === groupId)?.members.includes(st.viewer)): State =>
  !member || st.left[st.viewer].includes(groupId)
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

/* ---------- v15: the mirror agent (#10) ---------- */

/** Claim my mirror by naming it: my answer posts, then the mirror says its new name. Claiming twice is a no-op. */
export function claimMirror(st: State, name: string): State {
  const n = name.trim();
  if (!n || st.mirror[st.viewer]) return st;
  const chatId = mirrorChatId(st.viewer);
  const said = send({ ...st, failSends: false }, chatId, n);
  const [id, seq] = nextId(said, 'a');
  const reply = m(id, chatId, st.viewer, `${n} it is. Send me any message with Clarify and I’ll help you get it across.`, NOW, { agent: true });
  return { ...said, failSends: st.failSends, seq, msgs: [...said.msgs, reply], mirror: { ...st.mirror, [st.viewer]: n } };
}

/**
 * Clarify (v15 #10): forward a message I can read into my mirror chat as a quote; the mirror answers with a canned
 * placeholder. No point is created anywhere.
 */
export function clarify(st: State, msgId: string): State {
  const src = readable(st, msgId);
  if (!src) return st;
  const chatId = mirrorChatId(st.viewer);
  /* v15 review #6: Clarify on an unclaimed mirror never blocks: it claims the mirror under the default name. */
  const named: State = st.mirror[st.viewer] ? st : { ...st, mirror: { ...st.mirror, [st.viewer]: defaultMirrorName(st.viewer) } };
  const [id, seq0] = nextId(named, 'm');
  /* v16: a post with a thread goes to the mirror as one card too. */
  const thread = copyThread(named, src.id, id, chatId, seq0);
  /* v16: the forwarded card links to its source (`from`); a message already in the mirror has no other chat to link to. */
  const from = src.chatId === chatId ? undefined : src.chatId;
  const quoted = m(id, chatId, st.viewer, '', NOW, { quote: { who: src.fwdFrom ?? src.who, text: summary(src) }, share: src.share, from, threadCard: thread.count > 0 || undefined });
  const [rid, seq2] = nextId({ ...named, seq: thread.seq }, 'a');
  const reply = m(rid, chatId, st.viewer, COPY.mirrorReply, NOW, { agent: true });
  return { ...named, seq: seq2, comments: thread.comments, msgs: [...named.msgs, quoted, reply] };
}

/** v16 (Mirror ⋯ → Rename): give my mirror a new name, claimed or not. An empty name is not a rename. */
export function renameMirror(st: State, name: string): State {
  const n = name.trim();
  return !n || n === st.mirror[st.viewer] ? st : { ...st, mirror: { ...st.mirror, [st.viewer]: n } };
}

/**
 * v16 (message menu → Mark as unread): the chat shows unread again, counting the messages from this one on that
 * are not mine (at least one). It never lowers a count already there.
 */
export function markUnread(st: State, msgId: string): State {
  const x = readable(st, msgId);
  if (!x) return st;
  const inChat = msgsOf(st, x.chatId);
  const at = inChat.findIndex((y) => y.id === x.id);
  const fromHere = at < 0 ? 1 : inChat.slice(at).filter((y) => y.who !== st.viewer).length;
  const n = Math.max(1, fromHere, unreadOf(st, x.chatId));
  return { ...st, unread: { ...st.unread, [st.viewer]: { ...st.unread[st.viewer], [x.chatId]: n } } };
}

/* ---------- v15: groups, events, partners, positions ---------- */

/**
 * Join a group (the Join page's "Accept terms & join"; a local overlay, no membership write). A member already: no-op.
 * `already` defaults to the chat mock's roster; the Groups screens pass the real membership.
 */
export const joinGroup = (st: State, groupId: string, already: boolean = isMember(st, st.viewer, groupId)): State =>
  already
    ? st
    : { ...st, joined: { ...st.joined, [st.viewer]: [...st.joined[st.viewer], groupId] }, left: { ...st.left, [st.viewer]: st.left[st.viewer].filter((g) => g !== groupId) } };

/** Going: on the event's list, or reserved here. */
const seeded = (eventId: string, v: PersonId) => !!EVENTS.find((e) => e.id === eventId)?.attendees.includes(v);
/** Where a seat starts: the viewer's real RSVP when the events service has told us, else the chat mock's roster. */
const baseGoing = (st: State, eventId: string, v: PersonId) => (v === st.viewer && eventId in st.realGoing ? st.realGoing[eventId]! : seeded(eventId, v));
/** Going: the starting seat (and not cancelled here), or reserved here. */
export const isGoing = (st: State, eventId: string, v: ViewerId = st.viewer) =>
  (baseGoing(st, eventId, v) && !st.cancelled[v].includes(eventId)) || st.rsvps[v].includes(eventId);
/** Reserve a seat, or Cancel RSVP. A seeded attendee cancels too (v15 review #2), and can reserve again. */
export const toggleRsvp = (st: State, eventId: string): State => {
  const v = st.viewer;
  if (!EVENTS.some((e) => e.id === eventId)) return st;
  const drop = (xs: string[]) => xs.filter((x) => x !== eventId);
  if (baseGoing(st, eventId, v)) {
    const c = st.cancelled[v];
    return { ...st, cancelled: { ...st.cancelled, [v]: c.includes(eventId) ? drop(c) : [...c, eventId] } };
  }
  const mine = st.rsvps[v];
  return { ...st, rsvps: { ...st.rsvps, [v]: mine.includes(eventId) ? drop(mine) : [...mine, eventId] } };
};
export const attendeesOf = (st: State, eventId: string): PersonId[] => {
  const e = EVENTS.find((x) => x.id === eventId);
  if (!e) return [];
  const viewers = ['bob', 'dana'] as ViewerId[];
  const out = e.attendees.filter((p) => !viewers.includes(p as ViewerId) || isGoing(st, eventId, p as ViewerId));
  return [...new Set([...out, ...viewers.filter((v) => st.rsvps[v].includes(eventId))])];
};
export const eventsOfGroup = (groupId: string) => EVENTS.filter((e) => e.groupId === groupId);
/** The group an event belongs to: ALWAYS its own (production's `/events` fallback lands every event on cm). */
export const groupOfEvent = (eventId: string) => EVENTS.find((e) => e.id === eventId)?.groupId;

/**
 * The partner state (v16): Invite partner -> Invite sent -> Partner. An accepted agreement the chat mock knows about wins;
 * then what the agreements service reported (pending -> sent, active -> partner); then an invite sent this visit that
 * the service has not echoed back yet.
 */
export function partnerState(st: State, other: PersonId): 'none' | 'pending' | 'partner' {
  if (st.accepted.some(([x, y]) => (x === st.viewer && y === other) || (x === other && y === st.viewer))) return 'partner';
  const real = st.noPartners ? undefined : st.realPartners[other];
  if (real) return real;
  return st.invites[st.viewer].includes(other) ? 'pending' : 'none';
}
export const invitePartner = (st: State, other: PersonId): State =>
  partnerState(st, other) !== 'none' || other === st.viewer ? st : { ...st, invites: { ...st.invites, [st.viewer]: [...st.invites[st.viewer], other] } };
/** The partner accepts (a prototype control): the invite becomes an agreement. */
export const acceptInvite = (st: State, other: PersonId): State =>
  !st.invites[st.viewer].includes(other)
    ? st
    : { ...st, invites: { ...st.invites, [st.viewer]: st.invites[st.viewer].filter((p) => p !== other) }, accepted: [...st.accepted, [st.viewer, other]], noPartners: false };

/** My position on a point: the local overlay if I took or cleared one here, else the real position the service returned. */
export const positionOf = (st: State, pointId: string, real: PositionType | null = null): PositionType | null =>
  pointId in st.positions[st.viewer] ? st.positions[st.viewer][pointId]! : real;
/** Take a position, or the same one again to clear it (production's toggle). `real` is the position the point arrived with. */
export function setPosition(st: State, pointId: string, position: PositionType | null, real: PositionType | null = null): State {
  const mine = { ...st.positions[st.viewer] };
  const current = positionOf(st, pointId, real);
  mine[pointId] = position === null || current === position ? null : position;
  return { ...st, positions: { ...st.positions, [st.viewer]: mine } };
}

/* ---------- v16: groups by latest activity ---------- */

/** Where a group's newest message sits in the shared message order (-1 = nothing yet): higher is more recent. */
export function groupActivity(st: State, groupId: string | null): number {
  if (!groupId) return -1;
  const ids = new Set(st.chats.filter((c) => c.kind === 'channel' && c.groupId === groupId).map((c) => c.id));
  let last = -1;
  st.msgs.filter((x) => shownTo(st, x)).forEach((x, i) => { if (ids.has(x.chatId)) last = i; });
  return last;
}
