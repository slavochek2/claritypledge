/**
 * @file mock-data.ts
 * @description P1509 v15 mock world. v15 #2: the two REAL groups replace v14's invented ones. Their slugs, names,
 * blurbs and the opening paragraph of each About are copied from the migrations that seed them
 * (`20260907120000_cm_activist_group_copy.sql` for cm, `20260828164500_p1060_events_org_id.sql` +
 * `20260907180000_online_group_fuller_about.sql` for online). The people, events, letters and points are mock.
 * Bob is a member of the Chiang Mai group and an admin; he attended one Online event but has not joined Online, so
 * Online is "a group you haven't joined" (its Join page). Dana is a member of nothing and attends tonight. Sam shares
 * nothing with anyone. Mock only: nothing here is read from or written to a server.
 */
import type { PositionType } from '@/app/types';

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

/** v15 #1: the profile menu's Admin group shows only for an admin viewer. */
export const ADMINS: ViewerId[] = ['bob'];

/** Clarity partners (an agreement exists): the Partners folder, and a 1:1 header with no "Invite as partner". */
export const PARTNERS: [PersonId, PersonId][] = [['bob', 'alice']];
export const arePartners = (a: PersonId, b: PersonId) => PARTNERS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/** A group: production's `Organization` fields (organizations-service.interface.ts) plus the mock roster. */
export interface Group { id: string; slug: string; name: string; blurb: string | null; description: string; hasEvents: boolean; members: PersonId[]; organizers: PersonId[] }
export interface EventInfo {
  id: string; groupId: string; name: string; when: string; attendees: PersonId[]; host: PersonId; location: string;
  description: string; today?: boolean; live?: boolean; past?: boolean;
}

export const GROUPS: Group[] = [
  {
    id: 'cm', slug: 'cm', name: 'Communication Activism Community · Chiang Mai', hasEvents: true,
    blurb: 'We reveal gaps in cognitive understanding instead of pretending, and carry the habit out of the room.',
    /* The first paragraph of the seeded About (migration 20260907120000); the rest lives in the database. */
    description: 'Ask a colleague what they understood from your words and it reads as disrespect. Admit you did not fully understand them and they might think you are stupid. So people pretend they understood, and the gap in cognitive understanding stays hidden. Many groups run on that damaging social norm: revealing a cognitive understanding gap is punished. Five common barriers keep it in place: ego, fear, laziness, plausible deniability and ignorance. The first four are hard to shift. Ignorance is not. It can be filled.',
    members: ['bob', 'alice', 'carol'], organizers: ['bob'],
  },
  {
    id: 'online', slug: 'online', name: 'Clarity Practice Community · Online', hasEvents: true,
    blurb: 'Practise revealing and bridging gaps in cognitive understanding with people across different interests, opinions, values and industries.',
    /* The first paragraph of the seeded About (migration 20260907180000). */
    description: 'This community is for people who get curious rather than defensive when they spot a gap in their own cognitive understanding. If "how well do you think you understood me?" strikes you as an interesting question, this is for you.',
    members: ['eli', 'carol'], organizers: ['eli'],
  },
];

export const EVENTS: EventInfo[] = [
  { id: 'night-oct16', groupId: 'cm', name: 'Clarity Night, Oct 16', when: 'Today, 19:00', host: 'alice', location: 'Chiang Mai', attendees: ['bob', 'alice', 'dana', 'fay'], today: true, live: true,
    description: 'We pair up and try to state the other person’s view so well they say “yes, exactly”.' },
  { id: 'night-oct02', groupId: 'cm', name: 'Clarity Night, Oct 2', when: 'Oct 2', host: 'bob', location: 'Chiang Mai', attendees: ['bob', 'alice', 'carol'], past: true,
    description: 'Rounds of explain-back on a disagreement each of us brought.' },
  { id: 'online-sept', groupId: 'online', name: 'Online practice, Sept 28', when: 'Sept 28', host: 'eli', location: 'Online', attendees: ['bob', 'eli'], past: true,
    description: 'Ninety minutes of paired practice on video.' },
  { id: 'online-oct23', groupId: 'online', name: 'Online practice, Oct 23', when: 'Oct 23, 18:00', host: 'eli', location: 'Online', attendees: ['eli', 'carol'],
    description: 'Paired practice with people outside your own field.' },
];

/** My existing points and stories, as the Share dialog offers them. */
export interface Shareable {
  id: string; kind: 'point' | 'story'; title: string; tags: string[]; author: PersonId; excerpt?: string;
  /** A story's linked point (production's story card shows it with positions). */
  points?: string[];
  /** The point's position counts before the viewer's own (production's 7-point buckets). */
  counts?: Partial<Record<PositionType, number>>;
}
/** Points and stories the Share dialog searches and Home shows: mine and ones from people I share a group or event with. */
export const SHAREABLE: Shareable[] = [
  { id: 'pt-bob-1', kind: 'point', title: 'Disagreement is information, not a threat', tags: ['conflict', 'work'], author: 'bob', counts: { agree: 4, unsure: 1, disagree: 1 } },
  { id: 'st-bob-1', kind: 'story', title: 'The hike where we got lost on purpose', tags: ['trust', 'outdoors'], author: 'bob', points: ['pt-bob-1'], excerpt: 'We left the map in the car and agreed to say out loud every guess we made about the trail.' },
  { id: 'pt-dana-1', kind: 'point', title: 'Repeat back before you reply', tags: ['listening', 'work'], author: 'dana', counts: { strongly_agree: 2, agree: 3 } },
  { id: 'st-dana-1', kind: 'story', title: 'How I misread my sister for ten years', tags: ['family', 'listening'], author: 'dana', points: ['pt-dana-1'], excerpt: 'I heard "you never call" as blame. She meant "I miss you".' },
  { id: 'pt-alice-1', kind: 'point', title: 'Most arguments are about definitions, not facts', tags: ['conflict', 'definitions'], author: 'alice', counts: { agree: 2, unsure: 3, somewhat_disagree: 2 } },
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
  /* v11 COPY (conversation-groups/v11/mock-data.ts) */
  inviteAsPartner: 'Invite as partner',
  partnerPending: 'Partner invite pending',
  newMenu: '+ New',
  newChat: 'New chat',
  newPartner: 'New partner',
  sealAndSend: 'Seal & Send ✦',
  clarify: 'Clarify',
  partner: 'Partner',
  replies: (n: number) => `${n} ${n === 1 ? 'reply' : 'replies'}`,
  replyInThread: 'Reply in thread',
  message: 'Message',
  search: 'Search chats and people',
  newChatOpener: (first: string, shared: string) => `No messages yet. Say hello to ${first}. You both ${shared}.`,
  emptyList: 'No chats yet',
  emptySearch: 'No one you share a group or event with matches.',
  notSent: 'Not sent',
  retry: 'Retry',
  forwardedFrom: 'Forwarded from',
  selectChat: 'Select a chat to start messaging',
  /* v15 #10: the mirror agent */
  yourMirror: 'Your mirror',
  mirrorAsk: 'Give me a name',
  mirrorExplainer: 'Your mirror helps you check what you meant before you send it. Forward any message here with Clarify.',
  mirrorPlaceholder: 'Type a name for your mirror',
  mirrorReply: 'I’ll help you clarify this — coming soon',
  share: 'Share',
  shareTitle: 'Share a point or story',
} as const;

/** Letters (production /letters has Inbox, Drafts and Published tabs, letters-page.tsx). Mock rows only. */
export type LetterBox = 'inbox' | 'drafts' | 'sent';
export interface Letter { id: string; box: LetterBox; author: PersonId; title: string; date: string; body: string }
export const LETTERS: Letter[] = [
  { id: 'l-alice', box: 'inbox', author: 'alice', title: 'What I learned facilitating ten nights', date: 'Oct 12', body: 'The best moment of every night is when someone says “yes, exactly” and you can see they mean it. I want more of those, and fewer rounds where people wait for their turn to talk.' },
  { id: 'l-carol', box: 'inbox', author: 'carol', title: 'Design reviews without silence', date: 'Oct 5', body: 'Silence in a review is not agreement. Since we started repeating back the critique before answering it, our reviews got shorter and the work got better.' },
  { id: 'l-bob-draft', box: 'drafts', author: 'bob', title: 'Why I run the Chiang Mai circle', date: 'Oct 14', body: 'Draft. Most of the people I meet here moved for a reason they never say out loud.' },
  { id: 'l-bob-sent', box: 'sent', author: 'bob', title: 'Notes from Clarity Night, Oct 2', date: 'Oct 3', body: 'Three pairs got to “yes, exactly” in under five minutes. Two never did. Here is what the second group had in common.' },
];

/** The sidebar's places (v15 #1): Home, Chats, Letters, Tools; then "Your groups". */
export const PLACES = ['home', 'chats', 'letters', 'tools'] as const;
export type Place = (typeof PLACES)[number];
/** The phone's bottom tabs (v15 #1). */
export const MOBILE_TABS = ['home', 'chats', 'letters', 'groups', 'me'] as const;
export type MobileTab = (typeof MOBILE_TABS)[number];
export const PLACE_LABEL: Record<Place | MobileTab, string> = { home: 'Home', chats: 'Chats', letters: 'Letters', tools: 'Tools', groups: 'Groups', me: 'Profile' };
export const SIDEBAR_KEY = 'p1509-v15-sidebar-collapsed';
