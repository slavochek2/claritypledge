/**
 * @file mock-data.ts
 * @description P1509 v14 mock world. Three groups (each with # general; one with no event yet), three events (each with its closed channel), six people and
 * one stranger. Bob is a member of all three groups and attended every event; Dana and Fay attended only the next
 * Chiang Mai event and is a member of nothing. Sam shares nothing with anyone and appears only as the
 * "Forwarded from" author of one message. Mock only: nothing here is read from or written to a server.
 */

export type PersonId = 'bob' | 'dana' | 'alice' | 'carol' | 'eli' | 'fay' | 'sam';
export type ViewerId = 'bob' | 'dana';

export interface Person {
  id: PersonId;
  name: string;
  /** Production has a URL slug, not a display handle: search matches it, nothing shows it as @name. */
  slug: string;
  email: string;
  bio: string;
  /** The production avatar's colour and pledge ring. */
  avatarColor: string;
  pledger: boolean;
  role: string;
}

export const PEOPLE: Record<PersonId, Person> = {
  bob: { id: 'bob', name: 'Bob Keller', slug: 'bobk', email: 'bob@example.com', bio: 'Runs the Chiang Mai circle.', avatarColor: '#2563eb', pledger: true, role: 'Organizer' },
  dana: { id: 'dana', name: 'Dana Ortiz', slug: 'dana', email: 'dana@example.com', bio: 'Came to her first Clarity Night.', avatarColor: '#0891b2', pledger: false, role: 'Engineer' },
  alice: { id: 'alice', name: 'Alice Moreau', slug: 'alicem', email: 'alice@example.com', bio: 'Facilitator.', avatarColor: '#1d4ed8', pledger: true, role: 'Facilitator' },
  carol: { id: 'carol', name: 'Carol Singh', slug: 'carols', email: 'carol@example.com', bio: 'Product designer.', avatarColor: '#0d9488', pledger: true, role: 'Product designer' },
  eli: { id: 'eli', name: 'Eli Brandt', slug: 'eli', email: 'eli@example.com', bio: 'Founder, Berlin.', avatarColor: '#475569', pledger: false, role: 'Founder' },
  /* Attends tonight and has no 1:1 with anyone yet: "Message" on her profile starts a new chat. */
  fay: { id: 'fay', name: 'Fay Okafor', slug: 'fayo', email: 'fay@example.com', bio: 'Coming to her second Clarity Night.', avatarColor: '#0e7490', pledger: false, role: 'Teacher' },
  sam: { id: 'sam', name: 'Sam Rivera', slug: 'samr', email: 'sam@example.com', bio: 'Writes about negotiation.', avatarColor: '#64748b', pledger: false, role: 'Writer' },
};

/** Clarity partners (an agreement exists): the Partners folder, and a 1:1 header with no "Invite as partner". */
export const PARTNERS: [PersonId, PersonId][] = [['bob', 'alice']];
export const arePartners = (a: PersonId, b: PersonId) => PARTNERS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

export interface Group { id: string; name: string; members: PersonId[] }
export interface EventInfo { id: string; groupId: string; name: string; when: string; attendees: PersonId[]; today?: boolean; live?: boolean }

export const GROUPS: Group[] = [
  { id: 'cm', name: 'Chiang Mai Clarity', members: ['bob', 'alice', 'carol'] },
  { id: 'fc', name: 'Founders Circle', members: ['bob', 'eli'] },
  /* A group with no event yet: only its # general. */
  { id: 'bc', name: 'Berlin Clarity', members: ['bob', 'eli'] },
];

export const EVENTS: EventInfo[] = [
  { id: 'night-oct16', groupId: 'cm', name: 'Clarity Night, Oct 16', when: 'Today, 19:00', attendees: ['bob', 'alice', 'dana', 'fay'], today: true, live: true },
  { id: 'night-oct02', groupId: 'cm', name: 'Clarity Night, Oct 2', when: 'Oct 2', attendees: ['bob', 'alice', 'carol'] },
  { id: 'fc-sept', groupId: 'fc', name: 'Founders dinner, Sept', when: 'Sept 28', attendees: ['bob', 'eli'] },
];

/** My existing points and stories, as the channel picker offers them (posted as a plain link card). */
export interface Shareable { id: string; kind: 'point' | 'story'; title: string; tags: string[]; author: PersonId; excerpt?: string; /** A story's linked points (production's story card shows them). */ points?: string[] }
/** Points and stories the 📎 dialog searches: mine and ones from people I share a group or event with. */
export const SHAREABLE: Shareable[] = [
  { id: 'pt-bob-1', kind: 'point', title: 'Disagreement is information, not a threat', tags: ['conflict', 'work'], author: 'bob' },
  { id: 'st-bob-1', kind: 'story', title: 'The hike where we got lost on purpose', tags: ['trust', 'outdoors'], author: 'bob', points: ['pt-bob-1'], excerpt: 'We left the map in the car and agreed to say out loud every guess we made about the trail.' },
  { id: 'pt-dana-1', kind: 'point', title: 'Repeat back before you reply', tags: ['listening', 'work'], author: 'dana' },
  { id: 'st-dana-1', kind: 'story', title: 'How I misread my sister for ten years', tags: ['family', 'listening'], author: 'dana', points: ['pt-dana-1'], excerpt: 'I heard "you never call" as blame. She meant "I miss you".' },
  { id: 'pt-alice-1', kind: 'point', title: 'Most arguments are about definitions, not facts', tags: ['conflict', 'definitions'], author: 'alice' },
  { id: 'st-carol-1', kind: 'story', title: 'The design review that went silent', tags: ['work', 'feedback'], author: 'carol', points: ['pt-alice-1'], excerpt: 'Nobody disagreed out loud, and three weeks later everyone had built something different.' },
];


export const COPY = {
  chats: 'Chats',
  all: 'All chats',
  partners: 'Partners',
  groups: 'Groups',
  general: 'general',
  agreement: 'Agreement',
  channels: 'Channels',
  groupInfo: 'Group info',
  noPartners: 'No partners yet. A partner is someone you agree to practise clarity with.',
  transcribing: 'Transcribing · live',
  transcribed: 'transcribed',
  unread: 'Unread',
  archived: 'Archived chats',
  invite: 'Invite partner',
  inviteAsPartner: 'Invite as partner',
  partner: 'Partner',
  replies: (n: number) => `${n} ${n === 1 ? 'reply' : 'replies'}`,
  replyInThread: 'Reply in thread',
  message: 'Message',
  search: 'Search chats and people',
  newChat: (first: string, shared: string) => `No messages yet. Say hello to ${first}. You both ${shared}.`,
  emptyList: 'No chats yet',
  emptySearch: 'No one you share a group or event with matches.',
  notSent: 'Not sent',
  retry: 'Retry',
  forwardedFrom: 'Forwarded from',
  selectChat: 'Select a chat to start messaging',
} as const;

/** Letters (stand-in for /letters): each opens a letter view with "Open chat with <author>". */
export interface Letter { id: string; author: PersonId; title: string; date: string; body: string }
export const LETTERS: Letter[] = [
  { id: 'l-alice', author: 'alice', title: 'What I learned facilitating ten nights', date: 'Oct 12', body: 'The best moment of every night is when someone says “yes, exactly” and you can see they mean it. I want more of those, and fewer rounds where people wait for their turn to talk.' },
  { id: 'l-carol', author: 'carol', title: 'Design reviews without silence', date: 'Oct 5', body: 'Silence in a review is not agreement. Since we started repeating back the critique before answering it, our reviews got shorter and the work got better.' },
  { id: 'l-eli', author: 'eli', title: 'Why Berlin', date: 'Sept 30', body: 'Founders here argue a lot and listen little. A monthly circle where the rule is to state the other view first seemed worth trying.' },
];

/** The sidebar's places (v14 #1); Tools lists production's Tools menu entries (event-links.ts STANDARD_TOOL_ENTRIES). */
export const PLACES = ['home', 'chats', 'groups', 'letters'] as const;
export type Place = (typeof PLACES)[number];
export const PLACE_LABEL: Record<Place, string> = { home: 'Home', chats: 'Chats', groups: 'Groups', letters: 'Letters' };
export const SIDEBAR_KEY = 'p1509-v14-sidebar-collapsed';
export const AGREEMENT_PATH = '/agreements';
