/**
 * @file mock-data.ts
 * @description P1509 v12 mock world. Three groups (one with no event yet), three events (each with its one channel), six people and
 * one stranger. Bob is a member of all three groups and attended every event; Dana and Fay attended only the next
 * Chiang Mai event and is a member of nothing. Sam shares nothing with anyone and appears only as the
 * "Forwarded from" author of one message. Mock only: nothing here is read from or written to a server.
 */

export type PersonId = 'bob' | 'dana' | 'alice' | 'carol' | 'eli' | 'fay' | 'sam';
export type ViewerId = 'bob' | 'dana';

export interface Person {
  id: PersonId;
  name: string;
  nickname: string;
  email: string;
  bio: string;
  /** The production avatar's colour and pledge ring. */
  avatarColor: string;
  pledger: boolean;
  role: string;
}

export const PEOPLE: Record<PersonId, Person> = {
  bob: { id: 'bob', name: 'Bob Keller', nickname: 'bobk', email: 'bob@example.com', bio: 'Runs the Chiang Mai circle.', avatarColor: '#2563eb', pledger: true, role: 'Organizer' },
  dana: { id: 'dana', name: 'Dana Ortiz', nickname: 'dana', email: 'dana@example.com', bio: 'Came to her first Clarity Night.', avatarColor: '#0891b2', pledger: false, role: 'Engineer' },
  alice: { id: 'alice', name: 'Alice Moreau', nickname: 'alicem', email: 'alice@example.com', bio: 'Facilitator.', avatarColor: '#1d4ed8', pledger: true, role: 'Facilitator' },
  carol: { id: 'carol', name: 'Carol Singh', nickname: 'carols', email: 'carol@example.com', bio: 'Product designer.', avatarColor: '#0d9488', pledger: true, role: 'Product designer' },
  eli: { id: 'eli', name: 'Eli Brandt', nickname: 'eli', email: 'eli@example.com', bio: 'Founder, Berlin.', avatarColor: '#475569', pledger: false, role: 'Founder' },
  /* Attends tonight and has no 1:1 with anyone yet: "Message" on her profile starts a new chat. */
  fay: { id: 'fay', name: 'Fay Okafor', nickname: 'fayo', email: 'fay@example.com', bio: 'Coming to her second Clarity Night.', avatarColor: '#0e7490', pledger: false, role: 'Teacher' },
  sam: { id: 'sam', name: 'Sam Rivera', nickname: 'samr', email: 'sam@example.com', bio: 'Writes about negotiation.', avatarColor: '#64748b', pledger: false, role: 'Writer' },
};

/** Clarity partners (an agreement exists): the Partners folder, and a 1:1 header with no "Invite as partner". */
export const PARTNERS: [PersonId, PersonId][] = [['bob', 'alice']];
export const arePartners = (a: PersonId, b: PersonId) => PARTNERS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

export interface Group { id: string; name: string; members: PersonId[] }
export interface EventInfo { id: string; groupId: string; name: string; when: string; attendees: PersonId[]; today?: boolean }

export const GROUPS: Group[] = [
  { id: 'cm', name: 'Chiang Mai Clarity', members: ['bob', 'alice', 'carol'] },
  { id: 'fc', name: 'Founders Circle', members: ['bob', 'eli'] },
  /* A group with no event channel yet: its tab shows the empty state. */
  { id: 'bc', name: 'Berlin Clarity', members: ['bob', 'eli'] },
];

export const EVENTS: EventInfo[] = [
  { id: 'night-oct16', groupId: 'cm', name: 'Clarity Night, Oct 16', when: 'Today, 19:00', attendees: ['bob', 'alice', 'dana', 'fay'], today: true },
  { id: 'night-oct02', groupId: 'cm', name: 'Clarity Night, Oct 2', when: 'Oct 2', attendees: ['bob', 'alice', 'carol'] },
  { id: 'fc-sept', groupId: 'fc', name: 'Founders dinner, Sept', when: 'Sept 28', attendees: ['bob', 'eli'] },
];

/** My existing points and stories, as the channel picker offers them (posted as a plain link card). */
export interface Shareable { id: string; kind: 'point' | 'story'; title: string }
export const SHAREABLE: Record<ViewerId, Shareable[]> = {
  bob: [
    { id: 'pt-bob-1', kind: 'point', title: 'Disagreement is information, not a threat' },
    { id: 'st-bob-1', kind: 'story', title: 'The hike where we got lost on purpose' },
  ],
  dana: [
    { id: 'pt-dana-1', kind: 'point', title: 'Repeat back before you reply' },
    { id: 'st-dana-1', kind: 'story', title: 'How I misread my sister for ten years' },
  ],
};

export const TRANSCRIPT_TEXT = [
  'Alice: Welcome everyone. Tonight we pair up and try to state the other person\'s view so well they say "yes, exactly".',
  'Bob: I\'ll start. My claim is that most arguments at work are about definitions, not facts.',
  'Dana: Can I repeat it back? You are saying people agree on what happened but use the same word for different things.',
  'Bob: Close. More that they never check which meaning the other person holds.',
  'Alice: Good. Dana, rate how sure you are that you got it, then Bob rates how well you got it.',
  'Dana: I\'d say seven out of ten.',
  'Bob: Eight. The part about never checking is what I meant.',
  '(transcript continues, 41 more lines)',
].join('\n');

export const COPY = {
  chats: 'Chats',
  all: 'All chats',
  partners: 'Partners',
  unread: 'Unread',
  archived: 'Archived chats',
  invite: 'Invite partner',
  inviteAsPartner: 'Invite as partner',
  partner: 'Partner',
  replies: (n: number) => `${n} ${n === 1 ? 'reply' : 'replies'}`,
  replyInThread: 'Reply in thread',
  message: 'Message',
  search: 'Search chats and people',
  transcript: 'Transcript posted',
  emptyList: 'No chats yet',
  emptySearch: 'No one you share a group or event with matches.',
  emptyGroup: 'No event channel in this group yet.',
  notSent: 'Not sent',
  retry: 'Retry',
  forwardedFrom: 'Forwarded from',
  selectChat: 'Select a chat to start messaging',
} as const;

/**
 * The side menu: the real app pages, with the bottom nav's own labels and icons (bottom-nav.tsx), each opened in
 * a new tab so the click-through keeps its state. Tools is production's links menu, which needs the app's nav
 * context, so the prototype names it instead of mounting it.
 */
export const MENU_PAGES: { id: 'home' | 'letters' | 'partners' | 'groups' | 'tools'; label: string; path: string | null }[] = [
  { id: 'home', label: 'Home', path: '/feed' },
  { id: 'letters', label: 'Letters', path: '/letters' },
  { id: 'partners', label: 'Partners', path: '/me' }, // production's Partners tab is /p/<my-slug>/partners; /me resolves the slug
  { id: 'groups', label: 'Groups', path: '/groups' },
  { id: 'tools', label: 'Tools', path: null },
];
