/**
 * @file mock-data.ts
 * @description P1509 v12 mock world. Three groups (one with no event yet), three events (each with its one channel), five people and
 * one stranger. Bob is a member of both groups and attended every event; Dana attended only the next
 * Chiang Mai event and is a member of nothing. Sam shares nothing with anyone and appears only as the
 * "Forwarded from" author of one message. Mock only: nothing here is read from or written to a server.
 */

export type PersonId = 'bob' | 'dana' | 'alice' | 'carol' | 'eli' | 'sam';
export type ViewerId = 'bob' | 'dana';

export interface Person {
  id: PersonId;
  name: string;
  nickname: string;
  email: string;
  bio: string;
}

export const PEOPLE: Record<PersonId, Person> = {
  bob: { id: 'bob', name: 'Bob Keller', nickname: 'bobk', email: 'bob@example.com', bio: 'Runs the Chiang Mai circle.' },
  dana: { id: 'dana', name: 'Dana Ortiz', nickname: 'dana', email: 'dana@example.com', bio: 'Came to her first Clarity Night.' },
  alice: { id: 'alice', name: 'Alice Moreau', nickname: 'alicem', email: 'alice@example.com', bio: 'Facilitator.' },
  carol: { id: 'carol', name: 'Carol Singh', nickname: 'carols', email: 'carol@example.com', bio: 'Product designer.' },
  eli: { id: 'eli', name: 'Eli Brandt', nickname: 'eli', email: 'eli@example.com', bio: 'Founder, Berlin.' },
  sam: { id: 'sam', name: 'Sam Rivera', nickname: 'samr', email: 'sam@example.com', bio: 'Writes about negotiation.' },
};

export interface Group { id: string; name: string; members: PersonId[] }
export interface EventInfo { id: string; groupId: string; name: string; when: string; attendees: PersonId[]; today?: boolean }

export const GROUPS: Group[] = [
  { id: 'cm', name: 'Chiang Mai Clarity', members: ['bob', 'alice', 'carol'] },
  { id: 'fc', name: 'Founders Circle', members: ['bob', 'eli'] },
  /* A group with no event channel yet: its tab shows the empty state. */
  { id: 'bc', name: 'Berlin Clarity', members: ['bob', 'eli'] },
];

export const EVENTS: EventInfo[] = [
  { id: 'night-oct16', groupId: 'cm', name: 'Clarity Night, Oct 16', when: 'Today, 19:00', attendees: ['bob', 'alice', 'dana'], today: true },
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
  all: 'All',
  unread: 'Unread',
  archived: 'Archived chats',
  invite: 'Invite partner',
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
 * The side menu: the real app pages it would open (the prototype opens each in a new tab, so the click-through
 * keeps its state). Partners is production's /p/<slug>/partners; /me redirects to the signed-in profile. Tools
 * is production's links menu, which needs the app's nav context, so the prototype names it instead of mounting it.
 */
export const MENU_PAGES: { label: string; path: string | null }[] = [
  { label: 'Feed', path: '/feed' },
  { label: 'Letters', path: '/letters' },
  { label: 'Partners', path: '/me' },
  { label: 'Groups', path: '/groups' },
  { label: 'Tools', path: null },
];
